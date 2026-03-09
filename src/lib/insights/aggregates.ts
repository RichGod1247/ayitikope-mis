// src/lib/insights/aggregates.ts
import { prisma } from "@/lib/prisma";
import { isAdminLikeRole } from "@/lib/teacherAccess";

export type Priority = "HIGH" | "MEDIUM" | "LOW";

export type InsightAction = {
  code: string;
  priority: Priority;
  message: string;
  because: string[]; // metric keys used to justify this action
};

export type Coverage = {
  deliveryCoveragePercent: number | null; // delivered / approved notes
  assessmentLinkCoveragePercent: number | null; // linked assessments / deliveries
  scoringCoveragePercent: number | null; // scored assessments / assessments
};

export type ClassPerformanceMetrics = {
  // Scope
  tenantId: string;
  classroomId: string;
  term: string;
  academicYear: string;
  roleName: string | null;
  allowedSubjects: string[] | null;
  scopeSource?: string | null;

  // Counts
  learnersCount: number;
  assessmentItemsCount: number;
  scoredRowsCount: number;
  scoredAssessmentsCount: number;

  // Averages
  classAveragePercent: number | null;

  // Subject and indicator breakdown
  subjectAverages: Array<{ subject: string; averagePercent: number | null; scoredRows: number }>;
  weakIndicators: Array<{
    indicatorCode: string;
    averagePercent: number | null;
    scoredRows: number;
    linkedAssessments: number;
  }>;

  // Missing scores & “skip assessments”
  expectedAssessmentsCount: number; // assessments that have at least 1 score anywhere in class scope
  topMissingScores: Array<{
    studentId: string;
    studentName: string;
    missingCount: number;
    expectedCount: number;
  }>;

  // Attendance + health (heatmap-lite)
  attendanceWindow: { start: string; end: string };
  topAbsentees: Array<{
    studentId: string;
    studentName: string;
    absentCount: number;
    lateCount: number;
    presentCount: number;
    excusedCount: number;
    attendancePercent: number | null;
  }>;

  topHealthFlags: Array<{
    studentId: string;
    studentName: string;
    healthRecords: number;
    feverFlags: number;
  }>;

  // Pipeline
  pipeline: {
    approvedNotesCount: number;
    deliveredLessonsCount: number;
    linkedAssessmentsCount: number;
    scoredAssessmentsCount: number;
  };
  coverage: Coverage;

  // Teacher effectiveness index (0–100)
  teacherEffectivenessIndex: number | null;
};

export type StudentSwot = {
  studentId: string;
  studentName: string;
  classroomId: string;
  term: string;
  academicYear: string;

  overallPercent: number | null;

  strengths: string[];
  weaknesses: string[];
  opportunities: string[];
  threats: string[];

  metrics: {
    expectedAssessmentsCount: number;
    scoredAssessmentsCount: number;
    missingAssessmentsCount: number;

    attendancePercent: number | null;
    absentCount: number;
    lateCount: number;

    healthRecords: number;
    feverFlags: number;
  };
};

function cleanStr(v: unknown) {
  return String(v ?? "").trim();
}

function pct(part: number, whole: number): number | null {
  if (!whole) return null;
  return Number(((part / whole) * 100).toFixed(1));
}

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function clamp100(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(100, x));
}

function isoDateOnly(d: Date) {
  return d.toISOString().slice(0, 10);
}

function defaultWindowDays(days: number) {
  const end = new Date();
  const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return { start, end };
}

function buildSubjectWhere(args: { roleName: string | null; allowedSubjects: string[] | null }) {
  if (isAdminLikeRole(args.roleName)) return {};
  if (args.allowedSubjects?.length) {
    return {
      OR: args.allowedSubjects.map((s) => ({
        subject: { equals: s, mode: "insensitive" as const },
      })),
    };
  }
  return {};
}

