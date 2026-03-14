// src/app/api/admin/invite-codes/create/route.ts
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import { codeHint, generateInviteCode, hashInviteCode } from "@/lib/inviteCodes";
import { safeInternalPath } from "@/lib/roleRouting";
import { normalizeGhPhoneE164 } from "@/lib/phoneNormGH";
import { sendViaHubtel, BrandName } from "@/lib/sms/hubtel";
import { sendEmail } from "@/lib/email/sendEmail";
import {
  getIpFromHeaders,
  getUserAgentFromHeaders,
  rateLimitCheck,
  rateLimitRecord,
} from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  roleName?: string;

  // Legacy (keep for parent codes)
  expiresInDays?: number;

  // NEW (staff codes)
  expiresInMinutes?: number;

  maxUses?: number;

  // Delivery
  sendSms?: boolean;
  sendEmail?: boolean;

  deliverToPhone?: string;
  deliverToEmail?: string;
  deliverToName?: string;

  redirectTo?: string;
  brand?: string;
};

const ALLOWED_ROLE_NAMES = ["HEADTEACHER", "TEACHER", "PARENT"] as const;

const RL_ACTION = "ADMIN_INVITE_CODE_CREATE";
const RL_USER_WINDOW_SECONDS = 10 * 60; // 10 minutes
const RL_TENANT_WINDOW_SECONDS = 60 * 60; // 1 hour
const RL_USER_LIMIT = Number(process.env.INVITE_CODE_CREATE_LIMIT_PER_USER_10M || 30);
const RL_TENANT_LIMIT = Number(process.env.INVITE_CODE_CREATE_LIMIT_PER_TENANT_HOUR || 500);

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

function clampInt(n: unknown, def: number, min: number, max: number) {
  const x = Number(n);
  if (!Number.isFinite(x)) return def;
  return Math.min(max, Math.max(min, Math.trunc(x)));
}

function cleanUpper(v: unknown) {
  return String(v ?? "").trim().toUpperCase();
}

function cleanStr(v: unknown) {
  return String(v ?? "").trim();
}

function isEmailLike(v: string) {
  return v.includes("@");
}

