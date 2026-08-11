#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS source-contract QA harness. */

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..", "..");

const files = {
  shared:
    "src/app/api/governance/appraisals/teacher-supervisory/_shared.ts",
  assessmentRoot:
    "src/app/api/governance/appraisals/teacher-supervisory/route.ts",
  reviewRoute:
    "src/app/api/governance/appraisals/teacher-supervisory/review-queue/route.ts",
  reviewQueue:
    "src/lib/appraisals/teacherSupervisoryReviewQueue.ts",
  reviewPolicy:
    "src/lib/appraisals/teacherSupervisoryReview.ts",
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

const source = Object.fromEntries(
  Object.entries(files).map(([key, relativePath]) => [key, read(relativePath)]),
);

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
    !source.reviewRoute.includes(forbidden),
    "Review queue API contains forbidden mutation/provider marker",
    forbidden,
  );
}

for (const required of [
  "readTeacherSupervisoryReviewQueue",
  "TEACHER_SUPERVISORY_REVIEW_POLICY",
  "requireTeacherSupervisoryGovernanceApiContext",
  "reviewerRoleAllowed",
  "auth.ctx.userId",
  "auth.ctx.roleName",
  "governanceScope: auth.scope",
  "jsonNoStore",
  'runtime = "nodejs"',
  'dynamic = "force-dynamic"',
  '"[TEACHER_SUPERVISORY_REVIEW_QUEUE_API_ERROR]"',
]) {
  assert(
    source.reviewRoute.includes(required),
    "Review queue API contract marker missing",
    required,
  );
}

assert(
  source.reviewRoute.includes(
    "TEACHER_SUPERVISORY_REVIEW_POLICY.reviewerRoles",
  ),
  "Review queue endpoint must derive its narrow HOS/Director audience from review policy",
);

assert(
  source.reviewPolicy.includes(
    'reviewerRoles: ["HEAD_OF_SUPERVISION", "DISTRICT_DIRECTOR"]',
  ),
  "Review policy reviewer audience drifted",
);

assert(
  source.reviewRoute.includes("if (!reviewerRoleAllowed(auth.ctx.roleName))") &&
    source.reviewRoute.includes("return jsonNoStore(403"),
  "SISSO/BSC must be rejected at the review API boundary",
);

assert(
  source.reviewRoute.includes("export async function GET"),
  "Review discovery GET missing",
);

assert(
  !source.reviewRoute.includes("export async function POST") &&
    !source.reviewRoute.includes("export async function PUT") &&
    !source.reviewRoute.includes("export async function PATCH") &&
    !source.reviewRoute.includes("export async function DELETE"),
  "N6-F1B review work discovery must expose GET only",
);

assert(
  source.shared.includes('"Cache-Control": "no-store, max-age=0"') &&
    source.shared.includes('"X-Content-Type-Options": "nosniff"'),
  "Existing no-store/nosniff response boundary missing",
);

assert(
  source.reviewRoute.includes("reviewQueue,"),
  "Review queue response payload missing",
);

for (const forbiddenPayload of [
  "generalComment",
  "sectionPercentagesJson",
  "overallPercentage",
  "evidenceSnapshotJson",
  "assessmentHash",
  "scores:",
  "totalEnrolment",
  "girls:",
  "boys:",
]) {
  assert(
    !source.reviewRoute.includes(forbiddenPayload),
    "Thin review queue route must not project assessment evidence",
    forbiddenPayload,
  );
}

for (const requiredQueueContract of [
  "schemaVersion: 2",
  '"READY_TO_START"',
  '"READY_TO_REVIEW"',
  '"READY_TO_RELEASE"',
  '"START_REVIEW"',
  '"CONTINUE_REVIEW"',
  '"DIRECT_RELEASE"',
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
  "noBackgroundPolling: true",
  "providerCalled: false",
]) {
  assert(
    source.reviewQueue.includes(requiredQueueContract),
    "Durable review work queue browser contract marker missing",
    requiredQueueContract,
  );
}

