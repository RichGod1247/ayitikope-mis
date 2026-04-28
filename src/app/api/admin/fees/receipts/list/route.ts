// src/app/api/admin/fees/receipts/list/route.ts
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

export async function GET(req: NextRequest) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["SCHOOL_ADMIN", "ADMIN", "SUPERADMIN"],
  });
  if (!auth.ok) return auth.res;

  const tenantId = auth.ctx.tenantId;
  const url = new URL(req.url);
  const term = url.searchParams.get("term")?.trim() || null;
  const academicYear = url.searchParams.get("academicYear")?.trim() || null;
  const studentId = url.searchParams.get("studentId")?.trim() || null;

  const take = Math.min(500, Math.max(1, Number(url.searchParams.get("take") ?? "200") || 200));

  try {
    const invoiceFilter: any = {};
    if (term) invoiceFilter.term = term;
    if (academicYear) invoiceFilter.academicYear = academicYear;
    if (studentId) invoiceFilter.studentId = studentId;

    const receipts = await prisma.receipt.findMany({
      where: {
        tenantId,
        ...(Object.keys(invoiceFilter).length > 0 ? { invoice: invoiceFilter } : {}),
      },
      select: {
        id: true,
        receiptNumber: true,
        issuedAt: true,
        issuedToName: true,
        issuedToPhone: true,
        feePayment: { select: { amountPesewas: true, method: true, reference: true } },
        invoice: {
          select: {
            term: true,
            academicYear: true,
            student: {
              select: {
                firstName: true,
                lastName: true,
                classroom: { select: { name: true, grade: true } },
              },
            },
          },
        },
        issuedBy: { select: { name: true, firstName: true, lastName: true } },
      },
      orderBy: { issuedAt: "desc" },
      take,
    });

    const items = receipts.map((r) => {
      const studentName = [r.invoice?.student?.firstName, r.invoice?.student?.lastName]
        .filter(Boolean).join(" ").trim() || "Unknown";
      const classLabel = r.invoice?.student?.classroom?.name || r.invoice?.student?.classroom?.grade || "—";
      const issuedByName = r.issuedBy
        ? [r.issuedBy.firstName, r.issuedBy.lastName].filter(Boolean).join(" ").trim() || r.issuedBy.name || "Staff"
        : "Staff";

      return {
        id: r.id,
        receiptNumber: r.receiptNumber,
        issuedAt: r.issuedAt.toISOString(),
        issuedToName: r.issuedToName,
        issuedToPhone: r.issuedToPhone,
        amountPesewas: r.feePayment?.amountPesewas ?? 0,
        method: r.feePayment?.method ?? null,
        reference: r.feePayment?.reference ?? null,
        term: r.invoice?.term ?? null,
        academicYear: r.invoice?.academicYear ?? null,
        studentName,
        classLabel,
        issuedByName,
      };
    });

    return jsonNoStore({ ok: true, items, count: items.length });
  } catch (err) {
    console.error("[ADMIN_RECEIPTS_LIST_ERROR]", err);
    // Return empty list rather than blocking the page — receipts may simply not exist yet
    return jsonNoStore({ ok: true, items: [], count: 0, note: "No receipts found or database error." });
  }
}
