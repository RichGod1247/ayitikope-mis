// src/app/api/admin/fees/outbox/run/route.ts
import { NextRequest, NextResponse } from "next/server";
import { FinanceOutboxEventType } from "@prisma/client";
import { requireApiUserContext } from "@/lib/serverAuth";
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

export async function POST(req: NextRequest) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["SCHOOL_ADMIN", "ADMIN", "SUPERADMIN"],
  });

  if (!auth.ok) return auth.res;

  const before = await getFinanceOutboxHealth();

  const result = await runFinanceOutboxWorker({
    workerId: `admin-outbox-run:${auth.ctx.userId}`,
    limit: 10,
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