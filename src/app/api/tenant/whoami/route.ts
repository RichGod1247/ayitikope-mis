// src/app/api/tenant/whoami/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../../lib/auth";
import { getActiveTenantSlug } from "../../../../lib/tenant";

export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = (session as any)?.userId as string | undefined;
  const slug = await getActiveTenantSlug(userId);
  return NextResponse.json({ ok: true, signedIn: !!userId, activeTenant: slug ?? null });
}
