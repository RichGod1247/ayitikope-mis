// src/app/api/parent/receipts/list/route.ts
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

export async function GET(req: NextRequest) {
  try {
    const gate = requireParentSession(req as any);
    if (!gate.ok) return gate.res as any;

    const sess = gate.session;
    const tenantId = sess.tenantId;
    const e164 = String(sess.guardianPhoneE164 ?? "").trim();
    const suffix9 = digitsOnly(sess.guardianSuffix9 ?? "");

    const url = new URL(req.url);
    const studentId = url.searchParams.get("studentId")?.trim() || null;

    // Resolve students linked to this guardian
    const OR: any[] = [];
    if (e164) OR.push({ guardianPhoneNorm: e164 });
    if (suffix9.length >= 7) {
      OR.push({ guardianPhone: { endsWith: suffix9 } });
      OR.push({ guardianPhoneNorm: { endsWith: suffix9 } });
    }

    if (OR.length === 0) return noStore(200, { ok: true, receipts: [] });

    const studentWhere: any = { tenantId, OR };
    if (studentId) studentWhere.id = studentId;

    const students = await prisma.student.findMany({
      where: studentWhere,
      select: { id: true },
      take: 50,
    });

    if (!students.length) return noStore(200, { ok: true, receipts: [] });

    const studentIds = students.map((s) => s.id);

    // Receipts for invoices belonging to these students
    const receipts = await prisma.receipt.findMany({
      where: {
        tenantId,
        invoice: { studentId: { in: studentIds } },
      },
      select: {
        id: true,
        receiptNumber: true,
        issuedAt: true,
        issuedToName: true,
        feePayment: { select: { amountPesewas: true, method: true } },
        invoice: {
          select: {
            term: true,
            academicYear: true,
            student: { select: { firstName: true, lastName: true } },
          },
        },
      },
      orderBy: { issuedAt: "desc" },
      take: 200,
    });

    const out = receipts.map((r) => ({
      id: r.id,
      receiptNumber: r.receiptNumber,
      issuedAt: r.issuedAt.toISOString(),
      issuedToName: r.issuedToName,
      amountPesewas: r.feePayment?.amountPesewas ?? 0,
      method: r.feePayment?.method ?? null,
      term: r.invoice?.term ?? null,
      academicYear: r.invoice?.academicYear ?? null,
      studentName: [r.invoice?.student?.firstName, r.invoice?.student?.lastName].filter(Boolean).join(" ").trim() || null,
    }));

    return noStore(200, { ok: true, receipts: out });
  } catch (err) {
    console.error("[PARENT_RECEIPTS_LIST_ERROR]", err);
    // Return empty list so UI shows friendly empty state rather than an error
    return noStore(200, { ok: true, receipts: [], note: "No receipts found yet." });
  }
}
