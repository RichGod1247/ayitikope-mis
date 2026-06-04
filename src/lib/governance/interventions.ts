// src/lib/governance/interventions.ts
import {
  GovernanceInterventionEventType,
  GovernanceInterventionPriority,
  GovernanceInterventionScopeType,
  GovernanceInterventionStatus,
  Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { GovernanceScope } from "@/lib/governance/scope";

export class GovernanceInterventionError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

type CreateInterventionInput = {
  scopeType?: unknown;
  tenantId?: unknown;
  zoneId?: unknown;
  title?: unknown;
  summary?: unknown;
  priority?: unknown;
  riskScore?: unknown;
  riskLevel?: unknown;
  riskSnapshot?: unknown;
  recommendedActions?: unknown;
  dueAt?: unknown;
  assignedToUserId?: unknown;
  metadata?: unknown;
};

type ListInterventionInput = {
  status?: unknown;
  scopeType?: unknown;
  tenantId?: unknown;
  zoneId?: unknown;
  assignedToMe?: unknown;
  createdByMe?: unknown;
  take?: unknown;
};

type UpdateInterventionInput = {
  caseId?: unknown;
  action?: unknown;
  status?: unknown;
  note?: unknown;
  assignedToUserId?: unknown;
  dueAt?: unknown;
  receiptKind?: unknown;
  messageEventId?: unknown;
  metadata?: unknown;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function upper(value: unknown) {
  return clean(value).toUpperCase();
}

function boolish(value: unknown) {
  const v = upper(value);
  return v === "1" || v === "TRUE" || v === "YES";
}

function intOrNull(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function dateOrNull(value: unknown) {
  const s = clean(value);
  if (!s) return null;

  const d = new Date(s);
  if (Number.isNaN(d.getTime())) {
    throw new GovernanceInterventionError(400, "INVALID_DATE");
  }

  return d;
}

function jsonValue(value: unknown, fallback: unknown): Prisma.InputJsonValue {
  try {
    const safe = value === undefined ? fallback : value;
    return JSON.parse(JSON.stringify(safe)) as Prisma.InputJsonValue;
  } catch {
    return JSON.parse(JSON.stringify(fallback)) as Prisma.InputJsonValue;
  }
}

function jsonObject(value: unknown): Prisma.InputJsonValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return jsonValue({}, {});
  }

  return jsonValue(value, {});
}

function jsonArray(value: unknown): Prisma.InputJsonValue {
  if (!Array.isArray(value)) return jsonValue([], []);
  return jsonValue(value, []);
}

type GovernanceWorkflowReceiptKind =
  | "SISSO_ESCALATION_SEEN_BY_DIRECTOR"
  | "DIRECTOR_DIRECTIVE_SEEN_BY_SISSO";

function normalizeReceiptKind(value: unknown): GovernanceWorkflowReceiptKind {
  const v = upper(value);

  if (v === "SISSO_ESCALATION_SEEN_BY_DIRECTOR") {
    return "SISSO_ESCALATION_SEEN_BY_DIRECTOR";
  }

  if (v === "DIRECTOR_DIRECTIVE_SEEN_BY_SISSO") {
    return "DIRECTOR_DIRECTIVE_SEEN_BY_SISSO";
  }

  throw new GovernanceInterventionError(400, "INVALID_RECEIPT_KIND");
}

function metadataString(metadata: unknown, key: string) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return "";
  }

  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}

function normalizeScopeType(value: unknown): GovernanceInterventionScopeType {
  const v = upper(value);

  if (v === GovernanceInterventionScopeType.SCHOOL) {
    return GovernanceInterventionScopeType.SCHOOL;
  }

  if (v === GovernanceInterventionScopeType.CIRCUIT) {
    return GovernanceInterventionScopeType.CIRCUIT;
  }

  if (v === GovernanceInterventionScopeType.DISTRICT) {
    return GovernanceInterventionScopeType.DISTRICT;
  }

  throw new GovernanceInterventionError(400, "INVALID_SCOPE_TYPE");
}

