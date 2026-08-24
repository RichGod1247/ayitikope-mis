import {
  EssentialAlertEnrollmentStatus,
  EssentialAlertRecipientKind,
  Prisma,
  StudentStatus,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  ESSENTIAL_ALERT_POLICY,
  type EssentialAlertDecision,
  clean,
  guardianPolicyEvidence,
  guardianSubjectKey,
  normalizeGhanaPhone,
  staffPolicyEvidence,
  staffSubjectKey,
} from "@/lib/essentialAlerts/policy";
import {
  essentialAlertPhoneFingerprint,
  signEssentialAlertToken,
  type EssentialAlertTokenPayload,
} from "@/lib/essentialAlerts/tokens";

const STAFF_ALERT_ROLES = new Set([
  "TEACHER",
  "HEADTEACHER",
  "HEADMASTER",
]);

export class EssentialAlertEnrollmentError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number) {
    super(code);
    this.name = "EssentialAlertEnrollmentError";
    this.code = code;
    this.status = status;
  }
}

function fail(code: string, status: number): never {
  throw new EssentialAlertEnrollmentError(code, status);
}

function normalizeRole(value: unknown) {
  return clean(value).toUpperCase().replace(/[\s-]+/g, "_");
}

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue;
}

async function tenantName(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, name: true, status: true },
  });

  if (!tenant || tenant.status !== "ACTIVE") {
    fail("ESSENTIAL_ALERT_TENANT_INACTIVE", 409);
  }

  return tenant.name;
}

async function guardianContact(tenantId: string, studentId: string) {
  const student = await prisma.student.findFirst({
    where: {
      id: studentId,
      tenantId,
      status: StudentStatus.ACTIVE,
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      guardianName: true,
      guardianPhone: true,
      guardianPhoneNorm: true,
    },
  });

  if (!student) fail("ESSENTIAL_ALERT_STUDENT_NOT_FOUND", 404);

  const phoneNorm =
    normalizeGhanaPhone(student.guardianPhoneNorm) ??
    normalizeGhanaPhone(student.guardianPhone);

  if (!phoneNorm) fail("ESSENTIAL_ALERT_GUARDIAN_PHONE_MISSING", 409);

  const phoneFingerprint = essentialAlertPhoneFingerprint({
    tenantId,
    kind: "GUARDIAN",
    subjectId: student.id,
    phoneNorm,
  });

  return {
    student,
    phoneNorm,
    phoneFingerprint,
    subjectKey: guardianSubjectKey(student.id, phoneFingerprint),
  };
}

async function staffContact(tenantId: string, userId: string) {
  const membership = await prisma.membership.findFirst({
    where: {
      tenantId,
      userId,
      status: "ACTIVE",
    },
    select: {
      userId: true,
      role: { select: { name: true } },
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          phoneNorm: true,
        },
      },
    },
  });

  if (!membership || !membership.user) {
    fail("ESSENTIAL_ALERT_STAFF_NOT_FOUND", 404);
  }

  const role = normalizeRole(membership.role?.name);
  if (!STAFF_ALERT_ROLES.has(role)) {
    fail("ESSENTIAL_ALERT_STAFF_ROLE_NOT_ELIGIBLE", 403);
  }

  const profile = await prisma.teacherProfile
    .findUnique({
      where: {
        teacherProfile_tenant_user_unique: {
          tenantId,
          userId,
        },
      },
      select: { phone: true },
    })
    .catch(() => null);

  const phoneNorm =
    normalizeGhanaPhone(membership.user.phoneNorm) ??
    normalizeGhanaPhone(membership.user.phone) ??
    normalizeGhanaPhone(profile?.phone);

  if (!phoneNorm) fail("ESSENTIAL_ALERT_STAFF_PHONE_MISSING", 409);

  const phoneFingerprint = essentialAlertPhoneFingerprint({
    tenantId,
    kind: "STAFF",
    subjectId: membership.user.id,
    phoneNorm,
  });

  return {
    membership,
    phoneNorm,
    phoneFingerprint,
    subjectKey: staffSubjectKey(membership.user.id, phoneFingerprint),
  };
}

