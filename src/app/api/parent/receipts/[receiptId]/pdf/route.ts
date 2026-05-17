// src/app/api/parent/receipts/[receiptId]/pdf/route.ts
import { createRequire } from "node:module";
import { NextRequest, NextResponse } from "next/server";
import { PaymentStatus, RefundStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireParentSession, digitsOnly } from "@/lib/parentSession";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const requirePdfKit = createRequire(import.meta.url);

const PDFDocument = requirePdfKit("pdfkit/js/pdfkit.standalone.js") as new (
  options?: Record<string, unknown>
) => any;

function noStoreJson(status: number, payload: unknown) {
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

function formatCedis(pesewas: number | null | undefined) {
  const value = typeof pesewas === "number" ? pesewas : 0;
  const sign = value < 0 ? "-" : "";
  return `${sign}GHS ${(Math.abs(value) / 100).toFixed(2)}`;
}

function formatDate(value?: Date | string | null) {
  if (!value) return "Unavailable";

  return new Date(value).toLocaleString("en-GH", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function sanitizeFilename(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "-");
}

function methodLabel(method?: string | null) {
  const map: Record<string, string> = {
    cash: "Cash",
    paystack: "Paystack online payment",
    bank_transfer: "Bank transfer",
    bank: "Bank transfer",
    momo: "Mobile money",
    hubtel: "Mobile money",
    other: "Other",
  };

  return method ? map[method.toLowerCase()] ?? method : "Payment";
}

function statusLabel(status: string | null | undefined) {
  const s = String(status ?? "").toUpperCase();

  const map: Record<string, string> = {
    ISSUED: "Issued",
    PARTIALLY_REFUNDED: "Partially refunded",
    REFUNDED: "Refunded",
    REQUESTED: "Requested",
    APPROVED: "Approved",
    PROCESSING: "Processing",
    SUCCEEDED: "Refund paid",
    FAILED: "Failed",
    CANCELLED: "Cancelled",
    SUCCESS: "Successful",
  };

  return map[s] ?? (s || "Unknown");
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

  const candidates = [sNorm.slice(-9), sRaw.slice(-9)].filter((v) => v.length >= 7);

  if (parentLast9.length >= 7 && candidates.includes(parentLast9)) return true;
  if (suffix9.length >= 7 && candidates.includes(suffix9)) return true;

  return false;
}

async function getParams(ctx: {
  params: Promise<{ receiptId: string }> | { receiptId: string };
}) {
  return await ctx.params;
}

function pdfToBuffer(doc: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}

function computedReceiptStatus(input: {
  grossAmountPesewas: number;
  succeededRefundPesewas: number;
}) {
  if (input.grossAmountPesewas > 0 && input.succeededRefundPesewas >= input.grossAmountPesewas) {
    return "REFUNDED";
  }

  if (input.succeededRefundPesewas > 0) {
    return "PARTIALLY_REFUNDED";
  }

  return "ISSUED";
}

function drawRow(doc: any, label: string, value: string, x: number, y: number, width = 240) {
  doc.fontSize(8).fillColor("#666").text(label, x, y, { width });
  doc.fontSize(10).fillColor("#111").text(value, x, y + 12, { width });
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ receiptId: string }> | { receiptId: string } }
) {
  try {
    const gate = requireParentSession(req as Parameters<typeof requireParentSession>[0]);
    if (!gate.ok) return gate.res as NextResponse;

    const { receiptId } = await getParams(ctx);

    if (!receiptId) {
      return noStoreJson(400, { ok: false, error: "RECEIPT_ID_REQUIRED" });
    }

    const sess = gate.session;
    const tenantId = sess.tenantId;

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
        status: true,
        tenant: {
          select: {
            name: true,
            schoolCode: true,
            contactEmail: true,
            contactPhone: true,
          },
        },
        issuedBy: {
          select: {
            name: true,
            email: true,
          },
        },
        feePayment: {
          select: {
            id: true,
            amountPesewas: true,
            status: true,
            method: true,
            reference: true,
            channel: true,
            paidAt: true,
            refunds: {
              orderBy: { requestedAt: "desc" },
              select: {
                id: true,
                amountPesewas: true,
                status: true,
                reason: true,
                providerRefundReference: true,
                requestedAt: true,
                processedAt: true,
              },
            },
          },
        },
        invoice: {
          select: {
            id: true,
            term: true,
            academicYear: true,
            totalBilledPesewas: true,
            totalWaivedPesewas: true,
            totalPaidPesewas: true,
            balancePesewas: true,
            student: {
              select: {
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
            lines: {
              select: {
                id: true,
                description: true,
                category: true,
                amountPesewas: true,
                waivedPesewas: true,
              },
              orderBy: { createdAt: "asc" },
            },
            payments: {
              select: {
                amountPesewas: true,
                status: true,
                refunds: {
                  select: {
                    amountPesewas: true,
                    status: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!receipt || !receipt.invoice || !receipt.feePayment) {
      return noStoreJson(404, { ok: false, error: "RECEIPT_NOT_FOUND" });
    }

    const student = receipt.invoice.student;

    const ownsStudent = parentOwnsStudent({
      parentE164: String(sess.guardianPhoneE164 ?? ""),
      parentSuffix9: String(sess.guardianSuffix9 ?? ""),
      studentGuardianPhone: student?.guardianPhone,
      studentGuardianPhoneNorm: student?.guardianPhoneNorm,
    });

    if (!ownsStudent) {
      return noStoreJson(403, { ok: false, error: "FORBIDDEN_RECEIPT" });
    }

    const grossAmountPesewas = receipt.feePayment.amountPesewas;

    const succeededRefundPesewas = receipt.feePayment.refunds
      .filter((refund) => refund.status === RefundStatus.SUCCEEDED)
      .reduce((sum, refund) => sum + refund.amountPesewas, 0);

    const pendingRefundPesewas = receipt.feePayment.refunds
      .filter(
        (refund) =>
          refund.status === RefundStatus.REQUESTED ||
          refund.status === RefundStatus.APPROVED ||
          refund.status === RefundStatus.PROCESSING
      )
      .reduce((sum, refund) => sum + refund.amountPesewas, 0);

    const netAmountPesewas = Math.max(0, grossAmountPesewas - succeededRefundPesewas);
    const refundableRemainingPesewas = Math.max(
      0,
      grossAmountPesewas - succeededRefundPesewas - pendingRefundPesewas
    );

    const invoiceGrossPaidPesewas = receipt.invoice.payments
      .filter((payment) => payment.status === PaymentStatus.SUCCESS || payment.status === PaymentStatus.REFUNDED)
      .reduce((sum, payment) => sum + payment.amountPesewas, 0);

    const invoiceRefundedPesewas = receipt.invoice.payments.reduce(
      (sum, payment) =>
        sum +
        payment.refunds
          .filter((refund) => refund.status === RefundStatus.SUCCEEDED)
          .reduce((refundSum, refund) => refundSum + refund.amountPesewas, 0),
      0
    );

    const invoiceNetPaidPesewas = Math.max(0, invoiceGrossPaidPesewas - invoiceRefundedPesewas);
    const netBilledPesewas = Math.max(
      0,
      receipt.invoice.totalBilledPesewas - receipt.invoice.totalWaivedPesewas
    );

    const classLabel =
      student?.classroom?.name ||
      [student?.classroom?.grade, student?.classroom?.arm].filter(Boolean).join(" ") ||
      "Class unavailable";

    const learnerName = fullName(student?.firstName, student?.lastName) || "Student";
    const issuedByName = receipt.issuedBy?.name ?? receipt.issuedBy?.email ?? "EduLife OS";
    const computedStatus = computedReceiptStatus({
      grossAmountPesewas,
      succeededRefundPesewas,
    });

    const doc = new PDFDocument({
      size: "A4",
      margin: 48,
      info: {
        Title: `Receipt ${receipt.receiptNumber}`,
        Author: "EduLife OS",
        Subject: "Official fee receipt",
      },
    });

    doc.rect(0, 0, 595.28, 120).fill("#0a0a0a");
    doc.fillColor("#ffffff").fontSize(18).text(receipt.tenant.name, 48, 38, { width: 330 });
    doc
      .fontSize(8)
      .fillColor("#d4d4d8")
      .text(`School code: ${receipt.tenant.schoolCode || "Unavailable"}`, 48, 64);
    if (receipt.tenant.contactPhone) {
      doc.text(receipt.tenant.contactPhone, 48, 78);
    }
    if (receipt.tenant.contactEmail) {
      doc.text(receipt.tenant.contactEmail, 48, 92);
    }

    doc.fillColor("#ffffff").fontSize(9).text("OFFICIAL RECEIPT", 390, 38, {
      width: 150,
      align: "right",
    });
    doc.fontSize(13).text(receipt.receiptNumber, 330, 55, { width: 210, align: "right" });
    doc.fontSize(8).fillColor("#d4d4d8").text(formatDate(receipt.issuedAt), 330, 76, {
      width: 210,
      align: "right",
    });
    doc.fontSize(8).fillColor("#ffffff").text(statusLabel(computedStatus), 330, 94, {
      width: 210,
      align: "right",
    });

    drawRow(doc, "Issued to", receipt.issuedToName || student?.guardianName || "Parent / Guardian", 48, 145);
    drawRow(doc, "Learner", learnerName, 310, 145);
    drawRow(doc, "Class", classLabel, 48, 190);
    drawRow(
      doc,
      "Term / academic year",
      `${receipt.invoice.term || "Term unavailable"} · ${receipt.invoice.academicYear || "Year unavailable"}`,
      310,
      190
    );

    doc.roundedRect(48, 245, 499, 82, 12).fillAndStroke("#f4f4f5", "#e4e4e7");
    drawRow(doc, "Original payment", formatCedis(grossAmountPesewas), 66, 262, 140);
    drawRow(doc, "Refund paid", formatCedis(succeededRefundPesewas), 230, 262, 140);
    drawRow(doc, "Net paid after refunds", formatCedis(netAmountPesewas), 390, 262, 140);

    if (pendingRefundPesewas > 0 || receipt.feePayment.refunds.length > 0) {
      doc.roundedRect(48, 345, 499, 92, 12).fillAndStroke("#fffbeb", "#fde68a");
      doc.fontSize(11).fillColor("#78350f").text("Refund activity", 66, 362);
      doc
        .fontSize(8)
        .fillColor("#92400e")
        .text(
          "Pending refunds are shown as exposure and are not deducted from net paid until they succeed.",
          66,
          379,
          { width: 455 }
        );

      drawRow(doc, "Pending refund", formatCedis(pendingRefundPesewas), 66, 405, 130);
      drawRow(doc, "Still refundable", formatCedis(refundableRemainingPesewas), 230, 405, 130);
      drawRow(doc, "Receipt status", statusLabel(computedStatus), 390, 405, 130);
    }

    const paymentY = pendingRefundPesewas > 0 || receipt.feePayment.refunds.length > 0 ? 465 : 355;

    doc.fontSize(12).fillColor("#111").text("Payment details", 48, paymentY);
    drawRow(doc, "Method", methodLabel(receipt.feePayment.method), 48, paymentY + 24);
    drawRow(doc, "Payment date", formatDate(receipt.feePayment.paidAt), 230, paymentY + 24);
    drawRow(doc, "Payment status", statusLabel(receipt.feePayment.status), 410, paymentY + 24);

    if (receipt.feePayment.reference) {
      doc.fontSize(8).fillColor("#666").text("Payment reference", 48, paymentY + 74);
      doc.fontSize(8).fillColor("#111").text(receipt.feePayment.reference, 48, paymentY + 88, {
        width: 499,
      });
    }

    const invoiceY = paymentY + 120;

    doc.fontSize(12).fillColor("#111").text("Invoice summary", 48, invoiceY);
    doc.roundedRect(48, invoiceY + 20, 499, 88, 10).strokeColor("#e4e4e7").stroke();

    drawRow(doc, "Total billed", formatCedis(receipt.invoice.totalBilledPesewas), 64, invoiceY + 36, 120);
    drawRow(doc, "Waived", formatCedis(receipt.invoice.totalWaivedPesewas), 190, invoiceY + 36, 100);
    drawRow(doc, "Net billed", formatCedis(netBilledPesewas), 300, invoiceY + 36, 100);
    drawRow(doc, "Gross paid", formatCedis(invoiceGrossPaidPesewas), 410, invoiceY + 36, 110);

    drawRow(doc, "Invoice refunded", formatCedis(invoiceRefundedPesewas), 64, invoiceY + 76, 120);
    drawRow(doc, "Invoice net paid", formatCedis(invoiceNetPaidPesewas), 190, invoiceY + 76, 120);
    drawRow(doc, "Balance", formatCedis(receipt.invoice.balancePesewas), 330, invoiceY + 76, 120);

    const refundRows = receipt.feePayment.refunds.slice(0, 4);
    if (refundRows.length > 0) {
      const refundY = invoiceY + 135;
      doc.fontSize(12).fillColor("#111").text("Refund records", 48, refundY);

      let y = refundY + 22;
      refundRows.forEach((refund) => {
        doc.roundedRect(48, y, 499, 42, 8).strokeColor("#fde68a").stroke();
        doc
          .fontSize(9)
          .fillColor("#111")
          .text(`${statusLabel(refund.status)} · ${formatCedis(refund.amountPesewas)}`, 62, y + 10);
        doc
          .fontSize(7)
          .fillColor("#666")
          .text(
            `Reason: ${refund.reason || "No reason captured"} · Requested: ${formatDate(refund.requestedAt)}`,
            62,
            y + 24,
            { width: 470 }
          );

        if (refund.providerRefundReference) {
          doc.fontSize(7).fillColor("#666").text(`Refund ref: ${refund.providerRefundReference}`, 340, y + 10, {
            width: 190,
            align: "right",
          });
        }

        y += 48;
      });
    }

    doc.moveTo(48, 735).lineTo(547, 735).strokeColor("#ddd").stroke();
    doc.fontSize(8).fillColor("#555").text(`Issued by: ${issuedByName}`, 48, 748);
    doc.text(
      "This is a system-generated receipt from EduLife OS. It shows original payment, succeeded refunds, pending refund exposure, and net paid after refunds.",
      48,
      762,
      { width: 499 }
    );
    doc.fontSize(7).fillColor("#777").text(`Receipt ID: ${receipt.id}`, 48, 786);

    const pdfBuffer = await pdfToBuffer(doc);
    const filename = `RECEIPT-${sanitizeFilename(receipt.receiptNumber)}.pdf`;
    const pdfBytes = new Uint8Array(pdfBuffer);

    return new NextResponse(pdfBytes, {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (err) {
    console.error("[PARENT_RECEIPT_PDF_ERROR]", err);
    return noStoreJson(500, { ok: false, error: "FAILED_TO_GENERATE_RECEIPT_PDF" });
  }
}