import { createHash } from "crypto";
import {
  Prisma,
  type AppraisalIdentityAccessPurpose,
} from "@prisma/client";
import { APPRAISAL_AUDIT_ACTIONS } from "@/lib/appraisals/audit";
import { assertAppraisalAuthority } from "@/lib/appraisals/authority";
import { DIRECTOR_FEEDBACK_POLICY } from "@/lib/appraisals/directorFeedback";
import {
  DIRECTOR_FEEDBACK_MASKED_RESPONDENT_POLICY,
} from "@/lib/appraisals/directorFeedbackRespondents";
import { HEADTEACHER_FEEDBACK_POLICY } from "@/lib/appraisals/headteacherFeedback";
import { APPRAISAL_INSTRUMENT_CODES } from "@/lib/appraisals/instruments";
import { prisma } from "@/lib/prisma";

export const CONFIDENTIAL_IDENTITY_AUDIT_POLICY = {
  schemaVersion: 1,
  audience: "SUPERADMIN",
  requiredCapability: "VIEW_CONFIDENTIAL_RESPONDENTS",
  supportedWorkflows: [
    "HEADTEACHER_STAFF_FEEDBACK",
    "DIRECTOR_FEEDBACK",
  ] as const,
  purposes: [
    "ACCOUNTABILITY_REVIEW",
    "INVESTIGATION",
    "SUPPORT",
    "LEGAL_COMPLIANCE",
  ] as const satisfies readonly AppraisalIdentityAccessPurpose[],
  reasonMinLength: 12,
  reasonMaxLength: 500,
  oneRespondentPerReveal: true,
  finalizedResponsesOnly: true,
  revealRequiresAuditCommit: true,
  bulkRevealAllowed: false,
  exportAllowed: false,
  browserPersistenceAllowed: false,
  providerCallsAllowed: false,
} as const;

export type ConfidentialIdentityAuditWorkflow =
  (typeof CONFIDENTIAL_IDENTITY_AUDIT_POLICY.supportedWorkflows)[number];

export type ConfidentialIdentityAuditCycleSummary = {
  cycleId: string;
  workflow: ConfidentialIdentityAuditWorkflow;
  status: string;
  instrumentTitle: string;
  targetLabel: string;
  jurisdictionLabel: string;
  finalizedResponses: number;
};

export type ConfidentialIdentityAuditRespondentSummary = {
  respondentKey: string;
  label: string;
  contextLabel: string;
  responseStatus: "FINALIZED";
};

export type ConfidentialIdentityAuditRespondentList = {
  cycle: ConfidentialIdentityAuditCycleSummary;
  respondents: ConfidentialIdentityAuditRespondentSummary[];
  privacy: {
    identitiesIncluded: false;
    userIdsIncluded: false;
    participantIdsIncluded: false;
    responseIdsIncluded: false;
    emailsIncluded: false;
    phoneNumbersIncluded: false;
  };
};

export type ConfidentialIdentityRevealResult = {
  outcome: "REVEALED";
  cycle: ConfidentialIdentityAuditCycleSummary;
  respondent: {
    label: string;
    contextLabel: string;
  };
  identity: {
    displayName: string;
    email: string;
    role: string;
    schoolName: string | null;
  };
  audit: {
    recorded: true;
    purpose: AppraisalIdentityAccessPurpose;
    createdAt: string;
  };
};

export class ConfidentialIdentityAuditError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number) {
    super(code);
    this.name = "ConfidentialIdentityAuditError";
    this.code = code;
    this.status = status;
  }
}

const SUPPORTED_CODES = [
  APPRAISAL_INSTRUMENT_CODES.HEADTEACHER_STAFF_FEEDBACK_V1,
  APPRAISAL_INSTRUMENT_CODES.DIRECTOR_GOVERNANCE_APPRAISAL_V1,
] as const;

