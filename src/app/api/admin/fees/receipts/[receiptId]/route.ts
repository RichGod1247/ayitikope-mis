// src/app/api/admin/fees/receipts/[receiptId]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonNoStore(payload: any, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ receiptId: string }> }
) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["SCHOOL_ADMIN", "ADMIN", "SUPERADMIN"],
  });
  if (!auth.ok) return auth.res;

  const tenantId = auth.ctx.tenantId;
  const { receiptId } = await params;

  if (!receiptId) return jsonNoStore({ ok: false, error: "receiptId required." }, 400);

  try {
    const receipt = await prisma.receipt.findFirst({
      where: { id: receiptId, tenantId },
      select: {
        id: true,
        receiptNumber: true,
        issuedAt: true,
        issuedToName: true,
        issuedToPhone: true,
        note: true,
        invoiceId: true,
        feePayment: {
          select: {
            id: true,
            amountPesewas: true,
            method: true,
            reference: true,
            channel: true,
            paidAt: true,
          },
        },
        invoice: {
          select: {
            id: true,
            term: true,
            academicYear: true,
            totalBilledPesewas: true,
            totalWaivedPesewas: true,
            student: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                guardianName: true,
                guardianPhone: true,
                classroom: { select: { name: true, grade: true, arm: true } },
              },
            },
          },
        },
        issuedBy: { select: { name: true, firstName: true, lastName: true } },
        tenant: {
          select: { name: true, schoolCode: true, contactEmail: true, contactPhone: true },
        },
      },
    });

    if (!receipt) return jsonNoStore({ ok: false, error: "Receipt not found." }, 404);

    const totalPaidAgg = await prisma.feePayment.aggregate({
      where: { tenantId, invoiceId: receipt.invoiceId },
      _sum: { amountPesewas: true },
    });

    const billed = receipt.invoice?.totalBilledPesewas ?? 0;
    const waived = receipt.invoice?.totalWaivedPesewas ?? 0;
    const totalPaid = totalPaidAgg._sum.amountPesewas ?? 0;
    const outstandingPesewas = Math.max(0, billed - waived - totalPaid);

    const studentName = [receipt.invoice?.student?.firstName, receipt.invoice?.student?.lastName]
      .filter(Boolean).join(" ").trim() || "Unknown";
    const classLabel = receipt.invoice?.student?.classroom
      ? [receipt.invoice.student.classroom.name || receipt.invoice.student.classroom.grade, receipt.invoice.student.classroom.arm]
          .filter(Boolean).join(" ")
      : null;
    const issuedByName = receipt.issuedBy
      ? [receipt.issuedBy.firstName, receipt.issuedBy.lastName].filter(Boolean).join(" ").trim() ||
        receipt.issuedBy.name || "Staff"
      : "Staff";

    return jsonNoStore({
      ok: true,
      receipt: {
        id: receipt.id,
        receiptNumber: receipt.receiptNumber,
        issuedAt: receipt.issuedAt.toISOString(),
        issuedToName: receipt.issuedToName,
        issuedToPhone: receipt.issuedToPhone,
        note: receipt.note,
        payment: {
          id: receipt.feePayment?.id,
          amountPesewas: receipt.feePayment?.amountPesewas ?? 0,
          method: receipt.feePayment?.method ?? null,
          reference: receipt.feePayment?.reference ?? null,
          channel: receipt.feePayment?.channel ?? null,
          paidAt: receipt.feePayment?.paidAt?.toISOString() ?? null,
        },
        invoice: {
          id: receipt.invoiceId,
          term: receipt.invoice?.term ?? null,
          academicYear: receipt.invoice?.academicYear ?? null,
          totalBilledPesewas: billed,
          totalWaivedPesewas: waived,
          totalPaidPesewas: totalPaid,
          outstandingPesewas,
        },
        student: {
          id: receipt.invoice?.student?.id ?? null,
          name: studentName,
          guardianName: receipt.invoice?.student?.guardianName ?? null,
          guardianPhone: receipt.invoice?.student?.guardianPhone ?? null,
          classLabel,
        },
        school: {
          name: receipt.tenant?.name ?? "",
          schoolCode: receipt.tenant?.schoolCode ?? "",
          contactEmail: receipt.tenant?.contactEmail ?? null,
          contactPhone: receipt.tenant?.contactPhone ?? null,
        },
        issuedByName,
      },
    });
  } catch (err) {
    console.error("[ADMIN_RECEIPT_GET_ERROR]", err);
    return jsonNoStore({ ok: false, error: "Failed to load receipt." }, 500);
  }
}
