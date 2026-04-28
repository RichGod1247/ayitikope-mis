// src/app/api/admin/scholarships/award/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/apiAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(status: number, payload: unknown) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

type AwardBody = {
  applicationId?: string;
  studentId: string;
  invoiceId: string;
  supportKind: string;
  amountPesewas: number;
  reason: string;
  fundingLabel?: string;
  sponsorProfileId?: string;
  applicableTerm: string;
  applicableAcademicYear: string;
};

const VALID_SUPPORT_KINDS = new Set([
  "FULL_WAIVER",
  "PARTIAL_WAIVER",
  "SUBSIDY",
  "SCHOLARSHIP",
]);

export async function POST(req: NextRequest) {
  const gate = await requireApiUserContext({
    requireTenant: true,
    requireRoleNames: ["SCHOOL_ADMIN", "HEADTEACHER"],
  });
  if (!gate.ok) return gate.res;

  const ct = req.headers.get("content-type") || "";
  if (!ct.toLowerCase().includes("application/json")) {
    return json(415, { ok: false, error: "CONTENT_TYPE_MUST_BE_JSON" });
  }

  let body: Partial<AwardBody>;
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, error: "Invalid JSON" });
  }

  const { tenantId, userId } = gate.ctx;

  // Validate required fields
  const studentId = String(body.studentId ?? "").trim();
  const invoiceId = String(body.invoiceId ?? "").trim();
  const supportKind = String(body.supportKind ?? "").trim().toUpperCase();
  const amountPesewas = Number(body.amountPesewas);
  const reason = String(body.reason ?? "").trim();
  const applicableTerm = String(body.applicableTerm ?? "").trim();
  const applicableAcademicYear = String(body.applicableAcademicYear ?? "").trim();
  const applicationId = String(body.applicationId ?? "").trim() || null;
  const fundingLabel = String(body.fundingLabel ?? "").trim() || null;
  const sponsorProfileId = String(body.sponsorProfileId ?? "").trim() || null;

  if (!studentId) return json(400, { ok: false, error: "studentId is required" });
  if (!invoiceId) return json(400, { ok: false, error: "invoiceId is required" });
  if (!supportKind || !VALID_SUPPORT_KINDS.has(supportKind)) {
    return json(400, { ok: false, error: `supportKind must be one of: ${[...VALID_SUPPORT_KINDS].join(", ")}` });
  }
  if (!amountPesewas || !Number.isInteger(amountPesewas) || amountPesewas <= 0) {
    return json(400, { ok: false, error: "amountPesewas must be a positive integer (in pesewas)" });
  }
  if (!reason) return json(400, { ok: false, error: "reason is required" });
  if (!applicableTerm) return json(400, { ok: false, error: "applicableTerm is required" });
  if (!applicableAcademicYear) return json(400, { ok: false, error: "applicableAcademicYear is required" });

  // Verify all referenced records belong to this tenant
  const [invoice, student] = await Promise.all([
    prisma.feeInvoice.findUnique({
      where: { id: invoiceId },
      select: { id: true, tenantId: true, totalBilledPesewas: true, totalWaivedPesewas: true },
    }),
    prisma.student.findUnique({
      where: { id: studentId },
      select: { id: true, tenantId: true },
    }),
  ]);

  if (!invoice || invoice.tenantId !== tenantId) {
    return json(404, { ok: false, error: "Invoice not found" });
  }
  if (!student || student.tenantId !== tenantId) {
    return json(404, { ok: false, error: "Student not found" });
  }

  if (applicationId) {
    const app = await prisma.scholarshipApplication.findUnique({
      where: { id: applicationId },
      select: { id: true, tenantId: true },
    });
    if (!app || app.tenantId !== tenantId) {
      return json(404, { ok: false, error: "Scholarship application not found" });
    }
  }

  if (sponsorProfileId) {
    const sponsor = await prisma.sponsorProfile.findUnique({
      where: { id: sponsorProfileId },
      select: { id: true, tenantId: true },
    });
    if (!sponsor || sponsor.tenantId !== tenantId) {
      return json(404, { ok: false, error: "Sponsor profile not found" });
    }
  }

  const now = new Date();

  // Execute everything atomically
  const result = await prisma.$transaction(async (tx) => {
    // 1. Create ScholarshipAward
    const award = await tx.scholarshipAward.create({
      data: {
        tenantId,
        applicationId,
        studentId,
        supportKind,
        amountPesewas,
        reason,
        fundingLabel,
        sponsorProfileId,
        applicableTerm,
        applicableAcademicYear,
        status: "ACTIVE",
        approvedAt: now,
        approvedByUserId: userId,
      },
    });

    // 2. Create FeeAdjustment linked to award
    const adjustment = await tx.feeAdjustment.create({
      data: {
        tenantId,
        invoiceId,
        studentId,
        scholarshipAwardId: award.id,
        kind: supportKind,
        amountPesewas,
        reason,
        createdByUserId: userId,
      },
    });

    // 3. Create LedgerEntry (credit against invoice)
    const ledgerEntry = await tx.ledgerEntry.create({
      data: {
        tenantId,
        invoiceId,
        studentId,
        feeAdjustmentId: adjustment.id,
        entryType: "ADJUSTMENT_CREDIT",
        amountPesewas,
        description: `${supportKind} – ${reason}`,
        createdByUserId: userId,
      },
    });

    // 4. Update invoice totalWaivedPesewas
    const updatedInvoice = await tx.feeInvoice.update({
      where: { id: invoiceId },
      data: {
        totalWaivedPesewas: {
          increment: amountPesewas,
        },
      },
      select: {
        id: true,
        totalBilledPesewas: true,
        totalWaivedPesewas: true,
      },
    });

    // 5. Update ScholarshipApplication status to APPROVED if provided
    if (applicationId) {
      await tx.scholarshipApplication.update({
        where: { id: applicationId },
        data: {
          status: "APPROVED",
          reviewedAt: now,
          reviewedByUserId: userId,
          reviewNote: `Award approved: ${supportKind} of GH₵${(amountPesewas / 100).toFixed(2)}`,
        },
      });
    }

    return { award, adjustment, ledgerEntry, invoice: updatedInvoice };
  });

  const outstandingPesawas =
    result.invoice.totalBilledPesewas - result.invoice.totalWaivedPesewas;

  return json(201, {
    ok: true,
    awardId: result.award.id,
    adjustmentId: result.adjustment.id,
    ledgerEntryId: result.ledgerEntry.id,
    invoice: {
      id: result.invoice.id,
      totalBilledPesewas: result.invoice.totalBilledPesewas,
      totalWaivedPesewas: result.invoice.totalWaivedPesewas,
      outstandingPesawas,
    },
  });
}
