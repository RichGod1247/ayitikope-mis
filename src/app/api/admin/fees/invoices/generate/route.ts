// src/app/api/admin/fees/invoices/generate/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import { assertNoTenantOverride } from "@/lib/tenantGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonNoStore(payload: any, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

type Body = {
  tenantId?: string; // back-compat only
  classroomId?: string;
  feeStructureId?: string;
};

export async function POST(req: NextRequest) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["SCHOOL_ADMIN", "ADMIN", "SUPERADMIN"],
  });
  if (!auth.ok) return auth.res;

  const tenantId = auth.ctx.tenantId;

  const ct = req.headers.get("content-type") || "";
  if (!ct.toLowerCase().includes("application/json")) {
    return jsonNoStore({ ok: false, error: "CONTENT_TYPE_MUST_BE_JSON" }, 415);
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return jsonNoStore({ ok: false, error: "INVALID_JSON" }, 400);
  }

  const guard = assertNoTenantOverride(body?.tenantId ?? null, tenantId);
  if (!guard.ok) return jsonNoStore({ ok: false, error: guard.error }, guard.status);

  const classroomId = String(body?.classroomId ?? "").trim();
  const feeStructureId = String(body?.feeStructureId ?? "").trim();
  if (!classroomId || !feeStructureId) {
    return jsonNoStore({ ok: false, error: "classroomId and feeStructureId are required." }, 400);
  }

  try {
    const structure = await prisma.feeStructure.findFirst({
      where: { id: feeStructureId, tenantId },
      select: { id: true, name: true, term: true, academicYear: true, amountPesewas: true },
    });

    if (!structure) return jsonNoStore({ ok: false, error: "FEE_STRUCTURE_NOT_FOUND" }, 404);

    const term = String(structure.term ?? "").trim();
    const academicYear = String(structure.academicYear ?? "").trim();
    const amountPesewas = Math.max(0, Number(structure.amountPesewas ?? 0));

    if (!term || !academicYear) {
      return jsonNoStore({ ok: false, error: "FEE_STRUCTURE_MISSING_TERM_OR_YEAR" }, 409);
    }

    const students = await prisma.student.findMany({
      where: { tenantId, classroomId },
      select: { id: true },
      take: 6000,
    });

    if (students.length === 0) {
      return jsonNoStore(
        { ok: true, createdCount: 0, existingCount: 0, totalLearners: 0, message: "No learners in this classroom." },
        200
      );
    }

    const data = students.map((s) => ({
      tenantId,
      studentId: s.id,
      term,
      academicYear,
      totalBilledPesewas: amountPesewas,
      totalWaivedPesewas: 0,
      note: structure.name ?? null,
    }));

    const created = await prisma.feeInvoice.createMany({
      data,
      skipDuplicates: true, // @@unique([tenantId, studentId, term, academicYear])
    });

    const createdCount = created?.count ?? 0;
    const existingCount = Math.max(0, students.length - createdCount);

    return jsonNoStore(
      {
        ok: true,
        structureId: structure.id,
        structureName: structure.name,
        term,
        academicYear,
        amountPesewas,
        totalLearners: students.length,
        createdCount,
        existingCount,
      },
      200
    );
  } catch (err) {
    console.error("[ADMIN_FEE_INVOICES_GENERATE_ERROR]", err);
    return jsonNoStore({ ok: false, error: "FAILED_TO_GENERATE_INVOICES" }, 500);
  }
}
