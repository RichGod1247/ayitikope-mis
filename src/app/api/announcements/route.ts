// src/app/api/announcements/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { getActiveTenantByCookie } from "../../../lib/tenant";
import { getCurrentUserOrThrow, requireMembershipOrThrow } from "../../../lib/authz";

export async function GET() {
  const { tenant } = await getActiveTenantByCookie();
  if (!tenant) return NextResponse.json({ ok: true, items: [] });
  const items = await prisma.announcement.findMany({
    where: { tenantId: tenant.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, title: true, body: true, createdAt: true },
  });
  return NextResponse.json({ ok: true, items });
}

export async function POST(req: Request) {
  try {
    const { tenant } = await getActiveTenantByCookie();
    if (!tenant) {
      return NextResponse.json({ ok: false, error: "No active tenant" }, { status: 400 });
    }

    const user = await getCurrentUserOrThrow();
    await requireMembershipOrThrow(user.id, tenant.id);

    const body = await req.json();
    const title = String(body?.title ?? "").trim();
    const content = String(body?.body ?? "").trim();

    if (!title || !content) {
      return NextResponse.json({ ok: false, error: "Title and body required" }, { status: 400 });
    }

    const created = await prisma.announcement.create({
      data: {
        tenantId: tenant.id,
        title,
        body: content,
        createdByUserId: user.id,
      },
      select: { id: true, title: true, body: true, createdAt: true },
    });

    return NextResponse.json({ ok: true, item: created });
  } catch (e: any) {
    const status = e?.status ?? 500;
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status });
  }
}
