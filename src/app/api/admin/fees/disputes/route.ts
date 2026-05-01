// src/app/api/admin/fees/disputes/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DisputeKind =
  | "OVERPAYMENT"
  | "PAYMENT_WITHOUT_RECEIPT"
  | "RECEIPT_WITHOUT_PAYMENT"
  | "DUPLICATE_REFERENCE"
  | "STORED_TOTAL_MISMATCH";

type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

function json(status: number, payload: unknown) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function studentName(s?: { firstName: string | null; lastName: string | null } | null) {
  return [s?.firstName, s?.lastName].filter(Boolean).join(" ").trim() || "Unknown";
}

function clampLimit(v: string | null) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 500;
  return Math.min(Math.max(Math.floor(n), 1), 2000);
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
  const limit = clampLimit(url.searchParams.get("limit"));

  try {
    const invoiceWhere: {
      tenantId: string;
      term?: string;
      academicYear?: string;
    } = { tenantId };

    if (term) invoiceWhere.term = term;
    if (academicYear) invoiceWhere.academicYear = academicYear;

    const invoices = await prisma.feeInvoice.findMany({
      where: invoiceWhere,
      select: {
        id: true,
        term: true,
        academicYear: true,
        totalBilledPesewas: true,
        totalWaivedPesewas: true,
        totalPaidPesewas: true,
        balancePesewas: true,
        student: { select: { firstName: true, lastName: true } },
        payments: {
          select: {
            id: true,
            amountPesewas: true,
            status: true,
            method: true,
            reference: true,
            createdAt: true,
          },
        },
        receipts: {
          select: {
            id: true,
            feePaymentId: true,
            receiptNumber: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    const disputes: Array<{
      kind: DisputeKind;
      severity: Severity;
      invoiceId: string | null;
      studentName: string;
      term: string | null;
      academicYear: string | null;
      providerReference: string | null;
      expectedPesewas: number | null;
      actualPesewas: number | null;
      deltaPesewas: number | null;
      description: string;
    }> = [];

    for (const inv of invoices) {
      const name = studentName(inv.student);
      const billed = inv.totalBilledPesewas ?? 0;
      const waived = inv.totalWaivedPesewas ?? 0;
      const net = Math.max(0, billed - waived);

      const successfulPayments = inv.payments.filter((p) => p.status === "SUCCESS");
      const paid = successfulPayments.reduce((s, p) => s + p.amountPesewas, 0);
      const expectedBalance = Math.max(0, net - paid);

      if (paid > net) {
        disputes.push({
          kind: "OVERPAYMENT",
          severity: "HIGH",
          invoiceId: inv.id,
          studentName: name,
          term: inv.term,
          academicYear: inv.academicYear,
          providerReference: successfulPayments.at(-1)?.reference ?? null,
          expectedPesewas: net,
          actualPesewas: paid,
          deltaPesewas: paid - net,
          description: `Successful payments exceed net billed amount by GHS ${((paid - net) / 100).toFixed(2)}.`,
        });
      }

      if ((inv.totalPaidPesewas ?? 0) !== paid) {
        disputes.push({
          kind: "STORED_TOTAL_MISMATCH",
          severity: "HIGH",
          invoiceId: inv.id,
          studentName: name,
          term: inv.term,
          academicYear: inv.academicYear,
          providerReference: null,
          expectedPesewas: paid,
          actualPesewas: inv.totalPaidPesewas ?? 0,
          deltaPesewas: (inv.totalPaidPesewas ?? 0) - paid,
          description: "Invoice stored paid total does not match successful payment records.",
        });
      }

      if ((inv.balancePesewas ?? 0) !== expectedBalance) {
        disputes.push({
          kind: "STORED_TOTAL_MISMATCH",
          severity: "HIGH",
          invoiceId: inv.id,
          studentName: name,
          term: inv.term,
          academicYear: inv.academicYear,
          providerReference: null,
          expectedPesewas: expectedBalance,
          actualPesewas: inv.balancePesewas ?? 0,
          deltaPesewas: (inv.balancePesewas ?? 0) - expectedBalance,
          description: "Invoice stored balance does not match billed minus waived minus successful payments.",
        });
      }

      const receiptByPaymentId = new Map(inv.receipts.map((r) => [r.feePaymentId, r]));

      for (const payment of successfulPayments) {
        if (!receiptByPaymentId.has(payment.id)) {
          disputes.push({
            kind: "PAYMENT_WITHOUT_RECEIPT",
            severity: "CRITICAL",
            invoiceId: inv.id,
            studentName: name,
            term: inv.term,
            academicYear: inv.academicYear,
            providerReference: payment.reference,
            expectedPesewas: payment.amountPesewas,
            actualPesewas: 0,
            deltaPesewas: payment.amountPesewas,
            description: "Successful payment exists without a receipt.",
          });
        }
      }

      const paymentIds = new Set(inv.payments.map((p) => p.id));

      for (const receipt of inv.receipts) {
        if (!paymentIds.has(receipt.feePaymentId)) {
          disputes.push({
            kind: "RECEIPT_WITHOUT_PAYMENT",
            severity: "CRITICAL",
            invoiceId: inv.id,
            studentName: name,
            term: inv.term,
            academicYear: inv.academicYear,
            providerReference: null,
            expectedPesewas: null,
            actualPesewas: null,
            deltaPesewas: null,
            description: `Receipt ${receipt.receiptNumber} points to a missing payment.`,
          });
        }
      }
    }

    const referencedPayments = await prisma.feePayment.findMany({
      where: {
        tenantId,
        reference: { not: null },
      },
      select: {
        id: true,
        invoiceId: true,
        reference: true,
        amountPesewas: true,
      },
      take: 10000,
    });

    const byRef = new Map<string, typeof referencedPayments>();

    for (const p of referencedPayments) {
      const ref = String(p.reference ?? "").trim();
      if (!ref) continue;
      const bucket = byRef.get(ref) ?? [];
      bucket.push(p);
      byRef.set(ref, bucket);
    }

    for (const [reference, payments] of byRef.entries()) {
      if (payments.length <= 1) continue;

      const total = payments.reduce((s, p) => s + p.amountPesewas, 0);

      disputes.push({
        kind: "DUPLICATE_REFERENCE",
        severity: "CRITICAL",
        invoiceId: payments[0]?.invoiceId ?? null,
        studentName: "Multiple records",
        term,
        academicYear,
        providerReference: reference,
        expectedPesewas: payments[0]?.amountPesewas ?? null,
        actualPesewas: total,
        deltaPesewas: total - (payments[0]?.amountPesewas ?? 0),
        description: "More than one payment uses the same provider/reference value.",
      });
    }

    const highestSeverity =
      disputes.some((d) => d.severity === "CRITICAL")
        ? "CRITICAL"
        : disputes.some((d) => d.severity === "HIGH")
          ? "HIGH"
          : disputes.some((d) => d.severity === "MEDIUM")
            ? "MEDIUM"
            : disputes.some((d) => d.severity === "LOW")
              ? "LOW"
              : null;

    return json(200, {
      ok: true,
      isClean: disputes.length === 0,
      count: disputes.length,
      highestSeverity,
      scannedInvoices: invoices.length,
      disputes,
    });
  } catch (err) {
    console.error("[ADMIN_DISPUTES_ERROR]", err);

    return json(500, {
      ok: false,
      error: "FAILED_TO_SCAN_PAYMENT_DISPUTES",
      isClean: false,
      count: 0,
      disputes: [],
    });
  }
}