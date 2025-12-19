// src/app/api/parents/my-children/attendance/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Parent-facing attendance history for a single child.
 *
 * Query params:
 * - studentId: string (required)
 * - tenantId: string (optional, currently not used in the where clause because
 *   AttendanceMark in your schema does not have a tenantId column).
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const studentId = searchParams.get("studentId") || "";
  // We still accept tenantId for future-proofing, but we won't filter on it
  // because AttendanceMark does not have a tenantId field.
  const _tenantId = searchParams.get("tenantId") || undefined;

  if (!studentId.trim()) {
    return NextResponse.json(
      { ok: false, error: "studentId is required." },
      { status: 400 }
    );
  }

  try {
    // AttendanceMark schema in your project:
    // - id, sessionId, studentId, status, note, createdAt, updatedAt, ...
    // - relation: attendanceMark.session -> attendanceSession
    //
    // attendanceSession has:
    // - date, classroomId, isClosed, certifiedAt, ...
    // - relation: classroom -> { name, arm, ... }
    //
    // So we only filter by studentId here.
    const marks = await prisma.attendanceMark.findMany({
      where: {
        studentId: studentId.trim(),
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 20, // last 20 records is enough for parent preview
      select: {
        id: true,
        status: true,
        note: true,
        createdAt: true,
        session: {
          select: {
            date: true,
            classroom: {
              select: {
                name: true,
                arm: true,
              },
            },
          },
        },
      },
    });

    const items = marks.map((m) => {
      // Prefer the session date if available, else fall back to createdAt
      const sessionDate = m.session?.date ?? m.createdAt;

      const classLabel = m.session?.classroom
        ? [m.session.classroom.name, m.session.classroom.arm]
            .filter(Boolean)
            .join(" ")
        : null;

      return {
        id: m.id,
        date: sessionDate.toISOString(), // client will format
        classLabel,
        status: m.status,
        note: m.note ?? null,
      };
    });

    return NextResponse.json({ ok: true, items });
  } catch (err) {
    console.error("[PARENT_CHILD_ATTENDANCE_ERROR]", err);
    return NextResponse.json(
      {
        ok: false,
        error:
          "Failed to load attendance history for this learner. Please try again or contact the school.",
      },
      { status: 500 }
    );
  }
}
