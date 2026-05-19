// src/lib/lessonNotes/submitNotifications.ts
import { prisma } from "@/lib/prisma";
import { sendSms } from "@/lib/sms";
import { writeAuditLog } from "@/lib/audit";

type LessonNoteSubmitNotificationInput = {
  tenantId: string;
  lessonNoteId: string;
  teacherUserId: string;
  submittedAt: Date;
};

type PhoneCandidate = string | null | undefined;

function clean(v: unknown) {
  return String(v ?? "").trim();
}

function displayName(u: {
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}) {
  const name = clean(u.name);
  if (name) return name;

  const full = `${clean(u.firstName)} ${clean(u.lastName)}`.trim();
  if (full) return full;

  return clean(u.email) || "Teacher";
}

function firstPhone(...items: PhoneCandidate[]) {
  for (const item of items) {
    const p = clean(item);
    if (p) return p;
  }

  return null;
}

function shortRef(id: string) {
  const s = clean(id);
  if (!s) return "NOTE";
  return s.slice(-8).toUpperCase();
}

function smsSafe(v: unknown) {
  return clean(v)
    .replace(/[·•]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function formatTerm(term: unknown) {
  const t = smsSafe(term);
  if (!t) return "";

  const lower = t.toLowerCase();

  // If DB already stores "2nd Term", do not produce "Term 2nd Term".
  if (lower.includes("term")) return t;

  if (lower === "1" || lower === "first" || lower === "1st") return "1st Term";
  if (lower === "2" || lower === "second" || lower === "2nd") return "2nd Term";
  if (lower === "3" || lower === "third" || lower === "3rd") return "3rd Term";

  return t;
}

function lessonContext(note: {
  subject: string | null;
  level: string | null;
  term: string | null;
  academicYear: string | null;
  weekNumber: number | null;
}) {
  const parts: string[] = [];

  if (smsSafe(note.subject)) parts.push(smsSafe(note.subject));
  if (smsSafe(note.level)) parts.push(smsSafe(note.level));
  if (note.weekNumber) parts.push(`Week ${note.weekNumber}`);

  const term = formatTerm(note.term);
  if (term) parts.push(term);

  if (smsSafe(note.academicYear)) parts.push(smsSafe(note.academicYear));

  return parts.join(" - ") || "lesson note";
}

function buildTeacherMessage(args: {
  context: string;
  ref: string;
}) {
  return `EduLife OS: Dear Teacher, your lesson note for ${args.context} has been submitted for Headteacher review. Ref: ${args.ref}.`;
}

function buildHeadteacherMessage(args: {
  teacherName: string;
  context: string;
  ref: string;
}) {
  return `EduLife OS: Dear Headteacher, ${args.teacherName} has submitted a lesson note for ${args.context}. Please review. Ref: ${args.ref}.`;
}

async function findTeacherPhone(args: { tenantId: string; userId: string }) {
  const [user, profile] = await Promise.all([
    prisma.user.findUnique({
      where: { id: args.userId },
      select: {
        id: true,
        email: true,
        name: true,
        firstName: true,
        lastName: true,
        phone: true,
        phoneNorm: true,
        smsOptIn: true,
      },
    }),

    prisma.teacherProfile
      .findUnique({
        where: {
          teacherProfile_tenant_user_unique: {
            tenantId: args.tenantId,
            userId: args.userId,
          },
        },
        select: { phone: true },
      })
      .catch(() => null),
  ]);

  if (!user || user.smsOptIn === false) {
    return {
      user,
      phone: null,
      skippedReason: user ? "TEACHER_SMS_OPT_OUT" : "TEACHER_NOT_FOUND",
    };
  }

  return {
    user,
    phone: firstPhone(user.phoneNorm, user.phone, profile?.phone),
    skippedReason: null,
  };
}

async function findHeadteachers(args: { tenantId: string }) {
  const rows = await prisma.membership.findMany({
    where: {
      tenantId: args.tenantId,
      status: "ACTIVE",
      role: {
        name: {
          in: ["HEADTEACHER", "HEADMASTER"],
          mode: "insensitive",
        },
      },
    },
    select: {
      userId: true,
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          firstName: true,
          lastName: true,
          phone: true,
          phoneNorm: true,
          smsOptIn: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const withProfiles = await Promise.all(
    rows.map(async (row) => {
      const profile = await prisma.teacherProfile
        .findUnique({
          where: {
            teacherProfile_tenant_user_unique: {
              tenantId: args.tenantId,
              userId: row.userId,
            },
          },
          select: { phone: true },
        })
        .catch(() => null);

      const user = row.user;
      const phone =
        user?.smsOptIn === false
          ? null
          : firstPhone(user?.phoneNorm, user?.phone, profile?.phone);

      return {
        user,
        phone,
        skippedReason: user?.smsOptIn === false ? "HEADTEACHER_SMS_OPT_OUT" : null,
      };
    })
  );

  return withProfiles;
}

/**
 * Safe notification side-effect.
 * This must never break lesson-note submission.
 */
export async function notifyLessonNoteSubmitted(args: LessonNoteSubmitNotificationInput) {
  try {
    const note = await prisma.lessonNote.findFirst({
      where: {
        id: args.lessonNoteId,
        tenantId: args.tenantId,
        teacherUserId: args.teacherUserId,
      },
      select: {
        id: true,
        tenantId: true,
        teacherUserId: true,
        subject: true,
        level: true,
        term: true,
        academicYear: true,
        weekNumber: true,
        tenant: {
          select: {
            id: true,
            name: true,
            schoolCode: true,
          },
        },
      },
    });

    if (!note) {
      await writeAuditLog({
        tenantId: args.tenantId,
        userId: args.teacherUserId,
        action: "LESSON_NOTE_SUBMIT_SMS_SKIPPED",
        resource: "LessonNote",
        resourceId: args.lessonNoteId,
        metadata: { reason: "LESSON_NOTE_NOT_FOUND_AFTER_SUBMIT" },
      });
      return;
    }

    const [teacherInfo, headteachers] = await Promise.all([
      findTeacherPhone({ tenantId: args.tenantId, userId: args.teacherUserId }),
      findHeadteachers({ tenantId: args.tenantId }),
    ]);

    const teacherName = teacherInfo.user ? displayName(teacherInfo.user) : "A teacher";
    const context = lessonContext(note);
    const ref = shortRef(note.id);

    const teacherMessage = buildTeacherMessage({ context, ref });
    const headteacherMessage = buildHeadteacherMessage({
      teacherName: smsSafe(teacherName),
      context,
      ref,
    });

    const template = "LESSON_NOTE_SUBMITTED";
    const payload = {
      lessonNoteId: note.id,
      teacherUserId: note.teacherUserId,
      teacherName,
      schoolName: note.tenant?.name ?? null,
      schoolCode: note.tenant?.schoolCode ?? null,
      subject: note.subject,
      level: note.level,
      term: note.term,
      academicYear: note.academicYear,
      weekNumber: note.weekNumber,
      submittedAt: args.submittedAt.toISOString(),
      ref,
    };

    const sends: Array<{
      recipientType: "TEACHER" | "HEADTEACHER";
      userId: string | null;
      phone: string | null;
      ok: boolean;
      skipped?: string;
      error?: string;
    }> = [];

    if (teacherInfo.phone) {
      const result = await sendSms({
        tenantId: args.tenantId,
        actorId: args.teacherUserId,
        to: teacherInfo.phone,
        message: teacherMessage,
        template,
        payload: { ...payload, recipientType: "TEACHER" },
      });

      sends.push({
        recipientType: "TEACHER",
        userId: args.teacherUserId,
        phone: teacherInfo.phone,
        ok: Boolean(result.ok),
        error: result.error ? String(result.error) : undefined,
      });
    } else {
      sends.push({
        recipientType: "TEACHER",
        userId: args.teacherUserId,
        phone: null,
        ok: false,
        skipped: teacherInfo.skippedReason ?? "TEACHER_PHONE_MISSING",
      });
    }

    for (const head of headteachers) {
      const headUserId = head.user?.id ?? null;

      if (!head.phone) {
        sends.push({
          recipientType: "HEADTEACHER",
          userId: headUserId,
          phone: null,
          ok: false,
          skipped: head.skippedReason ?? "HEADTEACHER_PHONE_MISSING",
        });
        continue;
      }

      const result = await sendSms({
        tenantId: args.tenantId,
        actorId: args.teacherUserId,
        to: head.phone,
        message: headteacherMessage,
        template,
        payload: {
          ...payload,
          recipientType: "HEADTEACHER",
          headteacherUserId: headUserId,
        },
      });

      sends.push({
        recipientType: "HEADTEACHER",
        userId: headUserId,
        phone: head.phone,
        ok: Boolean(result.ok),
        error: result.error ? String(result.error) : undefined,
      });
    }

    await writeAuditLog({
      tenantId: args.tenantId,
      userId: args.teacherUserId,
      action: "LESSON_NOTE_SUBMIT_SMS_ATTEMPTED",
      resource: "LessonNote",
      resourceId: note.id,
      metadata: {
        template,
        ref,
        context,
        sends,
        counts: {
          attempted: sends.filter((s) => s.phone).length,
          sentOk: sends.filter((s) => s.ok).length,
          skipped: sends.filter((s) => s.skipped).length,
          failed: sends.filter((s) => s.phone && !s.ok).length,
        },
      },
    });
  } catch (error) {
    await writeAuditLog({
      tenantId: args.tenantId,
      userId: args.teacherUserId,
      action: "LESSON_NOTE_SUBMIT_SMS_FAILED_SAFELY",
      resource: "LessonNote",
      resourceId: args.lessonNoteId,
      metadata: {
        error: error instanceof Error ? error.message : String(error),
      },
    }).catch(() => undefined);
  }
}