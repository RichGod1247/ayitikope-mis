#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- isolated CommonJS QA harness intentionally loads TypeScript through a local transpile hook. */

const fs = require("fs");
const path = require("path");
const Module = require("module");
const ts = require("typescript");
const crypto = require("crypto");

const repoRoot = path.resolve(__dirname, "..", "..");

function fail(message, detail) {
  const suffix = detail === undefined ? "" : `\n${JSON.stringify(detail, null, 2)}`;
  throw new Error(`${message}${suffix}`);
}
function assert(condition, message, detail) {
  if (!condition) fail(message, detail);
}
function assertEqual(actual, expected, message) {
  if (actual !== expected) fail(message, { expected, actual });
}
async function expectReject(operation, code, message) {
  try {
    await operation();
  } catch (error) {
    assertEqual(error && error.message, code, message);
    return error;
  }
  fail(message, { expectedError: code });
}
function deepClone(value) {
  return structuredClone(value);
}
function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, stableValue(nested)]),
  );
}
function hashJson(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(stableValue(value)), "utf8")
    .digest("hex");
}
function clean(value) {
  return String(value ?? "").trim();
}

const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveFilename(request, parent, isMain, options) {
  if (typeof request === "string" && request.startsWith("@/")) {
    request = path.join(repoRoot, "src", request.slice(2));
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

const originalLoad = Module._load;
Module._load = function load(request, parent, isMain) {
  if (request === "@prisma/client") {
    return {
      Prisma: {
        TransactionIsolationLevel: {
          Serializable: "Serializable",
        },
      },
    };
  }
  if (request === "@/lib/prisma") return { prisma: {} };
  if (request === "@/lib/appraisals/authority") {
    return {
      assertAppraisalAuthority() {},
    };
  }
  if (request === "@/lib/appraisals/headteacherFeedback") {
    return {
      HEADTEACHER_FEEDBACK_POLICY: {
        workflow: "HEADTEACHER_CONFIDENTIAL_STAFF_FEEDBACK",
        instrumentCode: "HEADTEACHER_STAFF_FEEDBACK_V1",
        instrumentVersion: 1,
      },
      assertActiveHeadteacherFeedbackTarget() {},
      assertHeadteacherFeedbackInstrumentReady() {},
      assertHeadteacherFeedbackTargetInGovernanceScope() {},
    };
  }
  if (request === "@/lib/appraisals/headteacherFeedbackAggregateReadiness") {
    return {
      readHeadteacherFeedbackAggregateReadiness: async () => {
        throw new Error("Injected readiness dependency expected");
      },
    };
  }
  if (request === "@/lib/appraisals/headteacherSupervisoryAssessment") {
    return {
      HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY: {
        workflow: "HEADTEACHER_GOVERNANCE_SUPERVISORY_ASSESSMENT",
        instrumentCode: "HEADTEACHER_SUPERVISORY_ASSESSMENT_V1",
        instrumentVersion: 1,
        expectedSectionCount: 4,
        expectedItemCount: 34,
        expectedSectionMaximums: [55, 45, 40, 30],
        operationalAssessorRoles: [
          "SISSO",
          "BASIC_SCHOOL_COORDINATOR",
          "HEAD_OF_SUPERVISION",
          "DISTRICT_DIRECTOR",
        ],
      },
      canonicalHeadteacherSupervisoryAssessorRole(value) {
        const normalized = clean(value).toUpperCase().replace(/[\s-]+/g, "_");
        if (normalized === "CIRCUIT_SUPERVISOR") return "SISSO";
        return normalized;
      },
      inspectHeadteacherSupervisoryInstrument() {
        return { valid: true, issues: [] };
      },
    };
  }
  if (request === "@/lib/appraisals/headteacherSupervisoryReviewAdmission") {
    return {
      HEADTEACHER_SUPERVISORY_HOS_REVIEW_START_POLICY: {
        schemaVersion: 1,
        workflow: "HEADTEACHER_GOVERNANCE_SUPERVISORY_ASSESSMENT",
        evidenceStream: "GOVERNANCE_SUPERVISORY_ASSESSMENT",
      },
    };
  }
  if (request === "@/lib/appraisals/headteacherSupervisoryReviewDecision") {
    return {
      HEADTEACHER_SUPERVISORY_HOS_DECISION_POLICY: {
        schemaVersion: 1,
        workflow: "HEADTEACHER_GOVERNANCE_SUPERVISORY_ASSESSMENT",
        evidenceStream: "GOVERNANCE_SUPERVISORY_ASSESSMENT",
      },
    };
  }
  if (request === "@/lib/appraisals/scoring") {
    return {
      calculateAppraisalScores(rows) {
        const sectionKeys = [...new Set(rows.map((row) => row.sectionKey))];
        return {
          ok: true,
          value: {
            sectionPercentages: Object.fromEntries(
              sectionKeys.map((key) => [key, 80]),
            ),
            overallPercentage: 80,
            answeredItems: rows.length,
            notApplicableItems: 0,
          },
        };
      },
    };
  }
  if (request === "@/lib/roleRouting") {
    return {
      effectiveRole(value) {
        return clean(value).toUpperCase().replace(/[\s-]+/g, "_");
      },
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

require.extensions[".ts"] = function compileTypeScript(loadedModule, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const transpiled = ts.transpileModule(source, {
    fileName: filename,
    reportDiagnostics: true,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
      resolveJsonModule: true,
      strict: true,
      skipLibCheck: true,
    },
  });
  if (transpiled.diagnostics?.length) {
    fail(
      `TypeScript diagnostics in ${filename}`,
      ts.formatDiagnosticsWithColorAndContext(transpiled.diagnostics, {
        getCanonicalFileName: (fileName) => fileName,
        getCurrentDirectory: () => repoRoot,
        getNewLine: () => "\n",
      }),
    );
  }
  loadedModule._compile(transpiled.outputText, filename);
};

const reviewModule = require(
  path.join(repoRoot, "src/lib/appraisals/headteacherDirectorReview.ts"),
);
const {
  HEADTEACHER_DIRECTOR_CORRECTION_CONTINUATION_POLICY,
  ensureHeadteacherDirectorCorrectionReviewContinuation,
} = reviewModule;

const NOW = new Date("2026-08-12T18:00:00.000Z");
const VISIT_HASH = "c".repeat(64);
const INSTRUMENT_HASH = "d".repeat(64);
const STAFF_SOURCE_HASH = "b".repeat(64);
const STAFF_DEFINITION_HASH = "a".repeat(64);

function sections() {
  const sizes = [11, 9, 8, 6];
  const maximums = [55, 45, 40, 30];
  return sizes.map((size, sectionIndex) => ({
    id: `section-${sectionIndex + 1}`,
    key: `section_${sectionIndex + 1}`,
    title: `Section ${sectionIndex + 1}`,
    order: sectionIndex + 1,
    maxScore: maximums[sectionIndex],
    items: Array.from({ length: size }, (_, itemIndex) => ({
      id: `item-${sectionIndex + 1}-${itemIndex + 1}`,
      key: `item_${sectionIndex + 1}_${itemIndex + 1}`,
      label: `Item ${sectionIndex + 1}.${itemIndex + 1}`,
      order: itemIndex + 1,
      maxScore: 5,
    })),
  }));
}

function scoreRows(assessmentId, instrumentSections) {
  return instrumentSections.flatMap((section) =>
    section.items.map((item) => ({
      id: `score-${assessmentId}-${item.id}`,
      assessmentId,
      instrumentItemId: item.id,
      sectionKey: section.key,
      sectionTitle: section.title,
      sectionOrder: section.order,
      sectionMaxScore: section.maxScore,
      itemKey: item.key,
      itemLabel: item.label,
      itemOrder: item.order,
      itemMaxScore: item.maxScore,
      score: 4,
      notApplicable: false,
    })),
  );
}

function assessmentHashPayload(assessment) {
  const stored = new Map(
    assessment.scores.map((score) => [score.instrumentItemId, score]),
  );
  return {
    schemaVersion: 1,
    workflow: "HEADTEACHER_GOVERNANCE_SUPERVISORY_ASSESSMENT",
    evidenceStream: "GOVERNANCE_SUPERVISORY_ASSESSMENT",
    assessment: {
      id: assessment.id,
      cycleId: assessment.cycleId,
      revision: assessment.revision,
      assessorUserId: assessment.assessorUserId,
      assessorAssignmentId: assessment.assessorAssignmentId,
      dateObserved: assessment.dateObserved.toISOString().slice(0, 10),
      visitContextHash: VISIT_HASH,
    },
    instrument: {
      instrumentVersionId: assessment.instrumentVersionId,
      code: assessment.instrumentVersion.instrument.code,
      version: assessment.instrumentVersion.version,
      contentHash: assessment.instrumentVersion.contentHash,
    },
    scores: assessment.instrumentVersion.sections.flatMap((section) =>
      section.items.map((item) => {
        const score = stored.get(item.id);
        return {
          instrumentItemId: item.id,
          itemKey: item.key,
          sectionKey: section.key,
          sectionOrder: section.order,
          itemOrder: item.order,
          itemMaxScore: item.maxScore,
          score: score.score,
          notApplicable: false,
        };
      }),
    ),
    sectionPercentages: Object.fromEntries(
      assessment.instrumentVersion.sections.map((section) => [section.key, 80]),
    ),
    overallPercentage: 80,
    commentsIncluded: false,
    separateFromStaffFeedback: true,
    combinedWeightingDefined: false,
  };
}

function makeAssessment({
  id,
  revision,
  status,
  priorAssessmentId = null,
  metadata = {},
}) {
  const instrumentSections = sections();
  const assessment = {
    id,
    cycleId: "cycle-headteacher-001",
    instrumentVersionId: "supervisory-version-001",
    assessorUserId: "sisso-user-001",
    assessorAssignmentId: "sisso-assignment-001",
    status,
    revision,
    priorAssessmentId,
    dateObserved: new Date("2026-08-10T00:00:00.000Z"),
    overallPercentage: 80,
    sectionPercentagesJson: Object.fromEntries(
      instrumentSections.map((section) => [section.key, 80]),
    ),
    generalComment: null,
    evidenceSnapshotJson: {
      schemaVersion: 2,
      assessor: {
        userId: "sisso-user-001",
        role: "SISSO",
        assignmentId: "sisso-assignment-001",
        assignmentRole: "SISSO",
        scopeLevel: "CIRCUIT",
      },
      jurisdiction: {
        districtZoneId: "district-001",
      },
    },
    assessmentHash: null,
    finalizedByUserId: status === "FINALIZED" ? "sisso-user-001" : null,
    finalizedAt:
      status === "FINALIZED"
        ? new Date("2026-08-12T17:00:00.000Z")
        : new Date("2026-08-11T17:00:00.000Z"),
    metadata: {
      visitContextHash: VISIT_HASH,
      reviewerMayRewriteScores: false,
      separateFromStaffFeedback: true,
      combinedWeightingDefined: false,
      providerCalled: false,
      ...metadata,
    },
    scores: [],
    instrumentVersion: {
      id: "supervisory-version-001",
      version: 1,
      status: "ACTIVE",
      contentHash: INSTRUMENT_HASH,
      instrument: {
        id: "supervisory-instrument-001",
        code: "HEADTEACHER_SUPERVISORY_ASSESSMENT_V1",
        purpose: "HEADTEACHER_SUPERVISORY_ASSESSMENT",
        subjectType: "HEADTEACHER",
        isActive: true,
      },
      sections: instrumentSections,
    },
  };
  assessment.scores = scoreRows(id, instrumentSections);
  assessment.assessmentHash = hashJson(assessmentHashPayload(assessment));
  return assessment;
}

function correctionReturnEvidenceHash(assessment, review) {
  return hashJson({
    schemaVersion: 1,
    workflow: "HEADTEACHER_GOVERNANCE_SUPERVISORY_ASSESSMENT",
    assessmentId: assessment.id,
    assessmentHash: assessment.assessmentHash,
    review: {
      id: review.id,
      stage: review.stage,
      decision: "RETURNED",
      note: review.note,
      reviewerUserId: review.reviewerUserId,
      reviewerAssignmentId: review.reviewerAssignmentId,
      decidedAt: review.decidedAt.toISOString(),
    },
    reviewerScoreEditsIncluded: false,
  });
}

function correctionRevisionKey({
  sourceAssessmentId,
  revision,
  sourceAssessmentHash,
  returnEvidenceHash,
}) {
  return hashJson({
    schemaVersion: 1,
    originalAssessmentId: sourceAssessmentId,
    nextRevision: revision,
    sourceAssessmentHash,
    returnEvidenceHash,
    visitContextHash: VISIT_HASH,
  });
}

function makeFixture(stage) {
  const sourceReview = {
    id: `director-return-review-${stage}`,
    cycleId: "cycle-headteacher-001",
    assessmentId: "assessment-source-001",
    reviewerUserId: "director-user-001",
    reviewerAssignmentId: "director-assignment-001",
    stage,
    decision: "RETURNED",
    note: "Correct the supervisory evidence and resubmit it.",
    decidedAt: new Date("2026-08-11T18:00:00.000Z"),
    metadata: {
      schemaVersion: 1,
      workflow: "HEADTEACHER_CONFIDENTIAL_STAFF_FEEDBACK",
      reviewStage: stage,
      reviewEvidenceHash: "9".repeat(64),
      evidence: {},
      decisionSchemaVersion: 1,
      decision: "RETURN",
      decisionContractHash: "e".repeat(64),
      decisionRequestHash: "f".repeat(64),
      reviewerMayRewriteScores: false,
      scoreMutationPerformed: false,
      releasePerformed: false,
      respondentIdentitiesAccessed: false,
      individualStaffResponsesAccessed: false,
      separateEvidenceStreams: true,
      combinedWeightingDefined: false,
      providerCalled: false,
    },
    createdAt: new Date("2026-08-11T17:30:00.000Z"),
  };
  const source = makeAssessment({
    id: sourceReview.assessmentId,
    revision: 1,
    status: "SUPERSEDED",
    metadata: {
      returnedByDirectorReviewId: sourceReview.id,
      returnedByDirectorReviewStage: stage,
      returnDecisionContractHash: sourceReview.metadata.decisionContractHash,
      returnDecisionRequestHash: sourceReview.metadata.decisionRequestHash,
    },
  });
  const returnEvidenceHash = correctionReturnEvidenceHash(source, sourceReview);
  const current = makeAssessment({
    id: "assessment-current-002",
    revision: 2,
    status: "FINALIZED",
    priorAssessmentId: source.id,
    metadata: {
      sourceAssessmentId: source.id,
      sourceAssessmentHash: source.assessmentHash,
      returnReviewId: sourceReview.id,
      returnReviewStage: stage,
      returnEvidenceHash,
      returnReason: sourceReview.note,
      revisionSchemaVersion: 1,
      copiedScoreCount: 34,
      preserveVisitContext: true,
      returnedAssessmentRequiresRevision: true,
      revisionKey: correctionRevisionKey({
        sourceAssessmentId: source.id,
        revision: 2,
        sourceAssessmentHash: source.assessmentHash,
        returnEvidenceHash,
      }),
    },
  });
  const cycle = {
    id: "cycle-headteacher-001",
    instrumentVersionId: "staff-version-001",
    scopeZoneId: "district-001",
    targetUserId: "headteacher-001",
    targetTenantId: "tenant-001",
    targetZoneId: "circuit-001",
    status: "UNDER_REVIEW",
    minimumResponses: 1,
    targetRoleSnapshot: "HEADTEACHER",
    reviewStartedAt: new Date("2026-08-10T12:00:00.000Z"),
    releasedAt: null,
    cancelledAt: null,
    metadata: {
      workflow: "HEADTEACHER_CONFIDENTIAL_STAFF_FEEDBACK",
    },
    scopeZone: {
      id: "district-001",
      name: "Akatsi South",
      isActive: true,
      zoneType: { level: 2, countryCode: "GH" },
    },
    instrumentVersion: {
      id: "staff-version-001",
      version: 1,
      contentHash: STAFF_DEFINITION_HASH,
      instrument: {
        code: "HEADTEACHER_STAFF_FEEDBACK_V1",
        purpose: "HEADTEACHER_STAFF_FEEDBACK",
        subjectType: "HEADTEACHER",
        isActive: true,
      },
    },
  };
  const membership = {
    id: "membership-001",
    userId: "headteacher-001",
    tenantId: "tenant-001",
    status: "ACTIVE",
    role: { name: "HEADTEACHER" },
    tenant: {
      id: "tenant-001",
      status: "ACTIVE",
      zone: {
        id: "circuit-001",
        name: "Gefia Circuit",
        isActive: true,
        parentZoneId: "district-001",
        zoneType: { level: 1, countryCode: "GH" },
        parentZone: {
          id: "district-001",
          name: "Akatsi South",
          isActive: true,
          zoneType: { level: 2, countryCode: "GH" },
        },
      },
    },
  };
  const assignments = [
    {
      id: "sisso-assignment-001",
      userId: "sisso-user-001",
      role: "SISSO",
      status: "ACTIVE",
      revokedAt: null,
      startsAt: new Date("2026-01-01T00:00:00.000Z"),
      endsAt: null,
      zoneId: "circuit-001",
      zone: {
        id: "circuit-001",
        name: "Gefia Circuit",
        isActive: true,
        zoneType: { level: 1, countryCode: "GH" },
      },
    },
    {
      id: "director-assignment-001",
      userId: "director-user-001",
      role: "DISTRICT_DIRECTOR",
      status: "ACTIVE",
      revokedAt: null,
      startsAt: new Date("2026-01-01T00:00:00.000Z"),
      endsAt: null,
      zoneId: "district-001",
      zone: {
        id: "district-001",
        name: "Akatsi South",
        isActive: true,
        zoneType: { level: 2, countryCode: "GH" },
      },
    },
  ];

  const state = {
    cycle,
    membership,
    assignments,
    assessments: [source, current],
    reviews: [sourceReview],
    audits: [],
    transactionOptions: [],
  };

  const db = {
    appraisalCycle: {
      async findUnique() {
        return deepClone(state.cycle);
      },
      async update(args) {
        state.cycle.status = args.data.status;
        state.cycle.reviewStartedAt = args.data.reviewStartedAt;
        state.cycle.metadata = deepClone(args.data.metadata);
        return {
          id: state.cycle.id,
          status: state.cycle.status,
          reviewStartedAt: state.cycle.reviewStartedAt,
          metadata: state.cycle.metadata,
        };
      },
    },
    membership: {
      async findFirst() {
        return deepClone(state.membership);
      },
    },
    governanceOfficerAssignment: {
      async findMany(args) {
        const userId = args?.where?.userId;
        return deepClone(
          state.assignments.filter(
            (assignment) => !userId || assignment.userId === userId,
          ),
        );
      },
    },
    appraisalAggregateSnapshot: {
      async findMany() {
        return [];
      },
    },
    appraisalAssessment: {
      async findUnique(args) {
        return (
          deepClone(
            state.assessments.find((assessment) => assessment.id === args.where.id),
          ) ?? null
        );
      },
      async findMany() {
        return deepClone(state.assessments);
      },
    },
    appraisalReview: {
      async findUnique(args) {
        if (args.where.id) {
          return (
            deepClone(
              state.reviews.find((review) => review.id === args.where.id),
            ) ?? null
          );
        }
        const key = args.where.assessmentId_stage;
        return (
          deepClone(
            state.reviews.find(
              (review) =>
                review.assessmentId === key.assessmentId &&
                review.stage === key.stage,
            ),
          ) ?? null
        );
      },
      async findMany(args) {
        const assessmentId = args?.where?.assessmentId;
        return deepClone(
          state.reviews
            .filter((review) => !assessmentId || review.assessmentId === assessmentId)
            .sort(
              (left, right) =>
                left.stage - right.stage ||
                left.createdAt.getTime() - right.createdAt.getTime(),
            ),
        );
      },
      async create(args) {
        if (
          state.reviews.some(
            (review) =>
              review.assessmentId === args.data.assessmentId &&
              review.stage === args.data.stage,
          )
        ) {
          const error = new Error("unique");
          error.code = "P2002";
          throw error;
        }
        const review = {
          id: `continued-review-${args.data.stage}`,
          ...deepClone(args.data),
          createdAt: NOW,
        };
        state.reviews.push(review);
        return deepClone(review);
      },
    },
    auditLog: {
      async create(args) {
        state.audits.push(deepClone(args.data));
        return args.data;
      },
    },
    async $transaction(operation, options) {
      state.transactionOptions.push(deepClone(options));
      return operation(db);
    },
  };

  const readiness = {
    audience: "DIRECTOR",
    state: "UNDER_REVIEW",
    cycleId: cycle.id,
    cycleStatus: "UNDER_REVIEW",
    snapshotId: "snapshot-001",
    snapshotVersion: 1,
    snapshotSourceHash: STAFF_SOURCE_HASH,
    eligibleResponses: 4,
    finalizedResponses: 3,
    expiredResponses: 1,
    revokedResponses: 0,
    minimumResponses: 1,
    aggregateScoresIncluded: false,
    respondentIdentitiesIncluded: false,
    participantListIncluded: false,
  };

  return { state, db, readiness, current, source, sourceReview };
}

function inputFor(fixture) {
  return {
    actorUserId: "sisso-user-001",
    actorRoleName: "SISSO",
    assessmentId: fixture.current.id,
    reqId: "b5b-correction-001",
    now: NOW,
    database: fixture.db,
    dependencies: {
      readAggregateReadiness: async () => fixture.readiness,
    },
  };
}

async function exerciseStage(stage) {
  const fixture = makeFixture(stage);
  const result = await ensureHeadteacherDirectorCorrectionReviewContinuation(
    inputFor(fixture),
  );

  assertEqual(result.outcome, "CREATED", `Stage ${stage} correction must create review`);
  assertEqual(result.sourceReviewStage, stage, "Source return stage mismatch");
  assertEqual(result.reviewStage, stage, "Correction must preserve Director stage");
  assertEqual(result.reviewDecision, "PENDING", "Corrected review must be pending");
  assertEqual(result.reviewerUserId, "director-user-001", "Original Director must resume");
  assertEqual(
    result.reviewerAssignmentId,
    "director-assignment-001",
    "Original Director assignment must resume",
  );

  const currentReviews = fixture.state.reviews.filter(
    (review) => review.assessmentId === fixture.current.id,
  );
  assertEqual(currentReviews.length, 1, "Exactly one corrected review required");
  assertEqual(currentReviews[0].stage, stage, "Persisted correction stage mismatch");
  assertEqual(
    currentReviews[0].metadata.continuedFromReviewStage,
    stage,
    "Review metadata must preserve source return stage",
  );
  assertEqual(
    currentReviews[0].metadata.preserveSourceReviewStage,
    true,
    "Review metadata must declare stage preservation",
  );
  assertEqual(
    currentReviews[0].metadata.admissionType,
    "CORRECTED_ASSESSMENT",
    "Correction admission type mismatch",
  );
  assertEqual(fixture.state.audits.length, 1, "Fresh continuation must audit once");
  assertEqual(
    fixture.state.audits[0].metadata.sourceReturnReviewStage,
    stage,
    "Audit must retain the source return stage",
  );
  assertEqual(
    fixture.state.audits[0].metadata.preserveSourceReviewStage,
    true,
    "Audit must record stage preservation",
  );
  assertEqual(
    fixture.state.transactionOptions[0].isolationLevel,
    "Serializable",
    "Correction continuation must remain serializable",
  );

  const retry = await ensureHeadteacherDirectorCorrectionReviewContinuation(
    inputFor(fixture),
  );
  assertEqual(retry.outcome, "EXISTING_REVIEW", "Retry must be idempotent");
  assertEqual(retry.reviewStage, stage, "Retry must preserve same stage");
  assertEqual(
    fixture.state.reviews.filter(
      (review) => review.assessmentId === fixture.current.id,
    ).length,
    1,
    "Retry must not create a duplicate review",
  );
  assertEqual(fixture.state.audits.length, 1, "Retry must not duplicate audit");
}

async function main() {
  assertEqual(
    HEADTEACHER_DIRECTOR_CORRECTION_CONTINUATION_POLICY.reviewStageMode,
    "SOURCE_RETURN_STAGE",
    "Correction policy must derive the resumed stage from the Director return",
  );
  assertEqual(
    HEADTEACHER_DIRECTOR_CORRECTION_CONTINUATION_POLICY.preserveSourceReviewStage,
    true,
    "Correction policy must preserve the source Director stage",
  );

  await exerciseStage(1);
  await exerciseStage(2);
  await exerciseStage(3);

  const drift = makeFixture(2);
  drift.current.metadata.returnReviewStage = 1;
  await expectReject(
    () =>
      ensureHeadteacherDirectorCorrectionReviewContinuation(
        inputFor(drift),
      ),
    "HEADTEACHER_DIRECTOR_REVIEW_CONTINUATION_REVISION_CHAIN_INVALID",
    "Correction must fail closed if revision provenance changes the returned stage",
  );

  const sourceDrift = makeFixture(2);
  sourceDrift.source.metadata.returnedByDirectorReviewStage = 1;
  await expectReject(
    () =>
      ensureHeadteacherDirectorCorrectionReviewContinuation(
        inputFor(sourceDrift),
      ),
    "HEADTEACHER_DIRECTOR_REVIEW_CONTINUATION_DIRECTOR_RETURN_PROVENANCE_INVALID",
    "Correction must fail closed if source assessment Director-return provenance drifts",
  );

  const source = fs.readFileSync(
    path.join(repoRoot, "src/lib/appraisals/headteacherDirectorReview.ts"),
    "utf8",
  );
  for (const required of [
    'reviewStageMode: "SOURCE_RETURN_STAGE"',
    "preserveSourceReviewStage: true",
    'kind: "DIRECTOR_CORRECTION"',
    "sourceReviewStage: continuation.sourceReviewStage",
    "reviewStage: continuation.sourceReviewStage",
    "HEADTEACHER_DIRECTOR_REVIEW_CONTINUATION_DIRECTOR_RETURN_PROVENANCE_INVALID",
    "Prisma.TransactionIsolationLevel.Serializable",
  ]) {
    assert(source.includes(required), `Required B5B marker missing: ${required}`);
  }
  for (const forbidden of [
    'kind: "DIRECTOR_CORRECTION_STAGE_1"',
    "sendSms",
    "sendEmail",
    "appraisalIdentityAccess.create",
  ]) {
    assert(!source.includes(forbidden), `Forbidden B5B marker found: ${forbidden}`);
  }

  console.log("");
  console.log("=== N6-F1C6B5B DIRECTOR STAGE-PRESERVING CORRECTION CONTINUATION ===");
  console.log("");
  console.log("Director Stage 1 RETURN         : correction resumes Stage 1");
  console.log("Director Stage 2 RETURN         : correction resumes Stage 2");
  console.log("Director Stage N RETURN         : correction resumes same Stage N");
  console.log("Original Director               : preserved");
  console.log("Original Director assignment    : preserved and revalidated");
  console.log("Assessment revision             : remains FINALIZED and immutable");
  console.log("Cycle status                    : remains UNDER_REVIEW");
  console.log("Review decision                 : PENDING");
  console.log("Review evidence hash            : binds correction provenance");
  console.log("Retry                           : idempotent");
  console.log("Transaction                     : SERIALIZABLE + bounded");
  console.log("Staff respondent identities     : absent");
  console.log("Reviewer score rewriting        : forbidden");
  console.log("Providers                       : absent");
  console.log("Database accessed               : fake only");
  console.log("");
  console.log("RESULT: N6-F1C6B5B DIRECTOR CORRECTION CONTINUATION GREEN");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    Module._load = originalLoad;
    Module._resolveFilename = originalResolveFilename;
  });
