// src/app/api/internal/finance/outbox/cron/route.ts
import { NextRequest, NextResponse } from "next/server";
import { FinanceOutboxEventType } from "@prisma/client";
import {
  getFinanceOutboxHealth,
  runFinanceOutboxWorker,
} from "@/lib/finance/outbox-worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SAFE_CRON_TYPES: FinanceOutboxEventType[] = [
  FinanceOutboxEventType.SMS_RECEIPT,
  FinanceOutboxEventType.SMS_REFUND_NOTICE,
  FinanceOutboxEventType.SMS_ARREARS_NOTICE,
  FinanceOutboxEventType.SMS_RESULTS_RELEASE,
  FinanceOutboxEventType.PAYSTACK_WEBHOOK_CHARGE_SUCCESS,
];

function jsonNoStore(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function authorized(req: NextRequest) {
  const secret = process.env.FINANCE_OUTBOX_CRON_SECRET?.trim();
  if (!secret) return false;

  const bearer = req.headers.get("authorization") ?? "";
  const token = bearer.startsWith("Bearer ") ? bearer.slice(7).trim() : "";

  const headerSecret = req.headers.get("x-finance-outbox-cron-secret")?.trim();

  return token === secret || headerSecret === secret;
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return jsonNoStore({ ok: false, error: "UNAUTHORIZED" }, 401);
  }

  const before = await getFinanceOutboxHealth();

  const result = await runFinanceOutboxWorker({
    workerId: "finance-outbox-cron",
    limit: 25,
    types: SAFE_CRON_TYPES,
  });

  const after = await getFinanceOutboxHealth();

  return jsonNoStore({
    ok: true,
    before,
    result,
    after,
    safeTypes: SAFE_CRON_TYPES,
  });
}

export async function GET(req: NextRequest) {
  return POST(req);
}