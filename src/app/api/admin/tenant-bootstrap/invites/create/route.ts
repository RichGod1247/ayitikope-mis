// src/app/api/admin/tenant-bootstrap/invites/create/route.ts
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import { normalizeGhPhoneE164 } from "@/lib/phoneNormGH";
import { sendViaHubtel, BrandName } from "@/lib/sms/hubtel";
import { sendEmail } from "@/lib/email/sendEmail";
import { getIpFromHeaders, getUserAgentFromHeaders, rateLimitCheck, rateLimitRecord } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  schoolName?: string;
  contactEmail: string;
  contactPhone?: string;
  brand?: string;
  sendEmail?: boolean;
  sendSms?: boolean;
  ttlMinutes?: number;
};

const RL_ACTION = "TENANT_BOOTSTRAP_INVITE_CREATE";
const RL_USER_WINDOW_SECONDS = 10 * 60;
const RL_USER_LIMIT = Number(process.env.TENANT_BOOTSTRAP_INVITE_LIMIT_PER_USER_10M || 30);

function json(payload: unknown, status = 200, extraHeaders?: Record<string, string>) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...(extraHeaders ?? {}),
    },
  });
}

function cleanStr(v: unknown) {
  return String(v ?? "").trim();
}

function cleanEmail(v: unknown) {
  return String(v ?? "").toLowerCase().trim();
}

function sha256Hex(s: string) {
  return crypto.createHash("sha256").update(s).digest("hex");
}

function clampInt(n: unknown, def: number, min: number, max: number) {
  const x = Number(n);
  if (!Number.isFinite(x)) return def;
  return Math.min(max, Math.max(min, Math.trunc(x)));
}

