// src/app/api/headteacher/health/teachers/weekly/csv/route.ts
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

function csvEscape(s: string | number | null | undefined): string {
  if (s === null || s === undefined) return "";
  const raw = String(s);
  if (/[",\n]/.test(raw)) return `"${raw.replace(/"/g, '""')}"`;
  return raw;
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
 * GET /api/headteacher/health/teachers/weekly/csv?start=YYYY-MM-DD&end=YYYY-MM-DD
 * (Optional legacy) tenantId must match session tenant
 */
export async function GET(req: NextRequest) {
  let ctx: { tenantId: string; userId: string };
  try {
    const c = await requireServerUserContext({ requireTenant: true });
    ctx = { tenantId: c.tenantId, userId: c.userId };
  } catch {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const roleOk = await requireHeadOrAdmin(ctx.tenantId, ctx.userId);
  if (!roleOk.ok) return new NextResponse("Forbidden", { status: roleOk.status });

  const { searchParams } = new URL(req.url);

  const guard = assertNoTenantOverride(searchParams.get("tenantId"), ctx.tenantId);
  if (!guard.ok) return new NextResponse("Forbidden", { status: guard.status });

  const start = toISODateOnly(searchParams.get("start"));
  const end = toISODateOnly(searchParams.get("end"));
  if (!start || !end) return new NextResponse("start and end are required (YYYY-MM-DD)", { status: 400 });
  if (start > end) return new NextResponse("start must be <= end", { status: 400 });

  try {
    const rows = await prisma.teacherHealthWeekly.findMany({
      where: {
        tenantId: ctx.tenantId,
        weekStart: {
          gte: new Date(`${start}T00:00:00.000Z`),
          lte: new Date(`${end}T23:59:59.999Z`),
        },
      },
      orderBy: [{ weekStart: "asc" }, { userId: "asc" }],
      select: {
        weekStart: true,
        stressLevel: true,
        workload: true,
        comments: true,
        user: { select: { name: true, email: true } },
      },
      take: 20000,
    });

    const header = ["weekStart(UTC)", "teacherName", "teacherEmail", "stressLevel(1-5)", "workload(1-5)", "comments"];
    const lines = [header.join(",")];

    for (const r of rows) {
      lines.push(
        [
          csvEscape(r.weekStart.toISOString().slice(0, 10)),
          csvEscape(r.user?.name ?? ""),
          csvEscape(r.user?.email ?? ""),
          csvEscape(r.stressLevel),
          csvEscape(r.workload),
          csvEscape(r.comments ?? ""),
        ].join(",")
      );
    }

    const csv = lines.join("\n");
    const filename = `teachers_weekly_health_${ctx.tenantId}_${start}_to_${end}.csv`;

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
    console.error("[HEADTEACHER_TEACHERS_WEEKLY_CSV_ERROR]", err);
    return new NextResponse("Failed to generate CSV", { status: 500 });
  }
}
