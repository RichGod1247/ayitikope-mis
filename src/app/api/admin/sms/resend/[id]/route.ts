// src/app/api/admin/sms/resend/[id]/route.ts

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendViaHubtel, BrandName } from "@/lib/sms/hubtel";

function resolveBrandFromLog(logBrand?: string | null): string {
  if (!logBrand) return "AYITIADMIN";
  const upper = logBrand.toUpperCase();
  if (BrandName.includes(upper as (typeof BrandName)[number])) {
    return upper;
  }
  return "AYITIADMIN";
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    // ✅ Next.js 15: params is now async – we must await it
    const { id } = await context.params;
    const idNum = Number.parseInt(id, 10);

    if (Number.isNaN(idNum)) {
      return NextResponse.json(
        { ok: false, error: "Invalid SMS log ID." },
        { status: 400 }
      );
    }

    // Use `any` to stay flexible with Prisma type
    const log = (await (prisma as any).smsLog.findUnique({
      where: { id: idNum },
    })) as any | null;

    if (!log) {
      return NextResponse.json(
        { ok: false, error: `SmsLog with id=${idNum} not found.` },
        { status: 404 }
      );
    }

    if (!log.to || !log.body) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "This log entry does not have both 'to' and 'body' fields, so it cannot be resent.",
        },
        { status: 400 }
      );
    }

    const brand = resolveBrandFromLog(log.brand);

    const originalMeta =
      log.meta ??
      log.providerMeta ??
      (log.providerRaw && log.providerRaw.meta) ??
      {};

    const mergedMeta = {
      ...(originalMeta || {}),
      purpose:
        (originalMeta && originalMeta.purpose) || "resend-from-log",
      resendOfId: Number(log.id ?? idNum), // store as normal number
    };

    const result = await sendViaHubtel({
      to: log.to,
      body: log.body,
      brand,
      meta: mergedMeta,
    });

    // ✅ Avoid sending BigInt to JSON – use plain number for resendOfId
    return NextResponse.json({
      ok: true,
      resendOfId: idNum,
      brand,
      to: result.to,
      providerResponse: result.providerResponse,
    });
  } catch (err: any) {
    console.error("[SMS_RESEND_FROM_LOG_ERROR]", err);
    return NextResponse.json(
      {
        ok: false,
        error:
          err?.message ??
          "Unexpected error while resending SMS from log entry.",
      },
      { status: 500 }
    );
  }
}
