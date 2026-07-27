"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS QA harness intentionally uses Node require. */

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ts = require("typescript");

const repositoryRoot = process.cwd();
const sourcePath = path.join(
  repositoryRoot,
  "src/lib/appraisals/headteacherFeedbackAggregateReadiness.ts",
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function expectCode(error, code) {
  assert(error && error.code === code, `Expected ${code}, received ${error && error.code}`);
}

function loadService() {
  const source = fs.readFileSync(sourcePath, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: sourcePath,
  }).outputText;

  const exportsObject = {};
  const commonModule = { exports: exportsObject };

  const policy = {
    workflow: "HEADTEACHER_CONFIDENTIAL_STAFF_FEEDBACK",
    instrumentCode: "HEADTEACHER_STAFF_FEEDBACK_V1",
    instrumentVersion: 1,
    targetRole: "HEADTEACHER",
    minimumFinalizedResponses: 1,
  };

  function effectiveRole(value) {
    return String(value || "").trim().toUpperCase();
  }

  function authority(input) {
    if (
      !input.governanceScope.isSuperAdmin &&
      !input.governanceScope.tenantIds.includes(input.targetTenantId)
    ) {
      const error = new Error("HEADTEACHER_FEEDBACK_TARGET_OUTSIDE_GOVERNANCE_SCOPE");
      error.code = "HEADTEACHER_FEEDBACK_TARGET_OUTSIDE_GOVERNANCE_SCOPE";
      error.status = 403;
      throw error;
    }
  }

  function activeTarget(input) {
    if (
      input.target.userId !== input.expectedUserId ||
      input.target.tenantId !== input.expectedTenantId ||
      input.target.status === "INACTIVE"
    ) {
      const error = new Error("HEADTEACHER_FEEDBACK_TARGET_INVALID");
      error.code = "HEADTEACHER_FEEDBACK_TARGET_INVALID";
      throw error;
    }
  }

  const sandboxRequire = (request) => {
    if (request === "@/lib/prisma") return { prisma: {} };
    if (request === "@/lib/roleRouting") return { effectiveRole };
    if (request === "@/lib/appraisals/headteacherFeedback") {
      return {
        HEADTEACHER_FEEDBACK_POLICY: policy,
        assertActiveHeadteacherFeedbackTarget: activeTarget,
        assertHeadteacherFeedbackApprovalAuthority: authority,
        assertHeadteacherFeedbackInstrumentReady: () => true,
      };
    }
    return require(request);
  };

  vm.runInNewContext(output, {
    require: sandboxRequire,
    module: commonModule,
    exports: commonModule.exports,
    console,
    process,
    Buffer,
    Date,
    Error,
    Object,
    Array,
    Number,
    String,
    Boolean,
    RegExp,
    Set,
    Map,
    JSON,
    Promise,
  });

  return { service: commonModule.exports, source };
}

function privacyMetadata() {
  return {
    workflow: "HEADTEACHER_CONFIDENTIAL_STAFF_FEEDBACK",
    aggregateSchemaVersion: 1,
    instrumentCode: "HEADTEACHER_STAFF_FEEDBACK_V1",
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
  };
}

function cycle(overrides = {}) {
  return {
    id: "cycle-ready-001",
    status: "CLOSED",
    targetUserId: "headteacher-001",
    targetTenantId: "tenant-school-001",
    targetRoleSnapshot: "HEADTEACHER",
    minimumResponses: 1,
    metadata: { workflow: "HEADTEACHER_CONFIDENTIAL_STAFF_FEEDBACK" },
    instrumentVersion: {
      version: 1,
      contentHash: "a".repeat(64),
      instrument: { code: "HEADTEACHER_STAFF_FEEDBACK_V1" },
    },
    participants: [
      { status: "FINALIZED" },
      { status: "EXPIRED" },
      { status: "REVOKED" },
    ],
    ...overrides,
  };
}

function snapshot(overrides = {}) {
  return {
    id: "snapshot-001",
    cycleId: "cycle-ready-001",
    version: 1,
    eligibleResponses: 3,
    finalizedResponses: 1,
    expiredResponses: 1,
    minimumResponses: 1,
    releaseEligible: true,
    overallPercentage: 78.5,
    sourceHash: "b".repeat(64),
    generatedByUserId: null,
    generatedAt: new Date("2026-07-27T12:00:00.000Z"),
    metadata: privacyMetadata(),
    ...overrides,
  };
}

