// src/app/api/headteacher/health/summary/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonNoStore(payload: any, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

async function requireHeadOrAdmin(tenantId: string, userId: string) {
  const m = await prisma.membership.findFirst({
    where: { tenantId, userId, status: "ACTIVE" },
    include: { role: true },
  });
  if (!m) return { ok: false as const, status: 403, error: "FORBIDDEN" };
  const roleName = String(m.role?.name ?? "").toUpperCase();
  const ok = roleName.includes("HEAD") || roleName.includes("ADMIN") || roleName.includes("OWNER") || roleName.includes("SUPER");
  return ok ? ({ ok: true as const } as const) : ({ ok: false as const, status: 403, error: "FORBIDDEN" } as const);
}

/**
 * GET /api/headteacher/health/summary
 * Tenant comes ONLY from session.
 */
export async function GET() {
  let ctx: { tenantId: string; userId: string };
  try {
    const c = await requireServerUserContext({ requireTenant: true });
    ctx = { tenantId: c.tenantId, userId: c.userId };
  } catch {
    return jsonNoStore({ ok: false, error: "UNAUTHORIZED" }, 401);
  }

  const roleOk = await requireHeadOrAdmin(ctx.tenantId, ctx.userId);
  if (!roleOk.ok) return jsonNoStore({ ok: false, error: roleOk.error }, roleOk.status);

  try {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const twentyEightDaysAgo = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);

    const [studentDailyCount, teacherWeeklyCount] = await Promise.all([
      prisma.studentHealthDaily.count({
        where: { tenantId: ctx.tenantId, createdAt: { gte: sevenDaysAgo } },
      }),
      prisma.teacherHealthWeekly.count({
        where: { tenantId: ctx.tenantId, createdAt: { gte: twentyEightDaysAgo } },
      }),
    ]);

    return jsonNoStore({
      ok: true,
      tenantId: ctx.tenantId,
      windows: {
        studentDailySince: sevenDaysAgo.toISOString(),
        teacherWeeklySince: twentyEightDaysAgo.toISOString(),
      },
      studentDaily: { entriesLast7Days: studentDailyCount },
      teacherWeekly: { entriesLast28Days: teacherWeeklyCount },
    });
  } catch (err: any) {
    console.error("[HEADTEACHER_HEALTH_SUMMARY_ERROR]", err);
    return jsonNoStore(
      { ok: false, error: err?.message || "Unexpected error while summarising health & wellbeing." },
      500
    );
  }
}
