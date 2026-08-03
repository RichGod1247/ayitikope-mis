#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS QA harness intentionally loads TypeScript through a local transpile hook. */

const fs = require("fs");
const path = require("path");
const Module = require("module");
const ts = require("typescript");

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
  HEADTEACHER_DIRECTOR_RETURN_HOLD_POLICY,
  executeHeadteacherDirectorReturnOrHold,
} = require(
  path.join(repoRoot, "src/lib/appraisals/headteacherDirectorReviewDecision.ts"),
);

const NOW = new Date("2026-08-01T10:00:00.000Z");
const REVIEW_EVIDENCE_HASH = "a".repeat(64);
const STAFF_SOURCE_HASH = "b".repeat(64);
const ASSESSMENT_HASH = "c".repeat(64);
const DECISION_CONTRACT_HASH = "d".repeat(64);

function makeEvidence() {
  return {
    staffFeedback: {
      ready: true,
      snapshotId: "snapshot-001",
      snapshotVersion: 1,
      sourceHash: STAFF_SOURCE_HASH,
      finalizedResponses: 5,
      minimumResponses: 1,
    },
    supervisoryAssessment: {
      ready: true,
      assessmentId: "assessment-001",
      revision: 1,
      assessmentHash: ASSESSMENT_HASH,
      assessorUserId: "sisso-user-001",
      assessorAssignmentId: "sisso-assignment-001",
      directorAuthored: false,
    },
    separateEvidenceStreams: true,
    combinedWeightingDefined: false,
    respondentIdentitiesAccessed: false,
    individualStaffResponsesAccessed: false,
    reviewerMayRewriteScores: false,
  };
}

function makeReview() {
  return {
    id: "review-001",
    cycleId: "cycle-001",
    assessmentId: "assessment-001",
    reviewerUserId: "director-user-001",
    reviewerAssignmentId: "director-assignment-001",
    stage: 1,
    decision: "PENDING",
    note: null,
    decidedAt: null,
    metadata: {
      schemaVersion: 1,
      workflow: "HEADTEACHER_CONFIDENTIAL_STAFF_FEEDBACK",
      reviewStage: 1,
      reviewEvidenceHash: REVIEW_EVIDENCE_HASH,
      evidence: makeEvidence(),
      respondentIdentitiesAccessed: false,
      individualStaffResponsesAccessed: false,
      reviewerMayRewriteScores: false,
      separateEvidenceStreams: true,
      combinedWeightingDefined: false,
      providerCalled: false,
    },
    createdAt: new Date("2026-07-31T10:00:00.000Z"),
  };
}

function makeState() {
  return {
    cycle: {
      id: "cycle-001",
      scopeZoneId: "district-zone-001",
      targetUserId: "headteacher-user-001",
      targetTenantId: "tenant-001",
      targetRoleSnapshot: "HEADTEACHER",
      status: "UNDER_REVIEW",
      reviewStartedAt: new Date("2026-07-31T10:00:00.000Z"),
      releasedAt: null,
      cancelledAt: null,
      metadata: { workflow: "HEADTEACHER_CONFIDENTIAL_STAFF_FEEDBACK" },
    },
    membership: {
      id: "membership-001",
      userId: "headteacher-user-001",
      tenantId: "tenant-001",
      status: "ACTIVE",
      role: { name: "HEADTEACHER" },
      tenant: { id: "tenant-001", status: "ACTIVE" },
    },
    assignments: [
      {
        id: "director-assignment-001",
        userId: "director-user-001",
        role: "DISTRICT_DIRECTOR",
        status: "ACTIVE",
        revokedAt: null,
        startsAt: new Date("2026-01-01T00:00:00.000Z"),
        endsAt: null,
        zoneId: "district-zone-001",
        zone: {
          id: "district-zone-001",
          isActive: true,
          zoneType: { level: 2, countryCode: "GH" },
        },
      },
    ],
    assessment: {
      id: "assessment-001",
      cycleId: "cycle-001",
      status: "FINALIZED",
      revision: 1,
      assessorUserId: "sisso-user-001",
      assessmentHash: ASSESSMENT_HASH,
      metadata: {
        workflow: "HEADTEACHER_GOVERNANCE_SUPERVISORY_ASSESSMENT",
      },
    },
    reviews: [makeReview()],
    audits: [],
    transactionOptions: [],
    transactionDepth: 0,
    readPackageCalls: 0,
    packageReadsInsideTransaction: 0,
    planCalls: 0,
  };
}

