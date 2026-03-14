// src/app/api/debug/sms-test/route.ts

import { NextResponse } from "next/server";
import { getSmsRecipients } from "@/lib/notifications";
import { sendViaHubtel } from "@/lib/sms/hubtel";

type Mode = "initial" | "full";

function parseModeFromRequest(request: Request): Mode {
  const url = new URL(request.url);
  const modeParam = url.searchParams.get("mode");
  return modeParam === "full" ? "full" : "initial";
}

export async function POST(request: Request) {
  const mode = parseModeFromRequest(request);

  const recipients = await getSmsRecipients(mode);

  const results: {
    recipient: string;
    to: string;
    ok: boolean;
    error?: string;
  }[] = [];

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
        body: `[EduLife OS] Debug SMS test to ${r.name} (${mode})`,
        brand: "EDULIFEOS",
        meta: {
          purpose: "debug-sms-test",
          recipientId: (r as any).id ?? null,
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
        to: rawPhone,
        ok: false,
        error: err?.message ?? "Unknown SMS send error",
      });
    }
  }

  return NextResponse.json({
    ok: true,
    mode,
    brand: "EDULIFEOS",
    count: recipients.length,
    results,
  });
}

export async function GET(request: Request) {
  return POST(request);
}