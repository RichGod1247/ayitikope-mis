// src/app/api/parent/otp/verify/route.ts
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

function getOtpSecret(): string {
  return (
    process.env.OTP_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    "dev-edulife-os-otp-secret"
  );
}

function parseSignedToken(token: string): { ok: boolean; payload?: any; error?: string } {
  try {
    const [base, sig] = token.split(".");
    if (!base || !sig) {
      return { ok: false, error: "Invalid token format." };
    }

    const secret = getOtpSecret();
    const expectedSig = crypto
      .createHmac("sha256", secret)
      .update(base)
      .digest("base64url");

    if (sig !== expectedSig) {
      return { ok: false, error: "Invalid token signature." };
    }

    const json = Buffer.from(base, "base64url").toString("utf8");
    const payload = JSON.parse(json);
    return { ok: true, payload };
  } catch (err) {
    console.error("[OTP Verify] Failed to parse token:", err);
    return { ok: false, error: "Invalid token." };
  }
}

export async function POST(req: NextRequest) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const token = (body.token ?? "").toString().trim();
  const code = (body.code ?? "").toString().trim();

  if (!token) {
    return NextResponse.json(
      { ok: false, error: "token is required" },
      { status: 400 }
    );
  }

  if (!code) {
    return NextResponse.json(
      { ok: false, error: "code is required" },
      { status: 400 }
    );
  }

  const parsed = parseSignedToken(token);
  if (!parsed.ok || !parsed.payload) {
    return NextResponse.json(
      { ok: false, error: parsed.error || "Invalid token." },
      { status: 400 }
    );
  }

  const { guardianPhone, otp, expiresAt } = parsed.payload as {
    guardianPhone: string;
    otp: string;
    expiresAt: number;
  };

  if (!guardianPhone || !otp || !expiresAt) {
    return NextResponse.json(
      { ok: false, error: "Malformed OTP token." },
      { status: 400 }
    );
  }

  if (Date.now() > expiresAt) {
    return NextResponse.json(
      { ok: false, error: "This code has expired. Please request a new one." },
      { status: 400 }
    );
  }

  if (code !== otp) {
    return NextResponse.json(
      { ok: false, error: "Invalid code. Please check and try again." },
      { status: 400 }
    );
  }

  // ✅ All good – OTP verified
  return NextResponse.json({
    ok: true,
    guardianPhone,
  });
}