export async function buildGuardianEssentialAlertInvitation(input: {
  tenantId: string;
  studentId: string;
  now?: Date;
}) {
  const tenantId = clean(input.tenantId);
  const studentId = clean(input.studentId);
  if (!tenantId || !studentId) fail("ESSENTIAL_ALERT_INVITATION_INPUT_INVALID", 400);

  const [{ student, phoneNorm, phoneFingerprint, subjectKey }, schoolName] =
    await Promise.all([
      guardianContact(tenantId, studentId),
      tenantName(tenantId),
    ]);

  const existing = await prisma.essentialAlertEnrollment.findUnique({
    where: { tenantId_subjectKey: { tenantId, subjectKey } },
    select: {
      status: true,
      lastInvitationSentAt: true,
      invitationCount: true,
    },
  });

  const token = signEssentialAlertToken({
    tenantId,
    kind: "GUARDIAN",
    studentId,
    phoneFingerprint,
    now: input.now,
  });

  return {
    kind: "GUARDIAN" as const,
    studentId,
    subjectKey,
    to: phoneNorm,
    phoneFingerprint,
    token,
    schoolName,
    guardianName: clean(student.guardianName) || "Parent/Guardian",
    childName:
      [clean(student.firstName), clean(student.lastName)].filter(Boolean).join(" ") ||
      "your child",
    existingStatus: existing?.status ?? null,
    lastInvitationSentAt: existing?.lastInvitationSentAt ?? null,
    invitationCount: existing?.invitationCount ?? 0,
  };
}

export async function buildStaffEssentialAlertInvitation(input: {
  tenantId: string;
  userId: string;
  now?: Date;
}) {
  const tenantId = clean(input.tenantId);
  const userId = clean(input.userId);
  if (!tenantId || !userId) fail("ESSENTIAL_ALERT_INVITATION_INPUT_INVALID", 400);

  const [{ membership, phoneNorm, phoneFingerprint, subjectKey }, schoolName] =
    await Promise.all([
      staffContact(tenantId, userId),
      tenantName(tenantId),
    ]);

  const existing = await prisma.essentialAlertEnrollment.findUnique({
    where: { tenantId_subjectKey: { tenantId, subjectKey } },
    select: {
      status: true,
      lastInvitationSentAt: true,
      invitationCount: true,
    },
  });

  const token = signEssentialAlertToken({
    tenantId,
    kind: "STAFF",
    userId,
    phoneFingerprint,
    now: input.now,
  });

  return {
    kind: "STAFF" as const,
    userId,
    subjectKey,
    to: phoneNorm,
    phoneFingerprint,
    token,
    schoolName,
    staffName: clean(membership.user.name) || clean(membership.user.email) || "Staff member",
    role: normalizeRole(membership.role?.name),
    existingStatus: existing?.status ?? null,
    lastInvitationSentAt: existing?.lastInvitationSentAt ?? null,
    invitationCount: existing?.invitationCount ?? 0,
  };
}

export function invitationMayBeSent(input: {
  existingStatus: EssentialAlertEnrollmentStatus | null;
  lastInvitationSentAt: Date | null;
  now?: Date;
}) {
  if (
    input.existingStatus === EssentialAlertEnrollmentStatus.ENROLLED ||
    input.existingStatus === EssentialAlertEnrollmentStatus.OPTED_OUT
  ) {
    return false;
  }

  if (!input.lastInvitationSentAt) return true;

  const now = input.now ? new Date(input.now) : new Date();
  const minimumAgeMs =
    ESSENTIAL_ALERT_POLICY.minimumInvitationResendHours * 60 * 60 * 1000;

  return now.getTime() - input.lastInvitationSentAt.getTime() >= minimumAgeMs;
}

