// src/app/api/parent/otp/request/route.ts
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes

function generateOtp(): string {
  // 6-digit numeric code
  return String(Math.floor(100000 + Math.random() * 900000));
}

function getOtpSecret(): string {
  return (
    process.env.OTP_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    "dev-edulife-os-otp-secret"
  );
}

// Create a signed token carrying guardianPhone + otp + expiry
function createSignedToken(payload: Record<string, any>): string {
  const secret = getOtpSecret();
  const base = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(base).digest("base64url");
  return `${base}.${sig}`;
}

export async function POST(req: NextRequest) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const guardianPhone = (body.guardianPhone ?? "").toString().trim();
  const tenantSlug = (body.tenantSlug ?? "").toString().trim();

  if (!guardianPhone) {
    return NextResponse.json(
      { ok: false, error: "guardianPhone is required" },
      { status: 400 }
    );
  }

  // Generate OTP + token
  const otp = generateOtp();
  const expiresAt = Date.now() + OTP_TTL_MS;

  const tokenPayload = {
    guardianPhone,
    tenantSlug,
    otp,
    expiresAt,
  };

  const token = createSignedToken(tokenPayload);

  // DEV-FRIENDLY: print OTP to terminal for local testing
  console.log(
    `[DEV-OTP] Parent portal OTP -> phone=${guardianPhone}, tenantSlug=${tenantSlug ||
      "default"}, code=${otp}, expiresAt=${new Date(expiresAt).toISOString()}`
  );

  // TODO: When ready, plug Hubtel SMS here:
  // await sendSmsViaHubtel({ to: guardianPhone, message: `Your EduLife OS OTP is ${otp}` })

  return NextResponse.json({
    ok: true,
    token,
    // NOTE: we DO NOT send the OTP back to the browser so it behaves like real SMS flow.
    // For dev you will always see the OTP in the terminal logs above.
  });
}
