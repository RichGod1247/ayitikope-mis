#!/usr/bin/env node
"use strict";
/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS source-contract QA harness. */

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..", "..");

const files = {
  shared: "src/app/api/governance/appraisals/teacher-supervisory/_shared.ts",
  assessmentRoot: "src/app/api/governance/appraisals/teacher-supervisory/route.ts",
  reviewRoute:
    "src/app/api/governance/appraisals/teacher-supervisory/review-queue/route.ts",
  reviewQueue: "src/lib/appraisals/teacherSupervisoryReviewQueue.ts",
  reviewPolicy: "src/lib/appraisals/teacherSupervisoryReview.ts",
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
  source.reviewRoute.includes("TEACHER_SUPERVISORY_REVIEW_POLICY.reviewerRoles"),
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
  "N6-E1B2 review discovery must expose GET only",
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

assert(
  source.reviewQueue.includes("assessmentEvidenceIncluded: false") &&
    source.reviewQueue.includes("scoresIncluded: false") &&
    source.reviewQueue.includes("generalCommentIncluded: false") &&
    source.reviewQueue.includes("observationDetailsIncluded: false") &&
    source.reviewQueue.includes("classEnrolmentEvidenceIncluded: false"),
  "Read-only review service evidence-minimization contract missing",
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
console.log("=== N6-E1B2 GOVERNANCE TEACHER REVIEW QUEUE THIN API ===");
console.log("");
console.log("Endpoint                         : governance Teacher review queue GET");
console.log("Audience                         : HOS / District Director only");
console.log("Broader assessor auth helper     : retained + narrowed at route boundary");
console.log("SISSO/BSC review access          : forbidden");
console.log("Verified governance scope        : passed to read-only review service");
console.log("Response                         : compact reviewQueue metadata");
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
console.log("RESULT: N6-E1B2 GOVERNANCE TEACHER REVIEW QUEUE THIN API GREEN");
