import { createHash, randomUUID } from "crypto";
import {
  AppraisalNotificationChannel,
  AppraisalNotificationStatus,
  AppraisalNotificationType,
  GovernanceInterventionPriority,
  GovernanceOfficialNoticeAudienceMode,
  GovernanceOfficialNoticeChannel,
  GovernanceOfficialNoticeDeliveryStatus,
  GovernanceOfficialNoticeRecipientType,
  GovernanceOfficialNoticeStatus,
  Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { HEADTEACHER_FEEDBACK_POLICY } from "@/lib/appraisals/headteacherFeedback";

export const HEADTEACHER_STAFF_FEEDBACK_RELEASE_NOTIFICATION_POLICY = {
  schemaVersion: 1,
  notificationType: AppraisalNotificationType.FEEDBACK_RELEASED,
  recipientRole: "HEADTEACHER",
  requiredReviewDecision: "ACCEPTED",
  releaseMode: "INDEPENDENT_STAFF_FEEDBACK_RELEASE",
  inAppHref: "/headteacher/my-appraisal",
  inAppActionLabel: "Open released staff feedback",
  officialNoticeIdempotencyScope: "HEADTEACHER_STAFF_FEEDBACK_RELEASED",
  externalChannels: [
    AppraisalNotificationChannel.SMS,
    AppraisalNotificationChannel.EMAIL,
  ] as const,
  maximumAttempts: 5,
  priority: 2,
  providerCallsAllowed: false,
  respondentIdentitiesAccessed: false,
  individualStaffResponsesAccessed: false,
  scoreValuesIncluded: false,
  releaseNoteIncluded: false,
  transactionIsolation: "SERIALIZABLE",
  transactionMaxWaitMs: 10_000,
  transactionTimeoutMs: 30_000,
} as const;

type ReleasedCycle = {
  id: string;
  targetUserId: string;
  targetTenantId: string | null;
  targetRoleSnapshot: string | null;
  targetUser: {
    email: string;
    phone: string | null;
    phoneNorm: string | null;
    smsOptIn: boolean;
    teacherProfiles: Array<{ tenantId: string; phone: string }>;
  };
};

type ReleasedReview = {
  id: string;
  cycleId: string;
  snapshotId: string;
  reviewerUserId: string;
  decision: string;
  note: string | null;
  decidedAt: Date | null;
  metadata: unknown;
};

type MembershipRecord = {
  id: string;
  userId: string;
  tenantId: string;
  status: string;
  role: { name: string };
  tenant: { id: string; status: string };
};

type NotificationSummaryRow = {
  channel: AppraisalNotificationChannel;
  status: AppraisalNotificationStatus;
};

type CountResult = { count: number };

export type HeadteacherStaffFeedbackReleaseNotificationDatabase = {
  appraisalCycle: {
    findUnique(args: unknown): Promise<ReleasedCycle | null>;
  };
  appraisalStaffFeedbackReview: {
    findUnique(args: unknown): Promise<ReleasedReview | null>;
  };
  membership: {
    findFirst(args: unknown): Promise<MembershipRecord | null>;
  };
  appraisalNotification: {
    findMany(args: unknown): Promise<NotificationSummaryRow[]>;
  };
  governanceOfficialNotice: {
    findUnique(args: unknown): Promise<{ id: string } | null>;
  };
  $transaction<T>(
    operation: (tx: {
      appraisalNotification: {
        createMany(args: unknown): Promise<CountResult>;
      };
      governanceOfficialNotice: {
        findUnique(args: unknown): Promise<{ id: string } | null>;
        create(args: unknown): Promise<{ id: string }>;
      };
      governanceOfficialNoticeRecipient: {
        create(args: unknown): Promise<{ id: string }>;
      };
      governanceOfficialNoticeDelivery: {
        create(args: unknown): Promise<unknown>;
      };
      auditLog: {
        create(args: unknown): Promise<unknown>;
      };
    }) => Promise<T>,
    options?: {
      isolationLevel?: Prisma.TransactionIsolationLevel | string;
      maxWait?: number;
      timeout?: number;
    },
  ): Promise<T>;
};

export type EnsureHeadteacherStaffFeedbackReleaseNotificationsInput = {
  cycleId: string;
  reviewId: string;
  actorUserId: string;
  releaseProofHash: string;
  releasedAt: string;
  reqId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  now?: Date;
  database?: HeadteacherStaffFeedbackReleaseNotificationDatabase;
};

export type EnsureHeadteacherStaffFeedbackReleaseNotificationsResult = {
  outcome: "SEEDED" | "EXISTING_MATCH";
  cycleId: string;
  reviewId: string;
  rowsInserted: number;
  officialInAppNoticeVisible: true;
  providerCalled: false;
  respondentIdentitiesAccessed: false;
  individualStaffResponsesAccessed: false;
};

export class HeadteacherStaffFeedbackReleaseNotificationError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(code: string, status: number, details?: Record<string, unknown>) {
    super(code);
    this.name = "HeadteacherStaffFeedbackReleaseNotificationError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function normalized(value: unknown) {
  return clean(value).toUpperCase().replace(/[\s-]+/g, "_");
}

function objectValue(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, stableValue(nested)]),
  );
}