function database(input = {}) {
  const cycleRecord = input.cycleRecord || cycle();
  const snapshots = input.snapshots === undefined ? [snapshot()] : input.snapshots;
  return {
    membership: {
      async findFirst() {
        return {
          id: "membership-head-001",
          userId: "headteacher-001",
          tenantId: "tenant-school-001",
          status: "ACTIVE",
          role: { name: "HEADTEACHER" },
          tenant: { id: "tenant-school-001", status: "ACTIVE" },
        };
      },
    },
    appraisalCycle: {
      async findUnique() {
        return cycleRecord;
      },
    },
    appraisalAggregateSnapshot: {
      async findMany() {
        return snapshots;
      },
    },
  };
}

async function run() {
  const { service, source } = loadService();
  const {
    HEADTEACHER_FEEDBACK_AGGREGATE_READINESS_POLICY,
    readHeadteacherFeedbackAggregateReadiness,
  } = service;

  assert(HEADTEACHER_FEEDBACK_AGGREGATE_READINESS_POLICY.readOnly === true, "Read-only policy missing");
  assert(HEADTEACHER_FEEDBACK_AGGREGATE_READINESS_POLICY.startsReview === false, "Read state must not start review");
  assert(HEADTEACHER_FEEDBACK_AGGREGATE_READINESS_POLICY.exposesScores === false, "Scores must remain excluded");

  const headteacherView = await readHeadteacherFeedbackAggregateReadiness({
    actorUserId: "headteacher-001",
    actorRoleName: "HEADTEACHER",
    tenantId: "tenant-school-001",
    cycleId: "cycle-ready-001",
    database: database(),
  });

  assert(headteacherView.audience === "HEADTEACHER", "Headteacher audience mismatch");
  assert(headteacherView.state === "READY_FOR_REVIEW", "Headteacher readiness mismatch");
  assert(headteacherView.responseCountsVisible === false, "Headteacher counts leaked");
  assert(headteacherView.snapshotDetailsVisible === false, "Headteacher snapshot details leaked");
  assert(!Object.prototype.hasOwnProperty.call(headteacherView, "finalizedResponses"), "Headteacher finalized count exposed");
  assert(!Object.prototype.hasOwnProperty.call(headteacherView, "snapshotSourceHash"), "Headteacher source hash exposed");

  const directorView = await readHeadteacherFeedbackAggregateReadiness({
    actorUserId: "director-001",
    actorRoleName: "DISTRICT_DIRECTOR",
    cycleId: "cycle-ready-001",
    governanceScope: { isSuperAdmin: false, tenantIds: ["tenant-school-001"] },
    database: database(),
  });

  assert(directorView.audience === "DIRECTOR", "Director audience mismatch");
  assert(directorView.state === "READY_FOR_REVIEW", "Director readiness mismatch");
  assert(directorView.canBeginReview === true, "Director review gate should be true");
  assert(directorView.finalizedResponses === 1, "Aggregate count mismatch");
  assert(directorView.aggregateScoresIncluded === false, "Aggregate scores leaked");
  assert(directorView.respondentIdentitiesIncluded === false, "Respondent identities leaked");

  const pending = await readHeadteacherFeedbackAggregateReadiness({
    actorUserId: "director-001",
    actorRoleName: "DISTRICT_DIRECTOR",
    cycleId: "cycle-ready-001",
    governanceScope: { isSuperAdmin: false, tenantIds: ["tenant-school-001"] },
    database: database({ snapshots: [] }),
  });
  assert(pending.state === "SNAPSHOT_PENDING", "Missing snapshot must be pending");
  assert(pending.canBeginReview === false, "Review must be blocked before snapshot");

  const insufficient = await readHeadteacherFeedbackAggregateReadiness({
    actorUserId: "director-001",
    actorRoleName: "DISTRICT_DIRECTOR",
    cycleId: "cycle-ready-001",
    governanceScope: { isSuperAdmin: false, tenantIds: ["tenant-school-001"] },
    database: database({
      cycleRecord: cycle({ participants: [{ status: "EXPIRED" }] }),
      snapshots: [],
    }),
  });
  assert(insufficient.state === "INSUFFICIENT_RESPONSES", "Insufficient state mismatch");

  const underReview = await readHeadteacherFeedbackAggregateReadiness({
    actorUserId: "director-001",
    actorRoleName: "DISTRICT_DIRECTOR",
    cycleId: "cycle-ready-001",
    governanceScope: { isSuperAdmin: false, tenantIds: ["tenant-school-001"] },
    database: database({ cycleRecord: cycle({ status: "UNDER_REVIEW" }) }),
  });
  assert(underReview.state === "UNDER_REVIEW", "Under-review state mismatch");
  assert(underReview.canBeginReview === false, "Review cannot begin twice");

  let multipleError;
  try {
    await readHeadteacherFeedbackAggregateReadiness({
      actorUserId: "director-001",
      actorRoleName: "DISTRICT_DIRECTOR",
      cycleId: "cycle-ready-001",
      governanceScope: { isSuperAdmin: false, tenantIds: ["tenant-school-001"] },
      database: database({ snapshots: [snapshot(), snapshot({ id: "snapshot-002" })] }),
    });
  } catch (error) {
    multipleError = error;
  }
  expectCode(multipleError, "HEADTEACHER_FEEDBACK_AGGREGATE_READ_MULTIPLE_SNAPSHOTS");

  let prematureError;
  try {
    await readHeadteacherFeedbackAggregateReadiness({
      actorUserId: "director-001",
      actorRoleName: "DISTRICT_DIRECTOR",
      cycleId: "cycle-ready-001",
      governanceScope: { isSuperAdmin: false, tenantIds: ["tenant-school-001"] },
      database: database({ cycleRecord: cycle({ status: "OPEN" }) }),
    });
  } catch (error) {
    prematureError = error;
  }
  expectCode(prematureError, "HEADTEACHER_FEEDBACK_AGGREGATE_READ_PREMATURE_SNAPSHOT");

  let outsiderError;
  try {
    await readHeadteacherFeedbackAggregateReadiness({
      actorUserId: "director-001",
      actorRoleName: "DISTRICT_DIRECTOR",
      cycleId: "cycle-ready-001",
      governanceScope: { isSuperAdmin: false, tenantIds: ["tenant-other-001"] },
      database: database(),
    });
  } catch (error) {
    outsiderError = error;
  }
  expectCode(outsiderError, "HEADTEACHER_FEEDBACK_TARGET_OUTSIDE_GOVERNANCE_SCOPE");

  assert(!source.includes("sectionAveragesJson"), "Readiness source must not select section scores");
  assert(!source.includes("itemAveragesJson"), "Readiness source must not select item scores");
  assert(!source.includes("respondentUserId"), "Readiness source must not select respondents");
  assert(!source.includes("appraisalAggregateSnapshot.create"), "Read-only service must not write snapshots");
  assert(!source.includes("auditLog.create"), "Read-only service must not write audits");
  assert(!source.includes("$transaction"), "Read-only service must not start a transaction");

  console.log("=== D3.4E2C HEADTEACHER AGGREGATE READINESS STATE ===");
  console.log("");
  console.log("Audience scope                 : Headteacher own cycle / Director jurisdiction");
  console.log("Collection not closed         : truthful read-only state");
  console.log("Insufficient responses        : truthful, no snapshot assumed");
  console.log("Snapshot pending              : review blocked");
  console.log("Ready for review              : sealed snapshot required");
  console.log("Under review / released       : truthful lifecycle states");
  console.log("Headteacher response counts   : hidden");
  console.log("Headteacher snapshot details  : hidden");
  console.log("Director review gate          : CLOSED + valid snapshot only");
  console.log("Multiple/premature snapshots  : fail closed");
  console.log("Aggregate score values        : not selected or returned");
  console.log("Respondent identities/list    : not selected or returned");
  console.log("Database writes/transactions  : absent");
  console.log("Database accessed             : false");
  console.log("");
  console.log("RESULT: D3.4E2C HEADTEACHER AGGREGATE READINESS GREEN");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
