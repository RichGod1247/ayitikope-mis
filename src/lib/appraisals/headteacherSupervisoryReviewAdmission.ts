import { createHash, randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hasAppraisalCapability } from "@/lib/appraisals/authority";
import {
  HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY,
} from "@/lib/appraisals/headteacherSupervisoryAssessment";
import {
  HEADTEACHER_SUPERVISORY_REVIEW_PACKAGE_POLICY,
  readHeadteacherSupervisoryReviewPackage,
} from "@/lib/appraisals/headteacherSupervisoryReviewPackage";
import type { GovernanceScope } from "@/lib/governance/scope";

export const HEADTEACHER_SUPERVISORY_HOS_REVIEW_START_POLICY = {
  schemaVersion: 1,
  workflow: HEADTEACHER_SUPERVISORY_REVIEW_PACKAGE_POLICY.workflow,
  evidenceStream: HEADTEACHER_SUPERVISORY_REVIEW_PACKAGE_POLICY.evidenceStream,
  reviewerRole: "HEAD_OF_SUPERVISION",
  requiredCapability: "REVIEW_HEADTEACHER_APPRAISAL",
  reviewStage: 1,
  reviewDecision: "PENDING",
  cycleFromStatus: "CLOSED",
  cycleToStatus: "UNDER_REVIEW",
  requiredAssessmentStatus: "FINALIZED",
  eligibleAssessorRoles: ["SISSO", "BASIC_SCHOOL_COORDINATOR"] as const,
  explicitConfirmationRequired: true,
  exactDistrictAssignmentRequired: true,
  immutableEvidenceRequired: true,
  staffFeedbackIncluded: false,
  respondentIdentitiesIncluded: false,
  reviewerMayRewriteScores: false,
  scoreMutationAllowed: false,
  assessmentMutationAllowed: false,
  notificationsSeeded: false,
  providerCallsAllowed: false,
  reviewPackageReadMode: "OUTSIDE_WRITE_TRANSACTION",
  transactionIsolation: "SERIALIZABLE",
  transactionMaxWaitMs: 10_000,
  transactionTimeoutMs: 20_000,
} as const;

const REVIEW_STARTED_AUDIT_ACTION =
  "HEADTEACHER_SUPERVISORY_HOS_REVIEW_STARTED";

export type StartHeadteacherSupervisoryHosReviewInput = {
  actorUserId: string;
  actorRoleName: unknown;
  assessmentId: string;
  confirm: boolean;
  governanceScope: GovernanceScope;
  reqId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  now?: Date;
  database?: HeadteacherSupervisoryHosReviewStartDatabase;
  dependencies?: HeadteacherSupervisoryHosReviewStartDependencies;
};

export type StartHeadteacherSupervisoryHosReviewResult = {
  outcome: "STARTED" | "EXISTING_REVIEW";
  assessmentId: string;
  assessmentRevision: number;
  assessmentStatus: "FINALIZED";
  cycleId: string;
  cycleStatus: "UNDER_REVIEW";
  reviewStage: 1;
  reviewDecision: "PENDING";
  startedAt: string;
  reviewerRole: "HEAD_OF_SUPERVISION";
  scoreMutationPerformed: false;
  assessmentMutationPerformed: false;
  providerCalled: false;
};

export type HeadteacherSupervisoryHosReviewStartDependencies = {
  readReviewPackage: typeof readHeadteacherSupervisoryReviewPackage;
};

type AssessmentRecord = {
  id: string;
  cycleId: string;
  status: string;
  revision: number;
  assessorUserId: string;
  assessorAssignmentId: string | null;
  assessmentHash: string | null;
  metadata: unknown;
};

type CycleRecord = {
  id: string;
  scopeZoneId: string;
  targetTenantId: string | null;
  status: string;
  openedAt: Date | null;
  closedAt: Date | null;
  reviewStartedAt: Date | null;
  releasedAt: Date | null;
  cancelledAt: Date | null;
  metadata: unknown;
};

