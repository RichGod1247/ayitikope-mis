// src/app/api/parent/receipts/[receiptId]/pdf/route.ts
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireParentSession, digitsOnly } from "@/lib/parentSession";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const requirePdfKit = createRequire(import.meta.url);

// Use standalone PDFKit build so Next.js does not lose PDFKit's built-in font data.
const PDFDocument = requirePdfKit("pdfkit/js/pdfkit.standalone.js") as new (
  options?: Record<string, unknown>
) => any;

function fullName(firstName?: string | null, lastName?: string | null) {
  return [firstName, lastName].filter(Boolean).join(" ").trim();
}

function formatCedis(pesewas: number) {
  return `GHS ${(pesewas / 100).toFixed(2)}`;
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

async function pdfToBuffer(doc: any) {
  const chunks: Buffer[] = [];

  return await new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ receiptId: string }> }
) {
  try {
    const gate = requireParentSession(req as Parameters<typeof requireParentSession>[0]);
    if (!gate.ok) return gate.res as NextResponse;

    const sess = gate.session;
    const tenantId = sess.tenantId;
    const { receiptId } = await params;

    if (!receiptId?.trim()) {
      return NextResponse.json(
        { ok: false, error: "RECEIPT_ID_REQUIRED" },
        { status: 400 }
      );
    }

    const receipt = await prisma.receipt.findFirst({
      where: { id: receiptId, tenantId },
      select: {
        id: true,
        receiptNumber: true,
        issuedAt: true,
        issuedToName: true,
        issuedToPhone: true,
        note: true,
        feePayment: {
          select: {
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
            balancePesewas: true,
            lines: {
              select: {
                description: true,
                category: true,
                amountPesewas: true,
                waivedPesewas: true,
              },
              orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
            },
            student: {
              select: {
                firstName: true,
                lastName: true,
                guardianName: true,
                guardianPhone: true,
                guardianPhoneNorm: true,
                classroom: {
                  select: { name: true, grade: true, arm: true },
                },
              },
            },
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
        issuedBy: {
          select: {
            name: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!receipt) {
      return NextResponse.json(
        { ok: false, error: "RECEIPT_NOT_FOUND" },
        { status: 404 }
      );
    }

    const student = receipt.invoice.student;

    const ownsStudent = parentOwnsStudent({
      parentE164: String(sess.guardianPhoneE164 ?? ""),
      parentSuffix9: String(sess.guardianSuffix9 ?? ""),
      studentGuardianPhone: student.guardianPhone,
      studentGuardianPhoneNorm: student.guardianPhoneNorm,
    });

    if (!ownsStudent) {
      return NextResponse.json(
        { ok: false, error: "FORBIDDEN_RECEIPT" },
        { status: 403 }
      );
    }

    const totalPaidAgg = await prisma.feePayment.aggregate({
      where: { tenantId, invoiceId: receipt.invoice.id, status: "SUCCESS" },
      _sum: { amountPesewas: true },
    });

    const totalPaidPesewas = totalPaidAgg._sum.amountPesewas ?? 0;
    const netBilled = Math.max(
      0,
      receipt.invoice.totalBilledPesewas - receipt.invoice.totalWaivedPesewas
    );
    const outstandingPesewas = Math.max(0, netBilled - totalPaidPesewas);

    const learnerName = fullName(student.firstName, student.lastName) || "Student";
    const classLabel = student.classroom
      ? [student.classroom.name || student.classroom.grade, student.classroom.arm]
          .filter(Boolean)
          .join(" ")
      : "Class unavailable";

    const issuedByName =
      fullName(receipt.issuedBy?.firstName, receipt.issuedBy?.lastName) ||
      receipt.issuedBy?.name ||
      "School Office";

    const doc = new PDFDocument({ size: "A4", margin: 48 });

    const logoPath = path.join(process.cwd(), "public", "edulife-os-logo.png");

    try {
      if (fs.existsSync(logoPath)) {
        doc.image(logoPath, 48, 38, { width: 64 });
      } else {
        doc
          .roundedRect(48, 38, 64, 64, 10)
          .fillAndStroke("#111827", "#111827")
          .fillColor("#ffffff")
          .fontSize(16)
          .text("EL", 67, 60);
      }
    } catch (logoErr) {
      console.warn("[PARENT_RECEIPT_PDF_LOGO_SKIPPED]", logoErr);

      doc
        .roundedRect(48, 38, 64, 64, 10)
        .fillAndStroke("#111827", "#111827")
        .fillColor("#ffffff")
        .fontSize(16)
        .text("EL", 67, 60);
    }

    doc.fontSize(10).fillColor("#666").text("EduLife OS", 130, 46);
    doc.fontSize(20).fillColor("#111").text(receipt.tenant.name, 130, 62);
    doc
      .fontSize(9)
      .fillColor("#666")
      .text(`School Code: ${receipt.tenant.schoolCode}`, 130, 88);

    doc.fontSize(18).fillColor("#111").text("OFFICIAL RECEIPT", 360, 48, {
      align: "right",
    });
    doc.fontSize(10).fillColor("#333").text(receipt.receiptNumber, 360, 74, {
      align: "right",
    });
    doc.fontSize(9).fillColor("#666").text(formatDate(receipt.issuedAt), 360, 90, {
      align: "right",
    });

    doc.moveTo(48, 125).lineTo(547, 125).strokeColor("#ddd").stroke();

    doc.fontSize(11).fillColor("#111").text("Issued To", 48, 150);
    doc
      .fontSize(10)
      .fillColor("#444")
      .text(receipt.issuedToName || student.guardianName || "Parent / Guardian");
    if (receipt.issuedToPhone) doc.text(receipt.issuedToPhone);

    doc.fontSize(11).fillColor("#111").text("Learner", 320, 150);
    doc.fontSize(10).fillColor("#444").text(learnerName);
    doc.text(classLabel);

    doc.roundedRect(48, 225, 499, 84, 10).fillAndStroke("#f8fafc", "#e5e7eb");
    doc.fillColor("#555").fontSize(9).text("Amount Paid", 68, 245);
    doc
      .fillColor("#047857")
      .fontSize(17)
      .text(formatCedis(receipt.feePayment?.amountPesewas ?? 0), 68, 262);

    doc.fillColor("#555").fontSize(9).text("Payment Method", 240, 245);
    doc
      .fillColor("#111")
      .fontSize(11)
      .text(methodLabel(receipt.feePayment?.method), 240, 264);

    doc.fillColor("#555").fontSize(9).text("Payment Date", 400, 245);
    doc
      .fillColor("#111")
      .fontSize(10)
      .text(formatDate(receipt.feePayment?.paidAt ?? receipt.issuedAt), 400, 264, {
        width: 120,
      });

    let y = 340;

    doc.fontSize(12).fillColor("#111").text("Invoice Summary", 48, y);
    y += 24;

    const summaryRows = [
      ["Term", receipt.invoice.term ?? "Unavailable"],
      ["Academic Year", receipt.invoice.academicYear ?? "Unavailable"],
      ["Total Billed", formatCedis(receipt.invoice.totalBilledPesewas)],
      ["Waived / Support", formatCedis(receipt.invoice.totalWaivedPesewas)],
      ["Net Billed", formatCedis(netBilled)],
      ["Total Paid", formatCedis(totalPaidPesewas)],
      ["Balance Remaining", formatCedis(outstandingPesewas)],
    ];

    for (const [label, value] of summaryRows) {
      doc.fillColor("#666").fontSize(9).text(label, 48, y);
      doc.fillColor("#111").fontSize(10).text(value, 210, y);
      y += 18;
    }

    y += 16;
    doc.fontSize(12).fillColor("#111").text("Fee Items", 48, y);
    y += 22;

    doc.fontSize(9).fillColor("#666");
    doc.text("Description", 48, y);
    doc.text("Category", 300, y);
    doc.text("Amount", 430, y, { width: 70, align: "right" });
    y += 12;
    doc.moveTo(48, y).lineTo(547, y).strokeColor("#e5e7eb").stroke();
    y += 8;

    for (const line of receipt.invoice.lines.slice(0, 12)) {
      if (y > 700) break;

      doc.fontSize(9).fillColor("#111").text(line.description, 48, y, {
        width: 235,
      });
      doc.fillColor("#555").text(line.category, 300, y, { width: 100 });
      doc.fillColor("#111").text(formatCedis(line.amountPesewas), 430, y, {
        width: 70,
        align: "right",
      });

      y += 22;
    }

    y += 8;

    const ref =
      receipt.feePayment?.reference ||
      receipt.feePayment?.paymentTransaction?.providerReference;

    if (ref) {
      doc.fontSize(9).fillColor("#666").text("Payment Reference", 48, y);
      doc.fontSize(8).fillColor("#111").text(ref, 160, y, { width: 360 });
      y += 22;
    }

    if (receipt.note) {
      doc.fontSize(9).fillColor("#666").text("Note", 48, y);
      doc.fontSize(8).fillColor("#111").text(receipt.note, 160, y, { width: 360 });
      y += 35;
    }

    doc.moveTo(48, 735).lineTo(547, 735).strokeColor("#ddd").stroke();
    doc.fontSize(8).fillColor("#555").text(`Issued by: ${issuedByName}`, 48, 748);
    doc.text(
      "This is a system-generated receipt from EduLife OS. Keep it as proof of payment.",
      48,
      762
    );
    doc.fontSize(7).fillColor("#777").text(`Receipt ID: ${receipt.id}`, 48, 776);

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
    return NextResponse.json(
      { ok: false, error: "FAILED_TO_GENERATE_RECEIPT_PDF" },
      { status: 500 }
    );
  }
}