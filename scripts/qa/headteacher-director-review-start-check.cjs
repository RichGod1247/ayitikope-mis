#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS QA harness intentionally loads TypeScript through a local transpile hook. */

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
function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveFilename(request, parent, isMain, options) {
  if (typeof request === "string" && request.startsWith("@/")) {
    request = path.join(repoRoot, "src", request.slice(2));
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
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
      skipLibCheck: true,
      strict: true,
    },
  });
  const diagnostics = transpiled.diagnostics ?? [];
  if (diagnostics.length) {
    fail(
      `TypeScript transpilation diagnostics in ${filename}`,
      ts.formatDiagnosticsWithColorAndContext(diagnostics, {
        getCanonicalFileName: (fileName) => fileName,
        getCurrentDirectory: () => repoRoot,
        getNewLine: () => "\n",
      }),
    );
  }
  loadedModule._compile(transpiled.outputText, filename);
};

const {
  APPRAISAL_INSTRUMENT_DEFINITIONS,
  APPRAISAL_INSTRUMENT_CODES,
} = require(path.join(repoRoot, "src/lib/appraisals/instruments.ts"));
const { calculateAppraisalScores } = require(
  path.join(repoRoot, "src/lib/appraisals/scoring.ts"),
);
const supervisoryContract = require(
  path.join(
    repoRoot,
    "src/lib/appraisals/headteacherSupervisoryAssessment.ts",
  ),
);
const reviewModule = require(
  path.join(repoRoot, "src/lib/appraisals/headteacherDirectorReview.ts"),
);

const {
  HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY,
  canonicalHeadteacherSupervisoryAssessorRole,
} = supervisoryContract;
const {
  HEADTEACHER_DIRECTOR_REVIEW_POLICY,
  startHeadteacherDirectorReview,
} = reviewModule;

const NOW = new Date("2026-07-29T12:00:00.000Z");
const STAFF_HASH = "a".repeat(64);
const STAFF_SOURCE_HASH = "b".repeat(64);
const VISIT_HASH = "c".repeat(64);

function officialSections() {
  const definition =
    APPRAISAL_INSTRUMENT_DEFINITIONS[
      APPRAISAL_INSTRUMENT_CODES.HEADTEACHER_SUPERVISORY_ASSESSMENT_V1
    ];
  return [...definition.sections]
    .sort((left, right) => left.order - right.order)
    .map((section) => ({
      id: `section-${section.order}`,
      key: section.key,
      title: section.title,
      order: section.order,
      maxScore: section.maxScore,
      items: [...section.items]
        .sort((left, right) => left.order - right.order)
        .map((item) => ({
          id: `item-${section.order}-${item.order}`,
          key: item.key,
          label: item.label,
          order: item.order,
          maxScore: item.maxScore,
        })),
    }));
}

function calculationRows(sections, scoreRows) {
  const stored = new Map(
    scoreRows.map((score) => [score.instrumentItemId, score]),
  );
  return sections.flatMap((section) =>
    section.items.map((item) => {
      const score = stored.get(item.id);
      return {
        itemKey: item.key,
        sectionKey: section.key,
        sectionTitle: section.title,
        sectionOrder: section.order,
        score: score?.score ?? null,
        notApplicable: score?.notApplicable ?? false,
        itemMaxScore: item.maxScore,
      };
    }),
  );
}

function assessmentHashPayload(assessment, sections, sectionPercentages, overall) {
  const stored = new Map(
    assessment.scores.map((score) => [score.instrumentItemId, score]),
  );
  return {
    schemaVersion: 1,
    workflow: HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.workflow,
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
    scores: sections.flatMap((section) =>
      section.items.map((item) => {
        const score = stored.get(item.id);
        return {
          instrumentItemId: item.id,
          itemKey: item.key,
          sectionKey: section.key,
          sectionOrder: section.order,
          itemOrder: item.order,
          itemMaxScore: item.maxScore,
          score: score?.score ?? null,
          notApplicable: score?.notApplicable ?? false,
        };
      }),
    ),
    sectionPercentages,
    overallPercentage: overall,
    commentsIncluded: false,
    separateFromStaffFeedback: true,
    combinedWeightingDefined: false,
  };
}