function normalizePriority(value: unknown): GovernanceInterventionPriority {
  const v = upper(value);

  if (v === GovernanceInterventionPriority.LOW) {
    return GovernanceInterventionPriority.LOW;
  }

  if (v === GovernanceInterventionPriority.HIGH) {
    return GovernanceInterventionPriority.HIGH;
  }

  if (v === GovernanceInterventionPriority.CRITICAL) {
    return GovernanceInterventionPriority.CRITICAL;
  }

  return GovernanceInterventionPriority.MEDIUM;
}

function normalizeStatus(value: unknown): GovernanceInterventionStatus {
  const v = upper(value);

  if (v === GovernanceInterventionStatus.OPEN) {
    return GovernanceInterventionStatus.OPEN;
  }

  if (v === GovernanceInterventionStatus.IN_PROGRESS) {
    return GovernanceInterventionStatus.IN_PROGRESS;
  }

  if (v === GovernanceInterventionStatus.RESOLVED) {
    return GovernanceInterventionStatus.RESOLVED;
  }

  if (v === GovernanceInterventionStatus.ESCALATED) {
    return GovernanceInterventionStatus.ESCALATED;
  }

  if (v === GovernanceInterventionStatus.CANCELLED) {
    return GovernanceInterventionStatus.CANCELLED;
  }

  throw new GovernanceInterventionError(400, "INVALID_STATUS");
}

function eventForStatus(status: GovernanceInterventionStatus) {
  if (status === GovernanceInterventionStatus.RESOLVED) {
    return GovernanceInterventionEventType.RESOLVED;
  }

  if (status === GovernanceInterventionStatus.ESCALATED) {
    return GovernanceInterventionEventType.ESCALATED;
  }

  if (status === GovernanceInterventionStatus.CANCELLED) {
    return GovernanceInterventionEventType.CANCELLED;
  }

  if (status === GovernanceInterventionStatus.OPEN) {
    return GovernanceInterventionEventType.REOPENED;
  }

  return GovernanceInterventionEventType.STATUS_CHANGED;
}

function assertTenantScope(scope: GovernanceScope, tenantId: string) {
  if (scope.isSuperAdmin) return;

  if (!scope.tenantIds.includes(tenantId)) {
    throw new GovernanceInterventionError(
      403,
      "TENANT_OUT_OF_GOVERNANCE_SCOPE"
    );
  }
}

function assertZoneScope(scope: GovernanceScope, zoneId: string) {
  if (scope.isSuperAdmin) return;

  if (!scope.zoneIds.includes(zoneId)) {
    throw new GovernanceInterventionError(
      403,
      "ZONE_OUT_OF_GOVERNANCE_SCOPE"
    );
  }
}

async function resolveTarget(
  scope: GovernanceScope,
  input: CreateInterventionInput
) {
  const scopeType = normalizeScopeType(input.scopeType);

  if (scopeType === GovernanceInterventionScopeType.SCHOOL) {
    const tenantId = clean(input.tenantId);
    if (!tenantId) {
      throw new GovernanceInterventionError(400, "TENANT_ID_REQUIRED");
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        name: true,
        schoolCode: true,
        zoneId: true,
        status: true,
      },
    });

    if (!tenant) {
      throw new GovernanceInterventionError(404, "SCHOOL_NOT_FOUND");
    }

    assertTenantScope(scope, tenant.id);

    return {
      scopeType,
      tenantId: tenant.id,
      zoneId: tenant.zoneId ?? null,
      label: `${tenant.name}${tenant.schoolCode ? ` (${tenant.schoolCode})` : ""}`,
    };
  }

  const zoneId = clean(input.zoneId);
  if (!zoneId) {
    throw new GovernanceInterventionError(400, "ZONE_ID_REQUIRED");
  }

  const zone = await prisma.adminZone.findUnique({
    where: { id: zoneId },
    select: {
      id: true,
      name: true,
      isActive: true,
      zoneType: {
        select: {
          level: true,
          name: true,
        },
      },
    },
  });

  if (!zone || !zone.isActive) {
    throw new GovernanceInterventionError(404, "ZONE_NOT_FOUND");
  }

  assertZoneScope(scope, zone.id);

  if (
    scopeType === GovernanceInterventionScopeType.CIRCUIT &&
    Number(zone.zoneType.level) !== 1
  ) {
    throw new GovernanceInterventionError(400, "ZONE_IS_NOT_CIRCUIT");
  }

  if (
    scopeType === GovernanceInterventionScopeType.DISTRICT &&
    Number(zone.zoneType.level) !== 2
  ) {
    throw new GovernanceInterventionError(400, "ZONE_IS_NOT_DISTRICT");
  }

  return {
    scopeType,
    tenantId: null,
    zoneId: zone.id,
    label: `${zone.name} ${zone.zoneType.name}`,
  };
}

