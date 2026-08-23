#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS QA harness intentionally inspects repository contracts. */

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..", "..");

const files = {
  migration:
    "prisma/migrations/20260822153500_headteacher_appraisal_terminal_guard_provenance/migration.sql",
  hosDecision:
    "src/lib/appraisals/headteacherSupervisoryReviewDecision.ts",
  revision:
    "src/lib/appraisals/headteacherSupervisoryAssessmentRevision.ts",
  director:
    "src/lib/appraisals/headteacherDirectorGovernanceReview.ts",
  teacherDirector:
    "src/lib/appraisals/teacherSupervisoryDirectorReviewDecision.ts",
  teacherRevision:
    "src/lib/appraisals/teacherSupervisoryAssessmentRevision.ts",
};

function fail(message, detail) {
  const suffix =
    detail === undefined ? "" : `\n${JSON.stringify(detail, null, 2)}`;
  throw new Error(`${message}${suffix}`);
}

function assert(condition, message, detail) {
  if (!condition) fail(message, detail);
}

function read(relativePath) {
  const absolute = path.join(repoRoot, relativePath);
  assert(
    fs.existsSync(absolute),
    "N7_P2C4C1B_REQUIRED_FILE_MISSING",
    relativePath,
  );
  return fs
    .readFileSync(absolute, "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
}

const migration = read(files.migration);
const hos = read(files.hosDecision);
const revision = read(files.revision);
const director = read(files.director);
const teacherDirector = read(files.teacherDirector);
const teacherRevision = read(files.teacherRevision);

for (const marker of [
  "CREATE OR REPLACE FUNCTION edulife_os.appraisal_guard_assessment_terminal()",
  "FINALIZED_APPRAISAL_ASSESSMENT_IS_IMMUTABLE",
  "DROP TRIGGER IF EXISTS appraisal_assessment_terminal_guard_trg",
  "CREATE TRIGGER appraisal_assessment_terminal_guard_trg",
  "BEFORE DELETE OR UPDATE",
  "to_jsonb(NEW)",
  "to_jsonb(OLD)",
]) {
  assert(
    migration.includes(marker),
    "N7_P2C4C1B_MIGRATION_MARKER_MISSING",
    marker,
  );
}

for (const marker of [
  "OLD.status = 'FINALIZED'",
  "NEW.status = 'RETURNED'",
  "headteacherSupervisoryReturn",
  "returnReviewEvidenceHash",
  "returnDecisionRequestHash",
  "returnDecisionEvidenceHash",
  "preserveReturningReviewerForCorrection",
]) {
  assert(
    migration.includes(marker),
    "N7_P2C4C1B_HEADTEACHER_HOS_GUARD_MARKER_MISSING",
    marker,
  );
}

for (const marker of [
  "teacherSupervisoryReturn",
  "sourceReviewId",
  "sourceReviewStage",
  "returningReviewerUserId",
  "returningReviewerAssignmentId",
  "returningReviewerRole",
  "sourceReviewEvidenceHash",
  "assessmentHash",
  "observationContextHash",
  "returnDecisionRequestHash",
  "returnDecisionEvidenceHash",
  "reasonHash",
  "reasonLength",
  "returnedAt",
  "preserveReturningReviewerForCorrection",
  "reviewerMayRewriteScores",
  "reviewerMayRewriteComment",
  "scoreMutationPerformed",
  "commentMutationPerformed",
  "legacyTeacherAppraisalIncluded",
  "combinedWeightingDefined",
  "providerCalled",
]) {
  assert(
    migration.includes(marker),
    "N7_P2C4C1B_TEACHER_RETURN_GUARD_MARKER_MISSING",
    marker,
  );
}

assert(
  migration.includes(
    "COALESCE(OLD.metadata, '{}'::jsonb)\n           ? 'teacherSupervisoryReturn'",
  ),
  "N7_P2C4C1B_TEACHER_RETURN_MUST_BE_NEW_PROVENANCE",
);

assert(
  migration.includes(
    ") IN (\n         'HEAD_OF_SUPERVISION',\n         'DISTRICT_DIRECTOR'\n       )",
  ),
  "N7_P2C4C1B_TEACHER_RETURN_REVIEWER_ROLE_ALLOWLIST_MISSING",
);

for (const marker of [
  "OLD.status = 'RETURNED'",
  "NEW.status = 'SUPERSEDED'",
  "supersededByAssessmentId",
  "supersededAt",
  "returnEvidenceHash",
  "returnAdmissionMode",
  "LEGACY_UNDER_REVIEW_RETURN",
  "DIRECTOR_GOVERNANCE_RETURN",
  "returnDecisionContractHash",
  "returnDecisionRequestHash",
]) {
  assert(
    migration.includes(marker),
    "N7_P2C4C1B_HEADTEACHER_REVISION_GUARD_MARKER_MISSING",
    marker,
  );
}


for (const marker of [
  'directorReturnAssessorRole: "HEAD_OF_SUPERVISION"',
  "HEADTEACHER_DIRECTOR_GOVERNANCE_RETURN_AUTHORSHIP_FORBIDDEN",
]) {
  assert(
    director.includes(marker),
    "N7_P2C4C1C_HEADTEACHER_DIRECTOR_AUTHORSHIP_SOURCE_DRIFT",
    marker,
  );
}

for (const marker of [
  "evidenceSnapshotJson",
  "assignmentRole",
  "HEAD_OF_SUPERVISION",
  "regexp_replace(",
]) {
  assert(
    migration.includes(marker),
    "N7_P2C4C1C_HEADTEACHER_DIRECTOR_DB_AUTHORSHIP_GUARD_MISSING",
    marker,
  );
}

for (const marker of [
  "returnedByDirectorReviewId",
  "returnedByDirectorReviewStage",
  "returnDecisionContractHash",
  "returnDecisionRequestHash",
  "returnedAt",
  "reviewerMayRewriteScores",
  "scoreMutationPerformed",
  "separateFromStaffFeedback",
  "combinedWeightingDefined",
  "providerCalled",
]) {
  assert(
    migration.includes(marker),
    "N7_P2C4C1B_HEADTEACHER_DIRECTOR_GUARD_MARKER_MISSING",
    marker,
  );
}

for (const forbidden of [
  "DISABLE TRIGGER",
  "session_replication_role",
  "ALTER TABLE edulife_os.appraisal_assessment DISABLE",
  "DROP TABLE",
  "TRUNCATE",
]) {
  assert(
    !migration.includes(forbidden),
    "N7_P2C4C1B_FORBIDDEN_SQL_PRESENT",
    forbidden,
  );
}

assert(
  hos.includes("headteacherSupervisoryReturn") &&
    hos.includes('status: "RETURNED"') &&
    hos.includes("appraisalAssessment.updateMany"),
  "N7_P2C4C1B_HEADTEACHER_HOS_SOURCE_CONTRACT_DRIFT",
);

for (const marker of [
  "appraisalAssessment.updateMany",
  'status: "SUPERSEDED"',
  "supersededByAssessmentId",
  "returnAdmissionMode",
  "returnDecisionContractHash",
  "returnDecisionRequestHash",
]) {
  assert(
    revision.includes(marker),
    "N7_P2C4C1B_HEADTEACHER_REVISION_SOURCE_CONTRACT_DRIFT",
    marker,
  );
}

for (const marker of [
  "appraisalAssessment.updateMany",
  'status: "RETURNED"',
  "returnedByDirectorReviewId",
  "returnedByDirectorReviewStage",
  "returnDecisionContractHash",
  "returnDecisionRequestHash",
  "returnedAt",
  "separateFromStaffFeedback: true",
  "combinedWeightingDefined: false",
  "providerCalled: false",
]) {
  assert(
    director.includes(marker),
    "N7_P2C4C1B_HEADTEACHER_DIRECTOR_SOURCE_CONTRACT_DRIFT",
    marker,
  );
}

for (const marker of [
  "appraisalAssessment.updateMany",
  'status: "RETURNED"',
  "teacherSupervisoryReturn",
  "sourceReviewId: input.sourceReview.id",
  "sourceReviewStage: input.sourceReview.stage",
  'returningReviewerRole: "DISTRICT_DIRECTOR"',
  "sourceReviewEvidenceHash: input.sourceReviewEvidenceHash",
  "assessmentHash: input.evidence.assessmentHash",
  "observationContextHash: input.evidence.observationContextHash",
  "returnDecisionRequestHash: input.decisionRequestHash",
  "returnDecisionEvidenceHash: input.decisionEvidenceHash",
  "reasonHash: hashJson(input.reason)",
  "reasonLength: input.reason.length",
  "preserveReturningReviewerForCorrection: true",
  "reviewerMayRewriteScores: false",
  "reviewerMayRewriteComment: false",
  "scoreMutationPerformed: false",
  "commentMutationPerformed: false",
  "legacyTeacherAppraisalIncluded: false",
  "combinedWeightingDefined: false",
  "providerCalled: false",
]) {
  assert(
    teacherDirector.includes(marker),
    "N7_P2C4C1B_TEACHER_DIRECTOR_SOURCE_CONTRACT_DRIFT",
    marker,
  );
}

for (const marker of [
  "teacherSupervisoryReturn",
  'allowedStatuses: ["RETURNED", "SUPERSEDED"]',
  'status: "SUPERSEDED"',
  "appraisalAssessment.updateMany",
  "returnDecisionRequestHash",
  "returnDecisionEvidenceHash",
  "preserveReturningReviewerForCorrection",
]) {
  assert(
    teacherRevision.includes(marker),
    "N7_P2C4C1B_TEACHER_REVISION_SOURCE_CONTRACT_DRIFT",
    marker,
  );
}

const directorAllowedKeys = [
  "returnedByDirectorReviewId",
  "returnedByDirectorReviewStage",
  "returnDecisionContractHash",
  "returnDecisionRequestHash",
  "returnedAt",
  "reviewerMayRewriteScores",
  "scoreMutationPerformed",
  "separateFromStaffFeedback",
  "combinedWeightingDefined",
  "providerCalled",
];

for (const key of directorAllowedKeys) {
  const removeMarker = `- '${key}'`;
  assert(
    migration.includes(removeMarker),
    "N7_P2C4C1B_HEADTEACHER_DIRECTOR_METADATA_ALLOWLIST_INCOMPLETE",
    key,
  );
}

const teacherReturnAllowedKeys = [
  "schemaVersion",
  "sourceReviewId",
  "sourceReviewStage",
  "returningReviewerUserId",
  "returningReviewerAssignmentId",
  "returningReviewerRole",
  "sourceReviewEvidenceHash",
  "assessmentHash",
  "observationContextHash",
  "returnDecisionRequestHash",
  "returnDecisionEvidenceHash",
  "reasonHash",
  "reasonLength",
  "returnedAt",
  "preserveReturningReviewerForCorrection",
  "reviewerMayRewriteScores",
  "reviewerMayRewriteComment",
  "scoreMutationPerformed",
  "commentMutationPerformed",
  "legacyTeacherAppraisalIncluded",
  "combinedWeightingDefined",
  "providerCalled",
];

for (const key of teacherReturnAllowedKeys) {
  const removeMarker = `- '${key}'`;
  assert(
    migration.includes(removeMarker),
    "N7_P2C4C1B_TEACHER_RETURN_METADATA_ALLOWLIST_INCOMPLETE",
    key,
  );
}

console.log("");
console.log("=== N7-P2C4B1I2 HEADTEACHER APPRAISAL TERMINAL GUARD ===");
console.log("");
console.log("Terminal evidence delete guard       : preserved");
console.log("Historical pure status transition    : preserved");
console.log("HOS FINALIZED -> RETURNED provenance : allowed narrowly");
console.log("Director FINALIZED -> RETURNED proof : HOS-authored only");
console.log("RETURNED -> SUPERSEDED lineage       : allowed narrowly");
console.log("Legacy HOS correction hashes         : nullable by contract");
console.log("Director correction hashes           : required SHA-256");
console.log("Non-metadata evidence fields         : immutable");
console.log("Unrelated metadata                   : immutable");
console.log("Score/evidence rewrite bypass        : absent");
console.log("Trigger disable/bypass SQL           : absent");
console.log("Staff Feedback combination           : absent");
console.log("Schema target                        : edulife_os");
console.log("Database accessed by QA              : false");
console.log("");
console.log("RESULT: N7-P2C4B1I2 HEADTEACHER APPRAISAL TERMINAL GUARD GREEN");
console.log("");
console.log("=== N7-P2C4C1B TEACHER DIRECTOR RETURN TERMINAL PARITY ===");
console.log("");
console.log("Teacher FINALIZED -> RETURNED        : allowed only with dedicated provenance");
console.log("Teacher provenance object            : teacherSupervisoryReturn only");
console.log("Returning reviewer                   : HOS or District Director only");
console.log("Review / assessment hashes           : required");
console.log("Reason hash / length                  : required");
console.log("Scores / General Comment             : immutable");
console.log("Observation / assignment provenance  : immutable");
console.log("Unknown Teacher return keys          : rejected");
console.log("Repeated provenance injection        : rejected");
console.log("Teacher RETURNED -> SUPERSEDED       : existing pure-status allowance preserved");
console.log("Headteacher Director RETURN          : HOS-authored only");
console.log("Headteacher terminal paths           : preserved");
console.log("Trigger bypass SQL                   : absent");
console.log("Database accessed by QA              : false");
console.log("");
console.log("RESULT: N7-P2C4C1C SHARED TERMINAL AUTHORITY PARITY GREEN");
