// src/app/api/headteacher/students/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// For now we reuse the same demo tenant as in headteacher dashboard.
// Later we can make this dynamic (from auth/session).
const DEMO_TENANT_ID = "cmhhnghn00008vcpgp3fl07fl";

/**
 * GET /api/headteacher/students
 *
 * Returns a simple list of students for the demo tenant.
 * This is for the Headteacher "Students" admin screen.
 */
export async function GET() {
  try {
    const students = await prisma.student.findMany({
      where: {
        tenantId: DEMO_TENANT_ID,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        sex: true,
        dob: true,
        guardianName: true,
        guardianPhone: true,
        note: true,
        classroom: {
          select: {
            id: true,
            name: true,
            grade: true,
            arm: true,
          },
        },
      },
      orderBy: [
        { classroomId: "asc" },
        { firstName: "asc" },
        { lastName: "asc" },
      ],
      take: 500, // safety cap
    });

    const rows = students.map((s) => ({
      id: s.id,
      firstName: s.firstName,
      lastName: s.lastName,
      sex: s.sex ?? "",
      dob: s.dob ? s.dob.toISOString().slice(0, 10) : "",
      guardianName: s.guardianName ?? "",
      guardianPhone: s.guardianPhone ?? "",
      note: s.note ?? "",
      classroomName: s.classroom?.name ?? "",
    }));

    return NextResponse.json(
      {
        ok: true,
        count: rows.length,
        students: rows,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("[HEAD_STUDENTS_GET_ERROR]", err);
    return NextResponse.json(
      {
        ok: false,
        error:
          "Failed to load students. Please try again or contact the system administrator.",
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/headteacher/students
 *
 * Body JSON:
 * {
 *   id: string;                     // required
 *   firstName?: string;
 *   lastName?: string;
 *   sex?: string;
 *   dob?: string;                   // "YYYY-MM-DD"
 *   guardianName?: string;
 *   guardianPhone?: string;
 *   note?: string;
 * }
 *
 * Updates basic student fields for the demo tenant.
 */
export async function PATCH(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as
      | {
          id?: string;
          firstName?: string;
          lastName?: string;
          sex?: string;
          dob?: string;
          guardianName?: string;
          guardianPhone?: string;
          note?: string;
        }
      | null;

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { ok: false, error: "Invalid JSON body." },
        { status: 400 }
      );
    }

    const { id, firstName, lastName, sex, dob, guardianName, guardianPhone, note } =
      body;

    if (!id || typeof id !== "string") {
      return NextResponse.json(
        { ok: false, error: "Student id is required." },
        { status: 400 }
      );
    }

    const data: any = {};

    if (typeof firstName === "string") data.firstName = firstName.trim();
    if (typeof lastName === "string") data.lastName = lastName.trim();
    if (typeof sex === "string") data.sex = sex.trim() || null;
    if (typeof guardianName === "string")
      data.guardianName = guardianName.trim() || null;
    if (typeof guardianPhone === "string")
      data.guardianPhone = guardianPhone.trim() || null;
    if (typeof note === "string") data.note = note.trim() || null;

    if (typeof dob === "string" && dob.trim()) {
      const parsed = new Date(dob.trim());
      if (!Number.isNaN(parsed.getTime())) {
        data.dob = parsed;
      }
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "No valid fields to update. Provide at least one of: firstName, lastName, sex, dob, guardianName, guardianPhone, note.",
        },
        { status: 400 }
      );
    }

    const updated = await prisma.student.update({
      where: {
        id,
      },
      data,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        sex: true,
        dob: true,
        guardianName: true,
        guardianPhone: true,
        note: true,
      },
    });

    return NextResponse.json(
      {
        ok: true,
        student: {
          ...updated,
          dob: updated.dob
            ? updated.dob.toISOString().slice(0, 10)
            : "",
        },
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("[HEAD_STUDENTS_PATCH_ERROR]", err);
    return NextResponse.json(
      {
        ok: false,
        error:
          "Failed to update student. Please try again or contact the system administrator.",
      },
      { status: 500 }
    );
  }
}
