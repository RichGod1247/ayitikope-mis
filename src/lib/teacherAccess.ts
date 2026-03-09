//src/lib/teacherAccess.ts
import { prisma } from "@/lib/prisma";

type ClassroomLite = {
  id: string;
  name: string;
  grade: string | null;
  arm: string | null;
};

export type TeacherJhsAssignment = {
  subject: string;
  classes: string[];
};

export type ClassroomAccessResult =
  | {
      ok: true;
      classroom: ClassroomLite;
      normalizedClassLevel: string | null;
      allowedSubjects: string[] | null; // null => all subjects allowed
      scopeSource:
        | "ADMIN"
        | "PRIMARY_CLASSROOM_FALLBACK"
        | "LEVEL_SCOPE"
        | "JHS_ASSIGNMENT";
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

function compact(s: string) {
  return clean(s).replace(/\s+/g, " ").trim();
}

function compactAlphaNum(s: string) {
  return clean(s).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function subjectEquals(a: unknown, b: unknown) {
  return compactAlphaNum(String(a ?? "")) === compactAlphaNum(String(b ?? ""));
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
 * - JHS 1 / JHS 2 / JHS 3   (IMPORTANT: Basic 7/8/9 map here)
 */
export function normalizeSchoolLevel(raw: unknown): string {
  const s = compact(String(raw ?? ""));
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
    const jhs = basic - 6; // 7->1, 8->2, 9->3
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

function coerceAssignments(raw: unknown): any[] {
  if (Array.isArray(raw)) return raw;

  if (typeof raw === "string") {
    const s = raw.trim();
    if (!s) return [];
    try {
      const parsed = JSON.parse(s);
      return coerceAssignments(parsed);
    } catch {
      return [];
    }
  }

  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.jhsAssignments)) return obj.jhsAssignments as any[];
    if (Array.isArray(obj.assignments)) return obj.assignments as any[];
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
    const r = row as any;

    const subject = compact(r.subject);
    const classesRaw = Array.isArray(r.classes) ? r.classes : [];
    const classes = uniq(
      classesRaw.map((c: unknown) => normalizeJhsClass(c)).filter(Boolean)
    );

    if (subject && classes.length) {
      out.push({ subject, classes });
    }
  }

  const by = new Map<string, Set<string>>();
  const subjectLabel = new Map<string, string>();

  for (const a of out) {
    const key = compactAlphaNum(a.subject);
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
    const hit = a.classes.some((c) =>
      candidates.has(normalizeSchoolLevel(c))
    );
    if (hit) out.push(a.subject);
  }

  return uniq(out);
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

  const tp = await prisma.teacherProfile.findUnique({
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

  if (!tp) return [];

  if (String(tp.phase).toUpperCase() === "JHS") {
    const assignments = parseTeacherJhsAssignments(tp.jhsAssignments);
    const allowedLevels = new Set(
      assignments.flatMap((a) =>
        a.classes.map((c) => normalizeSchoolLevel(c))
      )
    );

    return classrooms.filter((c) =>
      classroomLevelCandidates(c).some((lv) =>
        allowedLevels.has(normalizeSchoolLevel(lv))
      )
    );
  }

  const teacherLevel = normalizeSchoolLevel(tp.classLevel);
  if (teacherLevel) {
    const matched = classrooms.filter((c) =>
      classroomLevelCandidates(c).includes(teacherLevel)
    );
    if (matched.length) return matched;
  }

  if (tp.primaryClassroomId) {
    return classrooms.filter((c) => c.id === tp.primaryClassroomId);
  }

  return [];
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

  const tp = await prisma.teacherProfile.findUnique({
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

  if (!tp) {
    return {
      ok: false,
      classroom: null,
      normalizedClassLevel,
      allowedSubjects: null,
      reason: "NO_TEACHER_PROFILE",
    };
  }

  const phase = clean(tp.phase).toUpperCase();
  const requestedSubject = clean(args.subject);

  // JHS = subject teacher. Primary classroom is NOT the access gate.
  if (phase === "JHS") {
    const assignments = parseTeacherJhsAssignments(tp.jhsAssignments);
    const allowedSubjects = matchingJhsSubjects(assignments, classCandidates);

    if (!allowedSubjects.length) {
      return {
        ok: false,
        classroom: null,
        normalizedClassLevel,
        allowedSubjects: null,
        reason: "OUT_OF_SCOPE",
      };
    }

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
      scopeSource: "JHS_ASSIGNMENT",
    };
  }

  // KG / PRIMARY = class teacher. All subjects allowed in that class level.
  const teacherLevel = normalizeSchoolLevel(tp.classLevel);

  if (teacherLevel && classCandidates.includes(teacherLevel)) {
    return {
      ok: true,
      classroom,
      normalizedClassLevel,
      allowedSubjects: null,
      scopeSource: "LEVEL_SCOPE",
    };
  }

  // Fallback only for older KG/PRIMARY data that may still rely on a primary classroom.
  if (tp.primaryClassroomId && tp.primaryClassroomId === args.classroomId) {
    return {
      ok: true,
      classroom,
      normalizedClassLevel,
      allowedSubjects: null,
      scopeSource: "PRIMARY_CLASSROOM_FALLBACK",
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