//src/lib/teacherAccess.ts
import { prisma } from "@/lib/prisma";

type ClassroomLite = {
  id: string;
  name: string;
  grade: string | null;
  arm: string | null;
};

type ClassroomScopeSource =
  | "ADMIN"
  | "STRUCTURED_CLASS_ALL_SUBJECTS"
  | "STRUCTURED_SUBJECT_ASSIGNMENT"
  | "PRIMARY_CLASSROOM_FALLBACK"
  | "LEVEL_SCOPE"
  | "JHS_ASSIGNMENT";

export type TeacherJhsAssignment = {
  subject: string;
  classes: string[];
};

type StructuredAssignmentLite = {
  assignmentKind: string;
  classroomId: string | null;
  phase: string | null;
  level: string | null;
  subject: string | null;
  subjectNorm: string | null;
};

type TeacherProfileAccessLite = {
  phase: string | null;
  classLevel: string | null;
  jhsAssignments: unknown;
  primaryClassroomId: string | null;
} | null;

type LegacyScopeResult = {
  allSubjects: boolean;
  subjects: string[];
  source: ClassroomScopeSource;
};

export type ClassroomAccessResult =
  | {
      ok: true;
      classroom: ClassroomLite;
      normalizedClassLevel: string | null;
      allowedSubjects: string[] | null;
      scopeSource: ClassroomScopeSource;
    }
  | {
      ok: false;
      classroom: null;
      normalizedClassLevel: string | null;
      allowedSubjects: null;
      reason:
        | "CLASSROOM_NOT_FOUND"
        | "NO_TEACHER_PROFILE"
        | "OUT_OF_SCOPE"
        | "SUBJECT_OUT_OF_SCOPE";
    };

function clean(v: unknown) {
  return String(v ?? "").trim();
}

function uniq(xs: string[]) {
  return Array.from(new Set(xs.map((x) => clean(x)).filter(Boolean)));
}

function compact(raw: unknown) {
  return clean(raw).replace(/\s+/g, " ").trim();
}