function makeAssessment(overrides = {}) {
  const sections = officialSections();
  const scoreRows = sections.flatMap((section) =>
    section.items.map((item, index) => ({
      id: `score-${section.order}-${item.order}`,
      assessmentId: "assessment-001",
      instrumentItemId: item.id,
      sectionKey: section.key,
      sectionTitle: section.title,
      sectionOrder: section.order,
      sectionMaxScore: section.maxScore,
      itemKey: item.key,
      itemLabel: item.label,
      itemOrder: item.order,
      itemMaxScore: item.maxScore,
      score: section.order === 4 && index === 0 ? null : 5,
      notApplicable: section.order === 4 && index === 0,
    })),
  );
  const calculated = calculateAppraisalScores(
    calculationRows(sections, scoreRows),
    { requireComplete: true },
  );
  assert(calculated.ok, "Fixture supervisory scores must calculate", calculated);

  const assessment = {
    id: "assessment-001",
    cycleId: "cycle-headteacher-001",
    instrumentVersionId: "supervisory-version-001",
    assessorUserId: "sisso-user-001",
    assessorAssignmentId: "sisso-assignment-001",
    status: "FINALIZED",
    revision: 1,
    priorAssessmentId: null,
    dateObserved: new Date("2026-07-27T00:00:00.000Z"),
    overallPercentage: calculated.value.overallPercentage,
    sectionPercentagesJson: calculated.value.sectionPercentages,
    generalComment: null,
    evidenceSnapshotJson: {
      target: { userId: "headteacher-001" },
      assessor: {
        userId: "sisso-user-001",
        role: "SISSO",
        assignmentId: "sisso-assignment-001",
        assignmentRole: "SISSO",
        scopeLevel: "CIRCUIT",
      },
      jurisdiction: { districtZoneId: "district-001" },
    },
    assessmentHash: null,
    finalizedByUserId: "sisso-user-001",
    finalizedAt: new Date("2026-07-28T10:00:00.000Z"),
    metadata: {
      visitContextHash: VISIT_HASH,
      reviewerMayRewriteScores: false,
      combinedWeightingDefined: false,
    },
    scores: scoreRows,
    instrumentVersion: {
      id: "supervisory-version-001",
      version: 1,
      status: "ACTIVE",
      contentHash: "d".repeat(64),
      instrument: {
        id: "supervisory-instrument-001",
        code:
          APPRAISAL_INSTRUMENT_CODES.HEADTEACHER_SUPERVISORY_ASSESSMENT_V1,
        purpose: "HEADTEACHER_SUPERVISORY_ASSESSMENT",
        subjectType: "HEADTEACHER",
        isActive: true,
      },
      sections,
    },
  };

  assessment.assessmentHash = hashJson(
    assessmentHashPayload(
      assessment,
      sections,
      calculated.value.sectionPercentages,
      calculated.value.overallPercentage,
    ),
  );
  return { ...assessment, ...overrides };
}

function withAssessorOrigin(assessment, input) {
  const next = deepClone(assessment);
  next.assessorUserId = input.userId;
  next.assessorAssignmentId = input.assignmentId;
  next.finalizedByUserId = input.userId;
  next.evidenceSnapshotJson = {
    ...objectValue(next.evidenceSnapshotJson),
    assessor: {
      userId: input.userId,
      role: input.role,
      assignmentId: input.assignmentId,
      assignmentRole: input.role,
      scopeLevel: input.scopeLevel,
    },
    jurisdiction: { districtZoneId: "district-001" },
  };
  const calculated = calculateAppraisalScores(
    calculationRows(next.instrumentVersion.sections, next.scores),
    { requireComplete: true },
  );
  assert(calculated.ok, "Role-aware fixture must calculate");
  next.assessmentHash = hashJson(
    assessmentHashPayload(
      next,
      next.instrumentVersion.sections,
      calculated.value.sectionPercentages,
      calculated.value.overallPercentage,
    ),
  );
  return next;
}

function makeHosAuthoredAssessment() {
  return withAssessorOrigin(makeAssessment(), {
    userId: "hos-user-001",
    assignmentId: "hos-assignment-001",
    role: "HEAD_OF_SUPERVISION",
    scopeLevel: "DISTRICT",
  });
}

