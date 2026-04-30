// src/app/api/consent/campaign/send/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendSms } from "@/lib/sms";
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
const MAX_RECIPIENTS_PER_REQUEST = 300;

type RequestBody = {
  message?: string;
  mode?: SmsRecipientMode;
  tenantId?: string; // legacy: ignored, session tenant wins
  brand?: string; // legacy: ignored, EDULIFEOS wins
  actorId?: string; // legacy: ignored, session user wins
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

function resolveMode(v: unknown): SmsRecipientMode {
  const raw = cleanStr(v).toLowerCase();

  if (raw === "all") return "all" as SmsRecipientMode;
  if (raw === "initial") return "initial" as SmsRecipientMode;
  if (raw === "pending") return "pending" as SmsRecipientMode;
  if (raw === "reminder") return "reminder" as SmsRecipientMode;

  return "initial" as SmsRecipientMode;
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

  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return json(415, {
      ok: false,
      error: "CONTENT_TYPE_MUST_BE_JSON",
    });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as RequestBody;

    const tenant = await prisma.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: { name: true },
    });

    const mode = resolveMode(body.mode);
    const actorId = ctx.userId;

    const message =
      cleanStr(body.message) ||
      `${tenant?.name ?? "School"}: EduLife OS consent campaign. Please reply OK when you receive this message.`;

    if (message.length < 5) {
      return json(400, {
        ok: false,
        error: "Message is too short.",
      });
    }

    const recipients: SmsRecipient[] = await (
  getSmsRecipients as unknown as (
    mode: SmsRecipientMode,
    tenantId: string
  ) => Promise<SmsRecipient[]>
)(mode, ctx.tenantId);

    if (!recipients.length) {
      return json(200, {
        ok: true,
        brand: "EDULIFEOS",
        mode,
        count: 0,
        successCount: 0,
        failedCount: 0,
        results: [],
        note: "No SMS recipients found for this tenant/mode.",
      });
    }

    if (recipients.length > MAX_RECIPIENTS_PER_REQUEST) {
      return json(400, {
        ok: false,
        error: `Too many recipients in one request. Maximum is ${MAX_RECIPIENTS_PER_REQUEST}.`,
        count: recipients.length,
      });
    }

    const results: {
      recipient: string;
      recipientId?: string;
      to: string;
      ok: boolean;
      error?: string;
    }[] = [];

    for (const recipient of recipients) {
      if (!recipient.phone) {
        results.push({
          recipient: recipient.name,
          recipientId: recipient.id,
          to: "",
          ok: false,
          error: "Recipient has no phone number.",
        });
        continue;
      }

      try {
        const smsResult = await sendSms({
          tenantId: ctx.tenantId,
          actorId,
          to: recipient.phone,
          message,
          template: "CONSENT_CAMPAIGN",
          payload: {
            purpose: "consent-campaign",
            recipientId: recipient.id,
            recipientName: recipient.name,
            mode,
            brand: "EDULIFEOS",
          },
        });

        results.push({
          recipient: recipient.name,
          recipientId: recipient.id,
          to: smsResult.to ?? recipient.phone,
          ok: smsResult.ok,
          ...(smsResult.ok ? {} : { error: smsResult.error ?? "SMS was not accepted." }),
        });
      } catch (err) {
        results.push({
          recipient: recipient.name,
          recipientId: recipient.id,
          to: recipient.phone,
          ok: false,
          error: err instanceof Error ? err.message : "Unknown send error",
        });
      }
    }

    const successCount = results.filter((r) => r.ok).length;
    const failedCount = results.length - successCount;

    return json(200, {
      ok: failedCount === 0,
      brand: "EDULIFEOS",
      mode,
      count: results.length,
      successCount,
      failedCount,
      results,
    });
  } catch (err) {
    console.error("[CONSENT_CAMPAIGN_SMS_ERROR]", err);

    return json(500, {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : "Failed to send consent campaign SMS.",
    });
  }
}