import { prisma } from "@/lib/prisma";
import {
  normalizeJhsAssignmentsLoose,
  normalizeLevelToken,
  normalizeSubjectKeyFromMaybeSlug,
} from "@/lib/teacherScope";
import {
  readTeacherSupervisoryAssessmentQueue,
  type TeacherSupervisoryQueueDatabase,
} from "@/lib/appraisals/teacherSupervisoryAssessmentQueue";
import type { GovernanceScope } from "@/lib/governance/scope";

export const TEACHER_SUPERVISORY_OBSERVATION_OPTIONS_POLICY = {
  schemaVersion: 1,
  readOnly: true,
  teacherScopeRequired: true,
  explicitAssignmentsOverrideTeacherProfileFallback: true,
  historicalLessonEvidenceMayWidenAuthority: false,
  curriculumSubStrandRequired: true,
  contactsIncluded: false,
  databaseWritesAllowed: false,
  providerCallsAllowed: false,
} as const;

export type TeacherSupervisoryObservationSubStrandOption = {
  curriculumSubStrandId: string;
  code: string | null;
  title: string;
  strandId: string;
  strandCode: string | null;
  strandTitle: string;
};

export type TeacherSupervisoryObservationSubjectOption = {
  curriculumSubjectId: string;
  subject: string;
  phase: "KG" | "PRIMARY" | "JHS";
  level: string;
  subStrands: TeacherSupervisoryObservationSubStrandOption[];
};

export type TeacherSupervisoryObservationClassOption = {
  classroomId: string;
  classTaught: string;
  phase: "KG" | "PRIMARY" | "JHS";
  level: string;
  subjects: TeacherSupervisoryObservationSubjectOption[];
};

export type TeacherSupervisoryObservationOptions = {
  actorRole: string;
  officeLabel: string;
  target: {
    targetUserId: string;
    targetName: string | null;
    targetTenantId: string;
    schoolName: string;
    circuitId: string;
    circuitName: string;
    districtId: string;
    districtName: string;
  };
  observationDate: string;
  classes: TeacherSupervisoryObservationClassOption[];
  readOnly: true;
  assignmentVerified: true;
  curriculumVerified: true;
  historicalLessonEvidenceIncluded: false;
  contactDetailsIncluded: false;
  providerCalled: false;
};

export type TeacherSupervisoryObservationSelectionSnapshot = {
  schemaVersion: 1;
  classroomId: string;
  classTaught: string;
  phase: "KG" | "PRIMARY" | "JHS";
  level: string;
  curriculumSubjectId: string;
  subjectBeingObserved: string;
  curriculumSubStrandId: string;
  subStrand: string;
  subStrandCode: string | null;
  strandId: string;
  strandCode: string | null;
  strandTitle: string;
  authorization: {
    source:
      | "TEACHER_ASSESSMENT_ASSIGNMENT"
      | "TEACHER_PROFILE_PRIMARY_CLASSROOM"
      | "TEACHER_PROFILE_JHS_ASSIGNMENT";
    assignmentIds: string[];
    assignmentKinds: Array<"CLASS_ALL_SUBJECTS" | "SUBJECT">;
    teacherProfileId: string | null;
  };
};

type ClassroomRecord = {
  id: string;
  tenantId: string;
  name: string;
  grade: string | null;
  arm: string | null;
  status: string;
};

type AssignmentRecord = {
  id: string;
  tenantId: string;
  teacherUserId: string;
  assignmentKind: string;
  classroomId: string | null;
  phase: string | null;
  level: string | null;
  subject: string | null;
  subjectNorm: string | null;
  status: string;
  startsAt: Date | null;
  endsAt: Date | null;
  revokedAt: Date | null;
};

type TeacherProfileRecord = {
  id: string;
  tenantId: string;
  userId: string;
  phase: string;
  classLevel: string | null;
  jhsAssignments: unknown;
  primaryClassroomId: string | null;
};

