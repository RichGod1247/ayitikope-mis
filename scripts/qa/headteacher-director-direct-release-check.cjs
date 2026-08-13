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
    return;
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
  HEADTEACHER_DIRECTOR_DIRECT_RELEASE_POLICY,
  executeHeadteacherDirectorDirectRelease,
} = require(
  path.join(repoRoot, "src/lib/appraisals/headteacherDirectorDirectRelease.ts"),
);

const NOW = new Date("2026-08-12T18:30:00.000Z");
const ASSESSMENT_HASH = "a".repeat(64);
const VISIT_HASH = "b".repeat(64);
const STAFF_HASH = "c".repeat(64);

function makeState(overrides = {}) {
  return {
    cycle: {
      id: "cycle-001",
      scopeZoneId: "district-zone-001",
      targetUserId: "headteacher-user-001",
      targetTenantId: "tenant-001",
      targetZoneId: "circuit-zone-001",
      targetRoleSnapshot: "HEADTEACHER",
      status: "CLOSED",
      minimumResponses: 1,
      reviewStartedAt: null,
      releasedAt: null,
      cancelledAt: null,
      metadata: {
        workflow: "HEADTEACHER_CONFIDENTIAL_STAFF_FEEDBACK",
      },
      ...(overrides.cycle ?? {}),
    },
    membership: {
      id: "membership-001",
      userId: "headteacher-user-001",
      tenantId: "tenant-001",
      status: "ACTIVE",
      role: { name: "HEADTEACHER" },
      tenant: {
        id: "tenant-001",
        status: "ACTIVE",
        zone: {
          id: "circuit-zone-001",
          isActive: true,
          parentZoneId: "district-zone-001",
          zoneType: { level: 1 },
          parentZone: {
            id: "district-zone-001",
            isActive: true,
            zoneType: { level: 2 },
          },
        },
      },
      ...(overrides.membership ?? {}),
    },
    assessment: {
      id: "assessment-001",
      cycleId: "cycle-001",
      assessorUserId: "director-user-001",
      assessorAssignmentId: "director-assignment-001",
      status: "FINALIZED",
      revision: 1,
      priorAssessmentId: null,
      assessmentHash: ASSESSMENT_HASH,
      finalizedByUserId: "director-user-001",
      finalizedAt: new Date("2026-08-12T18:00:00.000Z"),
      metadata: { visitContextHash: VISIT_HASH },
      evidenceSnapshotJson: {
        assessor: {
          userId: "director-user-001",
          assignmentId: "director-assignment-001",
          role: "DISTRICT_DIRECTOR",
          assignmentRole: "DISTRICT_DIRECTOR",
        },
        jurisdiction: {
          districtZoneId: "district-zone-001",
          circuitZoneId: "circuit-zone-001",
        },
      },
      ...(overrides.assessment ?? {}),
    },
    snapshot: {
      id: "snapshot-001",
      cycleId: "cycle-001",
      version: 1,
      finalizedResponses: 5,
      minimumResponses: 1,
      releaseEligible: true,
      sourceHash: STAFF_HASH,
      ...(overrides.snapshot ?? {}),
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
          zoneType: { level: 2 },
        },
      },
    ],
    reviews: overrides.reviews ?? [],
    audits: [],
    transactionOptions: [],
  };
}

