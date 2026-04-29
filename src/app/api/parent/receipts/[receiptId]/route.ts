// src/app/api/parent/receipts/[receiptId]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireParentSession, digitsOnly } from "@/lib/parentSession";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function noStore(status: number, payload: unknown) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function fullName(firstName?: string | null, lastName?: string | null) {
  return [firstName, lastName].filter(Boolean).join(" ").trim();
}

function parentOwnsStudent(input: {
  parentE164: string;
  parentSuffix9: string;
  studentGuardianPhone?: string | null;
  studentGuardianPhoneNorm?: string | null;
}) {
  const parentDigits = digitsOnly(input.parentE164);
  const parentLast9 = parentDigits.slice(-9);
  const suffix9 = digitsOnly(input.parentSuffix9);

  const sNorm = digitsOnly(input.studentGuardianPhoneNorm ?? "");
  const sRaw = digitsOnly(input.studentGuardianPhone ?? "");

  return (
    (parentLast9.length >= 7 &&
      (sNorm.endsWith(parentLast9) || sRaw.endsWith(parentLast9))) ||
    (suffix9.length >= 7 && (sNorm.endsWith(suffix9) || sRaw.endsWith(suffix9)))
  );
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ receiptId: string }> }
) {
  try {
    const gate = requireParentSession(
      req as Parameters<typeof requireParentSession>[0]
    );

    if (!gate.ok) return gate.res as NextResponse;

    const sess = gate.session;
    const tenantId = sess.tenantId;

    const { receiptId } = await params;

    if (!receiptId?.trim()) {
      return noStore(400, { ok: false, error: "RECEIPT_ID_REQUIRED" });
    }

    const receipt = await prisma.receipt.findFirst({
      where: {
        id: receiptId,
        tenantId,
      },
      select: {
        id: true,
        tenantId: true,
        invoiceId: true,
        feePaymentId: true,
        receiptNumber: true,
        issuedAt: true,
        issuedToName: true,
        issuedToPhone: true,
        note: true,
        createdAt: true,
        feePayment: {
          select: {
            id: true,
            amountPesewas: true,
            method: true,
            reference: true,
            channel: true,
            paidAt: true,
            paymentTransaction: {
              select: {
                provider: true,
                providerReference: true,
                providerTransactionId: true,
              },
            },
          },
        },
        invoice: {
          select: {
            id: true,
            term: true,
            academicYear: true,
            status: true,
            totalBilledPesewas: true,
            totalWaivedPesewas: true,
            totalPaidPesewas: true,
            balancePesewas: true,
            lines: {
              select: {
                id: true,
                category: true,
                description: true,
                amountPesewas: true,
                waivedPesewas: true,
                sortOrder: true,
              },
              orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
            },
            student: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                guardianName: true,
                guardianPhone: true,
                guardianPhoneNorm: true,
                classroom: {
                  select: {
                    name: true,
                    grade: true,
                    arm: true,
                  },
                },
              },
            },
          },
        },
        issuedBy: {
          select: {
            name: true,
            firstName: true,
            lastName: true,
          },
        },
        tenant: {
          select: {
            name: true,
            schoolCode: true,
            contactEmail: true,
            contactPhone: true,
          },
        },
      },
    });

    if (!receipt) {
      return noStore(404, { ok: false, error: "RECEIPT_NOT_FOUND" });
    }

    const student = receipt.invoice.student;

    const ownsStudent = parentOwnsStudent({
      parentE164: String(sess.guardianPhoneE164 ?? ""),
      parentSuffix9: String(sess.guardianSuffix9 ?? ""),
      studentGuardianPhone: student.guardianPhone,
      studentGuardianPhoneNorm: student.guardianPhoneNorm,
    });

    if (!ownsStudent) {
      return noStore(403, { ok: false, error: "FORBIDDEN_RECEIPT" });
    }

    const totalPaidAgg = await prisma.feePayment.aggregate({
      where: {
        tenantId,
        invoiceId: receipt.invoiceId,
        status: "SUCCESS",
      },
      _sum: {
        amountPesewas: true,
      },
    });

    const totalPaidPesewas = totalPaidAgg._sum.amountPesewas ?? 0;
    const billed = receipt.invoice.totalBilledPesewas ?? 0;
    const waived = receipt.invoice.totalWaivedPesewas ?? 0;
    const outstandingPesewas = Math.max(0, billed - waived - totalPaidPesewas);

    const issuedByName =
      fullName(receipt.issuedBy?.firstName, receipt.issuedBy?.lastName) ||
      receipt.issuedBy?.name ||
      "School Office";

    const classLabel = student.classroom
      ? [student.classroom.name || student.classroom.grade, student.classroom.arm]
          .filter(Boolean)
          .join(" ")
      : null;

    const learnerName = fullName(student.firstName, student.lastName) || "Student";

    return noStore(200, {
      ok: true,
      receipt: {
        id: receipt.id,
        receiptNumber: receipt.receiptNumber,
        issuedAt: receipt.issuedAt.toISOString(),
        issuedToName: receipt.issuedToName,
        issuedToPhone: receipt.issuedToPhone,
        note: receipt.note,
        payment: {
          id: receipt.feePayment?.id ?? null,
          amountPesewas: receipt.feePayment?.amountPesewas ?? 0,
          method: receipt.feePayment?.method ?? null,
          reference: receipt.feePayment?.reference ?? null,
          channel: receipt.feePayment?.channel ?? null,
          paidAt: receipt.feePayment?.paidAt?.toISOString() ?? null,
          provider: receipt.feePayment?.paymentTransaction?.provider ?? null,
          providerReference:
            receipt.feePayment?.paymentTransaction?.providerReference ?? null,
          providerTransactionId:
            receipt.feePayment?.paymentTransaction?.providerTransactionId ?? null,
        },
        invoice: {
          id: receipt.invoice.id,
          term: receipt.invoice.term,
          academicYear: receipt.invoice.academicYear,
          status: receipt.invoice.status,
          totalBilledPesewas: billed,
          totalWaivedPesewas: waived,
          totalPaidPesewas,
          outstandingPesewas,
          lines: receipt.invoice.lines.map((line) => ({
            id: line.id,
            category: line.category,
            description: line.description,
            amountPesewas: line.amountPesewas,
            waivedPesewas: line.waivedPesewas,
          })),
        },
        student: {
          id: student.id,
          name: learnerName,
          guardianName: student.guardianName ?? null,
          classLabel,
        },
        school: {
          name: receipt.tenant.name,
          schoolCode: receipt.tenant.schoolCode,
          contactEmail: receipt.tenant.contactEmail,
          contactPhone: receipt.tenant.contactPhone,
        },
        issuedByName,
      },
    });
  } catch (err) {
    console.error("[PARENT_RECEIPT_GET_ERROR]", err);

    return noStore(500, {
      ok: false,
      error: "FAILED_TO_LOAD_RECEIPT",
    });
  }
}