async function assertAssigneeInScope(args: {
  scope: GovernanceScope;
  assignedToUserId: string;
  targetZoneId: string | null;
}) {
  const { scope, assignedToUserId, targetZoneId } = args;

  const allowedZoneIds = scope.isSuperAdmin
    ? targetZoneId
      ? [targetZoneId]
      : undefined
    : targetZoneId
      ? [targetZoneId]
      : scope.zoneIds;

  const assignment = await prisma.governanceOfficerAssignment.findFirst({
    where: {
      userId: assignedToUserId,
      status: "ACTIVE",
      revokedAt: null,
      ...(allowedZoneIds?.length ? { zoneId: { in: allowedZoneIds } } : {}),
    },
    select: { id: true },
  });

  if (!assignment) {
    throw new GovernanceInterventionError(
      400,
      "ASSIGNEE_NOT_ACTIVE_IN_SCOPE"
    );
  }
}

const INTERVENTION_TX_OPTIONS = {
  maxWait: 10_000,
  timeout: 30_000,
};

const interventionNoticeSelect = {
  id: true,
  title: true,
  status: true,
  priority: true,
  sentAt: true,
  createdAt: true,
  idempotencyKey: true,
  idempotencyScope: true,
  recipients: {
    orderBy: { createdAt: "asc" as const },
    select: {
      id: true,
      recipientType: true,
      displayName: true,
      roleLabel: true,
      readAt: true,
      acknowledgedAt: true,
      acknowledgeNote: true,
      respondedAt: true,
      responseBody: true,
      createdAt: true,
      deliveries: {
        orderBy: { createdAt: "asc" as const },
        select: {
          id: true,
          channel: true,
          status: true,
          sentAt: true,
          deliveredAt: true,
          lastError: true,
          createdAt: true,
        },
      },
    },
  },
  deliveries: {
    orderBy: { createdAt: "asc" as const },
    select: {
      id: true,
      channel: true,
      status: true,
      sentAt: true,
      deliveredAt: true,
      lastError: true,
      createdAt: true,
    },
  },
} satisfies Prisma.GovernanceOfficialNoticeSelect;

type InterventionNoticeEvidenceRow =
  Prisma.GovernanceOfficialNoticeGetPayload<{
    select: typeof interventionNoticeSelect;
  }>;

function dateMs(value: Date | string | null | undefined) {
  if (!value) return 0;

  const d = value instanceof Date ? value : new Date(value);
  const t = d.getTime();

  return Number.isFinite(t) ? t : 0;
}

