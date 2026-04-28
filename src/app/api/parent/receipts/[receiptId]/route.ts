// src/app/api/parent/receipts/[receiptId]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireParentSession, digitsOnly } from "@/lib/parentSession";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function noStore(status: number, payload: any) {
  return NextResponse.json(payload, {
    status,
    headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ receiptId: string }> }
) {
  try {
    const gate = requireParentSession(req as any);
    if (!gate.ok) return gate.res as any;

    const sess = gate.session;
    const tenantId = sess.tenantId;
    const e164 = String(sess.guardianPhoneE164 ?? "").trim();
    const suffix9 = digitsOnly(sess.guardianSuffix9 ?? "");

    const { receiptId } = await params;
    if (!receiptId) return noStore(400, { ok: false, error: "receiptId required." });

    const receipt = await prisma.receipt.findFirst({
      where: { id: receiptId, tenantId },
      select: {
        id: true,
        receiptNumber: true,
        issuedAt: true,
        issuedToName: true,
        issuedToPhone: true,
        note: true,
        createdAt: true,
        feePayment: {
          select: {
            amountPesewas: true,
            method: true,
            reference: true,
            channel: true,
            paidAt: true,
          },
        },
        invoice: {
          select: {
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
                guardianPhoneNorm: true,
                classroom: { select: { name: true, grade: true, arm: true } },
              },
            },
          },
        },
        issuedBy: { select: { name: true, firstName: true, lastName: true } },
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

    if (!receipt) return noStore(404, { ok: false, error: "Receipt not found." });

    // Verify this receipt belongs to one of this parent's students
    const student = receipt.invoice?.student;
    if (!student) return noStore(403, { ok: false, error: "Forbidden." });

    const sNorm = digitsOnly(student.guardianPhoneNorm ?? student.guardianPhone ?? "");
    const sRaw = digitsOnly(student.guardianPhone ?? "");
    const parentE164Digits = digitsOnly(e164);
    const matches =
      (parentE164Digits && (sNorm.endsWith(parentE164Digits.slice(-9)) || sRaw.endsWith(parentE164Digits.slice(-9)))) ||
      (suffix9.length >= 7 && (sNorm.endsWith(suffix9) || sRaw.endsWith(suffix9)));

    if (!matches) return noStore(403, { ok: false, error: "Forbidden." });

    // Compute aggregate paid + outstanding
    const allPayments = await prisma.feePayment.aggregate({
      where: { tenantId, invoiceId: receipt.invoice ? receipt.invoice.term ? undefined : undefined : undefined },
      _sum: { amountPesewas: true },
    });

    const billed = receipt.invoice?.totalBilledPesewas ?? 0;
    const waived = receipt.invoice?.totalWaivedPesewas ?? 0;

    // Get total paid on this invoice
    const invoiceId = await prisma.receipt
      .findUnique({ where: { id: receiptId }, select: { invoiceId: true } })
      .then((r) => r?.invoiceId);

    const totalPaidAgg = invoiceId
      ? await prisma.feePayment.aggregate({
          where: { tenantId, invoiceId },
          _sum: { amountPesewas: true },
        })
      : { _sum: { amountPesewas: 0 } };

    const totalPaid = totalPaidAgg._sum.amountPesewas ?? 0;
    const outstandingPesewas = Math.max(0, billed - waived - totalPaid);

    const issuedByName = receipt.issuedBy
      ? [receipt.issuedBy.firstName, receipt.issuedBy.lastName].filter(Boolean).join(" ").trim() ||
        receipt.issuedBy.name ||
        "School Office"
      : "School Office";

    const classLabel = student.classroom
      ? [student.classroom.name || student.classroom.grade, student.classroom.arm].filter(Boolean).join(" ")
      : null;

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
          amountPesewas: receipt.feePayment?.amountPesewas ?? 0,
          method: receipt.feePayment?.method ?? null,
          reference: receipt.feePayment?.reference ?? null,
          channel: receipt.feePayment?.channel ?? null,
          paidAt: receipt.feePayment?.paidAt?.toISOString() ?? null,
        },
        invoice: {
          term: receipt.invoice?.term ?? null,
          academicYear: receipt.invoice?.academicYear ?? null,
          totalBilledPesewas: billed,
          totalWaivedPesewas: waived,
          totalPaidPesewas: totalPaid,
          outstandingPesewas,
        },
        student: {
          id: student.id,
          name: [student.firstName, student.lastName].filter(Boolean).join(" ").trim() || "—",
          guardianName: student.guardianName ?? null,
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
    console.error("[PARENT_RECEIPT_GET_ERROR]", err);
    return noStore(500, { ok: false, error: "Failed to load receipt." });
  }
}