function verifiedAssessment(state, overrides = {}) {
  return {
    assessmentId: state.assessment.id,
    cycleId: state.assessment.cycleId,
    revision: state.assessment.revision,
    status: "FINALIZED",
    assessorUserId: state.assessment.assessorUserId,
    assessorAssignmentId: state.assessment.assessorAssignmentId,
    targetUserId: state.cycle.targetUserId,
    targetTenantId: state.cycle.targetTenantId,
    instrumentCode: "HEADTEACHER_SUPERVISORY_ASSESSMENT_V1",
    instrumentVersion: 1,
    dateObserved: "2026-08-12",
    visitContextHash: VISIT_HASH,
    assessmentHash: ASSESSMENT_HASH,
    finalizedAt: state.assessment.finalizedAt.toISOString(),
    canEdit: false,
    canFinalize: false,
    commentsAllowed: false,
    separateFromStaffFeedback: true,
    combinedWeightingDefined: false,
    progress: {
      totalSections: 4,
      completedSections: 4,
      totalItems: 34,
      answeredItems: 34,
      notApplicableItems: 0,
      completionPercentage: 100,
      missingItemKeys: [],
      sections: [],
    },
    sectionPercentages: {},
    overallPercentage: 80,
    ...overrides,
  };
}

function readiness(state, overrides = {}) {
  return {
    audience: "DIRECTOR",
    state: "READY_FOR_REVIEW",
    cycleStatus: "CLOSED",
    cycleId: state.cycle.id,
    snapshotId: state.snapshot.id,
    snapshotVersion: 1,
    snapshotSourceHash: state.snapshot.sourceHash,
    eligibleResponses: 5,
    finalizedResponses: state.snapshot.finalizedResponses,
    expiredResponses: 0,
    revokedResponses: 0,
    minimumResponses: 1,
    aggregateScoresIncluded: false,
    respondentIdentitiesIncluded: false,
    participantListIncluded: false,
    ...overrides,
  };
}

function dependencies(state, options = {}) {
  return {
    async loadAssessment() {
      return verifiedAssessment(state, options.assessmentView ?? {});
    },
    async readAggregateReadiness() {
      return readiness(state, options.readiness ?? {});
    },
  };
}

