// src/app/api/admin/super/tenants/approve/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import { getIpFromHeaders, getUserAgentFromHeaders } from "@/lib/rateLimit";
import { sendEmail } from "@/lib/email/sendEmail";
import { sendViaHubtel } from "@/lib/sms/hubtel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function asObj(v: unknown): Record<string, any> {
  return v && typeof v === "object" ? (v as any) : {};
}

export async function POST(req: NextRequest) {
  const auth = await requireApiUserContext(req, { requireTenant: false, requireRoleNames: ["SUPERADMIN"] });
  if (!auth.ok) return auth.res;

  const body = await req.json().catch(() => ({} as any));
  const tenantId = String(body.tenantId || "").trim();
  if (!tenantId) return json({ ok: false, error: "TENANT_ID_REQUIRED" }, 400);

  const t = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      id: true,
      name: true,
      schoolCode: true,
      status: true,
      settingsJson: true,
      contactEmail: true,
      contactPhoneNorm: true,
    },
  });

  if (!t) return json({ ok: false, error: "NOT_FOUND" }, 404);
  if (t.status !== "PENDING") return json({ ok: false, error: "NOT_FOUND_OR_ALREADY_ACTIVE" }, 404);

  const nowIso = new Date().toISOString();
  const base = asObj(t.settingsJson);

  const nextSettings = { ...base };
  delete nextSettings.bootstrapRejectedAt;
  delete nextSettings.bootstrapRejectedByUserId;
  delete nextSettings.bootstrapRejectReason;

  nextSettings.bootstrapApprovedAt = nowIso;
  nextSettings.bootstrapApprovedByUserId = auth.ctx.userId;

  await prisma.$transaction(async (tx) => {
    await tx.tenant.update({
      where: { id: tenantId },
      data: { status: "ACTIVE", settingsJson: nextSettings as any },
    });

    try {
      await tx.auditLog.create({
        data: {
          userId: auth.ctx.userId,
          action: "TENANT_APPROVED",
          resource: "Tenant",
          resourceId: tenantId,
          ip: getIpFromHeaders(req.headers),
          userAgent: getUserAgentFromHeaders(req.headers),
          metadata: {} as any,
        },
      });
    } catch {}
  });

  const delivery: any = { email: null, sms: null };

  if (t.contactEmail) {
    delivery.email = await sendEmail({
      to: t.contactEmail,
      subject: `EduLife OS: School approved (${t.schoolCode})`,
      text:
        `Hello,\n\n` +
        `Your school is now approved and ACTIVE on EduLife OS.\n\n` +
        `School: ${t.name}\n` +
        `School Code: ${t.schoolCode}\n\n` +
        `You can sign in and continue setup.\n`,
    });
  }

  if (t.contactPhoneNorm) {
    try {
      await sendViaHubtel({
        to: t.contactPhoneNorm,
        body:
          `EduLifeOS\n` +
          `School APPROVED\n` +
          `Code: ${t.schoolCode}\n` +
          `You can sign in now.`,
        brand: "EDULIFEOS",
        tenantId: undefined,
        actorId: auth.ctx.userId,
        meta: { category: "TENANT_APPROVED", tenantId, schoolCode: t.schoolCode },
      });
      delivery.sms = { ok: true, to: t.contactPhoneNorm, brand: "EDULIFEOS" };
    } catch (e: any) {
      delivery.sms = { ok: false, to: t.contactPhoneNorm, error: String(e?.message || "SMS_FAILED"), brand: "EDULIFEOS" };
    }
  }

  return json({ ok: true, delivery });
}