// src/app/api/parents/my-children/fees/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Parent-side endpoint:
 * GET /api/parents/my-children/fees?tenantId=...&studentId=...&term=...&academicYear=...
 *
 * Returns a gentle, read-only summary of fees for one learner
 * for a given term + academic year.
 *
 * This is deliberately narrow:
 * - 1 learner
 * - 1 term
 * - 1 academic year
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantId = searchParams.get("tenantId") ?? "";
  const studentId = searchParams.get("studentId") ?? "";
  const term = searchParams.get("term") ?? "";
  const academicYear = searchParams.get("academicYear") ?? "";

  if (!tenantId) {
    return NextResponse.json(
      { ok: false, error: "tenantId is required." },
      { status: 400 }
    );
  }

  if (!studentId) {
    return NextResponse.json(
      { ok: false, error: "studentId is required." },
      { status: 400 }
    );
  }

  if (!term || !academicYear) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "term and academicYear are required to view fee information for this learner.",
      },
      { status: 400 }
    );
  }

  try {
    // We assume your Prisma models:
    // model FeeInvoice {
    //   id                 String   @id @default(cuid())
    //   tenantId           String
    //   studentId          String
    //   term               String
    //   academicYear       String
    //   totalBilledPesewas Int
    //   totalWaivedPesewas Int @default(0)
    //   note               String?
    //   createdAt          DateTime @default(now())
    //   updatedAt          DateTime @updatedAt
    //
    //   tenant   Tenant   @relation(fields: [tenantId], references: [id])
    //   student  Student  @relation(fields: [studentId], references: [id])
    //   payments FeePayment[]
    // }
    //
    // model FeePayment {
    //   id            String @id @default(cuid())
    //   tenantId      String
    //   invoiceId     String
    //   amountPesewas Int
    //   method        String
    //   reference     String?
    //   channel       String?
    //   paidAt        DateTime @default(now())
    //   createdAt     DateTime @default(now())
    //
    //   tenant  Tenant    @relation(fields: [tenantId], references: [id])
    //   invoice FeeInvoice @relation(fields: [invoiceId], references: [id])
    // }

    const invoice = await prisma.feeInvoice.findFirst({
      where: {
        tenantId,
        studentId,
        term,
        academicYear,
      },
      orderBy: {
        createdAt: "desc",
      },
      include: {
        payments: true,
      },
    });

    if (!invoice) {
      // No invoice yet for this learner/term/year
      return NextResponse.json(
        {
          ok: true,
          item: null,
          message:
            "No fee invoice has been generated yet for this learner for the selected term and academic year.",
        },
        { status: 200 }
      );
    }

    // Compute totals in pesewas (integers)
    const billed = invoice.totalBilledPesewas || 0;
    const waived = invoice.totalWaivedPesewas || 0;

    const paid = (invoice.payments || []).reduce((sum: number, p) => {
      return sum + (p.amountPesewas || 0);
    }, 0);

    const netBilled = billed - waived;
    const balance = netBilled - paid;

    const lastPayment =
      invoice.payments && invoice.payments.length
        ? invoice.payments.reduce((latest, p) => {
            if (!latest) return p;
            return p.paidAt > latest.paidAt ? p : latest;
          }, invoice.payments[0])
        : null;

    return NextResponse.json(
      {
        ok: true,
        item: {
          invoiceId: invoice.id,
          term: invoice.term,
          academicYear: invoice.academicYear,
          billedPesewas: billed,
          waivedPesewas: waived,
          netBilledPesewas: netBilled,
          paidPesewas: paid,
          balancePesewas: balance,
          note: invoice.note ?? null,
          lastPaymentAt: lastPayment?.paidAt ?? null,
          lastPaymentAmountPesewas: lastPayment?.amountPesewas ?? null,
          payments: (invoice.payments || [])
            .sort((a, b) => a.paidAt.getTime() - b.paidAt.getTime())
            .map((p) => ({
              id: p.id,
              amountPesewas: p.amountPesewas,
              method: p.method,
              reference: p.reference ?? null,
              channel: p.channel ?? null,
              paidAt: p.paidAt,
            })),
        },
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("[PARENT_CHILD_FEES_ERROR]", err);
    return NextResponse.json(
      {
        ok: false,
        error:
          "Failed to load fee information for this learner. Please try again or contact the school.",
      },
      { status: 500 }
    );
  }
}
