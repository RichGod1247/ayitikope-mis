// src/app/api/sms/debug/route.ts
import { NextResponse } from "next/server";
import { sendViaHubtel } from "@/lib/sms/hubtel";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));

    const to: string | undefined = body?.to;
    const message: string | undefined = body?.message;
    const brand: string | undefined = body?.brand; // optional

    if (!to || !message) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Missing "to" or "message" in request body.',
          example: { to: "233242914353", message: "Test from EduLife OS" },
        },
        { status: 400 }
      );
    }

    // ⚠️ Production: keep this route disabled by env in your deployment.
    const result = await sendViaHubtel({
      to,
      body: message,
      brand,
      meta: { source: "sms-debug" },
    });

    return NextResponse.json({ ok: true, to, body: message, providerResult: result });
  } catch (error: any) {
    console.error("[SMS_DEBUG]", error);
    return NextResponse.json({ ok: false, error: error?.message ?? "Unknown error" }, { status: 500 });
  }
}