export function rulesTeacherActions(metrics: ClassPerformanceMetrics): InsightAction[] {
  const actions: InsightAction[] = [];

  const avg = metrics.classAveragePercent;
  const sc = metrics.coverage.scoringCoveragePercent;

  // 1) Data quality first
  if (metrics.assessmentItemsCount > 0 && (sc == null || sc < 60)) {
    actions.push({
      code: "IMPROVE_SCORING_COVERAGE",
      priority: "HIGH",
      because: ["coverage.scoringCoveragePercent", "assessmentItemsCount"],
      message:
        "Scores are incomplete. Increase scoring coverage (aim ≥ 80%) before drawing strong conclusions. Missing scores distort the teacher performance metric.",
    });
  }

  // 2) Reteach rule (only when data is reasonably complete)
  if (avg != null && sc != null && sc >= 70) {
    if (avg < 50) {
      actions.push({
        code: "RETEACH_REQUIRED",
        priority: "HIGH",
        because: ["classAveragePercent", "coverage.scoringCoveragePercent"],
        message:
          "Class average is below 50% with strong scoring coverage. Reteach the weakest indicator(s) using smaller steps + guided practice, then reassess quickly.",
      });
    } else if (avg < 60) {
      actions.push({
        code: "RETEACH_RECOMMENDED",
        priority: "MEDIUM",
        because: ["classAveragePercent", "coverage.scoringCoveragePercent"],
        message:
          "Class average is below 60% with good scoring coverage. Consider partial reteach (focus only on weak indicators), then give a short corrective assessment.",
      });
    }
  }

  // 3) Instructional strategies (tied to weak indicators)
  if (metrics.weakIndicators.length > 0) {
    const topWeak = metrics.weakIndicators.slice(0, 2).map((w) => w.indicatorCode).filter(Boolean);
    actions.push({
      code: "TARGETED_METHODS_NEXT_LESSON",
      priority: "MEDIUM",
      because: ["weakIndicators"],
      message:
        `Next lesson: target weak indicator(s) ${topWeak.join(", ") || "(see weak indicators)"} using: (1) quick recap, (2) teacher modeling, (3) pair practice, (4) exit ticket in 3 minutes.`
    });
  }

  // 4) Attendance/health alerts (support, not punishment)
  if (metrics.topAbsentees.length > 0) {
    actions.push({
      code: "ABSENCE_FOLLOWUP",
      priority: "MEDIUM",
      because: ["topAbsentees"],
      message:
        "Several learners are frequently absent/late. Attendance issues often drive poor performance. Do short follow-ups with guardians and use a buddy system for catch-up.",
    });
  }

  if (metrics.topHealthFlags.length > 0) {
    actions.push({
      code: "HEALTH_SUPPORT_ALERT",
      priority: "LOW",
      because: ["topHealthFlags"],
      message:
        "Repeated health flags can depress learning. Support affected learners with gentle catch-up plans and notify school health focal persons when needed.",
    });
  }

  // 5) Pipeline governance reminder (delivered → assessed → scored)
  const cov = metrics.coverage;
  if (cov.deliveryCoveragePercent != null && cov.deliveryCoveragePercent < 70) {
    actions.push({
      code: "DELIVERY_LOG_DISCIPLINE",
      priority: "MEDIUM",
      because: ["coverage.deliveryCoveragePercent"],
      message:
        "Many approved notes have no delivery record yet. Record lesson deliveries consistently to keep analytics trustworthy.",
    });
  }
  if (cov.assessmentLinkCoveragePercent != null && cov.assessmentLinkCoveragePercent < 60) {
    actions.push({
      code: "LINK_ASSESSMENTS_TO_DELIVERY",
      priority: "MEDIUM",
      because: ["coverage.assessmentLinkCoveragePercent"],
      message:
        "Many assessments are not linked to delivered lessons. Link assessments to lesson deliveries so weak indicators are detectable and reteach decisions are accurate.",
    });
  }

  // If almost no data: calm message
  if (metrics.assessmentItemsCount === 0) {
    actions.push({
      code: "NO_ASSESSMENT_DATA_YET",
      priority: "LOW",
      because: ["assessmentItemsCount"],
      message:
        "No assessment items found in this scope. Create at least 2–3 assessments and score them to activate performance insights.",
    });
  }

  return actions;
}