type ReviewRecord = {
  id: string;
  cycleId: string;
  assessmentId: string;
  reviewerUserId: string;
  reviewerAssignmentId: string | null;
  stage: number;
  decision: string;
  note: string | null;
  decidedAt: Date | null;
  metadata: unknown;
  createdAt: Date;
};

type AssignmentRecord = {
  id: string;
  userId: string;
  role: string;
  status: string;
  revokedAt: Date | null;
  startsAt: Date | null;
  endsAt: Date | null;
  zoneId: string;
  zone: {
    id: string;
    isActive: boolean;
    zoneType: { level: number };
  };
};

type CountResult = { count: number };

export type HeadteacherSupervisoryHosReviewStartTransactionClient = {
  appraisalAssessment: {
    findUnique(args: unknown): Promise<AssessmentRecord | null>;
  };
  appraisalCycle: {
    findUnique(args: unknown): Promise<CycleRecord | null>;
    updateMany(args: unknown): Promise<CountResult>;
  };
  appraisalReview: {
    findMany(args: unknown): Promise<ReviewRecord[]>;
    create(args: unknown): Promise<ReviewRecord>;
  };
  governanceOfficerAssignment: {
    findMany(args: unknown): Promise<AssignmentRecord[]>;
  };
  auditLog: {
    create(args: unknown): Promise<unknown>;
  };
};

export type HeadteacherSupervisoryHosReviewStartDatabase = {
  $transaction<T>(
    operation: (
      tx: HeadteacherSupervisoryHosReviewStartTransactionClient,
    ) => Promise<T>,
    options?: {
      isolationLevel?: Prisma.TransactionIsolationLevel | string;
      maxWait?: number;
      timeout?: number;
    },
  ): Promise<T>;
};

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