assert(
  source.reviewQueue.includes('state: "READY_TO_START"') &&
    source.reviewQueue.includes('nextAction: "START_REVIEW"'),
  "READY_TO_START must map only to START_REVIEW",
);

assert(
  source.reviewQueue.includes('state: "READY_TO_REVIEW"') &&
    source.reviewQueue.includes('nextAction: "CONTINUE_REVIEW"'),
  "READY_TO_REVIEW must map only to CONTINUE_REVIEW",
);

assert(
  source.reviewQueue.includes('state: "READY_TO_RELEASE"') &&
    source.reviewQueue.includes('nextAction: "DIRECT_RELEASE"'),
  "READY_TO_RELEASE must map only to DIRECT_RELEASE",
);

const publicItemType = blockBetween(
  source.reviewQueue,
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
    "Browser review-work item exposes forbidden authority/evidence field",
    forbiddenPublicField,
  );
}

const publicQueueItemFunction = blockBetween(
  source.reviewQueue,
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
    "Public review-work projection emits forbidden authority/evidence field",
    forbiddenProjection,
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
    "Required compact browser work-item field missing",
    requiredPublicField,
  );
}

assert(
  source.reviewQueue.includes("currentPendingReviewForActor") &&
    source.reviewQueue.includes("directReleaseReadyForActor"),
  "Durable review/direct-release custody readers missing",
);

assert(
  source.reviewQueue.includes(
    'status: { in: ["OPEN", "UNDER_REVIEW"] }',
  ),
  "Queue must discover both initial OPEN work and durable UNDER_REVIEW custody",
);

assert(
  source.reviewQueue.includes(
    "fullAssessmentHashReverificationDeferredToAction: true",
  ),
  "Queue must remain read-only and defer full proof to the authoritative action",
);

assert(
  source.assessmentRoot.includes("readTeacherSupervisoryAssessmentQueue") &&
    source.assessmentRoot.includes("createTeacherSupervisoryAssessmentDraft"),
  "Existing assessment root route must remain assessment-oriented",
);

assert(
  !source.assessmentRoot.includes("readTeacherSupervisoryReviewQueue"),
  "Review discovery must remain a separate API doorway",
);

console.log("");
console.log("=== N6-F1B GOVERNANCE TEACHER DURABLE REVIEW WORK QUEUE THIN API ===");
console.log("");
console.log("Endpoint                         : governance Teacher review queue GET");
console.log("Audience                         : HOS / District Director only");
console.log("Broader assessor auth helper     : retained + narrowed at route boundary");
console.log("SISSO/BSC review access          : forbidden");
console.log("Verified governance scope        : passed to read-only review service");
console.log("READY_TO_START                   : START_REVIEW");
console.log("READY_TO_REVIEW                  : CONTINUE_REVIEW");
console.log("READY_TO_RELEASE                 : DIRECT_RELEASE");
console.log("nextAction                       : presentation/navigation hint only");
console.log("Mutation authority               : re-established by action endpoints");
console.log("Response                         : compact reviewQueue metadata");
console.log("Browser assessor user id         : excluded");
console.log("Browser target user id           : excluded");
console.log("Browser review/assignment ids    : excluded");
console.log("Browser proof hashes             : excluded");
console.log("Scores / General Comment         : excluded");
console.log("Observation / enrolment evidence : excluded");
console.log("Assessment hash                  : not exposed");
console.log("Review creation                  : absent");
console.log("Cycle transition                 : absent");
console.log("Assessment mutation              : absent");
console.log("JSON mutation body               : absent");
console.log("HTTP mutation methods            : absent");
console.log("No-store / nosniff               : inherited from shared boundary");
console.log("Legacy TeacherAppraisal          : untouched");
console.log("Notifications/providers          : absent");
console.log("Database writes                  : absent");
console.log("Database accessed                : source contract only");
console.log("");
console.log("RESULT: N6-F1B GOVERNANCE TEACHER DURABLE REVIEW WORK QUEUE THIN API GREEN");
