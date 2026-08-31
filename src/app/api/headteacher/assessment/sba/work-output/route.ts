// src/app/api/headteacher/assessment/sba/work-output/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getHeadteacherApiContext } from "@/lib/headteacherAuth";
import {
  normalizeSchoolLevel,
  parseTeacherJhsAssignments,
  subjectEquals,
} from "@/lib/teacherAccess";
import { getTenantAssessmentPolicyLite } from "@/lib/assessments/policy";
import { buildSubjectBroadsheet } from "@/lib/assessments/broadsheet";
import { subjectMatchesTeachingScope } from "@/lib/teachingSubjectScope";
import {
  buildWorkOutputSnapshot,
  type WorkOutputDeliveryInput,
  type WorkOutputItemInput,
} from "@/lib/assessments/workOutput";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ClassroomLite = {
  id: string;
  name: string;
  grade: string | null;
  arm: string | null;
};

type AssignmentLite = {
  teacherUserId: string;
  assignmentKind: string;
  classroomId: string | null;
  phase: string | null;
  level: string | null;
  subject: string | null;
};

type TeacherProfileLite = {
  userId: string;
  phase: string | null;
  classLevel: string | null;
  jhsAssignments: unknown;
  primaryClassroomId: string | null;
};

type ScopeClass = {
  classroomId: string;
  classLabel: string;
  grade: string | null;
  arm: string | null;
  stageBucket: string | null;
  subjects: string[];
};

type TeacherScope = {
  userId: string;
  name: string;
  email: string;
  classes: ScopeClass[];
};

function jsonNoStore(status: number, payload: unknown) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function clean(v: unknown) {
  return String(v ?? "").trim();
}

function uniq(xs: string[]) {
  return Array.from(new Set(xs.map(clean).filter(Boolean)));
}

function classLabel(c: ClassroomLite | null | undefined) {
  const name = clean(c?.name);
  const grade = clean(c?.grade);
  const arm = clean(c?.arm);

  if (name && grade) {
    const same = name.toUpperCase() === grade.toUpperCase();
    if (same) return `${name}${arm ? ` ${arm}` : ""}`;
    return `${name} (${grade}${arm ? ` ${arm}` : ""})`;
  }
  if (name) return `${name}${arm ? ` ${arm}` : ""}`;
  if (grade) return `${grade}${arm ? ` ${arm}` : ""}`;
  return "Class";
}

function levelCandidates(raw: ClassroomLite) {
  return uniq([
    normalizeSchoolLevel(raw.grade),
    normalizeSchoolLevel(raw.name),
    normalizeSchoolLevel(clean(raw.grade).replace(/\s+/g, "")),
    normalizeSchoolLevel(clean(raw.name).replace(/\s+/g, "")),
  ]);
}

function classStageBucket(classroom: ClassroomLite) {
  return levelCandidates(classroom)[0] ?? null;
}

function phaseFromLevel(level: string | null) {
  const s = clean(level).toUpperCase();
  if (/^KG[12]$/.test(s) || /^KG\s*[12]$/.test(s)) return "KG";
  if (/^BASIC\s*[1-6]$/.test(s) || /^BASIC[1-6]$/.test(s)) return "PRIMARY";
  if (/^JHS\s*[1-3]$/.test(s) || /^JHS[1-3]$/.test(s)) return "JHS";
  return "";
}

function assignmentMatchesClass(assignment: AssignmentLite, classroom: ClassroomLite) {
  if (assignment.classroomId) return assignment.classroomId === classroom.id;

  const candidates = levelCandidates(classroom);
  const classPhase = phaseFromLevel(candidates[0] ?? null);

  if (assignment.level) {
    const normalizedAssignmentLevel = normalizeSchoolLevel(assignment.level);
    if (candidates.includes(normalizedAssignmentLevel)) return true;
  }

  if (assignment.phase && classPhase) {
    return clean(assignment.phase).toUpperCase() === classPhase;
  }

  return false;
}

