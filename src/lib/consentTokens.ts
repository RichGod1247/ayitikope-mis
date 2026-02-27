// src/lib/consentTokens.ts
import { createHmac, timingSafeEqual } from "crypto";

type StudentConsentTokenPayload = {
  v: 1;
  sid: string; // studentId
  exp: number; // unix seconds
};

function base64urlEncode(buf: Buffer) {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64urlDecodeToBuffer(s: string) {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return Buffer.from(b64, "base64");
}

function getSecret() {
  const secret = (process.env.CONSENT_TOKEN_SECRET || process.env.NEXTAUTH_SECRET || "").trim();
  if (!secret) {
    throw new Error("Missing CONSENT_TOKEN_SECRET (or NEXTAUTH_SECRET) env var.");
  }
  return secret;
}

function sign(payloadB64: string) {
  const secret = getSecret();
  const mac = createHmac("sha256", secret).update(payloadB64).digest();
  return base64urlEncode(mac);
}

export function signStudentConsentToken(studentId: string, ttlDays = 14) {
  const sid = String(studentId ?? "").trim();
  if (!sid) throw new Error("studentId is required");
  const safeTtlDays = Math.min(Math.max(Number(ttlDays) || 14, 1), 90);
  const exp = Math.floor(Date.now() / 1000) + safeTtlDays * 86400;

  const payload: StudentConsentTokenPayload = { v: 1, sid, exp };
  const payloadJson = Buffer.from(JSON.stringify(payload), "utf8");
  const payloadB64 = base64urlEncode(payloadJson);
  const sigB64 = sign(payloadB64);
  return `${payloadB64}.${sigB64}`;
}

export function verifyStudentConsentToken(token: string): StudentConsentTokenPayload | null {
  const raw = String(token ?? "").trim();
  const parts = raw.split(".");
  if (parts.length !== 2) return null;

  const [payloadB64, sigB64] = parts;

  // Verify signature (timing-safe)
  const expected = sign(payloadB64);
  const a = Buffer.from(sigB64, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;

  // Parse payload
  let payload: any;
  try {
    payload = JSON.parse(base64urlDecodeToBuffer(payloadB64).toString("utf8"));
  } catch {
    return null;
  }

  if (!payload || payload.v !== 1) return null;
  if (typeof payload.sid !== "string" || !payload.sid.trim()) return null;
  if (typeof payload.exp !== "number" || !Number.isFinite(payload.exp)) return null;

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now) return null;

  return { v: 1, sid: payload.sid.trim(), exp: payload.exp };
}
