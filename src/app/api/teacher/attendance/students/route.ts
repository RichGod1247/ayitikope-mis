// src/app/api/teacher/attendance/students/route.ts

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const tenantId = searchParams.get("tenantId");
  const classroomId = searchParams.get("classroomId");

  if (!tenantId || !classroomId) {
    return NextResponse.json(
      {
        ok: false,
        error: "Missing tenantId or classroomId.",
      },
      { status: 400 }
    );
  }

  try {
    const students = await prisma.student.findMany({
      where: {
        tenantId,
        classroomId,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
      },
      orderBy: [
        { lastName: "asc" },
        { firstName: "asc" },
      ],
    });

    return NextResponse.json({
      ok: true,
      count: students.length,
      students,
    });
  } catch (err) {
    console.error("[ATTENDANCE_STUDENTS_ERROR]", err);
    return NextResponse.json(
      {
        ok: false,
        error: "Failed to load students from database.",
      },
      { status: 500 }
    );
  }
}
