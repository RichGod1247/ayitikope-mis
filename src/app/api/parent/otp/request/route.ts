// src/app/api/parent/otp/request/route.ts
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { normalizeGhPhoneE164 } from "@/lib/phoneNormGH";
import { sendViaHubtel } from "@/lib/sms/hubtel";
import { getIpFromHeaders, getUserAgentFromHeaders, rateLimitCheck, rateLimitRecord } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const OTP_TTL_MS = 5 * 60 * 1000; // ✅ keep: 5 minutes
const RESEND_COOLDOWN_SECONDS = 120; // ✅ 2 minutes (anti-spam / cost control)

function secret() {
  const s = process.env.OTP_SECRET || process.env.NEXTAUTH_SECRET;
  if (!s) throw new Error("OTP_SECRET_MISSING");
  return s;
}

function sign(base: string) {
  return crypto.createHmac("sha256", secret()).update(base).digest("base64url");
}

function createSignedToken(payload: Record<string, any>) {
  const base = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = sign(base);
  return `${base}.${sig}`;
}

function digitsOnly(v: string) {
  return String(v ?? "").replace(/\D/g, "");
}

function generateOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// Bind hash to tenant + phoneDigits + expiry + code
function otpHash(code: string, tenantId: string, phoneDigits: string, expiresAt: number) {
  return crypto
    .createHmac("sha256", secret())
    .update(`${tenantId}|${phoneDigits}|${expiresAt}|${code}`)
    .digest("base64url");
}

function noStoreJson(status: number, payload: any) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function safeInt(n: unknown, def: number) {
  const x = Number(n);
  return Number.isFinite(x) ? Math.trunc(x) : def;
}

export async function POST(req: NextRequest) {
  try {
    const ct = (req.headers.get("content-type") || "").toLowerCase();
    if (!ct.includes("application/json")) {
      return noStoreJson(415, { ok: false, error: "Content-Type must be application/json." });
    }

    const body = await req.json().catch(() => ({}));

    // ✅ UI sends schoolId (internal). Parent never sees tenantId.
    const schoolId = String(body.schoolId ?? "").trim();
    const guardianPhoneRaw = String(body.guardianPhone ?? "").trim();

    if (!schoolId) return noStoreJson(400, { ok: false, error: "schoolId is required" });

    const tenant = await prisma.tenant.findFirst({
      where: { id: schoolId, status: "ACTIVE" },
      select: { id: true, name: true },
    });

    if (!tenant) {
      return noStoreJson(400, {
        ok: false,
        error: "Invalid school selection. Please choose your school and try again.",
      });
    }

    const phoneNorm = normalizeGhPhoneE164(guardianPhoneRaw);
    if (!phoneNorm) {
      return noStoreJson(400, {
        ok: false,
        error: "guardianPhone must be a valid Ghana phone (normalizable to +233...)",
      });
    }

    const ip = getIpFromHeaders(req.headers);
    const userAgent = getUserAgentFromHeaders(req.headers);

    const phoneDigits = digitsOnly(phoneNorm); // 233XXXXXXXXX

    // ✅ Per-tenant+phone cooldown (server-enforced)
    const rlKey = `parentOtpSend:${tenant.id}:${phoneDigits}`;
    const lim = await rateLimitCheck({
      action: "PARENT_OTP_SEND",
      key: rlKey,
      limit: 1,
      windowSeconds: RESEND_COOLDOWN_SECONDS,
    });

    if (!lim.ok) {
      // Return the LAST token we issued in the last 5 minutes (if present),
      // so users who double-click don't overwrite/lose the working token.
      const auditKey = `parentOtp:${tenant.id}:${phoneDigits}`;

      const last = await prisma.auditLog.findFirst({
        where: {
          tenantId: tenant.id,
          action: "PARENT_OTP_REQUEST",
          resource: "parent_otp",
          resourceId: auditKey,
        },
        orderBy: { createdAt: "desc" },
        select: { metadata: true },
      });

      const md = (last?.metadata as any) || {};
      const lastToken = typeof md?.token === "string" ? md.token : null;
      const lastExpiresAt = safeInt(md?.expiresAt, 0);

      const stillValid = !!lastToken && lastExpiresAt > Date.now();

      return noStoreJson(200, {
        ok: true,
        token: stillValid ? lastToken : null,
        validForMinutes: Math.round(OTP_TTL_MS / 60000),
        message: "If this number is registered, an OTP has been sent.",
        cooldownSecondsRemaining: lim.retryAfterSeconds,
      });
    }

    // record attempt immediately (prevents race/double-click)
    await rateLimitRecord({
      action: "PARENT_OTP_SEND",
      key: rlKey,
      tenantId: tenant.id,
      ip,
      userAgent,
      metadata: { kind: "PARENT_OTP_SEND" } as any,
    });

    const otp = generateOtp();
    const expiresAt = Date.now() + OTP_TTL_MS;

    const tokenPayload = {
      v: 2,
      tenantId: tenant.id,
      guardianPhone: phoneDigits, // digits (233...)
      phoneNorm, // +233...
      expiresAt,
      otpHash: otpHash(otp, tenant.id, phoneDigits, expiresAt),
    };

    const token = createSignedToken(tokenPayload);

    // ✅ No phone enumeration: always same outward message.
    const responsePayload: any = {
      ok: true,
      token,
      validForMinutes: Math.round(OTP_TTL_MS / 60000),
      message: "If this number is registered, an OTP has been sent.",
      cooldownSecondsRemaining: RESEND_COOLDOWN_SECONDS,
    };

    // Optional debug code (OFF by default; never in production)
    const otpDebug =
      (process.env.OTP_DEBUG_MODE ?? "").toLowerCase() === "true" && process.env.NODE_ENV !== "production";
    if (otpDebug) responsePayload.debugCode = otp;

    // Best-effort audit (never breaks flow)
    try {
      const auditKey = `parentOtp:${tenant.id}:${phoneDigits}`;
      await prisma.auditLog.create({
        data: {
          tenantId: tenant.id,
          action: "PARENT_OTP_REQUEST",
          resource: "parent_otp",
          resourceId: auditKey,
          metadata: {
            phoneLast4: phoneDigits.slice(-4),
            expiresAt,
            token, // ✅ so cooldown responses can return the same token
          } as any,
          ip,
          userAgent,
        },
      });
    } catch {}

    // Best-effort SMS send (never breaks response)
    const smsText = `${tenant.name}: Your EduLife OS login code is ${otp}. It expires in 5 minutes. If you did not request this, ignore.`;

    try {
      try {
        await prisma.sMSSendAudit.create({
          data: {
            tenantId: tenant.id,
            toPhone: phoneNorm,
            template: "PARENT_OTP",
            payload: { expiresAt },
          },
        });
      } catch {}

      await sendViaHubtel({
        to: phoneNorm,
        body: smsText,
        brand: "AYITIADMIN",
        tenantId: tenant.id,
        meta: { category: "PARENT_OTP", expiresAt },
      });
    } catch (e) {
      console.error("[PARENT_OTP_SEND_ERROR]", e);
    }

    return noStoreJson(200, responsePayload);
  } catch (e) {
    console.error("[PARENT_OTP_REQUEST_ERROR]", e);
    return noStoreJson(500, { ok: false, error: "Server error. Please try again." });
  }
}