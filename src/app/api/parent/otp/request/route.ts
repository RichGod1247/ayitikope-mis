// src/app/api/parent/otp/request/route.ts
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { normalizeGhPhoneE164 } from "@/lib/phoneNormGH";
import { sendSms } from "@/lib/sms";
import {
  getIpFromHeaders,
  getUserAgentFromHeaders,
  rateLimitCheck,
  rateLimitRecord,
} from "@/lib/rateLimit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const OTP_TTL_MS = 5 * 60 * 1000;
const RESEND_COOLDOWN_SECONDS = 120;

function secret() {
  const s = process.env.OTP_SECRET || process.env.NEXTAUTH_SECRET;
  if (!s) throw new Error("OTP_SECRET_MISSING");
  return s;
}

function sign(base: string) {
  return crypto.createHmac("sha256", secret()).update(base).digest("base64url");
}

function createSignedToken(payload: Record<string, unknown>) {
  const base = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = sign(base);
  return `${base}.${sig}`;
}

function digitsOnly(v: unknown) {
  return String(v ?? "").replace(/\D/g, "");
}

function suffix9(v: unknown) {
  const d = digitsOnly(v);
  return d.length >= 9 ? d.slice(-9) : d;
}

function generateOtp(): string {
  return crypto.randomInt(100000, 1000000).toString();
}

function otpHash(
  code: string,
  tenantId: string,
  phoneDigits: string,
  expiresAt: number
) {
  return crypto
    .createHmac("sha256", secret())
    .update(`${tenantId}|${phoneDigits}|${expiresAt}|${code}`)
    .digest("base64url");
}

function noStoreJson(status: number, payload: unknown) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function safeInt(n: unknown, def: number) {
  const x = Number(n);
  return Number.isFinite(x) ? Math.trunc(x) : def;
}

async function getLastAcceptedOtpToken(input: {
  tenantId: string;
  phoneDigits: string;
}) {
  const auditKey = `parentOtp:${input.tenantId}:${input.phoneDigits}`;

  const last = await prisma.auditLog.findFirst({
    where: {
      tenantId: input.tenantId,
      action: "PARENT_OTP_REQUEST_ACCEPTED",
      resource: "parent_otp",
      resourceId: auditKey,
    },
    orderBy: { createdAt: "desc" },
    select: { metadata: true },
  });

  const md = (last?.metadata as Record<string, unknown>) || {};
  const token = typeof md.token === "string" ? md.token : null;
  const expiresAt = safeInt(md.expiresAt, 0);

  if (!token || expiresAt <= Date.now()) {
    return { token: null, expiresAt: 0 };
  }

  return { token, expiresAt };
}

