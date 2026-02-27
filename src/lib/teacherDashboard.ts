// src/lib/teacherDashboard.ts
import { prisma } from "@/lib/prisma";

type StatusCounts = Record<string, number>;

function pct(n: number, d: number) {
  if (!d) return 0;
  const v = (n / d) * 100;
  return Math.max(0, Math.min(100, v));
}

// Africa/Accra is UTC+0 (no DST), so UTC day boundaries match local day boundaries.
function startOfTodayAccraUtcRange() {
  const now = new Date();
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

function safeNum(n: unknown, fallback = 0) {
  return typeof n === "number" && Number.isFinite(n) ? n : fallback;
}

export async function getTeacherDashboardSnapshot(args: {
  tenantId: string;
  teacherUserId: string;
  term: string;
  academicYear: string;
  weekNumber?: number | null;
}) {
  const { tenantId, teacherUserId, term, academicYear } = args;
  const { start, end } = startOfTodayAccraUtcRange();

  try {
    // ---------------------------
    // Teacher identity (display) — ✅ tenant-scoped staffId from Membership
    // ---------------------------
    const [teacherUser, membership] = await Promise.all([
      prisma.user.findUnique({
        where: { id: teacherUserId },
        select: { firstName: true, lastName: true, name: true, staffId: true },
      }),
      prisma.membership.findUnique({
        where: { userId_tenantId: { userId: teacherUserId, tenantId } },
        select: { staffId: true },
      }),
    ]);

    const staffId = membership?.staffId ?? teacherUser?.staffId ?? null;

    const displayName =
      [teacherUser?.firstName, teacherUser?.lastName].filter(Boolean).join(" ").trim() ||
      teacherUser?.name ||
      staffId ||
      "Teacher";

    // ---------------------------
    // Attendance snapshot (tenant/day) — sequential to avoid pool starvation
    // ---------------------------
    const sessionsTotal = await prisma.attendanceSession.count({
      where: { tenantId, date: { gte: start, lt: end } },
    });

    const sessionsClosed = await prisma.attendanceSession.count({
      where: { tenantId, isClosed: true, date: { gte: start, lt: end } },
    });

    const marksByStatus = await prisma.attendanceMark.groupBy({
      by: ["status"],
      where: { session: { tenantId, date: { gte: start, lt: end } } },
      _count: { _all: true },
    });

    const attendanceCounts: StatusCounts = {};
    let marksTotal = 0;

    for (const row of marksByStatus) {
      const c = safeNum(row._count._all, 0);
      attendanceCounts[String(row.status)] = c;
      marksTotal += c;
    }

    const present = attendanceCounts["PRESENT"] ?? 0;
    const absent = attendanceCounts["ABSENT"] ?? 0;
    const late = attendanceCounts["LATE"] ?? 0;
    const excused = attendanceCounts["EXCUSED"] ?? 0;

    // ---------------------------
    // Student health snapshot (tenant/day)
    // ---------------------------
    const healthTotal = await prisma.studentHealthDaily.count({
      where: { tenantId, date: { gte: start, lt: end } },
    });

    const feverCount = await prisma.studentHealthDaily.count({
      where: { tenantId, date: { gte: start, lt: end }, temperatureC: { gte: 37.8 } },
    });

    const sentToParentCount = await prisma.studentHealthDaily.count({
      where: { tenantId, date: { gte: start, lt: end }, sentToParentAt: { not: null } },
    });

    // ---------------------------
    // Lesson notes snapshot (teacher/term/year + week)
    // ---------------------------
    // IMPORTANT: Prisma Int filter does NOT allow { not: null } here in your current client.
    // Use gt: 0 to exclude nulls safely (and week 0 is invalid anyway).
    const availableWeeksRows = await prisma.lessonNote.groupBy({
      by: ["weekNumber"],
      where: {
        tenantId,
        teacherUserId,
        term,
        academicYear,
        weekNumber: { gt: 0 },
      },
      _count: { _all: true },
      orderBy: { weekNumber: "desc" },
    });

    const availableWeeks = availableWeeksRows
      .map((r) => r.weekNumber)
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v));

    const selectedWeek =
      typeof args.weekNumber === "number" && Number.isFinite(args.weekNumber)
        ? args.weekNumber
        : availableWeeks[0] ?? null;

    const lessonStatusCounts: StatusCounts = {};
    if (selectedWeek != null) {
      const lessonStatusRows = await prisma.lessonNote.groupBy({
        by: ["status"],
        where: { tenantId, teacherUserId, term, academicYear, weekNumber: selectedWeek },
        _count: { _all: true },
      });

      for (const row of lessonStatusRows) {
        lessonStatusCounts[String(row.status)] = safeNum(row._count._all, 0);
      }
    }

    const latestLessonNote =
      selectedWeek == null
        ? null
        : await prisma.lessonNote.findFirst({
            where: { tenantId, teacherUserId, term, academicYear, weekNumber: selectedWeek },
            orderBy: { updatedAt: "desc" },
            select: {
              status: true,
              updatedAt: true,
              submittedAt: true,
              reviewedAt: true,
              approvedAt: true,
              rejectedAt: true,
              headteacherComment: true,
            },
          });

    const latestAnnouncement = await prisma.announcement.findFirst({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      select: { title: true, createdAt: true },
    });

    // ---------------------------
    // Assessments snapshot (term/year) — SCHOOLWIDE ONLY (until DB has createdByUserId)
    // ---------------------------
    const assessmentItems = await prisma.assessmentItem.findMany({
      where: { tenantId, term, academicYear },
      select: { id: true, maxScore: true, subject: true },
    });

    const itemCount = assessmentItems.length;
    const itemIds = assessmentItems.map((i) => i.id);

    const scores =
      itemIds.length > 0
        ? await prisma.assessmentScore.findMany({
            where: { itemId: { in: itemIds } },
            select: { itemId: true, score: true },
          })
        : [];

    const itemMaxById = new Map<string, number>();
    const subjectCounts: Record<string, number> = {};

    for (const it of assessmentItems) {
      itemMaxById.set(it.id, safeNum(it.maxScore, 0));
      const subj = (it.subject || "").trim() || "Unknown";
      subjectCounts[subj] = (subjectCounts[subj] || 0) + 1;
    }

    let scoreCount = 0;
    let pctSum = 0;

    const bands = {
      below40: 0,
      between40_54: 0,
      between55_69: 0,
      above70: 0,
    };

    for (const s of scores) {
      const max = itemMaxById.get(s.itemId) ?? 0;
      if (!max) continue;

      const p = (safeNum(s.score, 0) / max) * 100;
      if (!Number.isFinite(p)) continue;

      scoreCount += 1;
      pctSum += p;

      if (p < 40) bands.below40++;
      else if (p < 55) bands.between40_54++;
      else if (p < 70) bands.between55_69++;
      else bands.above70++;
    }

    const avgPct = scoreCount ? pctSum / scoreCount : 0;

    const topSubjects = Object.entries(subjectCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([subject, count]) => ({ subject, count }));

    const todayLabel = new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "Africa/Accra",
    }).format(new Date());

    return {
      teacher: { displayName, staffId },
      today: {
        label: todayLabel,
        attendance: {
          sessionsTotal,
          sessionsClosed,
          marksTotal,
          present,
          absent,
          late,
          excused,
          presentRate: pct(present, marksTotal),
          closureRate: pct(sessionsClosed, sessionsTotal),
        },
        health: { healthTotal, feverCount, sentToParentCount },
      },
      lessonNotes: {
        term,
        academicYear,
        availableWeeks,
        selectedWeek,
        statusCounts: lessonStatusCounts,
        latest: latestLessonNote,
        latestAnnouncement,
      },
      assessments: {
        term,
        academicYear,
        itemCount,
        scoreCount,
        avgPct,
        bands,
        topSubjects,
        scopeLabel: "Term snapshot (schoolwide)",
      },
      meta: { degraded: false },
    };
  } catch (err) {
    console.error("[TEACHER_DASHBOARD_SNAPSHOT_ERROR]", err);

    const todayLabel = new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "Africa/Accra",
    }).format(new Date());

    return {
      teacher: { displayName: "Teacher", staffId: null },
      today: {
        label: todayLabel,
        attendance: {
          sessionsTotal: 0,
          sessionsClosed: 0,
          marksTotal: 0,
          present: 0,
          absent: 0,
          late: 0,
          excused: 0,
          presentRate: 0,
          closureRate: 0,
        },
        health: { healthTotal: 0, feverCount: 0, sentToParentCount: 0 },
      },
      lessonNotes: {
        term,
        academicYear,
        availableWeeks: [],
        selectedWeek: null,
        statusCounts: {},
        latest: null,
        latestAnnouncement: null,
      },
      assessments: {
        term,
        academicYear,
        itemCount: 0,
        scoreCount: 0,
        avgPct: 0,
        bands: { below40: 0, between40_54: 0, between55_69: 0, above70: 0 },
        topSubjects: [],
        scopeLabel: "Term snapshot (schoolwide)",
      },
      meta: { degraded: true },
    };
  }
}