export async function computeTeacherClassInsights(args: {
  tenantId: string;
  userId: string;
  roleName: string | null;
  classroomId: string;
  term: string;
  academicYear: string;
  allowedSubjects: string[] | null;
  scopeSource?: string | null;
  attendanceDays?: number; // default 30
}): Promise<ClassPerformanceMetrics> {
  const attendanceDays = typeof args.attendanceDays === "number" && args.attendanceDays > 0 ? args.attendanceDays : 30;

  // Active students (for names + expected score checks)
  const studentsRaw = await prisma.student.findMany({
    where: { tenantId: args.tenantId, classroomId: args.classroomId, status: "ACTIVE" },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }, { createdAt: "asc" }],
    select: { id: true, firstName: true, lastName: true },
  });

  const studentName = new Map<string, string>();
  for (const s of studentsRaw) {
    const name = `${cleanStr(s.firstName)} ${cleanStr(s.lastName)}`.trim() || "Learner";
    studentName.set(s.id, name);
  }

  // Assessments (subject-scoped)
  const subjectWhere = buildSubjectWhere({ roleName: args.roleName, allowedSubjects: args.allowedSubjects });

  const items = await prisma.assessmentItem.findMany({
    where: {
      tenantId: args.tenantId,
      classroomId: args.classroomId,
      term: args.term,
      academicYear: args.academicYear,
      ...(subjectWhere as any),
    } as any,
    select: {
      id: true,
      subject: true,
      maxScore: true,
      lessonDeliveryId: true,
    },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    take: 500,
  });

  const itemMax = new Map<string, number>();
  const itemSubject = new Map<string, string>();
  const lessonDeliveryIds: string[] = [];

  for (const it of items) {
    itemMax.set(it.id, Number(it.maxScore ?? 0));
    itemSubject.set(it.id, cleanStr(it.subject) || "Subject");
    if (it.lessonDeliveryId) lessonDeliveryIds.push(it.lessonDeliveryId);
  }

  const itemIds = items.map((x) => x.id);

  // Scores (rows)
  const scores = itemIds.length
    ? await prisma.assessmentScore.findMany({
        where: { itemId: { in: itemIds } },
        select: { itemId: true, studentId: true, score: true },
      })
    : [];

  // scoredAssessmentsCount = items that have >= 1 score row
  const scoredItemSet = new Set(scores.map((s) => s.itemId));
  const expectedAssessmentsCount = scoredItemSet.size;

  // LessonDelivery → indicatorCode mapping (for weak indicators)
  const deliveryMap = new Map<string, { indicatorCode: string | null; contentStandardCode: string | null }>();
  if (lessonDeliveryIds.length) {
    const rows = await prisma.lessonDelivery.findMany({
      where: { tenantId: args.tenantId, id: { in: lessonDeliveryIds } },
      select: { id: true, indicatorCode: true, contentStandardCode: true },
      take: 1000,
    });

    for (const r of rows) {
      deliveryMap.set(r.id, {
        indicatorCode: cleanStr(r.indicatorCode) || null,
        contentStandardCode: cleanStr(r.contentStandardCode) || null,
      });
    }
  }

  // Compute class average + per subject + per indicator
  let totalScore = 0;
  let totalMax = 0;

  const subjectAgg = new Map<string, { scoreSum: number; maxSum: number; rows: number }>();
  const indicatorAgg = new Map<string, { scoreSum: number; maxSum: number; rows: number; linkedItems: Set<string> }>();

  // For per-student missing scores
  const perStudentScoredCount = new Map<string, number>();
  const perStudentScoreSum = new Map<string, number>();
  const perStudentMaxSum = new Map<string, number>();

  for (const r of scores) {
    const max = itemMax.get(r.itemId) ?? 0;
    if (max <= 0) continue;

    const score = Number(r.score ?? 0);

    totalScore += score;
    totalMax += max;

    // subject
    const subj = itemSubject.get(r.itemId) ?? "Subject";
    const sAgg = subjectAgg.get(subj) ?? { scoreSum: 0, maxSum: 0, rows: 0 };
    sAgg.scoreSum += score;
    sAgg.maxSum += max;
    sAgg.rows += 1;
    subjectAgg.set(subj, sAgg);

    // student
    const sid = r.studentId;
    perStudentScoredCount.set(sid, (perStudentScoredCount.get(sid) ?? 0) + 1);
    perStudentScoreSum.set(sid, (perStudentScoreSum.get(sid) ?? 0) + score);
    perStudentMaxSum.set(sid, (perStudentMaxSum.get(sid) ?? 0) + max);

    // indicator (only if item is linked to delivery and that delivery has indicator)
    const it = items.find((x) => x.id === r.itemId);
    const dId = it?.lessonDeliveryId ?? null;
    if (dId) {
      const dm = deliveryMap.get(dId);
      const ind = cleanStr(dm?.indicatorCode) || cleanStr(dm?.contentStandardCode);
      if (ind) {
        const iAgg =
          indicatorAgg.get(ind) ?? { scoreSum: 0, maxSum: 0, rows: 0, linkedItems: new Set<string>() };
        iAgg.scoreSum += score;
        iAgg.maxSum += max;
        iAgg.rows += 1;
        iAgg.linkedItems.add(r.itemId);
        indicatorAgg.set(ind, iAgg);
      }
    }
  }

  const classAveragePercent = totalMax > 0 ? Number(((totalScore / totalMax) * 100).toFixed(1)) : null;

  const subjectAverages = [...subjectAgg.entries()]
    .map(([subject, a]) => ({
      subject,
      scoredRows: a.rows,
      averagePercent: a.maxSum > 0 ? Number(((a.scoreSum / a.maxSum) * 100).toFixed(1)) : null,
    }))
    .sort((a, b) => (b.averagePercent ?? -1) - (a.averagePercent ?? -1));

  const weakIndicators = [...indicatorAgg.entries()]
    .map(([indicatorCode, a]) => ({
      indicatorCode,
      scoredRows: a.rows,
      linkedAssessments: a.linkedItems.size,
      averagePercent: a.maxSum > 0 ? Number(((a.scoreSum / a.maxSum) * 100).toFixed(1)) : null,
    }))
    .sort((a, b) => (a.averagePercent ?? 999) - (b.averagePercent ?? 999))
    .slice(0, 8);

  // Missing scores list (only for expected assessments = those that have at least 1 score)
  const expected = expectedAssessmentsCount;
  const topMissingScores = studentsRaw
    .map((s) => {
      const got = perStudentScoredCount.get(s.id) ?? 0;
      const missingCount = Math.max(0, expected - got);
      return {
        studentId: s.id,
        studentName: studentName.get(s.id) ?? "Learner",
        missingCount,
        expectedCount: expected,
      };
    })
    .sort((a, b) => b.missingCount - a.missingCount)
    .slice(0, 10);

  // Pipeline (school-proof chain)
  const notesWhere: any = {
    tenantId: args.tenantId,
    classroomId: args.classroomId,
    term: args.term,
    academicYear: args.academicYear,
    status: "APPROVED",
    ...(subjectWhere as any),
  };

  const deliveriesWhere: any = {
    tenantId: args.tenantId,
    classroomId: args.classroomId,
    term: args.term,
    academicYear: args.academicYear,
    ...(subjectWhere as any),
  };

  // Teacher scope: for non-admin-like, enforce teacherUserId (for “your work” signal)
  if (!isAdminLikeRole(args.roleName)) {
    notesWhere.teacherUserId = args.userId;
    deliveriesWhere.teacherUserId = args.userId;
  }

  const [approvedNotesCount, deliveredLessonsCount] = await Promise.all([
    prisma.lessonNote.count({ where: notesWhere }),
    prisma.lessonDelivery.count({ where: deliveriesWhere }),
  ]);

  const linkedAssessmentsCount = await prisma.assessmentItem.count({
    where: {
      tenantId: args.tenantId,
      classroomId: args.classroomId,
      term: args.term,
      academicYear: args.academicYear,
      lessonDeliveryId: { not: null },
      ...(subjectWhere as any),
    } as any,
  });

  const scoredAssessmentsCount = scoredItemSet.size;

  const coverage: Coverage = {
    deliveryCoveragePercent: pct(deliveredLessonsCount, approvedNotesCount),
    assessmentLinkCoveragePercent: pct(linkedAssessmentsCount, deliveredLessonsCount),
    scoringCoveragePercent: pct(scoredAssessmentsCount, items.length),
  };

  // Attendance window + rollups (last N days)
  const win = defaultWindowDays(attendanceDays);
  const startISO = isoDateOnly(win.start);
  const endISO = isoDateOnly(win.end);

  const marks = await prisma.attendanceMark.findMany({
    where: {
      session: {
        tenantId: args.tenantId,
        classroomId: args.classroomId,
        date: {
          gte: new Date(`${startISO}T00:00:00.000Z`),
          lte: new Date(`${endISO}T23:59:59.999Z`),
        },
      },
      studentId: { in: studentsRaw.map((s) => s.id) },
    },
    select: { studentId: true, status: true },
    take: 200000,
  });

  const attAgg = new Map<
    string,
    { present: number; absent: number; late: number; excused: number }
  >();

  for (const m of marks) {
    const sid = m.studentId;
    const a = attAgg.get(sid) ?? { present: 0, absent: 0, late: 0, excused: 0 };
    const st = String(m.status || "").toUpperCase();
    if (st === "PRESENT") a.present += 1;
    else if (st === "ABSENT") a.absent += 1;
    else if (st === "LATE") a.late += 1;
    else if (st === "EXCUSED") a.excused += 1;
    attAgg.set(sid, a);
  }

  const topAbsentees = studentsRaw
    .map((s) => {
      const a = attAgg.get(s.id) ?? { present: 0, absent: 0, late: 0, excused: 0 };
      const denom = a.present + a.absent + a.late + a.excused;
      const attended = a.present + a.late + a.excused;
      const attendancePercent = denom > 0 ? Number(((attended / denom) * 100).toFixed(1)) : null;
      return {
        studentId: s.id,
        studentName: studentName.get(s.id) ?? "Learner",
        absentCount: a.absent,
        lateCount: a.late,
        presentCount: a.present,
        excusedCount: a.excused,
        attendancePercent,
      };
    })
    .sort((a, b) => b.absentCount - a.absentCount || (a.attendancePercent ?? 101) - (b.attendancePercent ?? 101))
    .slice(0, 10);

  // Health heatmap (StudentHealthDaily)
  const settings = await prisma.tenantSettings.findUnique({
    where: { tenantId: args.tenantId },
    select: { feverThreshold: true },
  });

  const feverThreshold = settings?.feverThreshold != null ? Number(settings.feverThreshold) : 37.5;

  const healthRows = await prisma.studentHealthDaily.findMany({
    where: {
      tenantId: args.tenantId,
      classroomId: args.classroomId,
      date: {
        gte: new Date(`${startISO}T00:00:00.000Z`),
        lte: new Date(`${endISO}T23:59:59.999Z`),
      },
    },
    select: { studentId: true, temperatureC: true },
    take: 200000,
  });

  const healthAgg = new Map<string, { records: number; fever: number }>();
  for (const h of healthRows) {
    const sid = h.studentId;
    const cur = healthAgg.get(sid) ?? { records: 0, fever: 0 };
    cur.records += 1;
    const t = h.temperatureC != null ? Number(h.temperatureC) : null;
    if (t != null && Number.isFinite(t) && t >= feverThreshold) cur.fever += 1;
    healthAgg.set(sid, cur);
  }

  const topHealthFlags = studentsRaw
    .map((s) => {
      const h = healthAgg.get(s.id) ?? { records: 0, fever: 0 };
      return {
        studentId: s.id,
        studentName: studentName.get(s.id) ?? "Learner",
        healthRecords: h.records,
        feverFlags: h.fever,
      };
    })
    .filter((x) => x.healthRecords > 0 || x.feverFlags > 0)
    .sort((a, b) => b.feverFlags - a.feverFlags || b.healthRecords - a.healthRecords)
    .slice(0, 10);

  // Teacher effectiveness index (0–100): performance + attendance + data coverage
  const perf = avgToUnit(classAveragePercent); // 0..1
  const att = avgToUnit(avgAttendance(topAbsentees)); // 0..1 (class-level proxy)
  const covFactor = clamp01((coverage.scoringCoveragePercent ?? 0) / 80); // full weight at 80%

  const teacherEffectivenessIndex =
    classAveragePercent == null
      ? null
      : Number(clamp100(((0.75 * perf + 0.25 * att) * 100) * covFactor).toFixed(1));

  return {
    tenantId: args.tenantId,
    classroomId: args.classroomId,
    term: args.term,
    academicYear: args.academicYear,
    roleName: args.roleName,
    allowedSubjects: args.allowedSubjects,
    scopeSource: args.scopeSource,

    learnersCount: studentsRaw.length,
    assessmentItemsCount: items.length,
    scoredRowsCount: scores.length,
    scoredAssessmentsCount,

    classAveragePercent,
    subjectAverages,
    weakIndicators,

    expectedAssessmentsCount,
    topMissingScores,

    attendanceWindow: { start: startISO, end: endISO },
    topAbsentees,
    topHealthFlags,

    pipeline: {
      approvedNotesCount,
      deliveredLessonsCount,
      linkedAssessmentsCount,
      scoredAssessmentsCount,
    },
    coverage,

    teacherEffectivenessIndex,
  };
}

