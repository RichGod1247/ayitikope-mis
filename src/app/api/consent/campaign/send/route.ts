// src/app/api/consent/campaign/send/route.ts

import { NextResponse } from "next/server";
import { sendViaHubtel } from "@/lib/sms/hubtel";
import {
  getSmsRecipients,
  SmsRecipientMode,
  type SmsRecipient,
} from "@/lib/notifications";

type RequestBody = {
  message?: string;
  mode?: SmsRecipientMode;
  tenantId?: string;
  brand?: string;
  actorId?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as RequestBody;

    // Default message if none is provided
    const message =
      body.message ??
      "Ayitikope M/A Basic School – EduLife OS pilot test. Please reply 'OK' when you receive this. – ICT Project Lead";

    const mode: SmsRecipientMode = body.mode ?? "initial";
    const tenantId = body.tenantId ?? "AYITIKOPE-DEV";
    const brand = body.brand ?? "AYITIADMIN";
    const actorId = body.actorId ?? "teacher-consent-campaign";

    // Use the shared notifications helper:
    // - mode "initial" => first 5 active contacts (pilot)
    // - mode "full"    => all active contacts
    const recipients: SmsRecipient[] = await getSmsRecipients(mode);

    if (!recipients.length) {
      return NextResponse.json(
        {
          ok: true,
          mode,
          count: 0,
          successCount: 0,
          results: [],
          note: "No SMS recipients found for this mode.",
        },
        { status: 200 }
      );
    }

    const results = await Promise.all(
      recipients.map(async (r) => {
        if (!r.phone) {
          return {
            recipient: r.name,
            to: "",
            ok: false as const,
            error: "Recipient has no phone number.",
          };
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

          return {
            recipient: r.name,
            to: res.to,
            ok: true as const,
          };
        } catch (err: any) {
          return {
            recipient: r.name,
            to: r.phone,
            ok: false as const,
            error: err?.message ?? "Unknown error",
          };
        }
      })
    );

    const successCount = results.filter((r) => r.ok).length;

    return NextResponse.json(
      {
        ok: successCount === results.length,
        mode,
        count: results.length,
        successCount,
        results,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("[CONSENT_CAMPAIGN_SMS_ERROR]", err);

    return NextResponse.json(
      {
        ok: false,
        error:
          err?.message ?? "Failed to send teacher consent campaign SMS.",
      },
      { status: 500 }
    );
  }
}
