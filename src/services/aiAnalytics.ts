// src/services/aiAnalytics.ts
// Sprint 10 — AI analytics engine for GES circuit/district dashboards.
//
// Recovery note:
// This service is useful for the future GES/circuit/district spine, but it must not
// block the current Phase 0/Phase 1 recovery. Keep this file conservative,
// tenant-aware, and compile-safe.

import { prisma } from "@/lib/prisma";
import { sendSms } from "@/lib/sms";

// ─── Types ────────────────────────────────────────────────────────────────────

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type RiskScore = {
  score: number; // 0-100
  level: RiskLevel;
  breakdown: {
    attendanceRate: number; // 0-1
    assessmentAvg: number; // 0-100
    lessonNoteRate: number; // 0-1
    healthFlagCount: number;
  };
};

export type BECEPrediction = {
  predictedPassRate: number; // 0-1
  bySubject: Record<string, number>; // subject → pass rate 0-1
  trajectory: Array<{ term: string; predictedRate: number }>;
  confidence: "LOW" | "MEDIUM" | "HIGH";
  studentCount: number;
};

export type AlertSeverity = "CRITICAL" | "HIGH" | "MEDIUM";
export type AlertType = "ATTENDANCE" | "ACADEMIC" | "HEALTH" | "GOVERNANCE" | "BECE";

export type Alert = {
  tenantId: string;
  schoolName: string;
  alertType: AlertType;
  severity: AlertSeverity;
  message: string;
  recommendation: string;
};

export type Recommendation = {
  issue: string;
  action: string;
  urgency: "IMMEDIATE" | "THIS_WEEK" | "THIS_TERM";
  affectedSchools: string[];
};

// ─── Constants ─────────────────────────────────────────────────────────────────

