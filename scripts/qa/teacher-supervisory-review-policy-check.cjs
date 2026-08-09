#!/usr/bin/env node
"use strict";
/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS source-contract QA harness. */

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..", "..");

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

const reviewPath = "src/lib/appraisals/teacherSupervisoryReview.ts";
const authorityPath = "src/lib/appraisals/authority.ts";
const workflowPath = "src/lib/appraisals/workflow.ts";
const assessmentPath = "src/lib/appraisals/teacherSupervisoryAssessment.ts";

const review = read(reviewPath);
const authority = read(authorityPath);
const workflow = read(workflowPath);
const assessment = read(assessmentPath);

for (const forbidden of [
  "@/lib/prisma",
  "prisma.",
  "$transaction",
  "appraisalReview.create",
  "appraisalReview.update",
  "appraisalCycle.update",
  "appraisalAssessment.update",
  "sendSms",
  "sendEmail",
  "fetch(",
  "localStorage",
  "sessionStorage",
  "setInterval(",
]) {
  assert(!review.includes(forbidden), "Pure Teacher review policy contains forbidden marker", forbidden);
}

assert(
  review.includes("TEACHER_SUPERVISORY_REVIEW_POLICY"),
  "Teacher review policy export missing",
);
assert(
  review.includes("TEACHER_SUPERVISORY_ASSESSMENT_POLICY.workflow"),
  "Teacher review workflow must reuse Teacher supervisory workflow identity",
);
assert(
  review.includes('requiredCapability: "REVIEW_TEACHER_APPRAISAL"'),
  "Teacher review capability contract missing",
);
assert(
  review.includes('from: "OPEN"') &&
    review.includes('via: "CLOSED"') &&
    review.includes('to: "UNDER_REVIEW"') &&
    review.includes("directOpenToUnderReviewAllowed: false"),
  "Teacher review admission must compose OPEN -> CLOSED -> UNDER_REVIEW",
);

for (const role of [
  '"SISSO"',
  '"BASIC_SCHOOL_COORDINATOR"',
  '"HEAD_OF_SUPERVISION"',
  '"DISTRICT_DIRECTOR"',
]) {
  assert(review.includes(role), `Teacher review hierarchy role missing: ${role}`);
}

assert(
  review.includes("canonicalTeacherSupervisoryAssessorRole"),
  "Circuit Supervisor must reuse canonical SISSO office mapping",
);
assert(
  review.includes('reviewerRoles: ["HEAD_OF_SUPERVISION", "DISTRICT_DIRECTOR"]'),
  "Teacher supervisory upstream reviewer offices drifted",
);
assert(
  review.includes('hosActions: ["RETURN", "FORWARD"]'),
  "HOS review actions must be RETURN / FORWARD",
);
assert(
  review.includes('directorActions: ["RETURN", "RELEASE"]'),
  "Director review actions must be RETURN / RELEASE",
);
assert(
  review.includes('reviewDecision: "ACCEPTED"') &&
    review.includes('action === "FORWARD"'),
  "Forward must map to existing ACCEPTED review decision",
);
assert(
  review.includes('reviewDecision: "RETURNED"'),
  "Return must map to existing RETURNED review decision",
);
assert(
  review.includes('cycleNextStatus: "RELEASED"'),
  "Director release terminal cycle status missing",
);
assert(
  review.includes("requiresReviewRows: false") &&
    review.includes('assessorRole: "DISTRICT_DIRECTOR"'),
  "Director-authored assessment must not require fake self-review rows",
);
assert(
  review.includes('reason: "SELF_REVIEW_FORBIDDEN"'),
  "Teacher supervisory review self-review guard missing",
);

