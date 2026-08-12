#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS source-contract QA harness. */

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..", "..");
const servicePath =
  "src/lib/appraisals/headteacherSupervisoryReviewQueue.ts";

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
  return fs
    .readFileSync(absolutePath, "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
}

function blockBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert(start >= 0 && end > start, "Required source block missing", {
    startMarker,
    endMarker,
  });
  return source.slice(start, end);
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
  "appraisalAssessmentScore",
  "appraisalAggregateSnapshot",
  "teacherAppraisal",
  "sendSms",
  "sendEmail",
  "localStorage",
  "sessionStorage",
  "setInterval(",
]) {
  assert(
    !source.includes(forbidden),
    "HOS Headteacher review queue contains forbidden mutation/evidence/provider marker",
    forbidden,
  );
}

for (const required of [
  "HEADTEACHER_SUPERVISORY_REVIEW_QUEUE_POLICY",
  "readHeadteacherSupervisoryReviewQueue",
  "schemaVersion: 1",
  'reviewerRole: "HEAD_OF_SUPERVISION"',
  'requiredCapability: "REVIEW_HEADTEACHER_APPRAISAL"',
  'eligibleAssessorRoles: ["SISSO", "BASIC_SCHOOL_COORDINATOR"]',
  'requiredAssessmentStatus: "FINALIZED"',
  'requiredCycleStatus: "CLOSED"',
  "requiredReviewCount: 0",
  'state: "READY_TO_START"',
  'nextAction: "START_REVIEW"',
  "exactDistrictAssignmentRequired: true",
  "fullAssessmentHashReverificationDeferredToAction: true",
  "supervisoryEvidenceIncluded: false",
  "staffFeedbackIncluded: false",
  "respondentIdentitiesIncluded: false",
  "individualStaffResponsesIncluded: false",
  "contactDetailsIncluded: false",
  "assessorUserIdIncluded: false",
  "targetUserIdIncluded: false",
  "reviewIdIncluded: false",
  "assignmentIdsIncluded: false",
  "proofHashesIncluded: false",
  "databaseWritesAllowed: false",
  "providerCallsAllowed: false",
  "backgroundPollingAllowed: false",
  "hasAppraisalCapability",
  'HEADTEACHER_SUPERVISORY_REVIEW_QUEUE_ROLE_FORBIDDEN',
  'status: HEADTEACHER_SUPERVISORY_REVIEW_QUEUE_POLICY.requiredAssessmentStatus',
  'status: HEADTEACHER_SUPERVISORY_REVIEW_QUEUE_POLICY.requiredCycleStatus',
  "reviewStartedAt: null",
  "releasedAt: null",
  "cancelledAt: null",
  "reviews: {",
  "_count: { select: { reviews: true } }",
  "record._count.reviews === 0",
  "record.reviews.length === 0",
  "record.finalizedByUserId === record.assessorUserId",
  "isSha256(record.assessmentHash)",
  "parseVisitContext",
  "canonicalHeadteacherSupervisoryAssessorRole",
  "reviewerAssignmentForDistrict",
  "scopeContainsTarget",
  "validCurrentTarget",
]) {
  assert(
    source.includes(required),
    "HOS Headteacher review queue contract marker missing",
    required,
  );
}

assert(
  source.includes('actorRole !== HEADTEACHER_SUPERVISORY_REVIEW_QUEUE_POLICY.reviewerRole'),
  "Queue service must fail closed for non-HOS callers",
);

assert(
  source.includes("eligibleAssessorRoles.includes(") &&
    !source.includes('eligibleAssessorRoles: ["SISSO", "BASIC_SCHOOL_COORDINATOR", "HEAD_OF_SUPERVISION"'),
  "HOS/Director-authored assessments must not enter HOS review discovery",
);

assert(
  source.includes("clean(context.assessor?.userId) !== record.assessorUserId") &&
    source.includes("clean(context.assessor?.assignmentId) !== clean(record.assessorAssignmentId)"),
  "Assessor provenance must come from frozen supervisory evidence",
);

const publicItemType = blockBetween(
  source,
  "export type HeadteacherSupervisoryReviewQueueItem = {",
  "export type HeadteacherSupervisoryReviewQueue = {",
);

for (const forbiddenPublicField of [
  "assessorUserId:",
  "targetUserId:",
  "reviewId:",
  "reviewerUserId:",
  "reviewerAssignmentId:",
  "assessorAssignmentId:",
  "assessmentHash:",
  "visitContextHash:",
  "reviewEvidenceHash:",
  "staffFeedback",
  "respondent",
]) {
  assert(
    !publicItemType.includes(forbiddenPublicField),
    "Browser Headteacher review item exposes forbidden internal/private field",
    forbiddenPublicField,
  );
}

for (const requiredPublicField of [
  "cycleId:",
  "assessmentId:",
  "revision:",
  "dateObserved:",
  "targetName:",
  "schoolId:",
  "schoolName:",
  "circuitId:",
  "circuitName:",
  "districtId:",
  "districtName:",
  "assessorRole:",
  "assessorOfficeLabel:",
  "state:",
  "nextAction:",
  "eligible:",
]) {
  assert(
    publicItemType.includes(requiredPublicField),
    "Required compact Headteacher review work field missing",
    requiredPublicField,
  );
}

console.log("");
console.log("=== N6-F1C6B1 HOS HEADTEACHER REVIEW DISCOVERY ===");
console.log("");
console.log("Audience                         : Head of Supervision only");
console.log("Discovery                        : finalized SISSO/BSC Headteacher assessments");
console.log("Required assessment              : FINALIZED");
console.log("Required cycle                   : CLOSED, not yet under review");
console.log("Existing review rows             : zero");
console.log("HOS-authored self-review         : excluded");
console.log("Director-authored self-review    : excluded");
console.log("Reviewer capability              : REVIEW_HEADTEACHER_APPRAISAL");
console.log("Reviewer district assignment     : exact current HOS district assignment");
console.log("Target scope                     : active Headteacher + tenant + circuit + district");
console.log("Assessor provenance              : frozen supervisory visit context");
console.log("Full assessment proof            : deferred to authoritative start/package action");
console.log("Supervisory scores/form          : excluded from queue");
console.log("Confidential staff feedback      : excluded");
console.log("Respondent identities/forms      : excluded");
console.log("Internal authority IDs/hashes    : excluded");
console.log("Database writes                  : absent");
console.log("Notifications/providers          : absent");
console.log("Background polling               : absent");
console.log("Database accessed                : source contract only");
console.log("");
console.log("RESULT: N6-F1C6B1 HOS HEADTEACHER REVIEW DISCOVERY GREEN");
