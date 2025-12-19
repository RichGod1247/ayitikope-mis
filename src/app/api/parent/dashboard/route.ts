// src/app/api/parent/dashboard/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Parent Dashboard API
 *
 * GET /api/parent/dashboard?tenantId=...&guardianPhone=...&term=...&academicYear=...
 *
 * Jason rules:
 *  - Always JSON: { ok:boolean, ... }
 *  - 400 if tenantId missing
 *  - If guardianPhone missing → DEMO MODE (safe, static data)
 *  - If guardianPhone present → real data for that guardian’s children
 *
 * Shape is designed to match ParentPortalClient:
 *
 * {
 *   tenantId: string;
 *   parentName: string;
 *   children: {
 *     learnerId: string;
 *     fullName: string;
 *     classLabel: string;
 *     attendance: {
 *       presentDays: number;
 *       absentDays: number;
 *       lateDays: number;
 *       attendanceRate: number;           // 0–100
 *       last30DaysAttendanceRate: number; // 0–100
 *     };
 *     assessments: {
 *       latestTermLabel: string;
 *       overallAverage: number;           // 0–100
 *       bestSubject?: string | null;
 *       worstSubject?: string | null;
 *     };
 *   }[];
 *   summary: {
 *     totalChildren: number;
 *     avgAttendanceRate: number;
 *     avgAssessmentScore: number;
 *     anySeriousAttendanceIssue: boolean;
 *     anySeriousPerformanceIssue: boolean;
 *   };
 * }
 */

type AttendanceSummary = {
  presentDays: number;
  absentDays: number;
  lateDays: number;
  attendanceRate: number; // 0–100
  last30DaysAttendanceRate: number; // 0–100
};

type AssessmentSummary = {
  latestTermLabel: string;
  overallAverage: number; // 0–100
  bestSubject?: string | null;
  worstSubject?: string | null;
};

type ChildRecord = {
  learnerId: string;
  fullName: string;
  classLabel: string;
  attendance: AttendanceSummary;
  assessments: AssessmentSummary;
};

type ParentDashboardSummary = {
  totalChildren: number;
  avgAttendanceRate: number;
  avgAssessmentScore: number;
  anySeriousAttendanceIssue: boolean;
  anySeriousPerformanceIssue: boolean;
};

type ParentDashboardResponse = {
  ok: boolean;
  mode: "DEMO" | "REAL";
  tenantId: string;
  parentName: string;
  term: string;
  academicYear: string;
  children: ChildRecord[];
  summary: ParentDashboardSummary;
  note?: string;
};

function buildEmptySummary(): ParentDashboardSummary {
  return {
    totalChildren: 0,
    avgAttendanceRate: 0,
    avgAssessmentScore: 0,
    anySeriousAttendanceIssue: false,
    anySeriousPerformanceIssue: false,
  };
}

/**
 * Helper: compute 30 days ago as a Date
 */
function getThirtyDaysAgo(): Date {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d;
}

/**
 * DEMO MODE:
 *
 * Used when guardianPhone is not provided.
 * This keeps the Parent Portal usable when you haven’t wired real login yet.
 */