type CurriculumSubjectRecord = {
  id: string;
  tenantId: string | null;
  phase: string | null;
  level: string | null;
  name: string;
  orderIndex: number;
  isGlobal: boolean;
  isActive: boolean;
  countryCode: string;
  strands: Array<{
    id: string;
    code: string | null;
    title: string;
    orderIndex: number;
    subStrands: Array<{
      id: string;
      code: string | null;
      title: string;
      orderIndex: number;
    }>;
  }>;
};

export type TeacherSupervisoryObservationResolutionDatabase = {
  teacherAssessmentAssignment: {
    findMany(args: unknown): Promise<AssignmentRecord[]>;
  };
  teacherProfile: {
    findUnique(args: unknown): Promise<TeacherProfileRecord | null>;
  };
  classroom: {
    findMany(args: unknown): Promise<ClassroomRecord[]>;
  };
  curriculumSubject: {
    findMany(args: unknown): Promise<CurriculumSubjectRecord[]>;
  };
};

export type TeacherSupervisoryObservationOptionsDatabase =
  TeacherSupervisoryObservationResolutionDatabase &
    TeacherSupervisoryQueueDatabase;

type ReadOptionsInput = {
  actorUserId: string;
  actorRoleName: unknown;
  governanceScope: GovernanceScope;
  targetUserId: string;
  targetTenantId: string;
  dateObserved: unknown;
  now?: Date;
  database?: TeacherSupervisoryObservationOptionsDatabase;
};

type ResolveSelectionInput = {
  targetUserId: string;
  targetTenantId: string;
  dateObserved: unknown;
  classroomId: unknown;
  curriculumSubjectId: unknown;
  curriculumSubStrandId: unknown;
  database?: TeacherSupervisoryObservationResolutionDatabase;
};

type AuthorizationSource = {
  source: TeacherSupervisoryObservationSelectionSnapshot["authorization"]["source"];
  assignmentId: string | null;
  assignmentKind: "CLASS_ALL_SUBJECTS" | "SUBJECT" | null;
  teacherProfileId: string | null;
  subjectKey: string | null;
};

type ClassAuthorization = {
  classroom: ClassroomRecord;
  sources: AuthorizationSource[];
};

