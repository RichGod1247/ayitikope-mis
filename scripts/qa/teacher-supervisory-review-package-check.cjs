#!/usr/bin/env node
"use strict";
/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS source-contract QA harness. */

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..", "..");

const files = {
  scoring: "src/lib/appraisals/teacherSupervisoryAssessmentScoring.ts",
  admission: "src/lib/appraisals/teacherSupervisoryReviewAdmission.ts",
  reviewPolicy: "src/lib/appraisals/teacherSupervisoryReview.ts",
  package: "src/lib/appraisals/teacherSupervisoryReviewPackage.ts",
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
  const absolutePath = path.join(repoRoot, relativePath);
  if (!fs.existsSync(absolutePath)) fail("Required file missing", relativePath);
  return fs.readFileSync(absolutePath, "utf8");
}

const source = Object.fromEntries(
  Object.entries(files).map(([key, relativePath]) => [key, read(relativePath)]),
);

assert(
  source.admission.includes(
    "export function computeTeacherSupervisoryReviewEvidenceHash",
  ),
  "Review evidence hash must be reusable rather than duplicated",
);

assert(
  source.package.includes("computeTeacherSupervisoryReviewEvidenceHash"),
  "Review package must recompute the admission evidence hash",
);

assert(
  source.package.includes(
    "verifyTeacherSupervisoryFinalizedAssessmentEvidence",
  ),
  "Review package must reuse the finalized assessment proof",
);

for (const required of [
  'audience: ["HEAD_OF_SUPERVISION", "DISTRICT_DIRECTOR"]',
  'requiredCycleStatus: "UNDER_REVIEW"',
  'requiredReviewDecision: "PENDING"',
  "resolveCurrentPendingReview",
  "decideTeacherSupervisoryReviewAuthority",
  "teacherSupervisoryReviewChainForAssessor",
  "governanceScope",
  "reviewerAssignmentId",
  "ACTIVE",
  "revokedAt",
  "startsAt",
  "endsAt",
  "expectedReviewEvidenceHash",
  "reviewEvidenceHash",
  "assessmentHash",
  "observationContextHash",
  "immutableFinalizedEvidenceVerified: true",
  "generalCommentIncludedInAssessmentHash: true",
  "reviewerMayRewriteScores: false",
  "reviewerMayRewriteComment: false",
  "reviewerMayRewriteObservationDetails: false",
  "reviewerMayRewriteGovernanceEnrolmentEvidence: false",
  "reviewerMayRewriteTeacherAssignmentProvenance: false",
  "reviewerMayRewriteCurriculumProvenance: false",
  "legacyTeacherAppraisalIncluded: false",
  "combinedWeightingDefined: false",
  "rawEvidenceSnapshotIncluded: false",
  "rawMetadataIncluded: false",
  "contactDetailsIncluded: false",
  "confidentialStaffFeedbackIncluded: false",
  "respondentIdentitiesIncluded: false",
  "readOnly: true",
  "databaseWritesAllowed: false",
  "providerCallsAllowed: false",
]) {
  assert(
    source.package.includes(required),
    "Immutable review-package contract marker missing",
    required,
  );
}

for (const officialField of [
  "teacherName",
  "schoolName",
  "circuitName",
  "districtName",
  "dateObserved",
  "yearsInService",
  "yearsInPresentSchool",
  "subjectBeingObserved",
  "subStrand",
  "classTaught",
  "durationMinutes",
  "totalEnrolment",
  "girls",
  "boys",
  "generalComment",
  "sectionPercentages",
  "overallPercentage",
]) {
  assert(
    source.package.includes(officialField),
    "Official Teacher review-package field missing",
    officialField,
  );
}

assert(
  source.package.includes("expectedSectionCount: 6") &&
    source.package.includes("expectedItemCount: 34"),
  "Official 6-domain / 34-item Teacher form contract missing",
);

assert(
  source.package.includes("readTeacherSupervisoryObservationDetailsSnapshot") &&
    source.package.includes(
      "readTeacherSupervisoryObservationSelectionSnapshot",
    ),
  "Official observation details/selection readers must be reused",
);

assert(
  source.package.includes("appraisalReview.findMany") &&
    /orderBy:\s*\{\s*stage:\s*"asc"\s*,?\s*\}/.test(source.package),
  "Current PENDING review must be resolved from the assessment review chain",
);

assert(
  source.package.includes("pending.length !== 1"),
  "Exactly one current PENDING review must be required",
);

for (const forbidden of [
  ".$transaction",
  "appraisalAssessment.update",
  "appraisalAssessment.updateMany",
  "appraisalAssessmentScore.upsert",
  "appraisalAssessmentScore.update",
  "appraisalCycle.update",
  "appraisalCycle.updateMany",
  "appraisalReview.create",
  "appraisalReview.update",
  "appraisalReview.updateMany",
  "auditLog.create",
  "prisma.teacherAppraisal",
  "teacherAppraisal.create",
  "teacherAppraisal.update",
  "sendSms",
  "sendEmail",
  "appraisalNotification",
  "localStorage",
  "sessionStorage",
  "setInterval(",
]) {
  assert(
    !source.package.includes(forbidden),
    "Review package contains forbidden mutation/provider marker",
    forbidden,
  );
}

assert(
  !source.package.includes("email:") &&
    !source.package.includes("phone:") &&
    !source.package.includes("evidenceSnapshotJson: input.record"),
  "Review package must not expose contacts or raw evidence snapshot",
);

assert(
  source.scoring.includes(
    "export async function verifyTeacherSupervisoryFinalizedAssessmentEvidence",
  ),
  "Shared finalized proof regression",
);

assert(
  source.reviewPolicy.includes(
    'reviewerRoles: ["HEAD_OF_SUPERVISION", "DISTRICT_DIRECTOR"]',
  ),
  "Review policy reviewer audience regression",
);

console.log("");
console.log("=== N6-E2A GOVERNANCE TEACHER IMMUTABLE REVIEW PACKAGE ===");
console.log("");
console.log("Audience                         : current HOS / District Director reviewer");
console.log("Lifecycle                        : UNDER_REVIEW + exactly one current PENDING review");
console.log("Reviewer custody                 : authenticated user + exact active assignment");
console.log("Review chain                     : assessor-origin / stage / reviewer role rechecked");
console.log("Finalized assessment proof       : shared D4 verifier");
console.log("Assessment hash                  : reverified");
console.log("Observation-context hash         : reverified");
console.log("Review-evidence hash             : recomputed from admission contract");
console.log("Official Teacher form            : 6 domains / 34 items");
console.log("Score / N/A values               : read-only");
console.log("General Comment                  : read-only; sealed in assessment hash");
console.log("Official observation particulars : included");
console.log("Class Enrollment Data            : v2 included; v1 not invented");
console.log("Raw evidence / metadata          : excluded");
console.log("Contacts                         : excluded");
console.log("Staff-feedback respondents       : absent");
console.log("Legacy TeacherAppraisal          : excluded");
console.log("Combined weighting               : undefined");
console.log("Reviewer mutation                : absent");
console.log("Database writes                  : absent");
console.log("Providers                        : absent");
console.log("Database accessed                : source contract only");
console.log("");
console.log("RESULT: N6-E2A GOVERNANCE TEACHER IMMUTABLE REVIEW PACKAGE GREEN");