function buildDemoResponse(tenantId: string, term: string, academicYear: string): ParentDashboardResponse {
  const demoChild: ChildRecord = {
    learnerId: "demo-learner-1",
    fullName: "Demo Child",
    classLabel: "JHS 1 · Gold",
    attendance: {
      presentDays: 45,
      absentDays: 3,
      lateDays: 2,
      attendanceRate: 90,
      last30DaysAttendanceRate: 92,
    },
    assessments: {
      latestTermLabel: `${term} ${academicYear}`,
      overallAverage: 78,
      bestSubject: "Mathematics",
      worstSubject: "Integrated Science",
    },
  };

  const summary: ParentDashboardSummary = {
    totalChildren: 1,
    avgAttendanceRate: demoChild.attendance.attendanceRate,
    avgAssessmentScore: demoChild.assessments.overallAverage,
    anySeriousAttendanceIssue: demoChild.attendance.attendanceRate < 80,
    anySeriousPerformanceIssue: demoChild.assessments.overallAverage < 50,
  };

  return {
    ok: true,
    mode: "DEMO",
    tenantId,
    parentName: "Demo Parent",
    term,
    academicYear,
    children: [demoChild],
    summary,
    note:
      "This dashboard is currently in DEMO MODE because guardianPhone was not provided. Once the parent login flow is wired, this will show real data for the logged-in guardian.",
  };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const tenantId = (searchParams.get("tenantId") || "").trim();
    const guardianPhone = (searchParams.get("guardianPhone") || "").trim();
    const term = (searchParams.get("term") || "1st Term").trim();
    const academicYear = (searchParams.get("academicYear") || "2025/2026").trim();

    if (!tenantId) {
      return NextResponse.json(
        {
          ok: false,
          error: "tenantId is required.",
        },
        { status: 400 }
      );
    }

    // If no guardianPhone → DEMO MODE (no DB hit)
    if (!guardianPhone) {
      const demoPayload = buildDemoResponse(tenantId, term, academicYear);
      return NextResponse.json(demoPayload, { status: 200 });
    }

    // REAL MODE – use Prisma
    const client = prisma as any;

    // 1) Find all learners under this guardian phone & tenant
    const students = await client.student.findMany({
      where: {
        tenantId,
        guardianPhone,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        guardianName: true,
        guardianPhone: true,
        classroom: {
          select: {
            id: true,
            name: true,
            grade: true,
            arm: true,
          },
        },
      },
      orderBy: {
        firstName: "asc",
      },
    });

    if (!students || students.length === 0) {
      const emptyResp: ParentDashboardResponse = {
        ok: true,
        mode: "REAL",
        tenantId,
        parentName: "Parent",
        term,
        academicYear,
        children: [],
        summary: buildEmptySummary(),
        note:
          "No learners found for this guardian phone under the specified tenant. Please confirm the phone number with the school office.",
      };
      return NextResponse.json(emptyResp, { status: 200 });
    }

    const thirtyDaysAgo = getThirtyDaysAgo();

    const children: ChildRecord[] = [];

    // For computing overall summary
    let sumAttendanceRate = 0;
    let sumAssessmentAverage = 0;
    let countAttendance = 0;
    let countAssessment = 0;
    let anySeriousAttendanceIssue = false;
    let anySeriousPerformanceIssue = false;

    for (const s of students) {
      const learnerId: string = s.id;
      const fullName = `${s.firstName} ${s.lastName}`.trim();
      const classLabel = s.classroom?.name ?? "Unassigned";

      // 2) Attendance summary for this learner (all records; not yet term-filtered)
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
            studentId: learnerId,
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
          const sessionDate = m.session?.date
            ? new Date(m.session.date)
            : null;

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

        if (totalSessions > 0) {
          sumAttendanceRate += attendance.attendanceRate;
          countAttendance += 1;

          if (attendance.attendanceRate < 80) {
            anySeriousAttendanceIssue = true;
          }
        }
      } catch (err) {
        console.error("[PARENT_DASHBOARD_ATTENDANCE_ERROR]", err);
        // keep attendance as zeros if it fails
      }

      // 3) Assessment summary for this learner (per term/year)
      let assessments: AssessmentSummary = {
        latestTermLabel: `${term} ${academicYear}`,
        overallAverage: 0,
        bestSubject: null,
        worstSubject: null,
      };

      try {
        const scores = await client.assessmentScore.findMany({
          where: {
            studentId: learnerId,
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
            const rawScore: number = typeof row.score === "number" ? row.score : 0;
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

          // Compute best & worst subject by percentage
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

          const overallNumeric = Number(overallAverage.toFixed(2));

          assessments = {
            latestTermLabel: `${term} ${academicYear}`,
            overallAverage: overallNumeric,
            bestSubject,
            worstSubject,
          };

          sumAssessmentAverage += overallNumeric;
          countAssessment += 1;

          if (overallNumeric < 50) {
            anySeriousPerformanceIssue = true;
          }
        }
      } catch (err) {
        console.error("[PARENT_DASHBOARD_ASSESSMENT_ERROR]", err);
        // keep assessments as default zeros if it fails
      }

      children.push({
        learnerId,
        fullName,
        classLabel,
        attendance,
        assessments,
      });
    }

    const summary: ParentDashboardSummary = {
      totalChildren: children.length,
      avgAttendanceRate:
        countAttendance > 0
          ? Number((sumAttendanceRate / countAttendance).toFixed(2))
          : 0,
      avgAssessmentScore:
        countAssessment > 0
          ? Number((sumAssessmentAverage / countAssessment).toFixed(2))
          : 0,
      anySeriousAttendanceIssue,
      anySeriousPerformanceIssue,
    };

    const parentName =
      students[0]?.guardianName?.trim() ||
      `Parent (${guardianPhone})`;

    const payload: ParentDashboardResponse = {
      ok: true,
      mode: "REAL",
      tenantId,
      parentName,
      term,
      academicYear,
      children,
      summary,
    };

    return NextResponse.json(payload, { status: 200 });
  } catch (err) {
    console.error("[PARENT_DASHBOARD_ERROR]", err);
    return NextResponse.json(
      {
        ok: false,
        error:
          "Failed to load parent dashboard. Please try again or contact the school office.",
      },
      { status: 500 }
    );
  }
}