function isSha256(value: unknown) {
  return /^[a-f0-9]{64}$/.test(clean(value).toLowerCase());
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

function requireIdentifier(value: unknown, fieldName: string) {
  const id = clean(value);
  if (!/^[A-Za-z0-9_-]{5,180}$/.test(id)) {
    fail("HEADTEACHER_SUPERVISORY_REVIEW_START_INVALID_IDENTIFIER", 400, {
      fieldName,
    });
  }
  return id;
}

function requireNow(value?: Date) {
  const now = value ? new Date(value) : new Date();
  if (Number.isNaN(now.getTime())) {
    fail("HEADTEACHER_SUPERVISORY_REVIEW_START_INVALID_CURRENT_TIME", 400);
  }
  return now;
}

function scopeCarriesAssignment(
  governanceScope: GovernanceScope,
  assignment: AssignmentRecord,
) {
  return governanceScope.assignments.some(
    (candidate) =>
      clean(candidate.id) === assignment.id &&
      normalized(candidate.role) === "HEAD_OF_SUPERVISION" &&
      clean(candidate.zoneId) === assignment.zoneId &&
      candidate.zoneLevel ===
        HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.districtZoneLevel,
  );
}

function assignmentIsCurrent(input: {
  assignment: AssignmentRecord;
  actorUserId: string;
  districtId: string;
  governanceScope: GovernanceScope;
  now: Date;
}) {
  const assignment = input.assignment;
  if (
    assignment.userId !== input.actorUserId ||
    normalized(assignment.role) !== "HEAD_OF_SUPERVISION" ||
    normalized(assignment.status) !== "ACTIVE" ||
    assignment.revokedAt ||
    assignment.zoneId !== input.districtId ||
    assignment.zone.id !== input.districtId ||
    assignment.zone.isActive !== true ||
    assignment.zone.zoneType.level !==
      HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.districtZoneLevel ||
    !scopeCarriesAssignment(input.governanceScope, assignment)
  ) {
    return false;
  }
  if (assignment.startsAt && assignment.startsAt.getTime() > input.now.getTime()) {
    return false;
  }
  if (assignment.endsAt && assignment.endsAt.getTime() <= input.now.getTime()) {
    return false;
  }
  return true;
}

function resolveAssignment(input: {
  assignments: AssignmentRecord[];
  actorUserId: string;
  districtId: string;
  governanceScope: GovernanceScope;
  now: Date;
}) {
  const matches = input.assignments.filter((assignment) =>
    assignmentIsCurrent({
      assignment,
      actorUserId: input.actorUserId,
      districtId: input.districtId,
      governanceScope: input.governanceScope,
      now: input.now,
    }),
  );

  if (matches.length === 0) {
    fail("HEADTEACHER_SUPERVISORY_REVIEW_START_ACTIVE_ASSIGNMENT_REQUIRED", 403);
  }
  if (matches.length !== 1) {
    fail("HEADTEACHER_SUPERVISORY_REVIEW_START_AMBIGUOUS_ASSIGNMENT", 409);
  }
  return matches[0];
}

function reviewEvidenceHash(input: {
  assessment: AssessmentRecord;
  cycle: CycleRecord;
  reviewerUserId: string;
  reviewerAssignmentId: string;
  visitContextHash: string;
}) {
  return hashJson({
    schemaVersion: HEADTEACHER_SUPERVISORY_HOS_REVIEW_START_POLICY.schemaVersion,
    workflow: HEADTEACHER_SUPERVISORY_HOS_REVIEW_START_POLICY.workflow,
    evidenceStream: HEADTEACHER_SUPERVISORY_HOS_REVIEW_START_POLICY.evidenceStream,
    assessment: {
      id: input.assessment.id,
      cycleId: input.assessment.cycleId,
      revision: input.assessment.revision,
      assessmentHash: clean(input.assessment.assessmentHash).toLowerCase(),
      visitContextHash: input.visitContextHash,
      assessorUserId: input.assessment.assessorUserId,
      assessorAssignmentId: input.assessment.assessorAssignmentId,
    },
    review: {
      stage: HEADTEACHER_SUPERVISORY_HOS_REVIEW_START_POLICY.reviewStage,
      reviewerUserId: input.reviewerUserId,
      reviewerAssignmentId: input.reviewerAssignmentId,
      reviewerRole: "HEAD_OF_SUPERVISION",
    },
    jurisdiction: {
      districtZoneId: input.cycle.scopeZoneId,
      targetTenantId: input.cycle.targetTenantId,
    },
    staffFeedbackIncluded: false,
    respondentIdentitiesIncluded: false,
    reviewerMayRewriteScores: false,
    scoreMutationAllowed: false,
  });
}

function reviewMetadata(input: {
  assessment: AssessmentRecord;
  assignment: AssignmentRecord;
  reviewEvidenceHash: string;
}) {
  return {
    schemaVersion: 1,
    workflow: HEADTEACHER_SUPERVISORY_HOS_REVIEW_START_POLICY.workflow,
    evidenceStream: HEADTEACHER_SUPERVISORY_HOS_REVIEW_START_POLICY.evidenceStream,
    reviewType: "HOS_SUPERVISORY_REVIEW",
    reviewStage: 1,
    reviewerRole: "HEAD_OF_SUPERVISION",
    reviewEvidenceHash: input.reviewEvidenceHash,
    assessmentId: input.assessment.id,
    assessmentRevision: input.assessment.revision,
    assessmentHash: clean(input.assessment.assessmentHash).toLowerCase(),
    immutableEvidenceReverified: true,
    staffFeedbackIncluded: false,
    respondentIdentitiesIncluded: false,
    reviewerMayRewriteScores: false,
    scoreMutationAllowed: false,
    assessmentMutationAllowed: false,
    notificationsSeeded: false,
    providerCalled: false,
    reviewerAssignmentZoneId: input.assignment.zoneId,
  };
}

function existingResult(
  reviewPackage: Awaited<ReturnType<typeof readHeadteacherSupervisoryReviewPackage>>,
): StartHeadteacherSupervisoryHosReviewResult {
  if (
    reviewPackage.lifecycleState !== "READY_TO_REVIEW" ||
    !reviewPackage.review ||
    reviewPackage.review.stage !== 1 ||
    reviewPackage.review.decision !== "PENDING"
  ) {
    fail("HEADTEACHER_SUPERVISORY_REVIEW_START_EXISTING_REVIEW_DRIFT", 409);
  }

  return {
    outcome: "EXISTING_REVIEW",
    assessmentId: reviewPackage.assessment.id,
    assessmentRevision: reviewPackage.assessment.revision,
    assessmentStatus: "FINALIZED",
    cycleId: reviewPackage.cycle.id,
    cycleStatus: "UNDER_REVIEW",
    reviewStage: 1,
    reviewDecision: "PENDING",
    startedAt: reviewPackage.review.startedAt,
    reviewerRole: "HEAD_OF_SUPERVISION",
    scoreMutationPerformed: false,
    assessmentMutationPerformed: false,
    providerCalled: false,
  };
}

async function createReview(input: {
  request: StartHeadteacherSupervisoryHosReviewInput;
  package: Awaited<ReturnType<typeof readHeadteacherSupervisoryReviewPackage>>;
  database: HeadteacherSupervisoryHosReviewStartDatabase;
  actorUserId: string;
  assessmentId: string;
  reqId: string;
  now: Date;
}) {
  return input.database.$transaction(
    async (tx) => {
      const assessment = await tx.appraisalAssessment.findUnique({
        where: { id: input.assessmentId },
        select: {
          id: true,
          cycleId: true,
          status: true,
          revision: true,
          assessorUserId: true,
          assessorAssignmentId: true,
          assessmentHash: true,
          metadata: true,
        },
      });
      if (!assessment) {
        fail("HEADTEACHER_SUPERVISORY_REVIEW_START_ASSESSMENT_NOT_FOUND", 404);
      }

      const cycle = await tx.appraisalCycle.findUnique({
        where: { id: assessment.cycleId },
        select: {
          id: true,
          scopeZoneId: true,
          targetTenantId: true,
          status: true,
          openedAt: true,
          closedAt: true,
          reviewStartedAt: true,
          releasedAt: true,
          cancelledAt: true,
          metadata: true,
        },
      });
      if (!cycle) {
        fail("HEADTEACHER_SUPERVISORY_REVIEW_START_CYCLE_NOT_FOUND", 404);
      }

      const reviews = await tx.appraisalReview.findMany({
        where: { assessmentId: assessment.id },
        select: {
          id: true,
          cycleId: true,
          assessmentId: true,
          reviewerUserId: true,
          reviewerAssignmentId: true,
          stage: true,
          decision: true,
          note: true,
          decidedAt: true,
          metadata: true,
          createdAt: true,
        },
        orderBy: { stage: "asc" },
      });

      if (reviews.length !== 0) {
        fail("HEADTEACHER_SUPERVISORY_REVIEW_START_WRITE_RACE", 409);
      }

      const visitContextHash = clean(
        objectValue(assessment.metadata).visitContextHash,
      ).toLowerCase();

      if (
        assessment.id !== input.package.assessment.id ||
        assessment.cycleId !== input.package.cycle.id ||
        assessment.revision !== input.package.assessment.revision ||
        normalized(assessment.status) !==
          HEADTEACHER_SUPERVISORY_HOS_REVIEW_START_POLICY.requiredAssessmentStatus ||
        normalized(cycle.status) !==
          HEADTEACHER_SUPERVISORY_HOS_REVIEW_START_POLICY.cycleFromStatus ||
        !cycle.openedAt ||
        !cycle.closedAt ||
        cycle.reviewStartedAt ||
        cycle.releasedAt ||
        cycle.cancelledAt ||
        !clean(cycle.targetTenantId) ||
        !isSha256(assessment.assessmentHash) ||
        !isSha256(visitContextHash)
      ) {
        fail("HEADTEACHER_SUPERVISORY_REVIEW_START_SOURCE_DRIFT", 409);
      }

      const assignments = await tx.governanceOfficerAssignment.findMany({
        where: {
          userId: input.actorUserId,
          role: "HEAD_OF_SUPERVISION",
          status: "ACTIVE",
          zoneId: cycle.scopeZoneId,
        },
        select: {
          id: true,
          userId: true,
          role: true,
          status: true,
          revokedAt: true,
          startsAt: true,
          endsAt: true,
          zoneId: true,
          zone: {
            select: {
              id: true,
              isActive: true,
              zoneType: { select: { level: true } },
            },
          },
        },
      });

      const assignment = resolveAssignment({
        assignments,
        actorUserId: input.actorUserId,
        districtId: cycle.scopeZoneId,
        governanceScope: input.request.governanceScope,
        now: input.now,
      });

      const evidenceHash = reviewEvidenceHash({
        assessment,
        cycle,
        reviewerUserId: input.actorUserId,
        reviewerAssignmentId: assignment.id,
        visitContextHash,
      });

      const created = await tx.appraisalReview.create({
        data: {
          cycleId: cycle.id,
          assessmentId: assessment.id,
          reviewerUserId: input.actorUserId,
          reviewerAssignmentId: assignment.id,
          stage: 1,
          decision: "PENDING",
          note: null,
          decidedAt: null,
          metadata: reviewMetadata({
            assessment,
            assignment,
            reviewEvidenceHash: evidenceHash,
          }),
        },
        select: {
          id: true,
          cycleId: true,
          assessmentId: true,
          reviewerUserId: true,
          reviewerAssignmentId: true,
          stage: true,
          decision: true,
          note: true,
          decidedAt: true,
          metadata: true,
          createdAt: true,
        },
      });

      const cycleMetadata = objectValue(cycle.metadata);
      const cycleUpdated = await tx.appraisalCycle.updateMany({
        where: {
          id: cycle.id,
          status: "CLOSED",
          reviewStartedAt: null,
          releasedAt: null,
          cancelledAt: null,
        },
        data: {
          status: "UNDER_REVIEW",
          reviewStartedAt: input.now,
          metadata: {
            ...cycleMetadata,
            headteacherSupervisoryReview: {
              schemaVersion: 1,
              state: "HOS_REVIEW_PENDING",
              currentReviewId: created.id,
              currentReviewStage: 1,
              currentReviewerRole: "HEAD_OF_SUPERVISION",
              currentReviewerAssignmentId: assignment.id,
              reviewEvidenceHash: evidenceHash,
              admittedAssessmentId: assessment.id,
              admittedAssessmentRevision: assessment.revision,
              assessmentHash: clean(assessment.assessmentHash).toLowerCase(),
              visitContextHash,
              staffFeedbackIncluded: false,
              respondentIdentitiesIncluded: false,
              reviewerMayRewriteScores: false,
              scoreMutationAllowed: false,
              notificationsSeeded: false,
              providerCalled: false,
              startedAt: input.now.toISOString(),
            },
          },
        },
      });

      if (cycleUpdated.count !== 1) {
        fail("HEADTEACHER_SUPERVISORY_REVIEW_START_WRITE_RACE", 409);
      }

      await tx.auditLog.create({
        data: {
          tenantId: clean(cycle.targetTenantId),
          userId: input.actorUserId,
          action: REVIEW_STARTED_AUDIT_ACTION,
          resource: "AppraisalReview",
          resourceId: created.id,
          ip: input.request.ip ?? undefined,
          userAgent: input.request.userAgent ?? undefined,
          metadata: {
            reqId: input.reqId,
            action: REVIEW_STARTED_AUDIT_ACTION,
            workflow: HEADTEACHER_SUPERVISORY_HOS_REVIEW_START_POLICY.workflow,
            evidenceStream:
              HEADTEACHER_SUPERVISORY_HOS_REVIEW_START_POLICY.evidenceStream,
            cycleId: cycle.id,
            assessmentId: assessment.id,
            assessmentRevision: assessment.revision,
            reviewStage: 1,
            reviewerRole: "HEAD_OF_SUPERVISION",
            actorAssignmentId: assignment.id,
            reviewEvidenceHash: evidenceHash,
            assessmentHash: clean(assessment.assessmentHash).toLowerCase(),
            visitContextHash,
            scoreValuesRecordedInAudit: false,
            staffFeedbackIncluded: false,
            respondentIdentitiesIncluded: false,
            scoreMutationPerformed: false,
            assessmentMutationPerformed: false,
            notificationsSeeded: false,
            providerCalled: false,
          },
        },
      });

      return {
        outcome: "STARTED" as const,
        assessmentId: assessment.id,
        assessmentRevision: assessment.revision,
        assessmentStatus: "FINALIZED" as const,
        cycleId: cycle.id,
        cycleStatus: "UNDER_REVIEW" as const,
        reviewStage: 1 as const,
        reviewDecision: "PENDING" as const,
        startedAt: input.now.toISOString(),
        reviewerRole: "HEAD_OF_SUPERVISION" as const,
        scoreMutationPerformed: false as const,
        assessmentMutationPerformed: false as const,
        providerCalled: false as const,
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait:
        HEADTEACHER_SUPERVISORY_HOS_REVIEW_START_POLICY.transactionMaxWaitMs,
      timeout:
        HEADTEACHER_SUPERVISORY_HOS_REVIEW_START_POLICY.transactionTimeoutMs,
    },
  );
}

function isRetryableRace(error: unknown) {
  const code = clean((error as { code?: unknown })?.code);
  const message = clean((error as { message?: unknown })?.message);
  return (
    code === "P2002" ||
    code === "P2034" ||
    message === "HEADTEACHER_SUPERVISORY_REVIEW_START_WRITE_RACE"
  );
}

export async function startHeadteacherSupervisoryHosReview(
  input: StartHeadteacherSupervisoryHosReviewInput,
): Promise<StartHeadteacherSupervisoryHosReviewResult> {
  const actorUserId = requireIdentifier(input.actorUserId, "actorUserId");
  const assessmentId = requireIdentifier(input.assessmentId, "assessmentId");
  const reqId = requireIdentifier(clean(input.reqId) || randomUUID(), "reqId");
  const now = requireNow(input.now);
  const actorRole = normalized(input.actorRoleName);

  if (
    actorRole !==
      HEADTEACHER_SUPERVISORY_HOS_REVIEW_START_POLICY.reviewerRole ||
    !hasAppraisalCapability(
      actorRole,
      HEADTEACHER_SUPERVISORY_HOS_REVIEW_START_POLICY.requiredCapability,
    )
  ) {
    fail("HEADTEACHER_SUPERVISORY_REVIEW_START_ROLE_FORBIDDEN", 403);
  }
  if (input.confirm !== true) {
    fail("HEADTEACHER_SUPERVISORY_REVIEW_START_CONFIRMATION_REQUIRED", 400);
  }

  const database =
    input.database ??
    (prisma as unknown as HeadteacherSupervisoryHosReviewStartDatabase);
  const dependencies =
    input.dependencies ?? {
      readReviewPackage: readHeadteacherSupervisoryReviewPackage,
    };

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const reviewPackage = await dependencies.readReviewPackage({
      actorUserId,
      actorRoleName: actorRole,
      assessmentId,
      governanceScope: input.governanceScope,
      now,
    });

    if (reviewPackage.lifecycleState === "READY_TO_REVIEW") {
      return existingResult(reviewPackage);
    }
    if (reviewPackage.lifecycleState !== "READY_TO_START") {
      fail("HEADTEACHER_SUPERVISORY_REVIEW_START_PACKAGE_STATE_INVALID", 409);
    }

    try {
      return await createReview({
        request: input,
        package: reviewPackage,
        database,
        actorUserId,
        assessmentId,
        reqId,
        now,
      });
    } catch (error) {
      if (attempt === 0 && isRetryableRace(error)) continue;
      throw error;
    }
  }

  fail("HEADTEACHER_SUPERVISORY_REVIEW_START_CONCURRENT_CREATE_FAILED", 409);
}
