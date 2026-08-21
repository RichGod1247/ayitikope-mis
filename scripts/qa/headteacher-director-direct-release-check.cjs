#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS QA harness loads the current TypeScript release service with bounded dependency stubs. */

const fs = require("fs");
const path = require("path");
const Module = require("module");
const ts = require("typescript");

const repoRoot = path.resolve(__dirname, "..", "..");
const servicePath = path.join(
  repoRoot,
  "src/lib/appraisals/headteacherSupervisoryDirectorDirectRelease.ts",
);

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
function normalized(value) {
  return String(value ?? "").trim().toUpperCase().replace(/[\s-]+/g, "_");
}

const originalLoad = Module._load;
Module._load = function load(request, parent, isMain) {
  if (request === "@prisma/client") {
    return { Prisma: { TransactionIsolationLevel: { Serializable: "Serializable" } } };
  }
  if (request === "@/lib/prisma") {
    return { prisma: {} };
  }
  if (request === "@/lib/appraisals/authority") {
    return { assertAppraisalAuthority() {} };
  }
  if (request === "@/lib/appraisals/headteacherFeedback") {
    return {
      assertHeadteacherFeedbackTargetInGovernanceScope({ governanceScope, targetTenantId }) {
        if (governanceScope?.isSuperAdmin === true) return;
        const tenantIds = Array.isArray(governanceScope?.tenantIds)
          ? governanceScope.tenantIds
          : [];
        if (!tenantIds.includes(targetTenantId)) {
          throw new Error("QA_SCOPE_MISMATCH");
        }
      },
    };
  }
  if (request === "@/lib/appraisals/headteacherSupervisoryAssessment") {
    return {
      HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY: {
        workflow: "HEADTEACHER_GOVERNANCE_SUPERVISORY_ASSESSMENT",
        districtZoneLevel: 2,
        circuitZoneLevel: 1,
      },
      canonicalHeadteacherSupervisoryAssessorRole(value) {
        const role = normalized(value);
        return ["DISTRICT_DIRECTOR", "SISSO", "HEAD_OF_SUPERVISION", "BASIC_SCHOOL_COORDINATOR"].includes(role)
          ? role
          : null;
      },
    };
  }
  if (request === "@/lib/appraisals/headteacherSupervisoryAssessmentScoring") {
    return {
      async loadHeadteacherSupervisoryAssessment() {
        throw new Error("QA_DEFAULT_LOAD_ASSESSMENT_MUST_NOT_RUN");
      },
    };
  }
  if (request === "@/lib/roleRouting") {
    return { effectiveRole: normalized };
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
  HEADTEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_POLICY,
  HEADTEACHER_SUPERVISORY_RELEASES_METADATA_KEY,
  executeHeadteacherSupervisoryDirectorDirectRelease,
} = require(servicePath);

const NOW = new Date("2026-08-21T10:00:00.000Z");
const ASSESSMENT_HASH = "a".repeat(64);
const VISIT_HASH = "b".repeat(64);

function makeState(overrides = {}) {
  const cycle = {
    id: "cycle-headteacher-governance-001",
    scopeZoneId: "district-zone-001",
    targetUserId: "headteacher-user-001",
    targetTenantId: "tenant-001",
    targetZoneId: "circuit-zone-001",
    targetRoleSnapshot: "HEADTEACHER",
    status: "OPEN",
    openedAt: new Date("2026-08-21T09:30:00.000Z"),
    deadlineAt: null,
    closedAt: null,
    reviewStartedAt: null,
    releasedAt: null,
    cancelledAt: null,
    metadata: {
      workflow: "HEADTEACHER_GOVERNANCE_SUPERVISORY_ASSESSMENT",
      evidenceStream: "GOVERNANCE_SUPERVISORY_ASSESSMENT",
      carrierKind: "DIRECTOR_GOVERNANCE_ONLY",
      respondentWorkflow: false,
      participantSelection: "NONE",
      staffFeedbackRequired: false,
      staffFeedbackAccessed: false,
      separateFromStaffFeedback: true,
    },
    ...(overrides.cycle ?? {}),
  };

  const assessment = {
    id: "assessment-headteacher-governance-001",
    cycleId: cycle.id,
    assessorUserId: "director-user-001",
    assessorAssignmentId: "director-assignment-001",
    status: "FINALIZED",
    revision: 1,
    priorAssessmentId: null,
    assessmentHash: ASSESSMENT_HASH,
    finalizedByUserId: "director-user-001",
    finalizedAt: new Date("2026-08-21T09:55:00.000Z"),
    metadata: { visitContextHash: VISIT_HASH },
    evidenceSnapshotJson: {
      assessor: {
        userId: "director-user-001",
        assignmentId: "director-assignment-001",
        role: "DISTRICT_DIRECTOR",
        assignmentRole: "DISTRICT_DIRECTOR",
      },
      jurisdiction: {
        districtZoneId: cycle.scopeZoneId,
        circuitZoneId: cycle.targetZoneId,
      },
    },
    ...(overrides.assessment ?? {}),
  };

  return {
    cycle,
    membership: {
      id: "membership-headteacher-001",
      userId: cycle.targetUserId,
      tenantId: cycle.targetTenantId,
      status: "ACTIVE",
      role: { name: "HEADTEACHER" },
      tenant: {
        id: cycle.targetTenantId,
        status: "ACTIVE",
        zone: {
          id: cycle.targetZoneId,
          isActive: true,
          parentZoneId: cycle.scopeZoneId,
          zoneType: { level: 1 },
          parentZone: {
            id: cycle.scopeZoneId,
            isActive: true,
            zoneType: { level: 2 },
          },
        },
      },
      ...(overrides.membership ?? {}),
    },
    assessment,
    assignments: overrides.assignments ?? [
      {
        id: "director-assignment-001",
        userId: "director-user-001",
        role: "DISTRICT_DIRECTOR",
        status: "ACTIVE",
        revokedAt: null,
        startsAt: new Date("2026-01-01T00:00:00.000Z"),
        endsAt: null,
        zoneId: cycle.scopeZoneId,
        zone: {
          id: cycle.scopeZoneId,
          isActive: true,
          zoneType: { level: 2 },
        },
      },
    ],
    reviews: overrides.reviews ?? [],
    audits: [],
    transactionOptions: [],
    cycleWrites: [],
    forceWriteRace: Boolean(overrides.forceWriteRace),
  };
}

function verifiedAssessment(state, overrides = {}) {
  return {
    assessmentId: state.assessment.id,
    cycleId: state.assessment.cycleId,
    revision: state.assessment.revision,
    status: state.assessment.status,
    assessorUserId: state.assessment.assessorUserId,
    assessorAssignmentId: state.assessment.assessorAssignmentId,
    targetUserId: state.cycle.targetUserId,
    targetTenantId: state.cycle.targetTenantId,
    assessmentHash: state.assessment.assessmentHash,
    visitContextHash: VISIT_HASH,
    canEdit: false,
    canFinalize: false,
    commentsAllowed: false,
    separateFromStaffFeedback: true,
    combinedWeightingDefined: false,
    ...overrides,
  };
}

function dependencies(state, overrides = {}) {
  return {
    async loadAssessment() {
      return verifiedAssessment(state, overrides);
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
        if (state.forceWriteRace) return { count: 0 };
        const where = args.where ?? {};
        if (
          where.id !== state.cycle.id ||
          where.status !== state.cycle.status ||
          where.cancelledAt !== null ||
          state.cycle.cancelledAt !== null
        ) {
          return { count: 0 };
        }
        state.cycleWrites.push(clone(args.data));
        Object.assign(state.cycle, clone(args.data));
        return { count: 1 };
      },
    },
    appraisalAssessment: {
      async findUnique() {
        return clone(state.assessment);
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
      zoneIds: [state.cycle.scopeZoneId],
    },
    reqId: "request-r2f-001",
    ip: "127.0.0.1",
    userAgent: "N7-P2C3L-R2F-QA",
    now: NOW,
    database: makeDatabase(state),
    dependencies: dependencies(state),
    ...overrides,
  };
}

async function main() {
  const policy = HEADTEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_POLICY;
  assertEqual(policy.releaseMode, "DIRECTOR_AUTHORED_DIRECT_RELEASE", "Release mode drift");
  assertEqual(policy.requiredActorRole, "DISTRICT_DIRECTOR", "Director authority drift");
  assertEqual(policy.requiredAssessmentStatus, "FINALIZED", "Finalized assessment required");
  assertEqual(policy.requiredAssessmentRevision, 1, "Initial revision only");
  assertEqual(policy.staffFeedbackRequired, false, "Staff Feedback must not gate direct release");
  assertEqual(policy.staffFeedbackAccessed, false, "Staff Feedback must not be read");
  assertEqual(policy.carrierCycleStatusMutationAllowed, false, "Carrier status mutation forbidden");
  assertEqual(policy.carrierCycleTimestampMutationAllowed, false, "Carrier timestamps immutable");
  assertEqual(policy.notificationsSeeded, false, "Release service must not seed notifications");
  assertEqual(policy.providerCallsAllowed, false, "Provider calls forbidden");

  const state = makeState();
  const beforeStatus = state.cycle.status;
  const beforeReleasedAt = state.cycle.releasedAt;
  const beforeAssessment = JSON.stringify(state.assessment);

  const result = await executeHeadteacherSupervisoryDirectorDirectRelease(baseInput(state));

  assertEqual(result.outcome, "RELEASED", "Current direct release should succeed");
  assertEqual(result.governanceReleaseStatus, "RELEASED", "Governance release status");
  assertEqual(result.staffFeedbackRequired, false, "Result proves no Staff Feedback prerequisite");
  assertEqual(result.staffFeedbackAccessed, false, "Result proves no Staff Feedback read");
  assertEqual(result.carrierCycleStatusMutationPerformed, false, "Result proves no carrier status mutation");
  assertEqual(result.carrierCycleTimestampMutationPerformed, false, "Result proves no carrier timestamp mutation");
  assertEqual(result.notificationsSeeded, false, "Result proves no notification seeding");
  assertEqual(result.providerCalled, false, "Result proves no provider call");
  assert(/^[a-f0-9]{64}$/i.test(result.releaseProofHash), "Release proof must be SHA-256");

  assertEqual(state.cycle.status, beforeStatus, "Carrier cycle status must remain unchanged");
  assertEqual(state.cycle.releasedAt, beforeReleasedAt, "Carrier releasedAt must remain unchanged");
  assertEqual(JSON.stringify(state.assessment), beforeAssessment, "Assessment must remain immutable");
  assertEqual(state.cycleWrites.length, 1, "Exactly one carrier metadata write required");
  assertEqual(
    JSON.stringify(Object.keys(state.cycleWrites[0]).sort()),
    JSON.stringify(["metadata"]),
    "Release may write carrier metadata only",
  );

  const releaseMap = state.cycle.metadata[HEADTEACHER_SUPERVISORY_RELEASES_METADATA_KEY];
  const release = releaseMap?.[state.assessment.id];
  assert(release && typeof release === "object", "Assessment-keyed release proof must be persisted");
  assertEqual(release.staffFeedbackRequired, false, "Persisted proof excludes Staff prerequisite");
  assertEqual(release.staffFeedbackAccessed, false, "Persisted proof excludes Staff access");
  assertEqual(release.carrierCycleStatusMutationPerformed, false, "Persisted proof records immutable carrier status");
  assertEqual(release.carrierCycleTimestampMutationPerformed, false, "Persisted proof records immutable carrier timestamps");
  assertEqual(release.releaseProofHash, result.releaseProofHash, "Persisted proof hash must equal result");

  assertEqual(state.audits.length, 1, "Exactly one release audit required");
  assertEqual(state.audits[0].action, "HEADTEACHER_GOVERNANCE_ASSESSMENT_DIRECT_RELEASED", "Audit action drift");
  assertEqual(state.audits[0].metadata.staffFeedbackRequired, false, "Audit proves Staff independence");
  assertEqual(state.audits[0].metadata.respondentIdentitiesAccessed, false, "Audit proves respondent privacy");
  assertEqual(state.transactionOptions[0].isolationLevel, "Serializable", "Transaction must be SERIALIZABLE");
  assertEqual(state.transactionOptions[0].maxWait, 10000, "Transaction maxWait drift");
  assertEqual(state.transactionOptions[0].timeout, 30000, "Transaction timeout drift");

  const retry = await executeHeadteacherSupervisoryDirectorDirectRelease(baseInput(state));
  assertEqual(retry.outcome, "EXISTING_RELEASED", "Exact retry must be idempotent");
  assertEqual(retry.releaseProofHash, result.releaseProofHash, "Retry must preserve release proof hash");
  assertEqual(state.cycleWrites.length, 1, "Retry must not duplicate carrier metadata write");
  assertEqual(state.audits.length, 1, "Retry must not duplicate audit");

  const noConfirm = makeState();
  await expectReject(
    () => executeHeadteacherSupervisoryDirectorDirectRelease(baseInput(noConfirm, { confirm: false })),
    "HEADTEACHER_SUPERVISORY_GOVERNANCE_DIRECT_RELEASE_CONFIRMATION_REQUIRED",
    "Explicit confirmation is mandatory",
  );

  const wrongRole = makeState();
  await expectReject(
    () => executeHeadteacherSupervisoryDirectorDirectRelease(baseInput(wrongRole, { actorRoleName: "HEAD_OF_SUPERVISION" })),
    "HEADTEACHER_SUPERVISORY_GOVERNANCE_DIRECT_RELEASE_ROLE_FORBIDDEN",
    "HOS must not gain Director direct-release authority",
  );

  const wrongAssessor = makeState();
  await expectReject(
    () => executeHeadteacherSupervisoryDirectorDirectRelease(baseInput(wrongAssessor, {
      dependencies: dependencies(wrongAssessor, { assessorUserId: "hos-user-001" }),
    })),
    "HEADTEACHER_SUPERVISORY_GOVERNANCE_DIRECT_RELEASE_AUTHORITY_INVALID",
    "Director may release only the assessment they authored",
  );

  const reviewPresent = makeState({
    reviews: [{ id: "review-001", cycleId: "cycle-headteacher-governance-001", assessmentId: "assessment-headteacher-governance-001" }],
  });
  await expectReject(
    () => executeHeadteacherSupervisoryDirectorDirectRelease(baseInput(reviewPresent)),
    "HEADTEACHER_SUPERVISORY_GOVERNANCE_DIRECT_RELEASE_REVIEW_ROWS_PRESENT",
    "Any review row must block Director-authored direct release",
  );

  const assignmentDrift = makeState();
  assignmentDrift.assignments[0].id = "director-assignment-other";
  await expectReject(
    () => executeHeadteacherSupervisoryDirectorDirectRelease(baseInput(assignmentDrift)),
    "HEADTEACHER_SUPERVISORY_GOVERNANCE_DIRECT_RELEASE_ASSESSOR_ASSIGNMENT_DRIFT",
    "Releaser assignment must equal frozen assessor assignment",
  );

  const race = makeState({ forceWriteRace: true });
  await expectReject(
    () => executeHeadteacherSupervisoryDirectorDirectRelease(baseInput(race)),
    "HEADTEACHER_SUPERVISORY_GOVERNANCE_DIRECT_RELEASE_WRITE_RACE",
    "Concurrent carrier metadata write must fail closed",
  );

  const source = fs.readFileSync(servicePath, "utf8").replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (const marker of [
    'releaseMode: "DIRECTOR_AUTHORED_DIRECT_RELEASE"',
    'requiredActorRole: "DISTRICT_DIRECTOR"',
    'requiredAssessmentStatus: "FINALIZED"',
    'eligibleCarrierCycleStatuses: [',
    '"OPEN"',
    '"CLOSED"',
    '"UNDER_REVIEW"',
    '"RELEASED"',
    "staffFeedbackRequired: false",
    "staffFeedbackAccessed: false",
    "respondentIdentitiesAccessed: false",
    "individualStaffResponsesAccessed: false",
    "carrierCycleStatusMutationAllowed: false",
    "carrierCycleTimestampMutationAllowed: false",
    "participantMutationAllowed: false",
    "combinedWeightingDefined: false",
    "notificationsSeeded: false",
    "providerCallsAllowed: false",
    "HEADTEACHER_GOVERNANCE_ASSESSMENT_DIRECT_RELEASED",
    "HEADTEACHER_SUPERVISORY_RELEASES_METADATA_KEY",
    "computeHeadteacherSupervisoryDirectorDirectReleaseProofHashFromMetadata",
    "Prisma.TransactionIsolationLevel.Serializable",
  ]) {
    assert(source.includes(marker), "Current direct-release marker missing", marker);
  }

  for (const forbidden of [
    "readHeadteacherFeedbackAggregateReadiness",
    "HeadteacherFeedbackAggregateReadinessDatabase",
    "appraisalAggregateSnapshot",
    "headteacherFeedbackResponse",
    "staffFeedbackSnapshotId",
    "staffFeedbackSourceHash",
    "ensureHeadteacherDirectorReleaseNotifications",
    "headteacherDirectorReleaseNotifications",
    "appraisalReview.create",
    "appraisalReview.update",
    "appraisalAssessment.update",
    "appraisalAssessmentScore.update",
    "sendSms",
    "sendEmail",
    "appraisalIdentityAccess.create",
  ]) {
    assert(!source.includes(forbidden), "Legacy/coupled direct-release marker present", forbidden);
  }

  console.log("");
  console.log("=== N7-P2C3L-R2F CURRENT DIRECTOR-AUTHORED HEADTEACHER RELEASE ===");
  console.log("");
  console.log("Authority                       : exact District Director assessor/releaser");
  console.log("Assessment                      : finalized revision 1");
  console.log("Carrier statuses                : OPEN / CLOSED / UNDER_REVIEW / RELEASED");
  console.log("Staff Feedback prerequisite     : none");
  console.log("Staff Feedback reads            : none");
  console.log("AppraisalReview rows            : exactly zero");
  console.log("Director self-review            : absent");
  console.log("Carrier status mutation         : absent");
  console.log("Carrier timestamp mutation      : absent");
  console.log("Carrier write                   : assessment-keyed release metadata only");
  console.log("Assessment/score/visit mutation : absent");
  console.log("Respondent identities/forms     : absent");
  console.log("Combined weighting              : absent");
  console.log("Release proof                   : deterministic SHA-256 metadata proof");
  console.log("Same-evidence retry             : EXISTING_RELEASED");
  console.log("Notifications/providers         : absent");
  console.log("Transaction                     : SERIALIZABLE and bounded");
  console.log("Database accessed               : fake database only");
  console.log("");
  console.log("RESULT: N7-P2C3L-R2F CURRENT DIRECT RELEASE GREEN");
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
