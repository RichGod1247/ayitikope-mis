// src/app/api/headteacher/insights/risk-board/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getHeadteacherApiContext } from "@/lib/headteacherAuth";
import { StudentStatus } from "@prisma/client";

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

function clamp100(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(100, x));
}

function parseISODateOnly(v: string | null): Date | null {
  const s = cleanStr(v);
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isoDateOnly(d: Date) {
  return d.toISOString().slice(0, 10);
}

function dateRangeDefault(days = 14) {
  const end = new Date();
  const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return { start, end };
}

function pct(part: number, whole: number) {
  if (!whole) return null;
  return Number(((part / whole) * 100).toFixed(1));
}

function classLabel(
  c:
    | { name?: string | null; grade?: string | null; arm?: string | null }
    | null
    | undefined
) {
  const name = cleanStr(c?.name);
  const grade = cleanStr(c?.grade);
  const arm = cleanStr(c?.arm);

  if (name && grade) {
    const same = name.toUpperCase() === grade.toUpperCase();
    if (same) return `${name}${arm ? ` ${arm}` : ""}`;
    return `${name} (${grade}${arm ? ` ${arm}` : ""})`;
  }
  if (name) return `${name}${arm ? ` ${arm}` : ""}`;
  if (grade) return `${grade}${arm ? ` ${arm}` : ""}`;
  return "Class";
}

type RiskStudent = {
  studentId: string;
  studentName: string;
  classroomId: string | null;
  classLabel: string | null;
  riskScore: number;
  reasons: string[];
  signals: {
    attendancePercent: number | null;
    feverFlags: number;
    healthRecords: number;
    overallPercent: number | null;
    missingAssessmentsCount: number;
    expectedAssessmentsCount: number;
    scoredAssessmentsCount: number;
  };
};

type RiskClass = {
  classroomId: string;
  classLabel: string;
  enrolled: number;
  atRisk: number;
  highRisk: number;
  avgRiskScore: number | null;
  reasonsTop: string[];
};

function riskScoreFromSignals(args: {
  attendancePercent: number | null;
  feverFlags: number;
  missing: number;
  overallPercent: number | null;
}) {
  const reasons: string[] = [];
  let score = 0;

  const a = args.attendancePercent;
  if (a != null) {
    if (a < 60) {
      score += 50;
      reasons.push(`Very low attendance (~${a}%).`);
    } else if (a < 70) {
      score += 35;
      reasons.push(`Low attendance (~${a}%).`);
    } else if (a < 80) {
      score += 20;
      reasons.push(`Attendance needs attention (~${a}%).`);
    }
  }

  const f = args.feverFlags;
  if (f >= 4) {
    score += 30;
    reasons.push(`Repeated fever flags (${f}).`);
  } else if (f >= 2) {
    score += 15;
    reasons.push(`Fever flags detected (${f}).`);
  }

  const m = args.missing;
  if (m >= 6) {
    score += 30;
    reasons.push(`Many missing assessments (${m}).`);
  } else if (m >= 2) {
    score += 15;
    reasons.push(`Missing assessments (${m}).`);
  }

  const p = args.overallPercent;
  if (p != null) {
    if (p < 35) {
      score += 45;
      reasons.push(`Very weak performance (~${p}%).`);
    } else if (p < 45) {
      score += 30;
      reasons.push(`Weak performance (~${p}%).`);
    } else if (p < 55) {
      score += 15;
      reasons.push(`Below average performance (~${p}%).`);
    }
  }

  return { riskScore: clamp100(score), reasons };
}

export async function GET(req: NextRequest) {
  const ctx = await getHeadteacherApiContext();
  if (!ctx) return noStore(401, { ok: false, error: "UNAUTHORIZED" });

  const { searchParams } = new URL(req.url);

  const settings = await prisma.tenantSettings.findUnique({
    where: { tenantId: ctx.tenantId },
    select: { currentTerm: true, currentAcademicYear: true, feverThreshold: true },
  });

  const term = cleanStr(searchParams.get("term")) || settings?.currentTerm || "1st Term";
  const academicYear =
    cleanStr(searchParams.get("academicYear")) ||
    settings?.currentAcademicYear ||
    "2025/2026";

  const feverThresholdRaw =
    settings?.feverThreshold != null ? Number(settings.feverThreshold) : 37.5;
  const feverThreshold = Number.isFinite(feverThresholdRaw) ? feverThresholdRaw : 37.5;

  const startQ = parseISODateOnly(searchParams.get("start"));
  const endQ = parseISODateOnly(searchParams.get("end"));

  const defaultDays = 14;
  const dflt = dateRangeDefault(defaultDays);

  const startD = startQ ?? dflt.start;
  const endD = endQ ?? dflt.end;

  const startISO = isoDateOnly(startD);
  const endISO = isoDateOnly(endD);

  const startTs = new Date(`${startISO}T00:00:00.000Z`);
  const endTs = new Date(`${endISO}T23:59:59.999Z`);

  // For StudentHealthDaily.date (db.Date)
  const startDateOnly = new Date(`${startISO}T00:00:00.000Z`);
  const endDateOnly = new Date(`${endISO}T00:00:00.000Z`);

  try {
    // ----------- Students + classroom labels -----------
    const students = await prisma.student.findMany({
      where: { tenantId: ctx.tenantId, status: StudentStatus.ACTIVE },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        classroomId: true,
        classroom: { select: { id: true, name: true, grade: true, arm: true } },
      },
      take: 20000,
    });

    const studentNameById = new Map<string, string>();
    const classById = new Map<string, { id: string; name: string; grade: string | null; arm: string | null }>();

    for (const s of students) {
      const name = `${cleanStr(s.lastName)} ${cleanStr(s.firstName)}`.trim() || "Learner";
      studentNameById.set(s.id, name);
      if (s.classroom?.id) classById.set(s.classroom.id, s.classroom as any);
    }

    // ----------- Attendance marks in window -----------
    const marks = await prisma.attendanceMark.findMany({
      where: {
        session: {
          tenantId: ctx.tenantId,
          date: { gte: startTs, lte: endTs },
        },
      },
      select: { studentId: true, status: true },
      take: 500000,
    });

    const attAgg = new Map<string, { present: number; absent: number; late: number; excused: number }>();
    for (const m of marks) {
      const sid = m.studentId;
      const a = attAgg.get(sid) ?? { present: 0, absent: 0, late: 0, excused: 0 };
      const st = String(m.status ?? "").toUpperCase();
      if (st === "PRESENT") a.present += 1;
      else if (st === "ABSENT") a.absent += 1;
      else if (st === "LATE") a.late += 1;
      else if (st === "EXCUSED") a.excused += 1;
      attAgg.set(sid, a);
    }

    // ----------- Health in window -----------
    const healthRows = await prisma.studentHealthDaily.findMany({
      where: {
        tenantId: ctx.tenantId,
        date: { gte: startDateOnly, lte: endDateOnly },
      },
      select: { studentId: true, temperatureC: true },
      take: 500000,
    });

    const healthAgg = new Map<string, { records: number; feverFlags: number }>();
    for (const h of healthRows) {
      const sid = h.studentId;
      const a = healthAgg.get(sid) ?? { records: 0, feverFlags: 0 };
      a.records += 1;

      const t = h.temperatureC != null ? Number(h.temperatureC) : null;
      if (t != null && Number.isFinite(t) && t >= feverThreshold) a.feverFlags += 1;

      healthAgg.set(sid, a);
    }

    // ----------- Performance (term/year) -----------
    const items = await prisma.assessmentItem.findMany({
      where: {
        tenantId: ctx.tenantId,
        term,
        academicYear,
        status: { in: ["PUBLISHED", "LOCKED"] },
      },
      select: { id: true, classroomId: true, maxScore: true },
      take: 20000,
    });

    const itemMaxById = new Map<string, number>();
    const expectedCountByClass = new Map<string, number>();

    for (const it of items) {
      itemMaxById.set(it.id, Number(it.maxScore ?? 0));
      expectedCountByClass.set(
        it.classroomId,
        (expectedCountByClass.get(it.classroomId) ?? 0) + 1
      );
    }

    const itemIds = items.map((x) => x.id);

    const scores = itemIds.length
      ? await prisma.assessmentScore.findMany({
          where: { itemId: { in: itemIds } },
          select: { studentId: true, itemId: true, score: true },
          take: 500000,
        })
      : [];

    const perfAgg = new Map<
      string,
      { scoredSet: Set<string>; sumScore: number; sumMax: number; scoredCount: number }
    >();

    for (const s of scores) {
      const sid = s.studentId;
      const itemId = s.itemId;
      const max = itemMaxById.get(itemId) ?? 0;
      if (max <= 0) continue;

      const a =
        perfAgg.get(sid) ??
        { scoredSet: new Set<string>(), sumScore: 0, sumMax: 0, scoredCount: 0 };

      if (!a.scoredSet.has(itemId)) {
        a.scoredSet.add(itemId);
        a.scoredCount += 1;
      }
      a.sumScore += Number(s.score ?? 0);
      a.sumMax += max;

      perfAgg.set(sid, a);
    }

    // ----------- Build risk rows + class aggregation -----------
    const riskStudents: RiskStudent[] = [];

    const classRiskBucket = new Map<
      string,
      {
        enrolled: number;
        atRisk: number;
        highRisk: number;
        sum: number;
        count: number;
        reasonsCount: Record<string, number>;
      }
    >();

    for (const s of students) {
      const sid = s.id;
      const classroomId = s.classroomId ?? null;

      const att = attAgg.get(sid) ?? { present: 0, absent: 0, late: 0, excused: 0 };
      const denom = att.present + att.absent + att.late + att.excused;
      const attended = att.present + att.late + att.excused;
      const attendancePercent =
        denom > 0 ? Number(((attended / denom) * 100).toFixed(1)) : null;

      const h = healthAgg.get(sid) ?? { records: 0, feverFlags: 0 };

      const p = perfAgg.get(sid);
      const overallPercent =
        p && p.sumMax > 0 ? Number(((p.sumScore / p.sumMax) * 100).toFixed(1)) : null;

      const expected = classroomId ? expectedCountByClass.get(classroomId) ?? 0 : 0;
      const scoredCount = p?.scoredCount ?? 0;
      const missing = Math.max(0, expected - scoredCount);

      const rs = riskScoreFromSignals({
        attendancePercent,
        feverFlags: h.feverFlags,
        missing,
        overallPercent,
      });

      // Ensure class bucket exists for enrolled counts
      if (classroomId) {
        const b =
          classRiskBucket.get(classroomId) ??
          { enrolled: 0, atRisk: 0, highRisk: 0, sum: 0, count: 0, reasonsCount: {} };
        b.enrolled += 1;
        classRiskBucket.set(classroomId, b);
      }

      if (rs.riskScore <= 0) continue;

      const cname = studentNameById.get(sid) ?? "Learner";
      const cls = classroomId ? classById.get(classroomId) ?? null : null;

      riskStudents.push({
        studentId: sid,
        studentName: cname,
        classroomId,
        classLabel: classroomId ? classLabel(cls as any) : null,
        riskScore: rs.riskScore,
        reasons: rs.reasons,
        signals: {
          attendancePercent,
          feverFlags: h.feverFlags,
          healthRecords: h.records,
          overallPercent,
          missingAssessmentsCount: missing,
          expectedAssessmentsCount: expected,
          scoredAssessmentsCount: scoredCount,
        },
      });

      // class aggregation
      if (classroomId) {
        const b =
          classRiskBucket.get(classroomId) ??
          { enrolled: 0, atRisk: 0, highRisk: 0, sum: 0, count: 0, reasonsCount: {} };

        b.atRisk += 1;
        if (rs.riskScore >= 70) b.highRisk += 1;
        b.sum += rs.riskScore;
        b.count += 1;

        for (const r of rs.reasons) {
          b.reasonsCount[r] = (b.reasonsCount[r] ?? 0) + 1;
        }

        classRiskBucket.set(classroomId, b);
      }
    }

    riskStudents.sort((a, b) => b.riskScore - a.riskScore);

    const classesRisk: RiskClass[] = [];
    for (const [classroomId, b] of classRiskBucket.entries()) {
      const cls = classById.get(classroomId);
      if (!cls) continue;

      const reasonPairs = Object.entries(b.reasonsCount).sort((a, x) => x[1] - a[1]);
      const reasonsTop = reasonPairs.slice(0, 3).map(([k]) => k);

      classesRisk.push({
        classroomId,
        classLabel: classLabel(cls),
        enrolled: b.enrolled,
        atRisk: b.atRisk,
        highRisk: b.highRisk,
        avgRiskScore: b.count ? Number((b.sum / b.count).toFixed(1)) : null,
        reasonsTop,
      });
    }

    classesRisk.sort((a, b) => (b.avgRiskScore ?? 0) - (a.avgRiskScore ?? 0));

    const atRiskStudents = riskStudents.length;
    const highRiskStudents = riskStudents.filter((x) => x.riskScore >= 70).length;

    const atRiskRate = pct(atRiskStudents, Math.max(1, students.length));
    const highRiskRate = pct(highRiskStudents, Math.max(1, students.length));

    // Deterministic signal counts (derived from reasons)
    const attendanceHeavy = riskStudents.filter((s) =>
      s.reasons.some((r) => r.toLowerCase().includes("attendance"))
    ).length;
    const feverHeavy = riskStudents.filter((s) =>
      s.reasons.some((r) => r.toLowerCase().includes("fever"))
    ).length;
    const missingHeavy = riskStudents.filter((s) =>
      s.reasons.some((r) => r.toLowerCase().includes("missing"))
    ).length;

    const attendanceHeavyRate = pct(attendanceHeavy, Math.max(1, atRiskStudents));
    const feverHeavyRate = pct(feverHeavy, Math.max(1, atRiskStudents));
    const missingHeavyRate = pct(missingHeavy, Math.max(1, atRiskStudents));

    // ✅ Insight Contract: metrics + actions (actions reference metrics.* keys)
    const metrics = {
      window: {
        term,
        academicYear,
        start: startISO,
        end: endISO,
        windowDays: defaultDays,
        feverThreshold,
      },
      population: {
        studentsCount: students.length,
        classroomsCount: classById.size,
      },
      risk: {
        atRiskStudents,
        highRiskStudents,
        atRiskRate,
        highRiskRate,
      },
      signals: {
        attendanceHeavyCount: attendanceHeavy,
        feverHeavyCount: feverHeavy,
        missingHeavyCount: missingHeavy,
        attendanceHeavyRate,
        feverHeavyRate,
        missingHeavyRate,
      },
    };

    const actions: Array<{
      code: string;
      priority: "HIGH" | "MEDIUM" | "LOW";
      because: string[];
      message: string;
    }> = [];

    // thresholds are deterministic: proportions inside atRisk pool
    const attTrigger = attendanceHeavy >= Math.max(5, Math.round(atRiskStudents * 0.25));
    const missingTrigger = missingHeavy >= Math.max(5, Math.round(atRiskStudents * 0.25));
    const feverTrigger = feverHeavy >= Math.max(3, Math.round(atRiskStudents * 0.15));

    if (attTrigger) {
      actions.push({
        code: "ATTENDANCE_FOLLOWUP",
        priority: "HIGH",
        because: [
          "metrics.signals.attendanceHeavyCount",
          "metrics.signals.attendanceHeavyRate",
          "metrics.risk.atRiskStudents",
        ],
        message: `Attendance risk is widespread: ${attendanceHeavy}/${atRiskStudents} at-risk learners (${attendanceHeavyRate ?? 0}%) are flagged for attendance. Enforce punctuality, contact guardians, and review chronic absentee lists weekly.`,
      });
    }

    if (missingTrigger) {
      actions.push({
        code: "COMPLETE_SCORING",
        priority: "HIGH",
        because: [
          "metrics.signals.missingHeavyCount",
          "metrics.signals.missingHeavyRate",
          "metrics.risk.atRiskStudents",
        ],
        message: `Missing scores are driving risk: ${missingHeavy}/${atRiskStudents} at-risk learners (${missingHeavyRate ?? 0}%) are flagged for missing assessments. Push teachers to finish scoring for published/locked assessments to restore analytics accuracy.`,
      });
    }

    if (feverTrigger) {
      actions.push({
        code: "HEALTH_ESCALATION",
        priority: "MEDIUM",
        because: [
          "metrics.signals.feverHeavyCount",
          "metrics.signals.feverHeavyRate",
          "metrics.window.feverThreshold",
        ],
        message: `Health risk is showing: ${feverHeavy}/${atRiskStudents} at-risk learners (${feverHeavyRate ?? 0}%) are flagged for fever. Follow up with guardians and ensure screening notes are complete (threshold ${feverThreshold}°C).`,
      });
    }

    // Optional: if high-risk is large, force a triage workflow (still deterministic)
    if (highRiskStudents >= Math.max(10, Math.round(students.length * 0.05))) {
      actions.push({
        code: "HIGH_RISK_TRIAGE",
        priority: "HIGH",
        because: ["metrics.risk.highRiskStudents", "metrics.risk.highRiskRate"],
        message: `High-risk load is elevated: ${highRiskStudents}/${students.length} learners (${highRiskRate ?? 0}%). Create a weekly triage list (top 10) and assign follow-up owners (class teacher + welfare + headteacher).`,
      });
    }

    return noStore(200, {
      ok: true,

      // existing scope (kept)
      scope: {
        tenantId: ctx.tenantId,
        term,
        academicYear,
        start: startISO,
        end: endISO,
        windowDays: defaultDays,
        feverThreshold,
      },

      // ✅ contract block
      metrics,
      actions,

      // ✅ data payload for UI (new, optional)
      data: {
        topStudents: riskStudents.slice(0, 25),
        topClasses: classesRisk.slice(0, 15),
      },

      // legacy fields (kept so nothing breaks)
      totals: {
        students: students.length,
        classrooms: classById.size,
        atRiskStudents,
        highRiskStudents,
      },
      topStudents: riskStudents.slice(0, 25),
      topClasses: classesRisk.slice(0, 15),

      note:
        "Risk score is a deterministic composite from attendance, health fever flags, missing assessments, and low performance. It is for support and follow-up, not punishment.",
    });
  } catch (err) {
    console.error("[HEADTEACHER_RISK_BOARD_ERROR]", err);
    return noStore(500, { ok: false, error: "FAILED_TO_LOAD_RISK_BOARD" });
  }
}