function profileMatchesClass(profile: TeacherProfileLite | null, classroom: ClassroomLite) {
  if (!profile) return { allSubjects: false, subjects: [] as string[] };

  const phase = clean(profile.phase).toUpperCase();
  const candidates = levelCandidates(classroom);

  if (phase === "JHS") {
    const assignments = parseTeacherJhsAssignments(profile.jhsAssignments);
    const subjects = assignments
      .filter((a) => a.classes.some((c) => candidates.includes(normalizeSchoolLevel(c))))
      .map((a) => a.subject);
    return { allSubjects: false, subjects: uniq(subjects) };
  }

  const teacherLevel = normalizeSchoolLevel(profile.classLevel);
  if (teacherLevel && candidates.includes(teacherLevel)) {
    return { allSubjects: true, subjects: [] as string[] };
  }

  if (profile.primaryClassroomId && profile.primaryClassroomId === classroom.id) {
    return { allSubjects: true, subjects: [] as string[] };
  }

  return { allSubjects: false, subjects: [] as string[] };
}

type CurriculumSubjectLite = {
  phase: string | null;
  level: string | null;
  name: string;
  orderIndex: number;
};

function curriculumPhaseForLevel(level: string | null) {
  const s = clean(level).toUpperCase();

  if (/^KG[12]$/.test(s) || /^KG\s*[12]$/.test(s)) return "KG";
  if (/^BASIC\s*[1-6]$/.test(s) || /^BASIC[1-6]$/.test(s)) return "PRIMARY";
  if (/^JHS\s*[1-3]$/.test(s) || /^JHS[1-3]$/.test(s)) return "JHS";

  return "";
}

function curriculumLevelAliases(level: string | null) {
  const s = clean(level);
  const upper = s.toUpperCase();

  if (!s) return [];

  let m = upper.match(/^KG\s*([12])$/) || upper.match(/^KG([12])$/);
  if (m) {
    const n = m[1];
    return [`KG ${n}`, `KG${n}`];
  }

  m =
    upper.match(/^BASIC\s*([1-6])$/) ||
    upper.match(/^BASIC([1-6])$/) ||
    upper.match(/^B\s*([1-6])$/) ||
    upper.match(/^B([1-6])$/) ||
    upper.match(/^P\s*([1-6])$/) ||
    upper.match(/^P([1-6])$/) ||
    upper.match(/^PRIMARY\s*([1-6])$/) ||
    upper.match(/^PRIMARY([1-6])$/);

  if (m) {
    const n = m[1];
    return [`Basic ${n}`, `B${n}`, `Primary ${n}`, `P${n}`];
  }

  m =
    upper.match(/^JHS\s*([1-3])$/) ||
    upper.match(/^JHS([1-3])$/) ||
    upper.match(/^BASIC\s*([7-9])$/) ||
    upper.match(/^BASIC([7-9])$/) ||
    upper.match(/^B\s*([7-9])$/) ||
    upper.match(/^B([7-9])$/);

  if (m) {
    const raw = Number(m[1]);
    const jhs = raw >= 7 ? raw - 6 : raw;
    return [`JHS ${jhs}`, `JHS${jhs}`, `Basic ${jhs + 6}`, `B${jhs + 6}`];
  }

  return [s];
}

function fallbackSubjectsForLevel(level: string | null) {
  const phase = curriculumPhaseForLevel(level);

  if (phase === "KG") {
    return [
      "Language and Literacy",
      "Numeracy",
      "Our World Our People",
      "Creative Arts",
      "Physical Development",
    ];
  }

  if (phase === "PRIMARY") {
    return [
      "English Language",
      "Mathematics",
      "Science",
      "Creative Arts",
      "Our World Our People",
      "Religious and Moral Education",
      "Computing",
      "Ghanaian Language",
      "Physical Education",
    ];
  }

  return [];
}

