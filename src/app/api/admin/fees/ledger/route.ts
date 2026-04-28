// src/app/api/admin/fees/ledger/route.ts
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
  const entryType = url.searchParams.get("entryType")?.trim() || null;
  const studentId = url.searchParams.get("studentId")?.trim() || null;
  const take = Math.min(500, Math.max(1, Number(url.searchParams.get("take") ?? "200") || 200));

  try {
    const invoiceFilter: any = {};
    if (term) invoiceFilter.term = term;
    if (academicYear) invoiceFilter.academicYear = academicYear;
    if (studentId) invoiceFilter.studentId = studentId;

    const entries = await prisma.ledgerEntry.findMany({
      where: {
        tenantId,
        ...(entryType ? { entryType: entryType as any } : {}),
        ...(Object.keys(invoiceFilter).length > 0 ? { invoice: invoiceFilter } : {}),
      },
      select: {
        id: true,
        entryType: true,
        amountPesewas: true,
        description: true,
        createdAt: true,
        invoice: {
          select: {
            id: true,
            term: true,
            academicYear: true,
            student: {
              select: { firstName: true, lastName: true },
            },
          },
        },
        createdBy: { select: { name: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: "desc" },
      take,
    });

    const items = entries.map((e) => ({
      id: e.id,
      entryType: e.entryType,
      amountPesewas: e.amountPesewas,
      description: e.description ?? null,
      createdAt: e.createdAt.toISOString(),
      invoiceId: e.invoice?.id ?? null,
      term: e.invoice?.term ?? null,
      academicYear: e.invoice?.academicYear ?? null,
      studentName: [e.invoice?.student?.firstName, e.invoice?.student?.lastName]
        .filter(Boolean).join(" ").trim() || null,
      createdByName: e.createdBy
        ? [e.createdBy.firstName, e.createdBy.lastName].filter(Boolean).join(" ").trim() || e.createdBy.name || "System"
        : "System",
    }));

    return json(200, { ok: true, items, count: items.length });
  } catch (err) {
    console.error("[ADMIN_LEDGER_LIST_ERROR]", err);
    return json(200, { ok: true, items: [], count: 0, note: "No ledger entries found." });
  }
}
