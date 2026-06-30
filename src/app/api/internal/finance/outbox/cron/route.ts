// src/app/api/internal/finance/outbox/cron/route.ts
import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { FinanceOutboxEventType } from "@prisma/client";
import {
  getFinanceOutboxHealth,
  runFinanceOutboxWorker,
} from "@/lib/finance/outbox-worker";
import {
  getPaystackRefundSyncHealth,
  runPaystackRefundSyncWorker,
} from "@/lib/finance/refund-sync-worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SAFE_CRON_TYPES: FinanceOutboxEventType[] = [
  FinanceOutboxEventType.SMS_RECEIPT,
  FinanceOutboxEventType.SMS_REFUND_NOTICE,
  FinanceOutboxEventType.SMS_ARREARS_NOTICE,
  FinanceOutboxEventType.SMS_RESULTS_RELEASE,
  FinanceOutboxEventType.SMS_MOCK_RESULTS_RELEASE,
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

function sha256(value: string) {
  return crypto.createHash("sha256").update(value).digest();
}

function safeEqual(a: string, b: string) {
  const left = sha256(a);
  const right = sha256(b);
  return crypto.timingSafeEqual(left, right);
}

function presentedSecrets(req: NextRequest) {
  const bearer = req.headers.get("authorization") ?? "";
  const token = bearer.startsWith("Bearer ") ? bearer.slice(7).trim() : "";

  const headerSecret =
    req.headers.get("x-finance-outbox-cron-secret")?.trim() ?? "";

  return [token, headerSecret].filter(Boolean);
}

function authorized(req: NextRequest) {
  const secret = process.env.FINANCE_OUTBOX_CRON_SECRET?.trim();

  if (!secret) {
    return {
      ok: false as const,
      reason: "CRON_SECRET_NOT_CONFIGURED",
    };
  }

  const candidates = presentedSecrets(req);

  if (candidates.length === 0) {
    return {
      ok: false as const,
      reason: "CRON_SECRET_REQUIRED",
    };
  }

  const matched = candidates.some((candidate) => safeEqual(candidate, secret));

  if (!matched) {
    return {
      ok: false as const,
      reason: "CRON_SECRET_INVALID",
    };
  }

  return {
    ok: true as const,
  };
}

function unauthorized(reason: string) {
  return jsonNoStore(
    {
      ok: false,
      error: "UNAUTHORIZED",
      reason,
    },
    401
  );
}

async function readOutboxHealth() {
  return getFinanceOutboxHealth({
    types: SAFE_CRON_TYPES,
  });
}

async function readCronHealth() {
  const [outbox, paystackRefundSync] = await Promise.all([
    readOutboxHealth(),
    getPaystackRefundSyncHealth({
      minAgeMinutes: 2,
    }),
  ]);

  return {
    outbox,
    paystackRefundSync,
  };
}

export async function GET(req: NextRequest) {
  const auth = authorized(req);

  if (!auth.ok) {
    return unauthorized(auth.reason);
  }

  const health = await readCronHealth();

  return jsonNoStore({
    ok: true,
    mode: "HEALTH_ONLY",
    message:
      "Finance cron is authorized and reachable. GET does not run workers. Use POST to execute.",
    checkedAt: new Date().toISOString(),
    safeTypes: SAFE_CRON_TYPES,
    health,
  });
}

export async function POST(req: NextRequest) {
  const auth = authorized(req);

  if (!auth.ok) {
    return unauthorized(auth.reason);
  }

  const before = await readCronHealth();

  const outboxFirstPass = await runFinanceOutboxWorker({
    workerId: "finance-outbox-cron:first-pass",
    limit: 25,
    types: SAFE_CRON_TYPES,
    staleProcessingAfterMinutes: 15,
  });

  const paystackRefundSync = await runPaystackRefundSyncWorker({
    workerId: "paystack-refund-sync-cron",
    limit: 20,
    minAgeMinutes: 2,
  });

  const outboxAfterRefundSync = await runFinanceOutboxWorker({
    workerId: "finance-outbox-cron:after-refund-sync",
    limit: 25,
    types: SAFE_CRON_TYPES,
    staleProcessingAfterMinutes: 15,
  });

  const after = await readCronHealth();

  return jsonNoStore({
    ok: true,
    mode: "WORKERS_EXECUTED",
    executedAt: new Date().toISOString(),
    safeTypes: SAFE_CRON_TYPES,
    before,
    result: {
      outboxFirstPass,
      paystackRefundSync,
      outboxAfterRefundSync,
    },
    after,
  });
}