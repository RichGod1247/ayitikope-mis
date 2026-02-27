// src/lib/parentSession.ts
import crypto from "crypto";
import { NextResponse } from "next/server";

export const PARENT_COOKIE_NAME =
  process.env.NODE_ENV === "production" ? "__Host-edulife_parent" : "edulife_parent";

const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days (MVP). Change via env later if desired.

export type ParentSessionPayload = {
  v: 1;
  tenantId: string;
  guardianPhoneE164: string | null; // +233...
  guardianSuffix9: string; // last 9 digits (fallback matching)
  iat: number; // epoch seconds
  exp: number; // epoch seconds
  jti: string;
};

function noStoreJson(status: number, payload: any) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function getSecret(): string {
  // Bank-grade: do NOT invent new secrets. Reuse NEXTAUTH_SECRET if you didn’t set a parent secret yet.
  const s = process.env.PARENT_SESSION_SECRET || process.env.OTP_SECRET || process.env.NEXTAUTH_SECRET;
  if (!s) throw new Error("PARENT_SESSION_SECRET_MISSING");
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

function sign(base: string) {
  return crypto.createHmac("sha256", getSecret()).update(base).digest("base64url");
}

function b64urlEncode(buf: Buffer) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function b64urlDecodeToBuffer(s: string) {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(b64, "base64");
}

export function digitsOnly(v: unknown): string {
  return String(v ?? "").replace(/\D/g, "");
}

export function suffix9Digits(phone: string) {
  const d = digitsOnly(phone);
  return d.length >= 9 ? d.slice(-9) : d;
}

// Ghana phone -> E.164 (+233XXXXXXXXX) | null if invalid
export function normalizeGhPhoneE164(raw: string): string | null {
  const s0 = String(raw ?? "").trim();
  if (!s0) return null;

  let s = s0.replace(/[^\d+]/g, "");
  if (s.startsWith("00")) s = "+" + s.slice(2);

  if (s.startsWith("+233")) {
    const digits = s.replace(/[^\d]/g, "");
    return digits.length === 12 ? `+${digits}` : null;
  }
  if (s.startsWith("233")) {
    const digits = s.replace(/[^\d]/g, "");
    return digits.length === 12 ? `+${digits}` : null;
  }

  const d = s.replace(/[^\d]/g, "");
  if (d.length === 10 && d.startsWith("0")) return `+233${d.slice(1)}`;

  return null;
}

export function createParentSessionToken(input: {
  tenantId: string;
  guardianPhoneRaw: string;
}): { token: string; payload: ParentSessionPayload } {
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + SESSION_TTL_SECONDS;

  const e164 = normalizeGhPhoneE164(input.guardianPhoneRaw);
  const s9 = suffix9Digits(input.guardianPhoneRaw);

  const payload: ParentSessionPayload = {
    v: 1,
    tenantId: input.tenantId,
    guardianPhoneE164: e164,
    guardianSuffix9: s9,
    iat,
    exp,
    jti: crypto.randomBytes(16).toString("hex"),
  };

  const base = b64urlEncode(Buffer.from(JSON.stringify(payload), "utf8"));
  const sig = sign(base);
  return { token: `${base}.${sig}`, payload };
}

export function verifyParentSessionToken(
  token: string
): { ok: true; payload: ParentSessionPayload } | { ok: false; error?: string } {
  const t = String(token ?? "").trim();
  if (!t) return { ok: false, error: "NO_TOKEN" };

  const [base, sig] = t.split(".");
  if (!base || !sig) return { ok: false, error: "BAD_FORMAT" };

  const expected = sign(base);
  if (!timingSafeEqual(sig, expected)) return { ok: false, error: "BAD_SIGNATURE" };

  let payload: ParentSessionPayload;
  try {
    payload = JSON.parse(b64urlDecodeToBuffer(base).toString("utf8"));
  } catch {
    return { ok: false, error: "BAD_PAYLOAD" };
  }

  if (!payload || payload.v !== 1) return { ok: false, error: "BAD_VERSION" };
  if (!payload.tenantId || !payload.guardianSuffix9) return { ok: false, error: "MISSING_FIELDS" };

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== "number" || now > payload.exp) return { ok: false, error: "EXPIRED" };

  return { ok: true, payload };
}

function parseCookieHeader(cookieHeader: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  const raw = String(cookieHeader ?? "");
  if (!raw) return out;

  for (const part of raw.split(";")) {
    const idx = part.indexOf("=");
    if (idx <= 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (!k) continue;
    out[k] = v;
  }
  return out;
}

/**
 * ✅ Bank-grade primitive for API routes.
 * - Reads parent cookie from request
 * - Verifies signature + expiry
 * - Returns 401 JSON (no redirect) on failure
 */
export function requireParentSession(
  req: Request
):
  | { ok: true; session: ParentSessionPayload }
  | { ok: false; res: Response } {
  try {
    const anyReq = req as any;

    let token = "";
    if (anyReq?.cookies?.get) {
      token = String(anyReq.cookies.get(PARENT_COOKIE_NAME)?.value ?? "");
    } else {
      const jar = parseCookieHeader(req.headers.get("cookie"));
      token = jar[PARENT_COOKIE_NAME] ?? "";
    }

    const v = verifyParentSessionToken(token);
    if (!v.ok) {
      return { ok: false, res: noStoreJson(401, { ok: false, error: "UNAUTHORIZED_PARENT" }) };
    }

    return { ok: true, session: v.payload };
  } catch (e: any) {
    const msg = String(e?.message ?? "");
    if (msg === "PARENT_SESSION_SECRET_MISSING") {
      return { ok: false, res: noStoreJson(500, { ok: false, error: "SERVER_MISCONFIGURED" }) };
    }
    return { ok: false, res: noStoreJson(401, { ok: false, error: "UNAUTHORIZED_PARENT" }) };
  }
}