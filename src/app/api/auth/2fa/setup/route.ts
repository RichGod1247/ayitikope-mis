// src/app/api/auth/2fa/setup/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import QRCode from "qrcode";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  generateTotpSecret,
  buildOtpAuthUrl,
  encryptTotpSecret,
} from "@/lib/totp";
import type { Prisma } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;

  if (!userId) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      staffId: true,
      twoFactorEnabled: true,
    },
  });

  if (!user) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }

  if (user.twoFactorEnabled) {
    return NextResponse.json({
      ok: true,
      twoFactorEnabled: true,
      enabled: true,
      message: "2FA already enabled.",
    });
  }

  // 1) Generate secret
  const secret = generateTotpSecret();

  // 2) Build otpauth URL
  const label = user.email || user.staffId || "EduLife User";
  const otpauthUrl = buildOtpAuthUrl({
    accountName: label,
    secret,
  });

  // 3) Encrypt secret (envelope)
  const envelope = encryptTotpSecret(secret);

  // 4) Store encrypted secret (NOT enabled yet)
  await prisma.user.update({
    where: { id: userId },
    data: {
      twoFactorSecretCiphertext: envelope.twoFactorSecretCiphertext,
      twoFactorSecretKeyCiphertext: envelope.twoFactorSecretKeyCiphertext,
      twoFactorSecretIv: envelope.twoFactorSecretIv,
      twoFactorSecretTag: envelope.twoFactorSecretTag,
      twoFactorEnabled: false,
      twoFactorSetupAt: null,
    },
  });

  // 5) Generate QR code
  const qrDataUrl = await QRCode.toDataURL(otpauthUrl);

  return NextResponse.json({
    ok: true,
    qrDataUrl,
    otpauthUrl,
    enabled: false,
    twoFactorEnabled: false,
  });
}
