// src/app/api/admin/fees/receipts/[receiptId]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonNoStore(status: number, payload: unknown) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function fullName(firstName?: string | null, lastName?: string | null) {
  return [firstName, lastName].filter(Boolean).join(" ").trim();
}

function classLabel(classroom?: {
  name: string | null;
  grade: string | null;
  arm: string | null;
} | null) {
  if (!classroom) return null;
  return (
    classroom.name ||
    [classroom.grade, classroom.arm].filter(Boolean).join(" ") ||
    null
  );
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ receiptId: string }> }
) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["SCHOOL_ADMIN", "ADMIN", "HEADTEACHER", "SUPERADMIN"],
  });

  if (!auth.ok) return auth.res;

  const tenantId = auth.ctx.tenantId;
  const { receiptId } = await params;

  if (!receiptId?.trim()) {
    return jsonNoStore(400, {
      ok: false,
      error: "RECEIPT_ID_REQUIRED",
    });
  }

  try {
    const receipt = await prisma.receipt.findFirst({
      where: {
        id: receiptId,
        tenantId,
      },
      select: {
        id: true,
        receiptNumber: true,
        issuedAt: true,
        issuedToName: true,
        issuedToPhone: true,
        note: true,
        feePayment: {
          select: {
            id: true,
            amountPesewas: true,
            method: true,
            reference: true,
            channel: true,
            paidAt: true,
            status: true,
            paymentTransaction: {
              select: {
                id: true,
                provider: true,
                providerReference: true,
                providerTransactionId: true,
                status: true,
                currency: true,
                providerPaidAt: true,
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
            ledgerEntries: {
              select: {
                id: true,
                entryType: true,
                direction: true,
                amountPesewas: true,
                description: true,
                journalRef: true,
                createdAt: true,
              },
              orderBy: { createdAt: "asc" },
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
      return jsonNoStore(404, {
        ok: false,
        error: "RECEIPT_NOT_FOUND",
      });
    }

    const student = receipt.invoice.student;

    const studentName =
      fullName(student.firstName, student.lastName) || "Student";

    const issuedByName =
      fullName(receipt.issuedBy?.firstName, receipt.issuedBy?.lastName) ||
      receipt.issuedBy?.name ||
      "System";

    const totalPaidAgg = await prisma.feePayment.aggregate({
      where: {
        tenantId,
        invoiceId: receipt.invoice.id,
        status: "SUCCESS",
      },
      _sum: {
        amountPesewas: true,
      },
    });

    const totalPaidPesewas = totalPaidAgg._sum.amountPesewas ?? 0;
    const outstandingPesewas = Math.max(
      0,
      (receipt.invoice.totalBilledPesewas ?? 0) -
        (receipt.invoice.totalWaivedPesewas ?? 0) -
        totalPaidPesewas
    );

    return jsonNoStore(200, {
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
          status: receipt.feePayment?.status ?? null,
          paidAt: receipt.feePayment?.paidAt?.toISOString() ?? null,
          provider: receipt.feePayment?.paymentTransaction?.provider ?? null,
          providerReference:
            receipt.feePayment?.paymentTransaction?.providerReference ?? null,
          providerTransactionId:
            receipt.feePayment?.paymentTransaction?.providerTransactionId ?? null,
          providerStatus:
            receipt.feePayment?.paymentTransaction?.status ?? null,
          providerCurrency:
            receipt.feePayment?.paymentTransaction?.currency ?? null,
          providerPaidAt:
            receipt.feePayment?.paymentTransaction?.providerPaidAt?.toISOString() ??
            null,
        },

        invoice: {
          id: receipt.invoice.id,
          term: receipt.invoice.term,
          academicYear: receipt.invoice.academicYear,
          status: receipt.invoice.status,
          totalBilledPesewas: receipt.invoice.totalBilledPesewas ?? 0,
          totalWaivedPesewas: receipt.invoice.totalWaivedPesewas ?? 0,
          totalPaidPesewas,
          outstandingPesewas,
          lines: receipt.invoice.lines.map((line) => ({
            id: line.id,
            category: line.category,
            description: line.description,
            amountPesewas: line.amountPesewas,
            waivedPesewas: line.waivedPesewas,
          })),
          ledgerEntries: receipt.invoice.ledgerEntries.map((entry) => ({
            id: entry.id,
            entryType: entry.entryType,
            direction: entry.direction,
            amountPesewas: entry.amountPesewas,
            description: entry.description,
            journalRef: entry.journalRef,
            createdAt: entry.createdAt.toISOString(),
          })),
        },

        student: {
          id: student.id,
          name: studentName,
          guardianName: student.guardianName,
          guardianPhone: student.guardianPhone,
          guardianPhoneNorm: student.guardianPhoneNorm,
          classLabel: classLabel(student.classroom),
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
    console.error("[ADMIN_RECEIPT_GET_ERROR]", err);

    return jsonNoStore(500, {
      ok: false,
      error: "FAILED_TO_LOAD_RECEIPT",
    });
  }
}