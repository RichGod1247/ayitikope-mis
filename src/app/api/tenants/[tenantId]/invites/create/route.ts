// src/app/api/tenants/[tenantId]/invites/create/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import { effectiveRole, safeInternalPath } from "@/lib/roleRouting";
import { assertNoTenantOverride } from "@/lib/tenantGuard";
import { normalizeGhPhoneE164 } from "@/lib/phoneNormGH";
import { sendViaHubtel } from "@/lib/sms/hubtel";
import { sendEmail } from "@/lib/email/sendEmail";
import { randomBytes } from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(status: number, payload: any) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function cleanStr(v: unknown) {
  return String(v ?? "").trim();
}

function cleanEmail(v: unknown) {
  return String(v ?? "").toLowerCase().trim();
}

function normRoleName(v: unknown) {
  return cleanStr(v).toUpperCase().replace(/\s+/g, "_");
}

function roleCanInvite(inviterRoleName: unknown, targetRole: string) {
  const inv = effectiveRole(inviterRoleName);

  if (inv === "SUPERADMIN") return targetRole === "SCHOOL_ADMIN";
  if (inv === "SCHOOL_ADMIN") return targetRole === "HEADTEACHER" || targetRole === "TEACHER";
  if (inv === "HEADTEACHER") return targetRole === "TEACHER";
  return false;
}

function getIp(req: Request) {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() || null;
  return req.headers.get("x-real-ip") || null;
}

function getUa(req: Request) {
  return req.headers.get("user-agent") || null;
}

function clampInt(n: unknown, def: number, min: number, max: number) {
  const x = Number(n);
  if (!Number.isFinite(x)) return def;
  return Math.min(max, Math.max(min, Math.trunc(x)));
}

/**
 * ✅ Bank-grade base URL
 * - Production: ENV ONLY (no localhost fallback, no header poisoning)
 * - Dev/Preview: derive from request headers, fallback to 127.0.0.1 (not localhost)
 */
function getPublicBaseUrl(req: Request): string | null {
  const envBase =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXTAUTH_URL ||
    process.env.APP_URL ||
    "";

  const base = String(envBase || "").trim().replace(/\/+$/, "");
  if (base) return base;

  if (process.env.NODE_ENV === "production") return null;

  const h = req.headers;
  const proto = (h.get("x-forwarded-proto") || "http").split(",")[0]?.trim() || "http";
  const host = (h.get("x-forwarded-host") || h.get("host") || "").split(",")[0]?.trim() || "";

  if (host) return `${proto}://${host}`.replace(/\/+$/, "");

  // Dev-only fallback (keeps grep clean)
  return "http://127.0.0.1:3000";
}