function avgToUnit(p: number | null): number {
  if (p == null || !Number.isFinite(p)) return 0;
  return clamp01(p / 100);
}

function avgAttendance(absRows: Array<{ attendancePercent: number | null }>): number | null {
  const vals = absRows.map((r) => r.attendancePercent).filter((x): x is number => typeof x === "number");
  if (!vals.length) return null;
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  return Number(avg.toFixed(1));
}

export async function computeStudentSwot(args: {
  tenantId: string;
  userId: string;
  roleName: string | null;
  classroomId: string;
  studentId: string;
  term: string;
  academicYear: string;
  allowedSubjects: string[] | null;
  attendanceDays?: number;
}): Promise<StudentSwot> {
  const attendanceDays = typeof args.attendanceDays === "number" && args.attendanceDays > 0 ? args.attendanceDays : 30;

  const student = await prisma.student.findFirst({
    where: { id: args.studentId, tenantId: args.tenantId, classroomId: args.classroomId, status: "ACTIVE" },
    select: { id: true, firstName: true, lastName: true },
  });

  if (!student) {
    // caller should have verified scope; we still hard fail with a safe default
    return {
      studentId: args.studentId,
      studentName: "Learner",
      classroomId: args.classroomId,
      term: args.term,
      academicYear: args.academicYear,
      overallPercent: null,
      strengths: [],
      weaknesses: [],
      opportunities: [],
      threats: ["Student not found in this class scope."],
      metrics: {
        expectedAssessmentsCount: 0,
        scoredAssessmentsCount: 0,
        missingAssessmentsCount: 0,
        attendancePercent: null,
        absentCount: 0,
        lateCount: 0,
        healthRecords: 0,
        feverFlags: 0,
      },
    };
  }

  const name = `${cleanStr(student.firstName)} ${cleanStr(student.lastName)}`.trim() || "Learner";

  const subjectWhere = buildSubjectWhere({ roleName: args.roleName, allowedSubjects: args.allowedSubjects });

  const items = await prisma.assessmentItem.findMany({
    where: {
      tenantId: args.tenantId,
      classroomId: args.classroomId,
      term: args.term,
      academicYear: args.academicYear,
      ...(subjectWhere as any),
    } as any,
    select: { id: true, subject: true, maxScore: true },
    take: 500,
  });

  const itemIds = items.map((i) => i.id);
  const itemMax = new Map<string, number>();
  const itemSubject = new Map<string, string>();
  for (const it of items) {
    itemMax.set(it.id, Number(it.maxScore ?? 0));
    itemSubject.set(it.id, cleanStr(it.subject) || "Subject");
  }

  const allScores = itemIds.length
    ? await prisma.assessmentScore.findMany({
        where: { itemId: { in: itemIds }, studentId: student.id },
        select: { itemId: true, score: true },
      })
    : [];

  const scoredItemSet = new Set(allScores.map((s) => s.itemId));
  const expectedItemSet = await prisma.assessmentScore
    .findMany({
      where: { itemId: { in: itemIds } },
      distinct: ["itemId"],
      select: { itemId: true },
    })
    .then((rows) => new Set(rows.map((r) => r.itemId)));

  const expectedAssessmentsCount = expectedItemSet.size;
  const scoredAssessmentsCount = scoredItemSet.size;
  const missingAssessmentsCount = Math.max(0, expectedAssessmentsCount - scoredAssessmentsCount);

  // Overall percent
  let sum = 0;
  let max = 0;

  // Subject percent
  const subjAgg = new Map<string, { sum: number; max: number }>();

  for (const s of allScores) {
    const m = itemMax.get(s.itemId) ?? 0;
    if (m <= 0) continue;
    const sc = Number(s.score ?? 0);
    sum += sc;
    max += m;

    const subj = itemSubject.get(s.itemId) ?? "Subject";
    const a = subjAgg.get(subj) ?? { sum: 0, max: 0 };
    a.sum += sc;
    a.max += m;
    subjAgg.set(subj, a);
  }

  const overallPercent = max > 0 ? Number(((sum / max) * 100).toFixed(1)) : null;

  const subjScores = [...subjAgg.entries()]
    .map(([subject, a]) => ({
      subject,
      pct: a.max > 0 ? Number(((a.sum / a.max) * 100).toFixed(1)) : null,
    }))
    .filter((x) => x.pct != null)
    .sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1));

  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const opportunities: string[] = [];
  const threats: string[] = [];

  const best = subjScores[0];
  const worst = subjScores[subjScores.length - 1];

  if (best?.pct != null && best.pct >= 70) strengths.push(`Strong in ${best.subject} (~${best.pct}%).`);
  if (worst?.pct != null && worst.pct < 50) weaknesses.push(`Struggling in ${worst.subject} (~${worst.pct}%).`);

  const near = subjScores.find((x) => (x.pct ?? 0) >= 50 && (x.pct ?? 0) < 60);
  if (near?.pct != null) opportunities.push(`Quick win: ${near.subject} is close to average (~${near.pct}%). Short daily practice can lift it.`);

  if (missingAssessmentsCount > 0) threats.push(`Missing ${missingAssessmentsCount} assessment(s) in this scope; may indicate absenteeism or incomplete scoring.`);

  // Attendance (last N days)
  const win = defaultWindowDays(attendanceDays);
  const startISO = isoDateOnly(win.start);
  const endISO = isoDateOnly(win.end);

  const marks = await prisma.attendanceMark.findMany({
    where: {
      studentId: student.id,
      session: {
        tenantId: args.tenantId,
        classroomId: args.classroomId,
        date: {
          gte: new Date(`${startISO}T00:00:00.000Z`),
          lte: new Date(`${endISO}T23:59:59.999Z`),
        },
      },
    },
    select: { status: true },
    take: 50000,
  });

  let present = 0, absent = 0, late = 0, excused = 0;
  for (const m of marks) {
    const st = String(m.status || "").toUpperCase();
    if (st === "PRESENT") present++;
    else if (st === "ABSENT") absent++;
    else if (st === "LATE") late++;
    else if (st === "EXCUSED") excused++;
  }
  const denom = present + absent + late + excused;
  const attended = present + late + excused;
  const attendancePercent = denom > 0 ? Number(((attended / denom) * 100).toFixed(1)) : null;

  if (attendancePercent != null && attendancePercent < 80) {
    threats.push(`Attendance is low in the last ${attendanceDays} days (~${attendancePercent}%).`);
  }
  if (absent >= 3) threats.push(`Frequent absences detected (${absent} times).`);

  // Health
  const settings = await prisma.tenantSettings.findUnique({
    where: { tenantId: args.tenantId },
    select: { feverThreshold: true },
  });
  const feverThreshold = settings?.feverThreshold != null ? Number(settings.feverThreshold) : 37.5;

  const healthRows = await prisma.studentHealthDaily.findMany({
    where: {
      tenantId: args.tenantId,
      studentId: student.id,
      date: {
        gte: new Date(`${startISO}T00:00:00.000Z`),
        lte: new Date(`${endISO}T23:59:59.999Z`),
      },
    },
    select: { temperatureC: true },
    take: 50000,
  });

  let healthRecords = 0, feverFlags = 0;
  for (const h of healthRows) {
    healthRecords++;
    const t = h.temperatureC != null ? Number(h.temperatureC) : null;
    if (t != null && Number.isFinite(t) && t >= feverThreshold) feverFlags++;
  }

  if (feverFlags >= 2) threats.push(`Repeated fever flags detected (${feverFlags}).`);

  // Ensure at least one clean statement in each bucket if data exists
  if (!strengths.length && overallPercent != null && overallPercent >= 55) strengths.push("Shows steady progress; can be turned into strong performance with consistency.");
  if (!weaknesses.length && overallPercent != null && overallPercent < 55) weaknesses.push("Needs structured support in core skills; start with one subject and build momentum.");

  return {
    studentId: student.id,
    studentName: name,
    classroomId: args.classroomId,
    term: args.term,
    academicYear: args.academicYear,
    overallPercent,

    strengths,
    weaknesses,
    opportunities,
    threats,

    metrics: {
      expectedAssessmentsCount,
      scoredAssessmentsCount,
      missingAssessmentsCount,

      attendancePercent,
      absentCount: absent,
      lateCount: late,

      healthRecords,
      feverFlags,
    },
  };
}