const GES_SYSTEM_SMS_TENANT_ID = "SYSTEM_GES";
const FEVER_THRESHOLD_C = 37.5;
const ATTENDANCE_LOOKBACK_DAYS = 30;
const HEALTH_LOOKBACK_DAYS = 7;
const LOW_ATTENDANCE_THRESHOLD = 0.7;
const LOW_ASSESSMENT_THRESHOLD = 50;
const LOW_BECE_PASS_RATE_THRESHOLD = 0.6;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function riskLevel(score: number): RiskLevel {
  if (score >= 75) return "CRITICAL";
  if (score >= 50) return "HIGH";
  if (score >= 25) return "MEDIUM";
  return "LOW";
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfWeek(): Date {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay()); // Sunday
  d.setHours(0, 0, 0, 0);
  return d;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function normalizeRiskScore(score: number): number {
  return clamp(Math.round(score), 0, 100);
}

// ─── computeSchoolRiskScore ───────────────────────────────────────────────────

export async function computeSchoolRiskScore(tenantId: string): Promise<RiskScore> {
  const thirtyDaysAgo = daysAgo(ATTENDANCE_LOOKBACK_DAYS);
  const sevenDaysAgo = daysAgo(HEALTH_LOOKBACK_DAYS);
  const weekStart = startOfWeek();

  // 1. Attendance rate for the last 30 days
  const [totalMarks, presentMarks] = await Promise.all([
    prisma.attendanceMark.count({
      where: {
        session: {
          tenantId,
          date: { gte: thirtyDaysAgo },
        },
      },
    }),
    prisma.attendanceMark.count({
      where: {
        session: {
          tenantId,
          date: { gte: thirtyDaysAgo },
        },
        status: "PRESENT",
      },
    }),
  ]);

  const attendanceRate = totalMarks > 0 ? presentMarks / totalMarks : 0;

  // 2. Assessment average across published scores
  const scores = await prisma.assessmentScore.findMany({
    where: {
      item: {
        tenantId,
        status: "PUBLISHED",
      },
    },
    select: {
      score: true,
      item: {
        select: {
          maxScore: true,
        },
      },
    },
    take: 5000,
  });

  const percentageScores = scores
    .filter((s) => s.item.maxScore > 0)
    .map((s) => (s.score / s.item.maxScore) * 100);

  const assessmentAvg = average(percentageScores);

  // 3. Lesson note submission rate this week
  const [teacherCount, lessonNotesThisWeek] = await Promise.all([
    prisma.teacherProfile.count({
      where: { tenantId },
    }),
    prisma.lessonNote.count({
      where: {
        tenantId,
        submittedAt: { gte: weekStart },
      },
    }),
  ]);

  const lessonNoteRate =
    teacherCount > 0 ? clamp(lessonNotesThisWeek / teacherCount, 0, 1) : 0;

  // 4. Health flags in the last 7 days
  const healthFlagCount = await prisma.studentHealthDaily.count({
    where: {
      tenantId,
      date: { gte: sevenDaysAgo },
      temperatureC: { gte: FEVER_THRESHOLD_C },
    },
  });

  // Weighted score. Higher score means higher operational risk.
  const attendanceRisk = (1 - attendanceRate) * 40;
  const assessmentRisk = (1 - assessmentAvg / 100) * 30;
  const lessonNoteRisk = (1 - lessonNoteRate) * 20;
  const healthRisk = Math.min(10, healthFlagCount);

  const score = normalizeRiskScore(
    attendanceRisk + assessmentRisk + lessonNoteRisk + healthRisk
  );

  return {
    score,
    level: riskLevel(score),
    breakdown: {
      attendanceRate,
      assessmentAvg,
      lessonNoteRate,
      healthFlagCount,
    },
  };
}

// ─── predictBECEOutcome ───────────────────────────────────────────────────────

export async function predictBECEOutcome(
  tenantId: string,
  academicYear: string
): Promise<BECEPrediction> {
  const jhs3Classrooms = await prisma.classroom.findMany({
    where: {
      tenantId,
      status: "ACTIVE",
      OR: [
        { grade: { contains: "JHS3", mode: "insensitive" } },
        { grade: { contains: "JHS 3", mode: "insensitive" } },
        { grade: { contains: "BS11", mode: "insensitive" } },
        { name: { contains: "JHS3", mode: "insensitive" } },
        { name: { contains: "JHS 3", mode: "insensitive" } },
        { name: { contains: "BS11", mode: "insensitive" } },
      ],
    },
    select: { id: true },
  });

  if (jhs3Classrooms.length === 0) {
    return {
      predictedPassRate: 0,
      bySubject: {},
      trajectory: [],
      confidence: "LOW",
      studentCount: 0,
    };
  }

  const classroomIds = jhs3Classrooms.map((c) => c.id);

  const students = await prisma.student.findMany({
    where: {
      tenantId,
      classroomId: { in: classroomIds },
      status: "ACTIVE",
    },
    select: { id: true },
  });

  if (students.length === 0) {
    return {
      predictedPassRate: 0,
      bySubject: {},
      trajectory: [],
      confidence: "LOW",
      studentCount: 0,
    };
  }

  const studentIds = students.map((s) => s.id);

  const scores = await prisma.assessmentScore.findMany({
    where: {
      studentId: { in: studentIds },
      item: {
        tenantId,
        academicYear,
        status: "PUBLISHED",
        classroomId: { in: classroomIds },
      },
    },
    select: {
      score: true,
      studentId: true,
      item: {
        select: {
          subject: true,
          maxScore: true,
          term: true,
        },
      },
    },
  });

  const subjectScores: Record<string, { total: number; count: number; passed: number }> = {};

  for (const s of scores) {
    const subject = s.item.subject || "Unknown Subject";
    const percent = s.item.maxScore > 0 ? (s.score / s.item.maxScore) * 100 : 0;

    if (!subjectScores[subject]) {
      subjectScores[subject] = { total: 0, count: 0, passed: 0 };
    }

    subjectScores[subject].total += percent;
    subjectScores[subject].count += 1;

    if (percent >= 50) {
      subjectScores[subject].passed += 1;
    }
  }

  const bySubject: Record<string, number> = {};

  for (const [subject, data] of Object.entries(subjectScores)) {
    bySubject[subject] = data.count > 0 ? data.passed / data.count : 0;
  }

  const subjectRates = Object.values(bySubject);
  const predictedPassRate = average(subjectRates);

  const termScores: Record<string, { passed: number; total: number }> = {};

  for (const s of scores) {
    const term = s.item.term || "Unknown Term";
    const percent = s.item.maxScore > 0 ? (s.score / s.item.maxScore) * 100 : 0;

    if (!termScores[term]) {
      termScores[term] = { passed: 0, total: 0 };
    }

    termScores[term].total += 1;

    if (percent >= 50) {
      termScores[term].passed += 1;
    }
  }

  const termOrder = ["1st Term", "2nd Term", "3rd Term"];

  const trajectory = termOrder
    .filter((term) => Boolean(termScores[term]))
    .map((term) => ({
      term,
      predictedRate:
        termScores[term].total > 0
          ? termScores[term].passed / termScores[term].total
          : 0,
    }));

  const confidence: "LOW" | "MEDIUM" | "HIGH" =
    scores.length < 10 ? "LOW" : scores.length < 50 ? "MEDIUM" : "HIGH";

  return {
    predictedPassRate,
    bySubject,
    trajectory,
    confidence,
    studentCount: students.length,
  };
}

// ─── generateCircuitAlerts ───────────────────────────────────────────────────

export async function generateCircuitAlerts(circuitId: string): Promise<Alert[]> {
  const schools = await prisma.tenant.findMany({
    where: {
      zoneId: circuitId,
      status: "ACTIVE",
    },
    select: {
      id: true,
      name: true,
    },
  });

  const alerts: Alert[] = [];

  for (const school of schools) {
    const risk = await computeSchoolRiskScore(school.id);
    const { attendanceRate, lessonNoteRate, healthFlagCount, assessmentAvg } =
      risk.breakdown;

    if (attendanceRate < LOW_ATTENDANCE_THRESHOLD) {
      alerts.push({
        tenantId: school.id,
        schoolName: school.name,
        alertType: "ATTENDANCE",
        severity: attendanceRate < 0.5 ? "CRITICAL" : "HIGH",
        message: `Attendance rate is ${(attendanceRate * 100).toFixed(
          1
        )}% — below the 70% threshold.`,
        recommendation:
          "Conduct home visits for frequently absent learners and alert parents via SMS.",
      });
    }

    if (assessmentAvg < LOW_ASSESSMENT_THRESHOLD) {
      alerts.push({
        tenantId: school.id,
        schoolName: school.name,
        alertType: "ACADEMIC",
        severity: assessmentAvg < 35 ? "CRITICAL" : "HIGH",
        message: `Average assessment score is ${assessmentAvg.toFixed(
          1
        )}% — below pass threshold.`,
        recommendation:
          "Review assessment data with class teachers and schedule remedial sessions.",
      });
    }

    if (healthFlagCount >= 3) {
      alerts.push({
        tenantId: school.id,
        schoolName: school.name,
        alertType: "HEALTH",
        severity: healthFlagCount >= 5 ? "CRITICAL" : "HIGH",
        message: `${healthFlagCount} fever case(s) recorded in the last 7 days.`,
        recommendation:
          "Notify District Health Officer and arrange school health inspection.",
      });
    }

    if (lessonNoteRate === 0) {
      alerts.push({
        tenantId: school.id,
        schoolName: school.name,
        alertType: "GOVERNANCE",
        severity: "HIGH",
        message: "No lesson notes submitted this week by any teacher.",
        recommendation:
          "Follow up with headteacher to enforce lesson note submission policy.",
      });
    }

    const settings = await prisma.tenantSettings.findUnique({
      where: { tenantId: school.id },
      select: { currentAcademicYear: true },
    });

    if (settings?.currentAcademicYear) {
      const bece = await predictBECEOutcome(school.id, settings.currentAcademicYear);

      if (
        bece.studentCount > 0 &&
        bece.predictedPassRate < LOW_BECE_PASS_RATE_THRESHOLD
      ) {
        alerts.push({
          tenantId: school.id,
          schoolName: school.name,
          alertType: "BECE",
          severity: bece.predictedPassRate < 0.4 ? "CRITICAL" : "HIGH",
          message: `BECE predicted pass rate is ${(
            bece.predictedPassRate * 100
          ).toFixed(1)}% — below 60% target.`,
          recommendation:
            "Prioritise JHS3 remedial sessions in weak subjects. Review teacher deployment.",
        });
      }
    }
  }

  const severityOrder: Record<AlertSeverity, number> = {
    CRITICAL: 0,
    HIGH: 1,
    MEDIUM: 2,
  };

  alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return alerts;
}

// ─── generateRecommendations ─────────────────────────────────────────────────

export async function generateRecommendations(zoneId: string): Promise<Recommendation[]> {
  const schools = await prisma.tenant.findMany({
    where: {
      zoneId,
      status: "ACTIVE",
    },
    select: {
      id: true,
      name: true,
    },
  });

  const lowAttendance: string[] = [];
  const lowAssessment: string[] = [];
  const noLessonNotes: string[] = [];
  const highHealth: string[] = [];

  for (const school of schools) {
    const risk = await computeSchoolRiskScore(school.id);

    if (risk.breakdown.attendanceRate < LOW_ATTENDANCE_THRESHOLD) {
      lowAttendance.push(school.name);
    }

    if (risk.breakdown.assessmentAvg < LOW_ASSESSMENT_THRESHOLD) {
      lowAssessment.push(school.name);
    }

    if (risk.breakdown.lessonNoteRate === 0) {
      noLessonNotes.push(school.name);
    }

    if (risk.breakdown.healthFlagCount >= 3) {
      highHealth.push(school.name);
    }
  }

  const recs: Recommendation[] = [];

  if (lowAttendance.length > 0) {
    recs.push({
      issue: `${lowAttendance.length} school(s) have attendance below 70%.`,
      action:
        "Conduct targeted parent engagement campaign and implement SMS alerts for absences.",
      urgency: "IMMEDIATE",
      affectedSchools: lowAttendance,
    });
  }

  if (lowAssessment.length > 0) {
    recs.push({
      issue: `${lowAssessment.length} school(s) have average assessment scores below 50%.`,
      action:
        "Schedule subject-specific remedial sessions and review teaching materials.",
      urgency: "THIS_WEEK",
      affectedSchools: lowAssessment,
    });
  }

  if (noLessonNotes.length > 0) {
    recs.push({
      issue: `${noLessonNotes.length} school(s) had zero lesson notes submitted this week.`,
      action:
        "Issue official reminder to headteachers. Escalate to SISO visit if missed 2+ weeks.",
      urgency: "IMMEDIATE",
      affectedSchools: noLessonNotes,
    });
  }

  if (highHealth.length > 0) {
    recs.push({
      issue: `${highHealth.length} school(s) report 3+ fever cases this week.`,
      action: "Alert District Health Officer and schedule health inspection.",
      urgency: "IMMEDIATE",
      affectedSchools: highHealth,
    });
  }

  if (recs.length < 3) {
    recs.push({
      issue: "Maintain current performance monitoring cadence.",
      action:
        "Continue weekly SISO circuit visits and review lesson note quality, not just submission.",
      urgency: "THIS_TERM",
      affectedSchools: schools.map((s) => s.name),
    });
  }

  return recs.slice(0, 5);
}

// ─── runDailySnapshots ───────────────────────────────────────────────────────

export async function runDailySnapshots(): Promise<{ snapshotsCreated: number }> {
  const today = startOfToday();

  const activeTenants = await prisma.tenant.findMany({
    where: { status: "ACTIVE" },
    select: {
      id: true,
      name: true,
      zoneId: true,
    },
  });

  let snapshotsCreated = 0;

  for (const tenant of activeTenants) {
    try {
      const settings = await prisma.tenantSettings.findUnique({
        where: { tenantId: tenant.id },
        select: { currentAcademicYear: true },
      });

      const risk = await computeSchoolRiskScore(tenant.id);

      let beceRate: number | null = null;

      if (settings?.currentAcademicYear) {
        const bece = await predictBECEOutcome(tenant.id, settings.currentAcademicYear);

        if (bece.studentCount > 0) {
          beceRate = bece.predictedPassRate;
        }
      }

      const alerts: Alert[] = [];

      if (tenant.zoneId) {
        const zoneAlerts = await generateCircuitAlerts(tenant.zoneId);
        alerts.push(...zoneAlerts.filter((a) => a.tenantId === tenant.id));
      }

      await prisma.schoolRiskSnapshot.upsert({
        where: {
          tenantId_snapshotDate: {
            tenantId: tenant.id,
            snapshotDate: today,
          },
        },
        create: {
          tenantId: tenant.id,
          snapshotDate: today,
          attendanceRate: risk.breakdown.attendanceRate,
          assessmentAvg: risk.breakdown.assessmentAvg,
          lessonNoteRate: risk.breakdown.lessonNoteRate,
          healthFlagCount: risk.breakdown.healthFlagCount,
          riskScore: risk.score,
          riskLevel: risk.level,
          becePassRatePredicted: beceRate,
          alerts,
        },
        update: {
          attendanceRate: risk.breakdown.attendanceRate,
          assessmentAvg: risk.breakdown.assessmentAvg,
          lessonNoteRate: risk.breakdown.lessonNoteRate,
          healthFlagCount: risk.breakdown.healthFlagCount,
          riskScore: risk.score,
          riskLevel: risk.level,
          becePassRatePredicted: beceRate,
          alerts,
        },
      });

      snapshotsCreated++;
    } catch (err) {
      console.error(`[SNAPSHOT] Failed for tenant ${tenant.id}:`, err);
    }
  }

  if (snapshotsCreated > 0) {
    await notifyGesOfficers();
  }

  return { snapshotsCreated };
}

// ─── notifyGesOfficers ───────────────────────────────────────────────────────

async function notifyGesOfficers(): Promise<void> {
  const today = startOfToday();

  const officers = await prisma.gesOfficer.findMany({
    where: { notifMuted: false },
    select: {
      phone: true,
      title: true,
      zone: {
        select: {
          id: true,
          name: true,
          zoneType: {
            select: {
              name: true,
            },
          },
        },
      },
    },
  });

  for (const officer of officers) {
    if (!officer.phone) continue;

    try {
      const atRiskCount = await prisma.schoolRiskSnapshot.count({
        where: {
          snapshotDate: today,
          riskLevel: { in: ["HIGH", "CRITICAL"] },
          tenant: {
            zoneId: officer.zone.id,
          },
        },
      });

      if (atRiskCount === 0) continue;

      const zoneTypeName = officer.zone.zoneType.name.toLowerCase();

      const msg =
        `EduLife OS Daily Brief: ${atRiskCount} school(s) in your ${zoneTypeName} need attention today. ` +
        "Log in at edulifeos.com to review.";

      await sendSms({
        tenantId: GES_SYSTEM_SMS_TENANT_ID,
        to: officer.phone,
        message: msg,
        template: "GES_RISK_ALERT",
        payload: {
          officerTitle: officer.title,
          zoneId: officer.zone.id,
          zoneName: officer.zone.name,
          zoneType: officer.zone.zoneType.name,
          atRiskCount,
          alertDate: today.toISOString().slice(0, 10),
        },
      });
    } catch (err) {
      console.error("[GES_ALERT_SMS] Failed to notify officer:", err);
    }
  }
}