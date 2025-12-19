// src/app/api/student/attendance/summary/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/student/attendance/summary?studentId=...&term=...&academicYear=...
 *
 * JSON rules:
 *  - Always returns JSON: { ok: boolean, ... }
 *  - 400 when studentId missing
 *  - 404 when student not found
 *  - 200 + ok:true on success (even if all zeros)
 *
 * NOTE (v1):
 *  - For now, we aggregate **all** attendance marks for this learner.
 *    The term/academicYear parameters are accepted and passed back
 *    but not yet used to filter by date — that will be layered in once
 *    we have a proper academic calendar table.
 */

type AttendanceStatus = "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const studentId = (searchParams.get("studentId") || "").trim();
    const term = (searchParams.get("term") || "1st Term").trim();
    const academicYear = (
      searchParams.get("academicYear") || "2025/2026"
    ).trim();

    if (!studentId) {
      return NextResponse.json(
        { ok: false, error: "studentId is required." },
        { status: 400 }
      );
    }

    const client = prisma as any;

    // 1) Load the student so we know tenant + class
    const student = await client.student.findUnique({
      where: { id: studentId },
      select: {
        id: true,
        tenantId: true,
        firstName: true,
        lastName: true,
        classroom: {
          select: {
            id: true,
            name: true,
            grade: true,
            arm: true,
          },
        },
      },
    });

    if (!student) {
      return NextResponse.json(
        { ok: false, error: "Student not found." },
        { status: 404 }
      );
    }

    const tenantId = student.tenantId as string;

    // 2) Load all attendance marks for this learner
    //    (later we can add date filtering by term/year)
    const marks = await client.attendanceMark.findMany({
      where: {
        tenantId,
        studentId: student.id,
      },
      select: {
        id: true,
        status: true,
        createdAt: true,
        session: {
          select: {
            id: true,
            date: true,
            type: true,
          },
        },
      },
      orderBy: {
        session: {
          date: "asc",
        },
      },
    });

    const totalMarks = marks.length;

    let present = 0;
    let absent = 0;
    let late = 0;
    let excused = 0;

    for (const m of marks) {
      const status = m.status as AttendanceStatus | null;

      if (status === "PRESENT") present += 1;
      else if (status === "ABSENT") absent += 1;
      else if (status === "LATE") late += 1;
      else if (status === "EXCUSED") excused += 1;
    }

    const presentEffective = present + late; // treat late as attended
    const presentPercent =
      totalMarks > 0 ? (presentEffective / totalMarks) * 100 : 0;

    // Build a small "recent history" list (up to last 12 entries)
    const recent = [...marks]
      .slice(-12)
      .map((m) => ({
        id: m.id as string,
        date: m.session?.date
          ? new Date(m.session.date).toISOString().slice(0, 10)
          : null,
        type: m.session?.type ?? null,
        status: m.status as string | null,
      }));

    const classroomLabel = student.classroom
      ? [
          student.classroom.grade,
          student.classroom.name || student.classroom.arm,
        ]
          .filter(Boolean)
          .join(" · ")
      : null;

    return NextResponse.json(
      {
        ok: true,
        student: {
          id: student.id,
          name: [student.firstName, student.lastName]
            .filter(Boolean)
            .join(" "),
          classroom: classroomLabel,
        },
        term,
        academicYear,
        stats: {
          totalMarks,
          present,
          absent,
          late,
          excused,
          presentPercent: Number(presentPercent.toFixed(1)),
        },
        recent,
        note:
          totalMarks === 0
            ? "No attendance marks have been recorded yet for this learner in EduLife OS."
            : "This summary is based on all attendance marks recorded for this learner in EduLife OS. Term- and year-specific filtering will be layered in once the academic calendar is fully configured.",
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("[STUDENT_ATTENDANCE_SUMMARY_ERROR]", err);
    return NextResponse.json(
      {
        ok: false,
        error:
          "Failed to load attendance summary for this learner. Please try again or contact the school office.",
      },
      { status: 500 }
    );
  }
}
