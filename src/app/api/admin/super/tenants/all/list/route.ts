// src/app/api/admin/super/tenants/all/list/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

export async function GET(req: NextRequest) {
  const auth = await requireApiUserContext(req, { requireTenant: false, requireRoleNames: ["SUPERADMIN"] });
  if (!auth.ok) return auth.res;

  const status = String(req.nextUrl.searchParams.get("status") || "ALL").toUpperCase();
  const q = String(req.nextUrl.searchParams.get("q") || "").trim();

  const where: any = {};
  if (status === "ACTIVE" || status === "PENDING") where.status = status;

  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { schoolCode: { contains: q, mode: "insensitive" } },
      { slug: { contains: q, mode: "insensitive" } },
    ];
  }

  const rows = await prisma.tenant.findMany({
    where,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      schoolCode: true,
      slug: true,
      status: true,
      createdAt: true,
      contactEmail: true,
      contactPhoneNorm: true,
    },
    take: 500,
  });

  return json({
    ok: true,
    items: rows.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      contactEmail: r.contactEmail ?? null,
      contactPhoneNorm: r.contactPhoneNorm ?? null,
    })),
  });
}