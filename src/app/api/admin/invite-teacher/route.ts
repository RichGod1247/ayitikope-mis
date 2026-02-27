// src/app/api/admin/invite-teacher/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import {
  getIpFromHeaders,
  getUserAgentFromHeaders,
  rateLimitCheck,
  rateLimitRecord,
} from "@/lib/rateLimit";
import { normalizeGhPhoneE164 } from "@/lib/phoneNormGH";
import { sendViaHubtel } from "@/lib/sms/hubtel";
import { sendEmail } from "@/lib/email/sendEmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type FieldErrors = Record<string, string>;
type UnknownRecord = Record<string, unknown>;

function isRecord(v: unknown): v is UnknownRecord {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function jsonFail(msg: string, status = 400, fieldErrors?: FieldErrors, extraHeaders?: Record<string, string>) {
  return NextResponse.json(
    { ok: false, error: msg, fieldErrors: fieldErrors ?? null },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        ...(extraHeaders ?? {}),
      },
    }
  );
}

function jsonOk(payload: unknown, status = 200, extraHeaders?: Record<string, string>) {
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

function normRole(v: unknown) {
  return String(v ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
}

function effectiveRole(v: unknown) {
  const r = normRole(v);
  if (r === "ADMIN") return "SCHOOL_ADMIN";
  if (r === "HEADMASTER") return "HEADTEACHER";
  return r;
}

function safeInternalPath(raw: unknown, fallback = "/app") {
  const v = String(raw ?? "").trim();
  if (!v) return fallback;
  if (v.startsWith("//") || v.startsWith("\\") || v.startsWith("\\\\")) return fallback;
  if (v.startsWith("/")) return v;
  try {
    const u = new URL(v);
    const p = `${u.pathname}${u.search}${u.hash}`.trim();
    if (!p.startsWith("/") || p.startsWith("//")) return fallback;
    return p || fallback;
  } catch {
    return fallback;
  }
}

/**
 * ✅ Bank-grade base URL:
 * - In prod: ONLY env base is allowed
 * - In dev: derive from forwarded headers or host
 */
function getBaseUrl(req: Request) {
  const envBase =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXTAUTH_URL ||
    process.env.APP_URL ||
    "";

  if (envBase) return envBase.replace(/\/+$/, "");

  if (process.env.NODE_ENV === "production") {
    throw new Error("APP_URL_NOT_CONFIGURED");
  }

  const h = req.headers;
  const proto = (h.get("x-forwarded-proto") || "http").split(",")[0]?.trim() || "http";
  const host = (h.get("x-forwarded-host") || h.get("host") || "").split(",")[0]?.trim() || "";
  if (host) return `${proto}://${host}`.replace(/\/+$/, "");

  return "http://localhost:3000";
}

function canInvite(inviterRole: string, targetRole: string) {
  const r = effectiveRole(inviterRole);
  const t = effectiveRole(targetRole);

  if (r === "SUPERADMIN" || r === "SCHOOL_ADMIN") {
    return t === "TEACHER" || t === "HEADTEACHER";
  }
  if (r === "HEADTEACHER") {
    return t === "TEACHER";
  }
  return false;
}

// Rate-limit policy
const INVITE_USER_WINDOW_SECONDS = 10 * 60;
const INVITE_USER_LIMIT = Number(process.env.INVITE_STAFF_LIMIT_PER_USER_10M || 10);

const INVITE_TENANT_WINDOW_SECONDS = 60 * 60;
const INVITE_TENANT_LIMIT = Number(process.env.INVITE_STAFF_LIMIT_PER_TENANT_HOUR || 200);

const RL_ACTION = "ADMIN_INVITE_STAFF";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return jsonFail("UNAUTHORIZED", 401);

  const tenantId = (session.user as any).tenantId as string | null | undefined;
  const userId = (session.user as any).id as string | undefined;
  if (!tenantId || !userId) return jsonFail("TENANT_CONTEXT_REQUIRED", 409);

  const membership = await prisma.membership.findUnique({
    where: { userId_tenantId: { userId, tenantId } },
    select: { status: true, role: { select: { name: true } } },
  });
  if (!membership || membership.status !== "ACTIVE") return jsonFail("FORBIDDEN", 403);

  const inviterRole = effectiveRole(membership.role?.name ?? "");

  const bodyRaw = await req.json().catch(() => null);
  if (!isRecord(bodyRaw)) return jsonFail("INVALID_PAYLOAD", 400);

  const email = cleanEmail(bodyRaw.email);
  const targetRoleName = effectiveRole(bodyRaw.roleName ?? "TEACHER");
  const redirectTo = safeInternalPath(bodyRaw.redirectTo ?? "/app", "/app");

  // ✅ NEW (optional): SMS phone for invite link delivery
  const deliverToPhoneRaw = cleanStr((bodyRaw as any).deliverToPhone ?? "");
  const deliverToName = cleanStr((bodyRaw as any).deliverToName ?? "");
  const brand = cleanStr((bodyRaw as any).brand ?? "AYITIADMIN") || "AYITIADMIN";

  const fe: FieldErrors = {};
  if (!email || !email.includes("@")) fe.email = "Valid email is required.";
  if (!(targetRoleName === "TEACHER" || targetRoleName === "HEADTEACHER")) {
    fe.roleName = "roleName must be TEACHER or HEADTEACHER.";
  }
  if (Object.keys(fe).length) return jsonFail("VALIDATION_FAILED", 400, fe);

  if (!canInvite(inviterRole, targetRoleName)) return jsonFail("FORBIDDEN", 403);

  const ip = getIpFromHeaders(req.headers);
  const userAgent = getUserAgentFromHeaders(req.headers);

  const userKey = `inviteStaff:user:${userId}`;
  const tenantKey = `inviteStaff:tenant:${tenantId}`;

  const limUser = await rateLimitCheck({
    action: RL_ACTION,
    key: userKey,
    limit: INVITE_USER_LIMIT,
    windowSeconds: INVITE_USER_WINDOW_SECONDS,
  });
  if (!limUser.ok) {
    return jsonFail(
      "RATE_LIMITED",
      429,
      { retryAfterSeconds: String(limUser.retryAfterSeconds) },
      { "Retry-After": String(limUser.retryAfterSeconds) }
    );
  }

  const limTenant = await rateLimitCheck({
    action: RL_ACTION,
    key: tenantKey,
    limit: INVITE_TENANT_LIMIT,
    windowSeconds: INVITE_TENANT_WINDOW_SECONDS,
  });
  if (!limTenant.ok) {
    return jsonFail(
      "RATE_LIMITED",
      429,
      { retryAfterSeconds: String(limTenant.retryAfterSeconds) },
      { "Retry-After": String(limTenant.retryAfterSeconds) }
    );
  }

  await Promise.all([
    rateLimitRecord({
      action: RL_ACTION,
      key: userKey,
      tenantId,
      userId,
      ip,
      userAgent,
      metadata: { target: { email, roleName: targetRoleName } },
    }),
    rateLimitRecord({
      action: RL_ACTION,
      key: tenantKey,
      tenantId,
      userId,
      ip,
      userAgent,
      metadata: { target: { email, roleName: targetRoleName } },
    }),
  ]);

  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (existingUser?.id) {
    const existingMembership = await prisma.membership.findUnique({
      where: { userId_tenantId: { userId: existingUser.id, tenantId } },
      select: { id: true },
    });
    if (existingMembership?.id) {
      return jsonFail("ALREADY_MEMBER", 409, {
        email: "This email already belongs to a staff account in this school.",
      });
    }
  }

  const role = await prisma.role.findFirst({
    where: { tenantId, name: targetRoleName },
    select: { id: true, name: true },
  });
  if (!role) return jsonFail(`Role "${targetRoleName}" not configured for this school.`, 500);

  const now = new Date();

  // ✅ Requirement: invite expires in 15 minutes
  const ttlMinutesRaw = Number(process.env.INVITE_LINK_TTL_MINUTES || 15);
  const ttlMinutes = Number.isFinite(ttlMinutesRaw) ? Math.min(Math.max(ttlMinutesRaw, 5), 60) : 15;
  const expiresAt = new Date(now.getTime() + ttlMinutes * 60 * 1000);

  let base: string;
  try {
    base = getBaseUrl(req);
  } catch {
    return jsonFail("APP_URL_NOT_CONFIGURED", 500);
  }

  // Reuse active invite if exists (still valid)
  const existingInvite = await prisma.invite.findFirst({
    where: {
      tenantId,
      email,
      roleId: role.id,
      acceptedAt: null,
      expiresAt: { gt: now },
    },
    select: { id: true, token: true, expiresAt: true },
  });

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true },
  });

  const schoolName = tenant?.name || "Your School";

  if (existingInvite) {
    const inviteUrl = `${base}/auth/signup?invite=${encodeURIComponent(existingInvite.token)}&redirectTo=${encodeURIComponent(
      redirectTo
    )}`;

    await prisma.auditLog.create({
      data: {
        tenantId,
        userId,
        action: "INVITE_REUSED",
        resource: "Invite",
        resourceId: existingInvite.id,
        ip,
        userAgent,
        metadata: { email, roleName: targetRoleName, ttlMinutes } as any,
      },
    });

    // ✅ Phase 7 delivery (best-effort): email always, SMS if phone present
    const emailResult = await sendEmail({
      to: email,
      subject: `${schoolName}: Your EduLife OS invite link`,
      text:
        `Hello,\n\nYou have been invited to join ${schoolName} on EduLife OS as ${targetRoleName}.\n\n` +
        `Invite link (expires in ${ttlMinutes} minutes):\n${inviteUrl}\n\n` +
        `If you did not expect this, ignore this email.`,
    });

    let smsResult: any = { ok: false, error: "PHONE_REQUIRED_FOR_SMS" };
    const phoneNorm = normalizeGhPhoneE164(deliverToPhoneRaw);
    if (phoneNorm) {
      const exp = existingInvite.expiresAt.toISOString().slice(0, 16).replace("T", " ");
      const smsText =
        `EduLifeOS - ${schoolName}\n` +
        `Invite (${targetRoleName})\n` +
        `Expires: ${exp}\n` +
        `Link: ${inviteUrl}`;

      try {
        await prisma.sMSSendAudit.create({
          data: {
            tenantId,
            toPhone: phoneNorm,
            template: "INVITE_LINK_DELIVERY",
            payload: {
              inviteId: existingInvite.id,
              roleName: targetRoleName,
              email,
              deliverToName: deliverToName || null,
              expiresAt: existingInvite.expiresAt.toISOString(),
              redirectTo,
              inviteUrl,
            },
          },
        });
      } catch {}

      try {
        await sendViaHubtel({
          to: phoneNorm,
          body: smsText,
          brand,
          tenantId,
          actorId: userId,
          meta: { category: "STAFF_INVITE_LINK", inviteId: existingInvite.id, expiresAt: existingInvite.expiresAt.toISOString() },
        });
        smsResult = { ok: true, to: phoneNorm };
      } catch (e: any) {
        smsResult = { ok: false, to: phoneNorm, error: String(e?.message || "SMS_FAILED") };
      }
    }

    return jsonOk(
      {
        ok: true,
        token: existingInvite.token,
        expiresAt: existingInvite.expiresAt.toISOString(),
        inviteUrl,
        delivery: { email: emailResult, sms: smsResult },
      },
      200
    );
  }

  const token = crypto.randomBytes(24).toString("base64url");

  const created = await prisma.invite.create({
    data: {
      tenantId,
      email,
      roleId: role.id,
      token,
      expiresAt,
      invitedBy: userId,
    },
    select: { id: true, token: true, expiresAt: true },
  });

  await prisma.auditLog.create({
    data: {
      tenantId,
      userId,
      action: "INVITE_CREATED",
      resource: "Invite",
      resourceId: created.id,
      ip,
      userAgent,
      metadata: { email, roleName: targetRoleName, ttlMinutes } as any,
    },
  });

  const inviteUrl = `${base}/auth/signup?invite=${encodeURIComponent(created.token)}&redirectTo=${encodeURIComponent(
    redirectTo
  )}`;

  // ✅ Phase 7 delivery (best-effort)
  const emailResult = await sendEmail({
    to: email,
    subject: `${schoolName}: Your EduLife OS invite link`,
    text:
      `Hello,\n\nYou have been invited to join ${schoolName} on EduLife OS as ${targetRoleName}.\n\n` +
      `Invite link (expires in ${ttlMinutes} minutes):\n${inviteUrl}\n\n` +
      `If you did not expect this, ignore this email.`,
  });

  let smsResult: any = { ok: false, error: "PHONE_REQUIRED_FOR_SMS" };
  const phoneNorm = normalizeGhPhoneE164(deliverToPhoneRaw);
  if (phoneNorm) {
    const exp = created.expiresAt.toISOString().slice(0, 16).replace("T", " ");
    const smsText =
      `EduLifeOS - ${schoolName}\n` +
      `Invite (${targetRoleName})\n` +
      `Expires: ${exp}\n` +
      `Link: ${inviteUrl}`;

    try {
      await prisma.sMSSendAudit.create({
        data: {
          tenantId,
          toPhone: phoneNorm,
          template: "INVITE_LINK_DELIVERY",
          payload: {
            inviteId: created.id,
            roleName: targetRoleName,
            email,
            deliverToName: deliverToName || null,
            expiresAt: created.expiresAt.toISOString(),
            redirectTo,
            inviteUrl,
          },
        },
      });
    } catch {}

    try {
      await sendViaHubtel({
        to: phoneNorm,
        body: smsText,
        brand,
        tenantId,
        actorId: userId,
        meta: { category: "STAFF_INVITE_LINK", inviteId: created.id, expiresAt: created.expiresAt.toISOString() },
      });
      smsResult = { ok: true, to: phoneNorm };
    } catch (e: any) {
      smsResult = { ok: false, to: phoneNorm, error: String(e?.message || "SMS_FAILED") };
    }
  }

  return jsonOk(
    {
      ok: true,
      token: created.token,
      expiresAt: created.expiresAt.toISOString(),
      inviteUrl,
      delivery: { email: emailResult, sms: smsResult },
    },
    200
  );
}