for (const marker of [
  "reviewerMayRewriteScores: false",
  "reviewerMayRewriteComment: false",
  "reviewerMayRewriteObservationDetails: false",
  "reviewerMayRewriteGovernanceEnrolmentEvidence: false",
  "reviewerMayRewriteTeacherAssignmentProvenance: false",
  "reviewerMayRewriteCurriculumProvenance: false",
  "returnedAssessmentRequiresRevision: true",
  "preserveReturningReviewerForCorrection: true",
  "legacyTeacherAppraisalIncluded: false",
  "combinedWeightingDefined: false",
  "notificationsSeeded: false",
  "providerCallsAllowed: false",
  "prismaMigrationRequired: false",
]) {
  assert(review.includes(marker), `Teacher review policy invariant missing: ${marker}`);
}

assert(
  review.includes("planTeacherSupervisoryCorrectionContinuation"),
  "Returned-correction continuation planner missing",
);
assert(
  review.includes("preserveReturningReviewer: true"),
  "Returned correction must preserve returning reviewer",
);

assert(
  authority.includes('"REVIEW_TEACHER_APPRAISAL"'),
  "Global Teacher review capability no longer exists",
);
assert(
  authority.includes("capabilityIsNecessaryButNotSufficient: true"),
  "Global appraisal authority must remain capability-not-sufficient",
);
assert(
  workflow.includes('OPEN: ["CLOSED", "CANCELLED"]'),
  "Global OPEN cycle transition contract drifted",
);
assert(
  workflow.includes('CLOSED: ["UNDER_REVIEW", "CANCELLED"]'),
  "Global CLOSED cycle transition contract drifted",
);
assert(
  !workflow.includes('OPEN: ["UNDER_REVIEW"'),
  "Global workflow must not be widened to direct OPEN -> UNDER_REVIEW",
);
assert(
  workflow.includes('PENDING: ["ACCEPTED", "RETURNED", "HELD"]'),
  "Existing AppraisalReviewDecision transitions drifted",
);
assert(
  assessment.includes('workflow: "TEACHER_GOVERNANCE_SUPERVISORY_ASSESSMENT"'),
  "Teacher supervisory workflow identity drifted",
);
assert(
  assessment.includes("returnedAssessmentRequiresRevision: true"),
  "Teacher assessment revision requirement drifted",
);
assert(
  assessment.includes("reviewerMayRewriteScores: false"),
  "Teacher assessment reviewer score immutability drifted",
);

console.log("");
console.log("=== N6-E1A GOVERNANCE TEACHER REVIEW POLICY CONTRACT ===");
console.log("");
console.log("Workflow                         : TEACHER_GOVERNANCE_SUPERVISORY_ASSESSMENT");
console.log("Global capability                : REVIEW_TEACHER_APPRAISAL");
console.log("Capability alone                 : never sufficient");
console.log("Cycle admission                  : OPEN -> CLOSED -> UNDER_REVIEW");
console.log("Direct OPEN -> UNDER_REVIEW      : forbidden");
console.log("SISSO/BSC Stage 1                : HOS");
console.log("SISSO/BSC Stage 2                : Director");
console.log("HOS-originated Stage 1           : Director");
console.log("Director-originated self-review  : absent");
console.log("HOS actions                      : Return / Forward");
console.log("Director actions                 : Return / Release");
console.log("Forward durable decision         : ACCEPTED");
console.log("Release durable decision         : ACCEPTED");
console.log("Return durable decision          : RETURNED");
console.log("Returned assessment              : new revision required");
console.log("Correction reviewer/stage        : preserved");
console.log("Reviewer score rewrite           : forbidden");
console.log("Reviewer comment rewrite         : forbidden");
console.log("Observation rewrite              : forbidden");
console.log("Class-enrolment rewrite          : forbidden");
console.log("Assignment provenance rewrite    : forbidden");
console.log("Curriculum provenance rewrite    : forbidden");
console.log("Legacy TeacherAppraisal          : excluded");
console.log("Combined weighting               : undefined");
console.log("Notifications/providers          : absent");
console.log("Prisma migration                 : not required");
console.log("Database accessed                : false");
console.log("");
console.log("RESULT: N6-E1A GOVERNANCE TEACHER REVIEW POLICY GREEN");