function curriculumSubjectsForClass(
  classroom: ClassroomLite,
  curriculumSubjects: CurriculumSubjectLite[]
) {
  const level = classStageBucket(classroom);
  const aliases = curriculumLevelAliases(level).map((x) => clean(x).toUpperCase());
  const phase = curriculumPhaseForLevel(level);

  const byLevel = curriculumSubjects
    .filter((row) => aliases.includes(clean(row.level).toUpperCase()))
    .sort((a, b) => (a.orderIndex - b.orderIndex) || clean(a.name).localeCompare(clean(b.name)))
    .map((row) => row.name);

  if (byLevel.length) return uniq(byLevel);

  const byPhase = curriculumSubjects
    .filter((row) => clean(row.phase).toUpperCase() === phase)
    .sort((a, b) => (a.orderIndex - b.orderIndex) || clean(a.name).localeCompare(clean(b.name)))
    .map((row) => row.name);

  if (byPhase.length) return uniq(byPhase);

  return fallbackSubjectsForLevel(level);
}

function buildSubjectHints(args: {
  itemRows: Array<{ classroomId: string; subject: string; createdByUserId: string | null }>;
  deliveryRows: Array<{ classroomId: string; subject: string; teacherUserId: string }>;
}) {
  const byTeacherClass = new Map<string, Set<string>>();
  const byClass = new Map<string, Set<string>>();

  function add(classroomId: string, subject: string, teacherUserId?: string | null) {
    const sub = clean(subject);
    if (!classroomId || !sub) return;

    const classSet = byClass.get(classroomId) ?? new Set<string>();
    classSet.add(sub);
    byClass.set(classroomId, classSet);

    if (teacherUserId) {
      const k = `${teacherUserId}::${classroomId}`;
      const teacherSet = byTeacherClass.get(k) ?? new Set<string>();
      teacherSet.add(sub);
      byTeacherClass.set(k, teacherSet);
    }
  }

  for (const row of args.itemRows) add(row.classroomId, row.subject, row.createdByUserId);
  for (const row of args.deliveryRows) add(row.classroomId, row.subject, row.teacherUserId);

  return { byTeacherClass, byClass };
}