function buildClosureEvidenceFromNotices(
  notices: InterventionNoticeEvidenceRow[]
) {
  const officialNotices = notices.filter((notice) => {
    const scope = String(notice.idempotencyScope ?? "").toLowerCase();
    const key = String(notice.idempotencyKey ?? "").toLowerCase();
    const title = String(notice.title ?? "").toLowerCase();

    return (
      scope.includes("official-intervention") ||
      key.includes("official-intervention") ||
      title.includes("official intervention")
    );
  });

  const evidenceNotices = officialNotices.length ? officialNotices : notices;

  const recipients = evidenceNotices.flatMap((notice) =>
    notice.recipients.map((recipient) => ({
      notice,
      recipient,
    }))
  );

  const noticeDeliveries = evidenceNotices.flatMap(
    (notice) => notice.deliveries ?? []
  );

  const acknowledgedRecipients = recipients.filter(({ recipient }) =>
    Boolean(recipient.acknowledgedAt)
  );

  const respondedRecipients = recipients.filter(
    ({ recipient }) =>
      Boolean(recipient.respondedAt) && Boolean(recipient.responseBody)
  );

  const latestResponse = [...respondedRecipients].sort(
    (a, b) => dateMs(b.recipient.respondedAt) - dateMs(a.recipient.respondedAt)
  )[0];

  const sentDeliveries = noticeDeliveries.filter(
    (delivery) => String(delivery.status).toUpperCase() === "SENT"
  );

  const failedDeliveries = noticeDeliveries.filter(
    (delivery) => String(delivery.status).toUpperCase() === "FAILED"
  );

  const warnings: string[] = [];

  if (!evidenceNotices.length) {
    warnings.push("No official intervention notice has been sent.");
  }

  if (evidenceNotices.length && !recipients.length) {
    warnings.push("The official notice has no recipient evidence.");
  }

  if (recipients.length && !acknowledgedRecipients.length) {
    warnings.push("No recipient has acknowledged the official notice.");
  }

  if (!respondedRecipients.length) {
    warnings.push("No corrective response has been submitted yet.");
  }

  if (failedDeliveries.length) {
    warnings.push("One or more notice delivery channels failed.");
  }

  const hasOfficialNotice = evidenceNotices.length > 0;
  const hasCorrectiveResponse = respondedRecipients.length > 0;

  return {
    hasOfficialNotice,
    hasAcknowledgement: acknowledgedRecipients.length > 0,
    hasCorrectiveResponse,
    canResolve: hasOfficialNotice && hasCorrectiveResponse,
    noticeCount: evidenceNotices.length,
    recipientCount: recipients.length,
    acknowledgedRecipients: acknowledgedRecipients.length,
    respondedRecipients: respondedRecipients.length,
    sentDeliveries: sentDeliveries.length,
    failedDeliveries: failedDeliveries.length,
    latestNoticeId: evidenceNotices[0]?.id ?? null,
    latestNoticeTitle: evidenceNotices[0]?.title ?? null,
    latestResponseBy:
      latestResponse?.recipient.displayName ||
      latestResponse?.recipient.roleLabel ||
      null,
    latestRespondedAt: latestResponse?.recipient.respondedAt ?? null,
    latestResponseBody: latestResponse?.recipient.responseBody ?? null,
    warnings,
  };
}

async function getClosureEvidenceForCase(
  tx: Prisma.TransactionClient,
  caseId: string
) {
  const notices = await tx.governanceOfficialNotice.findMany({
    where: { caseId },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: interventionNoticeSelect,
  });

  return buildClosureEvidenceFromNotices(notices);
}

