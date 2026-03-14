// src/app/api/tenants/[tenantId]/onboarding/rotate/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateOnboardingCode, hashOnboardingCode } from "@/lib/onboardingCode";
import { writeAuditLog } from "@/lib/audit";
import { requireApiUserContext } from "@/lib/serverAuth";
import { effectiveRole } from "@/lib/roleRouting";
import { normalizeGhPhoneE164 } from "@/lib/phoneNormGH";
import { sendViaHubtel } from "@/lib/sms/hubtel";
import { sendEmail } from "@/lib/email/sendEmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ONBOARDING_BRAND = "EDULIFEOS" as const;

function json(status: number, payload: any) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function getIp(req: Request) {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() || null;
  return req.headers.get("x-real-ip") || null;
}

function isAdminishRole(roleName: string | null) {
  const r = effectiveRole(roleName);
  return r === "SCHOOL_ADMIN" || r === "SUPERADMIN" || r === "HEADTEACHER";
}

function clampInt(n: unknown, def: number, min: number, max: number) {
  const x = Number(n);
  if (!Number.isFinite(x)) return def;
  return Math.min(max, Math.max(min, Math.trunc(x)));
}

function getBaseUrl(req: Request) {
  const envBase =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXTAUTH_URL ||
    process.env.APP_URL ||
    "";

  const base = String(envBase || "").trim().replace(/\/+$/, "");
  if (base) return base;

  if (process.env.NODE_ENV === "production") return "";

  const h = req.headers;
  const proto = (h.get("x-forwarded-proto") || "http").split(",")[0]?.trim() || "http";
  const host = (h.get("x-forwarded-host") || h.get("host") || "").split(",")[0]?.trim() || "";
  if (host) return `${proto}://${host}`.replace(/\/+$/, "");

  return "http://127.0.0.1:3000";
}

export async function POST(req: Request, { params }: { params: { tenantId: string } }) {
  const auth = await requireApiUserContext(req, { requireTenant: true });
  if (!auth.ok) return auth.res;
  const { ctx } = auth;

  const paramTenantId = String(params?.tenantId ?? "").trim();
  if (paramTenantId && paramTenantId !== ctx.tenantId) {
    return json(403, { ok: false, error: "FORBIDDEN_TENANT_MISMATCH" });
  }

  if (!isAdminishRole(ctx.roleName)) {
    return json(403, { ok: false, error: "FORBIDDEN" });
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: ctx.tenantId },
    select: { status: true, name: true },
  });
  if (!tenant) return json(403, { ok: false, error: "FORBIDDEN" });
  if (String(tenant.status) !== "ACTIVE") {
    return json(409, { ok: false, error: "TENANT_NOT_ACTIVE" });
  }

  try {
    const code = generateOnboardingCode("EDU");
    const codeHash = await hashOnboardingCode(code);

    const ttlMinutes = clampInt(process.env.ONBOARDING_CODE_TTL_MINUTES ?? 15, 15, 5, 60);
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

    const ip = getIp(req);
    const userAgent = req.headers.get("user-agent");

    let rotatedRowId: string | null = null;

    await prisma.$transaction(async (tx) => {
      await tx.tenantOnboardingCode.updateMany({
        where: { tenantId: ctx.tenantId, active: true },
        data: { active: false },
      });

      const row = await tx.tenantOnboardingCode.create({
        data: {
          tenantId: ctx.tenantId,
          codeHash,
          active: true,
          rotatedAt: new Date(),
          expiresAt,
        },
        select: { id: true },
      });

      rotatedRowId = row.id;

      await writeAuditLog({
        action: "ONBOARDING_CODE_ROTATED",
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        resource: "TenantOnboardingCode",
        resourceId: row.id,
        metadata: { ttlMinutes },
        ip,
        userAgent,
      });
    });

    const contacts = await prisma.notificationContact.findMany({
      where: { tenantId: ctx.tenantId, isActive: true },
      select: { id: true, name: true, phone: true, email: true },
      orderBy: { createdAt: "asc" },
    });

    const base = getBaseUrl(req);
    const link = base
      ? `${base}/auth/signup?tenantId=${encodeURIComponent(ctx.tenantId)}&onboardingCode=${encodeURIComponent(code)}`
      : "";

    const exp = expiresAt.toISOString().slice(0, 16).replace("T", " ");

    const smsText =
      `EduLifeOS - ${tenant.name}\n` +
      `Teacher onboarding code: ${code}\n` +
      `Expires in ${ttlMinutes} minutes (${exp})\n` +
      (link ? `Signup: ${link}` : "");

    const emailText =
      `Hello,\n\n` +
      `EduLife OS onboarding code for ${tenant.name}:\n\n` +
      `Code: ${code}\n` +
      `Expires in ${ttlMinutes} minutes (${exp}).\n\n` +
      (link ? `Signup link:\n${link}\n\n` : "") +
      `If you did not expect this, ignore this message.`;

    const deliveries: any[] = [];

    for (const c of contacts) {
      const phoneNorm = normalizeGhPhoneE164(String(c.phone ?? "").trim());
      if (phoneNorm) {
        try {
          try {
            await prisma.sMSSendAudit.create({
              data: {
                tenantId: ctx.tenantId,
                toPhone: phoneNorm,
                template: "TENANT_ONBOARDING_ROTATED",
                payload: {
                  tenantOnboardingCodeId: rotatedRowId,
                  contactId: c.id,
                  contactName: c.name,
                  expiresAt: expiresAt.toISOString(),
                  ttlMinutes,
                  link: link || null,
                  brand: ONBOARDING_BRAND,
                },
              },
            });
          } catch {}

          await sendViaHubtel({
            to: phoneNorm,
            body: smsText,
            brand: ONBOARDING_BRAND,
            tenantId: ctx.tenantId,
            actorId: ctx.userId,
            meta: {
              category: "TENANT_ONBOARDING_CODE",
              tenantOnboardingCodeId: rotatedRowId,
              contactId: c.id,
              expiresAt: expiresAt.toISOString(),
            },
          });

          deliveries.push({ contactId: c.id, name: c.name, sms: { ok: true, to: phoneNorm, brand: ONBOARDING_BRAND } });
        } catch (e: any) {
          deliveries.push({
            contactId: c.id,
            name: c.name,
            sms: { ok: false, to: phoneNorm, error: String(e?.message || "SMS_FAILED"), brand: ONBOARDING_BRAND },
          });
        }
      } else {
        deliveries.push({ contactId: c.id, name: c.name, sms: { ok: false, error: "BAD_PHONE", brand: ONBOARDING_BRAND } });
      }

      const email = String(c.email ?? "").trim();
      if (email && email.includes("@")) {
        const r = await sendEmail({
          to: email,
          subject: `${tenant.name}: EduLife OS onboarding code`,
          text: emailText,
        });
        deliveries[deliveries.length - 1].email = r;
      }
    }

    return json(200, {
      ok: true,
      tenantId: ctx.tenantId,
      code,
      expiresAt,
      ttlMinutes,
      brand: ONBOARDING_BRAND,
      contactsCount: contacts.length,
      deliveredToCount: deliveries.filter((d) => d?.sms?.ok || d?.email?.ok).length,
      deliveries,
      warning: contacts.length === 0 ? "NO_NOTIFICATION_CONTACTS_CONFIGURED" : null,
    });
  } catch (err) {
    console.error("onboarding/rotate error:", err);
    return json(500, { ok: false, error: "FAILED_TO_ROTATE" });
  }
}