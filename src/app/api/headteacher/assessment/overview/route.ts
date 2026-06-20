//src/app/api/headteacher/assessment/overview/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import type { AssessmentItemStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import { getTenantAssessmentPolicyLite } from "@/lib/assessments/policy";
import { buildSubjectBroadsheet } from "@/lib/assessments/broadsheet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ReadinessStatus = "READY" | "BLOCKED";

type ClassroomLite = {
  id: string;
  name: string;
  grade: string | null;
  arm: string | null;
};

type StudentLite = {
  id: string;
  classroomId: string | null;
  firstName: string | null;
  lastName: string | null;
  sex: string | null;
  gender: string | null;
};

type AssessmentItemLite = {
  id: string;
  classroomId: string;
  subject: string;
  title: string;
  type: string;
  maxScore: number;
  weighting: number | null;
  status: AssessmentItemStatus | string;
  componentCode: string | null;
  policyComponentId: string | null;
  sortOrder: number | null;
  isRequired: boolean;
};

type AssessmentScoreLite = {
  itemId: string;
  studentId: string;
  score: number;
  comment: string | null;
};

type SubjectReadiness = {
  subject: string;
  readinessStatus: ReadinessStatus;
  readinessScore: number;
  learnerCount: number;
  componentCount: number;
  requiredComponentCount: number;
  totalRequiredCells: number;
  missingRequiredCells: number;
  missingOptionalCells: number;
  completedLearnersCount: number;
  incompleteLearnersCount: number;
  averagePercent: number | null;
  itemsCount: number;
  draftItemsCount: number;
  publishedItemsCount: number;
  lockedItemsCount: number;
  blockedReasons: string[];
};

type HeadteacherOverviewClass = {
  classroomId: string;
  classroomName: string;
  grade: string | null;
  arm: string | null;
  releaseApplicable: boolean;
  setupOnly: boolean;
  setupReason: string | null;

  learnersCount: number;
  itemsCount: number;
  averagePercent: number | null;
  draftItemsCount: number;
  publishedItemsCount: number;
  lockedItemsCount: number;

  readinessStatus: ReadinessStatus;
  readinessScore: number;
  subjectsCount: number;
  readySubjectsCount: number;
  blockedSubjectsCount: number;
  totalRequiredCells: number;
  missingRequiredCells: number;
  missingOptionalCells: number;
  completedLearnerSubjectRows: number;
  incompleteLearnerSubjectRows: number;
  blockedReasons: string[];
  subjectReadiness: SubjectReadiness[];
};

type HeadteacherOverviewResponse = {
  ok: boolean;
  context: {
    tenantId: string;
    term: string;
    academicYear: string;
  };
  readiness: {
    status: ReadinessStatus;
    score: number;
    classesCount: number;
    releaseApplicableClassesCount: number;
    setupOnlyClassesCount: number;
    readyClassesCount: number;
    blockedClassesCount: number;
    learnersCount: number;
    subjectsCount: number;
    totalRequiredCells: number;
    missingRequiredCells: number;
    blockedReasons: string[];
  };
  classes: HeadteacherOverviewClass[];
  setupOnlyClasses: HeadteacherOverviewClass[];
};

const querySchema = z.object({
  term: z.string().optional(),
  academicYear: z.string().optional(),
});

type PolicyLite = Awaited<ReturnType<typeof getTenantAssessmentPolicyLite>>;

type CurriculumSubjectLite = {
  name: string;
  level: string | null;
  phase: string | null;
  orderIndex: number | null;
};

