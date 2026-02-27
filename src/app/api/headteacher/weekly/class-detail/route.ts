// src/app/api/headteacher/weekly/class-detail/route.ts
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
 * GET /api/headteacher/weekly/class-detail?classroomId=...&start=YYYY-MM-DD&end=YYYY-MM-DD
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
      return jsonNoStore({ ok: false, error: "classroomId, start, and end are required" }, 400);
    }

    const tenantId = String(ctx.tenantId ?? ctx.activeTenantId ?? "").trim();
    const userId = String(ctx.userId ?? ctx.user?.id ?? "").trim();
    if (!tenantId || !userId) return jsonNoStore({ ok: false, error: "UNAUTHORIZED" }, 401);

    const roleOk = await requireHeadOrAdmin(tenantId, userId);
    if (!roleOk.ok) return jsonNoStore({ ok: false, error: roleOk.error }, roleOk.status);

    const rows = await prisma.$queryRaw<
      Array<{
        date: string;
        total: number;
        present: number;
        isClosed: boolean | null;
        certifiedAt: string | null;
        classLabel: string;
      }>
    >`
      WITH base AS (
        SELECT
          s."id"                AS "sessionId",
          s."date"::date::text  AS "date",
          s."isClosed"          AS "isClosed",
          s."certifiedAt"::text AS "certifiedAt"
        FROM "edulife_os"."AttendanceSession" s
        WHERE s."tenantId" = ${tenantId}
          AND s."classroomId" = ${classroomId}
          AND s."date"::date BETWEEN ${start}::date AND ${end}::date
      ),
      totals AS (
        SELECT COUNT(st."id")::int AS "total"
        FROM "edulife_os"."Student" st
        WHERE st."tenantId" = ${tenantId}
          AND st."classroomId" = ${classroomId}
      ),
      presents AS (
        SELECT
          b."date",
          COUNT(CASE WHEN m."status" = 'PRESENT' THEN 1 END)::int AS "present"
        FROM base b
        LEFT JOIN "edulife_os"."AttendanceMark" m
          ON m."sessionId" = b."sessionId"
        GROUP BY b."date"
      ),
      label AS (
        SELECT
          CASE
            WHEN c."grade" IS NOT NULL AND c."arm" IS NOT NULL THEN (c."grade" || c."arm")
            WHEN c."grade" IS NOT NULL THEN c."grade"
            ELSE COALESCE(c."arm",'')
          END AS "classLabel"
        FROM "edulife_os"."Classroom" c
        WHERE c."id" = ${classroomId}
          AND c."tenantId" = ${tenantId}
        LIMIT 1
      )
      SELECT
        b."date",
        (SELECT "total" FROM totals)        AS "total",
        COALESCE(p."present", 0)            AS "present",
        b."isClosed",
        b."certifiedAt",
        (SELECT "classLabel" FROM label)    AS "classLabel"
      FROM base b
      LEFT JOIN presents p USING ("date")
      ORDER BY b."date"::date ASC
    `;

    const items = rows.map((r) => {
      const pct = r.total > 0 ? Math.round((r.present / r.total) * 100) : 0;
      const state = r.certifiedAt ? "CERTIFIED" : r.isClosed ? "CLOSED" : "OPEN";
      return { date: r.date, total: r.total, present: r.present, pctPresent: pct, state };
    });

    const meta = {
      classroomId,
      classLabel: rows[0]?.classLabel || "",
      start,
      end,
      days: items.length,
      avgPctPresent: items.length ? Math.round(items.reduce((n, x) => n + x.pctPresent, 0) / items.length) : 0,
      certified: items.filter((x) => x.state === "CERTIFIED").length,
      closed: items.filter((x) => x.state === "CLOSED").length,
      open: items.filter((x) => x.state === "OPEN").length,
    };

    return jsonNoStore({ ok: true, meta, items }, 200);
  } catch (err) {
    console.error("weekly/class-detail error:", err);
    return jsonNoStore({ ok: false, error: "FAILED_TO_LOAD_CLASS_DETAIL" }, 500);
  }
}
