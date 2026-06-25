//src/app/api/headteacher/assessment/mock/reminders/send/route.ts
import { NextRequest, NextResponse } from "next/server";
import {
  GovernanceInterventionPriority,
  GovernanceOfficialNoticeChannel,
  GovernanceOfficialNoticeDeliveryStatus,
  GovernanceOfficialNoticeRecipientType,
  GovernanceOfficialNoticeStatus,
  Prisma,
  TeacherAssessmentAssignmentKind,
  TeacherAssessmentAssignmentStatus,
  TeacherPhase,
} from "@prisma/client";
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import { writeAuditLog } from "@/lib/audit";
import { resolveUserClassroomAccess } from "@/lib/teacherAccess";
import {
  canonicalMockSubject,
  cleanMockStr,
  isJhs3MockClassroom,
  mockSubjectLabel,
} from "@/lib/assessments/mock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ReminderActionCode =
  | "NOTIFY_MISSING_CORE_SUBJECT_TEACHERS"
  | "NOTIFY_ELECTIVE_TEACHERS_TO_OPEN_COLUMNS"
  | "REMIND_EMPTY_SUBJECT_SCORE_ENTRY"
  | "REMIND_PARTIAL_SUBJECT_SCORE_COMPLETION";

type ReminderBody = {
  sessionId?: unknown;
  actionCode?: unknown;
  subject?: unknown;
  deadline?: unknown;
  note?: unknown;
  allowDuplicate?: unknown;
};

type RecipientTeacher = {
  id: string;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
};

function json(status: number, payload: unknown) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function ipFrom(req: NextRequest) {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null
  );
}

function upper(value: unknown) {
  return cleanMockStr(value).toUpperCase();
}

function normalizeKey(value: unknown) {
  return upper(value).replace(/[^A-Z0-9]/g, "");
}

