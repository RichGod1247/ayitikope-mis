// src/app/api/consent/campaign/send/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendViaHubtel, type BrandName } from "@/lib/sms/hubtel";
import { requireApiUserContext } from "@/lib/serverAuth";
import { effectiveRole } from "@/lib/roleRouting";
import {
  getSmsRecipients,
  type SmsRecipient,
  type SmsRecipientMode,
} from "@/lib/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_ROLES = new Set(["HEADTEACHER", "SCHOOL_ADMIN", "SUPERADMIN"]);

type RequestBody = {
  message?: string;
  mode?: SmsRecipientMode;
  tenantId?: string; // legacy: ignored
  brand?: string;
  actorId?: string; // legacy: ignored
};

function json(status: number, payload: unknown) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function cleanStr(v: unknown) {
  return String(v ?? "").trim();
}

function roleUpper(v: unknown): string {
  return effectiveRole(v).trim().toUpperCase();
}

function resolveBrand(v: unknown): BrandName {
  const raw = cleanStr(v).toUpperCase().replace(/\s+/g, "");
  if (raw === "AYITIKOPJHS") return "AYITIKOPJHS";
  if (raw === "AYITIKPRIM") return "AYITIKPRIM";
  if (raw === "AYITIADMIN") return "AYITIADMIN";
  return "EDULIFEOS";
}

export async function POST(req: NextRequest) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["HEADTEACHER", "SCHOOL_ADMIN", "SUPERADMIN"],
  });
  if (!auth.ok) return auth.res;

  const ctx = auth.ctx;

  const membership = await prisma.membership.findUnique({
    where: {
      userId_tenantId: {
        userId: ctx.userId,
        tenantId: ctx.tenantId,
      },
    },
    select: {
      status: true,
      role: { select: { name: true } },
    },
  });

  if (!membership || membership.status !== "ACTIVE") {
    return json(403, { ok: false, error: "FORBIDDEN" });
  }

  const roleName = roleUpper(membership.role?.name ?? ctx.roleName);
  if (!ALLOWED_ROLES.has(roleName)) {
    return json(403, { ok: false, error: "FORBIDDEN_ROLE" });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as RequestBody;

    const tenant = await prisma.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: { name: true },
    });

    const mode: SmsRecipientMode = body.mode ?? "initial";
    const brand = resolveBrand(body.brand);
    const actorId = ctx.userId;

    const message =
      cleanStr(body.message) ||
      `${tenant?.name ?? "School"} – EduLife OS consent campaign. Please reply 'OK' when you receive this message. – ICT Project Lead`;

    const recipients: SmsRecipient[] = await (getSmsRecipients as any)(mode, ctx.tenantId);

    if (!recipients.length) {
      return json(200, {
        ok: true,
        brand,
        mode,
        count: 0,
        successCount: 0,
        results: [],
        note: "No SMS recipients found for this tenant/mode.",
      });
    }

    const results: {
      recipient: string;
      to: string;
      ok: boolean;
      error?: string;
    }[] = [];

    for (const r of recipients) {
      if (!r.phone) {
        results.push({
          recipient: r.name,
          to: "",
          ok: false,
          error: "Recipient has no phone number.",
        });
        continue;
      }

      try {
        const res = await sendViaHubtel({
          to: r.phone,
          body: message,
          brand,
          tenantId: ctx.tenantId,
          actorId,
          meta: {
            purpose: "consent-campaign",
            recipientId: r.id,
            recipientName: r.name,
            mode,
          },
        });

        results.push({
          recipient: r.name,
          to: res.to,
          ok: true,
        });
      } catch (err: any) {
        results.push({
          recipient: r.name,
          to: r.phone,
          ok: false,
          error: err?.message ?? "Unknown error",
        });
      }
    }

    const successCount = results.filter((r) => r.ok).length;

    return json(200, {
      ok: successCount === results.length,
      brand,
      mode,
      count: results.length,
      successCount,
      results,
    });
  } catch (err: any) {
    console.error("[CONSENT_CAMPAIGN_SMS_ERROR]", err);
    return json(500, {
      ok: false,
      error: err?.message ?? "Failed to send consent campaign SMS.",
    });
  }
}