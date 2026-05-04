// src/app/api/admin/fees/provider-events/list/route.ts
import { NextRequest, NextResponse } from "next/server";
import { ProviderEventStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(status: number, payload: unknown) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function parseStatus(value: unknown): ProviderEventStatus | undefined {
  const v = clean(value).toUpperCase();

  if (
    v === "RECEIVED" ||
    v === "PROCESSED" ||
    v === "FAILED" ||
    v === "IGNORED"
  ) {
    return v as ProviderEventStatus;
  }

  return undefined;
}

export async function GET(req: NextRequest) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["SCHOOL_ADMIN", "ADMIN", "SUPERADMIN"],
  });

  if (!auth.ok) return auth.res;

  const url = new URL(req.url);
  const tenantId = auth.ctx.tenantId;
  const status = parseStatus(url.searchParams.get("status"));
  const suspiciousOnly = clean(url.searchParams.get("suspicious")) === "1";
  const reference = clean(url.searchParams.get("reference"));
  const limit = Math.max(
    1,
    Math.min(Number.parseInt(clean(url.searchParams.get("limit")) || "50", 10), 100)
  );

  const rows = await prisma.paymentProviderEvent.findMany({
    where: {
      tenantId,
      ...(status ? { processingStatus: status } : {}),
      ...(suspiciousOnly ? { isSuspicious: true } : {}),
      ...(reference ? { providerReference: reference } : {}),
    },
    orderBy: { receivedAt: "desc" },
    take: limit,
    select: {
      id: true,
      provider: true,
      eventType: true,
      providerReference: true,
      providerEventId: true,
      processingStatus: true,
      processingError: true,
      isReplay: true,
      isSuspicious: true,
      suspiciousReason: true,
      duplicateCount: true,
      receivedAt: true,
      eventTime: true,
      processedAt: true,
    },
  });

  return json(200, {
    ok: true,
    rows,
  });
}