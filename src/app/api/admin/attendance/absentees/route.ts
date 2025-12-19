// src/app/api/admin/attendance/absentees/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantId = searchParams.get("tenantId");
  const dateParam = searchParams.get("date"); // YYYY-MM-DD

  if (!tenantId) {
    return NextResponse.json(
      { ok: false, error: "tenantId is required." },
      { status: 400 }
    );
  }

  if (!dateParam) {
    return NextResponse.json(
      { ok: false, error: "date (YYYY-MM-DD) is required." },
      { status: 400 }
    );
  }

  let date: Date;
  try {
    date = new Date(`${dateParam}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) {
      throw new Error("Invalid date");
    }
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid date format. Use YYYY-MM-DD." },
      { status: 400 }
    );
  }

  try {
    // Use `as any` so we don't fight Prisma types while we align to your real schema
    const client = prisma as any;

    // Assumptions based on your existing schema usage:
    // - client.attendanceSession exists
    // - AttendanceSession has: tenantId, date, classroom, marks
    // - AttendanceSession.marks: AttendanceMark[]
    // - AttendanceMark has: id, status, note, createdAt, studentId, student
    // - AttendanceMark.status is enum with "ABSENT"
    // - AttendanceSession.classroom has: name, grade, arm
    const sessions = await client.attendanceSession.findMany({
      where: {
        tenantId,
        date,
      },
      select: {
        id: true,
        date: true,
        classroom: {
          select: {
            name: true,
            grade: true,
            arm: true,
          },
        },
        marks: {
          where: {
            status: "ABSENT",
          },
          select: {
            id: true,
            status: true,
            note: true,
            createdAt: true,
            student: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                guardianName: true,
                guardianPhone: true,
                classroomId: true,
              },
            },
          },
        },
      },
      orderBy: {
        date: "asc",
      },
    });

    type AbsenteeItem = {
      markId: string;
      studentId: string;
      studentName: string;
      classLabel: string;
      guardianName?: string | null;
      guardianPhone?: string | null;
      note?: string | null;
      date: string;
    };

    const items: AbsenteeItem[] = [];

    for (const session of sessions) {
      // Build class label safely without mixing ?? and ||
      let classLabel = session.classroom?.name as string | undefined;

      if (!classLabel || !classLabel.trim()) {
        const grade = (session.classroom?.grade as string | undefined) ?? "";
        const arm = (session.classroom?.arm as string | undefined) ?? "";
        const combined = [grade, arm].filter(Boolean).join(" ").trim();
        classLabel = combined || "Unknown class";
      }

      for (const m of session.marks) {
        const s = m.student;
        const studentName =
          [s?.firstName, s?.lastName].filter(Boolean).join(" ").trim() ||
          "Unnamed learner";

        items.push({
          markId: m.id,
          studentId: s?.id ?? "",
          studentName,
          classLabel,
          guardianName: s?.guardianName ?? null,
          guardianPhone: s?.guardianPhone ?? null,
          note: m.note ?? null,
          date:
            (session.date &&
              (session.date as unknown as Date).toISOString()) ||
            date.toISOString(),
        });
      }
    }

    return NextResponse.json({
      ok: true,
      items,
      count: items.length,
      date: dateParam,
    });
  } catch (err: any) {
    console.error("[ADMIN_ABSENTEES_ERROR]", err);
    return NextResponse.json(
      {
        ok: false,
        error:
          err?.message ||
          "Failed to load absentee follow-up list. Please try again or contact the administrator.",
      },
      { status: 500 }
    );
  }
}