function prefixForRole(roleName: string) {
  if (roleName === "HEADTEACHER") return "HT";
  if (roleName === "TEACHER") return "TC";
  if (roleName === "PARENT") return "PR";
  return "INV";
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
 * Bank-grade base URL:
 * - In prod: env only (prevents Host/Origin poisoning)
 * - In dev: derive from headers or host
 * If not configured in prod, we omit the link (do NOT fail code creation).
 */
function getBaseUrl(req: Request) {
  const envBase =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXTAUTH_URL ||
    process.env.APP_URL ||
    "";

  if (envBase) return envBase.replace(/\/+$/, "");

  if (process.env.NODE_ENV === "production") return "";

  const h = req.headers;
  const proto = (h.get("x-forwarded-proto") || "http").split(",")[0]?.trim() || "http";
  const host = (h.get("x-forwarded-host") || h.get("host") || "").split(",")[0]?.trim() || "";
  if (host) return `${proto}://${host}`.replace(/\/+$/, "");

  return "http://localhost:3000";
}

// Helpful for browser testing (instead of 405 HTML)
export async function GET() {
  return json(
    {
      ok: false,
      error: "METHOD_NOT_ALLOWED",
      hint:
        "Use POST JSON body. Staff codes: { roleName: TEACHER|HEADTEACHER, expiresInMinutes?, sendSms?, sendEmail?, deliverToPhone?, deliverToEmail? } " +
        "Parent codes: { roleName: PARENT, expiresInDays?, ... }",
    },
    405
  );
}

export async function POST(req: NextRequest) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["SCHOOL_ADMIN", "SUPERADMIN"],
  });
  if (!auth.ok) return auth.res;

  const tenantId = auth.ctx.tenantId;
  const createdByUserId = auth.ctx.userId;

  const ct = (req.headers.get("content-type") || "").toLowerCase();
  if (!ct.includes("application/json")) {
    return json({ ok: false, error: "CONTENT_TYPE_MUST_BE_JSON" }, 415);
  }

  const body = (await req.json().catch(() => ({}))) as Body;

  const roleName = cleanUpper(body.roleName);
  if (!ALLOWED_ROLE_NAMES.includes(roleName as any)) {
    return json({ ok: false, error: "INVALID_ROLE", allowed: ALLOWED_ROLE_NAMES }, 400);
  }

  const maxUses = clampInt(body.maxUses, 1, 1, 200);

  // ✅ NEW policy:
  // - TEACHER / HEADTEACHER codes: 15 minutes
  // - PARENT codes: legacy days
  const staffMinutesDefault = clampInt(process.env.INVITE_CODE_TTL_MINUTES ?? 15, 15, 5, 180);
  const staffTtlMinutes = clampInt(body.expiresInMinutes, staffMinutesDefault, 5, 180);

  const parentDaysDefault = 7;
  const parentTtlDays = clampInt(body.expiresInDays, parentDaysDefault, 1, 90);

  const expiresAt =
    roleName === "PARENT"
      ? new Date(Date.now() + parentTtlDays * 24 * 60 * 60 * 1000)
      : new Date(Date.now() + staffTtlMinutes * 60 * 1000);

  const ip = getIpFromHeaders(req.headers);
  const userAgent = getUserAgentFromHeaders(req.headers);

  // ✅ Rate-limit (attempt-based)
  const userKey = `inviteCodeCreate:user:${createdByUserId}`;
  const tenantKey = `inviteCodeCreate:tenant:${tenantId}`;

  const limUser = await rateLimitCheck({
    action: RL_ACTION,
    key: userKey,
    limit: RL_USER_LIMIT,
    windowSeconds: RL_USER_WINDOW_SECONDS,
  });
  if (!limUser.ok) {
    return json(
      { ok: false, error: "RATE_LIMITED", retryAfterSeconds: limUser.retryAfterSeconds },
      429,
      { "Retry-After": String(limUser.retryAfterSeconds) }
    );
  }

  const limTenant = await rateLimitCheck({
    action: RL_ACTION,
    key: tenantKey,
    limit: RL_TENANT_LIMIT,
    windowSeconds: RL_TENANT_WINDOW_SECONDS,
  });
  if (!limTenant.ok) {
    return json(
      { ok: false, error: "RATE_LIMITED", retryAfterSeconds: limTenant.retryAfterSeconds },
      429,
      { "Retry-After": String(limTenant.retryAfterSeconds) }
    );
  }

  await Promise.all([
    rateLimitRecord({
      action: RL_ACTION,
      key: userKey,
      tenantId,
      userId: createdByUserId,
      ip,
      userAgent,
      metadata: { roleName, maxUses, expiresAt: expiresAt.toISOString() } as any,
    }),
    rateLimitRecord({
      action: RL_ACTION,
      key: tenantKey,
      tenantId,
      userId: createdByUserId,
      ip,
      userAgent,
      metadata: { roleName, maxUses, expiresAt: expiresAt.toISOString() } as any,
    }),
  ]);

  const role = await prisma.role.findFirst({
    where: { tenantId, name: roleName },
    select: { id: true, name: true },
  });
  if (!role) return json({ ok: false, error: "ROLE_NOT_FOUND_IN_TENANT", roleName }, 400);

  // Delivery inputs
  const wantSms = body.sendSms !== false; // default true
  const wantEmail = body.sendEmail !== false; // default true

  const deliverToPhoneRaw = cleanStr(body.deliverToPhone || "");
  const deliverToEmailRaw = cleanStr(body.deliverToEmail || "");
  const deliverToName = cleanStr(body.deliverToName || "");

  const redirectTo = safeInternalPath(body.redirectTo ?? "/app", "/app");
  const brand = resolveBrand(body.brand);

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true },
  });
  const schoolLabel = tenant?.name || "Your School";

  // Retry in case of extremely rare hash collisions
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = generateInviteCode(prefixForRole(roleName));
    const codeHash = hashInviteCode(code);

    try {
      const created = await prisma.inviteCode.create({
        data: {
          tenantId,
          roleId: role.id,
          codeHash,
          codeHint: codeHint(code),
          expiresAt,
          maxUses,
          createdByUserId,
        },
        select: { id: true, expiresAt: true, maxUses: true, role: { select: { name: true } } },
      });

      // Always log create
      try {
        await prisma.auditLog.create({
          data: {
            tenantId,
            userId: createdByUserId,
            action: "INVITE_CODE_CREATE",
            resource: "InviteCode",
            resourceId: created.id,
            ip,
            userAgent,
            metadata: {
              roleName: created.role.name,
              expiresAt: created.expiresAt.toISOString(),
              maxUses: created.maxUses,
              delivery: { wantSms, wantEmail },
              brand,
            } as any,
          },
        });
      } catch {}

      const base = getBaseUrl(req);
      const link = base
        ? `${base}/auth/signup?code=${encodeURIComponent(code)}&redirectTo=${encodeURIComponent(redirectTo)}`
        : "";

      const exp = created.expiresAt.toISOString().slice(0, 16).replace("T", " ");

      // ---- EMAIL (best-effort) ----
      let emailDelivery: any = null;
      if (wantEmail) {
        if (!deliverToEmailRaw || !isEmailLike(deliverToEmailRaw)) {
          emailDelivery = { ok: false, error: "BAD_EMAIL" };
        } else {
          const subject = `${schoolLabel}: ${created.role.name} onboarding code`;
          const text =
            `Hello${deliverToName ? ` ${deliverToName}` : ""},\n\n` +
            `You have received an EduLife OS onboarding code for ${schoolLabel}.\n\n` +
            `Role: ${created.role.name}\n` +
            `Code: ${code}\n` +
            `Expires: ${exp}\n\n` +
            (link ? `Signup link:\n${link}\n\n` : "") +
            `If you did not expect this, ignore this email.\n`;

          try {
            const r = await sendEmail({
              to: deliverToEmailRaw,
              subject,
              text,
              meta: { tenantId, inviteCodeId: created.id, roleName: created.role.name },
            });
            emailDelivery = r;
          } catch (e: any) {
            emailDelivery = { ok: false, error: String(e?.message || "EMAIL_FAILED") };
          }

          try {
            await prisma.auditLog.create({
              data: {
                tenantId,
                userId: createdByUserId,
                action: emailDelivery?.ok ? "INVITE_CODE_EMAIL_SENT" : "INVITE_CODE_EMAIL_FAILED",
                resource: "InviteCode",
                resourceId: created.id,
                ip,
                userAgent,
                metadata: { to: deliverToEmailRaw, error: emailDelivery?.error ?? null } as any,
              },
            });
          } catch {}
        }
      }

      // ---- SMS (best-effort) ----
      let sms: any = null;
      if (wantSms) {
        const phoneNorm = normalizeGhPhoneE164(deliverToPhoneRaw);
        if (!phoneNorm) {
          sms = { ok: false, error: "BAD_PHONE" };
        } else {
          const smsText =
            `EduLifeOS - ${schoolLabel}\n` +
            `${created.role.name} code: ${code}\n` +
            `Expires: ${exp}\n` +
            (link ? `Link: ${link}` : "");

          // audit row (best-effort)
          try {
            await prisma.sMSSendAudit.create({
              data: {
                tenantId,
                toPhone: phoneNorm,
                template: "INVITE_CODE_DELIVERY",
                payload: {
                  inviteCodeId: created.id,
                  roleName: created.role.name,
                  deliverToName: deliverToName || null,
                  deliverToEmail: deliverToEmailRaw || null,
                  expiresAt: created.expiresAt.toISOString(),
                  redirectTo,
                  link: link || null,
                  brand,
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
              actorId: createdByUserId,
              meta: {
                category: "STAFF_INVITE_CODE",
                inviteCodeId: created.id,
                roleName: created.role.name,
                expiresAt: created.expiresAt.toISOString(),
              },
            });
            sms = { ok: true, to: phoneNorm, brand };
          } catch (e: any) {
            sms = { ok: false, to: phoneNorm, error: String(e?.message || "SMS_FAILED"), brand };
          }

          try {
            await prisma.auditLog.create({
              data: {
                tenantId,
                userId: createdByUserId,
                action: sms?.ok ? "INVITE_CODE_SMS_SENT" : "INVITE_CODE_SMS_FAILED",
                resource: "InviteCode",
                resourceId: created.id,
                ip,
                userAgent,
                metadata: { to: phoneNorm, brand, error: sms?.error ?? null } as any,
              },
            });
          } catch {}
        }
      }

      return json({
        ok: true,
        inviteCodeId: created.id,
        roleName: created.role.name,
        code,
        expiresAt: created.expiresAt.toISOString(),
        maxUses: created.maxUses,
        link: link || null,
        sms, // legacy field kept
        delivery: { sms, email: emailDelivery },
      });
    } catch (err: any) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") continue;
      console.error("invite-codes/create error:", err);
      return json({ ok: false, error: "FAILED_TO_CREATE" }, 500);
    }
  }

  return json({ ok: false, error: "FAILED_TO_GENERATE_UNIQUE_CODE" }, 500);
}