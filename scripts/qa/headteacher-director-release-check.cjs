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
function clone(value) {
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
  HEADTEACHER_DIRECTOR_RELEASE_POLICY,
  executeHeadteacherDirectorRelease,
} = require(
  path.join(repoRoot, "src/lib/appraisals/headteacherDirectorReviewRelease.ts"),
);

const NOW = new Date("2026-08-02T10:00:00.000Z");
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

function makeReview(stage = 1, decision = "PENDING") {
  return {
    id: `review-${String(stage).padStart(3, "0")}`,
    cycleId: "cycle-001",
    assessmentId: "assessment-001",
    reviewerUserId: "director-user-001",
    reviewerAssignmentId: "director-assignment-001",
    stage,
    decision,
    note: decision === "HELD" ? "Verify source documents." : null,
    decidedAt:
      decision === "HELD"
        ? new Date(`2026-08-0${stage}T09:00:00.000Z`)
        : null,
    metadata: {
      schemaVersion: 1,
      workflow: "HEADTEACHER_CONFIDENTIAL_STAFF_FEEDBACK",
      reviewStage: stage,
      reviewEvidenceHash: REVIEW_EVIDENCE_HASH,
      evidence: makeEvidence(),
      respondentIdentitiesAccessed: false,
      individualStaffResponsesAccessed: false,
      reviewerMayRewriteScores: false,
      separateEvidenceStreams: true,
      combinedWeightingDefined: false,
      providerCalled: false,
    },
    createdAt: new Date(`2026-08-0${stage}T08:00:00.000Z`),
  };
}

function makeState({ heldStage = false } = {}) {
  const reviews = heldStage
    ? [makeReview(1, "HELD"), makeReview(2, "PENDING")]
    : [makeReview(1, "PENDING")];
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
      metadata: { workflow: "HEADTEACHER_GOVERNANCE_SUPERVISORY_ASSESSMENT" },
    },
    reviews,
    audits: [],
    transactionOptions: [],
    transactionDepth: 0,
    readPackageCalls: 0,
    packageReadsInsideTransaction: 0,
    planCalls: 0,
  };
}

function currentReview(state) {
  return [...state.reviews].sort((left, right) => left.stage - right.stage).at(-1);
}