const CYCLE_DETAIL_SELECT = {
  id: true,
  status: true,
  identityVisibility: true,
  targetNameSnapshot: true,
  targetRoleSnapshot: true,
  targetSchoolNameSnapshot: true,
  targetZoneNameSnapshot: true,
  scopeZoneId: true,
  reviewStartedAt: true,
  releasedAt: true,
  metadata: true,
  scopeZone: {
    select: {
      id: true,
      name: true,
      isActive: true,
      zoneType: {
        select: {
          level: true,
          countryCode: true,
        },
      },
    },
  },
  instrumentVersion: {
    select: {
      id: true,
      version: true,
      status: true,
      title: true,
      instrument: {
        select: {
          code: true,
          purpose: true,
          subjectType: true,
          isActive: true,
        },
      },
    },
  },
  participants: {
    where: {
      status: "FINALIZED",
    },
    orderBy: {
      id: "asc",
    },
    select: {
      id: true,
      status: true,
      respondentTenantId: true,
      respondentRoleSnapshot: true,
      eligibilitySnapshotJson: true,
      finalizedAt: true,
      response: {
        select: {
          id: true,
          status: true,
          responseHash: true,
          finalizedAt: true,
        },
      },
    },
  },
  aggregates: {
    orderBy: {
      version: "desc",
    },
    take: 2,
    select: {
      version: true,
      finalizedResponses: true,
      minimumResponses: true,
      releaseEligible: true,
      sourceHash: true,
      metadata: true,
    },
  },
} as const satisfies Prisma.AppraisalCycleSelect;

type CycleDetail = Prisma.AppraisalCycleGetPayload<{
  select: typeof CYCLE_DETAIL_SELECT;
}>;

type QueryClient = Pick<
  Prisma.TransactionClient,
  "membership" | "appraisalCycle"
>;

