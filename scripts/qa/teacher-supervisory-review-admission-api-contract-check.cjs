#!/usr/bin/env node
"use strict";
/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS source-contract QA harness. */

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..", "..");

const files = {
  shared: "src/app/api/governance/appraisals/teacher-supervisory/_shared.ts",
  reviewQueueRoute:
    "src/app/api/governance/appraisals/teacher-supervisory/review-queue/route.ts",
  admissionRoute:
    "src/app/api/governance/appraisals/teacher-supervisory/review-queue/[assessmentId]/start/route.ts",
  admissionService:
    "src/lib/appraisals/teacherSupervisoryReviewAdmission.ts",
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

for (const required of [
  "startTeacherSupervisoryReviewAdmission",
  "TEACHER_SUPERVISORY_REVIEW_POLICY",
  "requireTeacherSupervisoryGovernanceApiContext",
  "reviewerRoleAllowed",
  "isUuidIdentifier",
  "requestIsJson",
  "readBoundedJsonObject",
  "confirmOnlyBody",
  "parsed.body.confirm !== true",
  "actorUserId: auth.ctx.userId",
  "actorRoleName: auth.ctx.roleName",
  "governanceScope: auth.scope",
  "reqId: meta.reqId",
  "ip: meta.ip",
  "userAgent: meta.userAgent",
  'result.outcome === "STARTED" ? 201 : 200',
  "jsonNoStore",
  'runtime = "nodejs"',
  'dynamic = "force-dynamic"',
  '"[TEACHER_SUPERVISORY_REVIEW_ADMISSION_API_ERROR]"',
]) {
  assert(
    source.admissionRoute.includes(required),
    "Admission API contract marker missing",
    required,
  );
}

assert(
  source.admissionRoute.includes(
    "TEACHER_SUPERVISORY_REVIEW_POLICY.reviewerRoles",
  ),
  "Admission API must derive narrow reviewer audience from review policy",
);

assert(
  source.reviewPolicy.includes(
    'reviewerRoles: ["HEAD_OF_SUPERVISION", "DISTRICT_DIRECTOR"]',
  ),
  "Review policy reviewer audience drifted",
);

assert(
  source.admissionRoute.includes(
    "if (!reviewerRoleAllowed(auth.ctx.roleName))",
  ) && source.admissionRoute.includes("return jsonNoStore(403"),
  "SISSO/BSC must fail at the admission API boundary",
);

assert(
  source.admissionRoute.includes("export async function POST"),
  "Review admission POST missing",
);

for (const forbiddenMethod of [
  "export async function GET",
  "export async function PUT",
  "export async function PATCH",
  "export async function DELETE",
]) {
  assert(
    !source.admissionRoute.includes(forbiddenMethod),
    "Admission endpoint must expose POST only",
    forbiddenMethod,
  );
}

assert(
  source.admissionRoute.includes(
    '"TEACHER_SUPERVISORY_REVIEW_ADMISSION_CONFIRM_ONLY"',
  ),
  "Admission API must reject browser-supplied review mutation fields",
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
  "scores",
  "generalComment",
  "note",
]) {
  assert(
    !source.admissionRoute.includes(`parsed.body.${browserControlledField}`),
    "Admission API must not trust browser-controlled review/evidence fields",
    browserControlledField,
  );
}

assert(
  source.shared.includes("maxJsonBodyBytes: 16_384") &&
    source.shared.includes('"Cache-Control": "no-store, max-age=0"') &&
    source.shared.includes('"X-Content-Type-Options": "nosniff"'),
  "Existing bounded JSON / no-store / nosniff boundary missing",
);

assert(
  source.admissionService.includes(
    "verifyTeacherSupervisoryFinalizedAssessmentEvidence",
  ),
  "Admission service must reverify immutable finalized evidence",
);

assert(
  source.admissionService.includes(
    'assertAppraisalCycleTransition("OPEN", "CLOSED")',
  ) &&
    source.admissionService.includes(
      'assertAppraisalCycleTransition("CLOSED", "UNDER_REVIEW")',
    ),
  "Admission service legal cycle transition chain missing",
);

assert(
  source.admissionService.includes('decision: "PENDING"') &&
    source.admissionService.includes("reviewEvidenceHash"),
  "PENDING review + review evidence anchor missing",
);

for (const forbidden of [
  "appraisalReview.create",
  "appraisalCycle.update",
  "appraisalCycle.updateMany",
  "appraisalAssessment.update",
  "appraisalAssessmentScore",
  "teacherAppraisal",
  "sendSms",
  "sendEmail",
  "appraisalNotification",
  "localStorage",
  "sessionStorage",
  "setInterval(",
]) {
  assert(
    !source.admissionRoute.includes(forbidden),
    "Thin admission route contains forbidden direct service/data mutation marker",
    forbidden,
  );
}

assert(
  source.reviewQueueRoute.includes("export async function GET") &&
    !source.reviewQueueRoute.includes("export async function POST"),
  "Read-only review queue doorway must remain GET-only",
);

console.log("");
console.log("=== N6-E1C4 GOVERNANCE TEACHER REVIEW ADMISSION THIN API ===");
console.log("");
console.log("Endpoint                         : review-queue/{assessmentId}/start POST");
console.log("Audience                         : HOS / District Director only");
console.log("SISSO/BSC                        : forbidden at API boundary");
console.log("Assessment id                    : strict UUID");
console.log("Body                             : application/json + 16 KiB bound");
console.log("Browser body                     : confirm only");
console.log("Explicit confirmation            : required");
console.log("Reviewer identity                : authenticated server context");
console.log("Reviewer assignment              : server resolved");
console.log("Review stage                     : server resolved from review policy");
console.log("Governance scope                 : verified scope passed to service");
console.log("Immutable finalized evidence     : service reverified");
console.log("Cycle ingress                    : service-owned OPEN -> CLOSED -> UNDER_REVIEW");
console.log("Initial review                   : service-owned PENDING");
console.log("STARTED response                 : 201");
console.log("Idempotent EXISTING_REVIEW       : 200");
console.log("Direct DB mutation in route      : absent");
console.log("Scores / General Comment body    : forbidden");
console.log("Review note / decision body      : forbidden");
console.log("No-store / nosniff               : complete");
console.log("Legacy TeacherAppraisal          : untouched");
console.log("Notifications/providers          : absent");
console.log("Database accessed                : source contract only");
console.log("");
console.log("RESULT: N6-E1C4 GOVERNANCE TEACHER REVIEW ADMISSION THIN API GREEN");