type BuiltOptions = {
  classes: TeacherSupervisoryObservationClassOption[];
  authorizationBySelectionKey: Map<string, AuthorizationSource[]>;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function normalized(value: unknown) {
  return clean(value).toUpperCase().replace(/[\s-]+/g, "_");
}

function canonicalPhase(
  value: unknown,
): "KG" | "PRIMARY" | "JHS" | null {
  const phase = normalized(value);

  if (phase === "KG" || phase === "KINDERGARTEN") return "KG";
  if (
    phase === "PRIMARY" ||
    phase === "LOWER_PRIMARY" ||
    phase === "UPPER_PRIMARY" ||
    phase === "BASIC" ||
    phase === "BASIC_SCHOOL"
  ) {
    return "PRIMARY";
  }
  if (
    phase === "JHS" ||
    phase === "JUNIOR_HIGH" ||
    phase === "JUNIOR_HIGH_SCHOOL"
  ) {
    return "JHS";
  }

  return null;
}

function fail(
  code: string,
  status: number,
  details?: Record<string, unknown>,
): never {
  const error = new Error(code) as Error & {
    code?: string;
    status?: number;
    details?: Record<string, unknown>;
  };
  error.code = code;
  error.status = status;
  error.details = details;
  throw error;
}

function objectValue(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function readStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map(clean).filter(Boolean);
}

export function readTeacherSupervisoryObservationSelectionSnapshot(
  value: unknown,
): TeacherSupervisoryObservationSelectionSnapshot | null {
  const snapshot = objectValue(value);
  if (!Object.keys(snapshot).length) return null;
  const authorization = objectValue(snapshot.authorization);
  const source = clean(authorization.source);
  const assignmentKinds = readStringArray(authorization.assignmentKinds).filter(
    (kind): kind is "CLASS_ALL_SUBJECTS" | "SUBJECT" =>
      kind === "CLASS_ALL_SUBJECTS" || kind === "SUBJECT",
  );
  const assignmentIds = readStringArray(authorization.assignmentIds);
  const phase = normalized(snapshot.phase);

  if (
    Number(snapshot.schemaVersion) !== 1 ||
    !clean(snapshot.classroomId) ||
    !clean(snapshot.classTaught) ||
    (phase !== "KG" && phase !== "PRIMARY" && phase !== "JHS") ||
    !clean(snapshot.level) ||
    !clean(snapshot.curriculumSubjectId) ||
    !clean(snapshot.subjectBeingObserved) ||
    !clean(snapshot.curriculumSubStrandId) ||
    !clean(snapshot.subStrand) ||
    !clean(snapshot.strandId) ||
    !clean(snapshot.strandTitle) ||
    (source !== "TEACHER_ASSESSMENT_ASSIGNMENT" &&
      source !== "TEACHER_PROFILE_PRIMARY_CLASSROOM" &&
      source !== "TEACHER_PROFILE_JHS_ASSIGNMENT")
  ) {
    fail("TEACHER_SUPERVISORY_OBSERVATION_SELECTION_SNAPSHOT_INVALID", 409);
  }

  if (source === "TEACHER_ASSESSMENT_ASSIGNMENT" && !assignmentIds.length) {
    fail("TEACHER_SUPERVISORY_OBSERVATION_SELECTION_SNAPSHOT_INVALID", 409, {
      reason: "EXPLICIT_ASSIGNMENT_PROVENANCE_REQUIRED",
    });
  }

  return {
    schemaVersion: 1,
    classroomId: clean(snapshot.classroomId),
    classTaught: clean(snapshot.classTaught),
    phase: phase as "KG" | "PRIMARY" | "JHS",
    level: clean(snapshot.level),
    curriculumSubjectId: clean(snapshot.curriculumSubjectId),
    subjectBeingObserved: clean(snapshot.subjectBeingObserved),
    curriculumSubStrandId: clean(snapshot.curriculumSubStrandId),
    subStrand: clean(snapshot.subStrand),
    subStrandCode: clean(snapshot.subStrandCode) || null,
    strandId: clean(snapshot.strandId),
    strandCode: clean(snapshot.strandCode) || null,
    strandTitle: clean(snapshot.strandTitle),
    authorization: {
      source: source as TeacherSupervisoryObservationSelectionSnapshot["authorization"]["source"],
      assignmentIds: [...new Set(assignmentIds)].sort(),
      assignmentKinds: [...new Set(assignmentKinds)].sort(),
      teacherProfileId: clean(authorization.teacherProfileId) || null,
    },
  };
}

function requireIdentifier(value: unknown, fieldName: string) {
  const identifier = clean(value);
  if (!/^[A-Za-z0-9_-]{5,180}$/.test(identifier)) {
    fail("TEACHER_SUPERVISORY_OBSERVATION_OPTION_INVALID_IDENTIFIER", 400, {
      fieldName,
    });
  }
  return identifier;
}

function requireDateOnly(value: unknown) {
  const raw = clean(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    fail("TEACHER_SUPERVISORY_OBSERVATION_DATE_INVALID", 400, {
      fieldName: "dateObserved",
      reason: "EXPECTED_YYYY_MM_DD",
    });
  }
  const parsed = new Date(`${raw}T00:00:00.000Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== raw
  ) {
    fail("TEACHER_SUPERVISORY_OBSERVATION_DATE_INVALID", 400, {
      fieldName: "dateObserved",
      reason: "EXPECTED_REAL_CALENDAR_DATE",
    });
  }
  return raw;
}

function dayBounds(dateObserved: string) {
  const start = new Date(`${dateObserved}T00:00:00.000Z`);
  const end = new Date(`${dateObserved}T23:59:59.999Z`);
  return { start, end };
}

function assignmentEffectiveOnDate(
  assignment: AssignmentRecord,
  dateObserved: string,
) {
  if (
    normalized(assignment.status) !== "ACTIVE" ||
    assignment.revokedAt != null
  ) {
    return false;
  }
  const { start, end } = dayBounds(dateObserved);
  if (assignment.startsAt && assignment.startsAt.getTime() > end.getTime()) {
    return false;
  }
  if (assignment.endsAt && assignment.endsAt.getTime() < start.getTime()) {
    return false;
  }
  return true;
}

function classLabel(classroom: ClassroomRecord) {
  const name = clean(classroom.name);
  const grade = clean(classroom.grade);
  const arm = clean(classroom.arm);
  if (name && arm && !name.toUpperCase().endsWith(arm.toUpperCase())) {
    return `${name} ${arm}`;
  }
  return name || [grade, arm].filter(Boolean).join(" ");
}

function classroomLevelToken(classroom: ClassroomRecord) {
  const candidates = [
    classroom.name,
    classroom.grade,
    classLabel(classroom),
  ];
  for (const candidate of candidates) {
    const token = normalizeLevelToken(candidate);
    if (token) return token;
  }
  return null;
}

function phaseForLevelToken(
  token: string | null,
): "KG" | "PRIMARY" | "JHS" | null {
  if (!token) return null;
  if (/^KG[12]$/.test(token)) return "KG";
  if (/^B[1-6]$/.test(token)) return "PRIMARY";
  if (/^JHS[1-3]$/.test(token)) return "JHS";
  return null;
}

function classroomMatchesPhaseLevel(
  classroom: ClassroomRecord,
  phase: unknown,
  level: unknown,
) {
  const token = classroomLevelToken(classroom);
  const wanted = normalizeLevelToken(level);
  const wantedPhase = canonicalPhase(phase);
  const actualPhase = phaseForLevelToken(token);
  return Boolean(
    token &&
      wanted &&
      token === wanted &&
      actualPhase &&
      (!clean(phase) || (wantedPhase != null && actualPhase === wantedPhase)),
  );
}

function curriculumMatchesClass(
  subject: CurriculumSubjectRecord,
  classroom: ClassroomRecord,
) {
  if (subject.isActive !== true || clean(subject.countryCode) !== "GH") {
    return false;
  }
  const classLevel = classroomLevelToken(classroom);
  const subjectLevel = normalizeLevelToken(subject.level);
  const classPhase = phaseForLevelToken(classLevel);
  const subjectPhase = canonicalPhase(subject.phase);
  if (!classLevel || !classPhase || !subjectLevel) return false;
  if (classLevel !== subjectLevel) return false;
  if (clean(subject.phase) && subjectPhase !== classPhase) return false;
  return true;
}

function uniqueClassroomByLevel(
  classrooms: ClassroomRecord[],
  level: unknown,
) {
  const token = normalizeLevelToken(level);
  if (!token) return null;
  const matches = classrooms.filter(
    (classroom) => classroomLevelToken(classroom) === token,
  );
  return matches.length === 1 ? matches[0] : null;
}

function preferredProfileClassroomByLevel(input: {
  classrooms: ClassroomRecord[];
  level: unknown;
  primaryClassroomId: string | null;
}) {
  const token = normalizeLevelToken(input.level);
  if (!token) return null;

  const activeMatches = input.classrooms.filter(
    (classroom) =>
      normalized(classroom.status) === "ACTIVE" &&
      classroomLevelToken(classroom) === token,
  );

  // The armless classroom is the canonical single-stream record. When it
  // exists uniquely, prefer it over A/B/C/D stream records. This keeps the
  // profile fallback deterministic without inventing a stream assignment.
  const armless = activeMatches.filter((classroom) => !clean(classroom.arm));
  if (armless.length === 1) return armless[0];
  if (armless.length > 1) return null;

  // If a school has only streamed records, an exact server-stored primary
  // classroom is acceptable evidence. We still never guess among streams.
  const primaryClassroomId = clean(input.primaryClassroomId);
  if (primaryClassroomId) {
    const primary = activeMatches.find(
      (classroom) => classroom.id === primaryClassroomId,
    );
    if (primary) return primary;
  }

  return activeMatches.length === 1 ? activeMatches[0] : null;
}

function addClassAuthorization(
  map: Map<string, ClassAuthorization>,
  classroom: ClassroomRecord | null | undefined,
  source: AuthorizationSource,
) {
  if (!classroom || normalized(classroom.status) !== "ACTIVE") return;
  if (!classroomLevelToken(classroom)) return;
  const current = map.get(classroom.id) ?? {
    classroom,
    sources: [],
  };
  const sourceKey = JSON.stringify(source);
  if (!current.sources.some((candidate) => JSON.stringify(candidate) === sourceKey)) {
    current.sources.push(source);
  }
  map.set(classroom.id, current);
}

function activeAssignmentAuthorizations(input: {
  assignments: AssignmentRecord[];
  classrooms: ClassroomRecord[];
  dateObserved: string;
}) {
  const map = new Map<string, ClassAuthorization>();
  const effective = input.assignments.filter((assignment) =>
    assignmentEffectiveOnDate(assignment, input.dateObserved),
  );

  for (const assignment of effective) {
    const kind = normalized(assignment.assignmentKind);
    if (kind !== "CLASS_ALL_SUBJECTS" && kind !== "SUBJECT") continue;
    const assignmentKind = kind as "CLASS_ALL_SUBJECTS" | "SUBJECT";
    const subjectKey =
      assignmentKind === "SUBJECT"
        ? normalizeSubjectKeyFromMaybeSlug(clean(assignment.subject)) || null
        : null;
    if (assignmentKind === "SUBJECT" && !subjectKey) continue;

    const source: AuthorizationSource = {
      source: "TEACHER_ASSESSMENT_ASSIGNMENT",
      assignmentId: assignment.id,
      assignmentKind,
      teacherProfileId: null,
      subjectKey,
    };

    if (assignment.classroomId) {
      addClassAuthorization(
        map,
        input.classrooms.find(
          (classroom) => classroom.id === assignment.classroomId,
        ),
        source,
      );
      continue;
    }

    if (assignmentKind === "SUBJECT" && assignment.level) {
      for (const classroom of input.classrooms) {
        if (
          classroomMatchesPhaseLevel(
            classroom,
            assignment.phase,
            assignment.level,
          )
        ) {
          addClassAuthorization(map, classroom, source);
        }
      }
    }
  }

  return { map, effectiveCount: effective.length };
}

function profileAuthorizations(input: {
  profile: TeacherProfileRecord | null;
  classrooms: ClassroomRecord[];
}) {
  const map = new Map<string, ClassAuthorization>();
  const profile = input.profile;
  if (!profile) return map;

  const phase = canonicalPhase(profile.phase);
  if (phase === "KG" || phase === "PRIMARY") {
    const classroom = profile.primaryClassroomId
      ? input.classrooms.find(
          (candidate) => candidate.id === profile.primaryClassroomId,
        ) ?? null
      : uniqueClassroomByLevel(input.classrooms, profile.classLevel);

    addClassAuthorization(map, classroom, {
      source: "TEACHER_PROFILE_PRIMARY_CLASSROOM",
      assignmentId: null,
      assignmentKind: null,
      teacherProfileId: profile.id,
      subjectKey: null,
    });
    return map;
  }

  if (phase === "JHS") {
    for (const assignment of normalizeJhsAssignmentsLoose(
      profile.jhsAssignments,
    )) {
      const subjectKey = normalizeSubjectKeyFromMaybeSlug(assignment.subject);
      if (!subjectKey) continue;
      for (const level of assignment.classes) {
        const classroom = preferredProfileClassroomByLevel({
          classrooms: input.classrooms,
          level,
          primaryClassroomId: profile.primaryClassroomId,
        });
        addClassAuthorization(map, classroom, {
          source: "TEACHER_PROFILE_JHS_ASSIGNMENT",
          assignmentId: null,
          assignmentKind: null,
          teacherProfileId: profile.id,
          subjectKey,
        });
      }
    }
  }

  return map;
}

function preferredCurriculumSubjects(input: {
  rows: CurriculumSubjectRecord[];
  targetTenantId: string;
  classroom: ClassroomRecord;
}) {
  const bySubjectKey = new Map<string, CurriculumSubjectRecord[]>();
  for (const row of input.rows) {
    if (!curriculumMatchesClass(row, input.classroom)) continue;
    const key = normalizeSubjectKeyFromMaybeSlug(row.name);
    if (!key) continue;
    const list = bySubjectKey.get(key) ?? [];
    list.push(row);
    bySubjectKey.set(key, list);
  }

  const preferred = new Map<string, CurriculumSubjectRecord>();
  for (const [key, rows] of bySubjectKey) {
    rows.sort((left, right) => {
      const leftTenant = left.tenantId === input.targetTenantId ? 0 : 1;
      const rightTenant = right.tenantId === input.targetTenantId ? 0 : 1;
      if (leftTenant !== rightTenant) return leftTenant - rightTenant;
      if (left.orderIndex !== right.orderIndex) {
        return left.orderIndex - right.orderIndex;
      }
      return left.id.localeCompare(right.id);
    });
    preferred.set(key, rows[0]);
  }
  return preferred;
}

function subStrandsFor(subject: CurriculumSubjectRecord) {
  return [...subject.strands]
    .sort((left, right) => {
      if (left.orderIndex !== right.orderIndex) {
        return left.orderIndex - right.orderIndex;
      }
      return left.title.localeCompare(right.title);
    })
    .flatMap((strand) =>
      [...strand.subStrands]
        .sort((left, right) => {
          if (left.orderIndex !== right.orderIndex) {
            return left.orderIndex - right.orderIndex;
          }
          return left.title.localeCompare(right.title);
        })
        .map(
          (subStrand): TeacherSupervisoryObservationSubStrandOption => ({
            curriculumSubStrandId: subStrand.id,
            code: clean(subStrand.code) || null,
            title: clean(subStrand.title),
            strandId: strand.id,
            strandCode: clean(strand.code) || null,
            strandTitle: clean(strand.title),
          }),
        ),
    )
    .filter((option) => Boolean(option.title && option.strandTitle));
}

function selectionKey(
  classroomId: string,
  curriculumSubjectId: string,
) {
  return `${classroomId}::${curriculumSubjectId}`;
}

async function buildOptions(input: {
  targetUserId: string;
  targetTenantId: string;
  dateObserved: string;
  database: TeacherSupervisoryObservationResolutionDatabase;
}): Promise<BuiltOptions> {
  const [assignments, profile, classrooms, curriculumSubjects] =
    await Promise.all([
      input.database.teacherAssessmentAssignment.findMany({
        where: {
          tenantId: input.targetTenantId,
          teacherUserId: input.targetUserId,
          status: "ACTIVE",
        },
        select: {
          id: true,
          tenantId: true,
          teacherUserId: true,
          assignmentKind: true,
          classroomId: true,
          phase: true,
          level: true,
          subject: true,
          subjectNorm: true,
          status: true,
          startsAt: true,
          endsAt: true,
          revokedAt: true,
        },
      }),
      input.database.teacherProfile.findUnique({
        where: {
          teacherProfile_tenant_user_unique: {
            tenantId: input.targetTenantId,
            userId: input.targetUserId,
          },
        },
        select: {
          id: true,
          tenantId: true,
          userId: true,
          phase: true,
          classLevel: true,
          jhsAssignments: true,
          primaryClassroomId: true,
        },
      }),
      input.database.classroom.findMany({
        where: {
          tenantId: input.targetTenantId,
          status: "ACTIVE",
        },
        select: {
          id: true,
          tenantId: true,
          name: true,
          grade: true,
          arm: true,
          status: true,
        },
      }),
      input.database.curriculumSubject.findMany({
        where: {
          isActive: true,
          countryCode: "GH",
          OR: [
            { tenantId: input.targetTenantId },
            { tenantId: null, isGlobal: true },
          ],
        },
        select: {
          id: true,
          tenantId: true,
          phase: true,
          level: true,
          name: true,
          orderIndex: true,
          isGlobal: true,
          isActive: true,
          countryCode: true,
          strands: {
            select: {
              id: true,
              code: true,
              title: true,
              orderIndex: true,
              subStrands: {
                select: {
                  id: true,
                  code: true,
                  title: true,
                  orderIndex: true,
                },
                orderBy: { orderIndex: "asc" },
              },
            },
            orderBy: { orderIndex: "asc" },
          },
        },
      }),
    ]);

  const explicit = activeAssignmentAuthorizations({
    assignments,
    classrooms,
    dateObserved: input.dateObserved,
  });

  // Any explicit ACTIVE assignment row is authoritative. If none of those rows
  // is effective on the observation date, fail closed rather than widening back
  // to a profile-derived scope. TeacherProfile is only a legacy fallback when the
  // Teacher has no explicit assessment-assignment rows at all.
  const classAuthorizations =
    assignments.length > 0
      ? explicit.map
      : profileAuthorizations({ profile, classrooms });

  const authorizationBySelectionKey = new Map<string, AuthorizationSource[]>();
  const classes: TeacherSupervisoryObservationClassOption[] = [];

  for (const authorization of classAuthorizations.values()) {
    const classroom = authorization.classroom;
    const level = classroomLevelToken(classroom);
    const phase = phaseForLevelToken(level);
    if (!level || !phase) continue;

    const curriculumByKey = preferredCurriculumSubjects({
      rows: curriculumSubjects,
      targetTenantId: input.targetTenantId,
      classroom,
    });

    const subjectSources = new Map<string, AuthorizationSource[]>();
    const allSubjectsAllowed = authorization.sources.some(
      (source) => source.subjectKey == null,
    );

    if (allSubjectsAllowed) {
      for (const subjectKey of curriculumByKey.keys()) {
        subjectSources.set(
          subjectKey,
          authorization.sources.filter((source) => source.subjectKey == null),
        );
      }
    }

    for (const source of authorization.sources) {
      if (!source.subjectKey) continue;
      const list = subjectSources.get(source.subjectKey) ?? [];
      list.push(source);
      subjectSources.set(source.subjectKey, list);
    }

    const subjects: TeacherSupervisoryObservationSubjectOption[] = [];
    for (const [subjectKey, sources] of subjectSources) {
      const curriculum = curriculumByKey.get(subjectKey);
      if (!curriculum) continue;
      const subStrands = subStrandsFor(curriculum);
      if (!subStrands.length) continue;

      subjects.push({
        curriculumSubjectId: curriculum.id,
        subject: clean(curriculum.name),
        phase,
        level,
        subStrands,
      });
      authorizationBySelectionKey.set(
        selectionKey(classroom.id, curriculum.id),
        sources,
      );
    }

    subjects.sort((left, right) => left.subject.localeCompare(right.subject));
    if (!subjects.length) continue;

    classes.push({
      classroomId: classroom.id,
      classTaught: classLabel(classroom),
      phase,
      level,
      subjects,
    });
  }

  classes.sort((left, right) =>
    left.classTaught.localeCompare(right.classTaught),
  );

  return { classes, authorizationBySelectionKey };
}

export async function readTeacherSupervisoryObservationOptions(
  input: ReadOptionsInput,
): Promise<TeacherSupervisoryObservationOptions> {
  const targetUserId = requireIdentifier(input.targetUserId, "targetUserId");
  const targetTenantId = requireIdentifier(
    input.targetTenantId,
    "targetTenantId",
  );
  const dateObserved = requireDateOnly(input.dateObserved);
  const database =
    input.database ??
    (prisma as unknown as TeacherSupervisoryObservationOptionsDatabase);

  const queue = await readTeacherSupervisoryAssessmentQueue({
    actorUserId: input.actorUserId,
    actorRoleName: input.actorRoleName,
    governanceScope: input.governanceScope,
    now: input.now,
    database,
  });

  const target = queue.items.find(
    (item) =>
      item.targetUserId === targetUserId && item.schoolId === targetTenantId,
  );
  if (!target) {
    fail("TEACHER_SUPERVISORY_OBSERVATION_TARGET_NOT_AUTHORIZED", 403);
  }

  const built = await buildOptions({
    targetUserId,
    targetTenantId,
    dateObserved,
    database,
  });

  return {
    actorRole: queue.actorRole,
    officeLabel: queue.officeLabel,
    target: {
      targetUserId,
      targetName: target.targetName,
      targetTenantId,
      schoolName: target.schoolName,
      circuitId: target.circuitId,
      circuitName: target.circuitName,
      districtId: target.districtId,
      districtName: target.districtName,
    },
    observationDate: dateObserved,
    classes: built.classes,
    readOnly: true,
    assignmentVerified: true,
    curriculumVerified: true,
    historicalLessonEvidenceIncluded: false,
    contactDetailsIncluded: false,
    providerCalled: false,
  };
}

export async function resolveTeacherSupervisoryObservationSelection(
  input: ResolveSelectionInput,
): Promise<TeacherSupervisoryObservationSelectionSnapshot> {
  const targetUserId = requireIdentifier(input.targetUserId, "targetUserId");
  const targetTenantId = requireIdentifier(
    input.targetTenantId,
    "targetTenantId",
  );
  const classroomId = requireIdentifier(input.classroomId, "classroomId");
  const curriculumSubjectId = requireIdentifier(
    input.curriculumSubjectId,
    "curriculumSubjectId",
  );
  const curriculumSubStrandId = requireIdentifier(
    input.curriculumSubStrandId,
    "curriculumSubStrandId",
  );
  const dateObserved = requireDateOnly(input.dateObserved);
  const database =
    input.database ??
    (prisma as unknown as TeacherSupervisoryObservationResolutionDatabase);

  const built = await buildOptions({
    targetUserId,
    targetTenantId,
    dateObserved,
    database,
  });
  const classroom = built.classes.find(
    (option) => option.classroomId === classroomId,
  );
  const subject = classroom?.subjects.find(
    (option) => option.curriculumSubjectId === curriculumSubjectId,
  );
  const subStrand = subject?.subStrands.find(
    (option) => option.curriculumSubStrandId === curriculumSubStrandId,
  );

  if (!classroom || !subject || !subStrand) {
    fail("TEACHER_SUPERVISORY_OBSERVATION_SELECTION_INVALID", 409, {
      fieldName: !classroom
        ? "classroomId"
        : !subject
          ? "curriculumSubjectId"
          : "curriculumSubStrandId",
      reason: "SELECTION_MUST_MATCH_CURRENT_TEACHER_ASSIGNMENT_AND_CURRICULUM",
    });
  }

  const sources =
    built.authorizationBySelectionKey.get(
      selectionKey(classroom.classroomId, subject.curriculumSubjectId),
    ) ?? [];
  if (!sources.length) {
    fail("TEACHER_SUPERVISORY_OBSERVATION_ASSIGNMENT_PROVENANCE_MISSING", 409);
  }

  const sourceKinds = new Set(sources.map((source) => source.source));
  const source = sourceKinds.has("TEACHER_ASSESSMENT_ASSIGNMENT")
    ? "TEACHER_ASSESSMENT_ASSIGNMENT"
    : sourceKinds.has("TEACHER_PROFILE_JHS_ASSIGNMENT")
      ? "TEACHER_PROFILE_JHS_ASSIGNMENT"
      : "TEACHER_PROFILE_PRIMARY_CLASSROOM";

  return {
    schemaVersion: 1,
    classroomId: classroom.classroomId,
    classTaught: classroom.classTaught,
    phase: classroom.phase,
    level: classroom.level,
    curriculumSubjectId: subject.curriculumSubjectId,
    subjectBeingObserved: subject.subject,
    curriculumSubStrandId: subStrand.curriculumSubStrandId,
    subStrand: subStrand.title,
    subStrandCode: subStrand.code,
    strandId: subStrand.strandId,
    strandCode: subStrand.strandCode,
    strandTitle: subStrand.strandTitle,
    authorization: {
      source,
      assignmentIds: [
        ...new Set(
          sources
            .map((candidate) => candidate.assignmentId)
            .filter((value): value is string => Boolean(value)),
        ),
      ].sort(),
      assignmentKinds: [
        ...new Set(
          sources
            .map((candidate) => candidate.assignmentKind)
            .filter(
              (
                value,
              ): value is "CLASS_ALL_SUBJECTS" | "SUBJECT" =>
                value === "CLASS_ALL_SUBJECTS" || value === "SUBJECT",
            ),
        ),
      ].sort(),
      teacherProfileId:
        sources.find((candidate) => candidate.teacherProfileId)
          ?.teacherProfileId ?? null,
    },
  };
}
