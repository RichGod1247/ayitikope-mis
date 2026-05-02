// src/app/api/admin/fees/reconciliation/batches/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(status: number, payload: unknown) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function clampLimit(raw: string | null) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 50;
  return Math.min(Math.max(Math.floor(n), 1), 100);
}

export async function GET(req: NextRequest) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["SCHOOL_ADMIN", "HEADTEACHER", "SUPERADMIN"],
  });

  if (!auth.ok) return auth.res;

  const url = new URL(req.url);
  const limit = clampLimit(url.searchParams.get("limit"));

  try {
    const batches = await prisma.reconciliationBatch.findMany({
      where: { tenantId: auth.ctx.tenantId },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        provider: true,
        batchDate: true,
        status: true,
        expectedPesewas: true,
        actualPesewas: true,
        deltaPesewas: true,
        notes: true,
        createdAt: true,
        closedAt: true,
        createdBy: { select: { name: true, email: true } },
        exceptions: {
          select: {
            id: true,
            status: true,
            severity: true,
          },
        },
      },
    });

    return json(200, {
      ok: true,
      batches: batches.map((b) => {
        const openCount = b.exceptions.filter((e) => e.status === "OPEN").length;
        const investigatingCount = b.exceptions.filter((e) => e.status === "INVESTIGATING").length;
        const resolvedCount = b.exceptions.filter((e) => e.status === "RESOLVED").length;
        const dismissedCount = b.exceptions.filter((e) => e.status === "DISMISSED").length;
        const criticalCount = b.exceptions.filter((e) => e.severity === "CRITICAL").length;

        return {
          id: b.id,
          provider: b.provider,
          batchDate: b.batchDate.toISOString(),
          status: b.status,
          expectedPesewas: b.expectedPesewas,
          actualPesewas: b.actualPesewas,
          deltaPesewas: b.deltaPesewas,
          notes: b.notes,
          createdAt: b.createdAt.toISOString(),
          closedAt: b.closedAt?.toISOString() ?? null,
          createdByName: b.createdBy?.name ?? b.createdBy?.email ?? null,
          exceptionCount: b.exceptions.length,
          openCount,
          investigatingCount,
          resolvedCount,
          dismissedCount,
          criticalCount,
        };
      }),
    });
  } catch (err) {
    console.error("[RECONCILIATION_BATCH_HISTORY_ERROR]", err);
    return json(500, { ok: false, error: "FAILED_TO_LOAD_RECONCILIATION_BATCHES" });
  }
}