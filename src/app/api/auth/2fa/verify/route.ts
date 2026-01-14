// src/app/api/auth/2fa/verify/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { verifyTotpWithEnvelope } from "@/lib/totp";
import type { Prisma } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;

  if (!userId) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const { token } = (await req.json().catch(() => ({}))) as { token?: string };

  if (!token) {
    return NextResponse.json(
      { ok: false, message: "OTP is required." },
      { status: 400 }
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      twoFactorEnabled: true,
      twoFactorSecretCiphertext: true,
      twoFactorSecretKeyCiphertext: true,
      twoFactorSecretIv: true,
      twoFactorSecretTag: true,
    },
  });

  if (!user || user.twoFactorEnabled) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const valid = verifyTotpWithEnvelope({
    token,
    envelope: {
      twoFactorSecretCiphertext: user.twoFactorSecretCiphertext!,
      twoFactorSecretKeyCiphertext: user.twoFactorSecretKeyCiphertext!,
      twoFactorSecretIv: user.twoFactorSecretIv!,
      twoFactorSecretTag: user.twoFactorSecretTag!,
    },
  });

  if (!valid) {
    return NextResponse.json(
      { ok: false, message: "Invalid code." },
      { status: 400 }
    );
  }

  // Enable 2FA
  await prisma.user.update({
    where: { id: userId },
    data: {
      twoFactorEnabled: true,
      twoFactorSetupAt: new Date(),
    },
  });

  return NextResponse.json({
    ok: true,
    enabled: true,
    twoFactorEnabled: true,
  });
}
