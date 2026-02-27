// src/app/api/parent/dashboard/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { effectiveRole } from "@/lib/roleRouting";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

function noStoreJson(body: any, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });
}

// Ghana-safe normalization: "+23324xxxxxxx" -> "024xxxxxxx"
function normalizeGhanaPhoneToLocal10(raw: string): string {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("233") && digits.length >= 12) return "0" + digits.slice(3, 12);
  if (digits.length === 9) return "0" + digits;
  if (digits.length >= 10) return digits.slice(-10);
  return digits;
}

function buildEmptySummary(): ParentDashboardSummary {
  return {
    totalChildren: 0,
    avgAttendanceRate: 0,
    avgAssessmentScore: 0,
    anySeriousAttendanceIssue: false,
    anySeriousPerformanceIssue: false,
  };
}

function getThirtyDaysAgo(): Date {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d;
}

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
      "DEMO MODE: guardianPhone was not available. In production, parent login must carry guardian phone in session/JWT.",
  };
}

function isAdminish(role: string) {
  const r = String(role ?? "").toUpperCase();
  return r.includes("SUPER") || r.includes("OWNER") || r.includes("ADMIN") || r.includes("HEAD");
}

async function getSafeTenantCtx() {
  const session = await getServerSession(authOptions);
  const u = session?.user as any;

  const userId = typeof u?.id === "string" ? u.id : "";
  const tenantId = typeof u?.tenantId === "string" ? u.tenantId : "";
  const userPhone = normalizeGhanaPhoneToLocal10(u?.phone ?? u?.phoneNumber ?? u?.guardianPhone ?? "");

  if (!session || !userId) return { ok: false as const, status: 401, error: "UNAUTHORIZED" };
  if (!tenantId) return { ok: false as const, status: 403, error: "NO_ACTIVE_TENANT" };

  const membership = await prisma.membership.findUnique({
    where: { userId_tenantId: { userId, tenantId } },
    select: { status: true, role: { select: { name: true } } },
  });

  if (!membership || membership.status !== "ACTIVE") {
    return { ok: false as const, status: 403, error: "FORBIDDEN" };
  }

  const roleName = effectiveRole(membership.role?.name ?? "");
  const isParent = roleName === "PARENT";
  const adminish = isAdminish(roleName);

  if (!isParent && !adminish) {
    return { ok: false as const, status: 403, error: "FORBIDDEN" };
  }

  if (isParent && !userPhone) {
    // Parent MUST have phone in session to prevent impersonation-by-queryparam
    return { ok: false as const, status: 409, error: "PARENT_PHONE_MISSING_IN_SESSION" };
  }

  return { ok: true as const, userId, tenantId, roleName, isParent, isAdminish: adminish, userPhone };
}