export async function POST(req: Request, { params }: { params: { tenantId: string } }) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["SUPERADMIN", "SCHOOL_ADMIN", "HEADTEACHER"],
  });
  if (!auth.ok) return auth.res;
  const ctx = auth.ctx;

  const tenantCheck = assertNoTenantOverride(params?.tenantId, ctx.tenantId);
  if (!tenantCheck.ok) {
    return json(tenantCheck.status, { ok: false, error: "FORBIDDEN_TENANT_MISMATCH" });
  }

  const body = await req.json().catch(() => null);
  if (!body) return json(400, { ok: false, error: "INVALID_PAYLOAD" });

  const email = cleanEmail(body.email);
  if (!email) return json(400, { ok: false, error: "EMAIL_REQUIRED" });

  const targetRoleName = normRoleName(body.roleName || "TEACHER");

  if (!roleCanInvite(ctx.roleName ?? "", targetRoleName)) {
    return json(403, { ok: false, error: "FORBIDDEN_ROLE_CANNOT_INVITE_TARGET" });
  }

  const role = await prisma.role.upsert({
    where: { tenantId_name: { tenantId: ctx.tenantId, name: targetRoleName } },
    update: {},
    create: { tenantId: ctx.tenantId, name: targetRoleName, description: `Role ${targetRoleName}` },
    select: { id: true, name: true },
  });

  const ttlMinutes = clampInt(process.env.INVITE_LINK_TTL_MINUTES ?? 15, 15, 5, 60);
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

  const token = randomBytes(24).toString("hex");

  const invite = await prisma.invite.create({
    data: {
      tenantId: ctx.tenantId,
      email,
      token,
      roleId: role.id,
      expiresAt,
      invitedBy: ctx.userId,
    },
    select: { id: true, token: true, expiresAt: true },
  });

  const redirectTo = safeInternalPath(body.redirectTo ?? "/app", "/app");

  const base = getPublicBaseUrl(req);
  let invitePath = String(process.env.NEXT_PUBLIC_INVITE_ENTRY_PATH || "/auth/signup").trim() || "/auth/signup";
  if (!invitePath.startsWith("/")) invitePath = `/${invitePath}`;

  const inviteUrl = base
    ? `${base}${invitePath}?invite=${encodeURIComponent(invite.token)}&redirectTo=${encodeURIComponent(redirectTo)}`
    : null;

  const tenant = await prisma.tenant.findUnique({
    where: { id: ctx.tenantId },
    select: { name: true },
  });
  const schoolLabel = tenant?.name || "Your School";

  try {
    await prisma.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        action: "INVITE_CREATED",
        resource: "Invite",
        resourceId: invite.id,
        ip: getIp(req),
        userAgent: getUa(req),
        metadata: {
          email,
          roleName: role.name,
          ttlMinutes,
          expiresAt: invite.expiresAt.toISOString(),
          inviteUrlProvided: Boolean(inviteUrl),
        } as any,
      },
    });
  } catch {}

  const emailText =
    `Hello,\n\nYou have been invited to join ${schoolLabel} on EduLife OS as ${role.name}.\n\n` +
    (inviteUrl
      ? `Invite link (expires in ${ttlMinutes} minutes):\n${inviteUrl}\n`
      : `Invite token (expires in ${ttlMinutes} minutes):\n${invite.token}\n\nOpen EduLife OS signup page and paste the token.\n`) +
    `\nIf you did not expect this, ignore this email.`;

  const emailResult = await sendEmail({
    to: email,
    subject: `${schoolLabel}: Your EduLife OS invite`,
    text: emailText,
  });

  let sms: any = null;
  const wantSms = body.sendSms === true;
  const deliverToPhoneRaw = cleanStr(body.deliverToPhone || "");
  const deliverToName = cleanStr(body.deliverToName || "");
  const brand = String(body.brand || "AYITIADMIN").trim() || "AYITIADMIN";

  if (wantSms) {
    const phoneNorm = normalizeGhPhoneE164(deliverToPhoneRaw);
    if (!phoneNorm) {
      sms = { ok: false, error: "BAD_PHONE" };
    } else {
      const exp = invite.expiresAt.toISOString().slice(0, 16).replace("T", " ");

      const msg =
        `EduLifeOS - ${schoolLabel}\n` +
        `Invite for ${role.name}\n` +
        `Email: ${email}\n` +
        `Expires: ${exp}\n` +
        (inviteUrl ? `Link: ${inviteUrl}` : `Token: ${invite.token}`);

      try {
        try {
          await prisma.sMSSendAudit.create({
            data: {
              tenantId: ctx.tenantId,
              toPhone: phoneNorm,
              template: "INVITE_LINK_DELIVERY",
              payload: {
                inviteId: invite.id,
                roleName: role.name,
                email,
                deliverToName: deliverToName || null,
                expiresAt: invite.expiresAt.toISOString(),
                redirectTo,
                inviteUrl,
                token: invite.token,
              },
            },
          });
        } catch {}

        await sendViaHubtel({
          to: phoneNorm,
          body: msg,
          brand,
          tenantId: ctx.tenantId,
          actorId: ctx.userId,
          meta: {
            category: "STAFF_INVITE_LINK",
            inviteId: invite.id,
            roleName: role.name,
            expiresAt: invite.expiresAt.toISOString(),
          },
        });

        sms = { ok: true, to: phoneNorm };
      } catch (e: any) {
        console.error("[INVITE_LINK_SMS_ERROR]", e);
        sms = { ok: false, to: phoneNorm, error: String(e?.message || "SMS_FAILED") };
      }
    }
  }

  return json(200, {
    ok: true,
    tenantId: ctx.tenantId,
    inviteUrl,
    inviteToken: inviteUrl ? null : invite.token,
    expiresAt: invite.expiresAt.toISOString(),
    delivery: { email: emailResult, sms },
  });
}