function slugify(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

function randomCode(len = 6) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

function makeSchoolCode() {
  return `SCH-${randomCode(6)}`;
}

function resolveBrand(input?: string): (typeof BrandName)[number] {
  const raw = String(input ?? process.env.HUBTEL_DEFAULT_BRAND ?? "EDULIFEOS")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");

  if (raw === "EDULIFE") return "EDULIFEOS";
  if (BrandName.includes(raw as (typeof BrandName)[number])) {
    return raw as (typeof BrandName)[number];
  }

  return "EDULIFEOS";
}

/**
 * ✅ Bank-grade base URL:
 * - prod: env only
 * - dev: use forwarded host
 */
function getBaseUrl(req: NextRequest) {
  const envBase = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || process.env.APP_URL || "";
  if (envBase) return envBase.replace(/\/+$/, "");
  if (process.env.NODE_ENV === "production") return "";

  const h = req.headers;
  const proto = (h.get("x-forwarded-proto") || "http").split(",")[0]?.trim() || "http";
  const host = (h.get("x-forwarded-host") || h.get("host") || "").split(",")[0]?.trim() || "";
  if (host) return `${proto}://${host}`.replace(/\/+$/, "");
  return "http://localhost:3000";
}

export async function POST(req: NextRequest) {
  const auth = await requireApiUserContext(req, { requireTenant: false, requireRoleNames: ["SUPERADMIN"] });
  if (!auth.ok) return auth.res;

  const actorId = auth.ctx.userId;

  const ct = (req.headers.get("content-type") || "").toLowerCase();
  if (!ct.includes("application/json")) {
    return json({ ok: false, error: "CONTENT_TYPE_MUST_BE_JSON" }, 415);
  }

  const body = (await req.json().catch(() => ({}))) as Body;

  const schoolName = cleanStr(body.schoolName);
  const contactEmail = cleanEmail(body.contactEmail);
  const contactPhoneRaw = cleanStr(body.contactPhone);
  const brand = resolveBrand(body.brand);

  const sendEmailFlag = body.sendEmail !== false;
  const sendSmsFlag = body.sendSms !== false;

  if (!contactEmail || !contactEmail.includes("@")) {
    return json({ ok: false, error: "CONTACT_EMAIL_REQUIRED" }, 400);
  }

  const contactPhoneNorm = contactPhoneRaw ? normalizeGhPhoneE164(contactPhoneRaw) : null;
  if (contactPhoneRaw && !contactPhoneNorm) {
    return json({ ok: false, error: "BAD_PHONE" }, 400);
  }

  const ttlMinutes = clampInt(
    body.ttlMinutes ?? process.env.TENANT_BOOTSTRAP_INVITE_TTL_MINUTES ?? 1440,
    1440,
    5,
    7 * 24 * 60
  );
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

  const ip = getIpFromHeaders(req.headers);
  const userAgent = getUserAgentFromHeaders(req.headers);

  const key = `tenantBootstrapInviteCreate:user:${actorId}`;
  const lim = await rateLimitCheck({
    action: RL_ACTION,
    key,
    limit: RL_USER_LIMIT,
    windowSeconds: RL_USER_WINDOW_SECONDS,
  });
  if (!lim.ok) {
    return json({ ok: false, error: "RATE_LIMITED", retryAfterSeconds: lim.retryAfterSeconds }, 429, {
      "Retry-After": String(lim.retryAfterSeconds),
    });
  }

  await rateLimitRecord({
    action: RL_ACTION,
    key,
    userId: actorId,
    ip,
    userAgent,
    metadata: { contactEmail } as any,
  });

  const baseSlug = schoolName ? slugify(schoolName) : `school-${randomCode(6).toLowerCase()}`;
  let reservedSlug = baseSlug;
  for (let i = 0; i < 6; i++) {
    const exists = await prisma.tenant.findFirst({ where: { slug: reservedSlug }, select: { id: true } });
    if (!exists) break;
    reservedSlug = `${baseSlug}-${randomCode(4).toLowerCase()}`;
  }

  let reservedSchoolCode = makeSchoolCode();
  for (let i = 0; i < 8; i++) {
    const exists = await prisma.tenant.findFirst({ where: { schoolCode: reservedSchoolCode }, select: { id: true } });
    if (!exists) break;
    reservedSchoolCode = makeSchoolCode();
  }

  const token = crypto.randomBytes(24).toString("base64url");
  const tokenHash = sha256Hex(token);

  const row = await prisma.tenantBootstrapInvite.create({
    data: {
      tokenHash,
      schoolName: schoolName || null,
      contactEmail,
      contactPhone: contactPhoneRaw || null,
      contactPhoneNorm: contactPhoneNorm || null,
      reservedSlug,
      reservedSchoolCode,
      expiresAt,
      createdByUserId: actorId,
    },
    select: { id: true, expiresAt: true, reservedSlug: true, reservedSchoolCode: true },
  });

  const base = getBaseUrl(req);
  const link = base ? `${base}/tenant/enroll?token=${encodeURIComponent(token)}` : "";
  const exp = expiresAt.toISOString().slice(0, 16).replace("T", " ");

  const emailText =
    `Hello,\n\n` +
    `You have been invited to onboard your school on EduLife OS.\n\n` +
    `School Code: ${reservedSchoolCode}\n` +
    (schoolName ? `School Name: ${schoolName}\n` : "") +
    `Expires: ${exp}\n\n` +
    (link ? `Enrollment link:\n${link}\n\n` : `Invite token:\n${token}\n\n`) +
    `If you did not expect this, ignore this message.`;

  const emailResult = sendEmailFlag
    ? await sendEmail({
        to: contactEmail,
        subject: `EduLife OS: School onboarding invite (${reservedSchoolCode})`,
        text: emailText,
        replyTo: process.env.EMAIL_REPLY_TO || undefined,
      })
    : { ok: false, provider: "DISABLED" as const, to: contactEmail, testMode: false, error: "EMAIL_DISABLED_BY_REQUEST" };

  let sms: any = null;
  if (!sendSmsFlag) {
    sms = { ok: false, error: "SMS_DISABLED_BY_REQUEST", brand };
  } else if (contactPhoneNorm) {
    const smsText =
      `EduLifeOS\n` +
      `School onboarding invite\n` +
      `School Code: ${reservedSchoolCode}\n` +
      `Expires: ${exp}\n` +
      (link ? `Enroll: ${link}` : `Token: ${token}`);

    try {
      try {
        await prisma.sMSSendAudit.create({
          data: {
            tenantId: auth.ctx.tenantId ?? null,
            toPhone: contactPhoneNorm,
            template: "TENANT_BOOTSTRAP_INVITE",
            payload: { reservedSchoolCode, expiresAt: expiresAt.toISOString(), brand },
          },
        });
      } catch {}

      await sendViaHubtel({
        to: contactPhoneNorm,
        body: smsText,
        brand,
        tenantId: auth.ctx.tenantId ?? undefined,
        actorId,
        meta: { category: "TENANT_BOOTSTRAP_INVITE", reservedSchoolCode, expiresAt: expiresAt.toISOString() },
      });

      sms = { ok: true, to: contactPhoneNorm, brand };
    } catch (e: any) {
      sms = { ok: false, to: contactPhoneNorm, error: String(e?.message || "SMS_FAILED"), brand };
    }
  } else {
    sms = { ok: false, error: "PHONE_NOT_PROVIDED", brand };
  }

  try {
    await prisma.auditLog.create({
      data: {
        userId: actorId,
        action: "TENANT_BOOTSTRAP_INVITE_CREATED",
        resource: "TenantBootstrapInvite",
        resourceId: row.id,
        ip,
        userAgent,
        metadata: {
          reservedSchoolCode,
          reservedSlug,
          contactEmail,
          smsRequested: Boolean(contactPhoneNorm),
          expiresAt: expiresAt.toISOString(),
          ttlMinutes,
          sendEmail: sendEmailFlag,
          sendSms: sendSmsFlag,
          brand,
        } as any,
      },
    });
  } catch {}

  return json({
    ok: true,
    reservedSchoolCode,
    reservedSlug,
    expiresAt: row.expiresAt.toISOString(),
    inviteUrl: link || null,
    inviteToken: link ? null : token,
    delivery: { email: emailResult, sms },
  });
}