function makeTeacherScopes(args: {
  teachers: Array<{ userId: string; name: string; email: string }>;
  classrooms: ClassroomLite[];
  assignments: AssignmentLite[];
  profiles: TeacherProfileLite[];
  hints: ReturnType<typeof buildSubjectHints>;
  curriculumSubjects: CurriculumSubjectLite[];
}): TeacherScope[] {
  const profileByUser = new Map(args.profiles.map((p) => [p.userId, p]));

  return args.teachers
    .map((teacher) => {
      const teacherAssignments = args.assignments.filter((a) => a.teacherUserId === teacher.userId);
      const profile = profileByUser.get(teacher.userId) ?? null;

      const classes: ScopeClass[] = [];

      for (const classroom of args.classrooms) {
        const subjects: string[] = [];
        let allSubjects = false;

        for (const assignment of teacherAssignments) {
          if (!assignmentMatchesClass(assignment, classroom)) continue;
          const kind = clean(assignment.assignmentKind).toUpperCase();
          if (kind === "CLASS_ALL_SUBJECTS") allSubjects = true;
          if (kind === "SUBJECT" && assignment.subject) subjects.push(assignment.subject);
        }

        const legacy = profileMatchesClass(profile, classroom);
        allSubjects = allSubjects || legacy.allSubjects;
        subjects.push(...legacy.subjects);

                if (allSubjects) {
          const teacherHints = args.hints.byTeacherClass.get(`${teacher.userId}::${classroom.id}`);
          const classHints = args.hints.byClass.get(classroom.id);

          const hintedSubjects = Array.from(
            (teacherHints && teacherHints.size ? teacherHints : classHints) ?? []
          );

          if (hintedSubjects.length) {
            subjects.push(...hintedSubjects);
          } else {
            subjects.push(...curriculumSubjectsForClass(classroom, args.curriculumSubjects));
          }
        }

        const uniqueSubjects = uniq(subjects).sort((a, b) => a.localeCompare(b));

        // JHS teachers must remain subject-scoped.
        // KG/Primary all-subject teachers must appear even before assessment evidence exists.
        if (!uniqueSubjects.length) continue;

        classes.push({
          classroomId: classroom.id,
          classLabel: classLabel(classroom),
          grade: classroom.grade,
          arm: classroom.arm,
          stageBucket: classStageBucket(classroom),
          subjects: uniqueSubjects,
        });
      }

      return { ...teacher, classes };
    })
    .filter((teacher) => teacher.classes.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function loadTeacherScopes(tenantId: string, term: string, academicYear: string) {
  const now = new Date();

  const [
    memberships,
    classrooms,
    assignments,
    profiles,
    itemRows,
    deliveryRows,
    curriculumSubjects,
  ] = await Promise.all([
    prisma.membership.findMany({
      where: {
        tenantId,
        status: "ACTIVE",
        role: { name: { equals: "TEACHER", mode: "insensitive" } },
      },
      select: {
        user: { select: { id: true, name: true, email: true, firstName: true, lastName: true } },
      },
      take: 1000,
    }),
    prisma.classroom.findMany({
      where: { tenantId, status: "ACTIVE" },
      select: { id: true, name: true, grade: true, arm: true },
      orderBy: [{ grade: "asc" }, { name: "asc" }, { arm: "asc" }],
      take: 1000,
    }),
    prisma.teacherAssessmentAssignment.findMany({
      where: {
        tenantId,
        status: "ACTIVE",
        revokedAt: null,
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
        ],
      },
      select: {
        teacherUserId: true,
        assignmentKind: true,
        classroomId: true,
        phase: true,
        level: true,
        subject: true,
      },
      take: 20000,
    }),
    prisma.teacherProfile.findMany({
      where: { tenantId },
      select: {
        userId: true,
        phase: true,
        classLevel: true,
        jhsAssignments: true,
        primaryClassroomId: true,
      },
      take: 2000,
    }),
    prisma.assessmentItem.findMany({
      where: {
        tenantId,
        term,
        academicYear,
        type: { not: "MOCK" },
      },
      select: { classroomId: true, subject: true, createdByUserId: true },
      take: 20000,
    }),
       prisma.lessonDelivery.findMany({
      where: { tenantId, term, academicYear },
      select: { classroomId: true, subject: true, teacherUserId: true },
      take: 20000,
    }),
    prisma.curriculumSubject.findMany({
  where: {
    isActive: true,
    OR: [{ tenantId }, { tenantId: null }],
  },
  select: { phase: true, level: true, name: true, orderIndex: true },
  orderBy: [{ orderIndex: "asc" }, { name: "asc" }],
  take: 5000,
}),
  ]);

  const teachers = memberships.map((m) => {
    const u = m.user;
    const fallbackName = `${clean(u.lastName)} ${clean(u.firstName)}`.trim();
    return {
      userId: u.id,
      name: clean(u.name) || fallbackName || clean(u.email) || "Teacher",
      email: clean(u.email),
    };
  });

  const hints = buildSubjectHints({ itemRows, deliveryRows });
  return makeTeacherScopes({
    teachers,
    classrooms,
    assignments: assignments.map((a) => ({
      ...a,
      assignmentKind: String(a.assignmentKind),
      phase: a.phase ? String(a.phase) : null,
    })),
    profiles: profiles.map((p) => ({
      ...p,
      phase: p.phase ? String(p.phase) : null,
    })),
    hints,
    curriculumSubjects,
  });
}

function scopeAllows(args: {
  scopes: TeacherScope[];
  teacherUserId: string;
  classroomId: string;
  subject: string;
}) {
  const teacher = args.scopes.find((t) => t.userId === args.teacherUserId) ?? null;
  const classroom = teacher?.classes.find((c) => c.classroomId === args.classroomId) ?? null;
  const subject =
    classroom?.subjects.find(
      (s) =>
        subjectEquals(s, args.subject) ||
        subjectMatchesTeachingScope(s, args.subject, classroom.stageBucket)
    ) ?? null;
  return { teacher, classroom, subject };
}

export async function GET(req: NextRequest) {
  const ctx = await getHeadteacherApiContext();
  if (!ctx) return jsonNoStore(401, { ok: false, error: "UNAUTHORIZED" });

  const { searchParams } = new URL(req.url);
  const term = clean(searchParams.get("term")) || "1st Term";
  const academicYear = clean(searchParams.get("academicYear")) || "2025/2026";
  const teacherUserId = clean(searchParams.get("teacherUserId"));
  const classroomId = clean(searchParams.get("classroomId"));
  const subject = clean(searchParams.get("subject"));

  try {
    const scopes = await loadTeacherScopes(ctx.tenantId, term, academicYear);

    if (!teacherUserId && !classroomId && !subject) {
      return jsonNoStore(200, {
        ok: true,
        term,
        academicYear,
        teachers: scopes,
      });
    }

    if (!teacherUserId || !classroomId || !subject) {
      return jsonNoStore(400, {
        ok: false,
        error: "teacherUserId, classroomId, and subject are required.",
      });
    }

    const allowed = scopeAllows({ scopes, teacherUserId, classroomId, subject });
    if (!allowed.teacher || !allowed.classroom || !allowed.subject) {
      return jsonNoStore(403, { ok: false, error: "TEACHER_SUBJECT_OUT_OF_SCOPE" });
    }

    const allowedStageBucket = allowed.classroom.stageBucket;

    const classroom = await prisma.classroom.findFirst({
      where: { id: classroomId, tenantId: ctx.tenantId, status: "ACTIVE" },
      select: { id: true, name: true, grade: true, arm: true },
    });

    if (!classroom) return jsonNoStore(404, { ok: false, error: "CLASSROOM_NOT_FOUND" });

    const students = await prisma.student.findMany({
      where: { tenantId: ctx.tenantId, classroomId, status: "ACTIVE" },
      select: { id: true, firstName: true, lastName: true, sex: true, gender: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }, { id: "asc" }],
      take: 20000,
    });

    const deliveryRows = await prisma.lessonDelivery.findMany({
      where: {
        tenantId: ctx.tenantId,
        classroomId,
        teacherUserId,
        term,
        academicYear,
      },
      select: {
        id: true,
        subject: true,
        dateTaught: true,
        lessonNoteId: true,
        lessonNote: {
          select: {
            lessonTitle: true,
          },
        },
        assessmentItems: {
          where: {
            type: { not: "MOCK" },
          },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          select: {
            id: true,
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
            createdAt: true,
            date: true,
            lessonDeliveryId: true,
            createdByUserId: true,
            scores: { select: { studentId: true, score: true, comment: true } },
          },
        },
      },
      orderBy: [{ dateTaught: "asc" }, { createdAt: "asc" }],
      take: 20000,
    });

    const deliveries: WorkOutputDeliveryInput[] = deliveryRows
      .filter((delivery) =>
        subjectMatchesTeachingScope(
          delivery.subject,
          allowed.subject,
          allowedStageBucket
        )
      )
      .map((delivery) => ({
        id: delivery.id,
        subject: delivery.subject,
        dateTaught: delivery.dateTaught,
        lessonNoteId: delivery.lessonNoteId ?? null,
        lessonTitle: delivery.lessonNote?.lessonTitle ?? null,
        items: delivery.assessmentItems
          .filter((item) =>
            subjectMatchesTeachingScope(
              item.subject,
              allowed.subject,
              allowedStageBucket
            )
          )
          .map(
            (item): WorkOutputItemInput => ({
              id: item.id,
              title: item.title,
              type: item.type,
              maxScore: Number(item.maxScore ?? 0),
              date: item.date,
              createdAt: item.createdAt,
              lessonDeliveryId: item.lessonDeliveryId ?? null,
              scores: item.scores.map((score) => ({
                studentId: score.studentId,
                score: Number(score.score ?? 0),
              })),
            })
          ),
      }));

    const fallbackItems = await prisma.assessmentItem.findMany({
      where: {
        tenantId: ctx.tenantId,
        classroomId,
        term,
        academicYear,
        type: { not: "MOCK" },
        createdByUserId: teacherUserId,
        lessonDeliveryId: null,
      },
      select: {
        id: true,
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
        createdAt: true,
        date: true,
        lessonDeliveryId: true,
        createdByUserId: true,
        scores: { select: { studentId: true, score: true, comment: true } },
      },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      take: 20000,
    });

    const legacyUnlinkedItems: WorkOutputItemInput[] = fallbackItems
      .filter((item) =>
        subjectMatchesTeachingScope(
          item.subject,
          allowed.subject,
          allowedStageBucket
        )
      )
      .map((item) => ({
        id: item.id,
        title: item.title,
        type: item.type,
        maxScore: Number(item.maxScore ?? 0),
        date: item.date,
        createdAt: item.createdAt,
        lessonDeliveryId: null,
        scores: item.scores.map((score) => ({
          studentId: score.studentId,
          score: Number(score.score ?? 0),
        })),
      }));

    const workOutput = buildWorkOutputSnapshot({
      deliveries,
      legacyUnlinkedItems,
      students: students.map((student) => ({
        id: student.id,
        name:
          `${student.firstName ?? ""} ${student.lastName ?? ""}`.trim() ||
          "Learner",
      })),
    });

    const linkedItemIds = new Set(
      deliveries.flatMap((delivery) => delivery.items.map((item) => item.id))
    );

    const linkedItems = deliveryRows
      .flatMap((delivery) => delivery.assessmentItems)
      .filter((item) => linkedItemIds.has(item.id));

    const broadsheetItems = [...linkedItems, ...fallbackItems].filter((item) =>
      subjectMatchesTeachingScope(
        item.subject,
        allowed.subject,
        allowedStageBucket
      )
    );

    const scoreRows = broadsheetItems.flatMap((item) =>
      item.scores.map((score) => ({
        itemId: item.id,
        studentId: score.studentId,
        score: Number(score.score ?? 0),
        comment: score.comment ?? null,
      }))
    );

    const policy = await getTenantAssessmentPolicyLite(ctx.tenantId, { classroom });
    const sheet = buildSubjectBroadsheet({
      policy,
      subject: allowed.subject,
      students: students.map((s) => ({
        id: s.id,
        firstName: s.firstName ?? "",
        lastName: s.lastName ?? "",
        sex: s.sex ?? s.gender ?? "",
      })),
      items: broadsheetItems.map((item) => ({
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
      scores: scoreRows,
    });

    return jsonNoStore(200, {
      ok: true,
      term,
      academicYear,
      teacher: allowed.teacher,
      classroom: {
        classroomId: classroom.id,
        classLabel: classLabel(classroom),
      },
      subject: allowed.subject,
      workOutput: {
        itemCount: workOutput.term.itemCount,
        learnerCount: students.length,
        scoredEntries: workOutput.term.scoredEntries,
        legacyUnlinkedItemCount: workOutput.legacyUnlinked.itemCount,
        buckets: workOutput.term.typeCounts.map((bucket) => ({
          key: bucket.key,
          label: bucket.label,
          count: bucket.count,
          scoredCount: bucket.scoredEntries,
          averagePercent: bucket.averagePercent,
        })),
      },
      items: linkedItems.map((item) => ({
        id: item.id,
        title: item.title,
        type: item.type,
        maxScore: item.maxScore,
        status: item.status,
        scoresCount: item.scores.length,
      })),
      interpretation: {
        purpose: "FORMATIVE_PRACTICE_SUPPORT",
        ranking: false,
        punitive: false,
        canonicalEvidence: "LESSON_DELIVERY_LINKED_NON_MOCK",
      },
      broadsheet: {
        readiness: sheet.readiness,
        rows: sheet.rows,
        subject: sheet.subject,
      },
    });
  } catch (err) {
    console.error("[HEADTEACHER_SBA_WORK_OUTPUT_ERROR]", err);
    return jsonNoStore(500, { ok: false, error: "FAILED_TO_LOAD_SBA_WORK_OUTPUT" });
  }
}
 