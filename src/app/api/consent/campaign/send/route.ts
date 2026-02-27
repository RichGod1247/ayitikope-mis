// src/app/api/consent/campaign/send/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendViaHubtel } from "@/lib/sms/hubtel";
import { getServerUserContextOrNull } from "@/lib/serverAuth";
import { effectiveRole } from "@/lib/roleRouting";
import {
  getSmsRecipients,
  SmsRecipientMode,
  type SmsRecipient,
} from "@/lib/notifications";

type RequestBody = {
  message?: string;
  mode?: SmsRecipientMode;
  tenantId?: string; // legacy: ignored
  brand?: string;
  actorId?: string;  // legacy-ish: allowed but sanitized
};

function noStoreJson(data: any, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

function cleanStr(v: unknown) {
  return String(v ?? "").trim();
}

function cleanBrand(v: unknown) {
  // Hubtel sender IDs are typically short; keep it safe.
  const raw = cleanStr(v).toUpperCase();
  const safe = raw.replace(/[^A-Z0-9 _-]/g, "").trim();
  return safe.slice(0, 15);
}

async function requireAdminishCtx() {
  const base = await getServerUserContextOrNull({ requireTenant: true });
  if (!base) return { ok: false as const, resp: noStoreJson({ ok: false, error: "UNAUTHORIZED" }, 401) };

  const membership = await prisma.membership.findUnique({
    where: { userId_tenantId: { userId: base.userId, tenantId: base.tenantId } },
    select: { status: true, role: { select: { name: true } } },
  });

  if (!membership || membership.status !== "ACTIVE") {
    return { ok: false as const, resp: noStoreJson({ ok: false, error: "FORBIDDEN" }, 403) };
  }

  const role = effectiveRole(membership.role?.name);
  const allowed = [effectiveRole("HEADTEACHER"), effectiveRole("SCHOOL_ADMIN")];
  if (!allowed.includes(role)) {
    return { ok: false as const, resp: noStoreJson({ ok: false, error: "FORBIDDEN_ROLE" }, 403) };
  }

  return { ok: true as const, ctx: { userId: base.userId, tenantId: base.tenantId, role } };
}

export async function POST(request: Request) {
  const gate = await requireAdminishCtx();
  if (!gate.ok) return gate.resp;
  const { tenantId, userId } = gate.ctx;

  try {
    const body = (await request.json().catch(() => ({}))) as RequestBody;

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true },
    });

    const mode: SmsRecipientMode = body.mode ?? "initial";
    const brand = cleanBrand(body.brand) || "EDULIFE OS";
    const actorId = cleanStr(body.actorId) || userId;

    const message =
      cleanStr(body.message) ||
      `${tenant?.name ?? "School"} – EduLife OS pilot test. Please reply 'OK' when you receive this. – ICT Project Lead`;

    // IMPORTANT: recipients must be tenant-scoped.
    // This call is written to be backward compatible whether the helper accepts 1 or 2 args.
    const recipients: SmsRecipient[] = await (getSmsRecipients as any)(mode, tenantId);

    if (!recipients.length) {
      return noStoreJson(
        {
          ok: true,
          mode,
          count: 0,
          successCount: 0,
          results: [],
          note: "No SMS recipients found for this tenant/mode.",
        },
        200
      );
    }

    const results = await Promise.all(
      recipients.map(async (r) => {
        if (!r.phone) {
          return { recipient: r.name, to: "", ok: false as const, error: "Recipient has no phone number." };
        }

        try {
          const res = await sendViaHubtel({
            to: r.phone,
            body: message,
            brand,
            tenantId,
            actorId,
            meta: {
              purpose: "teacher_consent_campaign",
              contactId: r.id,
              contactName: r.name,
              mode,
            },
          });

          return { recipient: r.name, to: res.to, ok: true as const };
        } catch (err: any) {
          return { recipient: r.name, to: r.phone, ok: false as const, error: err?.message ?? "Unknown error" };
        }
      })
    );

    const successCount = results.filter((r) => r.ok).length;

    return noStoreJson(
      { ok: successCount === results.length, mode, count: results.length, successCount, results },
      200
    );
  } catch (err: any) {
    console.error("[CONSENT_CAMPAIGN_SMS_ERROR]", err);
    return noStoreJson(
      { ok: false, error: err?.message ?? "Failed to send teacher consent campaign SMS." },
      500
    );
  }
}
