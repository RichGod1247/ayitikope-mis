// src/app/api/students/[id]/route.ts
import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma"; // <-- fixed: up 4 levels

// GET /api/students/[id]  -> fetch one student
export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const student = await prisma.student.findUnique({
      where: { id: params.id },
    });
    if (!student) {
      return NextResponse.json(
        { ok: false, error: "Student not found" },
        { status: 404 }
      );
    }
    return NextResponse.json({ ok: true, item: student });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Failed to fetch student" },
      { status: 500 }
    );
  }
}

// PATCH /api/students/[id]  -> update a student (partial)
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json();

    const data: any = {};
    if (typeof body.firstName === "string") data.firstName = body.firstName;
    if (typeof body.lastName === "string") data.lastName = body.lastName;
    if (typeof body.sex === "string" || body.sex === null) data.sex = body.sex;
    if (typeof body.guardianName === "string" || body.guardianName === null)
      data.guardianName = body.guardianName;
    if (typeof body.guardianPhone === "string" || body.guardianPhone === null)
      data.guardianPhone = body.guardianPhone;
    if (typeof body.classroomId === "string" || body.classroomId === null)
      data.classroomId = body.classroomId;

    if (body.dob === null) {
      data.dob = null;
    } else if (typeof body.dob === "string") {
      const d = new Date(body.dob);
      if (!isNaN(d.getTime())) data.dob = d;
    }

    const updated = await prisma.student.update({
      where: { id: params.id },
      data,
    });

    return NextResponse.json({ ok: true, item: updated });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Failed to update student" },
      { status: 500 }
    );
  }
}

// DELETE /api/students/[id]  -> remove a student
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    await prisma.student.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Failed to delete student" },
      { status: 500 }
    );
  }
}