const interventionSelect = {
  id: true,
  tenantId: true,
  zoneId: true,
  scopeType: true,
  title: true,
  summary: true,
  priority: true,
  status: true,
  riskScore: true,
  riskLevel: true,
  riskSnapshot: true,
  recommendedActions: true,
  dueAt: true,
  createdByUserId: true,
  assignedToUserId: true,
  resolvedByUserId: true,
  cancelledByUserId: true,
  resolvedAt: true,
  escalatedAt: true,
  cancelledAt: true,
  resolutionNote: true,
  cancellationReason: true,
  metadata: true,
  createdAt: true,
  updatedAt: true,
  tenant: {
    select: {
      id: true,
      name: true,
      schoolCode: true,
    },
  },
  zone: {
    select: {
      id: true,
      name: true,
      zoneType: {
        select: {
          name: true,
          level: true,
        },
      },
      parentZone: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  },
  createdBy: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
  assignedTo: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
  events: {
    orderBy: { createdAt: "desc" as const },
    take: 20,
    select: {
      id: true,
      eventType: true,
      fromStatus: true,
      toStatus: true,
      note: true,
      metadata: true,
      createdAt: true,
      actor: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  },
    notices: {
    orderBy: { createdAt: "desc" as const },
    take: 5,
    select: interventionNoticeSelect,
  },
} satisfies Prisma.GovernanceInterventionCaseSelect;

export async function createGovernanceInterventionCase(args: {
  scope: GovernanceScope;
  actorUserId: string;
  input: CreateInterventionInput;
}) {
  const { scope, actorUserId, input } = args;
  const target = await resolveTarget(scope, input);

  const title = clean(input.title);
  const summary = clean(input.summary);
  const assignedToUserId = clean(input.assignedToUserId) || null;

  if (title.length < 6) {
    throw new GovernanceInterventionError(400, "TITLE_TOO_SHORT");
  }

  if (summary.length < 10) {
    throw new GovernanceInterventionError(400, "SUMMARY_TOO_SHORT");
  }

  if (assignedToUserId) {
    await assertAssigneeInScope({
      scope,
      assignedToUserId,
      targetZoneId: target.zoneId,
    });
  }

  const dueAt = dateOrNull(input.dueAt);
  const rawRiskScore = intOrNull(input.riskScore);
  const riskScore = rawRiskScore === null ? null : clamp(rawRiskScore, 0, 100);
  const riskLevel = clean(input.riskLevel) || null;
  const priority = normalizePriority(input.priority);

  return prisma.$transaction(async (tx) => {
    const row = await tx.governanceInterventionCase.create({
      data: {
        tenantId: target.tenantId,
        zoneId: target.zoneId,
        scopeType: target.scopeType,
        title,
        summary,
        priority,
        status: GovernanceInterventionStatus.OPEN,
        riskScore,
        riskLevel,
        riskSnapshot: jsonObject(input.riskSnapshot),
        recommendedActions: jsonArray(input.recommendedActions),
        dueAt,
        createdByUserId: actorUserId,
        assignedToUserId,
        metadata: jsonObject({
          ...(input.metadata &&
          typeof input.metadata === "object" &&
          !Array.isArray(input.metadata)
            ? input.metadata
            : {}),
          targetLabel: target.label,
        }),
      },
      select: interventionSelect,
    });

    await tx.governanceInterventionEvent.create({
      data: {
        caseId: row.id,
        actorUserId,
        eventType: GovernanceInterventionEventType.CREATED,
        toStatus: GovernanceInterventionStatus.OPEN,
        note: `Intervention opened for ${target.label}.`,
        metadata: jsonObject({
          targetLabel: target.label,
          priority,
          assignedToUserId,
        }),
      },
    });

    if (assignedToUserId) {
      await tx.governanceInterventionEvent.create({
        data: {
          caseId: row.id,
          actorUserId,
          eventType: GovernanceInterventionEventType.ASSIGNED,
          toStatus: GovernanceInterventionStatus.OPEN,
          note: "Intervention assigned to responsible officer.",
          metadata: jsonObject({ assignedToUserId }),
        },
      });
    }

    return tx.governanceInterventionCase.findUniqueOrThrow({
      where: { id: row.id },
      select: interventionSelect,
    });
  }, INTERVENTION_TX_OPTIONS);
}

function scopedWhere(
  scope: GovernanceScope
): Prisma.GovernanceInterventionCaseWhereInput {
  if (scope.isSuperAdmin) return {};

  return {
    OR: [
      {
        tenantId: {
          in: scope.tenantIds.length ? scope.tenantIds : ["__none__"],
        },
      },
      {
        zoneId: {
          in: scope.zoneIds.length ? scope.zoneIds : ["__none__"],
        },
      },
    ],
  };
}

export async function listGovernanceInterventionCases(args: {
  scope: GovernanceScope;
  actorUserId: string;
  input: ListInterventionInput;
}) {
  const { scope, actorUserId, input } = args;

  const statusRaw = upper(input.status);
  const scopeTypeRaw = upper(input.scopeType);
  const tenantId = clean(input.tenantId);
  const zoneId = clean(input.zoneId);
  const takeRaw = intOrNull(input.take);
  const take = clamp(takeRaw ?? 50, 1, 100);

  const where: Prisma.GovernanceInterventionCaseWhereInput = {
    AND: [scopedWhere(scope)],
  };

  if (statusRaw) {
    where.status = normalizeStatus(statusRaw);
  }

  if (scopeTypeRaw) {
    where.scopeType = normalizeScopeType(scopeTypeRaw);
  }

  if (tenantId) {
    assertTenantScope(scope, tenantId);
    where.tenantId = tenantId;
  }

  if (zoneId) {
    assertZoneScope(scope, zoneId);
    where.zoneId = zoneId;
  }

  if (boolish(input.assignedToMe)) {
    where.assignedToUserId = actorUserId;
  }

  if (boolish(input.createdByMe)) {
    where.createdByUserId = actorUserId;
  }

  return prisma.governanceInterventionCase.findMany({
    where,
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take,
    select: interventionSelect,
  });
}

async function findCaseInScope(args: {
  scope: GovernanceScope;
  caseId: string;
}) {
  const { scope, caseId } = args;

  const row = await prisma.governanceInterventionCase.findFirst({
    where: {
      id: caseId,
      ...scopedWhere(scope),
    },
    select: {
      id: true,
      status: true,
      tenantId: true,
      zoneId: true,
    },
  });

  if (!row) {
    throw new GovernanceInterventionError(404, "INTERVENTION_NOT_FOUND");
  }

  return row;
}

export async function updateGovernanceInterventionCase(args: {
  scope: GovernanceScope;
  actorUserId: string;
  input: UpdateInterventionInput;
}) {
  const { scope, actorUserId, input } = args;

  const caseId = clean(input.caseId);
  if (!caseId) {
    throw new GovernanceInterventionError(400, "CASE_ID_REQUIRED");
  }

  const row = await findCaseInScope({ scope, caseId });
  const action = upper(input.action) || "COMMENT";
  const note = clean(input.note);
  const assignedToUserId = clean(input.assignedToUserId) || null;
  const dueAt =
    input.dueAt === undefined ? undefined : dateOrNull(input.dueAt);

  if (action === "COMMENT") {
    if (note.length < 2) {
      throw new GovernanceInterventionError(400, "COMMENT_REQUIRED");
    }

    await prisma.governanceInterventionEvent.create({
      data: {
        caseId,
        actorUserId,
        eventType: GovernanceInterventionEventType.COMMENT,
        fromStatus: row.status,
        toStatus: row.status,
        note,
        metadata: jsonObject(input.metadata),
      },
    });

    return prisma.governanceInterventionCase.findUniqueOrThrow({
      where: { id: caseId },
      select: interventionSelect,
    });
  }

    if (action === "RECEIPT") {
    const receiptKind = normalizeReceiptKind(input.receiptKind);
    const messageEventId = clean(input.messageEventId);

    if (!messageEventId) {
      throw new GovernanceInterventionError(400, "MESSAGE_EVENT_ID_REQUIRED");
    }

    const targetEvent = await prisma.governanceInterventionEvent.findFirst({
      where: {
        id: messageEventId,
        caseId,
      },
      select: {
        id: true,
        eventType: true,
        note: true,
        createdAt: true,
      },
    });

    if (!targetEvent) {
      throw new GovernanceInterventionError(404, "MESSAGE_EVENT_NOT_FOUND");
    }

    const possibleReceipts = await prisma.governanceInterventionEvent.findMany({
      where: {
        caseId,
        actorUserId,
        eventType: GovernanceInterventionEventType.COMMENT,
      },
      select: {
        id: true,
        metadata: true,
      },
      take: 50,
    });

    const alreadyRecorded = possibleReceipts.some((event) => {
      return (
        metadataString(event.metadata, "kind") === "READ_RECEIPT" &&
        metadataString(event.metadata, "receiptKind") === receiptKind &&
        metadataString(event.metadata, "messageEventId") === messageEventId
      );
    });

    if (!alreadyRecorded) {
      await prisma.governanceInterventionEvent.create({
        data: {
          caseId,
          actorUserId,
          eventType: GovernanceInterventionEventType.COMMENT,
          fromStatus: row.status,
          toStatus: row.status,
          note: "Read receipt recorded.",
          metadata: jsonObject({
            kind: "READ_RECEIPT",
            receiptKind,
            messageEventId,
            seenAt: new Date().toISOString(),
            source: "B6E-governance-read-receipt",
            extra: input.metadata,
          }),
        },
      });
    }

    return prisma.governanceInterventionCase.findUniqueOrThrow({
      where: { id: caseId },
      select: interventionSelect,
    });
  }

  if (action === "ASSIGN") {
    if (!assignedToUserId) {
      throw new GovernanceInterventionError(400, "ASSIGNEE_REQUIRED");
    }

    await assertAssigneeInScope({
      scope,
      assignedToUserId,
      targetZoneId: row.zoneId,
    });

    return prisma.$transaction(async (tx) => {
      await tx.governanceInterventionCase.update({
        where: { id: caseId },
        data: {
          assignedToUserId,
          ...(dueAt !== undefined ? { dueAt } : {}),
        },
      });

      await tx.governanceInterventionEvent.create({
        data: {
          caseId,
          actorUserId,
          eventType: GovernanceInterventionEventType.ASSIGNED,
          fromStatus: row.status,
          toStatus: row.status,
          note: note || "Intervention assigned to responsible officer.",
          metadata: jsonObject({
            assignedToUserId,
            dueAt,
            extra: input.metadata,
          }),
        },
      });

      return tx.governanceInterventionCase.findUniqueOrThrow({
        where: { id: caseId },
        select: interventionSelect,
      });
    }, INTERVENTION_TX_OPTIONS);
  }

    if (action === "STATUS") {
    const nextStatus = normalizeStatus(input.status);
    const now = new Date();

    return prisma.$transaction(async (tx) => {
      const statusData: Prisma.GovernanceInterventionCaseUpdateInput = {
        status: nextStatus,
        ...(dueAt !== undefined ? { dueAt } : {}),
      };

      let closureEvidence: Awaited<
        ReturnType<typeof getClosureEvidenceForCase>
      > | null = null;

      let eventNote =
        note || `Status changed from ${row.status} to ${nextStatus}.`;

      if (nextStatus === GovernanceInterventionStatus.IN_PROGRESS) {
        statusData.resolvedAt = null;
        statusData.resolvedBy = { disconnect: true };
        statusData.cancelledAt = null;
        statusData.cancelledBy = { disconnect: true };
        statusData.cancellationReason = null;
        statusData.resolutionNote = null;
      }

      if (nextStatus === GovernanceInterventionStatus.RESOLVED) {
        closureEvidence = await getClosureEvidenceForCase(tx, caseId);

        if (!closureEvidence.canResolve) {
          throw new GovernanceInterventionError(
            409,
            "CASE_CLOSURE_EVIDENCE_INCOMPLETE"
          );
        }

        eventNote =
          note ||
          [
            "Case resolved after official notice response evidence.",
            closureEvidence.latestResponseBy
              ? `Respondent: ${closureEvidence.latestResponseBy}.`
              : "",
            closureEvidence.latestRespondedAt
              ? `Responded at: ${new Date(
                  closureEvidence.latestRespondedAt
                ).toISOString()}.`
              : "",
            closureEvidence.latestResponseBody
              ? `Response: ${String(closureEvidence.latestResponseBody).slice(
                  0,
                  260
                )}`
              : "",
          ]
            .filter(Boolean)
            .join(" ");

        statusData.resolvedAt = now;
        statusData.resolvedBy = { connect: { id: actorUserId } };
        statusData.resolutionNote = eventNote;
      }

      if (nextStatus === GovernanceInterventionStatus.ESCALATED) {
        statusData.escalatedAt = now;
      }

      if (nextStatus === GovernanceInterventionStatus.CANCELLED) {
        statusData.cancelledAt = now;
        statusData.cancelledBy = { connect: { id: actorUserId } };
        statusData.cancellationReason = note || "Cancelled.";
      }

      if (nextStatus === GovernanceInterventionStatus.OPEN) {
        statusData.resolvedAt = null;
        statusData.resolvedBy = { disconnect: true };
        statusData.cancelledAt = null;
        statusData.cancelledBy = { disconnect: true };
        statusData.cancellationReason = null;
        statusData.resolutionNote = null;
      }

      await tx.governanceInterventionCase.update({
        where: { id: caseId },
        data: statusData,
      });

      await tx.governanceInterventionEvent.create({
        data: {
          caseId,
          actorUserId,
          eventType: eventForStatus(nextStatus),
          fromStatus: row.status,
          toStatus: nextStatus,
          note: eventNote,
          metadata: jsonObject({
            source: "governance-intervention-status-update",
            extra: input.metadata,
            closureEvidence,
          }),
        },
      });

      return tx.governanceInterventionCase.findUniqueOrThrow({
        where: { id: caseId },
        select: interventionSelect,
      });
    }, INTERVENTION_TX_OPTIONS);
  }

  throw new GovernanceInterventionError(400, "INVALID_ACTION");
}