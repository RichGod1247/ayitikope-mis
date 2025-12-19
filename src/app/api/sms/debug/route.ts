// src/app/api/sms/debug/route.ts
import { NextResponse } from "next/server";
import { sendViaHubtel } from "@/lib/sms/hubtel";

/**
 * Debug SMS endpoint.
 *
 * POST /api/sms/debug
 * Body: { "to": "23324XXXXXXX", "message": "Hello", "from": "OptionalSender" }
 *
 * If "from" is omitted, "EduLife-OS" is used.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));

    const to: string | undefined = body?.to;
    const message: string | undefined = body?.message;
    const from: string = body?.from ?? "EduLife-OS";

    if (!to || !message) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Missing "to" or "message" in request body.',
          example: {
            to: "233242914353",
            message: "Test from EduLife OS",
          },
        },
        { status: 400 }
      );
    }

    const result = await sendViaHubtel({
      to,
      content: message,
      from,
    });

    return NextResponse.json({
      ok: true,
      from,
      to,
      message,
      providerResult: result,
    });
  } catch (error: any) {
    console.error("[SMS_DEBUG]", error);
    return NextResponse.json(
      {
        ok: false,
        error: error?.message ?? "Unknown error",
      },
      { status: 500 }
    );
  }
}
