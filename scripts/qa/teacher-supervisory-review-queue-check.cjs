#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS source-contract QA harness. */

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..", "..");

const servicePath =
  "src/lib/appraisals/teacherSupervisoryReviewQueue.ts";

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
  assert(
    !source.includes(forbidden),
    "Review work queue contains forbidden marker",
    forbidden,
  );
}

for (const required of [
  "TEACHER_SUPERVISORY_REVIEW_QUEUE_POLICY",
  "TEACHER_SUPERVISORY_REVIEW_POLICY",
  "teacherSupervisoryReviewChainForAssessor",
  "decideTeacherSupervisoryReviewAuthority",
  "readTeacherSupervisoryReviewQueue",
  "schemaVersion: 2",
  '"READY_TO_START"',
  '"READY_TO_REVIEW"',
  '"READY_TO_RELEASE"',
  '"START_REVIEW"',
  '"CONTINUE_REVIEW"',
  '"DIRECT_RELEASE"',
  'initialAssessmentStatus: "FINALIZED"',
  'initialCycleStatus: "OPEN"',
  "initialReviewCount: 0",
  'activeAssessmentStatus: "FINALIZED"',
  'activeCycleStatus: "UNDER_REVIEW"',
  'activeReviewDecision: "PENDING"',
  'directReleaseAssessorRole: "DISTRICT_DIRECTOR"',
  'directReleaseActorRole: "DISTRICT_DIRECTOR"',
  "directReleaseReviewCount: 0",
  "directReleaseSelfReviewAllowed: false",
  "directReleaseReviewRowsRequired: false",
  "currentReviewerAssignmentRequired: true",
  "currentReviewCustodyRequired: true",
  "reviewerAuthorityRecheckedPerAssessment: true",
  "directReleaseAuthorityRecheckedPerAssessment: true",
  "fullAssessmentHashReverificationDeferredToAction: true",
  "assessmentEvidenceIncluded: false",
  "scoresIncluded: false",
  "generalCommentIncluded: false",
  "observationDetailsIncluded: false",
  "classEnrolmentEvidenceIncluded: false",
  "contactDetailsIncluded: false",
  "assessorUserIdIncluded: false",
  "targetUserIdIncluded: false",
  "reviewIdIncluded: false",
  "assignmentIdsIncluded: false",
  "proofHashesIncluded: false",
  "legacyTeacherAppraisalIncluded: false",
  "databaseWritesAllowed: false",
  "providerCallsAllowed: false",
  'status: { in: ["OPEN", "UNDER_REVIEW"] }',
  "reviews: {",
  "reviewerUserId: true",
  "reviewerAssignmentId: true",
  "stage: true",
  "decision: true",
  "metadata: true",
  "record._count.reviews === record.reviews.length",
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
  "currentPendingReviewForActor",
  "directReleaseReadyForActor",
  'state: "READY_TO_START"',
  'nextAction: "START_REVIEW"',
  'state: "READY_TO_REVIEW"',
  'nextAction: "CONTINUE_REVIEW"',
  'state: "READY_TO_RELEASE"',
  'nextAction: "DIRECT_RELEASE"',
]) {
  assert(
    source.includes(required),
    "Review work queue contract marker missing",
    required,
  );
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
  source.includes("pending.length !== 1") &&
    source.includes('normalized(review.decision) === "PENDING"') &&
    source.includes("review.reviewerUserId !== input.actorUserId") &&
    source.includes(
      "clean(review.reviewerAssignmentId) !== clean(input.reviewerAssignment.id)",
    ),
  "Active review discovery must bind exact current reviewer custody",
);

assert(
  source.includes(
    "clean(cycleReviewMetadata.currentReviewId) !== review.id",
  ) &&
    source.includes(
      "Number(cycleReviewMetadata.currentReviewStage) !== review.stage",
    ) &&
    source.includes(
      "clean(cycleReviewMetadata.currentReviewerRole) !== input.actorRole",
    ) &&
    source.includes(
      "clean(cycleReviewMetadata.currentReviewerAssignmentId)",
    ),
  "Active review discovery must recheck durable cycle custody anchors",
);

assert(
  source.includes(
    "input.record.assessorUserId !== input.actorUserId",
  ) &&
    source.includes(
      "clean(input.record.assessorAssignmentId) !==\n      clean(input.reviewerAssignment.id)",
    ) &&
    source.includes("chain.requiresReviewRows === false") &&
    source.includes("chain.selfReviewAllowed === false") &&
    source.includes("chain.stages.length === 0"),
  "Director-authored direct release discovery must bind exact author/releaser without self-review",
);

