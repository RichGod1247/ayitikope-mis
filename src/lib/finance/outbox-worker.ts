// src/lib/finance/outbox-worker.ts
import {
  FinanceOutboxEvent,
  FinanceOutboxEventType,
  FinanceOutboxStatus,
  Prisma,
} from "@prisma/client";

import {
  getGuardianEssentialAlertEligibilityMap,
  type GuardianEssentialAlertEligibilityReason,
} from "@/lib/essentialAlerts/enrollment";
import { buildMockResultsReleaseSmsBody } from "@/lib/essentialAlerts/mockResultsReleaseSms";
import { normalizeGhanaPhone } from "@/lib/essentialAlerts/policy";
import { essentialAlertConfiguredParentPortalUrl } from "@/lib/essentialAlerts/publicPage";
import {
  claimFinanceOutboxEvents,
  markFinanceOutboxCompleted,
  markFinanceOutboxFailed,
} from "@/lib/finance/outbox";
import { reprocessPaymentProviderEvent } from "@/lib/finance/provider-event-recovery";
import { prisma } from "@/lib/prisma";
import { sendSms } from "@/lib/sms";

const RESULTS_RELEASE_PURPOSE = "RESULTS_RELEASE" as const;
const ESSENTIAL_ALERT_AUTHORITY = "ESSENTIAL_ALERT_ENROLLMENT" as const;
const MOCK_RESULTS_RELEASE_TEMPLATE = "MOCK_RESULTS_RELEASE_ALERT" as const;

type WorkerResult = {
  claimed: number;
  completed: number;
  failed: number;
};

