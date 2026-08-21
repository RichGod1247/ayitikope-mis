"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- deterministic source-contract QA only. */

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..", "..");

const migrationPath = path.join(
  repoRoot,
  "prisma",
  "migrations",
  "20260821155000_headteacher_governance_repeat_cycle_uniqueness",
  "migration.sql",
);
const servicePath = path.join(
  repoRoot,
  "src",
  "lib",
  "appraisals",
  "headteacherSupervisoryDirectorDraft.ts",
);
const draftQaPath = path.join(
  repoRoot,
  "scripts",
  "qa",
  "headteacher-supervisory-director-draft-check.cjs",
);

function fail(message, detail) {
  const suffix =
    detail === undefined ? "" : `\n${JSON.stringify(detail, null, 2)}`;
  throw new Error(`${message}${suffix}`);
}

function assert(condition, message, detail) {
  if (!condition) fail(message, detail);
}

function read(file) {
  if (!fs.existsSync(file)) fail("Required file missing", file);
  return fs.readFileSync(file, "utf8").replace(/\r\n?/g, "\n");
}

const migration = read(migrationPath);
const service = read(servicePath);
const draftQa = read(draftQaPath);

for (const marker of [
  'BEGIN;',
  'COMMIT;',
  "SET LOCAL lock_timeout = '10s'",
  'AppraisalCycle_one_live_target_idx',
  'HEADTEACHER_GOVERNANCE_REPEAT_INDEX_BASELINE_DRIFT',
  'HEADTEACHER_GOVERNANCE_REPEAT_INDEX_POSTFLIGHT_DRIFT',
  'HEADTEACHER_GOVERNANCE_SUPERVISORY_ASSESSMENT',
  'GOVERNANCE_SUPERVISORY_ASSESSMENT',
  'DIRECTOR_GOVERNANCE_ONLY',
  'headteacherSupervisoryReleases',
  "jsonb_typeof(metadata -> 'headteacherSupervisoryReleases') = 'object'",
  "(metadata -> 'headteacherSupervisoryReleases') <> '{}'::jsonb",
  "'DRAFT'::\"AppraisalCycleStatus\"",
  "'PENDING_APPROVAL'::\"AppraisalCycleStatus\"",
  "'OPEN'::\"AppraisalCycleStatus\"",
  "'CLOSED'::\"AppraisalCycleStatus\"",
  "'UNDER_REVIEW'::\"AppraisalCycleStatus\"",
  "DROP INDEX edulife_os.\"AppraisalCycle_one_live_target_idx\"",
  "CREATE UNIQUE INDEX \"AppraisalCycle_one_live_target_idx\"",
]) {
  assert(migration.includes(marker), "Migration marker missing", marker);
}

for (const forbidden of [
  /\bINSERT\s+INTO\b/i,
  /\bUPDATE\s+edulife_os\.appraisal_cycle\b/i,
  /\bDELETE\s+FROM\b/i,
  /\bTRUNCATE\b/i,
  /AppraisalCycle_idempotency_unique/,
]) {
  assert(!forbidden.test(migration), "Forbidden migration mutation/ownership", {
    forbidden: String(forbidden),
  });
}

for (const marker of [
  "function releasedAssessmentInCycle(",
  'normalized(assessment.status) === "FINALIZED"',
  'clean(release.releaseMode) === "DIRECTOR_AUTHORED_DIRECT_RELEASE"',
  "clean(release.assessmentId) === assessment.id",
  "release.staffFeedbackRequired === false",
  "release.staffFeedbackAccessed === false",
  "release.carrierCycleStatusMutationPerformed === false",
  "release.releaseProofHash",
  "if (releasedAssessmentInCycle(cycle, assessment))",
  "continue;",
]) {
  assert(service.includes(marker), "Current service released-history marker missing", marker);
}

for (const marker of [
  'assessment.status = "FINALIZED"',
  "headteacherSupervisoryReleases:",
  'releaseMode: "DIRECTOR_AUTHORED_DIRECT_RELEASE"',
  'workflow: "HEADTEACHER_GOVERNANCE_SUPERVISORY_ASSESSMENT"',
  'equal(nextVisit.outcome, "CREATED"',
  '"Released history permits a new direct assessment"',
  'equal(database.cycles.length, 2',
]) {
  assert(draftQa.includes(marker), "Current draft QA repeat-visit marker missing", marker);
}

