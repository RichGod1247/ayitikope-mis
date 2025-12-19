// src/app/api/parents/my-children/attendance-summary/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Parent-facing attendance summary for a single child.
 *
 * Query params:
 * - studentId: string (required)
 * - days: number (optional, default 60) — lookback window in days
 *
 * This does NOT change any existing behavior; it just powers
 * future "overview" cards on the parent portal.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const studentId = searchParams.get("studentId") || "";
  const daysParam = searchParams.get("days");
  const days = daysParam ? Math.max(1, Number(daysParam) || 60) : 60;

  if (!studentId.trim()) {
    return NextResponse.json(
      { ok: false, error: "studentId is required." },
      { status: 400 }
    );
  }

  try {
    const now = new Date();
    const windowStart = new Date(
      now.getTime() - days * 24 * 60 * 60 * 1000
    );

    // attendanceMark schema in your project:
    // - id, sessionId, studentId, status, note, createdAt, updatedAt, ...
    //   where `status` is an enum like: PRESENT | ABSENT | LATE | EXCUSED.
    const marks = await prisma.attendanceMark.findMany({
      where: {
        studentId: studentId.trim(),
        createdAt: {
          gte: windowStart,
        },
      },
      select: {
        status: true,
      },
    });

    const total = marks.length;

    // Initialize counters
    let present = 0;
    let absent = 0;
    let late = 0;
    let excused = 0;

    for (const m of marks) {
      switch (m.status) {
        case "PRESENT":
          present++;
          break;
        case "ABSENT":
          absent++;
          break;
        case "LATE":
          late++;
          break;
        case "EXCUSED":
          excused++;
          break;
        default:
        // ignore unknown statuses if any
      }
    }

    const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);

    return NextResponse.json({
      ok: true,
      windowStart: windowStart.toISOString(),
      windowEnd: now.toISOString(),
      days,
      total,
      counts: {
        present,
        absent,
        late,
        excused,
      },
      percentages: {
        present: pct(present),
        absent: pct(absent),
        late: pct(late),
        excused: pct(excused),
      },
    });
  } catch (err) {
    console.error("[PARENT_CHILD_ATTENDANCE_SUMMARY_ERROR]", err);
    return NextResponse.json(
      {
        ok: false,
        error:
          "Failed to load attendance summary for this learner. Please try again or contact the school.",
      },
      { status: 500 }
    );
  }
}
