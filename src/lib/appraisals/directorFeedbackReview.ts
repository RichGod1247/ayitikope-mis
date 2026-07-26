// src/lib/appraisals/directorFeedbackReview.ts
import { randomUUID } from "crypto";
import { AppraisalCycleStatus, Prisma } from "@prisma/client";
import { APPRAISAL_AUDIT_ACTIONS } from "@/lib/appraisals/audit";
import { assertAppraisalAuthority } from "@/lib/appraisals/authority";
import { DIRECTOR_FEEDBACK_POLICY } from "@/lib/appraisals/directorFeedback";
import {
  appraisalReleaseReadiness,
  assertAppraisalCycleTransition,
} from "@/lib/appraisals/workflow";
import { prisma } from "@/lib/prisma";
import { effectiveRole } from "@/lib/roleRouting";

export const DIRECTOR_FEEDBACK_REVIEW_POLICY = {
  workflow: DIRECTOR_FEEDBACK_POLICY.workflow,
  municipalMinimum: DIRECTOR_FEEDBACK_POLICY.minimumMunicipalResponses,
  municipalPreferred: DIRECTOR_FEEDBACK_POLICY.preferredMunicipalResponses,
  circuitDisclosureThreshold:
    DIRECTOR_FEEDBACK_POLICY.circuitDisclosureThreshold,
  reviewerRole: "DISTRICT_DIRECTOR",
  transactionMaxWaitMs: 5_000,
  transactionTimeoutMs: 15_000,
  individualFormsAvailable: false,
  interimSupervisoryAssessmentRequired: false,
  respondentIdentityVisible: false,
  schoolIdentityVisible: false,
} as const;

type JsonRecord = Record<string, unknown>;

type ReviewSnapshotSource = {
  version: number;
  eligibleResponses: number;
  finalizedResponses: number;
  expiredResponses: number;
  minimumResponses: number;
  releaseEligible: boolean;
  overallPercentage: number | null;
  sectionAveragesJson: unknown;
  sourceHash: string;
  generatedAt: Date;
  metadata: unknown;
};

export type DirectorFeedbackReviewCycleSource = {
  id: string;
  status: AppraisalCycleStatus;
  targetUserId: string;
  targetRoleSnapshot: string | null;
  targetNameSnapshot: string | null;
  targetZoneNameSnapshot: string | null;
  openedAt: Date | null;
  deadlineAt: Date | null;
  closedAt: Date | null;
  reviewStartedAt: Date | null;
  releasedAt: Date | null;
  minimumResponses: number;
  metadata: unknown;
  aggregate: ReviewSnapshotSource | null;
};

export type DirectorFeedbackReviewSection = {
  sectionKey: string;
  sectionTitle: string;
  sectionOrder: number | null;
  averagePercentage: number | null;
  validResponses: number;
};

export type DirectorFeedbackReviewCircuit = {
  circuitZoneId: string;
  circuitName: string;
  finalizedResponses: number;
  overallPercentage: number | null;
  sections: DirectorFeedbackReviewSection[];
};

export type DirectorFeedbackReviewWorkspace = {
  cycle: null | {
    id: string;
    status: AppraisalCycleStatus;
    directorName: string | null;
    jurisdictionName: string | null;
    openedAt: string | null;
    deadlineAt: string | null;
    closedAt: string | null;
    reviewStartedAt: string | null;
    releasedAt: string | null;
  };
  readiness: {
    reviewAvailable: boolean;
    canBeginReview: boolean;
    canViewScores: boolean;
    canRelease: boolean;
    reasons: string[];
    releaseReasons: string[];
  };
  aggregate: null | {
    version: number;
    generatedAt: string;
    eligibleResponses: number;
    finalizedResponses: number;
    expiredResponses: number;
    minimumResponses: number;
    releaseEligible: boolean;
    municipalBand: "BLOCKED" | "LIMITED" | "PREFERRED";
    sourceFingerprint: string;
    overallPercentage: number | null;
    sections: DirectorFeedbackReviewSection[];
    circuits: {
      threshold: number;
      visibleCircuits: DirectorFeedbackReviewCircuit[];
      hiddenCircuitCount: number;
      hiddenCircuitsIncludedInMunicipalAggregate: true;
      exactCountsForHiddenCircuitsIncluded: false;
    };
  };
  privacy: {
    respondentNamesIncluded: false;
    schoolNamesIncluded: false;
    contactDetailsIncluded: false;
    submissionTimesIncluded: false;
    responseOrderIncluded: false;
    individualAnswersIncluded: false;
    individualFormsAvailable: false;
  };
};

