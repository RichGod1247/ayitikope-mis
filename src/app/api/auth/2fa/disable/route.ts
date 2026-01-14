// src/app/api/auth/2fa/disable/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;

  if (!userId) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      twoFactorEnabled: false,
      twoFactorSetupAt: null,
      twoFactorSecretCiphertext: null,
      twoFactorSecretKeyCiphertext: null,
      twoFactorSecretIv: null,
      twoFactorSecretTag: null,
    },
  });

  return NextResponse.json({
    ok: true,
    enabled: false,
    twoFactorEnabled: false,
  });
}
