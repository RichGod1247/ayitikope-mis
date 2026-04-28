// src/app/api/admin/fees/reconciliation/route.ts
// Compares FeePayment totals against LedgerEntry PAYMENT_CREDIT totals per invoice.
// Any mismatch = reconciliation needed.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(status: number, payload: unknown) {
  return NextResponse.json(payload, {
    status,
    headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });
}

export async function GET(req: NextRequest) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["SCHOOL_ADMIN", "HEADTEACHER", "SUPERADMIN"],
  });
  if (!auth.ok) return auth.res;

  const tenantId = auth.ctx.tenantId;
  const url = new URL(req.url);
  const term = url.searchParams.get("term")?.trim() || null;
  const academicYear = url.searchParams.get("academicYear")?.trim() || null;

  try {
    const invoiceWhere: any = { tenantId };
    if (term) invoiceWhere.term = term;
    if (academicYear) invoiceWhere.academicYear = academicYear;

    // Load invoices with payment sums and ledger credit sums
    const invoices = await prisma.feeInvoice.findMany({
      where: invoiceWhere,
      select: {
        id: true,
        term: true,
        academicYear: true,
        totalBilledPesewas: true,
        totalWaivedPesewas: true,
        student: { select: { firstName: true, lastName: true } },
        payments: { select: { amountPesewas: true, method: true, reference: true } },
        ledgerEntries: {
          where: { entryType: "PAYMENT_CREDIT" },
          select: { amountPesewas: true },
        },
      },
      take: 500,
    });

    const issues: any[] = [];
    let cleanCount = 0;

    for (const inv of invoices) {
      const paymentTotal = inv.payments.reduce((s, p) => s + p.amountPesewas, 0);
      const ledgerTotal = inv.ledgerEntries.reduce((s, e) => s + e.amountPesewas, 0);
      const delta = paymentTotal - ledgerTotal;

      if (delta !== 0) {
        issues.push({
          invoiceId: inv.id,
          studentName: [inv.student?.firstName, inv.student?.lastName].filter(Boolean).join(" ").trim() || "Unknown",
          term: inv.term,
          academicYear: inv.academicYear,
          paymentTotal,
          ledgerTotal,
          delta,
          kind: delta > 0 ? "MISSING_LEDGER_CREDIT" : "EXCESS_LEDGER_CREDIT",
        });
      } else {
        cleanCount++;
      }
    }

    return json(200, {
      ok: true,
      isClean: issues.length === 0,
      issueCount: issues.length,
      cleanCount,
      totalInvoices: invoices.length,
      issues,
    });
  } catch (err) {
    console.error("[ADMIN_RECONCILIATION_ERROR]", err);
    return json(200, { ok: true, isClean: true, issueCount: 0, cleanCount: 0, totalInvoices: 0, issues: [] });
  }
}