function hosReviewEvidenceHash(assessment, review) {
  return hashJson({
    schemaVersion: 1,
    workflow: "HEADTEACHER_GOVERNANCE_SUPERVISORY_ASSESSMENT",
    evidenceStream: "GOVERNANCE_SUPERVISORY_ASSESSMENT",
    assessment: {
      id: assessment.id,
      cycleId: assessment.cycleId,
      revision: assessment.revision,
      assessmentHash: assessment.assessmentHash,
      visitContextHash: VISIT_HASH,
      assessorUserId: assessment.assessorUserId,
      assessorAssignmentId: assessment.assessorAssignmentId,
    },
    review: {
      stage: 1,
      reviewerUserId: review.reviewerUserId,
      reviewerAssignmentId: review.reviewerAssignmentId,
      reviewerRole: "HEAD_OF_SUPERVISION",
    },
    jurisdiction: {
      districtZoneId: "district-001",
      targetTenantId: "tenant-001",
    },
    staffFeedbackIncluded: false,
    respondentIdentitiesIncluded: false,
    reviewerMayRewriteScores: false,
    scoreMutationAllowed: false,
  });
}

function makeHosForwardedReview(assessment) {
  const review = {
    id: "hos-review-001",
    cycleId: assessment.cycleId,
    assessmentId: assessment.id,
    reviewerUserId: "hos-user-001",
    reviewerAssignmentId: "hos-assignment-001",
    stage: 1,
    decision: "ACCEPTED",
    note: null,
    decidedAt: new Date("2026-07-29T11:00:00.000Z"),
    metadata: {},
    createdAt: new Date("2026-07-29T10:00:00.000Z"),
  };
  const reviewHash = hosReviewEvidenceHash(assessment, review);
  const requestHash = hashJson({
    schemaVersion: 1,
    workflow: "HEADTEACHER_GOVERNANCE_SUPERVISORY_ASSESSMENT",
    evidenceStream: "GOVERNANCE_SUPERVISORY_ASSESSMENT",
    assessment: {
      id: assessment.id,
      cycleId: assessment.cycleId,
      revision: assessment.revision,
      assessmentHash: assessment.assessmentHash,
      visitContextHash: VISIT_HASH,
    },
    review: {
      id: review.id,
      stage: 1,
      reviewerUserId: review.reviewerUserId,
      reviewerAssignmentId: review.reviewerAssignmentId,
      reviewEvidenceHash: reviewHash,
    },
    jurisdiction: {
      districtZoneId: "district-001",
      targetTenantId: "tenant-001",
    },
    action: "FORWARD",
    reason: null,
    returnAssessmentStatus: "FINALIZED",
    reviewDecision: "ACCEPTED",
    nextReviewCreated: false,
    reviewerMayRewriteScores: false,
    scoreMutationAllowed: false,
  });
  const decisionHash = hashJson({
    schemaVersion: 1,
    decisionRequestHash: requestHash,
    sourceReviewEvidenceHash: reviewHash,
    action: "FORWARD",
    nextReviewCreated: false,
  });
  review.metadata = {
    schemaVersion: 1,
    workflow: "HEADTEACHER_GOVERNANCE_SUPERVISORY_ASSESSMENT",
    evidenceStream: "GOVERNANCE_SUPERVISORY_ASSESSMENT",
    reviewType: "HOS_SUPERVISORY_REVIEW",
    reviewStage: 1,
    reviewerRole: "HEAD_OF_SUPERVISION",
    reviewEvidenceHash: reviewHash,
    assessmentId: assessment.id,
    assessmentRevision: assessment.revision,
    assessmentHash: assessment.assessmentHash,
    immutableEvidenceReverified: true,
    staffFeedbackIncluded: false,
    respondentIdentitiesIncluded: false,
    reviewerMayRewriteScores: false,
    scoreMutationAllowed: false,
    assessmentMutationAllowed: false,
    notificationsSeeded: false,
    providerCalled: false,
    reviewerAssignmentZoneId: "district-001",
    decisionSchemaVersion: 1,
    decisionAction: "FORWARD",
    decisionRequestHash: requestHash,
    decisionEvidenceHash: decisionHash,
    decidedByRole: "HEAD_OF_SUPERVISION",
    decidedAt: review.decidedAt.toISOString(),
    reasonHash: null,
    reasonLength: 0,
    revisionRequired: false,
    nextReviewCreated: false,
    nextReviewerRole: null,
    preserveReturningReviewerForCorrection: false,
    reviewerMayRewriteVisitEvidence: false,
    scoreMutationPerformed: false,
    visitEvidenceMutationPerformed: false,
  };
  return { review, reviewHash, requestHash, decisionHash };
}

