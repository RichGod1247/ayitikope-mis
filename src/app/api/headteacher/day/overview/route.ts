// src/app/api/headteacher/day/overview/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  date: z.string().optional(),
});

function jsonNoStore(payload: any, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
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

export async function GET(req: NextRequest) {
  let safe: { userId: string; tenantId: string };
  try {
    const r: any = await requireServerUserContext({ requireTenant: true } as any);
    const ctx = r?.ctx ?? r;
    safe = { userId: String(ctx.userId ?? ctx.user?.id ?? ""), tenantId: String(ctx.tenantId ?? ctx.activeTenantId ?? "") };
  } catch (err: any) {
    if (isNextRedirectError(err)) return jsonNoStore({ ok: false, error: "UNAUTHORIZED" }, 401);
    return jsonNoStore({ ok: false, error: "UNAUTHORIZED" }, 401);
  }

  if (!safe.userId || !safe.tenantId) return jsonNoStore({ ok: false, error: "UNAUTHORIZED" }, 401);

  const roleOk = await requireHeadOrAdmin(safe.tenantId, safe.userId);
  if (!roleOk.ok) return jsonNoStore({ ok: false, error: roleOk.error }, roleOk.status);

  const { searchParams } = new URL(req.url);
  const parsed = querySchema.safeParse({ date: searchParams.get("date") ?? undefined });
  if (!parsed.success) return jsonNoStore({ ok: false, error: "INVALID_QUERY", details: parsed.error.flatten() }, 400);

  const date = toISODateOnly(parsed.data.date ?? null) ?? new Date().toISOString().slice(0, 10);

  try {
    const rows = await prisma.$queryRaw<
      Array<{
        classroomId: string;
        classGrade: string | null;
        classArm: string | null;
        sessionId: string | null;
        isClosed: boolean | null;
        closedAt: Date | null;
        certifiedAt: Date | null;
      }>
    >`
      SELECT
        c."id"          AS "classroomId",
        c."grade"       AS "classGrade",
        c."arm"         AS "classArm",
        s."id"          AS "sessionId",
        s."isClosed"    AS "isClosed",
        s."closedAt"    AS "closedAt",
        s."certifiedAt" AS "certifiedAt"
      FROM "edulife_os"."Classroom" c
      LEFT JOIN "edulife_os"."AttendanceSession" s
        ON s."classroomId" = c."id"
       AND s."tenantId" = c."tenantId"
       AND s."date"::date = ${date}::date
      WHERE c."tenantId" = ${safe.tenantId}
      ORDER BY c."grade" NULLS LAST, c."arm" NULLS LAST
    `;

    const items = rows.map((r) => {
      const label = r.classGrade ? (r.classArm ? `${r.classGrade}${r.classArm}` : r.classGrade) : (r.classArm ?? "");
      let status: "NO_SESSION" | "OPEN" | "CLOSED" | "CERTIFIED" = "NO_SESSION";
      if (r.sessionId) status = r.certifiedAt ? "CERTIFIED" : r.isClosed ? "CLOSED" : "OPEN";
      return { classroomId: r.classroomId, label, sessionId: r.sessionId, status, closedAt: r.closedAt, certifiedAt: r.certifiedAt };
    });

    const summary = items.reduce(
      (acc, it) => {
        acc.total += 1;
        acc[it.status] += 1;
        return acc;
      },
      { total: 0, NO_SESSION: 0, OPEN: 0, CLOSED: 0, CERTIFIED: 0 }
    );

    return jsonNoStore({ ok: true, tenantId: safe.tenantId, date, items, summary }, 200);
  } catch (err) {
    console.error("[HEADTEACHER_DAY_OVERVIEW_ERROR]", err);
    return jsonNoStore({ ok: false, error: "FAILED_TO_LOAD_DAY_OVERVIEW" }, 500);
  }
}