function hashJson(value: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(stableValue(value)), "utf8")
    .digest("hex");
}

function fail(code: string, status: number, details?: Record<string, unknown>): never {
  throw new HeadteacherStaffFeedbackReleaseNotificationError(
    code,
    status,
    details,
  );
}

function requireIdentifier(value: unknown, fieldName: string) {
  const id = clean(value);
  if (!/^[A-Za-z0-9_-]{5,180}$/.test(id)) {
    fail("HEADTEACHER_STAFF_FEEDBACK_RELEASE_NOTIFICATION_INVALID_IDENTIFIER", 400, {
      fieldName,
    });
  }
  return id;
}

function requireSha256(value: unknown) {
  const hash = clean(value).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(hash)) {
    fail("HEADTEACHER_STAFF_FEEDBACK_RELEASE_NOTIFICATION_INVALID_HASH", 400);
  }
  return hash;
}

function safeEmail(value: unknown) {
  const email = clean(value).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function safePhone(value: unknown) {
  const digits = clean(value).replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 10 && digits.startsWith("0")) {
    return `+233${digits.slice(1)}`;
  }
  if (digits.length === 12 && digits.startsWith("233")) return `+${digits}`;
  if (digits.length >= 10 && digits.length <= 15) return `+${digits}`;
  return null;
}

function targetPhone(cycle: ReleasedCycle) {
  const direct = safePhone(cycle.targetUser.phoneNorm) ?? safePhone(cycle.targetUser.phone);
  if (direct) return direct;
  const matching = cycle.targetUser.teacherProfiles.find(
    (profile) => profile.tenantId === cycle.targetTenantId,
  );
  return safePhone(matching?.phone) ?? null;
}

function releaseProof(review: ReleasedReview) {
  return objectValue(objectValue(review.metadata).staffFeedbackRelease);
}

function assertReleaseProof(input: {
  review: ReleasedReview;
  cycleId: string;
  actorUserId: string;
  releaseProofHash: string;
  releasedAt: string;
}) {
  const release = releaseProof(input.review);
  const payload = { ...release };
  delete payload.releaseProofHash;
  if (
    normalized(input.review.decision) !== "ACCEPTED" ||
    !input.review.decidedAt ||
    input.review.cycleId !== input.cycleId ||
    clean(release.releaseMode) !==
      HEADTEACHER_STAFF_FEEDBACK_RELEASE_NOTIFICATION_POLICY.releaseMode ||
    clean(release.cycleId) !== input.cycleId ||
    clean(release.reviewId) !== input.review.id ||
    clean(release.reviewerUserId) !== input.actorUserId ||
    clean(release.releasedAt) !== input.releasedAt ||
    clean(release.releaseProofHash).toLowerCase() !== input.releaseProofHash ||
    hashJson(payload) !== input.releaseProofHash ||
    release.carrierCycleStatusMutationPerformed !== false ||
    release.governanceAssessmentRequired !== false ||
    release.governanceAssessmentAccessed !== false ||
    release.respondentIdentitiesAccessed !== false ||
    release.individualStaffResponsesAccessed !== false ||
    release.providerCalled !== false
  ) {
    fail("HEADTEACHER_STAFF_FEEDBACK_RELEASE_NOTIFICATION_PROOF_DRIFT", 409);
  }
}