function compactAlphaNum(raw: unknown) {
  return clean(raw).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function subjectEquals(a: unknown, b: unknown) {
  return compactAlphaNum(a) === compactAlphaNum(b);
}

function subjectNorm(v: unknown) {
  return compactAlphaNum(v);
}

export function isAdminLikeRole(roleName: string | null | undefined) {
  const r = String(roleName ?? "").toUpperCase().trim();
  return (
    r === "ADMIN" ||
    r === "SCHOOL_ADMIN" ||
    r === "HEADTEACHER" ||
    r === "SUPERADMIN"
  );
}

/**
 * Canonical school-level normalizer.
 *
 * Outputs:
 * - KG1 / KG2
 * - Basic 1 ... Basic 6
 * - JHS 1 / JHS 2 / JHS 3
 */
export function normalizeSchoolLevel(raw: unknown): string {
  const s = compact(raw);
  if (!s) return "";

  let m =
    s.match(/^KG\s*([12])([A-Z])?$/i) ||
    s.match(/^KG([12])([A-Z])?$/i) ||
    s.match(/^K\.?G\.?\s*([12])([A-Z])?$/i);
  if (m) return `KG${m[1]}`;

  m =
    s.match(/^JHS\s*([1-3])([A-Z])?$/i) ||
    s.match(/^JHS([1-3])([A-Z])?$/i) ||
    s.match(/^J\.?H\.?S\.?\s*([1-3])([A-Z])?$/i);
  if (m) return `JHS ${m[1]}`;

  m =
    s.match(/^BASIC\s*([7-9])([A-Z])?$/i) ||
    s.match(/^BASIC([7-9])([A-Z])?$/i) ||
    s.match(/^B\s*([7-9])([A-Z])?$/i) ||
    s.match(/^B([7-9])([A-Z])?$/i) ||
    s.match(/^BS\s*([7-9])([A-Z])?$/i) ||
    s.match(/^BS([7-9])([A-Z])?$/i);
  if (m) {
    const basic = Number(m[1]);
    const jhs = basic - 6;
    if (jhs >= 1 && jhs <= 3) return `JHS ${jhs}`;
  }

  m =
    s.match(/^BASIC\s*([1-6])([A-Z])?$/i) ||
    s.match(/^BASIC([1-6])([A-Z])?$/i) ||
    s.match(/^B\s*([1-6])([A-Z])?$/i) ||
    s.match(/^B([1-6])([A-Z])?$/i) ||
    s.match(/^PRIMARY\s*([1-6])([A-Z])?$/i) ||
    s.match(/^PRIMARY([1-6])([A-Z])?$/i) ||
    s.match(/^P\s*([1-6])([A-Z])?$/i) ||
    s.match(/^P([1-6])([A-Z])?$/i);
  if (m) return `Basic ${m[1]}`;

  return s;
}

function phaseFromLevel(level: string | null): "KG" | "PRIMARY" | "JHS" | null {
  if (!level) return null;
  if (/^KG[12]$/i.test(level)) return "KG";
  if (/^Basic [1-6]$/i.test(level)) return "PRIMARY";
  if (/^JHS [1-3]$/i.test(level)) return "JHS";
  return null;
}

function levelCandidatesFromRaw(raw: unknown): string[] {
  const s = clean(raw);
  if (!s) return [];

  const out = new Set<string>();

  const direct = normalizeSchoolLevel(s);
  if (direct) out.add(direct);

  const noSpaces = normalizeSchoolLevel(s.replace(/\s+/g, ""));
  if (noSpaces) out.add(noSpaces);

  const dePunct = normalizeSchoolLevel(s.replace(/[-_.]/g, " "));
  if (dePunct) out.add(dePunct);

  return Array.from(out.values()).filter(Boolean);
}

function classroomLevelCandidates(classroom: ClassroomLite): string[] {
  return uniq([
    ...levelCandidatesFromRaw(classroom.grade),
    ...levelCandidatesFromRaw(classroom.name),
  ]);
}

function coerceAssignments(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;

  if (typeof raw === "string") {
    const s = raw.trim();
    if (!s) return [];
    try {
      const parsed: unknown = JSON.parse(s);
      return coerceAssignments(parsed);
    } catch {
      return [];
    }
  }

  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.jhsAssignments)) return obj.jhsAssignments;
    if (Array.isArray(obj.assignments)) return obj.assignments;
  }

  return [];
}

function normalizeJhsClass(raw: unknown): string {
  const n = normalizeSchoolLevel(raw);
  return /^JHS [1-3]$/i.test(n) ? n : "";
}

export function parseTeacherJhsAssignments(raw: unknown): TeacherJhsAssignment[] {
  const rows = coerceAssignments(raw);
  if (!rows.length) return [];

  const out: TeacherJhsAssignment[] = [];

  for (const row of rows) {
    if (!row || typeof row !== "object") continue;

    const r = row as Record<string, unknown>;
    const subject = compact(r.subject);
    const classesRaw = Array.isArray(r.classes) ? r.classes : [];

    const classes = uniq(
      classesRaw.map((c) => normalizeJhsClass(c)).filter(Boolean)
    );

    if (subject && classes.length) {
      out.push({ subject, classes });
    }
  }

  const by = new Map<string, Set<string>>();
  const subjectLabel = new Map<string, string>();

  for (const a of out) {
    const key = subjectNorm(a.subject);
    subjectLabel.set(key, a.subject);

    const set = by.get(key) ?? new Set<string>();
    a.classes.forEach((c) => set.add(c));
    by.set(key, set);
  }

  return Array.from(by.entries()).map(([k, set]) => ({
    subject: subjectLabel.get(k) ?? k,
    classes: Array.from(set.values()).sort(),
  }));
}

function matchingJhsSubjects(
  assignments: TeacherJhsAssignment[],
  classroomCandidates: string[]
) {
  const candidates = new Set(
    classroomCandidates.map((x) => normalizeSchoolLevel(x)).filter(Boolean)
  );

  const out: string[] = [];

  for (const a of assignments) {
    const hit = a.classes.some((c) => candidates.has(normalizeSchoolLevel(c)));
    if (hit) out.push(a.subject);
  }

  return uniq(out);
}