function makeReviewPackage(state) {
  const review = [...state.reviews]
    .sort((left, right) => left.stage - right.stage)
    .at(-1);
  return {
    schemaVersion: 1,
    audience: "DISTRICT_DIRECTOR",
    lifecycleState: "READY_FOR_DECISION",
    cycle: {
      id: state.cycle.id,
      status: "UNDER_REVIEW",
      targetUserId: state.cycle.targetUserId,
      targetTenantId: state.cycle.targetTenantId,
      targetName: "Ama Headteacher",
      schoolName: "Ayitikope M/A Basic School",
      circuitZoneId: "circuit-zone-001",
      circuitName: "Gefia Circuit",
      districtZoneId: state.cycle.scopeZoneId,
      districtName: "Akatsi South",
      reviewStartedAt: state.cycle.reviewStartedAt.toISOString(),
    },
    review: {
      id: review.id,
      stage: review.stage,
      decision: "PENDING",
      reviewerUserId: review.reviewerUserId,
      reviewerAssignmentId: review.reviewerAssignmentId,
      createdAt: review.createdAt.toISOString(),
      reviewEvidenceHash: REVIEW_EVIDENCE_HASH,
    },
    staffFeedback: {
      snapshotId: "snapshot-001",
      snapshotVersion: 1,
      sourceHash: STAFF_SOURCE_HASH,
      generatedAt: "2026-07-31T09:00:00.000Z",
      eligibleResponses: 6,
      finalizedResponses: 5,
      expiredResponses: 1,
      revokedResponses: 0,
      minimumResponses: 1,
      overallPercentage: 80,
      sections: [],
      items: [],
    },
    supervisoryAssessment: {
      assessmentId: state.assessment.id,
      revision: 1,
      status: "FINALIZED",
      assessmentHash: ASSESSMENT_HASH,
      instrumentVersionId: "supervisory-version-001",
      instrumentCode: "HEADTEACHER_SUPERVISORY_ASSESSMENT_V1",
      instrumentVersion: 1,
      instrumentContentHash: "e".repeat(64),
      dateObserved: "2026-07-30",
      finalizedAt: "2026-07-31T08:00:00.000Z",
      overallPercentage: 82,
      sectionPercentages: {},
      assessor: {
        userId: "sisso-user-001",
        name: "Sena SISSO",
        assignmentId: "sisso-assignment-001",
        office: "SISSO",
        scopeLevel: "CIRCUIT",
      },
      items: [],
    },
    comparison: {
      direction: "SUPERVISORY_MINUS_STAFF_PERCENTAGE_POINTS",
      thresholdsDefined: false,
      combinedOverallPercentage: null,
      overall: {
        staffAveragePercentage: 80,
        supervisoryPercentage: 82,
        supervisoryMinusStaffPercentagePoints: 2,
      },
      sections: [],
      items: [],
    },
    privacy: {
      respondentIdentitiesIncluded: false,
      individualStaffResponsesIncluded: false,
      participantListIncluded: false,
      responseHashesIncluded: false,
      reviewerContactDetailsIncluded: false,
      assessorContactDetailsIncluded: false,
    },
    integrity: {
      separateEvidenceStreams: true,
      combinedWeightingDefined: false,
      reviewerMayRewriteScores: false,
      scoreMutationAllowed: false,
      reviewEvidenceHash: REVIEW_EVIDENCE_HASH,
      staffSourceHash: STAFF_SOURCE_HASH,
      supervisoryAssessmentHash: ASSESSMENT_HASH,
    },
  };
}

function decisionPlan(reviewPackage, decision, note) {
  const isReturn = decision === "RETURN";
  return {
    schemaVersion: 1,
    decision,
    reviewId: reviewPackage.review.id,
    cycleId: reviewPackage.cycle.id,
    assessmentId: reviewPackage.supervisoryAssessment.assessmentId,
    snapshotId: reviewPackage.staffFeedback.snapshotId,
    reviewEvidenceHash: reviewPackage.review.reviewEvidenceHash,
    decisionContractHash: DECISION_CONTRACT_HASH,
    note,
    reviewNextDecision: isReturn ? "RETURNED" : "HELD",
    cycleNextStatus: "UNDER_REVIEW",
    assessmentNextStatus: isReturn ? "RETURNED" : "FINALIZED",
    revisionRequired: isReturn,
    nextReviewStageRequired: !isReturn,
    releaseRequested: false,
    reviewerMayRewriteScores: false,
    scoreMutationAllowed: false,
    combinedWeightingDefined: false,
    executionPerformed: false,
  };
}

