// src/app/api/admin/super/tenants/reject/route.ts
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
  const reason = String(body.reason || "").trim();

  if (!tenantId) return json({ ok: false, error: "TENANT_ID_REQUIRED" }, 400);
  if (!reason) return json({ ok: false, error: "REASON_REQUIRED" }, 400);

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
  if (t.status !== "PENDING") return json({ ok: false, error: "NOT_PENDING" }, 409);

  const nowIso = new Date().toISOString();
  const base = asObj(t.settingsJson);

  // clear approve markers; set reject markers
  const nextSettings = { ...base };
  delete nextSettings.bootstrapApprovedAt;
  delete nextSettings.bootstrapApprovedByUserId;

  nextSettings.bootstrapRejectedAt = nowIso;
  nextSettings.bootstrapRejectedByUserId = auth.ctx.userId;
  nextSettings.bootstrapRejectReason = reason;

  await prisma.tenant.update({
    where: { id: tenantId },
    data: { settingsJson: nextSettings as any },
  });

  // Best-effort notifications (do not block)
  const delivery: any = { email: null, sms: null };

  if (t.contactEmail) {
    delivery.email = await sendEmail({
      to: t.contactEmail,
      subject: `EduLife OS: Enrollment rejected (${t.schoolCode})`,
      text:
        `Hello,\n\n` +
        `Your school enrollment was rejected.\n\n` +
        `School: ${t.name}\n` +
        `School Code: ${t.schoolCode}\n` +
        `Reason: ${reason}\n\n` +
        `If this is unexpected, contact EduLife OS support.\n`,
    });
  }

  if (t.contactPhoneNorm) {
    try {
      await sendViaHubtel({
        to: t.contactPhoneNorm,
        body:
          `EduLifeOS\n` +
          `Enrollment REJECTED\n` +
          `Code: ${t.schoolCode}\n` +
          `Reason: ${reason}`,
        brand: "AYITIADMIN",
        tenantId: undefined,
        actorId: auth.ctx.userId,
        meta: { category: "TENANT_REJECTED", tenantId, schoolCode: t.schoolCode },
      });
      delivery.sms = { ok: true, to: t.contactPhoneNorm };
    } catch (e: any) {
      delivery.sms = { ok: false, to: t.contactPhoneNorm, error: String(e?.message || "SMS_FAILED") };
    }
  }

  // audit
  try {
    await prisma.auditLog.create({
      data: {
        userId: auth.ctx.userId,
        action: "TENANT_REJECTED",
        resource: "Tenant",
        resourceId: tenantId,
        ip: getIpFromHeaders(req.headers),
        userAgent: getUserAgentFromHeaders(req.headers),
        metadata: { reason } as any,
      },
    });
  } catch {}

  return json({ ok: true, delivery });
}