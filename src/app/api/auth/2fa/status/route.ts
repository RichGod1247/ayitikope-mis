// src/app/api/auth/2fa/status/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;

  if (!userId) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      twoFactorEnabled: true,
      twoFactorSetupAt: true,
    },
  });

  if (!user) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    twoFactorEnabled: user.twoFactorEnabled,
    enabled: user.twoFactorEnabled,
    twoFactorSetupAt: user.twoFactorSetupAt,
  });
}
