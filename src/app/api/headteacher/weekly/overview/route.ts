// src/app/api/headteacher/weekly/overview/route.ts
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
 * GET /api/headteacher/weekly/overview?start=YYYY-MM-DD&end=YYYY-MM-DD
 * Tenant derived from session (NOT query params).
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
    const start = toISODateOnly(searchParams.get("start"));
    const end = toISODateOnly(searchParams.get("end"));
    if (!start || !end) return jsonNoStore({ ok: false, error: "start and end are required" }, 400);

    const tenantId = String(ctx.tenantId ?? ctx.activeTenantId ?? "").trim();
    const userId = String(ctx.userId ?? ctx.user?.id ?? "").trim();
    if (!tenantId || !userId) return jsonNoStore({ ok: false, error: "UNAUTHORIZED" }, 401);

    const roleOk = await requireHeadOrAdmin(tenantId, userId);
    if (!roleOk.ok) return jsonNoStore({ ok: false, error: roleOk.error }, roleOk.status);

    const rows = await prisma.$queryRaw<
      Array<{
        classroomId: string;
        grade: string | null;
        arm: string | null;
        totalStudents: number;
        sessions: number;
        openCount: number;
        closedCount: number;
        certifiedCount: number;
        presentSum: number;
      }>
    >`
      WITH base AS (
        SELECT
          s."id"                 AS "sessionId",
          s."classroomId"        AS "classroomId",
          s."isClosed"           AS "isClosed",
          s."certifiedAt"        AS "certifiedAt"
        FROM "edulife_os"."AttendanceSession" s
        WHERE s."tenantId" = ${tenantId}
          AND s."date"::date BETWEEN ${start}::date AND ${end}::date
      ),
      per_class AS (
        SELECT
          c."id" AS "classroomId",
          c."grade",
          c."arm",
          COUNT(st."id")::int AS "totalStudents"
        FROM "edulife_os"."Classroom" c
        LEFT JOIN "edulife_os"."Student" st
          ON st."classroomId" = c."id"
         AND st."tenantId" = ${tenantId}
        WHERE c."tenantId" = ${tenantId}
        GROUP BY c."id", c."grade", c."arm"
      ),
      session_counts AS (
        SELECT
          b."classroomId",
          COUNT(*)::int AS "sessions",
          COUNT(CASE WHEN b."certifiedAt" IS NOT NULL THEN 1 END)::int AS "certifiedCount",
          COUNT(CASE WHEN b."certifiedAt" IS NULL AND b."isClosed" = true THEN 1 END)::int AS "closedCount",
          COUNT(CASE WHEN b."isClosed" = false OR b."isClosed" IS NULL THEN 1 END)::int AS "openCount"
        FROM base b
        GROUP BY b."classroomId"
      ),
      present_counts AS (
        SELECT
          b."classroomId",
          COUNT(CASE WHEN m."status" = 'PRESENT' THEN 1 END)::int AS "presentSum"
        FROM base b
        LEFT JOIN "edulife_os"."AttendanceMark" m
          ON m."sessionId" = b."sessionId"
        GROUP BY b."classroomId"
      )
      SELECT
        pc."classroomId",
        pc."grade",
        pc."arm",
        COALESCE(pc."totalStudents", 0) AS "totalStudents",
        COALESCE(sc."sessions", 0) AS "sessions",
        COALESCE(sc."openCount", 0) AS "openCount",
        COALESCE(sc."closedCount", 0) AS "closedCount",
        COALESCE(sc."certifiedCount", 0) AS "certifiedCount",
        COALESCE(pr."presentSum", 0) AS "presentSum"
      FROM per_class pc
      LEFT JOIN session_counts sc ON sc."classroomId" = pc."classroomId"
      LEFT JOIN present_counts pr ON pr."classroomId" = pc."classroomId"
      ORDER BY pc."grade" NULLS LAST, pc."arm" NULLS LAST
    `;

    const items = rows.map((r) => {
      const label = r.grade ? (r.arm ? `${r.grade}${r.arm}` : r.grade) : (r.arm ?? "");
      const denom = r.totalStudents * r.sessions;
      const presentPct = denom > 0 ? Math.round((r.presentSum / denom) * 100) : 0;
      return {
        classroomId: r.classroomId,
        label,
        totalStudents: r.totalStudents,
        sessions: r.sessions,
        openCount: r.openCount,
        closedCount: r.closedCount,
        certifiedCount: r.certifiedCount,
        presentSum: r.presentSum,
        presentPct,
      };
    });

    items.sort((a, b) => (a.presentPct - b.presentPct) || a.label.localeCompare(b.label));

    const summary = {
      classes: items.length,
      sessions: items.reduce((n, x) => n + x.sessions, 0),
      open: items.reduce((n, x) => n + x.openCount, 0),
      closed: items.reduce((n, x) => n + x.closedCount, 0),
      certified: items.reduce((n, x) => n + x.certifiedCount, 0),
      avgPresentPct: items.length ? Math.round(items.reduce((n, x) => n + x.presentPct, 0) / items.length) : 0,
    };

    return jsonNoStore({ ok: true, start, end, items, summary }, 200);
  } catch (err) {
    console.error("weekly/overview error:", err);
    return jsonNoStore({ ok: false, error: "FAILED_TO_LOAD_WEEKLY_OVERVIEW" }, 500);
  }
}
