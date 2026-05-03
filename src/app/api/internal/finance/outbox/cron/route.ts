// src/app/api/internal/finance/outbox/cron/route.ts
import { NextRequest, NextResponse } from "next/server";
import { FinanceOutboxEventType } from "@prisma/client";
import {
  getFinanceOutboxHealth,
  runFinanceOutboxWorker,
} from "@/lib/finance/outbox-worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    types: [FinanceOutboxEventType.SMS_RECEIPT],
  });

  const after = await getFinanceOutboxHealth();

  return jsonNoStore({
    ok: true,
    before,
    result,
    after,
  });
}

export async function GET(req: NextRequest) {
  return POST(req);
}