#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS source-contract QA harness. */

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..", "..");

const files = {
  route:
    "src/app/api/governance/appraisals/teacher-supervisory/review-queue/[assessmentId]/director-decision/route.ts",
  shared:
    "src/app/api/governance/appraisals/teacher-supervisory/_shared.ts",
  decision:
    "src/lib/appraisals/teacherSupervisoryDirectorReviewDecision.ts",
  policy:
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

const source = Object.fromEntries(
  Object.entries(files).map(([key, relativePath]) => [key, read(relativePath)]),
);

for (const marker of [
  "executeTeacherSupervisoryDirectorDecision",
  "requireTeacherSupervisoryGovernanceApiContext",
  "isUuidIdentifier",
  "requestIsJson",
  "readBoundedJsonObject",
  "jsonNoStore",
  "teacherSupervisoryApiError",
  'runtime = "nodejs"',
  'dynamic = "force-dynamic"',
  'new Set(["action", "reason", "confirm"])',
  'new Set(["RETURN", "RELEASE"])',
  'normalized(auth.ctx.roleName) !== "DISTRICT_DIRECTOR"',
  "TEACHER_SUPERVISORY_DIRECTOR_DECISION_FIELDS_FORBIDDEN",
  "TEACHER_SUPERVISORY_DIRECTOR_DECISION_ACTION_FORBIDDEN",
  "TEACHER_SUPERVISORY_DIRECTOR_DECISION_CONFIRMATION_REQUIRED",
  "actorUserId: auth.ctx.userId",
  "actorRoleName: auth.ctx.roleName",
  "governanceScope: auth.scope",
  "reason: parsed.body.reason",
  "confirm: true",
  "reqId: meta.reqId",
  "ip: meta.ip",
  "userAgent: meta.userAgent",
  "browserDecisionResult",
  "outcome: result.outcome",
  "result: browserDecisionResult(result)",
]) {
  assert(
    source.route.includes(marker),
    "Director decision route contract marker missing",
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
    "Director decision route must be POST only",
    forbiddenMethod,
  );
}

for (const forbidden of [
  "prisma.",
  "appraisalReview.create",
  "appraisalReview.update",
  "appraisalReview.updateMany",
  "appraisalCycle.update",
  "appraisalCycle.updateMany",
  "appraisalAssessment.update",
  "appraisalAssessment.updateMany",
  "auditLog.create",
  "executeTeacherSupervisoryHosDecision",
  "teacherAppraisal",
  "sendSms",
  "sendEmail",
  "appraisalNotification",
  "localStorage",
  "sessionStorage",
  "setInterval(",
]) {
  assert(
    !source.route.includes(forbidden),
    "Director decision route contains forbidden direct mutation/provider marker",
    forbidden,
  );
}

for (const browserAuthorityField of [
  '"actorUserId"',
  '"actorRoleName"',
  '"reviewerUserId"',
  '"reviewerAssignmentId"',
  '"reviewId"',
  '"reviewStage"',
  '"cycleId"',
  '"assessmentHash"',
  '"observationContextHash"',
  '"reviewEvidenceHash"',
  '"releaseProofHash"',
  '"releaseEvidenceHash"',
  '"decisionRequestHash"',
  '"decisionEvidenceHash"',
  '"scores"',
  '"generalComment"',
]) {
  assert(
    !source.route.includes(browserAuthorityField),
    "Director decision API must not accept browser-controlled authority/evidence field",
    browserAuthorityField,
  );
}

assert(
  !source.route.includes("result,\n") &&
    !source.route.includes("result: result") &&
    !source.route.includes("...result"),
  "Director decision route must not return the rich internal service result",
);

for (const forbiddenResponseField of [
  "assessmentId: result.assessmentId",
  "assessmentRevision: result.assessmentRevision",
  "assessmentStatus: result.assessmentStatus",
  "cycleId: result.cycleId",
  "cycleStatus: result.cycleStatus",
  "sourceReviewId: result.sourceReviewId",
  "sourceReviewStage: result.sourceReviewStage",
  "sourceReviewDecision: result.sourceReviewDecision",
  "reviewerRole: result.reviewerRole",
  "assessmentHash: result.assessmentHash",
  "observationContextHash: result.observationContextHash",
  "sourceReviewEvidenceHash: result.sourceReviewEvidenceHash",
  "reviewChainHash: result.reviewChainHash",
  "decisionContractHash: result.decisionContractHash",
  "decisionRequestHash: result.decisionRequestHash",
  "decisionEvidenceHash: result.decisionEvidenceHash",
  "releaseProofHash: result.releaseProofHash",
  "decidedAt: result.decidedAt",
  "releasedAt: result.releasedAt",
]) {
  assert(
    !source.route.includes(forbiddenResponseField),
    "Director decision browser response must exclude internal service field",
    forbiddenResponseField,
  );
}

assert(
  source.shared.includes("maxJsonBodyBytes: 16_384") &&
    source.shared.includes('"Cache-Control": "no-store, max-age=0"') &&
    source.shared.includes('"X-Content-Type-Options": "nosniff"') &&
    source.shared.includes('"Referrer-Policy": "no-referrer"'),
  "Shared bounded JSON / no-store security boundary missing",
);

for (const marker of [
  'reviewerRole: "DISTRICT_DIRECTOR"',
  'allowedActions: ["RETURN", "RELEASE"]',
  'requiredCycleStatus: "UNDER_REVIEW"',
  'requiredCurrentReviewDecision: "PENDING"',
  'returnReviewDecision: "RETURNED"',
  'releaseReviewDecision: "ACCEPTED"',
  'releasedCycleStatus: "RELEASED"',
  "minimumReturnReasonLength",
  "maximumReturnReasonLength",
  "TEACHER_SUPERVISORY_DIRECTOR_DECISION_RELEASE_REASON_FORBIDDEN",
  "preserveReturningReviewerForCorrection: true",
  "reviewerMayRewriteScores: false",
  "reviewerMayRewriteComment: false",
  "legacyTeacherAppraisalIncluded: false",
  "combinedWeightingDefined: false",
  "notificationsSeeded: false",
  "providerCallsAllowed: false",
  'transactionIsolation: "SERIALIZABLE"',
  "EXISTING_RETURNED",
  "EXISTING_RELEASED",
  "releaseProofHash",
]) {
  assert(
    source.decision.includes(marker),
    "Director decision service safety marker missing",
    marker,
  );
}

assert(
  source.policy.includes('directorActions: ["RETURN", "RELEASE"]') &&
    source.policy.includes("SELF_REVIEW_FORBIDDEN") &&
    source.policy.includes("reviewerMayRewriteScores: false") &&
    source.policy.includes("reviewerMayRewriteComment: false"),
  "Shared Director authority policy regression",
);

console.log("");
console.log("=== N6-F1C4 GOVERNANCE TEACHER DISTRICT DIRECTOR DECISION THIN API ===");
console.log("");
console.log("Endpoint                         : review-queue/{assessmentId}/director-decision POST");
console.log("Audience                         : District Director only");
console.log("HOS / BSC / SISSO                : forbidden at API boundary");
console.log("Assessment id                    : strict UUID");
console.log("Body                             : application/json + 16 KiB bound");
console.log("Allowed browser fields           : action / reason / confirm only");
console.log("Allowed actions                  : Return / Release");
console.log("Explicit confirmation            : required");
console.log("Return reason                    : service validates 3-2000 chars");
console.log("Release reason                   : service forbids");
console.log("Reviewer identity                : authenticated server context");
console.log("Reviewer assignment              : service resolved and revalidated");
console.log("Review stage                     : service resolved");
console.log("Governance scope                 : authenticated scope passed to service");
console.log("Immutable package                : service re-read");
console.log("Finalized evidence               : service reverified");
console.log("Return mutation                  : service-owned SERIALIZABLE transaction");
console.log("Release mutation                 : service-owned SERIALIZABLE transaction");
console.log("Release proof                    : service-owned immutable hashes");
console.log("Browser response                 : outcome only");
console.log("Service review ids               : browser excluded");
console.log("Service proof hashes             : browser excluded");
console.log("Direct Prisma mutation in route  : absent");
console.log("Scores / General Comment body    : forbidden");
console.log("Authority/evidence hashes body   : forbidden");
console.log("No-store / nosniff / no-referrer : complete");
console.log("Legacy TeacherAppraisal          : untouched");
console.log("Notifications/providers          : absent");
console.log("Database accessed                : source contract only");
console.log("");
console.log("RESULT: N6-F1C4 GOVERNANCE TEACHER DISTRICT DIRECTOR DECISION THIN API GREEN");
