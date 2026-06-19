//src/lib/assessments/teacherAssignmentSync.ts
import type { Prisma, TeacherPhase } from "@prisma/client";
import { normalizeTeacherClassLevel } from "@/lib/teacherScope";

type TxClient = Prisma.TransactionClient;

type JhsAssignmentInput = {
  subject: string;
  classes: string[];
};

type SyncTeacherAssessmentAssignmentsArgs = {
  tx: TxClient;
  tenantId: string;
  teacherUserId: string;
  phase: TeacherPhase;
  classLevel?: string | null;
  primaryClassroomId?: string | null;
  jhsAssignments?: JhsAssignmentInput[] | null;
  createdByUserId?: string | null;
  reason?: string | null;
};

function clean(v: unknown) {
  return String(v ?? "").trim();
}

function subjectNorm(v: unknown) {
  return clean(v).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function normalizeJhsLevel(raw: unknown) {
  const s = clean(raw).toUpperCase().replace(/\s+/g, " ");

  const m =
    s.match(/^JHS\s*([1-3])$/) ||
    s.match(/^JHS([1-3])$/) ||
    s.match(/^J\.?H\.?S\.?\s*([1-3])$/);

  if (m) return `JHS ${m[1]}`;

  const basic =
    s.match(/^BASIC\s*([7-9])$/) ||
    s.match(/^BASIC([7-9])$/) ||
    s.match(/^B\s*([7-9])$/) ||
    s.match(/^B([7-9])$/);

  if (basic) {
    const n = Number(basic[1]);
    return `JHS ${n - 6}`;
  }

  return "";
}

function uniq(xs: string[]) {
  return Array.from(new Set(xs.map(clean).filter(Boolean)));
}

function normalizeJhsAssignments(
  raw: JhsAssignmentInput[] | null | undefined
): JhsAssignmentInput[] {
  if (!Array.isArray(raw)) return [];

  const rows: JhsAssignmentInput[] = [];

  for (const item of raw) {
    const subject = clean(item?.subject);
    const classes = uniq(
      Array.isArray(item?.classes)
        ? item.classes.map((c) => normalizeJhsLevel(c)).filter(Boolean)
        : []
    );

    if (subject && classes.length) {
      rows.push({ subject, classes });
    }
  }

  const bySubject = new Map<string, Set<string>>();
  const labels = new Map<string, string>();

  for (const row of rows) {
    const key = subjectNorm(row.subject);
    labels.set(key, row.subject);

    const set = bySubject.get(key) ?? new Set<string>();
    row.classes.forEach((level) => set.add(level));
    bySubject.set(key, set);
  }

  return Array.from(bySubject.entries()).map(([key, levels]) => ({
    subject: labels.get(key) ?? key,
    classes: Array.from(levels.values()).sort(),
  }));
}

/**
 * Replaces active assessment assignments for one teacher with the current profile truth.
 *
 * This does not delete history. It revokes previous active rows, then creates
 * fresh active rows from the current TeacherProfile scope.
 */
export async function replaceTeacherAssessmentAssignmentsForProfile(
  args: SyncTeacherAssessmentAssignmentsArgs
) {
  const {
    tx,
    tenantId,
    teacherUserId,
    phase,
    classLevel,
    primaryClassroomId,
    jhsAssignments,
    createdByUserId,
    reason,
  } = args;

  const now = new Date();

  await tx.teacherAssessmentAssignment.updateMany({
    where: {
      tenantId,
      teacherUserId,
      status: "ACTIVE",
      revokedAt: null,
    },
    data: {
      status: "REVOKED",
      revokedAt: now,
      revokedByUserId: createdByUserId ?? teacherUserId,
      revokeReason:
        reason ??
        "Teacher assessment assignments replaced from current teacher profile scope.",
    },
  });

  if (phase === "KG" || phase === "PRIMARY") {
    const normalizedLevel =
      normalizeTeacherClassLevel(phase, classLevel) ?? clean(classLevel);

    if (!normalizedLevel && !primaryClassroomId) return;

    await tx.teacherAssessmentAssignment.create({
      data: {
        tenantId,
        teacherUserId,
        assignmentKind: "CLASS_ALL_SUBJECTS",
        classroomId: primaryClassroomId || null,
        phase,
        level: primaryClassroomId ? null : normalizedLevel,
        subject: null,
        subjectNorm: null,
        status: "ACTIVE",
        startsAt: now,
        createdByUserId: createdByUserId ?? teacherUserId,
        metadata: {
          source: "TEACHER_PROFILE_SCOPE",
          phase,
          classLevel: normalizedLevel || null,
          primaryClassroomId: primaryClassroomId || null,
        },
      },
    });

    return;
  }

  if (phase === "JHS") {
    const normalizedAssignments = normalizeJhsAssignments(jhsAssignments);

    for (const assignment of normalizedAssignments) {
      for (const level of assignment.classes) {
        await tx.teacherAssessmentAssignment.create({
          data: {
            tenantId,
            teacherUserId,
            assignmentKind: "SUBJECT",
            classroomId: null,
            phase: "JHS",
            level,
            subject: assignment.subject,
            subjectNorm: subjectNorm(assignment.subject),
            status: "ACTIVE",
            startsAt: now,
            createdByUserId: createdByUserId ?? teacherUserId,
            metadata: {
              source: "TEACHER_PROFILE_SCOPE",
              phase: "JHS",
              level,
              subject: assignment.subject,
            },
          },
        });
      }
    }
  }
}