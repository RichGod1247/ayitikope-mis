// src/app/api/admin/fees/reconciliation/batches/[batchId]/route.ts
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

async function getParams(ctx: { params: Promise<{ batchId: string }> | { batchId: string } }) {
  return await ctx.params;
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ batchId: string }> | { batchId: string } }
) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["SCHOOL_ADMIN", "HEADTEACHER", "SUPERADMIN"],
  });

  if (!auth.ok) return auth.res;

  const { batchId } = await getParams(ctx);

  try {
    const batch = await prisma.reconciliationBatch.findFirst({
      where: {
        id: batchId,
        tenantId: auth.ctx.tenantId,
      },
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
          orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
          select: {
            id: true,
            kind: true,
            severity: true,
            status: true,
            providerReference: true,
            expectedPesewas: true,
            actualPesewas: true,
            deltaPesewas: true,
            description: true,
            resolutionNote: true,
            resolvedAt: true,
            createdAt: true,
            resolvedBy: { select: { name: true, email: true } },
            invoice: {
              select: {
                id: true,
                term: true,
                academicYear: true,
                student: { select: { firstName: true, lastName: true } },
              },
            },
          },
        },
      },
    });

    if (!batch) return json(404, { ok: false, error: "BATCH_NOT_FOUND" });

    return json(200, {
      ok: true,
      batch: {
        ...batch,
        batchDate: batch.batchDate.toISOString(),
        createdAt: batch.createdAt.toISOString(),
        closedAt: batch.closedAt?.toISOString() ?? null,
        createdByName: batch.createdBy?.name ?? batch.createdBy?.email ?? null,
        exceptions: batch.exceptions.map((e) => ({
          ...e,
          createdAt: e.createdAt.toISOString(),
          resolvedAt: e.resolvedAt?.toISOString() ?? null,
          resolvedByName: e.resolvedBy?.name ?? e.resolvedBy?.email ?? null,
          studentName:
            [e.invoice?.student?.firstName, e.invoice?.student?.lastName]
              .filter(Boolean)
              .join(" ")
              .trim() || "Unknown",
          term: e.invoice?.term ?? null,
          academicYear: e.invoice?.academicYear ?? null,
        })),
      },
    });
  } catch (err) {
    console.error("[RECONCILIATION_BATCH_DETAIL_ERROR]", err);
    return json(500, { ok: false, error: "FAILED_TO_LOAD_RECONCILIATION_BATCH" });
  }
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ batchId: string }> | { batchId: string } }
) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["SCHOOL_ADMIN", "HEADTEACHER", "SUPERADMIN"],
  });

  if (!auth.ok) return auth.res;

  const { batchId } = await getParams(ctx);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const batch = await tx.reconciliationBatch.findFirst({
        where: { id: batchId, tenantId: auth.ctx.tenantId },
        select: { id: true, status: true, closedAt: true },
      });

      if (!batch) return { ok: false as const, status: 404, error: "BATCH_NOT_FOUND" };
      if (batch.closedAt || batch.status === "CLOSED") {
        return { ok: false as const, status: 409, error: "BATCH_ALREADY_CLOSED" };
      }

      const activeCount = await tx.reconciliationException.count({
        where: {
          tenantId: auth.ctx.tenantId,
          batchId,
          status: { in: ["OPEN", "INVESTIGATING"] },
        },
      });

      if (activeCount > 0) {
        return { ok: false as const, status: 409, error: "BATCH_HAS_ACTIVE_EXCEPTIONS" };
      }

      const updated = await tx.reconciliationBatch.update({
        where: { id: batchId },
        data: {
          status: "CLOSED",
          closedAt: new Date(),
        },
        select: {
          id: true,
          status: true,
          closedAt: true,
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId: auth.ctx.tenantId,
          userId: auth.ctx.userId,
          action: "FINANCE_RECONCILIATION_BATCH_CLOSED",
          resource: "ReconciliationBatch",
          resourceId: batchId,
          metadata: { activeCount },
        },
      });

      return { ok: true as const, batch: updated };
    });

    if (!result.ok) {
      return json(result.status, { ok: false, error: result.error });
    }

    return json(200, {
      ok: true,
      batch: {
        ...result.batch,
        closedAt: result.batch.closedAt?.toISOString() ?? null,
      },
    });
  } catch (err) {
    console.error("[RECONCILIATION_BATCH_CLOSE_ERROR]", err);
    return json(500, { ok: false, error: "FAILED_TO_CLOSE_RECONCILIATION_BATCH" });
  }
}