assert(
  source.includes(
    'normalized(record.cycle.status) === "OPEN"',
  ) &&
    source.includes("record._count.reviews === 0"),
  "READY_TO_START / READY_TO_RELEASE must remain zero-review OPEN work",
);

assert(
  source.includes(
    'normalized(record.cycle.status) === "UNDER_REVIEW"',
  ) &&
    source.includes("record.cycle.closedAt") &&
    source.includes("record.cycle.reviewStartedAt"),
  "READY_TO_REVIEW must be durable UNDER_REVIEW custody",
);

const publicItemType = blockBetween(
  source,
  "export type TeacherSupervisoryReviewQueueItem = {",
  "export type TeacherSupervisoryReviewQueue = {",
);

for (const forbiddenPublicField of [
  "assessorUserId:",
  "targetUserId:",
  "reviewId:",
  "reviewerUserId:",
  "reviewerAssignmentId:",
  "assessorAssignmentId:",
  "assessmentHash:",
  "observationContextHash:",
  "reviewEvidenceHash:",
  "releaseProofHash:",
]) {
  assert(
    !publicItemType.includes(forbiddenPublicField),
    "Browser review-work item exposes forbidden internal authority/evidence field",
    forbiddenPublicField,
  );
}

const publicQueueItemFunction = blockBetween(
  source,
  "function publicQueueItem(",
  "function statePriority(",
);

for (const forbiddenProjection of [
  "assessorUserId:",
  "targetUserId:",
  "reviewId:",
  "reviewerUserId:",
  "reviewerAssignmentId:",
  "assessorAssignmentId:",
  "assessmentHash:",
  "observationContextHash:",
  "reviewEvidenceHash:",
  "releaseProofHash:",
]) {
  assert(
    !publicQueueItemFunction.includes(forbiddenProjection),
    "Public queue projection emits forbidden internal authority/evidence field",
    forbiddenProjection,
  );
}

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
  !publicQueueItemFunction.includes("assessmentHash:"),
  "Assessment hash must remain server-side in discovery",
);

assert(
  source.includes("statePriority(left.state)") &&
    source.includes('case "READY_TO_REVIEW"') &&
    source.includes('case "READY_TO_RELEASE"') &&
    source.includes('case "READY_TO_START"'),
  "Work queue must prioritize in-progress review custody before new work",
);

console.log("");
console.log("=== N6-F1A GOVERNANCE TEACHER DURABLE REVIEW WORK DISCOVERY ===");
console.log("");
console.log("Audience                         : HOS / District Director");
console.log("Endpoint contract                : existing review-queue GET can remain thin");
console.log("READY_TO_START                   : FINALIZED + OPEN + zero review rows");
console.log("READY_TO_REVIEW                  : FINALIZED + UNDER_REVIEW + exact PENDING custody");
console.log("READY_TO_RELEASE                 : Director-authored FINALIZED + OPEN + zero reviews");
console.log("SISSO/BSC first reviewer         : HOS");
console.log("HOS first reviewer               : Director");
console.log("Forwarded HOS -> Director        : rediscoverable after browser reload");
console.log("Corrected resumed review         : rediscoverable at preserved reviewer/stage");
console.log("Director-authored self-review    : absent");
console.log("Direct assessor/releaser         : exact same Director + assignment");
console.log("Reviewer authority               : chain + capability + current district assignment");
console.log("Target scope                     : active Teacher + tenant + circuit + district");
console.log("Assessor provenance              : frozen observation context");
console.log("Full proof reverification        : deferred to start/package/direct-release action");
console.log("Browser assessor user id         : excluded");
console.log("Browser target user id           : excluded");
console.log("Browser review/assignment ids    : excluded");
console.log("Browser proof hashes             : excluded");
console.log("Scores / General Comment         : excluded");
console.log("Observation / enrolment details  : excluded");
console.log("Legacy TeacherAppraisal          : excluded");
console.log("Database writes                  : absent");
console.log("Notifications/providers          : absent");
console.log("Background polling               : absent");
console.log("Database accessed                : source contract only");
console.log("");
console.log("RESULT: N6-F1A GOVERNANCE TEACHER DURABLE REVIEW WORK DISCOVERY GREEN");
