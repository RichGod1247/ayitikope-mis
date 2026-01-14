// src/app/api/tenant/whoami/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserOrThrow } from "@/lib/authz";

export async function GET() {
  try {
    const user = await getCurrentUserOrThrow();

    const tenantId = user.tenantId ?? null;
    const tenant = tenantId
      ? await prisma.tenant.findUnique({
          where: { id: tenantId },
          select: { id: true, name: true, slug: true },
        })
      : null;

    return NextResponse.json({
      ok: true,
      signedIn: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        roleName: user.roleName,
      },
      activeTenant: tenant ? { id: tenant.id, name: tenant.name, slug: tenant.slug } : null,
    });
  } catch {
    return NextResponse.json({ ok: true, signedIn: false, activeTenant: null });
  }
}