function createDatabase(state) {
  const tx = {
    membership: {
      async findFirst() {
        return deepClone(state.membership);
      },
    },
    appraisalCycle: {
      async findUnique() {
        return deepClone(state.cycle);
      },
      async updateMany(args) {
        if (state.cycle.id !== args.where.id || state.cycle.status !== "UNDER_REVIEW") {
          return { count: 0 };
        }
        state.cycle.metadata = deepClone(args.data.metadata);
        return { count: 1 };
      },
    },
    governanceOfficerAssignment: {
      async findMany() {
        return deepClone(state.assignments);
      },
    },
    appraisalAggregateSnapshot: {
      async findMany() {
        return [];
      },
    },
    appraisalAssessment: {
      async findUnique(args) {
        if (args.where.id !== state.assessment.id) return null;
        return deepClone(state.assessment);
      },
      async findMany() {
        return [deepClone(state.assessment)];
      },
      async updateMany(args) {
        if (
          args.where.id !== state.assessment.id ||
          state.assessment.status !== args.where.status
        ) {
          return { count: 0 };
        }
        state.assessment.status = args.data.status;
        state.assessment.metadata = deepClone(args.data.metadata);
        return { count: 1 };
      },
    },
    appraisalReview: {
      async findUnique(args) {
        if (args.where.id) {
          const found = state.reviews.find((review) => review.id === args.where.id);
          return found ? deepClone(found) : null;
        }
        return null;
      },
      async findMany() {
        return deepClone(state.reviews);
      },
      async create(args) {
        const duplicate = state.reviews.some(
          (review) =>
            review.assessmentId === args.data.assessmentId &&
            review.stage === args.data.stage,
        );
        if (duplicate) {
          const error = new Error("P2002");
          error.code = "P2002";
          throw error;
        }
        const created = {
          id: `review-${String(args.data.stage).padStart(3, "0")}`,
          cycleId: args.data.cycleId,
          assessmentId: args.data.assessmentId,
          reviewerUserId: args.data.reviewerUserId,
          reviewerAssignmentId: args.data.reviewerAssignmentId,
          stage: args.data.stage,
          decision: args.data.decision,
          note: args.data.note,
          decidedAt: args.data.decidedAt,
          metadata: deepClone(args.data.metadata),
          createdAt: new Date(NOW.getTime() + 1_000),
        };
        state.reviews.push(created);
        return deepClone(created);
      },
      async updateMany(args) {
        const review = state.reviews.find((candidate) => candidate.id === args.where.id);
        if (!review || review.decision !== "PENDING" || review.decidedAt) {
          return { count: 0 };
        }
        review.decision = args.data.decision;
        review.note = args.data.note;
        review.decidedAt = args.data.decidedAt;
        review.metadata = deepClone(args.data.metadata);
        return { count: 1 };
      },
    },
    auditLog: {
      async create(args) {
        state.audits.push(deepClone(args.data));
        return { id: `audit-${state.audits.length}` };
      },
    },
  };
  return {
    appraisalReview: tx.appraisalReview,
    async $transaction(operation, options) {
      state.transactionOptions.push(deepClone(options));
      state.transactionDepth += 1;
      try {
        return await operation(tx);
      } finally {
        state.transactionDepth -= 1;
      }
    },
  };
}

function dependencies(state) {
  return {
    async readReviewPackage() {
      state.readPackageCalls += 1;
      if (state.transactionDepth !== 0) {
        state.packageReadsInsideTransaction += 1;
      }
      assertEqual(
        state.transactionDepth,
        0,
        "Review package must be rebuilt outside the write transaction",
      );
      return makeReviewPackage(state);
    },
    planDecision({ reviewPackage, decision, note, confirm }) {
      state.planCalls += 1;
      assertEqual(confirm, true, "Decision planner confirmation must remain true");
      return decisionPlan(reviewPackage, decision, note);
    },
  };
}

function input(state, overrides = {}) {
  return {
    actorUserId: "director-user-001",
    actorRoleName: "DISTRICT_DIRECTOR",
    cycleId: "cycle-001",
    reviewId: "review-001",
    decision: "RETURN",
    note: "Correct the supervisory evidence and resubmit it.",
    confirm: true,
    governanceScope: { isSuperAdmin: false, tenantIds: ["tenant-001"] },
    now: NOW,
    database: createDatabase(state),
    dependencies: dependencies(state),
    ...overrides,
  };
}

