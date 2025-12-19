// src/app/api/student/dashboard/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Student Dashboard API
 *
 * GET /api/student/dashboard?tenantId=...&studentId=...&term=...&academicYear=...
 *
 * Jason rules:
 *  - Always JSON: { ok:boolean, ... }
 *  - 400 if tenantId missing
 *  - If studentId missing → DEMO MODE (safe static data)
 *  - If studentId present → REAL data for that learner
 *
 * Shape (for StudentPortalClient):
 *
 * {
 *   ok: boolean;
 *   mode: "DEMO" | "REAL";
 *   tenantId: string;
 *   studentName: string;
 *   classLabel: string;
 *   term: string;
 *   academicYear: string;
 *   attendance: {
 *     presentDays: number;
 *     absentDays: number;
 *     lateDays: number;
 *     attendanceRate: number;
 *     last30DaysAttendanceRate: number;
 *   };
 *   assessments: {
 *     latestTermLabel: string;
 *     overallAverage: number;
 *     bestSubject?: string | null;
 *     worstSubject?: string | null;
 *   };
 *   note?: string;
 * }
 */

type AttendanceSummary = {
  presentDays: number;
  absentDays: number;
  lateDays: number;
  attendanceRate: number;
  last30DaysAttendanceRate: number;
};

type AssessmentSummary = {
  latestTermLabel: string;
  overallAverage: number;
  bestSubject?: string | null;
  worstSubject?: string | null;
};

type StudentDashboardResponse = {
  ok: boolean;
  mode: "DEMO" | "REAL";
  tenantId: string;
  studentName: string;
  classLabel: string;
  term: string;
  academicYear: string;
  attendance: AttendanceSummary;
  assessments: AssessmentSummary;
  note?: string;
};

function getThirtyDaysAgo(): Date {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d;
}

