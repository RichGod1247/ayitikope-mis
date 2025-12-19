// src/app/api/parent/attendance/summary/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/parent/attendance/summary?studentId=...&term=...&academicYear=...
 *
 * Jason rules:
 *  - Always JSON: { ok:boolean, ... }
 *  - 400 when studentId missing
 *  - 200 + ok:true on success (even if all zeros)
 *
 * LIVE IMPLEMENTATION (v1):
 *  1) Load the student to discover tenantId.
 *  2) Compute an approximate date range for the given term + academicYear.
 *  3) Load all AttendanceMark rows for that learner within that range.
 *  4) Aggregate:
 *      - totalSessions (distinct sessionId)
 *      - daysPresent / daysAbsent / daysLate / daysExcused
 *      - attendanceRate = (present + excused) / totalSessions * 100
 *
 * NOTE:
 *  For now, the term date windows are approximated as:
 *    - 1st Term: Jan 1 – Apr 30 of the first year in academicYear (e.g. 2025/2026 -> 2025-01-01 .. 2025-04-30)
 *    - 2nd Term: May 1 – Aug 31 of that year
 *    - 3rd Term: Sep 1 – Dec 31 of that year
 *  Once EduLife OS has a proper TermCalendar model, this route can be
 *  updated to use real term start/end dates per tenant.
 */

type TermRange = {
  start: Date | null;
  end: Date | null;
  note: string;
};

function parseAcademicYear(academicYear: string): { firstYear: number } | null {
  // Expect formats like "2025/2026" or "2025-2026"
  const parts = academicYear.split(/[\/\-]/).map((p) => p.trim());
  if (!parts.length) return null;
  const firstYear = Number(parts[0]);
  if (!Number.isFinite(firstYear)) return null;
  return { firstYear };
}

function computeTermRange(term: string, academicYear: string): TermRange {
  const parsed = parseAcademicYear(academicYear);
  if (!parsed) {
    return {
      start: null,
      end: null,
      note:
        "Attendance is summarised across all recorded sessions because the academic year format could not be parsed.",
    };
  }

  const { firstYear } = parsed;
  const normalizedTerm = term.toLowerCase();

  let start: Date | null = null;
  let end: Date | null = null;

  if (normalizedTerm.startsWith("1st")) {
    start = new Date(Date.UTC(firstYear, 0, 1));  // Jan 1
    end = new Date(Date.UTC(firstYear, 3, 30, 23, 59, 59, 999)); // Apr 30
  } else if (normalizedTerm.startsWith("2nd")) {
    start = new Date(Date.UTC(firstYear, 4, 1));  // May 1
    end = new Date(Date.UTC(firstYear, 7, 31, 23, 59, 59, 999)); // Aug 31
  } else if (normalizedTerm.startsWith("3rd")) {
    start = new Date(Date.UTC(firstYear, 8, 1));  // Sep 1
    end = new Date(Date.UTC(firstYear, 11, 31, 23, 59, 59, 999)); // Dec 31
  } else {
    return {
      start: null,
      end: null,
      note:
        "Attendance is summarised across all recorded sessions because the term name could not be mapped to a date range.",
    };
  }

  return {
    start,
    end,
    note:
      "Attendance is approximated using a generic term calendar (1st: Jan–Apr, 2nd: May–Aug, 3rd: Sep–Dec). This will be replaced with the exact MoE calendar per tenant.",
  };
}

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
        {
          ok: false,
          error: "studentId is required.",
        },
        { status: 400 }
      );
    }

    const client = prisma as any;

    // 1) Load student to get tenantId
    const student = await client.student.findUnique({
      where: { id: studentId },
      select: {
        id: true,
        tenantId: true,
        firstName: true,
        lastName: true,
      },
    });

    if (!student) {
      return NextResponse.json(
        {
          ok: false,
          error: "Student not found.",
        },
        { status: 404 }
      );
    }

    const tenantId = student.tenantId as string;

    // 2) Compute term date range
    const { start, end, note: rangeNote } = computeTermRange(
      term,
      academicYear
    );

    // 3) Load AttendanceMark rows for this learner (+ tenant + optional date range)
    const whereClause: any = {
      studentId: student.id,
      session: {
        tenantId,
      },
    };

    if (start && end) {
      whereClause.session.date = {
        gte: start,
        lte: end,
      };
    }

    const marks = await client.attendanceMark.findMany({
      where: whereClause,
      select: {
        sessionId: true,
        status: true,
      },
    });

    if (!marks.length) {
      return NextResponse.json(
        {
          ok: true,
          studentId: student.id,
          term,
          academicYear,
          summary: {
            totalSessions: 0,
            daysPresent: 0,
            daysAbsent: 0,
            daysLate: 0,
            daysExcused: 0,
            attendanceRate: null as number | null,
            note:
              "No attendance marks have been recorded yet for this learner in the selected term and academic year (or within the approximated date range).",
          },
        },
        { status: 200 }
      );
    }

    // 4) Aggregate
    const sessionIds = new Set<string>();
    let daysPresent = 0;
    let daysAbsent = 0;
    let daysLate = 0;
    let daysExcused = 0;

    for (const m of marks) {
      if (m.sessionId) {
        sessionIds.add(m.sessionId);
      }
      switch (m.status) {
        case "PRESENT":
          daysPresent++;
          break;
        case "ABSENT":
          daysAbsent++;
          break;
        case "LATE":
          daysLate++;
          break;
        case "EXCUSED":
          daysExcused++;
          break;
        default:
          break;
      }
    }

    const totalSessions = sessionIds.size || marks.length;
    let attendanceRate: number | null = null;

    if (totalSessions > 0) {
      const effectivePresent = daysPresent + daysExcused;
      attendanceRate = Number(
        ((effectivePresent / totalSessions) * 100).toFixed(1)
      );
    }

    const summary = {
      totalSessions,
      daysPresent,
      daysAbsent,
      daysLate,
      daysExcused,
      attendanceRate,
      note:
        rangeNote +
        " Attendance rate counts PRESENT + EXCUSED as 'attended' out of distinct attendance sessions.",
    };

    return NextResponse.json(
      {
        ok: true,
        studentId: student.id,
        term,
        academicYear,
        summary,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("[PARENT_ATTENDANCE_SUMMARY_ERROR]", err);
    return NextResponse.json(
      {
        ok: false,
        error:
          "Failed to load attendance summary for this learner. Please try again.",
      },
      { status: 500 }
    );
  }
}
