// src/app/api/admin/fees/reconciliation/exceptions/[exceptionId]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import type { ReconciliationExceptionStatus } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const allowedStatuses = new Set<ReconciliationExceptionStatus>([
  "INVESTIGATING",
  "RESOLVED",
  "DISMISSED",
]);

function json(status: number, payload: unknown) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function clean(v: unknown) {
  return String(v ?? "").trim();
}

async function getParams(ctx: {
  params: Promise<{ exceptionId: string }> | { exceptionId: string };
}) {
  return await ctx.params;
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ exceptionId: string }> | { exceptionId: string } }
) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["SCHOOL_ADMIN", "HEADTEACHER", "SUPERADMIN"],
  });

  if (!auth.ok) return auth.res;

  const { exceptionId } = await getParams(ctx);

  const ct = req.headers.get("content-type") ?? "";
  if (!ct.toLowerCase().includes("application/json")) {
    return json(415, { ok: false, error: "CONTENT_TYPE_MUST_BE_JSON" });
  }

  let body: { status?: ReconciliationExceptionStatus; resolutionNote?: string } = {};

  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json(400, { ok: false, error: "INVALID_JSON" });
  }

  const nextStatus = body.status;
  const resolutionNote = clean(body.resolutionNote);

  if (!nextStatus || !allowedStatuses.has(nextStatus)) {
    return json(400, { ok: false, error: "INVALID_EXCEPTION_STATUS" });
  }

  if (resolutionNote.length < 8) {
    return json(400, { ok: false, error: "RESOLUTION_NOTE_TOO_SHORT" });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.reconciliationException.findFirst({
        where: {
          id: exceptionId,
          tenantId: auth.ctx.tenantId,
        },
        select: {
          id: true,
          status: true,
          batchId: true,
          kind: true,
          severity: true,
          batch: { select: { id: true, status: true, closedAt: true } },
        },
      });

      if (!existing) return { ok: false as const, status: 404, error: "EXCEPTION_NOT_FOUND" };

      if (existing.batch?.closedAt || existing.batch?.status === "CLOSED") {
        return { ok: false as const, status: 409, error: "BATCH_ALREADY_CLOSED" };
      }

      const isTerminal = nextStatus === "RESOLVED" || nextStatus === "DISMISSED";

      const updated = await tx.reconciliationException.update({
        where: { id: exceptionId },
        data: {
          status: nextStatus,
          resolutionNote,
          resolvedByUserId: isTerminal ? auth.ctx.userId : null,
          resolvedAt: isTerminal ? new Date() : null,
        },
        select: {
          id: true,
          status: true,
          resolutionNote: true,
          resolvedAt: true,
          resolvedBy: { select: { name: true, email: true } },
        },
      });

      if (existing.batchId) {
        const activeCount = await tx.reconciliationException.count({
          where: {
            tenantId: auth.ctx.tenantId,
            batchId: existing.batchId,
            status: { in: ["OPEN", "INVESTIGATING"] },
          },
        });

        if (activeCount === 0) {
          await tx.reconciliationBatch.update({
            where: { id: existing.batchId },
            data: {
              status: "CLOSED",
              closedAt: new Date(),
            },
          });
        }
      }

      await tx.auditLog.create({
        data: {
          tenantId: auth.ctx.tenantId,
          userId: auth.ctx.userId,
          action: "FINANCE_RECONCILIATION_EXCEPTION_UPDATED",
          resource: "ReconciliationException",
          resourceId: exceptionId,
          metadata: {
            previousStatus: existing.status,
            nextStatus,
            kind: existing.kind,
            severity: existing.severity,
            batchId: existing.batchId,
            resolutionNote,
          },
        },
      });

      return { ok: true as const, exception: updated };
    });

    if (!result.ok) {
      return json(result.status, { ok: false, error: result.error });
    }

    return json(200, {
      ok: true,
      exception: {
        ...result.exception,
        resolvedAt: result.exception.resolvedAt?.toISOString() ?? null,
        resolvedByName:
          result.exception.resolvedBy?.name ?? result.exception.resolvedBy?.email ?? null,
      },
    });
  } catch (err) {
    console.error("[RECONCILIATION_EXCEPTION_UPDATE_ERROR]", err);
    return json(500, { ok: false, error: "FAILED_TO_UPDATE_RECONCILIATION_EXCEPTION" });
  }
}