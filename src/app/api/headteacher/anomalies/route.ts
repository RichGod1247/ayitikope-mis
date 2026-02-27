// src/app/api/headteacher/anomalies/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  start: z.string(), // YYYY-MM-DD
  end: z.string(),   // YYYY-MM-DD
  threshold: z
    .string()
    .optional()
    .transform((v) => {
      const n = Number(v ?? "80");
      return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 80;
    }),
  // tenantId intentionally NOT accepted.
});

function jsonNoStore(payload: any, init?: Parameters<typeof NextResponse.json>[1]) {
  return NextResponse.json(payload, {
    ...init,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...(init?.headers ?? {}),
    },
  });
}

function toISODateOnly(input?: string | null): string | null {
  if (!input) return null;
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
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
 * GET /api/headteacher/anomalies?start=YYYY-MM-DD&end=YYYY-MM-DD&threshold=80
 * Tenant comes ONLY from session.
 */
export async function GET(req: NextRequest) {
  let safe: { userId: string; tenantId: string };
  try {
    safe = await requireServerUserContext({ requireTenant: true });
  } catch {
    return jsonNoStore({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    start: url.searchParams.get("start"),
    end: url.searchParams.get("end"),
    threshold: url.searchParams.get("threshold") ?? undefined,
  });

  if (!parsed.success) {
    return jsonNoStore(
      { ok: false, error: "Invalid query", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const roleOk = await requireHeadOrAdmin(safe.tenantId, safe.userId);
  if (!roleOk.ok) return jsonNoStore({ ok: false, error: roleOk.error }, { status: roleOk.status });

  const start = toISODateOnly(parsed.data.start);
  const end = toISODateOnly(parsed.data.end);
  const threshold = parsed.data.threshold;

  if (!start || !end) {
    return jsonNoStore({ ok: false, error: "start and end must be valid dates (YYYY-MM-DD)." }, { status: 400 });
  }

  if (start > end) {
    return jsonNoStore({ ok: false, error: "start must be <= end." }, { status: 400 });
  }

  // Guardrail: don’t allow crazy ranges
  const rangeDays = daysBetweenInclusive(start, end);
  if (rangeDays > 120) {
    return jsonNoStore({ ok: false, error: "Date range too large. Use 120 days or less." }, { status: 400 });
  }

  try {
    const rows = await prisma.$queryRaw<
      Array<{
        date: string;
        classroomId: string;
        classGrade: string | null;
        classArm: string | null;
        total: number;
        present: number;
        isClosed: boolean | null;
        certifiedAt: string | null;
      }>
    >`
      WITH base AS (
        SELECT
          s."date"::date::text              AS "date",
          c."id"                            AS "classroomId",
          c."grade"                         AS "classGrade",
          c."arm"                           AS "classArm",
          s."id"                            AS "sessionId",
          s."isClosed"                      AS "isClosed",
          s."certifiedAt"::text             AS "certifiedAt"
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
        JOIN "edulife_os"."Student" st ON st."classroomId" = b."classroomId"
        GROUP BY b."date", b."classroomId"
      ),
      presents AS (
        SELECT
          b."date",
          b."classroomId",
          COUNT(CASE WHEN m."status" = 'PRESENT' THEN 1 END)::int AS "present"
        FROM base b
        LEFT JOIN "edulife_os"."AttendanceMark" m ON m."sessionId" = b."sessionId"
        GROUP BY b."date", b."classroomId"
      )
      SELECT
        b."date",
        b."classroomId",
        b."classGrade",
        b."classArm",
        COALESCE(t."total", 0) AS "total",
        COALESCE(p."present", 0) AS "present",
        b."isClosed",
        b."certifiedAt"
      FROM base b
      LEFT JOIN totals t USING ("date","classroomId")
      LEFT JOIN presents p USING ("date","classroomId")
      ORDER BY b."date"::date ASC, b."classGrade" NULLS LAST, b."classArm" NULLS LAST
    `;

    const items = rows
      .map((r) => {
        const pct = r.total > 0 ? Math.round((r.present / r.total) * 100) : 0;
        const classLabel = r.classGrade ? (r.classArm ? `${r.classGrade}${r.classArm}` : r.classGrade) : (r.classArm ?? "");
        const state = r.certifiedAt ? "CERTIFIED" : (r.isClosed ? "CLOSED" : "OPEN");
        return {
          date: r.date,
          classroomId: r.classroomId,
          classLabel,
          total: r.total,
          present: r.present,
          pctPresent: pct,
          state,
        };
      })
      .filter((x) => x.pctPresent < threshold);

    return jsonNoStore({ ok: true, tenantId: safe.tenantId, start, end, threshold, items, count: items.length });
  } catch (err) {
    console.error("[HEADTEACHER_ANOMALIES_ERROR]", err);
    return jsonNoStore({ ok: false, error: "Failed to load anomalies." }, { status: 500 });
  }
}