function makeCycle(overrides = {}) {
  return {
    id: "cycle-headteacher-001",
    instrumentVersionId: "staff-version-001",
    scopeZoneId: "district-001",
    targetUserId: "headteacher-001",
    targetTenantId: "tenant-001",
    targetZoneId: "circuit-001",
    status: "CLOSED",
    minimumResponses: 1,
    targetRoleSnapshot: "HEADTEACHER",
    reviewStartedAt: null,
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
      contentHash: STAFF_HASH,
      instrument: {
        code: APPRAISAL_INSTRUMENT_CODES.HEADTEACHER_STAFF_FEEDBACK_V1,
        purpose: "HEADTEACHER_STAFF_FEEDBACK",
        subjectType: "HEADTEACHER",
        isActive: true,
      },
    },
    participants: [{ status: "FINALIZED" }],
    ...overrides,
  };
}

function makeMembership(overrides = {}) {
  return {
    id: "membership-headteacher-001",
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
    ...overrides,
  };
}

function makeAssignment(overrides = {}) {
  return {
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
    ...overrides,
  };
}

function makeHosAssignment(overrides = {}) {
  return {
    id: "hos-assignment-001",
    userId: "hos-user-001",
    role: "HEAD_OF_SUPERVISION",
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
    ...overrides,
  };
}

function makeHosForwardCycle(assessment, hosForward) {
  return makeCycle({
    status: "UNDER_REVIEW",
    reviewStartedAt: new Date("2026-07-29T10:00:00.000Z"),
    metadata: {
      workflow: "HEADTEACHER_CONFIDENTIAL_STAFF_FEEDBACK",
      headteacherSupervisoryReview: {
        schemaVersion: 1,
        state: "HOS_REVIEW_ACCEPTED_AWAITING_DIRECTOR",
        currentReviewId: hosForward.review.id,
        currentReviewStage: 1,
        currentReviewerRole: "HEAD_OF_SUPERVISION",
        currentReviewerAssignmentId: hosForward.review.reviewerAssignmentId,
        sourceReviewDecision: "ACCEPTED",
        reviewEvidenceHash: hosForward.reviewHash,
        admittedAssessmentId: assessment.id,
        admittedAssessmentRevision: assessment.revision,
        assessmentHash: assessment.assessmentHash,
        decisionRequestHash: hosForward.requestHash,
        decisionEvidenceHash: hosForward.decisionHash,
        awaitingRevision: false,
        awaitingDirectorAdmission: true,
        directorReviewCreated: false,
        preserveReturningReviewerForCorrection: false,
        reviewerMayRewriteScores: false,
        scoreMutationAllowed: false,
        staffFeedbackIncluded: false,
        respondentIdentitiesIncluded: false,
        notificationsSeeded: false,
        providerCalled: false,
        decidedAt: hosForward.review.decidedAt.toISOString(),
      },
    },
  });
}

function makeSnapshot(overrides = {}) {
  return {
    id: "snapshot-001",
    cycleId: "cycle-headteacher-001",
    version: 1,
    eligibleResponses: 1,
    finalizedResponses: 1,
    expiredResponses: 0,
    minimumResponses: 1,
    releaseEligible: true,
    overallPercentage: 82.5,
    sourceHash: STAFF_SOURCE_HASH,
    generatedByUserId: null,
    generatedAt: new Date("2026-07-29T08:00:00.000Z"),
    metadata: {
      workflow: "HEADTEACHER_CONFIDENTIAL_STAFF_FEEDBACK",
      aggregateSchemaVersion: 1,
      instrumentCode:
        APPRAISAL_INSTRUMENT_CODES.HEADTEACHER_STAFF_FEEDBACK_V1,
      instrumentVersion: 1,
      readiness: "READY",
      privacy: {
        respondentIdentitiesIncluded: false,
        individualScoresIncluded: false,
        responseHashesIncluded: false,
        submissionTimestampsIncluded: false,
        participantListIncluded: false,
      },
      sourceIntegrity: {
        sourceHashAlgorithm: "SHA-256",
        finalizedResponsesOnly: true,
        immutableSnapshotVersion: 1,
      },
    },
    ...overrides,
  };
}