function boolish(value: unknown) {
  const v = upper(value);
  return v === "1" || v === "TRUE" || v === "YES";
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function safeJson(value: unknown, fallback: unknown = {}) {
  try {
    return JSON.parse(JSON.stringify(value ?? fallback)) as Prisma.InputJsonValue;
  } catch {
    return JSON.parse(JSON.stringify(fallback)) as Prisma.InputJsonValue;
  }
}

function displayName(user: RecipientTeacher) {
  const name = cleanMockStr(user.name);
  if (name) return name;

  const full = `${cleanMockStr(user.firstName)} ${cleanMockStr(user.lastName)}`.trim();
  if (full) return full;

  return cleanMockStr(user.email) || "Teacher";
}

function normalizeDeadline(value: unknown) {
  const raw = cleanMockStr(value);
  if (!raw) return null;

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;

  return date;
}

function deadlineLabel(value: Date | null) {
  if (!value) return "as soon as possible";

  return value.toLocaleDateString("en-GB", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

function priorityForAction(actionCode: ReminderActionCode) {
  if (actionCode === "NOTIFY_MISSING_CORE_SUBJECT_TEACHERS") {
    return GovernanceInterventionPriority.CRITICAL;
  }

  if (
    actionCode === "NOTIFY_ELECTIVE_TEACHERS_TO_OPEN_COLUMNS" ||
    actionCode === "REMIND_EMPTY_SUBJECT_SCORE_ENTRY"
  ) {
    return GovernanceInterventionPriority.HIGH;
  }

  return GovernanceInterventionPriority.MEDIUM;
}

function assertReminderActionCode(value: unknown): ReminderActionCode {
  const code = upper(value);

  const allowed: ReminderActionCode[] = [
    "NOTIFY_MISSING_CORE_SUBJECT_TEACHERS",
    "NOTIFY_ELECTIVE_TEACHERS_TO_OPEN_COLUMNS",
    "REMIND_EMPTY_SUBJECT_SCORE_ENTRY",
    "REMIND_PARTIAL_SUBJECT_SCORE_COMPLETION",
  ];

  if (!allowed.includes(code as ReminderActionCode)) {
    throw new Error("INVALID_MOCK_REMINDER_ACTION_CODE");
  }

  return code as ReminderActionCode;
}

function teacherMockHref(args: {
  sessionId: string;
  itemId?: string | null;
  subject?: string | null;
}) {
  const params = new URLSearchParams();

  params.set("sessionId", args.sessionId);

  if (args.itemId) params.set("itemId", args.itemId);
  if (cleanMockStr(args.subject)) params.set("subject", cleanMockStr(args.subject));

  return `/teacher/assessment/mock?${params.toString()}`;
}

function buildNoticeTitle(args: {
  actionCode: ReminderActionCode;
  subjectLabel: string | null;
  mockLabel: string;
}) {
  if (args.actionCode === "NOTIFY_MISSING_CORE_SUBJECT_TEACHERS") {
    return `BECE Mock action required: open ${args.subjectLabel ?? "core subject"} column`;
  }

  if (args.actionCode === "NOTIFY_ELECTIVE_TEACHERS_TO_OPEN_COLUMNS") {
    return `BECE Mock action required: open ${args.subjectLabel ?? "elective"} column`;
  }

  if (args.actionCode === "REMIND_EMPTY_SUBJECT_SCORE_ENTRY") {
    return `BECE Mock scores required: ${args.subjectLabel ?? "subject"}`;
  }

  return `BECE Mock score completion required: ${args.subjectLabel ?? "subject"}`;
}

function buildNoticeBody(args: {
  actionCode: ReminderActionCode;
  subjectLabel: string | null;
  mockTitle: string;
  classroomLabel: string;
  deadline: Date | null;
  teacherHref: string;
  note: string | null;
  scoredCount: number | null;
  missingCount: number | null;
  totalStudents: number;
}) {
  const deadlineText = deadlineLabel(args.deadline);

  const lines = [
    `This is an EduLife OS BECE Mock accountability reminder from the headteacher.`,
    ``,
    `Mock: ${args.mockTitle}`,
    `Class: ${args.classroomLabel}`,
    args.subjectLabel ? `Subject: ${args.subjectLabel}` : null,
    `Deadline: ${deadlineText}`,
    ``,
  ].filter((line): line is string => line !== null);

  if (
    args.actionCode === "NOTIFY_MISSING_CORE_SUBJECT_TEACHERS" ||
    args.actionCode === "NOTIFY_ELECTIVE_TEACHERS_TO_OPEN_COLUMNS"
  ) {
    lines.push(
      `Required action: open your assigned Mock subject column in the teacher Mock cockpit.`,
      `Why: the headteacher overview cannot calculate reliable BECE readiness while this subject column is missing.`
    );
  } else if (args.actionCode === "REMIND_EMPTY_SUBJECT_SCORE_ENTRY") {
    lines.push(
      `Required action: enter Mock scores for your assigned subject.`,
      `Current evidence: 0/${args.totalStudents} learner scores entered.`
    );
  } else {
    lines.push(
      `Required action: complete remaining Mock scores for your assigned subject.`,
      `Current evidence: ${args.scoredCount ?? 0}/${args.totalStudents} learner scores entered; ${args.missingCount ?? 0} still missing.`
    );
  }

  lines.push(
    ``,
    `Teacher cockpit: ${args.teacherHref}`,
    ``,
    `Accountability rule: the subject teacher owns this evidence. Headteacher direct entry is a last resort only when the assigned teacher is absent, indisposed, or formally delegated.`
  );

  if (args.note) {
    lines.push(``, `Headteacher note: ${args.note}`);
  }

  return lines.join("\n");
}

function classroomLabel(classroom: {
  name: string | null;
  grade: string | null;
  arm: string | null;
}) {
  const name = cleanMockStr(classroom.name) || "Classroom";
  const grade = cleanMockStr(classroom.grade);
  const arm = cleanMockStr(classroom.arm);

  if (grade && arm) return `${name} (${grade} ${arm})`;
  if (grade) return `${name} (${grade})`;
  return name;
}

async function resolveSubjectItem(args: {
  tenantId: string;
  sessionId: string;
  subject: string | null;
}) {
  if (!args.subject) return null;

  return prisma.assessmentItem.findFirst({
    where: {
      tenantId: args.tenantId,
      mockExamSessionId: args.sessionId,
      type: "MOCK",
      subject: {
        equals: args.subject,
        mode: "insensitive",
      },
    },
    select: {
      id: true,
      subject: true,
      scores: {
        select: {
          studentId: true,
        },
      },
    },
  });
}

function isJhs3AssignmentLevel(value: unknown) {
  const key = normalizeKey(value);
  return key === "JHS3" || key === "BASIC9" || key === "B9";
}

function isTeacherRole(value: unknown) {
  return normalizeKey(value) === "TEACHER";
}

async function resolveAssignedTeachers(args: {
  tenantId: string;
  classroomId: string;
  subject: string | null;
}) {
  const subjectNorm = args.subject ? normalizeKey(args.subject) : "";

  if (!subjectNorm) return [];

  const targetClassroom = await prisma.classroom.findFirst({
    where: {
      id: args.classroomId,
      tenantId: args.tenantId,
    },
    select: {
      id: true,
      name: true,
      grade: true,
      arm: true,
      status: true,
    },
  });

  if (!targetClassroom) return [];

  const now = new Date();
  const targetIsSingleStream = !cleanMockStr(targetClassroom.arm);
  const deduped = new Map<string, RecipientTeacher>();

  // 1) Structured assignment path.
  // This keeps the future bank-grade assignment spine working.
  const structuredRows = await prisma.teacherAssessmentAssignment.findMany({
    where: {
      tenantId: args.tenantId,
      status: TeacherAssessmentAssignmentStatus.ACTIVE,
      revokedAt: null,
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
      ],
      OR: [
        {
          assignmentKind: TeacherAssessmentAssignmentKind.CLASS_ALL_SUBJECTS,
          classroomId: args.classroomId,
        },
        {
          assignmentKind: TeacherAssessmentAssignmentKind.SUBJECT,
          OR: [
            {
              subjectNorm,
            },
            {
              subject: {
                equals: args.subject,
                mode: "insensitive",
              },
            },
          ],
        },
      ],
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      assignmentKind: true,
      classroomId: true,
      phase: true,
      level: true,
      subject: true,
      subjectNorm: true,
      classroom: {
        select: {
          id: true,
          name: true,
          grade: true,
          arm: true,
          status: true,
        },
      },
      teacher: {
        select: {
          id: true,
          name: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
        },
      },
    },
  });

  for (const row of structuredRows) {
    if (row.assignmentKind === TeacherAssessmentAssignmentKind.CLASS_ALL_SUBJECTS) {
      if (row.classroomId === args.classroomId) {
        deduped.set(row.teacher.id, row.teacher);
      }

      continue;
    }

    const rowSubjectNorm = normalizeKey(row.subjectNorm || row.subject);

    if (rowSubjectNorm !== subjectNorm) {
      continue;
    }

    // Best case: subject assignment is attached directly to the selected classroom.
    if (row.classroomId === args.classroomId) {
      deduped.set(row.teacher.id, row.teacher);
      continue;
    }

    // Good case: JHS3 subject assignment is phase/level scoped rather than class scoped.
    if (!row.classroomId) {
      const isJhsPhase = row.phase === TeacherPhase.JHS;
      const isJhs3Level = !cleanMockStr(row.level) || isJhs3AssignmentLevel(row.level);

      if (isJhsPhase && isJhs3Level) {
        deduped.set(row.teacher.id, row.teacher);
      }

      continue;
    }

    // Compatibility bridge:
    // The populated single-stream JHS3 class may differ from older seeded JHS3 arm records.
    if (
      targetIsSingleStream &&
      row.classroom &&
      isJhs3MockClassroom(row.classroom)
    ) {
      deduped.set(row.teacher.id, row.teacher);
      continue;
    }
  }

  // 2) Existing teacher-access spine fallback.
  // This is the important fix:
  // teacherAccess.ts already knows how to read both structured assignments
  // and legacy TeacherProfile.jhsAssignments. The teacher Mock cockpit relies
  // on that access behavior, so reminder ownership must reuse it.
  const memberships = await prisma.membership.findMany({
    where: {
      tenantId: args.tenantId,
      status: "ACTIVE",
    },
    select: {
      role: {
        select: {
          name: true,
        },
      },
      user: {
        select: {
          id: true,
          name: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
        },
      },
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  const teacherMemberships = memberships.filter((membership) =>
    isTeacherRole(membership.role?.name)
  );

  const accessChecks = await Promise.all(
    teacherMemberships.map(async (membership) => {
      const access = await resolveUserClassroomAccess({
        tenantId: args.tenantId,
        userId: membership.user.id,
        roleName: membership.role?.name ?? null,
        classroomId: args.classroomId,
        subject: args.subject,
      });

      return {
        teacher: membership.user,
        access,
      };
    })
  );

  for (const check of accessChecks) {
    if (check.access.ok) {
      deduped.set(check.teacher.id, check.teacher);
    }
  }

  return Array.from(deduped.values());
}

async function createInAppMockReminder(args: {
  tenantId: string;
  senderUserId: string;
  recipients: RecipientTeacher[];
  title: string;
  body: string;
  priority: GovernanceInterventionPriority;
  idempotencyKey: string | null;
  idempotencyScope: string;
  metadata: Prisma.InputJsonValue;
}) {
  const channels = [GovernanceOfficialNoticeChannel.IN_APP];

  const created = await prisma.$transaction(async (tx) => {
    if (args.idempotencyKey) {
      const existing = await tx.governanceOfficialNotice.findUnique({
        where: { idempotencyKey: args.idempotencyKey },
        select: {
          id: true,
          title: true,
          status: true,
          idempotencyKey: true,
          idempotencyScope: true,
          createdAt: true,
          recipients: {
            select: {
              id: true,
              recipientUserId: true,
              displayName: true,
              readAt: true,
              acknowledgedAt: true,
            },
          },
        },
      });

      if (existing) {
        return {
          notice: existing,
          reused: true,
        };
      }
    }

    const notice = await tx.governanceOfficialNotice.create({
      data: {
        tenantId: args.tenantId,
        senderUserId: args.senderUserId,
        title: args.title,
        body: args.body,
        priority: args.priority,
        status: GovernanceOfficialNoticeStatus.SENT,
        channels: safeJson(channels, []),
        audienceSummary: args.recipients
          .map((teacher) => displayName(teacher))
          .join("; "),
        idempotencyKey: args.idempotencyKey,
        idempotencyScope: args.idempotencyKey ? args.idempotencyScope : null,
        metadata: args.metadata,
        sentAt: new Date(),
      },
      select: {
        id: true,
        title: true,
        status: true,
        idempotencyKey: true,
        idempotencyScope: true,
        createdAt: true,
      },
    });

    for (const teacher of args.recipients) {
      const recipient = await tx.governanceOfficialNoticeRecipient.create({
        data: {
          noticeId: notice.id,
          tenantId: args.tenantId,
          recipientUserId: teacher.id,
          recipientType: GovernanceOfficialNoticeRecipientType.TEACHER,
          displayName: displayName(teacher),
          roleLabel: "Teacher",
          phone: teacher.phone,
          email: teacher.email,
          inAppVisible: true,
          metadata: safeJson({
            source: "mock-reminder-recipient",
            teacherUserId: teacher.id,
          }),
        },
        select: {
          id: true,
          recipientUserId: true,
          displayName: true,
          readAt: true,
          acknowledgedAt: true,
        },
      });

      await tx.governanceOfficialNoticeDelivery.create({
        data: {
          noticeId: notice.id,
          recipientId: recipient.id,
          channel: GovernanceOfficialNoticeChannel.IN_APP,
          status: GovernanceOfficialNoticeDeliveryStatus.SENT,
          toAddress: null,
          provider: "EDULIFE_OS",
          providerStatusDescription: "IN_APP_VISIBLE",
          attempts: 1,
          lastAttemptAt: new Date(),
          sentAt: new Date(),
          providerRaw: safeJson({
            source: "headteacher-mock-reminder",
            noticeId: notice.id,
            recipientId: recipient.id,
          }),
        },
      });
    }

    const fresh = await tx.governanceOfficialNotice.findUniqueOrThrow({
      where: { id: notice.id },
      select: {
        id: true,
        title: true,
        status: true,
        idempotencyKey: true,
        idempotencyScope: true,
        createdAt: true,
        recipients: {
          select: {
            id: true,
            recipientUserId: true,
            displayName: true,
            readAt: true,
            acknowledgedAt: true,
          },
        },
      },
    });

    return {
      notice: fresh,
      reused: false,
    };
  });

  return created;
}

export async function POST(req: NextRequest) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["HEADTEACHER", "ADMIN", "SCHOOL_ADMIN", "SUPERADMIN"],
  });

  if (!auth.ok) return auth.res;

  const body = ((await req.json().catch(() => null)) ?? {}) as ReminderBody;

  let actionCode: ReminderActionCode;

  try {
    actionCode = assertReminderActionCode(body.actionCode);
  } catch {
    return json(400, {
      ok: false,
      error: "INVALID_MOCK_REMINDER_ACTION_CODE",
    });
  }

  const sessionId = cleanMockStr(body.sessionId);
  const subjectRaw = cleanMockStr(body.subject);
  const subject = subjectRaw || null;
  const canonicalSubject = subject ? canonicalMockSubject(subject) : null;
  const subjectLabel = canonicalSubject
    ? mockSubjectLabel(canonicalSubject)
    : subject
      ? subject
      : null;
  const deadline = normalizeDeadline(body.deadline);
  const note = cleanMockStr(body.note) || null;
  const allowDuplicate = boolish(body.allowDuplicate);

  if (!sessionId) {
    return json(400, {
      ok: false,
      error: "MOCK_SESSION_ID_REQUIRED",
    });
  }

  if (
    actionCode !== "NOTIFY_ELECTIVE_TEACHERS_TO_OPEN_COLUMNS" &&
    !subject
  ) {
    return json(400, {
      ok: false,
      error: "MOCK_REMINDER_SUBJECT_REQUIRED",
    });
  }

  const session = await prisma.mockExamSession.findFirst({
    where: {
      id: sessionId,
      tenantId: auth.ctx.tenantId,
    },
    select: {
      id: true,
      tenantId: true,
      classroomId: true,
      academicYear: true,
      term: true,
      mockNumber: true,
      mockLabel: true,
      title: true,
      status: true,
      classroom: {
        select: {
          id: true,
          name: true,
          grade: true,
          arm: true,
          status: true,
        },
      },
    },
  });

  if (!session) {
    return json(404, {
      ok: false,
      error: "MOCK_SESSION_NOT_FOUND",
    });
  }

  if (!isJhs3MockClassroom(session.classroom)) {
    return json(400, {
      ok: false,
      error: "MOCK_REMINDERS_ALLOWED_FOR_JHS3_ONLY",
    });
  }

  const item = await resolveSubjectItem({
    tenantId: auth.ctx.tenantId,
    sessionId,
    subject,
  });

  const totalStudents = await prisma.student.count({
    where: {
      tenantId: auth.ctx.tenantId,
      classroomId: session.classroomId,
      status: "ACTIVE",
    },
  });

  const scoredCount = item?.scores.length ?? 0;
  const missingCount = Math.max(0, totalStudents - scoredCount);

  const recipients = await resolveAssignedTeachers({
    tenantId: auth.ctx.tenantId,
    classroomId: session.classroomId,
    subject,
  });

  if (!recipients.length) {
    return json(409, {
      ok: false,
      error: "NO_ASSIGNED_TEACHER_FOUND_FOR_MOCK_REMINDER",
      subject,
      canonicalSubject,
      guidance:
        "Assign the subject to a teacher first, then send the Mock reminder.",
    });
  }

  const teacherHref = teacherMockHref({
    sessionId,
    itemId: item?.id ?? null,
    subject,
  });

  const title = buildNoticeTitle({
    actionCode,
    subjectLabel,
    mockLabel: session.mockLabel,
  });

  const noticeBody = buildNoticeBody({
    actionCode,
    subjectLabel,
    mockTitle: session.title,
    classroomLabel: classroomLabel(session.classroom),
    deadline,
    teacherHref,
    note,
    scoredCount,
    missingCount,
    totalStudents,
  });

  const idempotencyScope = "HEADTEACHER_MOCK_REMINDER";
  const idempotencyKey = allowDuplicate
    ? null
    : `mock-reminder:${sha256(
        JSON.stringify({
          tenantId: auth.ctx.tenantId,
          sessionId,
          actionCode,
          subjectNorm: subject ? normalizeKey(subject) : "",
          deadline: deadline ? deadline.toISOString().slice(0, 10) : "",
          recipients: recipients.map((r) => r.id).sort(),
        })
      )}`.slice(0, 220);

  const priority = priorityForAction(actionCode);

  const result = await createInAppMockReminder({
    tenantId: auth.ctx.tenantId,
    senderUserId: auth.ctx.userId,
    recipients,
    title,
    body: noticeBody,
    priority,
    idempotencyKey,
    idempotencyScope,
    metadata: safeJson({
      source: "HEADTEACHER_MOCK_REMINDER",
      mockReminderVersion: 1,
      noticeKind: "ACKNOWLEDGEMENT_REQUIRED",
      requiresAcknowledgement: true,
      requiresResponse: false,
      actionCode,
      sessionId,
      classroomId: session.classroomId,
      academicYear: session.academicYear,
      term: session.term,
      mockNumber: session.mockNumber,
      mockLabel: session.mockLabel,
      subject,
      canonicalSubject,
      subjectLabel,
      itemId: item?.id ?? null,
      teacherHref,
      deadline: deadline ? deadline.toISOString() : null,
      scoredCount,
      missingCount,
      totalStudents,
      accountabilityRule:
        "Teacher owns Mock evidence. Headteacher reminder is governance. Direct score entry by headteacher is last resort.",
    }),
  });

  await writeAuditLog({
    action: result.reused
      ? "HEADTEACHER_MOCK_REMINDER_DEDUPED"
      : "HEADTEACHER_MOCK_REMINDER_SENT",
    tenantId: auth.ctx.tenantId,
    userId: auth.ctx.userId,
    resource: "GovernanceOfficialNotice",
    resourceId: result.notice.id,
    ip: ipFrom(req),
    userAgent: req.headers.get("user-agent"),
    metadata: {
      sessionId,
      actionCode,
      subject,
      canonicalSubject,
      itemId: item?.id ?? null,
      recipientCount: recipients.length,
      recipientUserIds: recipients.map((r) => r.id),
      idempotencyKey,
      idempotencyScope,
      reused: result.reused,
    },
  });

  return json(result.reused ? 200 : 201, {
    ok: true,
    reused: result.reused,
    duplicateSafe: Boolean(idempotencyKey),
    notice: result.notice,
    recipients: recipients.map((teacher) => ({
      id: teacher.id,
      name: displayName(teacher),
      email: teacher.email,
      phone: teacher.phone,
    })),
    action: {
      actionCode,
      subject,
      canonicalSubject,
      subjectLabel,
      teacherHref,
      deadline: deadline ? deadline.toISOString() : null,
      scoredCount,
      missingCount,
      totalStudents,
    },
  });
}