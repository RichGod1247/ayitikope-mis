#!/usr/bin/env node
"use strict";
/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS source-contract QA harness. */

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..", "..");
const servicePath = "src/lib/appraisals/teacherSupervisoryReviewQueue.ts";

function fail(message, detail) {
  const suffix = detail === undefined ? "" : `\n${JSON.stringify(detail, null, 2)}`;
  throw new Error(`${message}${suffix}`);
}

function assert(condition, message, detail) {
  if (!condition) fail(message, detail);
}

function read(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  if (!fs.existsSync(absolutePath)) fail("Required file missing", relativePath);
  return fs.readFileSync(absolutePath, "utf8");
}

const source = read(servicePath);

for (const forbidden of [
  "appraisalReview.create",
  "appraisalReview.update",
  "appraisalReview.updateMany",
  "appraisalCycle.update",
  "appraisalCycle.updateMany",
  "appraisalAssessment.update",
  "appraisalAssessment.updateMany",
  "teacherAppraisal.create",
  "teacherAppraisal.update",
  "teacherAppraisal.delete",
  "prisma.teacherAppraisal",
  "sendSms",
  "sendEmail",
  "localStorage",
  "sessionStorage",
  "setInterval(",
]) {
  assert(!source.includes(forbidden), "Review queue contains forbidden marker", forbidden);
}

for (const required of [
  "TEACHER_SUPERVISORY_REVIEW_QUEUE_POLICY",
  "TEACHER_SUPERVISORY_REVIEW_POLICY",
  "teacherSupervisoryReviewChainForAssessor",
  "decideTeacherSupervisoryReviewAuthority",
  "readTeacherSupervisoryReviewQueue",
  'requiredAssessmentStatus: "FINALIZED"',
  'requiredCycleStatus: "OPEN"',
  "requiredReviewCount: 0",
  "currentReviewerAssignmentRequired: true",
  "reviewerAuthorityRecheckedPerAssessment: true",
  "fullAssessmentHashReverificationDeferredToReviewAdmission: true",
  "assessmentEvidenceIncluded: false",
  "scoresIncluded: false",
  "generalCommentIncluded: false",
  "observationDetailsIncluded: false",
  "classEnrolmentEvidenceIncluded: false",
  "contactDetailsIncluded: false",
  "legacyTeacherAppraisalIncluded: false",
  "databaseWritesAllowed: false",
  "providerCallsAllowed: false",
  'status: "FINALIZED"',
  'status: "OPEN"',
  "_count: { select: { reviews: true } }",
  "record._count.reviews",
  "record.finalizedByUserId === record.assessorUserId",
  "isSha256(record.assessmentHash)",
  "cycleMetadata.respondentWorkflow === false",
  'clean(cycleMetadata.participantSelection) === "NONE"',
  "cycleMetadata.legacyTeacherAppraisalIncluded === false",
  "cycleMetadata.combinedWeightingDefined === false",
  "cycleMetadata.providerCalled === false",
  "membershipByTarget",
  "validCurrentTarget",
  "scopeContainsTarget",
  "reviewerAssignmentForDistrict",
  'state: "READY_TO_START"',
]) {
  assert(source.includes(required), "Review queue contract marker missing", required);
}

assert(
  source.includes('case "HEAD_OF_SUPERVISION"') &&
    source.includes('case "DISTRICT_DIRECTOR"'),
  "Reviewer office labels missing",
);

assert(
  source.includes("context.assessor?.role") &&
    source.includes("canonicalTeacherSupervisoryAssessorRole"),
  "Assessor origin must come from frozen observation context",
);

assert(
  source.includes("firstStage = chain?.stages[0]") &&
    source.includes("stage: firstStage.stage"),
  "Queue must expose only the first legitimate upstream stage",
);

assert(
  source.includes("actorUserId,") && source.includes("assessorUserId: record.assessorUserId"),
  "Per-assessment self-review/capability check missing",
);

assert(
  source.includes("record.cycle.reviewStartedAt === null") &&
    source.includes("record.cycle.closedAt === null"),
  "Review queue must contain only not-yet-admitted OPEN cycles",
);

assert(
  !source.includes("generalComment: record.generalComment"),
  "General Comment must not be emitted by queue",
);
assert(
  !source.includes("scores: record.scores"),
  "Scores must not be emitted by queue",
);
assert(
  !source.includes("evidenceSnapshotJson: record.evidenceSnapshotJson"),
  "Raw observation evidence must not be emitted by queue",
);
assert(
  !source.includes("assessmentHash: record.assessmentHash"),
  "Assessment hash must remain server-side at discovery stage",
);

console.log("");
console.log("=== N6-E1B1 GOVERNANCE TEACHER UPSTREAM REVIEW DISCOVERY ===");
console.log("");
console.log("Audience                         : HOS / District Director");
console.log("Discovery                         : read-only finalized Teacher assessments");
console.log("Required assessment               : FINALIZED");
console.log("Required cycle                    : OPEN and not yet admitted to review");
console.log("Existing review rows              : zero required");
console.log("SISSO/BSC first reviewer          : HOS");
console.log("HOS first reviewer                : Director");
console.log("Director-authored self-review     : excluded");
console.log("Reviewer authority                : capability + chain + current district assignment");
console.log("Target scope                      : active Teacher + tenant + circuit + district");
console.log("Assessor provenance               : frozen observation context");
console.log("Assessment hash                   : SHA-256 presence checked");
console.log("Full hash reverification          : deferred to review admission/package");
console.log("Queue evidence                    : compact metadata only");
console.log("Scores / General Comment          : excluded");
console.log("Observation / enrolment details   : excluded");
console.log("Legacy TeacherAppraisal           : excluded");
console.log("Database writes                   : absent");
console.log("Notifications/providers           : absent");
console.log("Database accessed                 : source contract only");
console.log("");
console.log("RESULT: N6-E1B1 GOVERNANCE TEACHER REVIEW DISCOVERY GREEN");