function jsonNoStore(payload: unknown, status = 200) {
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

function normalizeKey(v: unknown) {
  return cleanStr(v).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function normalizeSubjectLabel(v: unknown) {
  return cleanStr(v).replace(/\s+/g, " ");
}

function dedupeSubjects(list: unknown[]) {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const raw of list) {
    const label = normalizeSubjectLabel(raw);
    if (!label) continue;

    const key = normalizeKey(label);
    if (!key || seen.has(key)) continue;

    seen.add(key);
    out.push(label);
  }

  return out.sort((a, b) => a.localeCompare(b));
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function average(values: number[]) {
  const safe = values.filter((v) => Number.isFinite(v));
  if (!safe.length) return null;
  return round2(safe.reduce((sum, v) => sum + v, 0) / safe.length);
}

function normalizeItemStatus(raw: unknown): "DRAFT" | "PUBLISHED" | "LOCKED" {
  const s = cleanStr(raw).toUpperCase();
  if (s === "LOCKED") return "LOCKED";
  if (s === "PUBLISHED") return "PUBLISHED";
  return "DRAFT";
}

function normalizeLevelToken(raw: unknown): string | null {
  const s = cleanStr(raw).toUpperCase().replace(/\s+/g, " ");
  if (!s) return null;

  let m =
    s.match(/^KG\s*([12])$/) ||
    s.match(/^KG([12])$/) ||
    s.match(/^K\.?G\.?\s*([12])$/);
  if (m) return `KG${m[1]}`;

  m =
    s.match(/^JHS\s*([1-3])$/) ||
    s.match(/^JHS([1-3])$/) ||
    s.match(/^J\.?H\.?S\.?\s*([1-3])$/);
  if (m) return `JHS${m[1]}`;

  m =
    s.match(/^BASIC\s*([7-9])$/) ||
    s.match(/^BASIC([7-9])$/) ||
    s.match(/^B\s*([7-9])$/) ||
    s.match(/^B([7-9])$/) ||
    s.match(/^BS\s*([7-9])$/) ||
    s.match(/^BS([7-9])$/);
  if (m) {
    const n = Number(m[1]);
    return `JHS${n - 6}`;
  }

  m =
    s.match(/^BASIC\s*([1-6])$/) ||
    s.match(/^BASIC([1-6])$/) ||
    s.match(/^B\s*([1-6])$/) ||
    s.match(/^B([1-6])$/) ||
    s.match(/^PRIMARY\s*([1-6])$/) ||
    s.match(/^PRIMARY([1-6])$/) ||
    s.match(/^P\s*([1-6])$/) ||
    s.match(/^P([1-6])$/);
  if (m) return `B${m[1]}`;

  return null;
}

function levelCandidatesFromToken(token: string | null) {
  if (!token) return [];

  if (/^KG[12]$/.test(token)) {
    const n = token.slice(2);
    return [`KG ${n}`, `KG${n}`];
  }

  if (/^B[1-6]$/.test(token)) {
    const n = token.slice(1);
    return [`Basic ${n}`, `B${n}`, `Primary ${n}`, `P${n}`];
  }

  if (/^JHS[1-3]$/.test(token)) {
    const n = Number(token.slice(3));
    return [`JHS ${n}`, `JHS${n}`, `Basic ${n + 6}`, `B${n + 6}`, `BS${n + 6}`];
  }

  return [];
}

function phaseFromLevelToken(token: string | null) {
  if (!token) return null;
  if (/^KG[12]$/.test(token)) return "KG";
  if (/^B[1-6]$/.test(token)) return "PRIMARY";
  if (/^JHS[1-3]$/.test(token)) return "JHS";
  return null;
}

function curriculumSubjectsForClassroomFromRows(
  classroom: ClassroomLite,
  allSubjects: CurriculumSubjectLite[]
) {
  const token = normalizeLevelToken(classroom.grade) ?? normalizeLevelToken(classroom.name);
  const candidates = levelCandidatesFromToken(token);
  const candidateKeys = new Set(candidates.map(normalizeKey));

  if (candidateKeys.size > 0) {
    const byLevel = allSubjects
      .filter((row) => candidateKeys.has(normalizeKey(row.level)))
      .sort((a, b) => {
        const orderA = Number(a.orderIndex ?? 9999);
        const orderB = Number(b.orderIndex ?? 9999);
        if (orderA !== orderB) return orderA - orderB;
        return cleanStr(a.name).localeCompare(cleanStr(b.name));
      });

    const names = byLevel.map((r) => r.name);
    if (names.length) return dedupeSubjects(names);
  }

  const phase = phaseFromLevelToken(token);
  if (!phase) return [];

  const phaseKeys = new Set([
    normalizeKey(phase),
    normalizeKey(phase === "JHS" ? "Junior High School" : phase),
  ]);

  const byPhase = allSubjects
    .filter((row) => phaseKeys.has(normalizeKey(row.phase)))
    .sort((a, b) => {
      const orderA = Number(a.orderIndex ?? 9999);
      const orderB = Number(b.orderIndex ?? 9999);
      if (orderA !== orderB) return orderA - orderB;
      return cleanStr(a.name).localeCompare(cleanStr(b.name));
    });

  return dedupeSubjects(byPhase.map((r) => r.name));
}

function policyCacheKeyForClassroom(classroom: ClassroomLite) {
  const token = normalizeLevelToken(classroom.grade) ?? normalizeLevelToken(classroom.name);
  const phase = phaseFromLevelToken(token);

  if (phase) return `PHASE:${phase}`;

  return `CLASSROOM:${classroom.id}`;
}

function itemCounts(items: AssessmentItemLite[]) {
  let draftItemsCount = 0;
  let publishedItemsCount = 0;
  let lockedItemsCount = 0;

  for (const item of items) {
    const status = normalizeItemStatus(item.status);

    if (status === "LOCKED") lockedItemsCount += 1;
    else if (status === "PUBLISHED") publishedItemsCount += 1;
    else draftItemsCount += 1;
  }

  return {
    itemsCount: items.length,
    draftItemsCount,
    publishedItemsCount,
    lockedItemsCount,
  };
}

function classLabel(cls: ClassroomLite) {
  const grade = cleanStr(cls.grade);
  const arm = cleanStr(cls.arm);
  if (!grade && !arm) return cls.name;
  return `${cls.name}${grade ? ` (${grade}${arm ? ` ${arm}` : ""})` : ""}`;
}

function buildSetupOnlyClassroom(classroom: ClassroomLite): HeadteacherOverviewClass {
  return {
    classroomId: classroom.id,
    classroomName: classroom.name,
    grade: classroom.grade ?? null,
    arm: classroom.arm ?? null,

    releaseApplicable: false,
    setupOnly: true,
    setupReason: "No active learners or assessment activity for this class.",

    learnersCount: 0,
    itemsCount: 0,
    draftItemsCount: 0,
    publishedItemsCount: 0,
    lockedItemsCount: 0,
    averagePercent: null,

    readinessStatus: "READY",
    readinessScore: 0,
    subjectsCount: 0,
    readySubjectsCount: 0,
    blockedSubjectsCount: 0,
    totalRequiredCells: 0,
    missingRequiredCells: 0,
    missingOptionalCells: 0,
    completedLearnerSubjectRows: 0,
    incompleteLearnerSubjectRows: 0,
    blockedReasons: [],
    subjectReadiness: [],
  };
}

function buildClassReadiness(args: {
  classroom: ClassroomLite;
  term: string;
  academicYear: string;
  students: StudentLite[];
  items: AssessmentItemLite[];
  scores: AssessmentScoreLite[];
  curriculumSubjects: string[];
  policy: PolicyLite;
}) {
  const { classroom, students, items, scores, curriculumSubjects, policy } = args;

  const learnersCount = students.length;
  const itemCountSummary = itemCounts(items);

  const itemSubjects = dedupeSubjects(items.map((item) => item.subject));
  const subjects = dedupeSubjects([...curriculumSubjects, ...itemSubjects]);

  const blockedReasons: string[] = [];

  if (learnersCount === 0) {
    blockedReasons.push(`${classLabel(classroom)} has no active learners.`);
  }

  if (subjects.length === 0) {
    blockedReasons.push(
      `${classLabel(classroom)} has no curriculum subjects or assessment subjects for this scope.`
    );
  }

  const subjectReadiness: SubjectReadiness[] = [];

  for (const subject of subjects) {
    const subjectItems = items.filter(
      (item) => normalizeKey(item.subject) === normalizeKey(subject)
    );

    const subjectItemIds = new Set(subjectItems.map((item) => item.id));
    const subjectScores = scores.filter((score) => subjectItemIds.has(score.itemId));

    const sheet = buildSubjectBroadsheet({
      policy,
      subject,
      students: students.map((s) => ({
        id: s.id,
        firstName: s.firstName,
        lastName: s.lastName,
        sex: s.sex,
        gender: s.gender,
      })),
      items: subjectItems.map((item) => ({
        id: item.id,
        subject: item.subject,
        title: item.title,
        type: item.type,
        maxScore: item.maxScore,
        weighting: item.weighting,
        status: item.status,
        componentCode: item.componentCode,
        policyComponentId: item.policyComponentId,
        sortOrder: item.sortOrder,
        isRequired: item.isRequired,
      })),
      scores: subjectScores,
    });

    const completeRows = sheet.rows.filter((row) => row.complete);
    const incompleteRows = sheet.rows.filter((row) => !row.complete);
    const subjectAverage = average(
      completeRows
        .map((row) => row.totalPercent)
        .filter((v): v is number => typeof v === "number")
    );

    const subjectCounts = itemCounts(subjectItems);

    subjectReadiness.push({
      subject,
      readinessStatus: sheet.readiness.status,
      readinessScore: sheet.readiness.score,
      learnerCount: sheet.readiness.learnerCount,
      componentCount: sheet.readiness.componentCount,
      requiredComponentCount: sheet.readiness.requiredComponentCount,
      totalRequiredCells: sheet.readiness.totalRequiredCells,
      missingRequiredCells: sheet.readiness.missingRequiredCells,
      missingOptionalCells: sheet.readiness.missingOptionalCells,
      completedLearnersCount: completeRows.length,
      incompleteLearnersCount: incompleteRows.length,
      averagePercent: subjectAverage,
      itemsCount: subjectCounts.itemsCount,
      draftItemsCount: subjectCounts.draftItemsCount,
      publishedItemsCount: subjectCounts.publishedItemsCount,
      lockedItemsCount: subjectCounts.lockedItemsCount,
      blockedReasons: sheet.readiness.blockedReasons,
    });
  }

  const readySubjectsCount = subjectReadiness.filter(
    (s) => s.readinessStatus === "READY"
  ).length;

  const blockedSubjectsCount = subjectReadiness.filter(
    (s) => s.readinessStatus === "BLOCKED"
  ).length;

  const totalRequiredCells = subjectReadiness.reduce(
    (sum, s) => sum + s.totalRequiredCells,
    0
  );

  const missingRequiredCells = subjectReadiness.reduce(
    (sum, s) => sum + s.missingRequiredCells,
    0
  );

  const missingOptionalCells = subjectReadiness.reduce(
    (sum, s) => sum + s.missingOptionalCells,
    0
  );

  const completedLearnerSubjectRows = subjectReadiness.reduce(
    (sum, s) => sum + s.completedLearnersCount,
    0
  );

  const incompleteLearnerSubjectRows = subjectReadiness.reduce(
    (sum, s) => sum + s.incompleteLearnersCount,
    0
  );

  const subjectBlockedReasons = subjectReadiness.flatMap((s) =>
    s.blockedReasons.map((reason) => `${s.subject}: ${reason}`)
  );

  const allBlockedReasons = [...blockedReasons, ...subjectBlockedReasons];

  const classReadinessStatus: ReadinessStatus =
    allBlockedReasons.length > 0 || blockedSubjectsCount > 0 ? "BLOCKED" : "READY";

  const readinessScore =
    subjectReadiness.length > 0
      ? Math.round(
          subjectReadiness.reduce((sum, s) => sum + s.readinessScore, 0) /
            subjectReadiness.length
        )
      : 0;

  const averagePercent = average(
    subjectReadiness
      .map((s) => s.averagePercent)
      .filter((v): v is number => typeof v === "number")
  );

  return {
    classroomId: classroom.id,
    classroomName: classroom.name,
    grade: classroom.grade ?? null,
    arm: classroom.arm ?? null,
    
    releaseApplicable: true,
    setupOnly: false,
    setupReason: null,

    learnersCount,
    ...itemCountSummary,
    averagePercent,

    readinessStatus: classReadinessStatus,
    readinessScore,
    subjectsCount: subjectReadiness.length,
    readySubjectsCount,
    blockedSubjectsCount,
    totalRequiredCells,
    missingRequiredCells,
    missingOptionalCells,
    completedLearnerSubjectRows,
    incompleteLearnerSubjectRows,
    blockedReasons: allBlockedReasons.slice(0, 20),
    subjectReadiness,
  } satisfies HeadteacherOverviewClass;
}

export async function GET(req: Request) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["HEADTEACHER", "SCHOOL_ADMIN", "ADMIN", "SUPERADMIN"],
  });

  if (!auth.ok) return auth.res;

  const { ctx } = auth;

  const { searchParams } = new URL(req.url);
  const parsed = querySchema.safeParse({
    term: searchParams.get("term") ?? undefined,
    academicYear: searchParams.get("academicYear") ?? undefined,
  });

  if (!parsed.success) {
    return jsonNoStore(
      { ok: false, error: "Invalid filters", details: parsed.error.flatten() },
      400
    );
  }

  const settings = await prisma.tenantSettings.findUnique({
    where: { tenantId: ctx.tenantId },
    select: { currentTerm: true, currentAcademicYear: true },
  });

  const term = parsed.data.term ?? settings?.currentTerm ?? "1st Term";
  const academicYear =
    parsed.data.academicYear ?? settings?.currentAcademicYear ?? "2025/2026";

  try {
    const classrooms = await prisma.classroom.findMany({
      where: {
        tenantId: ctx.tenantId,
        status: "ACTIVE",
      },
      orderBy: [{ grade: "asc" }, { name: "asc" }, { arm: "asc" }],
      select: {
        id: true,
        name: true,
        grade: true,
        arm: true,
      },
    });

    if (classrooms.length === 0) {
      const empty: HeadteacherOverviewResponse = {
        ok: true,
        context: { tenantId: ctx.tenantId, term, academicYear },
        readiness: {
          status: "BLOCKED",
          score: 0,
          classesCount: 0,
          releaseApplicableClassesCount: 0,
          setupOnlyClassesCount: 0,
          readyClassesCount: 0,
          blockedClassesCount: 0,
          learnersCount: 0,
          subjectsCount: 0,
          totalRequiredCells: 0,
          missingRequiredCells: 0,
          blockedReasons: ["No active classrooms found."],
        },
        classes: [],
        setupOnlyClasses: [],
      };

      return jsonNoStore(empty);
    }

    const classroomIds = classrooms.map((c) => c.id);

    const [students, items] = await Promise.all([
      prisma.student.findMany({
        where: {
          tenantId: ctx.tenantId,
          status: "ACTIVE",
          classroomId: { in: classroomIds },
        },
        select: {
          id: true,
          classroomId: true,
          firstName: true,
          lastName: true,
          sex: true,
          gender: true,
        },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }, { id: "asc" }],
      }),

      prisma.assessmentItem.findMany({
        where: {
          tenantId: ctx.tenantId,
          term,
          academicYear,
          classroomId: { in: classroomIds },
        },
        select: {
          id: true,
          classroomId: true,
          subject: true,
          title: true,
          type: true,
          maxScore: true,
          weighting: true,
          status: true,
          componentCode: true,
          policyComponentId: true,
          sortOrder: true,
          isRequired: true,
        },
        orderBy: [
          { classroomId: "asc" },
          { subject: "asc" },
          { sortOrder: "asc" },
          { title: "asc" },
          { createdAt: "asc" },
        ],
      }),
    ]);

    const itemIds = items.map((item) => item.id);

    const scores =
      itemIds.length > 0
        ? await prisma.assessmentScore.findMany({
            where: {
              itemId: { in: itemIds },
              studentId: { in: students.map((s) => s.id) },
            },
            select: {
              itemId: true,
              studentId: true,
              score: true,
              comment: true,
            },
          })
        : [];

    const studentsByClass = new Map<string, StudentLite[]>();
    for (const student of students) {
      if (!student.classroomId) continue;
      const list = studentsByClass.get(student.classroomId) ?? [];
      list.push(student);
      studentsByClass.set(student.classroomId, list);
    }

    const itemsByClass = new Map<string, AssessmentItemLite[]>();
    for (const item of items) {
      const list = itemsByClass.get(item.classroomId) ?? [];
      list.push(item);
      itemsByClass.set(item.classroomId, list);
    }

    const scoresByClass = new Map<string, AssessmentScoreLite[]>();
    const itemClassMap = new Map(items.map((item) => [item.id, item.classroomId]));

    for (const score of scores) {
      const classroomId = itemClassMap.get(score.itemId);
      if (!classroomId) continue;

      const list = scoresByClass.get(classroomId) ?? [];
      list.push({
        itemId: score.itemId,
        studentId: score.studentId,
        score: Number(score.score ?? 0),
        comment: score.comment ?? null,
      });
      scoresByClass.set(classroomId, list);
    }

    const operationalClassrooms = classrooms.filter((classroom) => {
      const learners = studentsByClass.get(classroom.id)?.length ?? 0;
      const classItems = itemsByClass.get(classroom.id)?.length ?? 0;
      return learners > 0 || classItems > 0;
    });

    const setupOnlyClassrooms = classrooms.filter((classroom) => {
      const learners = studentsByClass.get(classroom.id)?.length ?? 0;
      const classItems = itemsByClass.get(classroom.id)?.length ?? 0;
      return learners === 0 && classItems === 0;
    });

    const setupOnlyClasses = setupOnlyClassrooms.map(buildSetupOnlyClassroom);

    const curriculumRows =
      operationalClassrooms.length > 0
        ? await prisma.curriculumSubject.findMany({
            where: { isActive: true },
            select: {
              name: true,
              level: true,
              phase: true,
              orderIndex: true,
            },
            orderBy: [{ orderIndex: "asc" }, { name: "asc" }],
          })
        : [];

    const curriculumSubjectsByClass = new Map(
      operationalClassrooms.map((classroom) => [
        classroom.id,
        curriculumSubjectsForClassroomFromRows(classroom, curriculumRows),
      ])
    );

    const policyCache = new Map<string, PolicyLite>();
    const policyByClass = new Map<string, PolicyLite>();

    for (const classroom of operationalClassrooms) {
      const cacheKey = policyCacheKeyForClassroom(classroom);

      let policy = policyCache.get(cacheKey);
      if (!policy) {
        policy = await getTenantAssessmentPolicyLite(ctx.tenantId, { classroom });
        policyCache.set(cacheKey, policy);
      }

      policyByClass.set(classroom.id, policy);
    }

    const classes = operationalClassrooms.map((classroom) => {
      const policy = policyByClass.get(classroom.id);

      if (!policy) {
        throw new Error(`POLICY_NOT_RESOLVED:${classroom.id}`);
      }

      return buildClassReadiness({
        classroom,
        term,
        academicYear,
        students: studentsByClass.get(classroom.id) ?? [],
        items: itemsByClass.get(classroom.id) ?? [],
        scores: scoresByClass.get(classroom.id) ?? [],
        curriculumSubjects: curriculumSubjectsByClass.get(classroom.id) ?? [],
        policy,
      });
    });

    const readyClassesCount = classes.filter(
      (c) => c.readinessStatus === "READY"
    ).length;

    const blockedClassesCount = classes.filter(
      (c) => c.readinessStatus === "BLOCKED"
    ).length;

    const schoolScore =
      classes.length > 0
        ? Math.round(
            classes.reduce((sum, c) => sum + c.readinessScore, 0) / classes.length
          )
        : 0;

    const response: HeadteacherOverviewResponse = {
      ok: true,
      context: { tenantId: ctx.tenantId, term, academicYear },
      readiness: {
        status:
          classes.length === 0 || blockedClassesCount > 0 ? "BLOCKED" : "READY",
        score: schoolScore,
        classesCount: classes.length,
        releaseApplicableClassesCount: classes.length,
        setupOnlyClassesCount: setupOnlyClasses.length,
        readyClassesCount,
        blockedClassesCount,
        learnersCount: classes.reduce((sum, c) => sum + c.learnersCount, 0),
        subjectsCount: classes.reduce((sum, c) => sum + c.subjectsCount, 0),
        totalRequiredCells: classes.reduce((sum, c) => sum + c.totalRequiredCells, 0),
        missingRequiredCells: classes.reduce((sum, c) => sum + c.missingRequiredCells, 0),
        blockedReasons:
          classes.length === 0
            ? ["No release-applicable classes found. Add active learners or assessment activity before releasing reports."]
            : classes
                .filter((c) => c.readinessStatus === "BLOCKED")
                .flatMap((c) =>
                  c.blockedReasons
                    .slice(0, 3)
                    .map((reason) => `${c.classroomName}: ${reason}`)
                )
                .slice(0, 30),
      },
      classes,
      setupOnlyClasses,
    };

    return jsonNoStore(response);
  } catch (err) {
    console.error("[HEADTEACHER_ASSESSMENT_OVERVIEW_GET]", err);
    return jsonNoStore({ ok: false, error: "Unexpected server error." }, 500);
  }
}