export async function recordEssentialAlertInvitationAttempt(input: {
  tenantId: string;
  kind: "GUARDIAN" | "STAFF";
  subjectId: string;
  subjectKey: string;
  phoneNorm: string;
  phoneFingerprint: string;
  actorUserId: string;
  now?: Date;
  ip?: string | null;
  userAgent?: string | null;
}) {
  const now = input.now ? new Date(input.now) : new Date();
  const recipientKind =
    input.kind === "GUARDIAN"
      ? EssentialAlertRecipientKind.GUARDIAN
      : EssentialAlertRecipientKind.STAFF;

  return prisma.$transaction(
    async (tx) => {
      const existing = await tx.essentialAlertEnrollment.findUnique({
        where: {
          tenantId_subjectKey: {
            tenantId: input.tenantId,
            subjectKey: input.subjectKey,
          },
        },
        select: {
          id: true,
          status: true,
          firstInvitedAt: true,
          lastInvitationAttemptAt: true,
        },
      });

      if (
        existing?.status === EssentialAlertEnrollmentStatus.ENROLLED ||
        existing?.status === EssentialAlertEnrollmentStatus.OPTED_OUT
      ) {
        return { allowed: false as const, row: existing };
      }

      if (existing?.lastInvitationAttemptAt) {
        const minimumAttemptGapMs =
          ESSENTIAL_ALERT_POLICY.minimumInvitationAttemptGapMinutes * 60 * 1000;
        if (
          now.getTime() - existing.lastInvitationAttemptAt.getTime() <
          minimumAttemptGapMs
        ) {
          return { allowed: false as const, row: existing };
        }
      }

      const row = existing
        ? await tx.essentialAlertEnrollment.update({
            where: { id: existing.id },
            data: {
              phoneNormSnapshot: input.phoneNorm,
              phoneFingerprint: input.phoneFingerprint,
              policyVersion: ESSENTIAL_ALERT_POLICY.version,
              status: EssentialAlertEnrollmentStatus.INVITED,
              firstInvitedAt: existing.firstInvitedAt ?? now,
              lastInvitationAttemptAt: now,
              invitationCount: { increment: 1 },
            },
          })
        : await tx.essentialAlertEnrollment.create({
            data: {
              tenantId: input.tenantId,
              subjectKey: input.subjectKey,
              recipientKind,
              ...(input.kind === "GUARDIAN"
                ? { studentId: input.subjectId }
                : { userId: input.subjectId }),
              phoneNormSnapshot: input.phoneNorm,
              phoneFingerprint: input.phoneFingerprint,
              status: EssentialAlertEnrollmentStatus.INVITED,
              policyVersion: ESSENTIAL_ALERT_POLICY.version,
              firstInvitedAt: now,
              lastInvitationAttemptAt: now,
              invitationCount: 1,
            },
          });

      await tx.auditLog.create({
        data: {
          tenantId: input.tenantId,
          userId: input.actorUserId,
          action: "ESSENTIAL_ALERT_INVITATION_ATTEMPTED",
          resource: "EssentialAlertEnrollment",
          resourceId: row.id,
          ip: input.ip ?? null,
          userAgent: input.userAgent ?? null,
          metadata: {
            policyId: ESSENTIAL_ALERT_POLICY.policyId,
            policyVersion: ESSENTIAL_ALERT_POLICY.version,
            recipientKind: input.kind,
            subjectId: input.subjectId,
            subjectKey: input.subjectKey,
            phoneFingerprint: input.phoneFingerprint,
            rawPhoneIncluded: false,
            providerCalledInsideTransaction: false,
          },
        },
      });

      return { allowed: true as const, row };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 10_000,
      timeout: 20_000,
    },
  );
}

export async function recordEssentialAlertInvitationSent(input: {
  enrollmentId: string;
  tenantId: string;
  actorUserId: string;
  now?: Date;
  ip?: string | null;
  userAgent?: string | null;
}) {
  const now = input.now ? new Date(input.now) : new Date();

  return prisma.$transaction(
    async (tx) => {
      const row = await tx.essentialAlertEnrollment.update({
        where: { id: input.enrollmentId },
        data: { lastInvitationSentAt: now },
      });

      await tx.auditLog.create({
        data: {
          tenantId: input.tenantId,
          userId: input.actorUserId,
          action: "ESSENTIAL_ALERT_INVITATION_SENT",
          resource: "EssentialAlertEnrollment",
          resourceId: row.id,
          ip: input.ip ?? null,
          userAgent: input.userAgent ?? null,
          metadata: {
            policyId: ESSENTIAL_ALERT_POLICY.policyId,
            policyVersion: ESSENTIAL_ALERT_POLICY.version,
            recipientKind: row.recipientKind,
            subjectKey: row.subjectKey,
            phoneFingerprint: row.phoneFingerprint,
            rawPhoneIncluded: false,
          },
        },
      });

      return row;
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 10_000,
      timeout: 20_000,
    },
  );
}