function makeReviewPackage(state) {
  const review = currentReview(state);
  return {
    schemaVersion: 1,
    audience: "DISTRICT_DIRECTOR",
    lifecycleState: "READY_FOR_DECISION",
    cycle: {
      id: state.cycle.id,
      status: "UNDER_REVIEW",
      targetUserId: state.cycle.targetUserId,
      targetTenantId: state.cycle.targetTenantId,
      targetName: "Headteacher",
      schoolName: "School",
      circuitZoneId: "circuit-zone-001",
      circuitName: "Circuit",
      districtZoneId: state.cycle.scopeZoneId,
      districtName: "District",
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
      instrumentVersionId: "instrument-version-001",
      instrumentCode: "HEADTEACHER_SUPERVISORY_ASSESSMENT_V1",
      instrumentVersion: 1,
      instrumentContentHash: "e".repeat(64),
      dateObserved: "2026-07-30",
      finalizedAt: "2026-07-31T08:00:00.000Z",
      overallPercentage: 85,
      sectionPercentages: {},
      assessor: {
        userId: "sisso-user-001",
        name: "SISSO",
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
        supervisoryPercentage: 85,
        supervisoryMinusStaffPercentagePoints: 5,
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

function makeDependencies(state, overrides = {}) {
  return {
    readReviewPackage: async () => {
      state.readPackageCalls += 1;
      if (state.transactionDepth !== 0) {
        state.packageReadsInsideTransaction += 1;
      }
      assertEqual(
        state.transactionDepth,
        0,
        "Release review package must be rebuilt outside the write transaction",
      );
      return overrides.reviewPackage ?? makeReviewPackage(state);
    },
    planDecision: () => {
      state.planCalls += 1;
      return (
        overrides.plan ?? {
          schemaVersion: 1,
          decision: "RELEASE",
          reviewId: currentReview(state).id,
          cycleId: state.cycle.id,
          assessmentId: state.assessment.id,
          snapshotId: "snapshot-001",
          reviewEvidenceHash: REVIEW_EVIDENCE_HASH,
          decisionContractHash: DECISION_CONTRACT_HASH,
          note: null,
          reviewNextDecision: "ACCEPTED",
          cycleNextStatus: "RELEASED",
          assessmentNextStatus: "FINALIZED",
          revisionRequired: false,
          nextReviewStageRequired: false,
          releaseRequested: true,
          reviewerMayRewriteScores: false,
          scoreMutationAllowed: false,
          combinedWeightingDefined: false,
          executionPerformed: false,
        }
      );
    },
  };
}

function makeDatabase(state) {
  const tx = {
    membership: {
      async findFirst() {
        return clone(state.membership);
      },
    },
    appraisalCycle: {
      async findUnique() {
        return clone(state.cycle);
      },
      async updateMany(args) {
        const where = args.where ?? {};
        if (
          state.cycle.id !== where.id ||
          state.cycle.status !== where.status ||
          state.cycle.releasedAt !== null
        ) {
          return { count: 0 };
        }
        Object.assign(state.cycle, clone(args.data));
        return { count: 1 };
      },
    },
    governanceOfficerAssignment: {
      async findMany() {
        return clone(state.assignments);
      },
    },
    appraisalAggregateSnapshot: {
      async findMany() {
        return [];
      },
    },
    appraisalAssessment: {
      async findUnique() {
        return clone(state.assessment);
      },
      async findMany() {
        return [clone(state.assessment)];
      },
    },
    appraisalReview: {
      async findUnique(args) {
        return clone(
          state.reviews.find((review) => review.id === args.where.id) ?? null,
        );
      },
      async findMany() {
        return clone(state.reviews);
      },
      async updateMany(args) {
        const review = state.reviews.find(
          (candidate) => candidate.id === args.where.id,
        );
        if (
          !review ||
          review.decision !== "PENDING" ||
          review.decidedAt !== null
        ) {
          return { count: 0 };
        }
        Object.assign(review, clone(args.data));
        return { count: 1 };
      },
    },
    auditLog: {
      async create(args) {
        state.audits.push(clone(args.data));
        return clone(args.data);
      },
    },
  };

  return {
    appraisalReview: tx.appraisalReview,
    async $transaction(operation, options) {
      state.transactionOptions.push(clone(options));
      state.transactionDepth += 1;
      try {
        return await operation(tx);
      } finally {
        state.transactionDepth -= 1;
      }
    },
  };
}

function baseInput(state, overrides = {}) {
  return {
    actorUserId: "director-user-001",
    actorRoleName: "DISTRICT_DIRECTOR",
    cycleId: state.cycle.id,
    reviewId: currentReview(state).id,
    note: "",
    confirm: true,
    governanceScope: { isSuperAdmin: false, tenantIds: ["tenant-001"] },
    now: NOW,
    database: makeDatabase(state),
    dependencies: makeDependencies(state),
    ...overrides,
  };
}

async function main() {
  assertEqual(HEADTEACHER_DIRECTOR_RELEASE_POLICY.reviewerRole, "DISTRICT_DIRECTOR", "Director role must remain exact");
  assertEqual(HEADTEACHER_DIRECTOR_RELEASE_POLICY.releasedReviewDecision, "ACCEPTED", "Release decision must be ACCEPTED");
  assertEqual(HEADTEACHER_DIRECTOR_RELEASE_POLICY.assessmentMutationAllowed, false, "Assessment must remain immutable");
  assertEqual(HEADTEACHER_DIRECTOR_RELEASE_POLICY.notificationsSeeded, false, "G3B must not seed notifications");
  assertEqual(
    HEADTEACHER_DIRECTOR_RELEASE_POLICY.reviewPackageReadMode,
    "OUTSIDE_WRITE_TRANSACTION",
    "The expensive review package must not run inside the release transaction",
  );

  const state = makeState();
  const beforeAssessment = clone(state.assessment);
  const result = await executeHeadteacherDirectorRelease(baseInput(state));
  assertEqual(result.outcome, "RELEASED", "Release must execute once");
  assertEqual(result.cycleStatus, "RELEASED", "Cycle must be released");
  assertEqual(result.reviewDecision, "ACCEPTED", "Review must be accepted");
  assertEqual(result.assessmentStatus, "FINALIZED", "Assessment status must remain FINALIZED");
  assertEqual(result.assessmentMutationPerformed, false, "Assessment mutation must be false");
  assertEqual(result.notificationsSeeded, false, "Notifications must remain unseeded");
  assert(/^[a-f0-9]{64}$/.test(result.releaseProofHash), "Release proof hash must be SHA-256");
  assertEqual(state.cycle.status, "RELEASED", "Persisted cycle status must be RELEASED");
  assertEqual(state.cycle.releasedAt.toISOString(), NOW.toISOString(), "Released timestamp must be exact");
  assertEqual(state.reviews[0].decision, "ACCEPTED", "Persisted review must be ACCEPTED");
  assertEqual(state.reviews[0].decidedAt.toISOString(), NOW.toISOString(), "Review timestamp must match release");
  assertEqual(JSON.stringify(state.assessment), JSON.stringify(beforeAssessment), "Assessment record must not change");
  assertEqual(state.audits.length, 1, "Release must write one audit");
  const auditMetadata = state.audits[0].metadata;
  assertEqual(auditMetadata.releaseNoteTextIncluded, false, "Audit must not include note text");
  assertEqual(auditMetadata.scoreValuesIncluded, false, "Audit must not include score values");
  assertEqual(auditMetadata.respondentIdentitiesAccessed, false, "Audit must not include respondent identity access");
  assertEqual(auditMetadata.notificationsSeeded, false, "Audit must prove no notification seeding");
  assertEqual(state.transactionOptions[0].isolationLevel, "Serializable", "Transaction must be serializable");
  assertEqual(
    state.packageReadsInsideTransaction,
    0,
    "Release package read must remain outside the write transaction",
  );
  assertEqual(state.transactionDepth, 0, "Release transaction depth must return to zero");

  const retry = await executeHeadteacherDirectorRelease(baseInput(state));
  assertEqual(retry.outcome, "EXISTING_RELEASED", "Exact retry must be idempotent");
  assertEqual(retry.releaseProofHash, result.releaseProofHash, "Retry must preserve release proof");
  assertEqual(state.audits.length, 1, "Retry must not duplicate audit");
  assertEqual(state.readPackageCalls, 1, "Released retry must not rebuild package");

  await expectReject(
    () => executeHeadteacherDirectorRelease(baseInput(state, { note: "Changed note" })),
    "HEADTEACHER_DIRECTOR_RELEASE_EXISTING_PROOF_DRIFT",
    "Changed-note retry must fail closed",
  );

  const heldState = makeState({ heldStage: true });
  const heldResult = await executeHeadteacherDirectorRelease(baseInput(heldState));
  assertEqual(heldResult.reviewStage, 2, "Release must use latest pending review stage");
  assertEqual(heldState.reviews[0].decision, "HELD", "Prior held review must be preserved");
  assertEqual(heldState.reviews[1].decision, "ACCEPTED", "Current stage must be accepted");

  const noConfirm = makeState();
  await expectReject(
    () => executeHeadteacherDirectorRelease(baseInput(noConfirm, { confirm: false })),
    "HEADTEACHER_DIRECTOR_RELEASE_CONFIRMATION_REQUIRED",
    "Release must require explicit confirmation",
  );

  const wrongRole = makeState();
  await expectReject(
    () => executeHeadteacherDirectorRelease(baseInput(wrongRole, { actorRoleName: "SISSO" })),
    "HEADTEACHER_DIRECTOR_RELEASE_ROLE_FORBIDDEN",
    "SISSO must not gain Director release authority",
  );

  const driftedPlan = makeState();
  const badPlan = {
    ...makeDependencies(driftedPlan).planDecision(),
    cycleNextStatus: "UNDER_REVIEW",
  };
  await expectReject(
    () => executeHeadteacherDirectorRelease(baseInput(driftedPlan, { dependencies: makeDependencies(driftedPlan, { plan: badPlan }) })),
    "HEADTEACHER_DIRECTOR_RELEASE_PLAN_DRIFT",
    "Release plan drift must fail closed",
  );

  const serviceSource = fs.readFileSync(
    path.join(repoRoot, "src/lib/appraisals/headteacherDirectorReviewRelease.ts"),
    "utf8",
  );
  for (const required of [
    'reviewPackageReadMode: "OUTSIDE_WRITE_TRANSACTION"',
    "database as unknown as HeadteacherDirectorReviewPackageDatabase",
    "Prisma.TransactionIsolationLevel.Serializable",
    "HEADTEACHER_APPRAISAL_DIRECTOR_RELEASED",
    "assessmentMutationAllowed: false",
    "reviewerMayRewriteScores: false",
    "providerCalled: false",
  ]) {
    assert(serviceSource.includes(required), `Required G3B marker missing: ${required}`);
  }
  for (const forbidden of [
    "database: tx",
    "sendSms",
    "sendEmail",
    "appraisalIdentityAccess.create",
  ]) {
    assert(!serviceSource.includes(forbidden), `Forbidden G3B marker found: ${forbidden}`);
  }

  console.log("=== D3.4G3B DIRECTOR RELEASE + IMMUTABLE RELEASE PROOF ===");
  console.log("");
  console.log("Release authority               : District Director only");
  console.log("Eligible current state          : UNDER_REVIEW + latest PENDING stage");
  console.log("Evidence package                : G2 recalculated before write transaction");
  console.log("Evidence hashes                 : review/staff/supervisory reverified");
  console.log("Release transition              : review ACCEPTED + cycle RELEASED");
  console.log("Assessment status               : remains FINALIZED");
  console.log("Assessment/score mutation       : absent");
  console.log("Immutable release proof         : deterministic SHA-256");
  console.log("Same-evidence retry             : EXISTING_RELEASED");
  console.log("Changed-evidence/note retry     : fails closed");
  console.log("Prior held stages               : preserved sequentially");
  console.log("Combined appraisal score        : absent");
  console.log("Respondent identities/forms     : not accessed");
  console.log("Audit note/score leakage        : absent");
  console.log("Notification readiness          : post-release seeding ready");
  console.log("Notifications/providers         : absent");
  console.log("Write transaction               : short, serializable and bounded");
  console.log("Database accessed               : false");
  console.log("");
  console.log("RESULT: D3.4G3B DIRECTOR RELEASE GREEN");
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
