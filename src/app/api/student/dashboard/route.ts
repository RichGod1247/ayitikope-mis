// src/app/api/student/dashboard/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

function noStoreJson(body: any, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });
}

function getThirtyDaysAgo(): Date {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d;
}

function buildDemoResponse(tenantId: string, term: string, academicYear: string): StudentDashboardResponse {
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
      "DEMO MODE: studentId was not provided. This endpoint is tenant-locked and requires auth. When student login is wired, studentId should come from session/JWT.",
  };
}

function isAllowedRole(roleName: string | null) {
  const r = String(roleName ?? "").toUpperCase();
  // MVP policy: parent + adminish only (blocks TEACHER from querying arbitrary students)
  return r === "PARENT" || r.includes("ADMIN") || r.includes("HEAD") || r.includes("SUPER") || r.includes("OWNER");
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireApiUserContext(req, { requireTenant: true });
    if (!auth.ok) return auth.res;

    const ctx = auth.ctx;
    if (!isAllowedRole(ctx.roleName)) return noStoreJson({ ok: false, error: "FORBIDDEN" }, 403);

    const { searchParams } = new URL(req.url);

    const studentId = (searchParams.get("studentId") || "").trim();
    const term = (searchParams.get("term") || "1st Term").trim();
    const academicYear = (searchParams.get("academicYear") || "2025/2026").trim();

    // DEMO mode still requires auth + tenant (prevents public student data surface)
    if (!studentId) {
      return noStoreJson(buildDemoResponse(ctx.tenantId, term, academicYear), 200);
    }

    // ✅ Hard tenant lock: student must belong to active tenant
    const student = await prisma.student.findFirst({
      where: { id: studentId, tenantId: ctx.tenantId },
      select: {
        id: true,
        tenantId: true,
        firstName: true,
        lastName: true,
        classroom: { select: { name: true, grade: true, arm: true } },
      },
    });

    if (!student) return noStoreJson({ ok: false, error: "Student not found." }, 404);

    const tenantId = student.tenantId;
    const studentName = [student.firstName, student.lastName].filter(Boolean).join(" ").trim();
    const classLabel = student.classroom?.name ?? "Unassigned";

    const thirtyDaysAgo = getThirtyDaysAgo();

    // ✅ Count-based (no massive fetch)
    const [present, absent, late, excused, last30Total, last30PresentExcused] = await Promise.all([
      prisma.attendanceMark.count({
        where: { studentId: student.id, session: { tenantId }, status: "PRESENT" as any },
      }),
      prisma.attendanceMark.count({
        where: { studentId: student.id, session: { tenantId }, status: "ABSENT" as any },
      }),
      prisma.attendanceMark.count({
        where: { studentId: student.id, session: { tenantId }, status: "LATE" as any },
      }),
      prisma.attendanceMark.count({
        where: { studentId: student.id, session: { tenantId }, status: "EXCUSED" as any },
      }),
      prisma.attendanceMark.count({
        where: { studentId: student.id, session: { tenantId, date: { gte: thirtyDaysAgo } } },
      }),
      prisma.attendanceMark.count({
        where: {
          studentId: student.id,
          session: { tenantId, date: { gte: thirtyDaysAgo } },
          OR: [{ status: "PRESENT" as any }, { status: "EXCUSED" as any }],
        },
      }),
    ]);

    const totalMarks = present + absent + late + excused;
    const attendanceRate = totalMarks > 0 ? ((present + excused) / totalMarks) * 100 : 0;
    const last30Rate = last30Total > 0 ? (last30PresentExcused / last30Total) * 100 : 0;

    const attendance: AttendanceSummary = {
      presentDays: present,
      absentDays: absent,
      lateDays: late,
      attendanceRate: Number(attendanceRate.toFixed(2)),
      last30DaysAttendanceRate: Number(last30Rate.toFixed(2)),
    };

    let assessments: AssessmentSummary = {
      latestTermLabel: `${term} ${academicYear}`,
      overallAverage: 0,
      bestSubject: null,
      worstSubject: null,
    };

    const scores = await prisma.assessmentScore.findMany({
      where: {
        studentId: student.id,
        item: { tenantId, term, academicYear },
      },
      select: { score: true, item: { select: { subject: true, maxScore: true } } },
    });

    if (scores.length > 0) {
      let totalObtained = 0;
      let totalMax = 0;

      type SubjectAgg = { subject: string; totalObtained: number; totalMax: number };
      const bySubject = new Map<string, SubjectAgg>();

      for (const row of scores) {
        const rawScore = typeof row.score === "number" ? row.score : 0;
        const maxScore = typeof row.item?.maxScore === "number" ? row.item.maxScore : 0;
        const subject = row.item?.subject || "Unknown";

        totalObtained += rawScore;
        totalMax += maxScore;

        if (!bySubject.has(subject)) bySubject.set(subject, { subject, totalObtained: 0, totalMax: 0 });
        const agg = bySubject.get(subject)!;
        agg.totalObtained += rawScore;
        agg.totalMax += maxScore;
      }

      const overallAverage = totalMax > 0 ? (totalObtained / totalMax) * 100 : 0;

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

    return noStoreJson(payload, 200);
  } catch (err) {
    console.error("[STUDENT_DASHBOARD_ERROR]", err);
    return noStoreJson({ ok: false, error: "Failed to load student dashboard. Please try again." }, 500);
  }
}