function createDatabase(options = {}) {
  const state = {
    cycle: makeCycle(options.cycle),
    membership: makeMembership(options.membership),
    assignments: options.assignments ?? [makeAssignment()],
    assessments: options.assessments ?? [makeHosAuthoredAssessment()],
    snapshots:
      options.snapshots === undefined ? [makeSnapshot()] : options.snapshots,
    reviews: options.reviews ?? [],
    audits: [],
    transactionOptions: [],
    updates: 0,
    creates: 0,
    uniqueRace: options.uniqueRace ?? false,
    raceTriggered: false,
  };

  const db = {
    appraisalCycle: {
      async findUnique() {
        return state.cycle;
      },
      async update(args) {
        state.updates += 1;
        state.cycle = {
          ...state.cycle,
          ...args.data,
          reviewStartedAt: args.data.reviewStartedAt,
        };
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
        return state.membership;
      },
    },
    governanceOfficerAssignment: {
      async findMany() {
        return state.assignments;
      },
    },
    appraisalAggregateSnapshot: {
      async findMany() {
        return state.snapshots;
      },
    },
    appraisalAssessment: {
      async findMany() {
        return state.assessments;
      },
    },
    appraisalReview: {
      async findUnique(args) {
        const key = args.where.assessmentId_stage;
        return (
          state.reviews.find(
            (review) =>
              review.assessmentId === key.assessmentId &&
              review.stage === key.stage,
          ) ?? null
        );
      },
      async findMany(args) {
        const assessmentId = args?.where?.assessmentId;
        return state.reviews
          .filter((review) => !assessmentId || review.assessmentId === assessmentId)
          .sort(
            (left, right) =>
              left.stage - right.stage ||
              left.createdAt.getTime() - right.createdAt.getTime(),
          );
      },
      async create(args) {
        state.creates += 1;
        if (state.uniqueRace && !state.raceTriggered) {
          state.raceTriggered = true;
          const metadata = args.data.metadata;
          const review = {
            id: "review-race-001",
            ...args.data,
            createdAt: NOW,
          };
          state.reviews.push(review);
          state.cycle.status = "UNDER_REVIEW";
          state.cycle.reviewStartedAt = NOW;
          state.cycle.metadata = {
            ...objectValue(state.cycle.metadata),
            directorReview: {
              reviewId: review.id,
              reviewEvidenceHash: metadata.reviewEvidenceHash,
            },
          };
          const error = new Error("unique");
          error.code = "P2002";
          throw error;
        }
        const review = {
          id: `review-${state.reviews.length + 1}`,
          ...args.data,
          createdAt: NOW,
        };
        state.reviews.push(review);
        return review;
      },
    },
    auditLog: {
      async create(args) {
        state.audits.push(args.data);
        return args.data;
      },
    },
    async $transaction(operation, transactionOptions) {
      state.transactionOptions.push(transactionOptions);
      return operation(db);
    },
  };

  return { db, state };
}

function baseInput(overrides = {}) {
  return {
    actorUserId: "director-user-001",
    actorRoleName: "DISTRICT_DIRECTOR",
    cycleId: "cycle-headteacher-001",
    confirm: true,
    governanceScope: {
      isSuperAdmin: false,
      tenantIds: ["tenant-001"],
    },
    reqId: "review-request-001",
    ip: "127.0.0.1",
    userAgent: "qa",
    now: NOW,
    ...overrides,
  };
}

