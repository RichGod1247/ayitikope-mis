// src/app/api/sms/selftest/route.ts

import { NextResponse } from "next/server";
import { sendViaHubtel, BrandName } from "@/lib/sms/hubtel";

type SelfTestOptions = {
  to?: string;
  brand?: string;
};

function resolveBrand(input?: string): string {
  if (!input) return "AYITIADMIN";
  const upper = input.toUpperCase();
  if (BrandName.includes(upper as (typeof BrandName)[number])) {
    return upper;
  }
  return "AYITIADMIN";
}

async function runSelfTest(opts: SelfTestOptions) {
  const brand = resolveBrand(opts.brand);
  const envTo = process.env.TEST_SMS_TO ?? "";
  const target = opts.to ?? envTo;

  if (!target) {
    throw new Error(
      "No TEST_SMS_TO configured and no 'to' provided in request."
    );
  }

  const result = await sendViaHubtel({
    to: target,
    body: `EduLife OS SMS Self-Test (${brand})`,
    brand,
    meta: {
      purpose: "sms-selftest",
      requestedTo: opts.to ?? null,
    },
  });

  return {
    ok: true,
    brand: result.brand,
    from: result.from,
    to: result.to,
    testMode: result.testMode,
    providerResponse: result.providerResponse,
  };
}

// Allow testing via browser (GET)
export async function GET() {
  try {
    const payload = await runSelfTest({});
    return NextResponse.json(payload, { status: 200 });
  } catch (err: any) {
    console.error("[SMS_SELFTEST_GET_ERROR]", err);
    return NextResponse.json(
      {
        ok: false,
        error: err?.message ?? "Unknown error running SMS self-test (GET).",
      },
      { status: 500 }
    );
  }
}

// Allow testing via tools like Thunder Client / POST with JSON body
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      to?: string;
      brand?: string;
    };

    const payload = await runSelfTest({
      to: body.to,
      brand: body.brand,
    });

    return NextResponse.json(payload, { status: 200 });
  } catch (err: any) {
    console.error("[SMS_SELFTEST_POST_ERROR]", err);
    return NextResponse.json(
      {
        ok: false,
        error: err?.message ?? "Unknown error running SMS self-test (POST).",
      },
      { status: 500 }
    );
  }
}