type OutboxHealthArgs = {
  tenantId?: string | null;
  types?: FinanceOutboxEventType[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNumber(payload: Record<string, unknown>, key: string): number | null {
  const value = payload[key];

  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return [
    ...new Set(
      value
        .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
        .filter(Boolean),
    ),
  ];
}

function cleanStr(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeGuardianNameKey(value: unknown) {
  return cleanStr(value).toLowerCase().replace(/\s+/g, " ");
}

function studentName(student: {
  firstName: string | null;
  lastName: string | null;
}) {
  return (
    [student.firstName, student.lastName].map(cleanStr).filter(Boolean).join(" ") ||
    "Learner"
  );
}

function asJson(value: unknown): Prisma.InputJsonValue {
  try {
    return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
  } catch {
    return { value: String(value) };
  }
}

function readProviderMessageId(result: unknown): string | null {
  if (!isRecord(result)) return null;

  return (
    readString(result, "messageId") ||
    readString(result, "providerMessageId") ||
    readString(result, "message_id") ||
    readString(result, "id")
  );
}

function readProviderStatus(result: unknown): number | null {
  if (!isRecord(result)) return null;

  return (
    readNumber(result, "status") ||
    readNumber(result, "providerStatus") ||
    readNumber(result, "statusCode")
  );
}

function readProviderStatusDescription(result: unknown): string | null {
  if (!isRecord(result)) return null;

  return (
    readString(result, "providerStatusDescription") ||
    readString(result, "statusDescription") ||
    readString(result, "description") ||
    readString(result, "message") ||
    readString(result, "error")
  );
}

async function handleSmsEvent(event: FinanceOutboxEvent) {
  if (!isRecord(event.payload)) {
    throw new Error("SMS outbox payload must be an object.");
  }

  const tenantId = event.tenantId ?? readString(event.payload, "tenantId");
  const to = readString(event.payload, "to");
  const message = readString(event.payload, "message");
  const actorId = readString(event.payload, "actorId");
  const template = readString(event.payload, "template");

  if (!tenantId) throw new Error("SMS outbox payload missing tenantId.");
  if (!to) throw new Error("SMS outbox payload missing to.");
  if (!message) throw new Error("SMS outbox payload missing message.");

  const result = await sendSms({
    tenantId,
    actorId,
    to,
    message,
    template,
    payload: event.payload,
  });

  if (!result.ok) {
    throw new Error(result.error ?? result.providerStatusDescription ?? "SMS send failed.");
  }
}

async function refreshMockResultsReleaseNotifyJob(args: {
  jobId: string;
  releaseId: string;
  lastError?: string | null;
}) {
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    const [sentCount, skippedCount, failedCount, pendingCount, job] =
      await Promise.all([
        tx.mockResultsReleaseNotifyRecipient.count({
          where: { jobId: args.jobId, status: "SENT" },
        }),
        tx.mockResultsReleaseNotifyRecipient.count({
          where: { jobId: args.jobId, status: "SKIPPED" },
        }),
        tx.mockResultsReleaseNotifyRecipient.count({
          where: { jobId: args.jobId, status: "FAILED" },
        }),
        tx.mockResultsReleaseNotifyRecipient.count({
          where: { jobId: args.jobId, status: "PENDING" },
        }),
        tx.mockResultsReleaseNotifyJob.findUnique({
          where: { id: args.jobId },
          select: {
            id: true,
            startedAt: true,
            completedAt: true,
            lastError: true,
          },
        }),
      ]);

    if (!job) return;

    const nextStatus =
      pendingCount > 0
        ? "PROCESSING"
        : failedCount > 0
          ? "FAILED"
          : "COMPLETED";

    const totalTargets = sentCount + skippedCount + failedCount + pendingCount;

    await tx.mockResultsReleaseNotifyJob.update({
      where: { id: args.jobId },
      data: {
        status: nextStatus,
        totalTargets,
        sentCount,
        skippedCount,
        failedCount,
        lastError:
          failedCount > 0 ? args.lastError ?? job.lastError ?? "SMS_SEND_FAILED" : null,
        startedAt: job.startedAt ?? now,
        completedAt: pendingCount === 0 ? job.completedAt ?? now : null,
      },
    });

    if (pendingCount === 0 && failedCount === 0 && sentCount > 0) {
      await tx.mockResultsRelease.updateMany({
        where: {
          id: args.releaseId,
          smsNotifiedAt: null,
        },
        data: {
          smsNotifiedAt: now,
        },
      });
    }
  });
}

async function markMockResultsReleaseRecipientSkipped(args: {
  tenantId: string;
  jobId: string;
  releaseId: string;
  recipientId: bigint;
  actorId: string | null;
  reason: string;
  eligibilityReasons?: GuardianEssentialAlertEligibilityReason[];
}) {
  const skipped = await prisma.$transaction(async (tx) => {
    const result = await tx.mockResultsReleaseNotifyRecipient.updateMany({
      where: {
        id: args.recipientId,
        tenantId: args.tenantId,
        status: { in: ["PENDING", "FAILED"] },
      },
      data: {
        status: "SKIPPED",
        providerMessageId: null,
        providerStatus: null,
        providerStatusDescription: `SKIPPED: ${args.reason}`,
        providerRaw: asJson({
          skipped: true,
          reason: args.reason,
          essentialAlertPurpose: RESULTS_RELEASE_PURPOSE,
          eligibilityAuthority: ESSENTIAL_ALERT_AUTHORITY,
          eligibilityReasons: args.eligibilityReasons ?? [],
          providerCalled: false,
        }),
      },
    });

    if (result.count === 1) {
      await tx.auditLog.create({
        data: {
          tenantId: args.tenantId,
          userId: args.actorId,
          action: "MOCK_RESULTS_RELEASE_SMS_SKIPPED",
          resource: "MockResultsRelease",
          resourceId: args.releaseId,
          metadata: {
            jobId: args.jobId,
            recipientId: String(args.recipientId),
            reason: args.reason,
            essentialAlertPurpose: RESULTS_RELEASE_PURPOSE,
            eligibilityAuthority: ESSENTIAL_ALERT_AUTHORITY,
            eligibilityReasons: args.eligibilityReasons ?? [],
            providerCalled: false,
          },
        },
      });
    }

    return result.count === 1;
  });

  await refreshMockResultsReleaseNotifyJob({
    jobId: args.jobId,
    releaseId: args.releaseId,
  });

  return skipped;
}

async function handleMockResultsReleaseSmsEvent(event: FinanceOutboxEvent) {
  if (!isRecord(event.payload)) {
    throw new Error("Mock results release SMS payload must be an object.");
  }

  const tenantId = event.tenantId ?? readString(event.payload, "tenantId");
  const jobId = readString(event.payload, "jobId");
  const releaseId = readString(event.payload, "releaseId");
  const payloadPhone = readString(event.payload, "guardianPhoneNorm");

  if (!tenantId) throw new Error("Mock results SMS payload missing tenantId.");
  if (!jobId) throw new Error("Mock results SMS payload missing jobId.");
  if (!releaseId) throw new Error("Mock results SMS payload missing releaseId.");
  if (!payloadPhone) {
    throw new Error("Mock results SMS payload missing guardianPhoneNorm.");
  }

  const recipient = await prisma.mockResultsReleaseNotifyRecipient.findFirst({
    where: {
      jobId,
      tenantId,
      guardianPhoneNorm: payloadPhone,
    },
    select: {
      id: true,
      status: true,
      studentIds: true,
      guardianPhoneNorm: true,
      job: {
        select: {
          id: true,
          mockResultsReleaseId: true,
          createdByUserId: true,
          startedAt: true,
          mockResultsRelease: {
            select: {
              id: true,
              tenantId: true,
              mockExamSessionId: true,
              classroomId: true,
              mockLabel: true,
              readinessStatus: true,
              releaseSnapshotHash: true,
              parentVisible: true,
              tenant: {
                select: {
                  id: true,
                  name: true,
                  status: true,
                },
              },
              classroom: {
                select: {
                  id: true,
                  status: true,
                },
              },
              mockExamSession: {
                select: {
                  id: true,
                  status: true,
                },
              },
            },
          },
        },
      },
    },
  });

  // A release/job may have been deliberately removed after queueing. The stale
  // outbox event is then terminal: complete it without ever touching the provider.
  if (!recipient) {
    await refreshMockResultsReleaseNotifyJob({
      jobId,
      releaseId,
    });
    return;
  }

  if (recipient.status === "SENT" || recipient.status === "SKIPPED") {
    await refreshMockResultsReleaseNotifyJob({
      jobId,
      releaseId,
    });
    return;
  }

  if (
    recipient.job.mockResultsReleaseId !== releaseId ||
    recipient.job.mockResultsRelease.id !== releaseId
  ) {
    throw new Error("Mock results SMS release/job identity mismatch.");
  }

  const release = recipient.job.mockResultsRelease;
  const actorId =
    readString(event.payload, "actorId") ?? recipient.job.createdByUserId ?? null;

  // SMS delivery is deliberately at-most-once after provider-attempt admission.
  // FAILED means a provider attempt was either made or became externally ambiguous.
  // A stale/crashed outbox reclaim must therefore close locally without another SMS.
  if (recipient.status === "FAILED") {
    await prisma.auditLog.create({
      data: {
        tenantId,
        userId: actorId,
        action: "MOCK_RESULTS_RELEASE_SMS_REPLAY_SUPPRESSED",
        resource: "MockResultsRelease",
        resourceId: releaseId,
        metadata: {
          jobId,
          recipientId: String(recipient.id),
          outboxEventId: event.id,
          reason: "PRIOR_PROVIDER_ATTEMPT_OR_AMBIGUOUS_OUTCOME",
          automaticReplaySuppressed: true,
          providerCallThisRun: false,
          essentialAlertPurpose: RESULTS_RELEASE_PURPOSE,
          eligibilityAuthority: ESSENTIAL_ALERT_AUTHORITY,
        },
      },
    });

    await refreshMockResultsReleaseNotifyJob({
      jobId,
      releaseId,
      lastError: "SMS_PROVIDER_ATTEMPT_REQUIRES_MANUAL_REVIEW",
    });
    return;
  }

  const releaseEvidenceValid =
    release.tenantId === tenantId &&
    release.tenant.status === "ACTIVE" &&
    release.mockExamSession.status === "LOCKED" &&
    release.parentVisible &&
    ["READY", "OVERRIDE"].includes(String(release.readinessStatus)) &&
    /^[a-f0-9]{64}$/i.test(cleanStr(release.releaseSnapshotHash)) &&
    (!release.classroom.status || release.classroom.status === "ACTIVE");

  if (!releaseEvidenceValid) {
    await markMockResultsReleaseRecipientSkipped({
      tenantId,
      jobId,
      releaseId,
      recipientId: recipient.id,
      actorId,
      reason: "MOCK_RELEASE_NOT_CURRENTLY_ELIGIBLE",
    });
    return;
  }

  const guardianPhoneNorm = normalizeGhanaPhone(recipient.guardianPhoneNorm);

  if (!guardianPhoneNorm) {
    await markMockResultsReleaseRecipientSkipped({
      tenantId,
      jobId,
      releaseId,
      recipientId: recipient.id,
      actorId,
      reason: "RECIPIENT_PHONE_INVALID",
    });
    return;
  }

  const queuedStudentIds = readStringArray(recipient.studentIds);

  if (!queuedStudentIds.length) {
    await markMockResultsReleaseRecipientSkipped({
      tenantId,
      jobId,
      releaseId,
      recipientId: recipient.id,
      actorId,
      reason: "QUEUED_LEARNER_SET_EMPTY",
    });
    return;
  }

  const students = await prisma.student.findMany({
    where: {
      tenantId,
      id: { in: queuedStudentIds },
      status: "ACTIVE",
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

  const eligibility = await getGuardianEssentialAlertEligibilityMap({
    tenantId,
    purpose: RESULTS_RELEASE_PURPOSE,
    students,
  });

  const eligibilityReasons: GuardianEssentialAlertEligibilityReason[] = [];
  const eligibleStudents = students.filter((student) => {
    const result = eligibility.get(student.id);

    if (result) eligibilityReasons.push(result.reason);

    return (
      result?.eligible === true &&
      normalizeGhanaPhone(result.phoneNorm) === guardianPhoneNorm
    );
  });

  if (!eligibleStudents.length) {
    await markMockResultsReleaseRecipientSkipped({
      tenantId,
      jobId,
      releaseId,
      recipientId: recipient.id,
      actorId,
      reason: "ESSENTIAL_ALERT_NOT_CURRENTLY_ELIGIBLE",
      eligibilityReasons,
    });
    return;
  }

  const guardianNameKeys = new Set<string>();
  let missingGuardianNameCount = 0;

  for (const student of eligibleStudents) {
    const key = normalizeGuardianNameKey(student.guardianName);

    if (key) guardianNameKeys.add(key);
    else missingGuardianNameCount += 1;
  }

  const familyAmbiguous =
    eligibleStudents.length > 1 &&
    (missingGuardianNameCount > 0 || guardianNameKeys.size !== 1);

  if (familyAmbiguous) {
    await markMockResultsReleaseRecipientSkipped({
      tenantId,
      jobId,
      releaseId,
      recipientId: recipient.id,
      actorId,
      reason: "GUARDIAN_FAMILY_AMBIGUOUS",
      eligibilityReasons,
    });
    return;
  }

  // Resolve the public destination and final send-time message before durable
  // provider admission. Configuration failures therefore cannot consume the
  // at-most-once provider attempt.
  const eligibleStudentIds = eligibleStudents.map((student) => student.id);
  const eligibleStudentNames = eligibleStudents.map(studentName);
  const parentPortalUrl = essentialAlertConfiguredParentPortalUrl();
  const message = buildMockResultsReleaseSmsBody({
    schoolName: release.tenant.name,
    studentNames: eligibleStudentNames,
    mockLabel: release.mockLabel,
    parentPortalUrl,
  });

  const admittedAt = new Date();
  const providerAttemptAdmitted = await prisma.$transaction(async (tx) => {
    const admitted = await tx.mockResultsReleaseNotifyRecipient.updateMany({
      where: {
        id: recipient.id,
        tenantId,
        jobId,
        status: "PENDING",
      },
      data: {
        // FAILED is intentionally used as the fail-closed durable admission state.
        // If the process dies after this commit, automatic provider replay is forbidden.
        status: "FAILED",
        providerMessageId: null,
        providerStatus: null,
        providerStatusDescription: "PROVIDER_ATTEMPT_ADMITTED",
        providerRaw: asJson({
          providerAttemptAdmitted: true,
          providerAttemptState: "ADMITTED_AMBIGUOUS_UNTIL_RESULT",
          providerCalled: true,
          outboxEventId: event.id,
          jobId,
          releaseId,
          essentialAlertPurpose: RESULTS_RELEASE_PURPOSE,
          eligibilityAuthority: ESSENTIAL_ALERT_AUTHORITY,
          admittedAt: admittedAt.toISOString(),
        }),
      },
    });

    if (admitted.count !== 1) return false;

    await tx.mockResultsReleaseNotifyJob.update({
      where: { id: jobId },
      data: {
        status: "PROCESSING",
        startedAt: recipient.job.startedAt ?? admittedAt,
      },
    });

    await tx.auditLog.create({
      data: {
        tenantId,
        userId: actorId,
        action: "MOCK_RESULTS_RELEASE_SMS_PROVIDER_ATTEMPT_ADMITTED",
        resource: "MockResultsRelease",
        resourceId: releaseId,
        metadata: {
          jobId,
          recipientId: String(recipient.id),
          outboxEventId: event.id,
          providerAttemptAdmitted: true,
          providerAttemptState: "ADMITTED_AMBIGUOUS_UNTIL_RESULT",
          essentialAlertPurpose: RESULTS_RELEASE_PURPOSE,
          eligibilityAuthority: ESSENTIAL_ALERT_AUTHORITY,
        },
      },
    });

    return true;
  });

  if (!providerAttemptAdmitted) {
    throw new Error("MOCK_RESULTS_RELEASE_SMS_PROVIDER_ATTEMPT_ADMISSION_FAILED");
  }

  const result = await sendSms({
    tenantId,
    actorId,
    to: guardianPhoneNorm,
    message,
    template: MOCK_RESULTS_RELEASE_TEMPLATE,
    payload: {
      outboxEventId: event.id,
      jobId,
      releaseId,
      mockExamSessionId: release.mockExamSessionId,
      classroomId: release.classroomId,
      essentialAlertPurpose: RESULTS_RELEASE_PURPOSE,
      eligibilityAuthority: ESSENTIAL_ALERT_AUTHORITY,
      eligibleLearnerCount: eligibleStudentIds.length,
      studentIds: eligibleStudentIds,
      releaseSnapshotHash: release.releaseSnapshotHash,
    },
  });

  if (!result.ok) {
    const errorMessage =
      result.error ?? result.providerStatusDescription ?? "Mock results SMS send failed.";

    await prisma.mockResultsReleaseNotifyRecipient.update({
      where: { id: recipient.id },
      data: {
        status: "FAILED",
        providerMessageId: readProviderMessageId(result),
        providerStatus: readProviderStatus(result),
        providerStatusDescription:
          readProviderStatusDescription(result) ?? errorMessage,
        providerRaw: asJson({
          providerAttemptAdmitted: true,
          providerCalled: true,
          providerOutcome: "NOT_ACCEPTED_OR_AMBIGUOUS",
          result,
        }),
      },
    });

    await refreshMockResultsReleaseNotifyJob({
      jobId,
      releaseId,
      lastError: errorMessage,
    });

    // The provider boundary may already have been crossed. Treat the outbox event
    // as handled and require explicit forensic/manual recovery rather than retrying.
    return;
  }

  await prisma.mockResultsReleaseNotifyRecipient.update({
    where: { id: recipient.id },
    data: {
      status: "SENT",
      studentIds: eligibleStudentIds,
      providerMessageId: readProviderMessageId(result),
      providerStatus: readProviderStatus(result),
      providerStatusDescription: readProviderStatusDescription(result),
      providerRaw: asJson({
        providerAttemptAdmitted: true,
        providerCalled: true,
        providerOutcome: "ACCEPTED",
        result,
      }),
    },
  });

  await refreshMockResultsReleaseNotifyJob({
    jobId,
    releaseId,
  });
}

async function handleProviderEventReprocess(event: FinanceOutboxEvent) {
  if (!isRecord(event.payload)) {
    throw new Error("Provider event recovery payload must be an object.");
  }

  const eventId =
    readString(event.payload, "eventId") ||
    readString(event.payload, "paymentProviderEventId") ||
    event.aggregateId;

  if (!eventId) {
    throw new Error("Provider event recovery payload missing eventId.");
  }

  await reprocessPaymentProviderEvent({
    eventId,
    actorUserId: readString(event.payload, "actorUserId"),
  });
}

async function processFinanceOutboxEvent(event: FinanceOutboxEvent) {
  switch (event.type) {
    case FinanceOutboxEventType.SMS_RECEIPT:
    case FinanceOutboxEventType.SMS_REFUND_NOTICE:
    case FinanceOutboxEventType.SMS_ARREARS_NOTICE:
    case FinanceOutboxEventType.SMS_RESULTS_RELEASE:
      await handleSmsEvent(event);
      return;

    case FinanceOutboxEventType.SMS_MOCK_RESULTS_RELEASE:
      await handleMockResultsReleaseSmsEvent(event);
      return;

    case FinanceOutboxEventType.PAYSTACK_WEBHOOK_CHARGE_SUCCESS:
      await handleProviderEventReprocess(event);
      return;

    case FinanceOutboxEventType.PAYSTACK_WEBHOOK_TRANSFER_EVENT:
      throw new Error(
        "Transfer webhook recovery is not implemented in shared core yet. Keep this event failed/dead for admin review.",
      );

    case FinanceOutboxEventType.SETTLEMENT_PAYOUT_VERIFY:
      throw new Error("Settlement payout verification handler not implemented yet.");

    case FinanceOutboxEventType.RECONCILIATION_RECHECK:
      throw new Error("Reconciliation recheck handler not implemented yet.");

    default:
      throw new Error(`Unknown finance outbox event type: ${String(event.type)}`);
  }
}

export async function runFinanceOutboxWorker(args?: {
  workerId?: string;
  limit?: number;
  types?: FinanceOutboxEventType[];
  tenantId?: string | null;
  aggregateType?: string | null;
  aggregateId?: string | null;
  eventId?: string | null;
  staleProcessingAfterMinutes?: number;
}): Promise<WorkerResult> {
  const workerId = args?.workerId ?? `finance-worker-${process.pid}`;

  const events = await claimFinanceOutboxEvents({
    workerId,
    limit: args?.limit ?? 10,
    types: args?.types,
    tenantId: args?.tenantId,
    aggregateType: args?.aggregateType,
    aggregateId: args?.aggregateId,
    eventId: args?.eventId,
    staleProcessingAfterMinutes: args?.staleProcessingAfterMinutes ?? 15,
  });

  let completed = 0;
  let failed = 0;

  for (const event of events) {
    try {
      await processFinanceOutboxEvent(event);
      await markFinanceOutboxCompleted(event.id);
      completed += 1;
    } catch (error) {
      await markFinanceOutboxFailed(event.id, error);
      failed += 1;
    }
  }

  return {
    claimed: events.length,
    completed,
    failed,
  };
}

export async function getFinanceOutboxHealth(args?: OutboxHealthArgs) {
  const where = {
    ...(args?.tenantId ? { tenantId: args.tenantId } : {}),
    ...(args?.types?.length ? { type: { in: args.types } } : {}),
  };

  const rows = await prisma.financeOutboxEvent.groupBy({
    by: ["status"],
    where,
    _count: { _all: true },
  });

  const base: Record<FinanceOutboxStatus, number> = {
    PENDING: 0,
    PROCESSING: 0,
    COMPLETED: 0,
    FAILED: 0,
    DEAD: 0,
    CANCELLED: 0,
  };

  for (const row of rows) {
    base[row.status] = row._count._all;
  }

  return {
    pending: base.PENDING,
    processing: base.PROCESSING,
    completed: base.COMPLETED,
    failed: base.FAILED,
    dead: base.DEAD,
    cancelled: base.CANCELLED,
  };
}
