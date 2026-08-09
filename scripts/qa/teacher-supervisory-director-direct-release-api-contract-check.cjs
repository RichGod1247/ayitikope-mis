#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS source-contract QA harness. */

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..", "..");

const files = {
  route:
    "src/app/api/governance/appraisals/teacher-supervisory/[assessmentId]/direct-release/route.ts",
  directRelease:
    "src/lib/appraisals/teacherSupervisoryDirectorDirectRelease.ts",
  reviewedDecisionRoute:
    "src/app/api/governance/appraisals/teacher-supervisory/review-queue/[assessmentId]/director-decision/route.ts",
  releasedResult:
    "src/lib/appraisals/teacherSupervisoryReleasedResult.ts",
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

const source = Object.fromEntries(
  Object.entries(files).map(([key, relativePath]) => [key, read(relativePath)]),
);

for (const marker of [
  'runtime = "nodejs"',
  'dynamic = "force-dynamic"',
  "executeTeacherSupervisoryDirectorDirectRelease",
  "requireTeacherSupervisoryGovernanceApiContext",
  "isUuidIdentifier",
  "requestIsJson",
  "readBoundedJsonObject",
  "requestMeta",
  "jsonNoStore",
  "teacherSupervisoryApiError",
  "export async function POST",
  'const ALLOWED_BODY_FIELDS = new Set(["confirm"])',
  'normalized(auth.ctx.roleName) !== "DISTRICT_DIRECTOR"',
  'error: "INVALID_ASSESSMENT_ID"',
  'error: "JSON_BODY_REQUIRED"',
  "TEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_FIELDS_FORBIDDEN",
  "TEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_CONFIRMATION_REQUIRED",
  "parsed.body.confirm !== true",
  "actorUserId: auth.ctx.userId",
  "actorRoleName: auth.ctx.roleName",
  "assessmentId,",
  "confirm: true",
  "governanceScope: auth.scope",
  "reqId: meta.reqId",
  "ip: meta.ip",
  "userAgent: meta.userAgent",
  "return jsonNoStore(200",
  "[TEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_API_ERROR]",
]) {
  assert(
    source.route.includes(marker),
    "Director direct-release API marker missing",
    marker,
  );
}

for (const forbiddenMethod of [
  "export async function GET",
  "export async function PUT",
  "export async function PATCH",
  "export async function DELETE",
]) {
  assert(
    !source.route.includes(forbiddenMethod),
    "Director direct-release endpoint must expose POST only",
    forbiddenMethod,
  );
}

for (const forbiddenBrowserField of [
  "action",
  "reason",
  "cycleId",
  "assessorUserId",
  "assessorAssignmentId",
  "releaserUserId",
  "releaserAssignmentId",
  "reviewId",
  "reviewStage",
  "assessmentHash",
  "observationContextHash",
  "decisionContractHash",
  "releaseRequestHash",
  "releaseEvidenceHash",
  "releaseProofHash",
  "releaseMode",
]) {
  assert(
    !source.route.includes(`parsed.body.${forbiddenBrowserField}`) &&
      !source.route.includes(`searchParams.get("${forbiddenBrowserField}")`),
    "Director direct-release API accepts forbidden browser authority/evidence field",
    forbiddenBrowserField,
  );
}

for (const forbiddenRouteMarker of [
  "prisma.",
  "appraisalCycle.",
  "appraisalAssessment.",
  "appraisalReview.",
  "auditLog.",
  "TeacherAppraisal",
  "create({",
  "update({",
  "updateMany({",
  "upsert({",
  "delete({",
  "deleteMany({",
  "sendSms",
  "sendEmail",
  "appraisalNotification",
  "fetch(",
  "axios",
]) {
  assert(
    !source.route.includes(forbiddenRouteMarker),
    "Director direct-release route contains forbidden direct mutation/provider marker",
    forbiddenRouteMarker,
  );
}

for (const serviceMarker of [
  'releaseMode: "DIRECTOR_AUTHORED_DIRECT_RELEASE"',
  'requiredActorRole: "DISTRICT_DIRECTOR"',
  'requiredAssessorRole: "DISTRICT_DIRECTOR"',
  "exactAssessorAsReleaserRequired: true",
  "exactAssessorAssignmentAsReleaserAssignmentRequired: true",
  "reviewRowsRequired: false",
  "reviewRowsAllowed: false",
  "selfReviewAllowed: false",
  "initialRevisionOnly: true",
  'assertAppraisalCycleTransition("OPEN", "CLOSED")',
  'assertAppraisalCycleTransition("CLOSED", "UNDER_REVIEW")',
  'assertAppraisalCycleTransition("UNDER_REVIEW", "RELEASED")',
  "assessmentMutationAllowed: false",
  "scoreMutationAllowed: false",
  "commentMutationAllowed: false",
  "legacyTeacherAppraisalIncluded: false",
  "combinedWeightingDefined: false",
  "notificationsSeeded: false",
  "providerCallsAllowed: false",
  'outcome: "EXISTING_RELEASED"',
]) {
  assert(
    source.directRelease.includes(serviceMarker),
    "Direct-release service regression",
    serviceMarker,
  );
}

for (const forbiddenReviewMutation of [
  "appraisalReview.create",
  "appraisalReview.update",
  "appraisalReview.updateMany",
  'decision: "PENDING"',
  'decision: "ACCEPTED"',
]) {
  assert(
    !source.directRelease.includes(forbiddenReviewMutation),
    "Direct-release service must not fabricate or mutate review rows",
    forbiddenReviewMutation,
  );
}

assert(
  source.reviewedDecisionRoute.includes(
    "executeTeacherSupervisoryDirectorDecision",
  ) &&
    source.reviewedDecisionRoute.includes(
      'const ALLOWED_BODY_FIELDS = new Set(["action", "reason", "confirm"])',
    ) &&
    source.reviewedDecisionRoute.includes(
      'const ALLOWED_ACTIONS = new Set(["RETURN", "RELEASE"])',
    ),
  "Existing reviewed Director decision API contract drift",
);

assert(
  !source.reviewedDecisionRoute.includes(
    "executeTeacherSupervisoryDirectorDirectRelease",
  ) &&
    !source.route.includes("executeTeacherSupervisoryDirectorDecision") &&
    !source.route.includes("ALLOWED_ACTIONS"),
  "Reviewed Director decision and Director-authored direct release must remain separate APIs",
);

for (const readerMarker of [
  '"REVIEWED_DIRECTOR_RELEASE"',
  '"DIRECTOR_AUTHORED_DIRECT_RELEASE"',
  "reviewRowsPresent: false",
  "selfReviewPerformed: false",
]) {
  assert(
    source.releasedResult.includes(readerMarker),
    "Dual release-proof reader regression",
    readerMarker,
  );
}

console.log("");
console.log("=== N6-E5E3 GOVERNANCE TEACHER DIRECTOR-AUTHORED DIRECT RELEASE THIN API ===");
console.log("");
console.log("Endpoint                         : teacher-supervisory/{assessmentId}/direct-release POST");
console.log("Audience                         : District Director only");
console.log("Reviewed decision endpoint       : separate review-queue path preserved");
console.log("Assessment id                    : strict UUID");
console.log("Body                             : shared bounded JSON parser");
console.log("Allowed browser field            : confirm only");
console.log("Explicit confirmation            : required");
console.log("Actor identity                   : authenticated server context");
console.log("Actor role                       : authenticated server context + DD boundary");
console.log("Governance scope                 : authenticated scope passed to service");
console.log("Assessor/releaser assignment     : service resolved + revalidated");
console.log("Release mode                     : service-owned DIRECTOR_AUTHORED_DIRECT_RELEASE");
console.log("Review row fields                : absent from browser contract");
console.log("Evidence/proof hashes            : absent from browser contract");
console.log("Direct Prisma mutation in route  : absent");
console.log("Cycle mutation in route          : absent");
console.log("Assessment/score/comment mutation: absent");
console.log("AppraisalReview creation         : absent");
console.log("No-store/security response       : shared jsonNoStore/error helper");
console.log("Legacy TeacherAppraisal          : untouched");
console.log("Notifications/providers          : absent");
console.log("Database accessed                : source contract only");
console.log("");
console.log("RESULT: N6-E5E3 GOVERNANCE TEACHER DIRECTOR-AUTHORED DIRECT RELEASE THIN API GREEN");