export async function POST(req: NextRequest) {
  try {
    const ct = (req.headers.get("content-type") || "").toLowerCase();

    if (!ct.includes("application/json")) {
      return noStoreJson(415, {
        ok: false,
        error: "Content-Type must be application/json.",
      });
    }

    const body = await req.json().catch(() => ({}));

    const schoolId = String(body.schoolId ?? "").trim();
    const guardianPhoneRaw = String(body.guardianPhone ?? "").trim();

    if (!schoolId) {
      return noStoreJson(400, {
        ok: false,
        error: "Select your school first.",
      });
    }

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
        error: "Enter a valid Ghana phone number, for example 0551234567.",
      });
    }

    const ip = getIpFromHeaders(req.headers);
    const userAgent = getUserAgentFromHeaders(req.headers);

    const phoneDigits = digitsOnly(phoneNorm);
    const phoneLast9 = suffix9(phoneNorm);
    const phoneLast4 = phoneDigits.slice(-4);

    const rlKey = `parentOtpSend:${tenant.id}:${phoneDigits}`;

    const lim = await rateLimitCheck({
      action: "PARENT_OTP_SEND",
      key: rlKey,
      limit: 1,
      windowSeconds: RESEND_COOLDOWN_SECONDS,
    });

    if (!lim.ok) {
      const last = await getLastAcceptedOtpToken({
        tenantId: tenant.id,
        phoneDigits,
      });

      if (last.token) {
        return noStoreJson(200, {
          ok: true,
          token: last.token,
          validForMinutes: Math.round(OTP_TTL_MS / 60000),
          message:
            "A code was recently sent. Please wait before requesting another.",
          cooldownSecondsRemaining: lim.retryAfterSeconds,
        });
      }

      return noStoreJson(429, {
        ok: false,
        error:
          "Please wait briefly before requesting another login code.",
        cooldownSecondsRemaining: lim.retryAfterSeconds,
      });
    }

    const linkedStudent = await prisma.student.findFirst({
      where: {
        tenantId: tenant.id,
        status: "ACTIVE",
        OR: [
          { guardianPhoneNorm: phoneNorm },
          { guardianPhoneNorm: { endsWith: phoneLast9 } },
          { guardianPhone: { endsWith: phoneLast9 } },
        ],
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
      },
    });

    if (!linkedStudent) {
      await rateLimitRecord({
        action: "PARENT_OTP_UNKNOWN_PHONE",
        key: `parentOtpUnknown:${tenant.id}:${phoneDigits}`,
        tenantId: tenant.id,
        ip,
        userAgent,
        metadata: {
          kind: "PARENT_OTP_UNREGISTERED_PHONE",
          phoneLast4,
        } as any,
      });

      return noStoreJson(404, {
        ok: false,
        error:
          "This phone number is not linked to an active learner in this school. Please enter the guardian phone number recorded by the school, or contact the school office for help.",
      });
    }

    const otp = generateOtp();
    const expiresAt = Date.now() + OTP_TTL_MS;

    const tokenPayload = {
      v: 2,
      tenantId: tenant.id,
      guardianPhone: phoneDigits,
      phoneNorm,
      expiresAt,
      otpHash: otpHash(otp, tenant.id, phoneDigits, expiresAt),
    };

    const token = createSignedToken(tokenPayload);

    const smsText =
      `${tenant.name}: Your EduLife OS login code is ${otp}. ` +
      "It expires in 5 minutes. If you did not request this, ignore this SMS.";

    const smsResult = await sendSms({
      tenantId: tenant.id,
      to: phoneNorm,
      message: smsText,
      template: "PARENT_OTP",
      payload: {
        expiresAt,
        linkedStudentId: linkedStudent.id,
        phoneLast4,
      },
    });

    if (!smsResult.ok) {
      console.error("[PARENT_OTP_SMS_FAILED]", smsResult);

      return noStoreJson(502, {
        ok: false,
        error:
          "We could not send the login code right now. Please try again shortly or contact the school office.",
      });
    }

    const auditKey = `parentOtp:${tenant.id}:${phoneDigits}`;

    try {
      await prisma.auditLog.create({
        data: {
          tenantId: tenant.id,
          action: "PARENT_OTP_REQUEST_ACCEPTED",
          resource: "parent_otp",
          resourceId: auditKey,
          metadata: {
            phoneLast4,
            expiresAt,
            token,
            linkedStudentId: linkedStudent.id,
            providerMessageId: smsResult.providerMessageId ?? null,
            providerStatusDescription:
              smsResult.providerStatusDescription ?? null,
            smsTestMode: smsResult.testMode ?? null,
            smsTo: smsResult.to ?? null,
            smsBrand: smsResult.brand ?? "EDULIFEOS",
          } as any,
          ip,
          userAgent,
        },
      });
    } catch (auditErr) {
      console.error("[PARENT_OTP_AUDIT_ERROR]", auditErr);
    }

    try {
      await rateLimitRecord({
        action: "PARENT_OTP_SEND",
        key: rlKey,
        tenantId: tenant.id,
        ip,
        userAgent,
        metadata: {
          kind: "PARENT_OTP_SEND_ACCEPTED",
          phoneLast4,
          providerMessageId: smsResult.providerMessageId ?? null,
          providerStatusDescription:
            smsResult.providerStatusDescription ?? null,
        } as any,
      });
    } catch (rateErr) {
      console.error("[PARENT_OTP_RATE_LIMIT_RECORD_ERROR]", rateErr);
    }

    return noStoreJson(200, {
      ok: true,
      token,
      validForMinutes: Math.round(OTP_TTL_MS / 60000),
      message: "A login code has been sent to the guardian phone number.",
      cooldownSecondsRemaining: RESEND_COOLDOWN_SECONDS,
    });
  } catch (e) {
    console.error("[PARENT_OTP_REQUEST_ERROR]", e);

    return noStoreJson(500, {
      ok: false,
      error: "Server error. Please try again.",
    });
  }
}