function makeDatabase(state) {
  const tx = {
    appraisalCycle: {
      async findUnique() {
        return clone(state.cycle);
      },
      async updateMany(args) {
        const where = args.where ?? {};
        const sameValue = (left, right) => {
          if (left instanceof Date && right instanceof Date) {
            return left.getTime() === right.getTime();
          }
          return left === right;
        };
        if (
          state.cycle.id !== where.id ||
          state.cycle.status !== where.status ||
          (Object.prototype.hasOwnProperty.call(where, "reviewStartedAt") &&
            !sameValue(state.cycle.reviewStartedAt, where.reviewStartedAt)) ||
          (Object.prototype.hasOwnProperty.call(where, "releasedAt") &&
            !sameValue(state.cycle.releasedAt, where.releasedAt)) ||
          (Object.prototype.hasOwnProperty.call(where, "cancelledAt") &&
            !sameValue(state.cycle.cancelledAt, where.cancelledAt))
        ) {
          return { count: 0 };
        }
        Object.assign(state.cycle, clone(args.data));
        return { count: 1 };
      },
    },
    appraisalAssessment: {
      async findUnique() {
        return clone(state.assessment);
      },
    },
    appraisalAggregateSnapshot: {
      async findUnique() {
        return clone(state.snapshot);
      },
    },
    appraisalReview: {
      async findMany() {
        return clone(state.reviews);
      },
    },
    membership: {
      async findFirst() {
        return clone(state.membership);
      },
    },
    governanceOfficerAssignment: {
      async findMany() {
        return clone(state.assignments);
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
    ...tx,
    async $transaction(operation, options) {
      state.transactionOptions.push(clone(options ?? {}));
      return operation(tx);
    },
  };
}

function baseInput(state, overrides = {}) {
  return {
    actorUserId: "director-user-001",
    actorRoleName: "DISTRICT_DIRECTOR",
    assessmentId: state.assessment.id,
    confirm: true,
    governanceScope: {
      isSuperAdmin: false,
      tenantIds: [state.cycle.targetTenantId],
    },
    now: NOW,
    database: makeDatabase(state),
    dependencies: dependencies(state),
    reqId: "request-001",
    ...overrides,
  };
}

async function main() {
  assertEqual(
    HEADTEACHER_DIRECTOR_DIRECT_RELEASE_POLICY.releaseMode,
    "DIRECTOR_AUTHORED_DIRECT_RELEASE",
    "Direct release mode drift",
  );
  assertEqual(
    HEADTEACHER_DIRECTOR_DIRECT_RELEASE_POLICY.requiredInitialCycleStatus,
    "CLOSED",
    "Headteacher direct release must begin from sealed CLOSED evidence",
  );
  assertEqual(
    HEADTEACHER_DIRECTOR_DIRECT_RELEASE_POLICY.reviewRowsRequired,
    false,
    "Direct release must not require review rows",
  );
  assertEqual(
    HEADTEACHER_DIRECTOR_DIRECT_RELEASE_POLICY.selfReviewAllowed,
    false,
    "Director self-review must remain forbidden",
  );

  const state = makeState();
  const beforeAssessment = JSON.stringify(state.assessment);
  const result = await executeHeadteacherDirectorDirectRelease(baseInput(state));
  assertEqual(result.outcome, "RELEASED", "Direct release should succeed");
  assertEqual(result.cycleStatus, "RELEASED", "Cycle must be released");
  assertEqual(result.reviewRowsPresent, false, "No review row may be created");
  assertEqual(result.selfReviewPerformed, false, "No self-review may be performed");
  assertEqual(state.reviews.length, 0, "AppraisalReview table must remain untouched");
  assertEqual(JSON.stringify(state.assessment), beforeAssessment, "Assessment must remain immutable");
  assertEqual(state.audits.length, 1, "Exactly one direct-release audit is required");
  assertEqual(state.audits[0].action, "HEADTEACHER_APPRAISAL_DIRECTOR_AUTHORED_DIRECT_RELEASED", "Audit action drift");
  assertEqual(state.audits[0].metadata.reviewRowsPresent, false, "Audit must record zero review rows");
  assertEqual(state.audits[0].metadata.releaseNoteTextIncluded, false, "Audit must not contain release-note text");
  assertEqual(state.audits[0].metadata.respondentIdentitiesAccessed, false, "Audit must prove respondent privacy");
  assertEqual(state.audits[0].metadata.combinedWeightingDefined, false, "No combined score may be introduced");
  assertEqual(state.transactionOptions[0].isolationLevel, "Serializable", "Transaction must be SERIALIZABLE");

  const retry = await executeHeadteacherDirectorDirectRelease(baseInput(state));
  assertEqual(retry.outcome, "EXISTING_RELEASED", "Exact retry must be idempotent");
  assertEqual(retry.releaseProofHash, result.releaseProofHash, "Retry must preserve proof hash");
  assertEqual(state.audits.length, 1, "Retry must not duplicate audit");

  const noConfirm = makeState();
  await expectReject(
    () => executeHeadteacherDirectorDirectRelease(baseInput(noConfirm, { confirm: false })),
    "HEADTEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_CONFIRMATION_REQUIRED",
    "Explicit confirmation is mandatory",
  );

  const wrongRole = makeState();
  await expectReject(
    () => executeHeadteacherDirectorDirectRelease(baseInput(wrongRole, { actorRoleName: "HEAD_OF_SUPERVISION" })),
    "HEADTEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_ROLE_FORBIDDEN",
    "HOS must not gain direct-release authority",
  );

  const wrongAssessor = makeState();
  await expectReject(
    () => executeHeadteacherDirectorDirectRelease(baseInput(wrongAssessor, {
      dependencies: dependencies(wrongAssessor, {
        assessmentView: { assessorUserId: "hos-user-001" },
      }),
    })),
    "HEADTEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_AUTHORITY_INVALID",
    "Director may direct-release only Director-authored assessment",
  );

  const reviewPresent = makeState({
    reviews: [{ id: "review-001", cycleId: "cycle-001", assessmentId: "assessment-001" }],
  });
  await expectReject(
    () => executeHeadteacherDirectorDirectRelease(baseInput(reviewPresent)),
    "HEADTEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_REVIEW_ROWS_PRESENT",
    "Any review row must block direct release",
  );

  const assignmentDrift = makeState();
  assignmentDrift.assignments[0].id = "director-assignment-other";
  await expectReject(
    () => executeHeadteacherDirectorDirectRelease(baseInput(assignmentDrift)),
    "HEADTEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_ASSESSOR_ASSIGNMENT_DRIFT",
    "Releaser assignment must equal frozen assessor assignment",
  );

  const unready = makeState();
  await expectReject(
    () => executeHeadteacherDirectorDirectRelease(baseInput(unready, {
      dependencies: dependencies(unready, { readiness: { state: "NOT_READY" } }),
    })),
    "HEADTEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_STAFF_EVIDENCE_NOT_READY",
    "Direct release must require sealed staff aggregate evidence",
  );

  const sourcePath = path.join(
    repoRoot,
    "src/lib/appraisals/headteacherDirectorDirectRelease.ts",
  );
  const source = fs.readFileSync(sourcePath, "utf8");
  for (const marker of [
    'releaseMode: "DIRECTOR_AUTHORED_DIRECT_RELEASE"',
    'requiredInitialCycleStatus: "CLOSED"',
    'reviewRowsRequired: false',
    'selfReviewAllowed: false',
    'requiredCapability: "RELEASE_HEADTEACHER_FEEDBACK"',
    "readHeadteacherFeedbackAggregateReadiness",
    "loadHeadteacherSupervisoryAssessment",
    "canonicalHeadteacherSupervisoryAssessorRole",
    '"CLOSED", "UNDER_REVIEW"',
    '"UNDER_REVIEW", "RELEASED"',
    "Prisma.TransactionIsolationLevel.Serializable",
    "HEADTEACHER_APPRAISAL_DIRECTOR_AUTHORED_DIRECT_RELEASED",
    "assessmentMutationPerformed: false",
    "scoreMutationPerformed: false",
    "visitContextMutationPerformed: false",
    "respondentIdentitiesAccessed: false",
    "individualStaffResponsesAccessed: false",
    "combinedWeightingDefined: false",
    "notificationsSeeded: false",
    "providerCalled: false",
  ]) {
    assert(source.includes(marker), "Required B5C marker missing", marker);
  }
  for (const forbidden of [
    "appraisalReview.create",
    "appraisalReview.update",
    "appraisalAssessment.update",
    "appraisalAssessmentScore.update",
    "sendSms",
    "sendEmail",
    "appraisalIdentityAccess.create",
  ]) {
    assert(!source.includes(forbidden), "Forbidden B5C marker found", forbidden);
  }

  console.log("=== N6-F1C6B5C DIRECTOR-AUTHORED HEADTEACHER DIRECT RELEASE ===");
  console.log("");
  console.log("Authority                       : exact District Director assessor/releaser");
  console.log("Staff evidence                  : sealed aggregate required before release");
  console.log("Ingress                         : CLOSED -> UNDER_REVIEW -> RELEASED");
  console.log("AppraisalReview rows            : exactly zero");
  console.log("Director self-review            : absent");
  console.log("Assessment revision             : initial finalized revision only");
  console.log("Assessment/score/visit mutation : absent");
  console.log("Evidence streams                : separate; no combined score");
  console.log("Respondent identities/forms     : absent");
  console.log("Release note                    : absent on direct path");
  console.log("Release proof                   : deterministic SHA-256");
  console.log("Same-evidence retry             : EXISTING_RELEASED");
  console.log("Notifications                   : post-release seeding only");
  console.log("Transaction                     : SERIALIZABLE and bounded");
  console.log("Database accessed               : false");
  console.log("");
  console.log("RESULT: N6-F1C6B5C DIRECTOR-AUTHORED HEADTEACHER DIRECT RELEASE GREEN");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
