// src/app/api/admin/fees/refunds/list/route.ts
import { NextRequest, NextResponse } from "next/server";
import { RefundStatus, type Prisma } from "@prisma/client";
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

function clean(v: unknown) {
  return String(v ?? "").trim();
}

function parseStatus(v: unknown): RefundStatus | null {
  const s = clean(v).toUpperCase();
  return Object.values(RefundStatus).includes(s as RefundStatus)
    ? (s as RefundStatus)
    : null;
}

function fullName(firstName?: string | null, lastName?: string | null) {
  return [firstName, lastName].filter(Boolean).join(" ").trim() || null;
}

function toIso(value: unknown): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function GET(req: NextRequest) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["SCHOOL_ADMIN", "ADMIN", "HEADTEACHER", "SUPERADMIN"],
  });

  if (!auth.ok) return auth.res;

  const url = new URL(req.url);
  const tenantId = auth.ctx.tenantId;

  const status = parseStatus(url.searchParams.get("status"));
  const q = clean(url.searchParams.get("q"));
  const feePaymentId = clean(url.searchParams.get("feePaymentId"));
  const receiptId = clean(url.searchParams.get("receiptId"));
  const takeRaw = Number(url.searchParams.get("take") ?? "200");
  const take = Math.min(500, Math.max(1, Number.isFinite(takeRaw) ? takeRaw : 200));

  const where: Prisma.FeeRefundWhereInput = {
    tenantId,
    ...(status ? { status } : {}),
    ...(feePaymentId ? { feePaymentId } : {}),
    ...(receiptId ? { receiptId } : {}),
    ...(q
      ? {
          OR: [
            { reason: { contains: q, mode: "insensitive" } },
            { providerReference: { contains: q, mode: "insensitive" } },
            { providerRefundReference: { contains: q, mode: "insensitive" } },
            { receipt: { receiptNumber: { contains: q, mode: "insensitive" } } },
            { feePayment: { reference: { contains: q, mode: "insensitive" } } },
            {
              feePayment: {
                invoice: {
                  student: { firstName: { contains: q, mode: "insensitive" } },
                },
              },
            },
            {
              feePayment: {
                invoice: {
                  student: { lastName: { contains: q, mode: "insensitive" } },
                },
              },
            },
          ],
        }
      : {}),
  };

  try {
    const rows = await prisma.feeRefund.findMany({
      where,
      orderBy: [{ requestedAt: "desc" }],
      take,
      select: {
        id: true,
        amountPesewas: true,
        currency: true,
        status: true,
        provider: true,
        providerReference: true,
        providerRefundReference: true,
        reason: true,
        approvalNote: true,
        failureReason: true,
        cancellationReason: true,
        requestedAt: true,
        approvedAt: true,
        processingAt: true,
        processedAt: true,
        failedAt: true,
        cancelledAt: true,
        feePaymentId: true,
        receiptId: true,
        requestedBy: { select: { name: true, firstName: true, lastName: true } },
        approvedBy: { select: { name: true, firstName: true, lastName: true } },
        receipt: { select: { receiptNumber: true, status: true } },
        feePayment: {
          select: {
            amountPesewas: true,
            method: true,
            reference: true,
            status: true,
            invoice: {
              select: {
                id: true,
                term: true,
                academicYear: true,
                student: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    guardianPhone: true,
                    classroom: { select: { name: true, grade: true, arm: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    return json(200, {
      ok: true,
      count: rows.length,
      totalRefundPesewas: rows.reduce((s, r) => s + r.amountPesewas, 0),
      filters: { status, q, feePaymentId, receiptId, take },
      items: rows.map((r) => {
        const student = r.feePayment.invoice.student;
        const classLabel =
          student.classroom?.name ||
          [student.classroom?.grade, student.classroom?.arm]
            .filter(Boolean)
            .join(" ") ||
          null;

        return {
          id: r.id,
          amountPesewas: r.amountPesewas,
          currency: r.currency,
          status: r.status,
          provider: r.provider,
          providerReference: r.providerReference,
          providerRefundReference: r.providerRefundReference,
          reason: r.reason,
          approvalNote: r.approvalNote,
          failureReason: r.failureReason,
          cancellationReason: r.cancellationReason,

          requestedAt: toIso(r.requestedAt),
          approvedAt: toIso(r.approvedAt),
          processingAt: toIso(r.processingAt),
          processedAt: toIso(r.processedAt),
          failedAt: toIso(r.failedAt),
          cancelledAt: toIso(r.cancelledAt),

          feePaymentId: r.feePaymentId,
          receiptId: r.receiptId,
          receiptNumber: r.receipt?.receiptNumber ?? null,
          receiptStatus: r.receipt?.status ?? null,

          originalPaymentAmountPesewas: r.feePayment.amountPesewas,
          paymentMethod: r.feePayment.method,
          paymentReference: r.feePayment.reference,
          paymentStatus: r.feePayment.status,

          invoiceId: r.feePayment.invoice.id,
          term: r.feePayment.invoice.term,
          academicYear: r.feePayment.invoice.academicYear,

          studentId: student.id,
          studentName: fullName(student.firstName, student.lastName) ?? "Unknown",
          guardianPhone: student.guardianPhone,
          classLabel,

          requestedByName:
            fullName(r.requestedBy?.firstName, r.requestedBy?.lastName) ??
            r.requestedBy?.name ??
            "Unknown",
          approvedByName:
            fullName(r.approvedBy?.firstName, r.approvedBy?.lastName) ??
            r.approvedBy?.name ??
            null,
        };
      }),
    });
  } catch (err) {
    console.error("[ADMIN_REFUNDS_LIST_ERROR]", err);
    return json(500, { ok: false, error: "FAILED_TO_LOAD_REFUNDS" });
  }
}