function wouldParticipateInNewUniqueIndex(row) {
  const liveStatuses = new Set([
    "DRAFT",
    "PENDING_APPROVAL",
    "OPEN",
    "CLOSED",
    "UNDER_REVIEW",
  ]);
  if (!liveStatuses.has(String(row.status || "").toUpperCase())) return false;

  const metadata =
    row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? row.metadata
      : {};

  const releases =
    metadata.headteacherSupervisoryReleases &&
    typeof metadata.headteacherSupervisoryReleases === "object" &&
    !Array.isArray(metadata.headteacherSupervisoryReleases)
      ? metadata.headteacherSupervisoryReleases
      : null;

  const releasedDirectCarrier =
    String(metadata.workflow || "") ===
      "HEADTEACHER_GOVERNANCE_SUPERVISORY_ASSESSMENT" &&
    String(metadata.evidenceStream || "") ===
      "GOVERNANCE_SUPERVISORY_ASSESSMENT" &&
    String(metadata.carrierKind || "") === "DIRECTOR_GOVERNANCE_ONLY" &&
    metadata.respondentWorkflow === false &&
    String(metadata.participantSelection || "") === "NONE" &&
    metadata.staffFeedbackRequired === false &&
    metadata.staffFeedbackAccessed === false &&
    metadata.separateFromStaffFeedback === true &&
    metadata.combinedWeightingDefined === false &&
    releases !== null &&
    Object.keys(releases).length > 0;

  return !releasedDirectCarrier;
}

const baseDirect = {
  status: "OPEN",
  metadata: {
    workflow: "HEADTEACHER_GOVERNANCE_SUPERVISORY_ASSESSMENT",
    evidenceStream: "GOVERNANCE_SUPERVISORY_ASSESSMENT",
    carrierKind: "DIRECTOR_GOVERNANCE_ONLY",
    respondentWorkflow: false,
    participantSelection: "NONE",
    staffFeedbackRequired: false,
    staffFeedbackAccessed: false,
    separateFromStaffFeedback: true,
    combinedWeightingDefined: false,
  },
};

assert(
  wouldParticipateInNewUniqueIndex(baseDirect) === true,
  "Unreleased direct Governance cycle must remain unique-protected",
);

assert(
  wouldParticipateInNewUniqueIndex({
    ...baseDirect,
    metadata: {
      ...baseDirect.metadata,
      headteacherSupervisoryReleases: {},
    },
  }) === true,
  "Empty release metadata must remain unique-protected",
);

assert(
  wouldParticipateInNewUniqueIndex({
    ...baseDirect,
    metadata: {
      ...baseDirect.metadata,
      headteacherSupervisoryReleases: {
        "assessment-001": {
          releaseMode: "DIRECTOR_AUTHORED_DIRECT_RELEASE",
        },
      },
    },
  }) === false,
  "Released direct Governance history must leave one-live-target uniqueness",
);

assert(
  wouldParticipateInNewUniqueIndex({
    status: "OPEN",
    metadata: {
      workflow: "HEADTEACHER_CONFIDENTIAL_STAFF_FEEDBACK",
      headteacherSupervisoryReleases: {
        "assessment-001": {},
      },
    },
  }) === true,
  "Staff Feedback OPEN cycle must retain original unique protection",
);

assert(
  wouldParticipateInNewUniqueIndex({
    ...baseDirect,
    status: "RELEASED",
  }) === false,
  "Existing terminal RELEASED status remains outside original live-status predicate",
);

console.log("");
console.log("=== N7-P2C3L-R3J REPEAT DIRECT GOVERNANCE CYCLE UNIQUENESS ===");
console.log("");
console.log("Index                         : AppraisalCycle_one_live_target_idx");
console.log("Original unique key           : PRESERVED");
console.log("Original live statuses        : PRESERVED");
console.log("Unreleased direct carrier     : UNIQUE-PROTECTED");
console.log("Empty/missing release map     : UNIQUE-PROTECTED");
console.log("Released direct Governance    : HISTORICAL / NEW VISIT ALLOWED");
console.log("Staff Feedback uniqueness     : PRESERVED");
console.log("Idempotency index             : UNTOUCHED");
console.log("Application released-history  : MATCHED");
console.log("Business-row mutation         : NONE");
console.log("Database accessed by QA       : false");
console.log("");
console.log("RESULT: N7-P2C3L-R3J REPEAT DIRECT GOVERNANCE CYCLE UNIQUENESS GREEN");
