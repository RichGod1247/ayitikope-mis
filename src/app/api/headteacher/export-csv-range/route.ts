// src/app/api/headteacher/export-csv-range/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  start: z.string(), // YYYY-MM-DD
  end: z.string(),   // YYYY-MM-DD
  // tenantId intentionally NOT accepted.
});

function toISODateOnly(input?: string | null): string | null {
  if (!input) return null;
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function csvEscape(v: any): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function daysBetweenInclusive(start: string, end: string) {
  const s = new Date(`${start}T00:00:00.000Z`).getTime();
  const e = new Date(`${end}T00:00:00.000Z`).getTime();
  const diff = Math.floor((e - s) / (24 * 60 * 60 * 1000));
  return diff + 1;
}

async function requireHeadOrAdmin(tenantId: string, userId: string) {
  const m = await prisma.membership.findFirst({
    where: { tenantId, userId, status: "ACTIVE" },
    include: { role: true },
  });
  if (!m) return { ok: false as const, status: 403, error: "FORBIDDEN" };
  const roleName = String(m.role?.name ?? "").toUpperCase();
  const ok = roleName.includes("HEAD") || roleName.includes("ADMIN");
  return ok ? ({ ok: true as const } as const) : ({ ok: false as const, status: 403, error: "FORBIDDEN" } as const);
}

/**
 * GET /api/headteacher/export-csv-range?start=YYYY-MM-DD&end=YYYY-MM-DD
 * Tenant comes ONLY from session.
 */
export async function GET(req: NextRequest) {
  let safe: { userId: string; tenantId: string };
  try {
    safe = await requireServerUserContext({ requireTenant: true });
  } catch {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const roleOk = await requireHeadOrAdmin(safe.tenantId, safe.userId);
  if (!roleOk.ok) {
    return NextResponse.json(
      { ok: false, error: roleOk.error },
      { status: roleOk.status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } }
    );
  }

  const { searchParams } = new URL(req.url);
  const parsed = querySchema.safeParse({
    start: searchParams.get("start"),
    end: searchParams.get("end"),
  });

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid query", details: parsed.error.flatten() },
      { status: 400, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } }
    );
  }

  const start = toISODateOnly(parsed.data.start);
  const end = toISODateOnly(parsed.data.end);

  if (!start || !end) return new NextResponse("start and end must be YYYY-MM-DD", { status: 400 });
  if (start > end) return new NextResponse("start must be <= end", { status: 400 });

  const rangeDays = daysBetweenInclusive(start, end);
  if (rangeDays > 120) return new NextResponse("Date range too large (max 120 days).", { status: 400 });

  try {
    const rows = await prisma.$queryRaw<
      Array<{
        date: string;
        classroomId: string;
        grade: string | null;
        arm: string | null;
        total: number;
        present: number;
        isClosed: boolean | null;
        certifiedAt: string | null;
      }>
    >`
      WITH base AS (
        SELECT
          s."date"::date::text  AS "date",
          s."id"                AS "sessionId",
          s."isClosed"          AS "isClosed",
          s."certifiedAt"::text AS "certifiedAt",
          c."id"                AS "classroomId",
          c."grade"             AS "grade",
          c."arm"               AS "arm"
        FROM "edulife_os"."AttendanceSession" s
        JOIN "edulife_os"."Classroom" c
          ON c."id" = s."classroomId" AND c."tenantId" = s."tenantId"
        WHERE s."tenantId" = ${safe.tenantId}
          AND s."date"::date BETWEEN ${start}::date AND ${end}::date
      ),
      totals AS (
        SELECT
          b."date",
          b."classroomId",
          COUNT(st."id")::int AS "total"
        FROM base b
        JOIN "edulife_os"."Student" st
          ON st."classroomId" = b."classroomId"
        GROUP BY b."date", b."classroomId"
      ),
      presents AS (
        SELECT
          b."date",
          b."classroomId",
          COUNT(CASE WHEN m."status" = 'PRESENT' THEN 1 END)::int AS "present"
        FROM base b
        LEFT JOIN "edulife_os"."AttendanceMark" m
          ON m."sessionId" = b."sessionId"
        GROUP BY b."date", b."classroomId"
      )
      SELECT
        b."date",
        b."classroomId",
        b."grade",
        b."arm",
        COALESCE(t."total", 0) AS "total",
        COALESCE(p."present", 0) AS "present",
        b."isClosed",
        b."certifiedAt"
      FROM base b
      LEFT JOIN totals t USING ("date","classroomId")
      LEFT JOIN presents p USING ("date","classroomId")
      ORDER BY b."date"::date ASC, b."grade" NULLS LAST, b."arm" NULLS LAST
    `;

    const header = ["Date", "Class", "Present", "Total", "%Present", "State"];
    const lines = [header.map(csvEscape).join(",")];

    for (const r of rows) {
      const label = r.grade ? (r.arm ? `${r.grade}${r.arm}` : r.grade) : (r.arm ?? "");
      const pct = r.total > 0 ? Math.round((r.present / r.total) * 100) : 0;
      const state = r.certifiedAt ? "CERTIFIED" : (r.isClosed ? "CLOSED" : "OPEN");
      const row = [r.date, label, String(r.present), String(r.total), String(pct), state];
      lines.push(row.map(csvEscape).join(","));
    }

    const csv = lines.join("\n");
    const filename = `attendance_${start}_to_${end}.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (err) {
    console.error("[HEADTEACHER_EXPORT_CSV_RANGE_ERROR]", err);
    return new NextResponse("Failed to export CSV", { status: 500 });
  }
}
