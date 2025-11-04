// src/app/api/tenant/switch/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../../lib/auth";
import { prisma } from "../../../../lib/prisma";
import { setActiveTenantCookie } from "../../../../lib/tenant";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = (session as any)?.userId as string | undefined;
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const slug = body?.slug?.toString();
  if (!slug) {
    return NextResponse.json({ ok: false, error: "missing slug" }, { status: 400 });
  }

  // Verify membership for the target tenant
  const membership = await prisma.membership.findFirst({
    where: { userId, tenant: { slug }, status: "ACTIVE" },
    select: { id: true },
  });

  if (!membership) {
    return NextResponse.json({ ok: false, error: "no membership for target tenant" }, { status: 403 });
  }

  await setActiveTenantCookie(slug);
  return NextResponse.json({ ok: true, slug });
}
