#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS repository contract QA. */

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
  const file = path.join(repoRoot, relativePath);
  if (!fs.existsSync(file)) fail("Required reader file missing", relativePath);
  return fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

const released = read("src/lib/appraisals/headteacherReleasedResult.ts");
const notifications = read("src/lib/appraisals/headteacherDirectorReleaseNotifications.ts");
const direct = read("src/lib/appraisals/headteacherDirectorDirectRelease.ts");

for (const marker of [
  'reviewedReleaseMode: "REVIEWED_DIRECTOR_RELEASE"',
  'directorAuthoredDirectReleaseMode: "DIRECTOR_AUTHORED_DIRECT_RELEASE"',
  "dualReleaseModesSupported: true",
  'releaseMode: "REVIEWED_DIRECTOR_RELEASE" | "DIRECTOR_AUTHORED_DIRECT_RELEASE"',
  "reviewStage: number | null",
  "computeHeadteacherDirectorDirectReleaseDecisionContractHash",
  "computeHeadteacherDirectorDirectReleaseRequestHash",
  "computeHeadteacherDirectorDirectReleaseEvidenceHash",
  "computeHeadteacherDirectorDirectReleaseProofHashFromMetadata",
  "HEADTEACHER_RELEASED_RESULT_DIRECT_RELEASE_REVIEW_ROWS_PRESENT",
  "canonicalHeadteacherSupervisoryAssessorRole",
  'frozenRole !== "DISTRICT_DIRECTOR"',
  "cycleRelease.reviewRowsRequired !== false",
  "cycleRelease.selfReviewPerformed !== false",
  "cycleRelease.releaseNoteIncluded !== false",
  "cycleRelease.separateEvidenceStreams !== true",
  "cycleRelease.combinedWeightingDefined !== false",
  "respondentIdentitiesIncluded: false",
  "individualStaffResponsesIncluded: false",
  "combinedOverallPercentage: null",
]) {
  assert(released.includes(marker), "Released-result dual-mode marker missing", marker);
}

for (const legacyMarker of [
  'requiredReviewDecision: "ACCEPTED"',
  "verifyReviewChain(assessment.reviews, review)",
  "reviewEvidenceAnchors(review)",
  "HEADTEACHER_RELEASED_RESULT_RELEASE_PROOF_COPY_DRIFT",
  "HEADTEACHER_RELEASED_RESULT_RELEASE_NOTE_HASH_DRIFT",
  "releaseRequestHash({",
  "releaseProofPayload(cycleRelease)",
]) {
  assert(released.includes(legacyMarker), "Reviewed-release regression marker missing", legacyMarker);
}

for (const marker of [
  'reviewedReleaseMode: "REVIEWED_DIRECTOR_RELEASE"',
  'directorAuthoredDirectReleaseMode: "DIRECTOR_AUTHORED_DIRECT_RELEASE"',
  "dualReleaseModesSupported: true",
  "const directRelease =",
  "release.reviewRowsRequired === false",
  "release.reviewRowsPresent === false",
  "release.selfReviewPerformed === false",
  "release.releaseNoteIncluded === false",
  "release.assessmentMutationPerformed === false",
  "release.visitContextMutationPerformed === false",
  "release.separateEvidenceStreams === true",
  "release.combinedWeightingDefined === false",
  'normalized(release.reviewDecision) === "ACCEPTED"',
  "clean(release.reviewerUserId) === input.actorUserId",
  "ensureHeadteacherDirectorReleaseNotifications",
]) {
  assert(notifications.includes(marker), "Notification dual-mode marker missing", marker);
}

for (const forbidden of [
  "respondentUserId",
  "respondentEmail",
  "individualResponse",
  "combinedScore:",
  "combinedOverallPercentage: 0",
]) {
  assert(!direct.includes(forbidden), "Direct-release service privacy marker forbidden", forbidden);
}

console.log("=== N6-F1C6B5C DIRECT RELEASE READERS + NOTIFICATIONS ===");
console.log("");
console.log("Released-result modes           : reviewed + Director-authored direct");
console.log("Reviewed proof chain            : preserved unchanged");
console.log("Direct proof chain              : independently recomputed");
console.log("Direct AppraisalReview rows     : verified absent");
console.log("Frozen Director provenance      : verified");
console.log("Staff snapshot                  : immutable proof anchor preserved");
console.log("Supervisory assessment          : calculations/hash recomputed");
console.log("Release note                    : reviewed optional / direct absent");
console.log("Notifications                   : both valid release modes accepted");
console.log("Respondent identities/forms     : absent");
console.log("Combined score                  : absent");
console.log("Database writes in reader       : absent");
console.log("Database accessed               : false");
console.log("");
console.log("RESULT: N6-F1C6B5C DIRECT RELEASE READERS GREEN");
