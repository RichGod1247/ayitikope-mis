// src/app/api/parent/otp/verify/route.ts
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { PARENT_COOKIE_NAME, createParentSessionToken } from "@/lib/parentSession";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function getOtpSecret(): string {
  const s = process.env.OTP_SECRET || process.env.NEXTAUTH_SECRET;
  if (!s) throw new Error("OTP_SECRET_MISSING");
  return s;
}

function timingSafeEqual(a: string, b: string) {
  try {
    const ab = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ab.length !== bb.length) return false;
    return crypto.timingSafeEqual(ab, bb);
  } catch {
    return false;
  }
}

function digitsOnly(v: unknown): string {
  return String(v ?? "").replace(/\D/g, "");
}

function otpHash(code: string, tenantId: string, phoneDigits: string, expiresAt: number) {
  return crypto
    .createHmac("sha256", getOtpSecret())
    .update(`${tenantId}|${phoneDigits}|${expiresAt}|${code}`)
    .digest("base64url");
}

function parseSignedToken(token: string): { ok: boolean; payload?: any; error?: string } {
  try {
    const [base, sig] = token.split(".");
    if (!base || !sig) return { ok: false, error: "Invalid token format." };

    const expectedSig = crypto.createHmac("sha256", getOtpSecret()).update(base).digest("base64url");
    if (!timingSafeEqual(sig, expectedSig)) return { ok: false, error: "Invalid token signature." };

    const json = Buffer.from(base, "base64url").toString("utf8");
    const payload = JSON.parse(json);
    return { ok: true, payload };
  } catch (err) {
    console.error("[OTP_VERIFY_PARSE_ERROR]", err);
    return { ok: false, error: "Invalid token." };
  }
}

function noStoreJson(status: number, payload: any) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    const token = String(body.token ?? "").trim();
    const code = String(body.code ?? "").trim();

    if (!token) return noStoreJson(400, { ok: false, error: "token is required" });
    if (!code) return noStoreJson(400, { ok: false, error: "code is required" });
    if (!/^\d{6}$/.test(code)) return noStoreJson(400, { ok: false, error: "Invalid code format." });

    const parsed = parseSignedToken(token);
    if (!parsed.ok || !parsed.payload) return noStoreJson(400, { ok: false, error: parsed.error || "Invalid token." });

    const p = parsed.payload as any;

    const tenantId = String(p.tenantId ?? "").trim();
    const expiresAt = Number(p.expiresAt ?? p.exp ?? 0);
    const tokenHash = String(p.otpHash ?? "").trim();

    // Phone can be stored as digits or as +233...
    const phoneNorm = String(p.phoneNorm ?? p.guardianPhoneNorm ?? "").trim();
    const phoneDigits =
      digitsOnly(p.guardianPhone ?? "") || digitsOnly(phoneNorm);

    if (!tenantId || !expiresAt || !tokenHash || !phoneDigits) {
      return noStoreJson(400, { ok: false, error: "Malformed OTP token." });
    }

    if (Date.now() > expiresAt) {
      return noStoreJson(400, { ok: false, error: "This code has expired. Please request a new one." });
    }

    const expected = otpHash(code, tenantId, phoneDigits, expiresAt);
    if (!timingSafeEqual(expected, tokenHash)) {
      return noStoreJson(400, { ok: false, error: "Invalid code. Please check and try again." });
    }

    // Prefer E.164 if present; otherwise rebuild minimal raw.
    const guardianPhoneRaw = phoneNorm || `+${phoneDigits}`;

    const { token: parentSession } = createParentSessionToken({
      tenantId,
      guardianPhoneRaw,
    });

    const res = noStoreJson(200, { ok: true, redirectTo: "/parent-portal" });

    res.cookies.set(PARENT_COOKIE_NAME, parentSession, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60,
    });

    return res;
  } catch (e) {
    console.error("[PARENT_OTP_VERIFY_ERROR]", e);
    return noStoreJson(500, { ok: false, error: "Server error. Please try again." });
  }
}