async function applyDecision(input: {
  token: EssentialAlertTokenPayload;
  decision: EssentialAlertDecision;
  now?: Date;
  ip?: string | null;
  userAgent?: string | null;
}) {
  const now = input.now ? new Date(input.now) : new Date();
  const token = input.token;

  if (token.pv !== ESSENTIAL_ALERT_POLICY.version) {
    fail("ESSENTIAL_ALERT_POLICY_VERSION_MISMATCH", 409);
  }

  const isGuardian = token.kind === "GUARDIAN";
  const contact = isGuardian
    ? await guardianContact(token.tid, clean(token.sid))
    : await staffContact(token.tid, clean(token.uid));

  if (contact.phoneFingerprint !== token.pf) {
    fail("ESSENTIAL_ALERT_PHONE_CHANGED", 409);
  }

  const subjectId = isGuardian ? clean(token.sid) : clean(token.uid);
  const subjectKey = isGuardian
    ? guardianSubjectKey(subjectId, contact.phoneFingerprint)
    : staffSubjectKey(subjectId, contact.phoneFingerprint);
  const recipientKind = isGuardian
    ? EssentialAlertRecipientKind.GUARDIAN
    : EssentialAlertRecipientKind.STAFF;
  const status =
    input.decision === "ENABLE"
      ? EssentialAlertEnrollmentStatus.ENROLLED
      : EssentialAlertEnrollmentStatus.OPTED_OUT;

  const policyEvidence = isGuardian
    ? guardianPolicyEvidence()
    : staffPolicyEvidence();

  return prisma.$transaction(
    async (tx) => {
      const existing = await tx.essentialAlertEnrollment.findUnique({
        where: {
          tenantId_subjectKey: {
            tenantId: token.tid,
            subjectKey,
          },
        },
      });

      const consentedAt =
        input.decision === "ENABLE" ? existing?.consentedAt ?? now : existing?.consentedAt ?? null;
      const optedOutAt = input.decision === "DECLINE" ? now : null;
      const consentSource = isGuardian
        ? "SIGNED_GUARDIAN_LINK"
        : "SIGNED_STAFF_LINK";

      const evidence = json({
        ...policyEvidence,
        decision: input.decision,
        consentSource,
        token: {
          scope: token.scope,
          kind: token.kind,
          policyVersion: token.pv,
          issuedAtUnix: token.iat,
          expiresAtUnix: token.exp,
          phoneFingerprint: token.pf,
          rawPhoneIncluded: false,
        },
        decidedAt: now.toISOString(),
      });

      const row = existing
        ? await tx.essentialAlertEnrollment.update({
            where: { id: existing.id },
            data: {
              phoneNormSnapshot: contact.phoneNorm,
              phoneFingerprint: contact.phoneFingerprint,
              status,
              policyVersion: ESSENTIAL_ALERT_POLICY.version,
              consentSource,
              consentedAt,
              optedOutAt,
              consentEvidenceJson: evidence,
            },
          })
        : await tx.essentialAlertEnrollment.create({
            data: {
              tenantId: token.tid,
              subjectKey,
              recipientKind,
              ...(isGuardian
                ? { studentId: subjectId }
                : { userId: subjectId }),
              phoneNormSnapshot: contact.phoneNorm,
              phoneFingerprint: contact.phoneFingerprint,
              status,
              policyVersion: ESSENTIAL_ALERT_POLICY.version,
              consentSource,
              consentedAt,
              optedOutAt,
              consentEvidenceJson: evidence,
            },
          });

      await tx.auditLog.create({
        data: {
          tenantId: token.tid,
          userId: null,
          action:
            input.decision === "ENABLE"
              ? "ESSENTIAL_ALERT_ENROLLED"
              : "ESSENTIAL_ALERT_OPTED_OUT",
          resource: "EssentialAlertEnrollment",
          resourceId: row.id,
          ip: input.ip ?? null,
          userAgent: input.userAgent ?? null,
          metadata: {
            policyId: ESSENTIAL_ALERT_POLICY.policyId,
            policyVersion: ESSENTIAL_ALERT_POLICY.version,
            recipientKind: token.kind,
            subjectId,
            subjectKey,
            consentSource,
            phoneFingerprint: token.pf,
            rawPhoneIncluded: false,
            healthConsentChanged: false,
            legacySmsOptInChanged: false,
          },
        },
      });

      return row;
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 10_000,
      timeout: 20_000,
    },
  );
}

