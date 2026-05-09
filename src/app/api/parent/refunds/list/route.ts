// src/app/api/parent/refunds/list/route.ts
import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireParentSession, digitsOnly } from "@/lib/parentSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(status: number, payload: unknown) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function parentStudentOwnershipWhere(input: {
  tenantId: string;
  e164: string;
  suffix9: string;
  studentId?: string | null;
}): Prisma.StudentWhereInput | null {
  const OR: Prisma.StudentWhereInput[] = [];
  const e164Digits = digitsOnly(input.e164);
  const last9 = e164Digits.slice(-9);
  const suffix9 = digitsOnly(input.suffix9);

  if (last9.length >= 7) {
    OR.push({ guardianPhone: { endsWith: last9 } });
    OR.push({ guardianPhoneNorm: { endsWith: last9 } });
  }

  if (suffix9.length >= 7 && suffix9 !== last9) {
    OR.push({ guardianPhone: { endsWith: suffix9 } });
    OR.push({ guardianPhoneNorm: { endsWith: suffix9 } });
  }

  if (!OR.length) return null;

  return {
    tenantId: input.tenantId,
    status: "ACTIVE",
    OR,
    ...(input.studentId ? { id: input.studentId } : {}),
  };
}

function fullName(firstName?: string | null, lastName?: string | null) {
  return [firstName, lastName].filter(Boolean).join(" ").trim() || "Student";
}

function toIso(value: unknown): string | null {
  if (!value) return null;

  if (value instanceof Date) {
    return value.toISOString();
  }

  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export async function GET(req: NextRequest) {
  try {
    const gate = requireParentSession(req as Parameters<typeof requireParentSession>[0]);
    if (!gate.ok) return gate.res as NextResponse;

    const sess = gate.session;
    const tenantId = sess.tenantId;

    const url = new URL(req.url);
    const studentId = url.searchParams.get("studentId")?.trim() || null;

    const where = parentStudentOwnershipWhere({
      tenantId,
      e164: String(sess.guardianPhoneE164 ?? ""),
      suffix9: String(sess.guardianSuffix9 ?? ""),
      studentId,
    });

    if (!where) return noStore(200, { ok: true, refunds: [] });

    const students = await prisma.student.findMany({
      where,
      select: { id: true },
      take: 50,
    });

    if (!students.length) return noStore(200, { ok: true, refunds: [] });

    const studentIds = students.map((s) => s.id);

    const refunds = await prisma.feeRefund.findMany({
      where: {
        tenantId,
        feePayment: {
          invoice: {
            studentId: { in: studentIds },
          },
        },
      },
      select: {
        id: true,
        status: true,
        provider: true,
        amountPesewas: true,
        currency: true,
        reason: true,
        approvalNote: true,
        providerReference: true,
        providerRefundReference: true,
        requestedAt: true,
        approvedAt: true,
        processingAt: true,
        processedAt: true,
        failedAt: true,
        cancelledAt: true,
        failureReason: true,
        cancellationReason: true,
        receipt: {
          select: {
            id: true,
            receiptNumber: true,
          },
        },
        feePayment: {
          select: {
            id: true,
            amountPesewas: true,
            method: true,
            reference: true,
            paidAt: true,
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
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { requestedAt: "desc" },
      take: 100,
    });

    return noStore(200, {
      ok: true,
      refunds: refunds.map((refund) => ({
        id: refund.id,
        status: refund.status,
        provider: refund.provider,
        amountPesewas: refund.amountPesewas,
        currency: refund.currency,
        reason: refund.reason,
        approvalNote: refund.approvalNote,
        providerReference: refund.providerReference,
        providerRefundReference: refund.providerRefundReference,
        requestedAt: toIso(refund.requestedAt) ?? "",
approvedAt: toIso(refund.approvedAt),
processingAt: toIso(refund.processingAt),
processedAt: toIso(refund.processedAt),
failedAt: toIso(refund.failedAt),
cancelledAt: toIso(refund.cancelledAt),
        failureReason: refund.failureReason,
        cancellationReason: refund.cancellationReason,
        receipt: refund.receipt,
        payment: {
          id: refund.feePayment.id,
          amountPesewas: refund.feePayment.amountPesewas,
          method: refund.feePayment.method,
          reference: refund.feePayment.reference,
          paidAt: toIso(refund.feePayment.paidAt) ?? "",
        },
        invoice: {
          id: refund.feePayment.invoice.id,
          term: refund.feePayment.invoice.term,
          academicYear: refund.feePayment.invoice.academicYear,
        },
        student: {
          id: refund.feePayment.invoice.student.id,
          name: fullName(
            refund.feePayment.invoice.student.firstName,
            refund.feePayment.invoice.student.lastName
          ),
        },
      })),
    });
  } catch (err) {
    console.error("[PARENT_REFUNDS_LIST_ERROR]", err);
    return noStore(500, { ok: false, error: "FAILED_TO_LOAD_PARENT_REFUNDS" });
  }
}