async function loadStructuredAssignments(args: {
  tenantId: string;
  userId: string;
}): Promise<StructuredAssignmentLite[]> {
  const now = new Date();

  return prisma.teacherAssessmentAssignment.findMany({
    where: {
      tenantId: args.tenantId,
      teacherUserId: args.userId,
      status: "ACTIVE",
      revokedAt: null,
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
      ],
    },
    select: {
      assignmentKind: true,
      classroomId: true,
      phase: true,
      level: true,
      subject: true,
      subjectNorm: true,
    },
  });
}

function assignmentMatchesClass(
  assignment: StructuredAssignmentLite,
  classroom: ClassroomLite
) {
  if (assignment.classroomId) {
    return assignment.classroomId === classroom.id;
  }

  const candidates = classroomLevelCandidates(classroom);
  const firstLevel = candidates[0] ?? "";
  const classPhase = phaseFromLevel(firstLevel);

  if (assignment.level) {
    const normalizedAssignmentLevel = normalizeSchoolLevel(assignment.level);
    if (candidates.includes(normalizedAssignmentLevel)) return true;
  }

  if (assignment.phase && classPhase) {
    if (clean(assignment.phase).toUpperCase() === classPhase) return true;
  }

  return false;
}

function structuredSubjectsForClass(
  assignments: StructuredAssignmentLite[],
  classroom: ClassroomLite
): { allSubjects: boolean; subjects: string[] } {
  const matched = assignments.filter((assignment) =>
    assignmentMatchesClass(assignment, classroom)
  );

  if (
    matched.some(
      (assignment) =>
        clean(assignment.assignmentKind).toUpperCase() === "CLASS_ALL_SUBJECTS"
    )
  ) {
    return { allSubjects: true, subjects: [] };
  }

  const subjects = matched
    .filter(
      (assignment) =>
        clean(assignment.assignmentKind).toUpperCase() === "SUBJECT"
    )
    .map((assignment) => clean(assignment.subject))
    .filter(Boolean);

  return { allSubjects: false, subjects: uniq(subjects) };
}

async function loadTeacherProfile(args: {
  tenantId: string;
  userId: string;
}): Promise<TeacherProfileAccessLite> {
  return prisma.teacherProfile.findUnique({
    where: {
      teacherProfile_tenant_user_unique: {
        tenantId: args.tenantId,
        userId: args.userId,
      },
    },
    select: {
      phase: true,
      classLevel: true,
      jhsAssignments: true,
      primaryClassroomId: true,
    },
  });
}

function legacyAccessForProfile(args: {
  profile: TeacherProfileAccessLite;
  classroom: ClassroomLite;
  classCandidates: string[];
}): LegacyScopeResult | null {
  const tp = args.profile;
  if (!tp) return null;

  const phase = clean(tp.phase).toUpperCase();

  if (phase === "JHS") {
    const assignments = parseTeacherJhsAssignments(tp.jhsAssignments);
    const subjects = matchingJhsSubjects(assignments, args.classCandidates);

    if (!subjects.length) return null;

    return {
      allSubjects: false,
      subjects,
      source: "JHS_ASSIGNMENT",
    };
  }

  const teacherLevel = normalizeSchoolLevel(tp.classLevel);

  if (teacherLevel && args.classCandidates.includes(teacherLevel)) {
    return {
      allSubjects: true,
      subjects: [],
      source: "LEVEL_SCOPE",
    };
  }

  if (tp.primaryClassroomId && tp.primaryClassroomId === args.classroom.id) {
    return {
      allSubjects: true,
      subjects: [],
      source: "PRIMARY_CLASSROOM_FALLBACK",
    };
  }

  return null;
}

function uniqueClassrooms(list: ClassroomLite[]) {
  const seen = new Set<string>();
  const out: ClassroomLite[] = [];

  for (const c of list) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    out.push(c);
  }

  return out;
}

