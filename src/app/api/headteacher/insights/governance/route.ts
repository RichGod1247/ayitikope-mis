// src/app/api/headteacher/insights/governance/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getHeadteacherApiContext } from "@/lib/headteacherAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(status: number, payload: any) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function cleanStr(v: unknown) {
  return String(v ?? "").trim();
}

function pct(part: number, whole: number) {
  if (!whole) return null;
  return Number(((part / whole) * 100).toFixed(1));
}

function hoursBetween(a: Date, b: Date) {
  return Number(((b.getTime() - a.getTime()) / (1000 * 60 * 60)).toFixed(2));
}

function clamp100(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(100, x));
}

function weightedScore(parts: Array<{ value: number | null; weight: number }>) {
  const usable = parts.filter((p) => p.value != null && Number.isFinite(p.value));
  const totalWeight = usable.reduce((s, p) => s + p.weight, 0);
  if (!totalWeight) return 0;
  const value =
    usable.reduce((s, p) => s + (p.value as number) * p.weight, 0) / totalWeight;
  return Number(clamp100(value).toFixed(1));
}

function parseISODateOnly(v: string | null): Date | null {
  const s = cleanStr(v);
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function GET(req: NextRequest) {
  const ctx = await getHeadteacherApiContext();
  if (!ctx) {
    return noStore(401, { ok: false, error: "UNAUTHORIZED" });
  }

  const { searchParams } = new URL(req.url);

  const settings = await prisma.tenantSettings.findUnique({
    where: { tenantId: ctx.tenantId },
    select: {
      currentTerm: true,
      currentAcademicYear: true,
    },
  });

  const term = cleanStr(searchParams.get("term")) || settings?.currentTerm || "1st Term";
  const academicYear =
    cleanStr(searchParams.get("academicYear")) ||
    settings?.currentAcademicYear ||
    "2025/2026";

  const startQ = parseISODateOnly(searchParams.get("start"));
  const endQ = parseISODateOnly(searchParams.get("end"));

  const endD = endQ
    ? new Date(`${endQ.toISOString().slice(0, 10)}T23:59:59.999Z`)
    : new Date();
  const startD = startQ
    ? new Date(`${startQ.toISOString().slice(0, 10)}T00:00:00.000Z`)
    : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  try {
    const sessions = await prisma.attendanceSession.findMany({
      where: {
        tenantId: ctx.tenantId,
        date: { gte: startD, lte: endD },
      },
      select: {
        id: true,
        date: true,
        isClosed: true,
        certifiedAt: true,
        notifiedAt: true,
      },
      take: 5000,
    });

    const totalSessions = sessions.length;
    const closedSessions = sessions.filter((s) => s.isClosed).length;
    const certifiedSessions = sessions.filter((s) => !!s.certifiedAt).length;
    const pendingCertification = sessions.filter((s) => s.isClosed && !s.certifiedAt).length;
    const notifiedSessions = sessions.filter((s) => !!s.notifiedAt).length;

    const certifyDelays = sessions
      .filter((s) => s.isClosed && s.certifiedAt)
      .map((s) => hoursBetween(new Date(s.date), new Date(s.certifiedAt as any)));

    const avgCertifyDelayHrs = certifyDelays.length
      ? Number((certifyDelays.reduce((a, b) => a + b, 0) / certifyDelays.length).toFixed(2))
      : null;

    const notifyDelays = sessions
      .filter((s) => s.certifiedAt && s.notifiedAt)
      .map((s) => hoursBetween(new Date(s.certifiedAt as any), new Date(s.notifiedAt as any)));

    const avgNotifyDelayHrs = notifyDelays.length
      ? Number((notifyDelays.reduce((a, b) => a + b, 0) / notifyDelays.length).toFixed(2))
      : null;

    const attendanceCertificationRate = pct(certifiedSessions, Math.max(1, closedSessions));
    const notifyRate = pct(notifiedSessions, Math.max(1, certifiedSessions));

    const approvedNotesCount = await prisma.lessonNote.count({
      where: {
        tenantId: ctx.tenantId,
        term,
        academicYear,
        status: "APPROVED",
      },
    });

    const deliveredLessonsCount = await prisma.lessonDelivery.count({
      where: {
        tenantId: ctx.tenantId,
        term,
        academicYear,
      },
    });

    const totalAssessmentsCount = await prisma.assessmentItem.count({
      where: {
        tenantId: ctx.tenantId,
        term,
        academicYear,
      },
    });

    const linkedAssessmentsCount = await prisma.assessmentItem.count({
      where: {
        tenantId: ctx.tenantId,
        term,
        academicYear,
        lessonDeliveryId: { not: null },
      },
    });

    const scoredAssessmentItems = await prisma.assessmentScore.findMany({
      where: {
        item: {
          tenantId: ctx.tenantId,
          term,
          academicYear,
        },
      },
      distinct: ["itemId"],
      select: { itemId: true },
      take: 500000,
    });

    const scoredAssessmentsCount = scoredAssessmentItems.length;

    const deliveryCoveragePercent = pct(deliveredLessonsCount, approvedNotesCount);
    const assessmentLinkCoveragePercent = pct(linkedAssessmentsCount, deliveredLessonsCount);
    const scoringCoveragePercent = pct(scoredAssessmentsCount, totalAssessmentsCount);

    const approvedNotDelivered = await prisma.lessonNote.findMany({
      where: {
        tenantId: ctx.tenantId,
        term,
        academicYear,
        status: "APPROVED",
        lessonDeliveries: { none: {} },
      },
      select: {
        id: true,
        subject: true,
        approvedAt: true,
        teacherUserId: true,
        classroomId: true,
        lessonTitle: true,
      },
      orderBy: [{ approvedAt: "asc" }],
      take: 50,
    });

    const deliveredNotAssessed = await prisma.lessonDelivery.findMany({
      where: {
        tenantId: ctx.tenantId,
        term,
        academicYear,
        assessmentItems: { none: {} },
      },
      select: {
        id: true,
        subject: true,
        dateTaught: true,
        classroomId: true,
        teacherUserId: true,
        indicatorCode: true,
      },
      orderBy: [{ dateTaught: "asc" }],
      take: 50,
    });

    const assessedNotLinked = await prisma.assessmentItem.findMany({
      where: {
        tenantId: ctx.tenantId,
        term,
        academicYear,
        lessonDeliveryId: null,
      },
      select: {
        id: true,
        subject: true,
        title: true,
        date: true,
        classroomId: true,
      },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      take: 50,
    });

    const headteacherScore = weightedScore([
      { value: attendanceCertificationRate, weight: 0.25 },
      { value: notifyRate, weight: 0.15 },
      { value: deliveryCoveragePercent, weight: 0.2 },
      { value: assessmentLinkCoveragePercent, weight: 0.2 },
      { value: scoringCoveragePercent, weight: 0.2 },
    ]);

    // ✅ Contract-aligned actions: because[] uses metrics.* keys and message includes metric values.
    const actions: Array<{
      code: string;
      priority: "HIGH" | "MEDIUM" | "LOW";
      because: string[];
      message: string;
    }> = [];

    if ((attendanceCertificationRate ?? 0) < 85) {
      actions.push({
        code: "CERTIFY_ATTENDANCE_ON_TIME",
        priority: "HIGH",
        because: [
          "metrics.attendance.attendanceCertificationRate",
          "metrics.attendance.pendingCertification",
          "metrics.attendance.closedSessions",
        ],
        message: `Certification is behind: ${attendanceCertificationRate ?? 0}% with ${pendingCertification} pending (closed sessions: ${closedSessions}). Clear pending certifications daily to lock records and strengthen parent accountability.`,
      });
    }

    if ((deliveryCoveragePercent ?? 0) < 70) {
      actions.push({
        code: "DELIVERY_DISCIPLINE",
        priority: "HIGH",
        because: [
          "metrics.pipeline.deliveryCoveragePercent",
          "metrics.pipeline.approvedNotesCount",
          "metrics.pipeline.deliveredLessonsCount",
        ],
        message: `Many approved lesson notes have no delivery record: coverage ${deliveryCoveragePercent ?? 0}% (${deliveredLessonsCount}/${approvedNotesCount}). Enforce delivery logging as the proof of teaching.`,
      });
    }

    if ((assessmentLinkCoveragePercent ?? 0) < 60) {
      actions.push({
        code: "ENFORCE_LINKING",
        priority: "MEDIUM",
        because: [
          "metrics.pipeline.assessmentLinkCoveragePercent",
          "metrics.pipeline.linkedAssessmentsCount",
          "metrics.pipeline.deliveredLessonsCount",
        ],
        message: `Assessment linkage is weak: ${assessmentLinkCoveragePercent ?? 0}% (${linkedAssessmentsCount}/${deliveredLessonsCount}) delivered lessons have linked assessments. Require teachers to link assessments to delivered lessons for accurate weak-indicator analytics.`,
      });
    }

    if ((scoringCoveragePercent ?? 0) < 70) {
      actions.push({
        code: "IMPROVE_SCORING_COMPLETENESS",
        priority: "HIGH",
        because: [
          "metrics.pipeline.scoringCoveragePercent",
          "metrics.pipeline.scoredAssessmentsCount",
          "metrics.pipeline.totalAssessmentsCount",
        ],
        message: `Scoring coverage is low: ${scoringCoveragePercent ?? 0}% (${scoredAssessmentsCount}/${totalAssessmentsCount}) assessment items have any scores. Incomplete scoring blocks valid evaluation and parent insights.`,
      });
    }

    return noStore(200, {
      ok: true,
      scope: {
        tenantId: ctx.tenantId,
        term,
        academicYear,
        start: startD.toISOString().slice(0, 10),
        end: endD.toISOString().slice(0, 10),
      },
      metrics: {
        attendance: {
          totalSessions,
          closedSessions,
          certifiedSessions,
          pendingCertification,
          notifiedSessions,
          attendanceCertificationRate,
          notifyRate,
          avgCertifyDelayHrs,
          avgNotifyDelayHrs,
        },
        pipeline: {
          approvedNotesCount,
          deliveredLessonsCount,
          deliveryCoveragePercent,
          totalAssessmentsCount,
          linkedAssessmentsCount,
          assessmentLinkCoveragePercent,
          scoredAssessmentsCount,
          scoringCoveragePercent,
        },
        headteacherScore,
      },
      anomalies: {
        approvedNotDelivered: approvedNotDelivered.map((n) => ({
          id: n.id,
          subject: n.subject,
          lessonTitle: n.lessonTitle ?? null,
          approvedAt: n.approvedAt ? new Date(n.approvedAt).toISOString() : null,
          classroomId: n.classroomId ?? null,
          teacherUserId: n.teacherUserId,
        })),
        deliveredNotAssessed: deliveredNotAssessed.map((d) => ({
          id: d.id,
          subject: d.subject,
          indicatorCode: d.indicatorCode ?? null,
          dateTaught: d.dateTaught ? new Date(d.dateTaught).toISOString() : null,
          classroomId: d.classroomId,
          teacherUserId: d.teacherUserId,
        })),
        assessedNotLinked: assessedNotLinked.map((a) => ({
          id: a.id,
          subject: a.subject,
          title: a.title,
          date: a.date ? new Date(a.date).toISOString() : null,
          classroomId: a.classroomId,
        })),
      },
      actions,
    });
  } catch (err) {
    console.error("[HEADTEACHER_GOVERNANCE_INSIGHTS_ERROR]", err);
    return noStore(500, { ok: false, error: "FAILED_TO_LOAD_GOVERNANCE_INSIGHTS" });
  }
}