// src/app/api/classrooms/list/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireTenantContext, assertTenantParamMatches, toHttpError } from "@/lib/server/tenantScope";

export const dynamic = "force-dynamic";

function labelForClassroom(name: string, arm: string | null) {
  return arm ? `${name} ${arm}` : name;
}

export async function GET(req: Request) {
  try {
    const ctx = await requireTenantContext();

    const url = new URL(req.url);
    const mode = (url.searchParams.get("mode") || "").toLowerCase();
    const suppliedTenantId = url.searchParams.get("tenantId"); // backward compat only

    assertTenantParamMatches(ctx.tenantId, suppliedTenantId);

    const where: any = { tenantId: ctx.tenantId };

    // Optional filtering by mode (safe default = show all)
    if (mode === "single") where.arm = null;
    if (mode === "multi") where.arm = { in: ["A", "B", "C", "D"] };

    const items = await prisma.classroom.findMany({
      where,
      orderBy: [{ grade: "asc" }, { name: "asc" }, { arm: "asc" }],
      select: { id: true, name: true, arm: true, grade: true },
      take: 500,
    });

    return NextResponse.json({
      ok: true,
      items: items.map((c) => ({
        id: c.id,
        label: labelForClassroom(c.name, c.arm),
        name: c.name,
        arm: c.arm,
        grade: c.grade,
      })),
    });
  } catch (e) {
    const { status, msg } = toHttpError(e);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
