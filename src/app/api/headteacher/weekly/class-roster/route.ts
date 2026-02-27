// src/app/api/headteacher/weekly/class-roster/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonNoStore(body: any, status = 200) {
  return new NextResponse(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function isNextRedirectError(err: any) {
  return typeof err?.digest === "string" && err.digest.startsWith("NEXT_REDIRECT");
}

function toISODateOnly(input?: string | null): string | null {
  if (!input) return null;
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function normRole(name: any) {
  return String(name ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_")
    .replace(/-+/g, "_");
}

function looksLikeHeadOrAdmin(roleName: string) {
  if (!roleName) return false;
  if (roleName.includes("ADMIN")) return true;
  if (roleName.includes("HEAD")) return true;
  if (roleName === "HT") return true;
  if (roleName === "HEADTEACHER") return true;
  if (roleName === "SCHOOL_ADMIN") return true;
  return false;
}

async function requireHeadOrAdmin(tenantId: string, userId: string) {
  const m = await prisma.membership.findFirst({
    where: { tenantId, userId, status: "ACTIVE" },
    select: { role: { select: { name: true } } },
  });
  if (!m) return { ok: false as const, status: 403, error: "FORBIDDEN" };
  const roleName = normRole(m.role?.name);
  return looksLikeHeadOrAdmin(roleName)
    ? ({ ok: true as const } as const)
    : ({ ok: false as const, status: 403, error: "FORBIDDEN" } as const);
}

/**
 * GET /api/headteacher/weekly/class-roster?classroomId=...&start=YYYY-MM-DD&end=YYYY-MM-DD
 * Tenant from session.
 * Head/Admin only.
 */
export async function GET(req: NextRequest) {
  // ✅ keep this line style (you requested)
  let ctx: any;
  try {
    const r: any = await requireServerUserContext({ requireTenant: true } as any);
    ctx = r?.ctx ?? r;
  } catch (err: any) {
    if (isNextRedirectError(err)) return jsonNoStore({ ok: false, error: "UNAUTHORIZED" }, 401);
    return jsonNoStore({ ok: false, error: "UNAUTHORIZED" }, 401);
  }

  try {
    const { searchParams } = new URL(req.url);
    const classroomId = String(searchParams.get("classroomId") || "").trim();
    const start = toISODateOnly(searchParams.get("start"));
    const end = toISODateOnly(searchParams.get("end"));

    if (!classroomId || !start || !end) {
      return jsonNoStore({ ok: false, error: "classroomId, start, end are required" }, 400);
    }

    const tenantId = String(ctx.tenantId ?? ctx.activeTenantId ?? "").trim();
    const userId = String(ctx.userId ?? ctx.user?.id ?? "").trim();
    if (!tenantId || !userId) return jsonNoStore({ ok: false, error: "UNAUTHORIZED" }, 401);

    const roleOk = await requireHeadOrAdmin(tenantId, userId);
    if (!roleOk.ok) return jsonNoStore({ ok: false, error: roleOk.error }, roleOk.status);

    const rows = await prisma.$queryRaw<
      Array<{
        studentId: string;
        firstName: string;
        lastName: string;
        guardianName: string | null;
        guardianPhone: string | null;
        sessions: number;
        present: number;
        absent: number;
        late: number;
        excused: number;
        noMark: number;
      }>
    >`
      WITH class_sessions AS (
        SELECT s."id" AS "sessionId"
        FROM "edulife_os"."AttendanceSession" s
        WHERE s."tenantId" = ${tenantId}
          AND s."classroomId" = ${classroomId}
          AND s."date"::date BETWEEN ${start}::date AND ${end}::date
      ),
      roster AS (
        SELECT
          st."id" AS "studentId",
          st."firstName",
          st."lastName",
          st."guardianName",
          st."guardianPhone"
        FROM "edulife_os"."Student" st
        WHERE st."tenantId" = ${tenantId}
          AND st."classroomId" = ${classroomId}
      ),
      marks AS (
        SELECT
          cs."sessionId",
          r."studentId",
          m."status"
        FROM class_sessions cs
        CROSS JOIN roster r
        LEFT JOIN "edulife_os"."AttendanceMark" m
          ON m."sessionId" = cs."sessionId"
         AND m."studentId" = r."studentId"
      )
      SELECT
        r."studentId",
        r."firstName",
        r."lastName",
        r."guardianName",
        r."guardianPhone",
        COUNT(m."sessionId")::int AS "sessions",
        COUNT(CASE WHEN m."sessionId" IS NOT NULL AND m."status" = 'PRESENT' THEN 1 END)::int AS "present",
        COUNT(CASE WHEN m."sessionId" IS NOT NULL AND m."status" = 'ABSENT' THEN 1 END)::int AS "absent",
        COUNT(CASE WHEN m."sessionId" IS NOT NULL AND m."status" = 'LATE' THEN 1 END)::int AS "late",
        COUNT(CASE WHEN m."sessionId" IS NOT NULL AND m."status" = 'EXCUSED' THEN 1 END)::int AS "excused",
        COUNT(CASE WHEN m."sessionId" IS NOT NULL AND m."status" IS NULL THEN 1 END)::int AS "noMark"
      FROM roster r
      LEFT JOIN marks m USING ("studentId")
      GROUP BY r."studentId", r."firstName", r."lastName", r."guardianName", r."guardianPhone"
      ORDER BY r."lastName", r."firstName"
    `;

    const items = rows.map((r) => {
      const fullName = [r.firstName, r.lastName].filter(Boolean).join(" ");
      const pctPresent = r.sessions > 0 ? Math.round((r.present / r.sessions) * 100) : 0;
      return {
        studentId: r.studentId,
        fullName,
        guardianName: r.guardianName ?? "",
        guardianPhone: r.guardianPhone ?? "",
        sessions: r.sessions,
        present: r.present,
        absent: r.absent,
        late: r.late,
        excused: r.excused,
        noMark: r.noMark,
        pctPresent,
      };
    });

    return jsonNoStore({ ok: true, classroomId, start, end, items }, 200);
  } catch (err) {
    console.error("weekly/class-roster error:", err);
    return jsonNoStore({ ok: false, error: "FAILED_TO_LOAD_CLASS_ROSTER" }, 500);
  }
}