export async function applyEssentialAlertTokenDecision(input: {
  token: EssentialAlertTokenPayload;
  decision: EssentialAlertDecision;
  now?: Date;
  ip?: string | null;
  userAgent?: string | null;
}) {
  return applyDecision(input);
}

export async function setAuthenticatedStaffEssentialAlerts(input: {
  tenantId: string;
  userId: string;
  enabled: boolean;
  actorUserId: string;
  now?: Date;
  ip?: string | null;
  userAgent?: string | null;
}) {
  if (input.userId !== input.actorUserId) {
    fail("ESSENTIAL_ALERT_STAFF_SELF_ONLY", 403);
  }

  const now = input.now ? new Date(input.now) : new Date();
  const contact = await staffContact(input.tenantId, input.userId);
  const status = input.enabled
    ? EssentialAlertEnrollmentStatus.ENROLLED
    : EssentialAlertEnrollmentStatus.OPTED_OUT;

  return prisma.$transaction(
    async (tx) => {
      const existing = await tx.essentialAlertEnrollment.findUnique({
        where: {
          tenantId_subjectKey: {
            tenantId: input.tenantId,
            subjectKey: contact.subjectKey,
          },
        },
      });

      const row = existing
        ? await tx.essentialAlertEnrollment.update({
            where: { id: existing.id },
            data: {
              phoneNormSnapshot: contact.phoneNorm,
              phoneFingerprint: contact.phoneFingerprint,
              status,
              policyVersion: ESSENTIAL_ALERT_POLICY.version,
              consentSource: "AUTHENTICATED_STAFF_SELF_SERVICE",
              consentedAt: input.enabled ? existing.consentedAt ?? now : existing.consentedAt,
              optedOutAt: input.enabled ? null : now,
              consentEvidenceJson: json({
                ...staffPolicyEvidence(),
                decision: input.enabled ? "ENABLE" : "DECLINE",
                consentSource: "AUTHENTICATED_STAFF_SELF_SERVICE",
                decidedAt: now.toISOString(),
              }),
            },
          })
        : await tx.essentialAlertEnrollment.create({
            data: {
              tenantId: input.tenantId,
              subjectKey: contact.subjectKey,
              recipientKind: EssentialAlertRecipientKind.STAFF,
              userId: input.userId,
              phoneNormSnapshot: contact.phoneNorm,
              phoneFingerprint: contact.phoneFingerprint,
              status,
              policyVersion: ESSENTIAL_ALERT_POLICY.version,
              consentSource: "AUTHENTICATED_STAFF_SELF_SERVICE",
              consentedAt: input.enabled ? now : null,
              optedOutAt: input.enabled ? null : now,
              consentEvidenceJson: json({
                ...staffPolicyEvidence(),
                decision: input.enabled ? "ENABLE" : "DECLINE",
                consentSource: "AUTHENTICATED_STAFF_SELF_SERVICE",
                decidedAt: now.toISOString(),
              }),
            },
          });

      await tx.auditLog.create({
        data: {
          tenantId: input.tenantId,
          userId: input.actorUserId,
          action: input.enabled
            ? "ESSENTIAL_ALERT_STAFF_SELF_ENROLLED"
            : "ESSENTIAL_ALERT_STAFF_SELF_OPTED_OUT",
          resource: "EssentialAlertEnrollment",
          resourceId: row.id,
          ip: input.ip ?? null,
          userAgent: input.userAgent ?? null,
          metadata: {
            policyId: ESSENTIAL_ALERT_POLICY.policyId,
            policyVersion: ESSENTIAL_ALERT_POLICY.version,
            phoneFingerprint: contact.phoneFingerprint,
            rawPhoneIncluded: false,
            legacySmsOptInChanged: false,
          },
        },
      });

      return row;
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 10_000,
      timeout: 20_000,
    },
  );
}

export function essentialAlertStatusLabel(
  status: EssentialAlertEnrollmentStatus | null | undefined,
) {
  switch (status) {
    case EssentialAlertEnrollmentStatus.INVITED:
      return "INVITED" as const;
    case EssentialAlertEnrollmentStatus.ENROLLED:
      return "ENROLLED" as const;
    case EssentialAlertEnrollmentStatus.OPTED_OUT:
      return "OPTED_OUT" as const;
    default:
      return "NOT_ENROLLED" as const;
  }
}
