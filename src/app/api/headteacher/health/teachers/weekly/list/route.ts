// src/app/api/headteacher/health/teachers/weekly/list/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";
import { assertNoTenantOverride } from "@/lib/tenantGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toISODateOnly(input?: string | null): string | null {
  if (!input) return null;
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

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
  const ok = roleName.includes("HEAD") || roleName.includes("ADMIN");
  return ok ? ({ ok: true as const } as const) : ({ ok: false as const, status: 403, error: "FORBIDDEN" } as const);
}

/**
 * GET /api/headteacher/health/teachers/weekly/list?start=YYYY-MM-DD&end=YYYY-MM-DD
 * (Optional legacy) tenantId must match session tenant
 */
export async function GET(req: NextRequest) {
  let ctx: { tenantId: string; userId: string };
  try {
    const c = await requireServerUserContext({ requireTenant: true });
    ctx = { tenantId: c.tenantId, userId: c.userId };
  } catch {
    return jsonNoStore({ ok: false, error: "UNAUTHORIZED" }, 401);
  }

  const roleOk = await requireHeadOrAdmin(ctx.tenantId, ctx.userId);
  if (!roleOk.ok) return jsonNoStore({ ok: false, error: roleOk.error }, roleOk.status);

  const { searchParams } = new URL(req.url);

  const guard = assertNoTenantOverride(searchParams.get("tenantId"), ctx.tenantId);
  if (!guard.ok) return jsonNoStore({ ok: false, error: guard.error }, guard.status);

  const start = toISODateOnly(searchParams.get("start"));
  const end = toISODateOnly(searchParams.get("end"));
  if (!start || !end) return jsonNoStore({ ok: false, error: "start and end are required (YYYY-MM-DD)" }, 400);
  if (start > end) return jsonNoStore({ ok: false, error: "start must be <= end" }, 400);

  try {
    const rows = await prisma.teacherHealthWeekly.findMany({
      where: {
        tenantId: ctx.tenantId,
        weekStart: {
          gte: new Date(`${start}T00:00:00.000Z`),
          lte: new Date(`${end}T23:59:59.999Z`),
        },
      },
      orderBy: [{ weekStart: "desc" }, { userId: "asc" }],
      select: {
        id: true,
        weekStart: true,
        stressLevel: true,
        workload: true,
        comments: true,
        user: { select: { id: true, name: true, email: true } },
      },
      take: 5000,
    });

    return jsonNoStore({ ok: true, tenantId: ctx.tenantId, start, end, items: rows }, 200);
  } catch (err: any) {
    console.error("[HEADTEACHER_TEACHERS_WEEKLY_LIST_ERROR]", err);
    return jsonNoStore({ ok: false, error: "Failed to load teacher weekly health" }, 500);
  }
}