function buildDemoResponse(
  tenantId: string,
  term: string,
  academicYear: string
): StudentDashboardResponse {
  return {
    ok: true,
    mode: "DEMO",
    tenantId,
    studentName: "Demo Learner",
    classLabel: "JHS 2 · Demo",
    term,
    academicYear,
    attendance: {
      presentDays: 48,
      absentDays: 2,
      lateDays: 1,
      attendanceRate: 94,
      last30DaysAttendanceRate: 96,
    },
    assessments: {
      latestTermLabel: `${term} ${academicYear}`,
      overallAverage: 82,
      bestSubject: "English Language",
      worstSubject: "Science",
    },
    note:
      "This dashboard is currently in DEMO MODE because studentId was not provided. Once the student login flow is wired, this will show real data for the logged-in learner.",
  };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const tenantId = (searchParams.get("tenantId") || "").trim();
    const studentId = (searchParams.get("studentId") || "").trim();
    const term = (searchParams.get("term") || "1st Term").trim();
    const academicYear = (searchParams.get("academicYear") || "2025/2026").trim();

    if (!tenantId) {
      return NextResponse.json(
        { ok: false, error: "tenantId is required." },
        { status: 400 }
      );
    }

    // DEMO MODE if no studentId
    if (!studentId) {
      const demo = buildDemoResponse(tenantId, term, academicYear);
      return NextResponse.json(demo, { status: 200 });
    }

    const client = prisma as any;

    // 1) Load student + classroom (must belong to tenant)
    const student = await client.student.findFirst({
      where: {
        id: studentId,
        tenantId,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        classroom: {
          select: {
            name: true,
            grade: true,
            arm: true,
          },
        },
      },
    });

    if (!student) {
      return NextResponse.json(
        {
          ok: false,
          error: "Student not found for this tenant.",
        },
        { status: 404 }
      );
    }

    const studentName = `${student.firstName} ${student.lastName}`.trim();
    const classLabel = student.classroom?.name ?? "Unassigned";

    const thirtyDaysAgo = getThirtyDaysAgo();

    // 2) Attendance summary
    let attendance: AttendanceSummary = {
      presentDays: 0,
      absentDays: 0,
      lateDays: 0,
      attendanceRate: 0,
      last30DaysAttendanceRate: 0,
    };

    try {
      const marks = await client.attendanceMark.findMany({
        where: {
          studentId: student.id,
          session: {
            tenantId,
          },
        },
        select: {
          status: true,
          session: {
            select: {
              date: true,
            },
          },
        },
      });

      const totalSessions = marks.length;
      let present = 0;
      let absent = 0;
      let late = 0;
      let excused = 0;

      let last30Total = 0;
      let last30PresentExcused = 0;

      for (const m of marks) {
        const status = m.status as string;
        const sessionDate = m.session?.date ? new Date(m.session.date) : null;

        if (status === "PRESENT") present += 1;
        else if (status === "ABSENT") absent += 1;
        else if (status === "LATE") late += 1;
        else if (status === "EXCUSED") excused += 1;

        if (sessionDate && sessionDate >= thirtyDaysAgo) {
          last30Total += 1;
          if (status === "PRESENT" || status === "EXCUSED") {
            last30PresentExcused += 1;
          }
        }
      }

      const attendanceRate =
        totalSessions > 0
          ? ((present + excused) / totalSessions) * 100
          : 0;

      const last30Rate =
        last30Total > 0
          ? (last30PresentExcused / last30Total) * 100
          : 0;

      attendance = {
        presentDays: present,
        absentDays: absent,
        lateDays: late,
        attendanceRate: Number(attendanceRate.toFixed(2)),
        last30DaysAttendanceRate: Number(last30Rate.toFixed(2)),
      };
    } catch (err) {
      console.error("[STUDENT_DASHBOARD_ATTENDANCE_ERROR]", err);
      // leave attendance as zeros
    }

    // 3) Assessment summary (per term/year)
    let assessments: AssessmentSummary = {
      latestTermLabel: `${term} ${academicYear}`,
      overallAverage: 0,
      bestSubject: null,
      worstSubject: null,
    };

    try {
      const scores = await client.assessmentScore.findMany({
        where: {
          studentId: student.id,
          item: {
            tenantId,
            term,
            academicYear,
          },
        },
        select: {
          score: true,
          item: {
            select: {
              subject: true,
              maxScore: true,
            },
          },
        },
      });

      if (scores.length > 0) {
        let totalObtained = 0;
        let totalMax = 0;

        type SubjectAgg = {
          subject: string;
          totalObtained: number;
          totalMax: number;
        };

        const bySubject = new Map<string, SubjectAgg>();

        for (const row of scores) {
          const rawScore: number =
            typeof row.score === "number" ? row.score : 0;
          const maxScore: number =
            typeof row.item?.maxScore === "number" ? row.item.maxScore : 0;
          const subject: string = row.item?.subject || "Unknown";

          totalObtained += rawScore;
          totalMax += maxScore;

          if (!bySubject.has(subject)) {
            bySubject.set(subject, {
              subject,
              totalObtained: 0,
              totalMax: 0,
            });
          }
          const agg = bySubject.get(subject)!;
          agg.totalObtained += rawScore;
          agg.totalMax += maxScore;
        }

        const overallAverage =
          totalMax > 0 ? (totalObtained / totalMax) * 100 : 0;

        let bestSubject: string | null = null;
        let bestPercent = -1;
        let worstSubject: string | null = null;
        let worstPercent = 101;

        for (const agg of bySubject.values()) {
          if (agg.totalMax <= 0) continue;
          const p = (agg.totalObtained / agg.totalMax) * 100;

          if (p > bestPercent) {
            bestPercent = p;
            bestSubject = agg.subject;
          }
          if (p < worstPercent) {
            worstPercent = p;
            worstSubject = agg.subject;
          }
        }

        assessments = {
          latestTermLabel: `${term} ${academicYear}`,
          overallAverage: Number(overallAverage.toFixed(2)),
          bestSubject,
          worstSubject,
        };
      }
    } catch (err) {
      console.error("[STUDENT_DASHBOARD_ASSESSMENT_ERROR]", err);
      // keep defaults
    }

    const payload: StudentDashboardResponse = {
      ok: true,
      mode: "REAL",
      tenantId,
      studentName,
      classLabel,
      term,
      academicYear,
      attendance,
      assessments,
    };

    return NextResponse.json(payload, { status: 200 });
  } catch (err) {
    console.error("[STUDENT_DASHBOARD_ERROR]", err);
    return NextResponse.json(
      {
        ok: false,
        error:
          "Failed to load student dashboard. Please try again or contact your teacher.",
      },
      { status: 500 }
    );
  }
}
