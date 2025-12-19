// src/app/api/admin/fees/invoices/generate/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  const tenantId = body?.tenantId as string | undefined;
  const classroomId = body?.classroomId as string | undefined;
  const feeStructureId = body?.feeStructureId as string | undefined;

  if (!tenantId || !classroomId || !feeStructureId) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "tenantId, classroomId and feeStructureId are required to generate invoices.",
      },
      { status: 400 }
    );
  }

  try {
    // Cast to any so TS doesn't complain about newly added models
    const client = prisma as any;

    // 1. Load the fee structure (term, year, amount)
    const structure = await client.feeStructure.findFirst({
      where: {
        id: feeStructureId,
        tenantId,
      },
    });

    if (!structure) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Fee structure not found for this tenant. Please refresh and try again.",
        },
        { status: 404 }
      );
    }

    const term: string = structure.term;
    const academicYear: string = structure.academicYear;
    const amountPesewas: number = structure.amountPesewas ?? 0;

    // 2. Load all students in this class
    const students = await client.student.findMany({
      where: {
        tenantId,
        classroomId,
      },
      orderBy: {
        lastName: "asc",
      },
    });

    if (!students.length) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "No students found in this classroom. Please enroll learners first.",
        },
        { status: 200 }
      );
    }

    // 3. For each student, create invoice if none exists for this term/year
    let createdCount = 0;
    let existingCount = 0;

    for (const s of students) {
      const existing = await client.feeInvoice.findFirst({
        where: {
          tenantId,
          studentId: s.id,
          term,
          academicYear,
        },
      });

      if (existing) {
        existingCount += 1;
        continue;
      }

      await client.feeInvoice.create({
        data: {
          tenantId,
          studentId: s.id,
          term,
          academicYear,
          totalBilledPesewas: amountPesewas,
          totalWaivedPesewas: 0,
          note: structure.name, // keep a hint of which structure
        },
      });

      createdCount += 1;
    }

    // 🔥 IMPORTANT: shape matches what the invoices page expects
    return NextResponse.json(
      {
        ok: true,
        structureId: structure.id,
        structureName: structure.name,
        term,
        academicYear,
        amountPesewas,
        createdCount,
        existingCount,
        totalLearners: students.length,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("[ADMIN_FEE_INVOICES_GENERATE_ERROR]", err);
    return NextResponse.json(
      {
        ok: false,
        error:
          "Failed to generate fee invoices. Please try again or contact the system administrator.",
      },
      { status: 500 }
    );
  }
}
