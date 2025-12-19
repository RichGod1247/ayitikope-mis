// src/app/api/admin/sms/broadcast/route.ts

import { NextResponse } from "next/server";
import { getSmsRecipients } from "@/lib/notifications";
import { sendViaHubtel, BrandName } from "@/lib/sms/hubtel";

type Mode = "initial" | "full";

function resolveMode(input?: string): Mode {
  if (!input) return "initial";
  return input === "full" ? "full" : "initial";
}

function resolveBrand(input?: string): string {
  if (!input) return "AYITIADMIN";
  const upper = input.toUpperCase();
  if (BrandName.includes(upper as (typeof BrandName)[number])) {
    return upper;
  }
  return "AYITIADMIN";
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      message?: string;
      brand?: string;
      mode?: Mode;
    };

    const message = (body.message ?? "").trim();
    if (!message) {
      return NextResponse.json(
        { ok: false, error: "Message body is required." },
        { status: 400 }
      );
    }

    const mode = resolveMode(body.mode);
    const brand = resolveBrand(body.brand);

    // Get recipients from our notification contacts helper
    const recipients = await getSmsRecipients(mode);

    if (!recipients.length) {
      return NextResponse.json(
        {
          ok: false,
          error: "No recipients found. Check notification contacts.",
        },
        { status: 400 }
      );
    }

    const results: {
      recipient: string;
      to: string;
      ok: boolean;
      error?: string;
    }[] = [];

    let successCount = 0;

    for (const r of recipients) {
      const rawPhone = (r as any).phone ?? "";

      if (!rawPhone) {
        results.push({
          recipient: r.name,
          to: "",
          ok: false,
          error: "Missing phone on recipient.",
        });
        continue;
      }

      try {
        const res = await sendViaHubtel({
          to: rawPhone,
          body: message,
          brand,
          meta: {
            purpose: "admin-broadcast",
            mode,
            recipientId: (r as any).id ?? null,
            recipientName: r.name,
          },
        });

        results.push({
          recipient: r.name,
          to: res.to,
          ok: true,
        });
        successCount += 1;
      } catch (err: any) {
        console.error("[SMS_BROADCAST_ERROR]", r.name, err);
        results.push({
          recipient: r.name,
          to: rawPhone,
          ok: false,
          error: err?.message ?? "Unknown SMS send error",
        });
      }
    }

    return NextResponse.json({
      ok: true,
      mode,
      brand,
      count: recipients.length,
      successCount,
      results,
    });
  } catch (err: any) {
    console.error("[SMS_BROADCAST_FATAL]", err);
    return NextResponse.json(
      {
        ok: false,
        error:
          err?.message ??
          "Unexpected error while sending broadcast SMS campaign.",
      },
      { status: 500 }
    );
  }
}