function assertMembership(cycle: ReleasedCycle, membership: MembershipRecord | null) {
  if (
    !membership ||
    membership.userId !== cycle.targetUserId ||
    membership.tenantId !== cycle.targetTenantId ||
    normalized(membership.status) !== "ACTIVE" ||
    normalized(membership.role.name) !== "HEADTEACHER" ||
    normalized(membership.tenant.status) !== "ACTIVE"
  ) {
    fail("HEADTEACHER_STAFF_FEEDBACK_RELEASE_NOTIFICATION_TARGET_INACTIVE", 409);
  }
}

function idempotencyKey(input: {
  cycleId: string;
  reviewId: string;
  recipientUserId: string;
  channel: string;
  releaseProofHash: string;
}) {
  const digest = createHash("sha256")
    .update(
      [
        HEADTEACHER_FEEDBACK_POLICY.workflow,
        "INDEPENDENT_STAFF_FEEDBACK_RELEASE",
        input.cycleId,
        input.reviewId,
        input.recipientUserId,
        input.channel,
        input.releaseProofHash,
      ].join("|"),
      "utf8",
    )
    .digest("hex");
  return `appraisal:staff-feedback-released:${input.channel}:${digest}`;
}

function jsonObject(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function jsonArray(value: unknown[]): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function ensureHeadteacherStaffFeedbackReleaseNotifications(
  input: EnsureHeadteacherStaffFeedbackReleaseNotificationsInput,
): Promise<EnsureHeadteacherStaffFeedbackReleaseNotificationsResult> {
  const cycleId = requireIdentifier(input.cycleId, "cycleId");
  const reviewId = requireIdentifier(input.reviewId, "reviewId");
  const actorUserId = requireIdentifier(input.actorUserId, "actorUserId");
  const releaseProofHash = requireSha256(input.releaseProofHash);
  const releasedAt = clean(input.releasedAt);
  const releasedAtDate = new Date(releasedAt);
  const now = input.now ? new Date(input.now) : new Date();
  const reqId = requireIdentifier(clean(input.reqId) || randomUUID(), "reqId");
  if (
    Number.isNaN(releasedAtDate.getTime()) ||
    releasedAtDate.toISOString() !== releasedAt ||
    Number.isNaN(now.getTime())
  ) {
    fail("HEADTEACHER_STAFF_FEEDBACK_RELEASE_NOTIFICATION_TIME_INVALID", 400);
  }

  const database =
    input.database ??
    (prisma as unknown as HeadteacherStaffFeedbackReleaseNotificationDatabase);
  const [cycle, review] = await Promise.all([
    database.appraisalCycle.findUnique({
      where: { id: cycleId },
      select: {
        id: true,
        targetUserId: true,
        targetTenantId: true,
        targetRoleSnapshot: true,
        targetUser: {
          select: {
            email: true,
            phone: true,
            phoneNorm: true,
            smsOptIn: true,
            teacherProfiles: { select: { tenantId: true, phone: true } },
          },
        },
      },
    }),
    database.appraisalStaffFeedbackReview.findUnique({
      where: { id: reviewId },
      select: {
        id: true,
        cycleId: true,
        snapshotId: true,
        reviewerUserId: true,
        decision: true,
        note: true,
        decidedAt: true,
        metadata: true,
      },
    }),
  ]);

  if (!cycle || !review) {
    fail("HEADTEACHER_STAFF_FEEDBACK_RELEASE_NOTIFICATION_SOURCE_NOT_FOUND", 404);
  }
  if (normalized(cycle.targetRoleSnapshot) !== "HEADTEACHER" || !cycle.targetTenantId) {
    fail("HEADTEACHER_STAFF_FEEDBACK_RELEASE_NOTIFICATION_CYCLE_DRIFT", 409);
  }
  assertReleaseProof({
    review,
    cycleId,
    actorUserId,
    releaseProofHash,
    releasedAt,
  });

  const membership = await database.membership.findFirst({
    where: {
      userId: cycle.targetUserId,
      tenantId: cycle.targetTenantId,
      status: "ACTIVE",
      role: { name: { equals: "HEADTEACHER", mode: "insensitive" } },
      tenant: { status: "ACTIVE" },
    },
    select: {
      id: true,
      userId: true,
      tenantId: true,
      status: true,
      role: { select: { name: true } },
      tenant: { select: { id: true, status: true } },
    },
  });
  assertMembership(cycle, membership);

  const email = safeEmail(cycle.targetUser.email);
  const phone = targetPhone(cycle);
  const smsAllowed = cycle.targetUser.smsOptIn !== false;
  const baseKey = {
    cycleId,
    reviewId,
    recipientUserId: cycle.targetUserId,
    releaseProofHash,
  };
  const officialNoticeKey = idempotencyKey({
    ...baseKey,
    channel: "OFFICIAL_IN_APP",
  });
  const commonPayload = {
    workflow: HEADTEACHER_FEEDBACK_POLICY.workflow,
    event: "INDEPENDENT_STAFF_FEEDBACK_RELEASE",
    cycleId,
    reviewId,
    releasedAt,
    releaseProofHash,
    href: HEADTEACHER_STAFF_FEEDBACK_RELEASE_NOTIFICATION_POLICY.inAppHref,
    title: "Staff feedback appraisal released",
    message:
      "Your confidential staff-feedback appraisal result has been released. Sign in to EduLife OS to view the aggregate result.",
    privacy: {
      respondentIdentitiesIncluded: false,
      individualStaffResponsesIncluded: false,
      scoreValuesIncluded: false,
      releaseNoteIncluded: false,
      providerCalled: false,
    },
  };
  const rows: Prisma.AppraisalNotificationCreateManyInput[] = [
    {
      cycleId,
      recipientUserId: cycle.targetUserId,
      recipientTenantId: cycle.targetTenantId,
      channel: AppraisalNotificationChannel.SMS,
      type: AppraisalNotificationType.FEEDBACK_RELEASED,
      status:
        phone && smsAllowed
          ? AppraisalNotificationStatus.PENDING
          : AppraisalNotificationStatus.SKIPPED,
      idempotencyKey: idempotencyKey({ ...baseKey, channel: "SMS" }),
      payload: jsonObject({
        ...commonPayload,
        delivery: phone
          ? {
              destination: phone,
              text:
                "Your confidential staff-feedback appraisal result has been released in EduLife OS. Sign in to view it.",
            }
          : null,
      }),
      attempts: 0,
      maxAttempts:
        HEADTEACHER_STAFF_FEEDBACK_RELEASE_NOTIFICATION_POLICY.maximumAttempts,
      priority: HEADTEACHER_STAFF_FEEDBACK_RELEASE_NOTIFICATION_POLICY.priority,
      lastError: !smsAllowed
        ? "SMS_OPT_OUT"
        : phone
          ? null
          : "PHONE_UNAVAILABLE",
    },
    {
      cycleId,
      recipientUserId: cycle.targetUserId,
      recipientTenantId: cycle.targetTenantId,
      channel: AppraisalNotificationChannel.EMAIL,
      type: AppraisalNotificationType.FEEDBACK_RELEASED,
      status: email
        ? AppraisalNotificationStatus.PENDING
        : AppraisalNotificationStatus.SKIPPED,
      idempotencyKey: idempotencyKey({ ...baseKey, channel: "EMAIL" }),
      payload: jsonObject({
        ...commonPayload,
        delivery: email
          ? {
              destination: email,
              subject: "Staff feedback appraisal released",
              text:
                "Your confidential staff-feedback appraisal result has been released in EduLife OS. Sign in to view the aggregate result.",
            }
          : null,
      }),
      attempts: 0,
      maxAttempts:
        HEADTEACHER_STAFF_FEEDBACK_RELEASE_NOTIFICATION_POLICY.maximumAttempts,
      priority: HEADTEACHER_STAFF_FEEDBACK_RELEASE_NOTIFICATION_POLICY.priority,
      lastError: email ? null : "EMAIL_UNAVAILABLE",
    },
  ];

  const seeded = await database.$transaction(
    async (tx) => {
      const existing = await tx.governanceOfficialNotice.findUnique({
        where: { idempotencyKey: officialNoticeKey },
        select: { id: true },
      });
      let officialCreated = false;
      if (!existing) {
        const notice = await tx.governanceOfficialNotice.create({
          data: {
            tenantId: cycle.targetTenantId,
            senderUserId: actorUserId,
            title: "Staff feedback appraisal released",
            body:
              "Your confidential staff-feedback appraisal result has been released. Open My Appraisal in EduLife OS to view the aggregate result.",
            priority: GovernanceInterventionPriority.MEDIUM,
            status: GovernanceOfficialNoticeStatus.SENT,
            audienceMode: GovernanceOfficialNoticeAudienceMode.INDIVIDUALS,
            channels: jsonArray([GovernanceOfficialNoticeChannel.IN_APP]),
            audienceSummary: "Headteacher: 1",
            idempotencyKey: officialNoticeKey,
            idempotencyScope:
              HEADTEACHER_STAFF_FEEDBACK_RELEASE_NOTIFICATION_POLICY.officialNoticeIdempotencyScope,
            metadata: jsonObject({
              ...commonPayload,
              noticeKind: "INFORMATION_ONLY",
              requiresAcknowledgement: false,
              requiresResponse: false,
            }),
            sentAt: now,
          },
          select: { id: true },
        });
        const recipient = await tx.governanceOfficialNoticeRecipient.create({
          data: {
            noticeId: notice.id,
            tenantId: cycle.targetTenantId,
            recipientUserId: cycle.targetUserId,
            recipientType: GovernanceOfficialNoticeRecipientType.HEADTEACHER,
            displayName: null,
            roleLabel: "Headteacher",
            phone: null,
            email: null,
            inAppVisible: true,
            metadata: jsonObject({ cycleId, reviewId, releaseProofHash }),
          },
          select: { id: true },
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
            lastAttemptAt: now,
            sentAt: now,
            providerRaw: jsonObject({
              source: "headteacher-staff-feedback-release",
              idempotencyKey: officialNoticeKey,
            }),
          },
        });
        officialCreated = true;
      }

      const created = await tx.appraisalNotification.createMany({
        data: rows,
        skipDuplicates: true,
      });
      if (officialCreated || created.count > 0) {
        await tx.auditLog.create({
          data: {
            tenantId: cycle.targetTenantId,
            userId: actorUserId,
            action: "HEADTEACHER_STAFF_FEEDBACK_RELEASE_NOTIFICATION_QUEUED",
            resource: "AppraisalStaffFeedbackReview",
            resourceId: reviewId,
            ip: input.ip ?? null,
            userAgent: input.userAgent ?? null,
            metadata: {
              reqId,
              cycleId,
              reviewId,
              releaseProofHash,
              officialInAppNoticeCreated: officialCreated,
              externalRowsCreated: created.count,
              recipientIdentityIncluded: false,
              contactDestinationsIncluded: false,
              respondentIdentitiesIncluded: false,
              individualStaffResponsesIncluded: false,
              scoreValuesIncluded: false,
              providerCalled: false,
            },
          },
        });
      }
      return { officialCreated, externalRows: created.count };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait:
        HEADTEACHER_STAFF_FEEDBACK_RELEASE_NOTIFICATION_POLICY.transactionMaxWaitMs,
      timeout:
        HEADTEACHER_STAFF_FEEDBACK_RELEASE_NOTIFICATION_POLICY.transactionTimeoutMs,
    },
  );

  return {
    outcome:
      seeded.officialCreated || seeded.externalRows > 0
        ? "SEEDED"
        : "EXISTING_MATCH",
    cycleId,
    reviewId,
    rowsInserted: seeded.externalRows + (seeded.officialCreated ? 1 : 0),
    officialInAppNoticeVisible: true,
    providerCalled: false,
    respondentIdentitiesAccessed: false,
    individualStaffResponsesAccessed: false,
  };
}