export async function GET(req: NextRequest) {
  try {
    const safe = await getSafeTenantCtx();
    if (!safe.ok) return noStoreJson({ ok: false, error: safe.error }, safe.status);

    const { searchParams } = new URL(req.url);

    // Backward-compat only: tenantId param must match session tenant
    const tenantIdParam = (searchParams.get("tenantId") || "").trim();
    if (tenantIdParam && tenantIdParam !== safe.tenantId) {
      return noStoreJson({ ok: false, error: "FORBIDDEN_TENANT_MISMATCH" }, 403);
    }

    const term = (searchParams.get("term") || "1st Term").trim();
    const academicYear = (searchParams.get("academicYear") || "2025/2026").trim();

    // Parent: phone forced from session
    // Adminish: can supply guardianPhone to support-view
    const qpPhone = normalizeGhanaPhoneToLocal10(searchParams.get("guardianPhone") || "");
    const guardianPhone = safe.isParent ? safe.userPhone : qpPhone;

    // If adminish did not supply guardianPhone -> demo mode
    if (!guardianPhone) {
      return noStoreJson(buildDemoResponse(safe.tenantId, term, academicYear), 200);
    }

    const tenantId = safe.tenantId;

    // Query students (tenant-scoped) by phone
    const candidates = Array.from(new Set([guardianPhone])).filter(Boolean);

    const students = await prisma.student.findMany({
      where: {
        tenantId,
        OR: candidates.map((p) => ({ guardianPhone: p })),
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        guardianName: true,
        guardianPhone: true,
        classroom: { select: { id: true, name: true, grade: true, arm: true } },
      },
      orderBy: { firstName: "asc" },
    });

    if (!students || students.length === 0) {
      const emptyResp: ParentDashboardResponse = {
        ok: true,
        mode: "REAL",
        tenantId,
        parentName: safe.isParent ? "Parent" : `Support View (${guardianPhone})`,
        term,
        academicYear,
        children: [],
        summary: buildEmptySummary(),
        note: "No learners found for this guardian phone in the active tenant. Confirm the phone number with the school office.",
      };
      return noStoreJson(emptyResp, 200);
    }

    const thirtyDaysAgo = getThirtyDaysAgo();

    const children: ChildRecord[] = [];

    let sumAttendanceRate = 0;
    let sumAssessmentAverage = 0;
    let countAttendance = 0;
    let countAssessment = 0;
    let anySeriousAttendanceIssue = false;
    let anySeriousPerformanceIssue = false;

    for (const s of students) {
      const learnerId = s.id;
      const fullName = `${s.firstName} ${s.lastName}`.trim();
      const classLabel = s.classroom?.name ?? "Unassigned";

      // Attendance via counts (fast)
      const [present, absent, late, excused, last30Total, last30PresentExcused] = await Promise.all([
        prisma.attendanceMark.count({ where: { studentId: learnerId, session: { tenantId }, status: "PRESENT" as any } }),
        prisma.attendanceMark.count({ where: { studentId: learnerId, session: { tenantId }, status: "ABSENT" as any } }),
        prisma.attendanceMark.count({ where: { studentId: learnerId, session: { tenantId }, status: "LATE" as any } }),
        prisma.attendanceMark.count({ where: { studentId: learnerId, session: { tenantId }, status: "EXCUSED" as any } }),
        prisma.attendanceMark.count({ where: { studentId: learnerId, session: { tenantId, date: { gte: thirtyDaysAgo } } } }),
        prisma.attendanceMark.count({
          where: {
            studentId: learnerId,
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

      if (totalMarks > 0) {
        sumAttendanceRate += attendance.attendanceRate;
        countAttendance += 1;
        if (attendance.attendanceRate < 80) anySeriousAttendanceIssue = true;
      }

      // Assessments (term/year + tenant)
      let assessments: AssessmentSummary = {
        latestTermLabel: `${term} ${academicYear}`,
        overallAverage: 0,
        bestSubject: null,
        worstSubject: null,
      };

      const scores = await prisma.assessmentScore.findMany({
        where: { studentId: learnerId, item: { tenantId, term, academicYear } },
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

        const overallNumeric = Number(overallAverage.toFixed(2));
        assessments = { latestTermLabel: `${term} ${academicYear}`, overallAverage: overallNumeric, bestSubject, worstSubject };

        sumAssessmentAverage += overallNumeric;
        countAssessment += 1;
        if (overallNumeric < 50) anySeriousPerformanceIssue = true;
      }

      children.push({ learnerId, fullName, classLabel, attendance, assessments });
    }

    const summary: ParentDashboardSummary = {
      totalChildren: children.length,
      avgAttendanceRate: countAttendance > 0 ? Number((sumAttendanceRate / countAttendance).toFixed(2)) : 0,
      avgAssessmentScore: countAssessment > 0 ? Number((sumAssessmentAverage / countAssessment).toFixed(2)) : 0,
      anySeriousAttendanceIssue,
      anySeriousPerformanceIssue,
    };

    const parentName = students[0]?.guardianName?.trim() || (safe.isParent ? "Parent" : `Support View (${guardianPhone})`);

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

    return noStoreJson(payload, 200);
  } catch (err) {
    console.error("[PARENT_DASHBOARD_ERROR]", err);
    return noStoreJson(
      { ok: false, error: "Failed to load parent dashboard. Please try again or contact the school office." },
      500
    );
  }
}