async function main() {
  assertEqual(
    HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.circuitOffice.distinctOfficeCount,
    1,
    "SISSO and Circuit Supervisor must represent one office",
  );
  assertEqual(
    canonicalHeadteacherSupervisoryAssessorRole("Circuit Supervisor"),
    "SISSO",
    "Circuit Supervisor must canonicalize to SISSO",
  );
  assertEqual(
    HEADTEACHER_DIRECTOR_REVIEW_POLICY.reviewerRole,
    "DISTRICT_DIRECTOR",
    "Director must own the package-review authority",
  );
  assertEqual(
    HEADTEACHER_DIRECTOR_REVIEW_POLICY.requiredCapability,
    "REVIEW_HEADTEACHER_APPRAISAL",
    "Director review capability mismatch",
  );
  assert(
    HEADTEACHER_DIRECTOR_REVIEW_POLICY.separateEvidenceStreams,
    "Evidence streams must remain separate",
  );
  assert(
    !HEADTEACHER_DIRECTOR_REVIEW_POLICY.combinedWeightingDefined,
    "Combined weighting must remain undefined",
  );
  assert(
    !HEADTEACHER_DIRECTOR_REVIEW_POLICY.respondentIdentitiesAccessedAtStart,
    "Review start must not access respondent identities",
  );

  const created = createDatabase();
  const result = await startHeadteacherDirectorReview({
    ...baseInput(),
    database: created.db,
  });
  assertEqual(result.outcome, "STARTED", "Review must start");
  assertEqual(result.cycleStatus, "UNDER_REVIEW", "Cycle must enter review");
  assertEqual(result.reviewDecision, "PENDING", "Review starts pending");
  assertEqual(created.state.reviews.length, 1, "Exactly one review required");
  assertEqual(created.state.audits.length, 1, "Exactly one audit required");
  assertEqual(created.state.updates, 1, "Cycle must update once");
  assert(
    result.evidence.staffFeedback.ready &&
      result.evidence.supervisoryAssessment.ready,
    "Both evidence streams must be ready",
  );
  assert(
    !result.evidence.respondentIdentitiesAccessed &&
      !result.evidence.individualStaffResponsesAccessed,
    "Review start must not inspect confidential source responses",
  );
  const reviewMetadata = created.state.reviews[0].metadata;
  assertEqual(
    reviewMetadata.separateEvidenceStreams,
    true,
    "Review metadata must preserve separate evidence",
  );
  assertEqual(
    reviewMetadata.combinedWeightingDefined,
    false,
    "Review metadata must not invent weighting",
  );
  assert(
    !JSON.stringify(reviewMetadata).includes("respondentUserId"),
    "Review metadata must not contain respondent identities",
  );
  assert(
    !JSON.stringify(created.state.audits[0]).includes('"score":'),
    "Review-start audit must not contain score values",
  );
  assertEqual(
    created.state.transactionOptions[0].isolationLevel,
    "Serializable",
    "Transaction must be Serializable",
  );
  assertEqual(
    created.state.transactionOptions[0].maxWait,
    10000,
    "Transaction maxWait mismatch",
  );
  assertEqual(
    created.state.transactionOptions[0].timeout,
    20000,
    "Transaction timeout mismatch",
  );

  const retry = await startHeadteacherDirectorReview({
    ...baseInput(),
    database: created.db,
  });
  assertEqual(retry.outcome, "EXISTING_REVIEW", "Retry must be idempotent");
  assertEqual(created.state.reviews.length, 1, "Retry must not duplicate review");
  assertEqual(created.state.audits.length, 1, "Retry must not duplicate audit");

  await expectReject(
    () =>
      startHeadteacherDirectorReview({
        ...baseInput({ confirm: false }),
        database: createDatabase().db,
      }),
    "HEADTEACHER_DIRECTOR_REVIEW_CONFIRMATION_REQUIRED",
    "Review start must require explicit confirmation",
  );

  await expectReject(
    () =>
      startHeadteacherDirectorReview({
        ...baseInput({ actorRoleName: "SISSO" }),
        database: createDatabase().db,
      }),
    "HEADTEACHER_DIRECTOR_REVIEW_ROLE_FORBIDDEN",
    "SISSO cannot start Director package review",
  );

  await expectReject(
    () =>
      startHeadteacherDirectorReview({
        ...baseInput(),
        database: createDatabase({
          assignments: [makeAssignment({ zoneId: "district-other" })],
        }).db,
      }),
    "HEADTEACHER_DIRECTOR_REVIEW_ACTIVE_ASSIGNMENT_REQUIRED",
    "Director assignment must match the target district",
  );

  await expectReject(
    () =>
      startHeadteacherDirectorReview({
        ...baseInput(),
        database: createDatabase({ snapshots: [] }).db,
      }),
    "HEADTEACHER_DIRECTOR_REVIEW_STAFF_EVIDENCE_NOT_READY",
    "Review must not start without the staff aggregate snapshot",
  );

  await expectReject(
    () =>
      startHeadteacherDirectorReview({
        ...baseInput(),
        database: createDatabase({ assessments: [] }).db,
      }),
    "HEADTEACHER_DIRECTOR_REVIEW_SUPERVISORY_ASSESSMENT_REQUIRED",
    "Review must require a finalized supervisory assessment",
  );

  await expectReject(
    () =>
      startHeadteacherDirectorReview({
        ...baseInput(),
        database: createDatabase({
          assessments: [makeAssessment(), makeAssessment({ id: "assessment-002" })],
        }).db,
      }),
    "HEADTEACHER_DIRECTOR_REVIEW_SUPERVISORY_ASSESSMENT_AMBIGUOUS",
    "Multiple current finalized assessments must fail closed",
  );

  await expectReject(
    () =>
      startHeadteacherDirectorReview({
        ...baseInput(),
        database: createDatabase({
          assessments: [
            makeAssessment(),
            makeAssessment({
              id: "assessment-draft-002",
              status: "DRAFT",
              assessmentHash: null,
              finalizedAt: null,
              finalizedByUserId: null,
            }),
          ],
        }).db,
      }),
    "HEADTEACHER_DIRECTOR_REVIEW_SUPERVISORY_WORK_UNRESOLVED",
    "Unresolved supervisory drafts must block review",
  );

  await expectReject(
    () =>
      startHeadteacherDirectorReview({
        ...baseInput(),
        database: createDatabase({
          assessments: [makeAssessment({ assessmentHash: "e".repeat(64) })],
        }).db,
      }),
    "HEADTEACHER_DIRECTOR_REVIEW_SUPERVISORY_HASH_DRIFT",
    "Assessment evidence hash drift must fail closed",
  );

  const directHos = createDatabase({
    assessments: [makeHosAuthoredAssessment()],
  });
  const directHosResult = await startHeadteacherDirectorReview({
    ...baseInput(),
    database: directHos.db,
  });
  assertEqual(directHosResult.reviewStage, 1, "HOS-authored evidence enters Director Stage 1");
  assertEqual(
    directHos.state.reviews[0].metadata.admissionType,
    "HOS_AUTHORED",
    "HOS-authored admission must be explicit",
  );

  const sissoAssessment = makeAssessment();
  const hosForward = makeHosForwardedReview(sissoAssessment);
  const forwarded = createDatabase({
    cycle: makeHosForwardCycle(sissoAssessment, hosForward),
    assessments: [sissoAssessment],
    assignments: [makeAssignment(), makeHosAssignment()],
    reviews: [hosForward.review],
  });
  const forwardedResult = await startHeadteacherDirectorReview({
    ...baseInput(),
    database: forwarded.db,
  });
  assertEqual(forwardedResult.reviewStage, 2, "HOS-forwarded evidence enters Director Stage 2");
  assertEqual(forwarded.state.reviews.length, 2, "HOS Stage 1 must be preserved with Director Stage 2");
  assertEqual(forwarded.state.reviews[0].decision, "ACCEPTED", "HOS Stage 1 remains accepted");
  assertEqual(forwarded.state.reviews[1].decision, "PENDING", "Director Stage 2 starts pending");
  assertEqual(
    forwarded.state.reviews[1].metadata.admissionType,
    "HOS_FORWARDED",
    "Director Stage 2 must bind HOS-forward provenance",
  );
  assertEqual(
    forwarded.state.cycle.metadata.headteacherSupervisoryReview.directorReviewCreated,
    true,
    "Cycle must record Director admission",
  );
  const forwardedRetry = await startHeadteacherDirectorReview({
    ...baseInput(),
    database: forwarded.db,
  });
  assertEqual(forwardedRetry.outcome, "EXISTING_REVIEW", "Stage-2 retry must be idempotent");
  assertEqual(forwarded.state.reviews.length, 2, "Stage-2 retry must not duplicate review");

  const bscAssessment = withAssessorOrigin(makeAssessment(), {
    userId: "bsc-user-001",
    assignmentId: "bsc-assignment-001",
    role: "BASIC_SCHOOL_COORDINATOR",
    scopeLevel: "DISTRICT",
  });
  const bscForward = makeHosForwardedReview(bscAssessment);
  const bscFixture = createDatabase({
    cycle: makeHosForwardCycle(bscAssessment, bscForward),
    assessments: [bscAssessment],
    assignments: [makeAssignment(), makeHosAssignment()],
    reviews: [bscForward.review],
  });
  const bscResult = await startHeadteacherDirectorReview({
    ...baseInput(),
    database: bscFixture.db,
  });
  assertEqual(bscResult.reviewStage, 2, "BSC evidence must enter Director Stage 2 only after HOS forward");

  await expectReject(
    () =>
      startHeadteacherDirectorReview({
        ...baseInput(),
        database: createDatabase({
          cycle: makeHosForwardCycle(sissoAssessment, hosForward),
          assessments: [sissoAssessment],
          assignments: [
            makeAssignment(),
            makeHosAssignment({ status: "REVOKED" }),
          ],
          reviews: [hosForward.review],
        }).db,
      }),
    "HEADTEACHER_DIRECTOR_REVIEW_HOS_FORWARD_ASSIGNMENT_INVALID",
    "HOS-forward admission must revalidate the exact active HOS district assignment",
  );

  await expectReject(
    () =>
      startHeadteacherDirectorReview({
        ...baseInput(),
        database: createDatabase({ assessments: [makeAssessment()] }).db,
      }),
    "HEADTEACHER_DIRECTOR_REVIEW_HOS_FORWARD_REQUIRED",
    "SISSO/BSC evidence cannot bypass HOS Stage 1",
  );

  const directorAssessment = withAssessorOrigin(makeAssessment(), {
    userId: "director-user-001",
    assignmentId: "director-assignment-001",
    role: "DISTRICT_DIRECTOR",
    scopeLevel: "DISTRICT",
  });
  await expectReject(
    () =>
      startHeadteacherDirectorReview({
        ...baseInput(),
        database: createDatabase({ assessments: [directorAssessment] }).db,
      }),
    "HEADTEACHER_DIRECTOR_REVIEW_SELF_REVIEW_FORBIDDEN",
    "Director-authored assessment must never enter Director self-review",
  );
  assertEqual(
    HEADTEACHER_DIRECTOR_REVIEW_POLICY.directorAuthoredAssessmentSelfReviewAllowed,
    false,
    "Director self-review must be policy-forbidden",
  );

  const raced = createDatabase({ uniqueRace: true });
  const racedResult = await startHeadteacherDirectorReview({
    ...baseInput(),
    database: raced.db,
  });
  assertEqual(
    racedResult.outcome,
    "EXISTING_REVIEW",
    "Concurrent review creation must recover idempotently",
  );
  assertEqual(raced.state.reviews.length, 1, "Race recovery must preserve one review");
  assertEqual(raced.state.audits.length, 0, "Competing transaction owns the audit");

  const serviceSource = fs.readFileSync(
    path.join(
      repoRoot,
      "src/lib/appraisals/headteacherDirectorReview.ts",
    ),
    "utf8",
  );
  for (const forbidden of [
    "sendSms",
    "sendEmail",
    "appraisalIdentityAccess.create",
    "aggregateFinalizedAppraisalResponses",
  ]) {
    assert(
      !serviceSource.includes(forbidden),
      `Forbidden review-start marker found: ${forbidden}`,
    );
  }
  assert(
    serviceSource.includes(
      "readHeadteacherFeedbackAggregateReadiness",
    ),
    "E2C aggregate readiness must be reused",
  );
  assert(
    serviceSource.includes("calculateAppraisalScores"),
    "Supervisory calculations must be independently verified",
  );
  assert(
    serviceSource.includes(
      "Prisma.TransactionIsolationLevel.Serializable",
    ),
    "Serializable transaction contract missing",
  );

  console.log("");
  console.log("=== D3.4G1 DIRECTOR REVIEW AUTHORITY + EXPLICIT START ===");
  console.log("");
  console.log("Review authority                : District Director only");
  console.log("Active assignment               : exact district required");
  console.log("SISSO office                    : one office; Circuit Supervisor is legacy alias");
  console.log("Director admission boundaries    : HOS-authored Stage 1 / HOS-forwarded Stage 2");
  console.log("Staff-feedback evidence         : immutable snapshot V1 required");
  console.log("Supervisory evidence            : exactly one finalized current assessment");
  console.log("Assessment calculations/hash    : recomputed and verified");
  console.log("Unresolved/multiple assessments : fail closed");
  console.log("Review records                  : Stage 1 or Stage 2 / PENDING by origin");
  console.log("Cycle transition                : CLOSED -> UNDER_REVIEW or preserved UNDER_REVIEW");
  console.log("Explicit confirmation           : required");
  console.log("Same-evidence retry             : EXISTING_REVIEW");
  console.log("Concurrent create race          : idempotently recovered");
  console.log("Evidence streams                : separate");
  console.log("Combined weighting              : undefined");
  console.log("Reviewer score rewriting        : forbidden");
  console.log("Respondent identity access      : absent");
  console.log("Individual staff forms          : not selected");
  console.log("Director-authored assessment    : self-review forbidden");
  console.log("Transaction                     : serializable and bounded");
  console.log("Notifications/providers         : absent");
  console.log("Database accessed               : false");
  console.log("");
  console.log("RESULT: D3.4G1 DIRECTOR REVIEW START GREEN");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
