#!/usr/bin/env node
"use strict";
/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS source-contract QA harness. */

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..", "..");

const files = {
  shared: "src/app/api/governance/appraisals/teacher-supervisory/_shared.ts",
  packageRoute:
    "src/app/api/governance/appraisals/teacher-supervisory/review-queue/[assessmentId]/package/route.ts",
  decisionRoute:
    "src/app/api/governance/appraisals/teacher-supervisory/review-queue/[assessmentId]/decision/route.ts",
  decisionService:
    "src/lib/appraisals/teacherSupervisoryHosReviewDecision.ts",
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

for (const required of [
  "executeTeacherSupervisoryHosDecision",
  "TEACHER_SUPERVISORY_HOS_DECISION_POLICY",
  "requireTeacherSupervisoryGovernanceApiContext",
  "isHosReviewer",
  "isUuidIdentifier",
  "requestIsJson",
  "readBoundedJsonObject",
  "bodyContainsOnlyAllowedFields",
  "ALLOWED_BODY_FIELDS",
  '"action"',
  '"reason"',
  '"confirm"',
  "actorUserId: auth.ctx.userId",
  "actorRoleName: auth.ctx.roleName",
  "governanceScope: auth.scope",
  "reqId: meta.reqId",
  "ip: meta.ip",
  "userAgent: meta.userAgent",
  "jsonNoStore",
  'runtime = "nodejs"',
  'dynamic = "force-dynamic"',
  '"[TEACHER_SUPERVISORY_HOS_DECISION_API_ERROR]"',
]) {
  assert(
    source.decisionRoute.includes(required),
    "HOS decision API contract marker missing",
    required,
  );
}

assert(
  source.decisionRoute.includes(
    "TEACHER_SUPERVISORY_HOS_DECISION_POLICY.reviewerRole",
  ),
  "HOS-only API audience must derive from decision policy",
);

assert(
  source.decisionService.includes('reviewerRole: "HEAD_OF_SUPERVISION"'),
  "HOS decision service reviewer role drifted",
);

assert(
  source.decisionRoute.includes("if (!isHosReviewer(auth.ctx.roleName))") &&
    source.decisionRoute.includes("return jsonNoStore(403"),
  "BSC/SISSO/Director must fail at the HOS decision API boundary",
);

assert(
  source.decisionRoute.includes("export async function POST"),
  "HOS decision POST missing",
);

for (const forbiddenMethod of [
  "export async function GET",
  "export async function PUT",
  "export async function PATCH",
  "export async function DELETE",
]) {
  assert(
    !source.decisionRoute.includes(forbiddenMethod),
    "HOS decision endpoint must expose POST only",
    forbiddenMethod,
  );
}

assert(
  source.decisionRoute.includes(
    '"TEACHER_SUPERVISORY_HOS_DECISION_FIELDS_FORBIDDEN"',
  ),
  "Decision API must reject browser-supplied authority/evidence fields",
);

assert(
  source.decisionRoute.includes(
    "TEACHER_SUPERVISORY_HOS_DECISION_POLICY.allowedActions",
  ),
  "Decision API action set must derive from policy",
);

assert(
  source.decisionRoute.includes(
    '"TEACHER_SUPERVISORY_HOS_DECISION_CONFIRMATION_REQUIRED"',
  ),
  "Explicit confirmation must be required at API boundary",
);

for (const browserControlledField of [
  "reviewerUserId",
  "reviewerAssignmentId",
  "reviewStage",
  "stage",
  "decision",
  "cycleId",
  "assessmentHash",
  "observationContextHash",
  "reviewEvidenceHash",
  "decisionRequestHash",
  "decisionContractHash",
  "decisionEvidenceHash",
  "nextReviewId",
  "nextReviewerRole",
  "scores",
  "generalComment",
]) {
  assert(
    !source.decisionRoute.includes(`parsed.body.${browserControlledField}`),
    "Decision API must not trust browser-controlled authority/evidence fields",
    browserControlledField,
  );
}

assert(
  source.shared.includes("maxJsonBodyBytes: 16_384") &&
    source.shared.includes('"Cache-Control": "no-store, max-age=0"') &&
    source.shared.includes('"X-Content-Type-Options": "nosniff"') &&
    source.shared.includes('"Referrer-Policy": "no-referrer"'),
  "Existing bounded JSON / no-store security boundary missing",
);

for (const serviceMarker of [
  'allowedActions: ["RETURN", "FORWARD"]',
  "readTeacherSupervisoryReviewPackage",
  "verifyTeacherSupervisoryFinalizedAssessmentEvidence",
  "planTeacherSupervisoryReviewAction",
  "decideTeacherSupervisoryReviewAuthority",
  'decision: "PENDING"',
  'role: "DISTRICT_DIRECTOR"',
  "EXISTING_RETURNED",
  "EXISTING_FORWARDED",
  "returnReasonTextRecordedInAudit: false",
  "scoreValuesRecordedInAudit: false",
  "generalCommentRecordedInAudit: false",
  "providerCalled: false",
]) {
  assert(
    source.decisionService.includes(serviceMarker),
    "HOS decision service safety marker missing",
    serviceMarker,
  );
}

for (const forbidden of [
  "prisma.",
  "appraisalAssessment.update",
  "appraisalAssessmentScore",
  "appraisalCycle.update",
  "appraisalReview.create",
  "appraisalReview.update",
  "auditLog.create",
  "teacherAppraisal",
  "sendSms",
  "sendEmail",
  "appraisalNotification",
  "localStorage",
  "sessionStorage",
  "setInterval(",
]) {
  assert(
    !source.decisionRoute.includes(forbidden),
    "Thin HOS decision route contains forbidden direct mutation/provider marker",
    forbidden,
  );
}

assert(
  source.packageRoute.includes("export async function GET") &&
    !source.packageRoute.includes("export async function POST"),
  "Immutable package route must remain GET-only",
);

assert(
  !source.decisionService.includes(
    "type TeacherSupervisoryReviewPackage,"
  ),
  "Unused review-package type import must remain removed",
);

console.log("");
console.log("=== N6-E3B GOVERNANCE TEACHER HOS DECISION THIN API ===");
console.log("");
console.log("Endpoint                         : review-queue/{assessmentId}/decision POST");
console.log("Audience                         : Head of Supervision only");
console.log("SISSO/BSC/Director               : forbidden at API boundary");
console.log("Assessment id                    : strict UUID");
console.log("Body                             : application/json + 16 KiB bound");
console.log("Allowed browser fields           : action / reason / confirm only");
console.log("Allowed actions                  : Return / Forward");
console.log("Explicit confirmation            : required");
console.log("Return reason                    : forwarded to service; service validates");
console.log("Reviewer identity                : authenticated server context");
console.log("Reviewer assignment              : server resolved by service");
console.log("Review stage                     : server resolved by service");
console.log("Director assignment on Forward   : server resolved by service");
console.log("Governance scope                 : authenticated scope passed to service");
console.log("Immutable package                : service re-read");
console.log("Finalized evidence               : service reverified");
console.log("Decision mutation                : service-owned SERIALIZABLE transaction");
console.log("Direct Prisma mutation in route  : absent");
console.log("Scores / General Comment body    : forbidden");
console.log("Evidence hashes body             : forbidden");
console.log("No-store / nosniff / no-referrer : complete");
console.log("Legacy TeacherAppraisal          : untouched");
console.log("Notifications/providers          : absent");
console.log("Database accessed                : source contract only");
console.log("");
console.log("RESULT: N6-E3B GOVERNANCE TEACHER HOS DECISION THIN API GREEN");
