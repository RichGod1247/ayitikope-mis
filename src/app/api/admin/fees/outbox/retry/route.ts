// src/app/api/admin/fees/outbox/retry/route.ts
import { NextRequest, NextResponse } from "next/server";
import { FinanceOutboxEventType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import { retryFinanceOutboxEvent } from "@/lib/finance/outbox";
import { runFinanceOutboxWorker } from "@/lib/finance/outbox-worker";

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

export async function POST(req: NextRequest) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["SCHOOL_ADMIN", "ADMIN", "SUPERADMIN"],
  });

  if (!auth.ok) return auth.res;

  const body = await req.json().catch(() => ({}));
  const eventId = String(body.eventId ?? "").trim();

  if (!eventId) {
    return jsonNoStore({ ok: false, error: "EVENT_ID_REQUIRED" }, 400);
  }

  const event = await prisma.financeOutboxEvent.findFirst({
    where: {
      id: eventId,
      tenantId: auth.ctx.tenantId,
      type: FinanceOutboxEventType.SMS_RECEIPT,
    },
    select: {
      id: true,
      status: true,
    },
  });

  if (!event) {
    return jsonNoStore({ ok: false, error: "OUTBOX_EVENT_NOT_FOUND" }, 404);
  }

  if (event.status === "COMPLETED" || event.status === "CANCELLED") {
    return jsonNoStore(
      { ok: false, error: `CANNOT_RETRY_${event.status}` },
      409
    );
  }

  await retryFinanceOutboxEvent(event.id);

  const dispatch = await runFinanceOutboxWorker({
    workerId: `admin-outbox-retry:${auth.ctx.userId}`,
    limit: 5,
    types: [FinanceOutboxEventType.SMS_RECEIPT],
  });

  return jsonNoStore({
    ok: true,
    dispatch,
  });
}