export type StartDirectorFeedbackReviewResult = {
  outcome: "STARTED" | "ALREADY_STARTED";
  workspace: DirectorFeedbackReviewWorkspace;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function fail(
  code: string,
  status: number,
  details?: Record<string, unknown>,
): never {
  const error = new Error(code) as Error & {
    code?: string;
    status?: number;
    details?: Record<string, unknown>;
  };
  error.code = code;
  error.status = status;
  error.details = details;
  throw error;
}

function objectValue(value: unknown): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as JsonRecord;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function numeric(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function integer(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isInteger(number) ? number : fallback;
}

function municipalBand(finalizedResponses: number) {
  if (finalizedResponses < DIRECTOR_FEEDBACK_REVIEW_POLICY.municipalMinimum) {
    return "BLOCKED" as const;
  }
  if (finalizedResponses < DIRECTOR_FEEDBACK_REVIEW_POLICY.municipalPreferred) {
    return "LIMITED" as const;
  }
  return "PREFERRED" as const;
}

function parseSections(value: unknown): DirectorFeedbackReviewSection[] {
  return Object.values(objectValue(value))
    .map((raw): DirectorFeedbackReviewSection | null => {
      const row = objectValue(raw);
      const sectionKey = clean(row.sectionKey);
      if (!sectionKey) return null;

      return {
        sectionKey,
        sectionTitle: clean(row.sectionTitle) || sectionKey,
        sectionOrder:
          numeric(row.sectionOrder) == null ? null : Number(row.sectionOrder),
        averagePercentage: numeric(row.averagePercentage),
        validResponses: Math.max(0, integer(row.validResponses)),
      };
    })
    .filter((row): row is DirectorFeedbackReviewSection => row !== null)
    .sort(
      (left, right) =>
        (left.sectionOrder ?? Number.MAX_SAFE_INTEGER) -
          (right.sectionOrder ?? Number.MAX_SAFE_INTEGER) ||
        left.sectionTitle.localeCompare(right.sectionTitle),
    );
}

function parseCircuitDisclosure(value: unknown) {
  const metadata = objectValue(value);
  const disclosure = objectValue(metadata.circuitDisclosure);

  const visibleCircuits = arrayValue(disclosure.visibleCircuits)
    .map((raw): DirectorFeedbackReviewCircuit | null => {
      const row = objectValue(raw);
      const circuitZoneId = clean(row.circuitZoneId);
      const circuitName = clean(row.circuitName);
      if (!circuitZoneId || !circuitName) return null;

      return {
        circuitZoneId,
        circuitName,
        finalizedResponses: Math.max(0, integer(row.finalizedResponses)),
        overallPercentage: numeric(row.overallPercentage),
        sections: parseSections(row.sectionAverages),
      };
    })
    .filter((row): row is DirectorFeedbackReviewCircuit => row !== null)
    .sort((left, right) => left.circuitName.localeCompare(right.circuitName));

  return {
    threshold: Math.max(
      1,
      integer(
        disclosure.threshold,
        DIRECTOR_FEEDBACK_REVIEW_POLICY.circuitDisclosureThreshold,
      ),
    ),
    visibleCircuits,
    hiddenCircuitCount: Math.max(0, integer(disclosure.hiddenCircuitCount)),
    hiddenCircuitsIncludedInMunicipalAggregate: true as const,
    exactCountsForHiddenCircuitsIncluded: false as const,
  };
}

function privacyContract() {
  return {
    respondentNamesIncluded: false as const,
    schoolNamesIncluded: false as const,
    contactDetailsIncluded: false as const,
    submissionTimesIncluded: false as const,
    responseOrderIncluded: false as const,
    individualAnswersIncluded: false as const,
    individualFormsAvailable: false as const,
  };
}

export function buildDirectorFeedbackReviewWorkspace(
  cycle: DirectorFeedbackReviewCycleSource | null,
): DirectorFeedbackReviewWorkspace {
  if (!cycle) {
    return {
      cycle: null,
      readiness: {
        reviewAvailable: false,
        canBeginReview: false,
        canViewScores: false,
        canRelease: false,
        reasons: ["DIRECTOR_FEEDBACK_CYCLE_NOT_FOUND"],
        releaseReasons: ["DIRECTOR_FEEDBACK_CYCLE_NOT_FOUND"],
      },
      aggregate: null,
      privacy: privacyContract(),
    };
  }

  const snapshot = cycle.aggregate;
  const isClosed = cycle.status === AppraisalCycleStatus.CLOSED;
  const isUnderReview = cycle.status === AppraisalCycleStatus.UNDER_REVIEW;
  const isReleased = cycle.status === AppraisalCycleStatus.RELEASED;
  const thresholdMet = snapshot?.releaseEligible === true;
  const reasons: string[] = [];

  if (!isClosed && !isUnderReview) {
    reasons.push(
      cycle.status === AppraisalCycleStatus.OPEN
        ? "DIRECTOR_FEEDBACK_CYCLE_STILL_OPEN"
        : "DIRECTOR_FEEDBACK_CYCLE_NOT_READY_FOR_REVIEW",
    );
  }
  if (!snapshot) reasons.push("DIRECTOR_FEEDBACK_AGGREGATE_SNAPSHOT_MISSING");
  if (snapshot && !thresholdMet) {
    reasons.push("DIRECTOR_FEEDBACK_MINIMUM_RESPONSES_NOT_MET");
  }
  if (isClosed && snapshot && thresholdMet) {
    reasons.push("DIRECTOR_FEEDBACK_REVIEW_NOT_STARTED");
  }

  const canBeginReview = isClosed && Boolean(snapshot) && thresholdMet;
  const canViewScores =
    (isUnderReview || isReleased) && Boolean(snapshot) && thresholdMet;
  const reviewAvailable =
    (isClosed || isUnderReview || isReleased) && Boolean(snapshot);

  const releaseEvaluation = appraisalReleaseReadiness({
    status: cycle.status,
    finalizedResponses: snapshot?.finalizedResponses ?? 0,
    minimumResponses: snapshot?.minimumResponses ?? cycle.minimumResponses,
    aggregateSnapshotPresent: Boolean(snapshot),
    supervisoryAssessmentRequired:
      DIRECTOR_FEEDBACK_REVIEW_POLICY.interimSupervisoryAssessmentRequired,
    supervisoryAssessmentAccepted: true,
  });

  const releaseReasons = [...releaseEvaluation.reasons];
  if (!cycle.reviewStartedAt) {
    releaseReasons.push("DIRECTOR_FEEDBACK_REVIEW_NOT_STARTED");
  }
  if (snapshot && !snapshot.releaseEligible) {
    releaseReasons.push("DIRECTOR_FEEDBACK_MINIMUM_RESPONSES_NOT_MET");
  }
  if (isReleased) {
    releaseReasons.splice(
      0,
      releaseReasons.length,
      "DIRECTOR_FEEDBACK_ALREADY_RELEASED",
    );
  }

  const canRelease =
    isUnderReview &&
    Boolean(cycle.reviewStartedAt) &&
    Boolean(snapshot) &&
    thresholdMet &&
    releaseEvaluation.ready;

  return {
    cycle: {
      id: cycle.id,
      status: cycle.status,
      directorName: cycle.targetNameSnapshot,
      jurisdictionName: cycle.targetZoneNameSnapshot,
      openedAt: cycle.openedAt?.toISOString() ?? null,
      deadlineAt: cycle.deadlineAt?.toISOString() ?? null,
      closedAt: cycle.closedAt?.toISOString() ?? null,
      reviewStartedAt: cycle.reviewStartedAt?.toISOString() ?? null,
      releasedAt: cycle.releasedAt?.toISOString() ?? null,
    },
    readiness: {
      reviewAvailable,
      canBeginReview,
      canViewScores,
      canRelease,
      reasons: canViewScores ? [] : reasons,
      releaseReasons: canRelease ? [] : Array.from(new Set(releaseReasons)),
    },
    aggregate: snapshot
      ? {
          version: snapshot.version,
          generatedAt: snapshot.generatedAt.toISOString(),
          eligibleResponses: snapshot.eligibleResponses,
          finalizedResponses: snapshot.finalizedResponses,
          expiredResponses: snapshot.expiredResponses,
          minimumResponses: snapshot.minimumResponses,
          releaseEligible: snapshot.releaseEligible,
          municipalBand: municipalBand(snapshot.finalizedResponses),
          sourceFingerprint: clean(snapshot.sourceHash).slice(0, 12),
          overallPercentage: canViewScores
            ? numeric(snapshot.overallPercentage)
            : null,
          sections: canViewScores
            ? parseSections(snapshot.sectionAveragesJson)
            : [],
          circuits: canViewScores
            ? parseCircuitDisclosure(snapshot.metadata)
            : {
                threshold:
                  DIRECTOR_FEEDBACK_REVIEW_POLICY.circuitDisclosureThreshold,
                visibleCircuits: [],
                hiddenCircuitCount: 0,
                hiddenCircuitsIncludedInMunicipalAggregate: true,
                exactCountsForHiddenCircuitsIncluded: false,
              },
        }
      : null,
    privacy: privacyContract(),
  };
}

const REVIEW_CYCLE_SELECT = {
  id: true,
  status: true,
  targetUserId: true,
  targetRoleSnapshot: true,
  targetNameSnapshot: true,
  targetZoneNameSnapshot: true,
  openedAt: true,
  deadlineAt: true,
  closedAt: true,
  reviewStartedAt: true,
  releasedAt: true,
  minimumResponses: true,
  metadata: true,
  aggregates: {
    orderBy: { version: "desc" },
    take: 1,
    select: {
      version: true,
      eligibleResponses: true,
      finalizedResponses: true,
      expiredResponses: true,
      minimumResponses: true,
      releaseEligible: true,
      overallPercentage: true,
      sectionAveragesJson: true,
      sourceHash: true,
      generatedAt: true,
      metadata: true,
    },
  },
} as const satisfies Prisma.AppraisalCycleSelect;

type ReviewCycleRecord = Prisma.AppraisalCycleGetPayload<{
  select: typeof REVIEW_CYCLE_SELECT;
}>;

function toReviewSource(cycle: ReviewCycleRecord): DirectorFeedbackReviewCycleSource {
  return {
    id: cycle.id,
    status: cycle.status,
    targetUserId: cycle.targetUserId,
    targetRoleSnapshot: cycle.targetRoleSnapshot,
    targetNameSnapshot: cycle.targetNameSnapshot,
    targetZoneNameSnapshot: cycle.targetZoneNameSnapshot,
    openedAt: cycle.openedAt,
    deadlineAt: cycle.deadlineAt,
    closedAt: cycle.closedAt,
    reviewStartedAt: cycle.reviewStartedAt,
    releasedAt: cycle.releasedAt,
    minimumResponses: cycle.minimumResponses,
    metadata: cycle.metadata,
    aggregate: cycle.aggregates[0] ?? null,
  };
}

function assertDirectorCycle(cycle: ReviewCycleRecord, actorUserId: string) {
  if (
    cycle.targetUserId !== actorUserId ||
    cycle.targetRoleSnapshot !== "DISTRICT_DIRECTOR"
  ) {
    fail("DIRECTOR_FEEDBACK_REVIEW_SCOPE_FORBIDDEN", 403);
  }
}

async function findLatestReviewCycle(actorUserId: string) {
  return prisma.appraisalCycle.findFirst({
    where: {
      targetUserId: actorUserId,
      targetRoleSnapshot: "DISTRICT_DIRECTOR",
      instrumentVersion: {
        version: DIRECTOR_FEEDBACK_POLICY.instrumentVersion,
        instrument: { code: DIRECTOR_FEEDBACK_POLICY.instrumentCode },
      },
    },
    orderBy: [{ requestedAt: "desc" }, { id: "desc" }],
    select: REVIEW_CYCLE_SELECT,
  });
}

export async function getDirectorFeedbackReviewWorkspace(input: {
  actorUserId: string;
  actorRoleName: unknown;
}): Promise<DirectorFeedbackReviewWorkspace> {
  const actorUserId = clean(input.actorUserId);
  const actorRole = effectiveRole(input.actorRoleName);

  assertAppraisalAuthority(
    { actorUserId, roleName: actorRole },
    "VIEW_DIRECTOR_FEEDBACK_RESULTS",
  );

  const cycle = await findLatestReviewCycle(actorUserId);
  if (!cycle) return buildDirectorFeedbackReviewWorkspace(null);

  assertDirectorCycle(cycle, actorUserId);
  return buildDirectorFeedbackReviewWorkspace(toReviewSource(cycle));
}

export async function startDirectorFeedbackReview(input: {
  actorUserId: string;
  actorRoleName: unknown;
  cycleId: string;
  reqId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  now?: Date;
}): Promise<StartDirectorFeedbackReviewResult> {
  const actorUserId = clean(input.actorUserId);
  const actorRole = effectiveRole(input.actorRoleName);
  const cycleId = clean(input.cycleId);
  const reqId = clean(input.reqId) || randomUUID();
  const now = input.now ? new Date(input.now) : new Date();

  assertAppraisalAuthority(
    { actorUserId, roleName: actorRole },
    "VIEW_DIRECTOR_FEEDBACK_RESULTS",
  );

  const outcome = await prisma.$transaction(
    async (tx: Prisma.TransactionClient) => {
      const cycle = await tx.appraisalCycle.findUnique({
        where: { id: cycleId },
        select: REVIEW_CYCLE_SELECT,
      });

      if (!cycle) fail("DIRECTOR_FEEDBACK_CYCLE_NOT_FOUND", 404);
      assertDirectorCycle(cycle, actorUserId);

      if (cycle.status === AppraisalCycleStatus.UNDER_REVIEW) {
        return "ALREADY_STARTED" as const;
      }

      if (cycle.status !== AppraisalCycleStatus.CLOSED) {
        fail("DIRECTOR_FEEDBACK_CYCLE_NOT_READY_FOR_REVIEW", 409, {
          status: cycle.status,
        });
      }

      const snapshot = cycle.aggregates[0] ?? null;
      if (!snapshot) {
        fail("DIRECTOR_FEEDBACK_AGGREGATE_SNAPSHOT_MISSING", 409);
      }
      if (
        !snapshot.releaseEligible ||
        snapshot.finalizedResponses < snapshot.minimumResponses
      ) {
        fail("DIRECTOR_FEEDBACK_MINIMUM_RESPONSES_NOT_MET", 409, {
          finalizedResponses: snapshot.finalizedResponses,
          minimumResponses: snapshot.minimumResponses,
        });
      }

      assertAppraisalCycleTransition(
        AppraisalCycleStatus.CLOSED,
        AppraisalCycleStatus.UNDER_REVIEW,
      );

      const updated = await tx.appraisalCycle.updateMany({
        where: {
          id: cycle.id,
          status: AppraisalCycleStatus.CLOSED,
          reviewStartedAt: null,
        },
        data: {
          status: AppraisalCycleStatus.UNDER_REVIEW,
          reviewStartedAt: now,
          metadata: {
            ...objectValue(cycle.metadata),
            directorReviewEntry: {
              actorRole,
              occurredAt: now.toISOString(),
              aggregateVersion: snapshot.version,
              aggregateSourceHash: snapshot.sourceHash,
              thresholdVerified: true,
              respondentIdentityIncluded: false,
              schoolIdentityIncluded: false,
              individualAnswersIncluded: false,
            },
          },
        },
      });

      if (updated.count !== 1) {
        const raced = await tx.appraisalCycle.findUnique({
          where: { id: cycle.id },
          select: { status: true },
        });
        if (raced?.status === AppraisalCycleStatus.UNDER_REVIEW) {
          return "ALREADY_STARTED" as const;
        }
        fail("DIRECTOR_FEEDBACK_REVIEW_START_CONFLICT", 409);
      }

      await tx.auditLog.create({
        data: {
          userId: actorUserId,
          action: APPRAISAL_AUDIT_ACTIONS.CYCLE_REVIEW_STARTED,
          resource: "AppraisalCycle",
          resourceId: cycle.id,
          ip: input.ip ?? null,
          userAgent: input.userAgent ?? null,
          metadata: {
            reqId,
            action: APPRAISAL_AUDIT_ACTIONS.CYCLE_REVIEW_STARTED,
            workflow: DIRECTOR_FEEDBACK_POLICY.workflow,
            actorRole,
            cycleId: cycle.id,
            priorStatus: AppraisalCycleStatus.CLOSED,
            nextStatus: AppraisalCycleStatus.UNDER_REVIEW,
            aggregateVersion: snapshot.version,
            sourceHash: snapshot.sourceHash,
            finalizedResponses: snapshot.finalizedResponses,
            minimumResponses: snapshot.minimumResponses,
            respondentIdentityIncluded: false,
            schoolIdentityIncluded: false,
            individualAnswersIncluded: false,
            scoreValuesRecordedInAudit: false,
          },
        },
      });

      return "STARTED" as const;
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: DIRECTOR_FEEDBACK_REVIEW_POLICY.transactionMaxWaitMs,
      timeout: DIRECTOR_FEEDBACK_REVIEW_POLICY.transactionTimeoutMs,
    },
  );

  const workspace = await getDirectorFeedbackReviewWorkspace({
    actorUserId,
    actorRoleName: actorRole,
  });

  return { outcome, workspace };
}
