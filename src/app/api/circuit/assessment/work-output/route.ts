import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  CIRCUIT_GOVERNANCE_ROLES,
  assertTenantInGovernanceScope,
  requireGovernanceApiContext,
} from "@/lib/governance/scope";
import { subjectMatchesTeachingScope } from "@/lib/teachingSubjectScope";
import {
  buildWorkOutputSnapshot,
  normalizeWorkOutputType,
  workOutputTypeLabel,
  type WorkOutputDeliveryInput,
  type WorkOutputItemInput,
} from "@/lib/assessments/workOutput";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_TERMS = ["1st Term", "2nd Term", "3rd Term"] as const;

type Term = (typeof VALID_TERMS)[number];

type ClassroomLite = {
  id: string;
  name: string;
  grade: string | null;
  arm: string | null;
};

type RosterClass = {
  classroomId: string;
  classLabel: string;
  scopeLevel: string | null;
  subjects: string[];
};

type RosterTeacher = {
  userId: string;
  name: string;
  classes: RosterClass[];
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

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeTerm(raw: unknown): Term | null {
  const value = clean(raw).toLowerCase();
  if (!value) return null;

  if (
    value === "1st term" ||
    value === "term 1" ||
    value === "term1" ||
    value === "1" ||
    value === "first term"
  ) {
    return "1st Term";
  }

  if (
    value === "2nd term" ||
    value === "term 2" ||
    value === "term2" ||
    value === "2" ||
    value === "second term"
  ) {
    return "2nd Term";
  }

  if (
    value === "3rd term" ||
    value === "term 3" ||
    value === "term3" ||
    value === "3" ||
    value === "third term"
  ) {
    return "3rd Term";
  }

  return VALID_TERMS.find((term) => term.toLowerCase() === value) ?? null;
}

function normalizeAcademicYear(raw: unknown) {
  const value = clean(raw);
  if (!value) return null;

  const dashed = value.match(/^(\d{4})-(\d{4})$/);
  if (dashed) return `${dashed[1]}/${dashed[2]}`;

  return /^\d{4}\/\d{4}$/.test(value) ? value : null;
}

function classLabel(classroom: ClassroomLite) {
  const name = clean(classroom.name);
  const grade = clean(classroom.grade);
  const arm = clean(classroom.arm);

  if (name && grade) {
    if (name.toUpperCase() === grade.toUpperCase()) {
      return `${name}${arm ? ` ${arm}` : ""}`;
    }

    return `${name} (${grade}${arm ? ` ${arm}` : ""})`;
  }

  if (name) return `${name}${arm ? ` ${arm}` : ""}`;
  if (grade) return `${grade}${arm ? ` ${arm}` : ""}`;
  return "Class";
}

function classroomScopeLevel(classroom: ClassroomLite) {
  return clean(classroom.grade) || clean(classroom.name) || null;
}

function teacherName(user: {
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
}) {
  const fallback = `${clean(user.firstName)} ${clean(user.lastName)}`.trim();
  return clean(user.name) || fallback || clean(user.email) || "Teacher";
}

function addSubject(subjects: string[], candidate: string, scopeLevel: string | null) {
  const value = clean(candidate);
  if (!value) return subjects;

  const alreadyPresent = subjects.some((current) =>
    subjectMatchesTeachingScope(current, value, scopeLevel)
  );

  return alreadyPresent ? subjects : [...subjects, value];
}

async function loadAuthorizedSchools(tenantIds: string[]) {
  if (!tenantIds.length) return [];

  const rows = await prisma.tenant.findMany({
    where: {
      id: { in: tenantIds },
      status: "ACTIVE",
    },
    select: {
      id: true,
      name: true,
      schoolCode: true,
      tenantSettings: {
        select: {
          currentTerm: true,
          currentAcademicYear: true,
        },
      },
    },
    orderBy: { name: "asc" },
    take: 1000,
  });

  return rows.map((school) => {
    const currentTerm = normalizeTerm(school.tenantSettings?.currentTerm);
    const currentAcademicYear = normalizeAcademicYear(
      school.tenantSettings?.currentAcademicYear
    );

    return {
      schoolId: school.id,
      schoolName: school.name,
      schoolCode: school.schoolCode,
      currentTerm,
      currentAcademicYear,
      currentCycleConfigured: Boolean(currentTerm && currentAcademicYear),
    };
  });
}

async function loadDeliveryRoster(args: {
  tenantId: string;
  term: string;
  academicYear: string;
}) {
  const rows = await prisma.lessonDelivery.findMany({
    where: {
      tenantId: args.tenantId,
      term: args.term,
      academicYear: args.academicYear,
    },
    select: {
      teacherUserId: true,
      subject: true,
      teacher: {
        select: {
          name: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
      classroom: {
        select: {
          id: true,
          name: true,
          grade: true,
          arm: true,
        },
      },
    },
    orderBy: [{ dateTaught: "asc" }, { createdAt: "asc" }],
    take: 20000,
  });

  const teachers = new Map<
    string,
    {
      userId: string;
      name: string;
      classes: Map<string, RosterClass>;
    }
  >();

  for (const row of rows) {
    const currentTeacher =
      teachers.get(row.teacherUserId) ?? {
        userId: row.teacherUserId,
        name: teacherName(row.teacher),
        classes: new Map<string, RosterClass>(),
      };

    const scopeLevel = classroomScopeLevel(row.classroom);
    const currentClass =
      currentTeacher.classes.get(row.classroom.id) ?? {
        classroomId: row.classroom.id,
        classLabel: classLabel(row.classroom),
        scopeLevel,
        subjects: [],
      };

    currentClass.subjects = addSubject(
      currentClass.subjects,
      row.subject,
      currentClass.scopeLevel
    );

    currentTeacher.classes.set(row.classroom.id, currentClass);
    teachers.set(row.teacherUserId, currentTeacher);
  }

  return [...teachers.values()]
    .map(
      (teacher): RosterTeacher => ({
        userId: teacher.userId,
        name: teacher.name,
        classes: [...teacher.classes.values()]
          .map((classroom) => ({
            ...classroom,
            subjects: [...classroom.subjects].sort((a, b) =>
              a.localeCompare(b)
            ),
          }))
          .sort((a, b) => a.classLabel.localeCompare(b.classLabel)),
      })
    )
    .sort((a, b) => a.name.localeCompare(b.name));
}

function resolveRosterSelection(args: {
  teachers: RosterTeacher[];
  teacherUserId: string;
  classroomId: string;
  subject: string;
}) {
  const teacher =
    args.teachers.find((candidate) => candidate.userId === args.teacherUserId) ??
    null;

  const classroom =
    teacher?.classes.find(
      (candidate) => candidate.classroomId === args.classroomId
    ) ?? null;

  const subject =
    classroom?.subjects.find((candidate) =>
      subjectMatchesTeachingScope(
        candidate,
        args.subject,
        classroom.scopeLevel
      )
    ) ?? null;

  return { teacher, classroom, subject };
}

function toIso(value: Date | string | null | undefined) {
  if (!value) return null;

  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

export async function GET(req: NextRequest) {
  const auth = await requireGovernanceApiContext(req, {
    allowedRoles: CIRCUIT_GOVERNANCE_ROLES,
    allowedZoneLevels: [1],
  });

  if (!auth.ok) return auth.res;

  const { searchParams } = new URL(req.url);
  const schoolId = clean(searchParams.get("schoolId"));
  const teacherUserId = clean(searchParams.get("teacherUserId"));
  const classroomId = clean(searchParams.get("classroomId"));
  const subject = clean(searchParams.get("subject"));
  const lessonDeliveryId = clean(searchParams.get("lessonDeliveryId"));

  try {
    if (!schoolId) {
      const schools = await loadAuthorizedSchools(auth.scope.tenantIds);

      return jsonNoStore(200, {
        ok: true,
        stage: "SCHOOLS",
        schools,
        interpretation: {
          ranking: false,
          punitive: false,
        },
      });
    }

    assertTenantInGovernanceScope(auth.scope, schoolId);

    const school = await prisma.tenant.findFirst({
      where: {
        id: schoolId,
        status: "ACTIVE",
      },
      select: {
        id: true,
        name: true,
        schoolCode: true,
        tenantSettings: {
          select: {
            currentTerm: true,
            currentAcademicYear: true,
          },
        },
      },
    });

    if (!school) {
      return jsonNoStore(404, {
        ok: false,
        error: "SCHOOL_NOT_FOUND_IN_ACTIVE_SCOPE",
      });
    }

    const explicitTerm = clean(searchParams.get("term"));
    const explicitAcademicYear = clean(searchParams.get("academicYear"));

    const term = explicitTerm
      ? normalizeTerm(explicitTerm)
      : normalizeTerm(school.tenantSettings?.currentTerm);

    const academicYear = explicitAcademicYear
      ? normalizeAcademicYear(explicitAcademicYear)
      : normalizeAcademicYear(school.tenantSettings?.currentAcademicYear);

    if (explicitTerm && !term) {
      return jsonNoStore(400, {
        ok: false,
        error: "INVALID_TERM",
      });
    }

    if (explicitAcademicYear && !academicYear) {
      return jsonNoStore(400, {
        ok: false,
        error: "INVALID_ACADEMIC_YEAR",
      });
    }

    if (!term || !academicYear) {
      return jsonNoStore(409, {
        ok: false,
        error: "CURRENT_TERM_YEAR_NOT_CONFIGURED",
        message:
          "This school has no complete current term and academic year setting.",
      });
    }

    const teachers = await loadDeliveryRoster({
      tenantId: schoolId,
      term,
      academicYear,
    });

    if (!teacherUserId && !classroomId && !subject) {
      return jsonNoStore(200, {
        ok: true,
        stage: "ROSTER",
        school: {
          schoolId: school.id,
          schoolName: school.name,
          schoolCode: school.schoolCode,
        },
        term,
        academicYear,
        teachers,
        interpretation: {
          purpose: "FORMATIVE_PRACTICE_SUPPORT",
          ranking: false,
          punitive: false,
        },
      });
    }

    if (!teacherUserId || !classroomId || !subject) {
      return jsonNoStore(400, {
        ok: false,
        error: "teacherUserId, classroomId, and subject are required.",
      });
    }

    const allowed = resolveRosterSelection({
      teachers,
      teacherUserId,
      classroomId,
      subject,
    });

    if (!allowed.teacher || !allowed.classroom || !allowed.subject) {
      return jsonNoStore(403, {
        ok: false,
        error: "TEACHER_SUBJECT_OUT_OF_CIRCUIT_WORK_OUTPUT_SCOPE",
      });
    }

    const allowedTeacher = allowed.teacher;
    const allowedClassroom = allowed.classroom;
    const allowedSubject = allowed.subject;

    const [studentsRaw, deliveriesRaw, legacyUnlinkedRaw] = await Promise.all([
      prisma.student.findMany({
        where: {
          tenantId: schoolId,
          classroomId,
          status: "ACTIVE",
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
        orderBy: [
          { lastName: "asc" },
          { firstName: "asc" },
          { createdAt: "asc" },
        ],
        take: 20000,
      }),
      prisma.lessonDelivery.findMany({
        where: {
          tenantId: schoolId,
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
            select: {
              id: true,
              subject: true,
              title: true,
              type: true,
              maxScore: true,
              date: true,
              createdAt: true,
              lessonDeliveryId: true,
              scores: {
                select: {
                  studentId: true,
                  score: true,
                },
              },
            },
            orderBy: [{ date: "asc" }, { createdAt: "asc" }],
          },
        },
        orderBy: [{ dateTaught: "asc" }, { createdAt: "asc" }],
        take: 20000,
      }),
      prisma.assessmentItem.findMany({
        where: {
          tenantId: schoolId,
          classroomId,
          term,
          academicYear,
          createdByUserId: teacherUserId,
          lessonDeliveryId: null,
          type: { not: "MOCK" },
        },
        select: {
          id: true,
          subject: true,
          title: true,
          type: true,
          maxScore: true,
          date: true,
          createdAt: true,
          lessonDeliveryId: true,
          scores: {
            select: {
              studentId: true,
              score: true,
            },
          },
        },
        orderBy: [{ date: "asc" }, { createdAt: "asc" }],
        take: 20000,
      }),
    ]);

    const students = studentsRaw.map((student) => ({
      id: student.id,
      name:
        `${student.firstName ?? ""} ${student.lastName ?? ""}`.trim() ||
        "Learner",
    }));

    const activeStudentIds = new Set(students.map((student) => student.id));

    const deliveries: WorkOutputDeliveryInput[] = deliveriesRaw
      .filter((delivery) =>
        subjectMatchesTeachingScope(
          delivery.subject,
          allowedSubject,
          allowedClassroom.scopeLevel
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
              allowedSubject,
              allowedClassroom.scopeLevel
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
              scores: item.scores
                .filter((score) => activeStudentIds.has(score.studentId))
                .map((score) => ({
                  studentId: score.studentId,
                  score: Number(score.score ?? 0),
                })),
            })
          ),
      }));

    if (
      lessonDeliveryId &&
      !deliveries.some((delivery) => delivery.id === lessonDeliveryId)
    ) {
      return jsonNoStore(404, {
        ok: false,
        error: "LESSON_DELIVERY_NOT_FOUND_IN_SCOPE",
      });
    }

    const legacyUnlinkedItems: WorkOutputItemInput[] = legacyUnlinkedRaw
      .filter((item) =>
        subjectMatchesTeachingScope(
          item.subject,
          allowedSubject,
          allowedClassroom.scopeLevel
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
        scores: item.scores
          .filter((score) => activeStudentIds.has(score.studentId))
          .map((score) => ({
            studentId: score.studentId,
            score: Number(score.score ?? 0),
          })),
      }));

    const workOutput = buildWorkOutputSnapshot({
      deliveries,
      legacyUnlinkedItems,
      students,
      lessonDeliveryId: lessonDeliveryId || null,
    });

    const deliverySummaries = deliveries.map((delivery) => ({
      id: delivery.id,
      subject: delivery.subject,
      lessonTitle: delivery.lessonTitle ?? null,
      lessonNoteId: delivery.lessonNoteId ?? null,
      dateTaught: toIso(delivery.dateTaught),
      assessmentCount: delivery.items.length,
      scoredAssessmentCount: delivery.items.filter(
        (item) => item.scores.length > 0
      ).length,
      types: Object.values(
        delivery.items.reduce<
          Record<
            string,
            {
              key: string;
              label: string;
              count: number;
            }
          >
        >((acc, item) => {
          const key = normalizeWorkOutputType(item.type);
          const current = acc[key] ?? {
            key,
            label: workOutputTypeLabel(key),
            count: 0,
          };

          current.count += 1;
          acc[key] = current;
          return acc;
        }, {})
      ),
    }));

    return jsonNoStore(200, {
      ok: true,
      stage: "WORK_OUTPUT",
      school: {
        schoolId: school.id,
        schoolName: school.name,
        schoolCode: school.schoolCode,
      },
      term,
      academicYear,
      teacher: {
        userId: allowedTeacher.userId,
        name: allowedTeacher.name,
      },
      classroom: {
        classroomId: allowedClassroom.classroomId,
        classLabel: allowedClassroom.classLabel,
        scopeLevel: allowedClassroom.scopeLevel,
      },
      subject: allowedSubject,
      deliveries: deliverySummaries,
      workOutput,
      interpretation: {
        purpose: "FORMATIVE_PRACTICE_SUPPORT",
        ranking: false,
        punitive: false,
        canonicalEvidence: "LESSON_DELIVERY_LINKED_NON_MOCK",
        legacyUnlinkedEvidence: "PRESERVED_SEPARATELY",
      },
    });
  } catch (error: unknown) {
    const status =
      typeof error === "object" &&
      error !== null &&
      "status" in error &&
      Number((error as { status?: unknown }).status) === 403
        ? 403
        : 500;

    if (status === 403) {
      return jsonNoStore(403, {
        ok: false,
        error: "GOVERNANCE_TENANT_FORBIDDEN",
      });
    }

    console.error("[CIRCUIT_WORK_OUTPUT_ERROR]", error);

    return jsonNoStore(500, {
      ok: false,
      error: "FAILED_TO_LOAD_CIRCUIT_WORK_OUTPUT",
    });
  }
}