type ResolvedRespondent = {
  participantId: string;
  responseId: string;
  respondentTenantId: string | null;
  label: string;
  contextLabel: string;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function objectValue(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function fail(code: string, status: number): never {
  throw new ConfidentialIdentityAuditError(code, status);
}

function requireUuid(value: unknown, fieldName: string) {
  const id = clean(value);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    fail(`CONFIDENTIAL_IDENTITY_AUDIT_INVALID_${fieldName.toUpperCase()}`, 400);
  }
  return id;
}

function requireActorId(value: unknown) {
  const id = clean(value);
  if (!/^[A-Za-z0-9_-]{5,180}$/.test(id)) {
    fail("CONFIDENTIAL_IDENTITY_AUDIT_INVALID_ACTOR", 400);
  }
  return id;
}

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function supportedWorkflow(cycle: CycleDetail): ConfidentialIdentityAuditWorkflow {
  const code = cycle.instrumentVersion.instrument.code;

  if (code === APPRAISAL_INSTRUMENT_CODES.HEADTEACHER_STAFF_FEEDBACK_V1) {
    return "HEADTEACHER_STAFF_FEEDBACK";
  }

  if (code === APPRAISAL_INSTRUMENT_CODES.DIRECTOR_GOVERNANCE_APPRAISAL_V1) {
    return "DIRECTOR_FEEDBACK";
  }

  fail("CONFIDENTIAL_IDENTITY_AUDIT_WORKFLOW_UNSUPPORTED", 409);
}

function assertFinalizedParticipantRows(cycle: CycleDetail) {
  for (const participant of cycle.participants) {
    if (
      participant.status !== "FINALIZED" ||
      !participant.finalizedAt ||
      participant.response?.status !== "FINALIZED" ||
      !participant.response.finalizedAt ||
      !/^[a-f0-9]{64}$/i.test(clean(participant.response.responseHash))
    ) {
      fail("CONFIDENTIAL_IDENTITY_AUDIT_FINALIZED_RESPONSE_INVALID", 409);
    }
  }
}

function assertHeadteacherCycle(cycle: CycleDetail) {
  const metadata = objectValue(cycle.metadata);
  const statusAllowed = ["CLOSED", "UNDER_REVIEW", "RELEASED"].includes(
    cycle.status,
  );

  if (
    !statusAllowed ||
    cycle.targetRoleSnapshot !== HEADTEACHER_FEEDBACK_POLICY.targetRole ||
    cycle.identityVisibility !==
      HEADTEACHER_FEEDBACK_POLICY.identityVisibilityStorageValue ||
    cycle.instrumentVersion.version !== HEADTEACHER_FEEDBACK_POLICY.instrumentVersion ||
    cycle.instrumentVersion.status !== "ACTIVE" ||
    cycle.instrumentVersion.instrument.code !== HEADTEACHER_FEEDBACK_POLICY.instrumentCode ||
    cycle.instrumentVersion.instrument.purpose !== "HEADTEACHER_STAFF_FEEDBACK" ||
    cycle.instrumentVersion.instrument.subjectType !== "HEADTEACHER" ||
    cycle.instrumentVersion.instrument.isActive !== true ||
    clean(metadata.workflow) !== HEADTEACHER_FEEDBACK_POLICY.workflow
  ) {
    fail("CONFIDENTIAL_IDENTITY_AUDIT_HEADTEACHER_CYCLE_INVALID", 409);
  }

  if (
    cycle.aggregates.length !== 1 ||
    cycle.aggregates[0].version !== 1 ||
    cycle.aggregates[0].finalizedResponses !== cycle.participants.length ||
    !/^[a-f0-9]{64}$/i.test(clean(cycle.aggregates[0].sourceHash))
  ) {
    fail("CONFIDENTIAL_IDENTITY_AUDIT_HEADTEACHER_AGGREGATE_INVALID", 409);
  }

  assertFinalizedParticipantRows(cycle);
}

function assertDirectorCycle(cycle: CycleDetail) {
  const metadata = objectValue(cycle.metadata);
  const aggregate = cycle.aggregates[0];

  if (
    !["UNDER_REVIEW", "RELEASED"].includes(cycle.status) ||
    !cycle.reviewStartedAt ||
    cycle.targetRoleSnapshot !== "DISTRICT_DIRECTOR" ||
    cycle.identityVisibility !== DIRECTOR_FEEDBACK_POLICY.identityVisibilityStorageValue ||
    cycle.instrumentVersion.version !== DIRECTOR_FEEDBACK_POLICY.instrumentVersion ||
    cycle.instrumentVersion.status !== "ACTIVE" ||
    cycle.instrumentVersion.instrument.code !== DIRECTOR_FEEDBACK_POLICY.instrumentCode ||
    cycle.instrumentVersion.instrument.purpose !== "GOVERNANCE_OFFICER_FEEDBACK" ||
    cycle.instrumentVersion.instrument.subjectType !== "GOVERNANCE_OFFICER" ||
    cycle.instrumentVersion.instrument.isActive !== true ||
    clean(metadata.workflow) !== DIRECTOR_FEEDBACK_POLICY.workflow ||
    !aggregate ||
    aggregate.releaseEligible !== true ||
    aggregate.finalizedResponses < aggregate.minimumResponses ||
    aggregate.finalizedResponses < DIRECTOR_FEEDBACK_POLICY.minimumMunicipalResponses ||
    !/^[a-f0-9]{64}$/i.test(clean(aggregate.sourceHash))
  ) {
    fail("CONFIDENTIAL_IDENTITY_AUDIT_DIRECTOR_CYCLE_INVALID", 409);
  }

  assertFinalizedParticipantRows(cycle);
}

function assertCycleContract(cycle: CycleDetail) {
  const workflow = supportedWorkflow(cycle);

  if (workflow === "HEADTEACHER_STAFF_FEEDBACK") {
    assertHeadteacherCycle(cycle);
  } else {
    assertDirectorCycle(cycle);
  }

  return workflow;
}

function cycleSummary(cycle: CycleDetail): ConfidentialIdentityAuditCycleSummary {
  const workflow = assertCycleContract(cycle);
  const aggregate = cycle.aggregates[0];

  return {
    cycleId: cycle.id,
    workflow,
    status: cycle.status,
    instrumentTitle: cycle.instrumentVersion.title,
    targetLabel:
      clean(cycle.targetNameSnapshot) ||
      (workflow === "DIRECTOR_FEEDBACK" ? "District Director" : "Headteacher"),
    jurisdictionLabel:
      clean(cycle.targetSchoolNameSnapshot) ||
      clean(cycle.targetZoneNameSnapshot) ||
      clean(cycle.scopeZone.name) ||
      "Governance jurisdiction",
    finalizedResponses:
      aggregate?.finalizedResponses ?? cycle.participants.length,
  };
}

async function assertActiveSuperadmin(
  database: QueryClient,
  actorUserId: string,
) {
  const membership = await database.membership.findFirst({
    where: {
      userId: actorUserId,
      status: "ACTIVE",
      role: {
        name: "SUPERADMIN",
      },
    },
    select: {
      id: true,
    },
  });

  if (!membership) {
    fail("CONFIDENTIAL_IDENTITY_AUDIT_FORBIDDEN", 403);
  }

  assertAppraisalAuthority(
    {
      actorUserId,
      roleName: "SUPERADMIN",
    },
    CONFIDENTIAL_IDENTITY_AUDIT_POLICY.requiredCapability,
  );
}

async function loadCycle(
  database: QueryClient,
  cycleId: string,
) {
  const cycle = await database.appraisalCycle.findUnique({
    where: {
      id: cycleId,
    },
    select: CYCLE_DETAIL_SELECT,
  });

  if (!cycle) {
    fail("CONFIDENTIAL_IDENTITY_AUDIT_CYCLE_NOT_FOUND", 404);
  }

  assertCycleContract(cycle);
  return cycle;
}

function headteacherRespondents(cycle: CycleDetail) {
  const sorted = [...cycle.participants].sort((left, right) => {
    const leftHash = clean(left.response?.responseHash).toLowerCase();
    const rightHash = clean(right.response?.responseHash).toLowerCase();
    return (
      leftHash.localeCompare(rightHash) ||
      clean(left.response?.id).localeCompare(clean(right.response?.id))
    );
  });

  return sorted.map((participant, index) => ({
    participant,
    respondentKey: `headteacher:respondent-${index + 1}`,
    label: `Respondent ${index + 1}`,
    contextLabel: "Confidential teacher feedback",
  }));
}

function directorCircuitDisclosure(cycle: CycleDetail) {
  const aggregate = cycle.aggregates[0];
  if (!aggregate) {
    fail("CONFIDENTIAL_IDENTITY_AUDIT_DIRECTOR_AGGREGATE_MISSING", 409);
  }

  const disclosure = objectValue(objectValue(aggregate.metadata).circuitDisclosure);
  const threshold = Number(disclosure.threshold);
  const effectiveThreshold = Number.isInteger(threshold)
    ? threshold
    : DIRECTOR_FEEDBACK_POLICY.circuitDisclosureThreshold;

  if (effectiveThreshold < DIRECTOR_FEEDBACK_POLICY.circuitDisclosureThreshold) {
    fail("CONFIDENTIAL_IDENTITY_AUDIT_DIRECTOR_THRESHOLD_INVALID", 409);
  }

  return arrayValue(disclosure.visibleCircuits)
    .map((value) => objectValue(value))
    .map((row) => ({
      circuitZoneId: clean(row.circuitZoneId),
      circuitName: clean(row.circuitName),
      finalizedResponses: Number(row.finalizedResponses),
      threshold: effectiveThreshold,
    }))
    .filter(
      (row) =>
        /^[A-Za-z0-9_-]{5,180}$/.test(row.circuitZoneId) &&
        Boolean(row.circuitName) &&
        Number.isInteger(row.finalizedResponses) &&
        row.finalizedResponses >= row.threshold,
    );
}

function circuitSnapshot(value: unknown) {
  const snapshot = objectValue(value);
  return {
    circuitZoneId: clean(snapshot.circuitZoneId),
    circuitName: clean(snapshot.circuitName),
  };
}

function directorRespondents(cycle: CycleDetail) {
  const disclosedCircuits = directorCircuitDisclosure(cycle);
  const rows: Array<{
    participant: CycleDetail["participants"][number];
    respondentKey: string;
    label: string;
    contextLabel: string;
  }> = [];

  for (const circuit of disclosedCircuits) {
    const members = cycle.participants
      .filter((participant) => {
        const snapshot = circuitSnapshot(participant.eligibilitySnapshotJson);
        return snapshot.circuitZoneId === circuit.circuitZoneId;
      })
      .map((participant) => {
        const responseHash = clean(participant.response?.responseHash);
        const seed = sha256(
          [
            "director-feedback-mask",
            DIRECTOR_FEEDBACK_MASKED_RESPONDENT_POLICY.maskSeedVersion,
            cycle.id,
            participant.id,
            responseHash,
          ].join("|"),
        );

        return {
          participant,
          seed,
          maskedRespondentKey: seed.slice(
            0,
            DIRECTOR_FEEDBACK_MASKED_RESPONDENT_POLICY.maskedKeyLength,
          ),
        };
      })
      .sort((left, right) => left.seed.localeCompare(right.seed));

    if (members.length !== circuit.finalizedResponses) {
      fail("CONFIDENTIAL_IDENTITY_AUDIT_DIRECTOR_CIRCUIT_COUNT_DRIFT", 409);
    }

    members.forEach((member, index) => {
      rows.push({
        participant: member.participant,
        respondentKey: `director:${circuit.circuitZoneId}:${member.maskedRespondentKey}`,
        label: `Respondent ${index + 1}`,
        contextLabel: circuit.circuitName,
      });
    });
  }

  return rows.sort(
    (left, right) =>
      left.contextLabel.localeCompare(right.contextLabel) ||
      left.label.localeCompare(right.label),
  );
}

function respondentRows(cycle: CycleDetail) {
  const workflow = assertCycleContract(cycle);
  return workflow === "HEADTEACHER_STAFF_FEEDBACK"
    ? headteacherRespondents(cycle)
    : directorRespondents(cycle);
}

function resolveRespondent(cycle: CycleDetail, requestedKey: unknown): ResolvedRespondent {
  const key = clean(requestedKey);
  if (!key || key.length > 260) {
    fail("CONFIDENTIAL_IDENTITY_AUDIT_RESPONDENT_KEY_INVALID", 400);
  }

  const row = respondentRows(cycle).find(
    (candidate) => candidate.respondentKey === key,
  );

  if (!row?.participant.response) {
    fail("CONFIDENTIAL_IDENTITY_AUDIT_RESPONDENT_NOT_FOUND", 404);
  }

  return {
    participantId: row.participant.id,
    responseId: row.participant.response.id,
    respondentTenantId: row.participant.respondentTenantId,
    label: row.label,
    contextLabel: row.contextLabel,
  };
}

function validatePurpose(value: unknown): AppraisalIdentityAccessPurpose {
  const purpose = clean(value) as AppraisalIdentityAccessPurpose;
  if (!CONFIDENTIAL_IDENTITY_AUDIT_POLICY.purposes.includes(purpose)) {
    fail("CONFIDENTIAL_IDENTITY_AUDIT_PURPOSE_INVALID", 400);
  }
  return purpose;
}

function validateReason(value: unknown) {
  const reason = clean(value);
  if (
    reason.length < CONFIDENTIAL_IDENTITY_AUDIT_POLICY.reasonMinLength ||
    reason.length > CONFIDENTIAL_IDENTITY_AUDIT_POLICY.reasonMaxLength
  ) {
    fail("CONFIDENTIAL_IDENTITY_AUDIT_REASON_INVALID", 400);
  }
  return reason;
}

function safeIp(value: unknown) {
  const ip = clean(value);
  return ip ? ip.slice(0, 64) : null;
}

function displayName(user: {
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string;
}) {
  return (
    clean(user.name) ||
    [clean(user.firstName), clean(user.lastName)].filter(Boolean).join(" ") ||
    clean(user.email) ||
    "Respondent"
  );
}

export async function listConfidentialIdentityAuditCycles(input: {
  actorUserId: string;
}) {
  const actorUserId = requireActorId(input.actorUserId);
  await assertActiveSuperadmin(prisma, actorUserId);

  const cycles = await prisma.appraisalCycle.findMany({
    where: {
      status: {
        in: ["CLOSED", "UNDER_REVIEW", "RELEASED"],
      },
      instrumentVersion: {
        instrument: {
          code: {
            in: [...SUPPORTED_CODES],
          },
        },
      },
    },
    select: CYCLE_DETAIL_SELECT,
    orderBy: {
      updatedAt: "desc",
    },
    take: 100,
  });

  return cycles
    .map((cycle) => {
      try {
        return cycleSummary(cycle);
      } catch (error) {
        if (error instanceof ConfidentialIdentityAuditError) return null;
        throw error;
      }
    })
    .filter((cycle): cycle is ConfidentialIdentityAuditCycleSummary => Boolean(cycle));
}

export async function listConfidentialIdentityAuditRespondents(input: {
  actorUserId: string;
  cycleId: string;
}): Promise<ConfidentialIdentityAuditRespondentList> {
  const actorUserId = requireActorId(input.actorUserId);
  const cycleId = requireUuid(input.cycleId, "cycle_id");

  await assertActiveSuperadmin(prisma, actorUserId);
  const cycle = await loadCycle(prisma, cycleId);
  const respondents = respondentRows(cycle).map((row) => ({
    respondentKey: row.respondentKey,
    label: row.label,
    contextLabel: row.contextLabel,
    responseStatus: "FINALIZED" as const,
  }));

  return {
    cycle: cycleSummary(cycle),
    respondents,
    privacy: {
      identitiesIncluded: false,
      userIdsIncluded: false,
      participantIdsIncluded: false,
      responseIdsIncluded: false,
      emailsIncluded: false,
      phoneNumbersIncluded: false,
    },
  };
}

export async function revealConfidentialRespondentIdentity(input: {
  actorUserId: string;
  cycleId: string;
  respondentKey: string;
  purpose: unknown;
  reason: unknown;
  confirm: unknown;
  reqId: string;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<ConfidentialIdentityRevealResult> {
  const actorUserId = requireActorId(input.actorUserId);
  const cycleId = requireUuid(input.cycleId, "cycle_id");
  const reqId = requireUuid(input.reqId, "request_id");
  const purpose = validatePurpose(input.purpose);
  const reason = validateReason(input.reason);

  if (input.confirm !== true) {
    fail("CONFIDENTIAL_IDENTITY_AUDIT_CONFIRMATION_REQUIRED", 400);
  }

  return prisma.$transaction(
    async (tx) => {
      await assertActiveSuperadmin(tx, actorUserId);

      const cycle = await loadCycle(tx, cycleId);
      const selected = resolveRespondent(cycle, input.respondentKey);

      const access = await tx.appraisalIdentityAccess.create({
        data: {
          cycleId: cycle.id,
          participantId: selected.participantId,
          responseId: selected.responseId,
          actorUserId,
          purpose,
          reason,
          ip: safeIp(input.ip),
          userAgent: clean(input.userAgent) || null,
        },
        select: {
          id: true,
          createdAt: true,
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId: selected.respondentTenantId ?? undefined,
          userId: actorUserId,
          action: APPRAISAL_AUDIT_ACTIONS.CONFIDENTIAL_IDENTITY_VIEWED,
          resource: "AppraisalIdentityAccess",
          resourceId: access.id,
          ip: safeIp(input.ip) ?? undefined,
          userAgent: clean(input.userAgent) || undefined,
          metadata: {
            reqId,
            action: APPRAISAL_AUDIT_ACTIONS.CONFIDENTIAL_IDENTITY_VIEWED,
            actorRole: "SUPERADMIN",
            cycleId: cycle.id,
            instrumentCode: cycle.instrumentVersion.instrument.code,
            participantId: selected.participantId,
            responseId: selected.responseId,
            reason,
            purpose,
            disclosureMode: "ONE_RESPONDENT_ONLY",
            exportAllowed: false,
          },
        },
      });

      const participant = await tx.appraisalParticipant.findUnique({
        where: {
          id: selected.participantId,
        },
        select: {
          id: true,
          cycleId: true,
          status: true,
          respondentRoleSnapshot: true,
          finalizedAt: true,
          respondent: {
            select: {
              name: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          respondentTenant: {
            select: {
              name: true,
            },
          },
          response: {
            select: {
              id: true,
              status: true,
              finalizedAt: true,
            },
          },
        },
      });

      if (
        !participant ||
        participant.cycleId !== cycle.id ||
        participant.status !== "FINALIZED" ||
        !participant.finalizedAt ||
        !participant.response ||
        participant.response.id !== selected.responseId ||
        participant.response.status !== "FINALIZED" ||
        !participant.response.finalizedAt
      ) {
        fail("CONFIDENTIAL_IDENTITY_AUDIT_FINALIZED_IDENTITY_INVALID", 409);
      }

      return {
        outcome: "REVEALED" as const,
        cycle: cycleSummary(cycle),
        respondent: {
          label: selected.label,
          contextLabel: selected.contextLabel,
        },
        identity: {
          displayName: displayName(participant.respondent),
          email: participant.respondent.email,
          role: clean(participant.respondentRoleSnapshot) || "RESPONDENT",
          schoolName: participant.respondentTenant?.name ?? null,
        },
        audit: {
          recorded: true as const,
          purpose,
          createdAt: access.createdAt.toISOString(),
        },
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 10_000,
      timeout: 15_000,
    },
  );
}