export async function listUserAccessibleClassrooms(args: {
  tenantId: string;
  userId: string;
  roleName?: string | null;
}): Promise<ClassroomLite[]> {
  const classrooms = await prisma.classroom.findMany({
    where: { tenantId: args.tenantId, status: "ACTIVE" },
    select: { id: true, name: true, grade: true, arm: true },
    orderBy: [{ grade: "asc" }, { name: "asc" }, { arm: "asc" }],
  });

  if (isAdminLikeRole(args.roleName)) return classrooms;

  const [structured, tp] = await Promise.all([
    loadStructuredAssignments({ tenantId: args.tenantId, userId: args.userId }),
    loadTeacherProfile({ tenantId: args.tenantId, userId: args.userId }),
  ]);

  const structuredClasses = classrooms.filter((c) =>
    structured.some((assignment) => assignmentMatchesClass(assignment, c))
  );

  const legacyClasses: ClassroomLite[] = [];

  if (tp) {
    for (const c of classrooms) {
      const classCandidates = classroomLevelCandidates(c);
      const legacy = legacyAccessForProfile({
        profile: tp,
        classroom: c,
        classCandidates,
      });

      if (legacy) legacyClasses.push(c);
    }
  }

  return uniqueClassrooms([...structuredClasses, ...legacyClasses]);
}

export async function resolveUserClassroomAccess(args: {
  tenantId: string;
  userId: string;
  roleName?: string | null;
  classroomId: string;
  subject?: string | null;
}): Promise<ClassroomAccessResult> {
  const classroom = await prisma.classroom.findFirst({
    where: {
      id: args.classroomId,
      tenantId: args.tenantId,
      status: "ACTIVE",
    },
    select: {
      id: true,
      name: true,
      grade: true,
      arm: true,
    },
  });

  if (!classroom) {
    return {
      ok: false,
      classroom: null,
      normalizedClassLevel: null,
      allowedSubjects: null,
      reason: "CLASSROOM_NOT_FOUND",
    };
  }

  const classCandidates = classroomLevelCandidates(classroom);
  const normalizedClassLevel = classCandidates[0] ?? null;

  if (isAdminLikeRole(args.roleName)) {
    return {
      ok: true,
      classroom,
      normalizedClassLevel,
      allowedSubjects: null,
      scopeSource: "ADMIN",
    };
  }

  const [structured, tp] = await Promise.all([
    loadStructuredAssignments({ tenantId: args.tenantId, userId: args.userId }),
    loadTeacherProfile({ tenantId: args.tenantId, userId: args.userId }),
  ]);

  if (!tp && structured.length === 0) {
    return {
      ok: false,
      classroom: null,
      normalizedClassLevel,
      allowedSubjects: null,
      reason: "NO_TEACHER_PROFILE",
    };
  }

  const requestedSubject = clean(args.subject);

  const structuredScope = structuredSubjectsForClass(structured, classroom);
  const legacyScope = legacyAccessForProfile({
    profile: tp,
    classroom,
    classCandidates,
  });

  if (structuredScope.allSubjects) {
    return {
      ok: true,
      classroom,
      normalizedClassLevel,
      allowedSubjects: null,
      scopeSource: "STRUCTURED_CLASS_ALL_SUBJECTS",
    };
  }

  if (legacyScope?.allSubjects) {
    return {
      ok: true,
      classroom,
      normalizedClassLevel,
      allowedSubjects: null,
      scopeSource: legacyScope.source,
    };
  }

  const allowedSubjects = uniq([
    ...structuredScope.subjects,
    ...(legacyScope?.subjects ?? []),
  ]);

  if (allowedSubjects.length > 0) {
    if (
      requestedSubject &&
      !allowedSubjects.some((s) => subjectEquals(s, requestedSubject))
    ) {
      return {
        ok: false,
        classroom: null,
        normalizedClassLevel,
        allowedSubjects: null,
        reason: "SUBJECT_OUT_OF_SCOPE",
      };
    }

    return {
      ok: true,
      classroom,
      normalizedClassLevel,
      allowedSubjects,
      scopeSource:
        structuredScope.subjects.length > 0
          ? "STRUCTURED_SUBJECT_ASSIGNMENT"
          : "JHS_ASSIGNMENT",
    };
  }

  return {
    ok: false,
    classroom: null,
    normalizedClassLevel,
    allowedSubjects: null,
    reason: "OUT_OF_SCOPE",
  };
}