async function main() {
  assertEqual(
    HEADTEACHER_DIRECTOR_RETURN_HOLD_POLICY.releaseAllowed,
    false,
    "G3A must not release the appraisal",
  );
  assertEqual(
    HEADTEACHER_DIRECTOR_RETURN_HOLD_POLICY.holdCreatesExactlyOneNextStage,
    true,
    "A hold must create exactly one controlled continuation stage",
  );
  assertEqual(
    HEADTEACHER_DIRECTOR_RETURN_HOLD_POLICY.minimumReasonLength,
    3,
    "Return reasons must satisfy the revision contract",
  );
  assertEqual(
    HEADTEACHER_DIRECTOR_RETURN_HOLD_POLICY.reviewPackageReadMode,
    "OUTSIDE_WRITE_TRANSACTION",
    "The expensive review package must not run inside the write transaction",
  );

  const returnState = makeState();
  const returned = await executeHeadteacherDirectorReturnOrHold(input(returnState));
  assertEqual(returned.outcome, "RETURNED", "Return outcome mismatch");
  assertEqual(returnState.cycle.status, "UNDER_REVIEW", "Return keeps review open");
  assertEqual(returnState.assessment.status, "RETURNED", "Assessment must return");
  assertEqual(returnState.reviews[0].decision, "RETURNED", "Review must return");
  assertEqual(returnState.reviews.length, 1, "Return must not create a later stage");
  assertEqual(returnState.audits.length, 1, "Return must write one audit");
  assertEqual(
    returnState.audits[0].metadata.reasonTextIncluded,
    false,
    "Audit must not duplicate the return reason",
  );
  assertEqual(returned.releasePerformed, false, "Return must not release");
  assertEqual(returned.scoreMutationPerformed, false, "Return cannot rewrite scores");
  assertEqual(returnState.transactionOptions[0].isolationLevel, "Serializable", "Serializable transaction required");
  assertEqual(
    returnState.packageReadsInsideTransaction,
    0,
    "Return package read must remain outside the write transaction",
  );
  assertEqual(returnState.transactionDepth, 0, "Transaction depth must return to zero");

  const returnRetry = await executeHeadteacherDirectorReturnOrHold(input(returnState));
  assertEqual(returnRetry.outcome, "EXISTING_RETURNED", "Return retry mismatch");
  assertEqual(returnState.audits.length, 1, "Return retry cannot duplicate audit");
  assertEqual(returnState.readPackageCalls, 1, "Decided retry must not reopen package");

  const holdState = makeState();
  const held = await executeHeadteacherDirectorReturnOrHold(
    input(holdState, {
      decision: "HOLD",
      note: "Awaiting a documented clarification before the final decision.",
    }),
  );
  assertEqual(held.outcome, "HELD", "Hold outcome mismatch");
  assertEqual(holdState.assessment.status, "FINALIZED", "Hold preserves assessment");
  assertEqual(holdState.reviews[0].decision, "HELD", "Source review must be held");
  assertEqual(holdState.reviews.length, 2, "Hold creates one next stage");
  assertEqual(holdState.reviews[1].stage, 2, "Hold continuation stage mismatch");
  assertEqual(holdState.reviews[1].decision, "PENDING", "Next stage must be pending");
  assertEqual(holdState.reviews[1].metadata.continuedFromReviewId, "review-001", "Hold chain missing");
  assertEqual(holdState.audits.length, 1, "Hold must write one audit");
  assertEqual(
    holdState.packageReadsInsideTransaction,
    0,
    "Hold package read must remain outside the write transaction",
  );
  assertEqual(holdState.transactionDepth, 0, "Hold transaction depth must return to zero");

  const holdRetry = await executeHeadteacherDirectorReturnOrHold(
    input(holdState, {
      decision: "HOLD",
      note: "Awaiting a documented clarification before the final decision.",
    }),
  );
  assertEqual(holdRetry.outcome, "EXISTING_HELD", "Hold retry mismatch");
  assertEqual(holdState.reviews.length, 2, "Hold retry cannot create stage 3");
  assertEqual(holdState.audits.length, 1, "Hold retry cannot duplicate audit");

  await expectReject(
    () =>
      executeHeadteacherDirectorReturnOrHold(
        input(makeState(), { decision: "RELEASE" }),
      ),
    "HEADTEACHER_DIRECTOR_RETURN_HOLD_DECISION_FORBIDDEN",
    "G3A must reject release execution",
  );
  await expectReject(
    () =>
      executeHeadteacherDirectorReturnOrHold(
        input(makeState(), { decision: "RETURN", note: "x" }),
      ),
    "HEADTEACHER_DIRECTOR_RETURN_HOLD_REASON_REQUIRED",
    "Return requires a meaningful reason",
  );
  await expectReject(
    () =>
      executeHeadteacherDirectorReturnOrHold(
        input(makeState(), { confirm: false }),
      ),
    "HEADTEACHER_DIRECTOR_RETURN_HOLD_CONFIRMATION_REQUIRED",
    "Explicit confirmation is mandatory",
  );
  await expectReject(
    () =>
      executeHeadteacherDirectorReturnOrHold(
        input(makeState(), { actorRoleName: "SISSO" }),
      ),
    "HEADTEACHER_DIRECTOR_RETURN_HOLD_ROLE_FORBIDDEN",
    "SISSO cannot make the Director decision",
  );

  const serviceSource = fs.readFileSync(
    path.join(repoRoot, "src/lib/appraisals/headteacherDirectorReviewDecision.ts"),
    "utf8",
  );
  for (const required of [
    "executeHeadteacherDirectorReturnOrHold",
    "Prisma.TransactionIsolationLevel.Serializable",
    "HEADTEACHER_APPRAISAL_DIRECTOR_RETURNED",
    "HEADTEACHER_APPRAISAL_DIRECTOR_HELD",
    "holdCreatesExactlyOneNextStage: true",
    "releaseAllowed: false",
    "reviewerMayRewriteScores: false",
    "respondentIdentitiesAccessed: false",
    "providerCalled: false",
    'reviewPackageReadMode: "OUTSIDE_WRITE_TRANSACTION"',
    "database as unknown as HeadteacherDirectorReviewPackageDatabase",
  ]) {
    assert(serviceSource.includes(required), `Required G3A marker missing: ${required}`);
  }
  for (const forbidden of [
    "sendSms",
    "sendEmail",
    "appraisalIdentityAccess.create",
    'status: "RELEASED"',
    'decision: "ACCEPTED"',
    "database: tx",
  ]) {
    assert(!serviceSource.includes(forbidden), `Forbidden G3A marker found: ${forbidden}`);
  }

  const packageSource = fs.readFileSync(
    path.join(repoRoot, "src/lib/appraisals/headteacherDirectorReviewPackage.ts"),
    "utf8",
  );
  assert(
    packageSource.includes('currentReviewStageMode: "LATEST_PENDING"'),
    "G2 package must follow the latest pending stage",
  );
  assert(
    packageSource.includes("resolveCurrentPendingReview"),
    "G2 package must validate the review-stage chain",
  );
  assert(
    packageSource.includes("minimumReasonLength: 3"),
    "G2 return reasons must align with F4 revision requirements",
  );

  console.log("");
  console.log("=== D3.4G3A DIRECTOR RETURN/HOLD + CONTROLLED REVIEW CONTINUATION ===");
  console.log("");
  console.log("Decision authority              : District Director only");
  console.log("Eligible current state          : UNDER_REVIEW + latest PENDING stage");
  console.log("Evidence package                : G2 recalculated before write transaction");
  console.log("Return reason                   : required, 3-2000 characters");
  console.log("Return transition               : review RETURNED + assessment RETURNED");
  console.log("Return revision requirement     : true");
  console.log("Hold reason                     : required, 3-2000 characters");
  console.log("Hold transition                 : review HELD; assessment remains FINALIZED");
  console.log("Hold continuation               : exactly one next sequential PENDING stage");
  console.log("Latest-stage review package     : enabled");
  console.log("Same-decision retry             : idempotent");
  console.log("Release execution               : forbidden");
  console.log("Reviewer score rewriting        : forbidden");
  console.log("Respondent identities/forms     : not accessed");
  console.log("Audit reason/score leakage      : absent");
  console.log("Write transaction               : short, serializable and bounded");
  console.log("Notifications/providers         : absent");
  console.log("Database accessed               : false");
  console.log("");
  console.log("RESULT: D3.4G3A DIRECTOR RETURN/HOLD GREEN");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
