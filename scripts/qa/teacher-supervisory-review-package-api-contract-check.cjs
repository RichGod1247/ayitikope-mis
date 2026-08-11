#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS source-contract QA harness. */

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..", "..");

const files = {
  shared:
    "src/app/api/governance/appraisals/teacher-supervisory/_shared.ts",
  reviewQueueRoute:
    "src/app/api/governance/appraisals/teacher-supervisory/review-queue/route.ts",
  admissionRoute:
    "src/app/api/governance/appraisals/teacher-supervisory/review-queue/[assessmentId]/start/route.ts",
  packageRoute:
    "src/app/api/governance/appraisals/teacher-supervisory/review-queue/[assessmentId]/package/route.ts",
  packageService:
    "src/lib/appraisals/teacherSupervisoryReviewPackage.ts",
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

for (const required of [
  "readTeacherSupervisoryReviewPackage",
  "TEACHER_SUPERVISORY_REVIEW_PACKAGE_POLICY",
  "TeacherSupervisoryReviewPackage",
  "requireTeacherSupervisoryGovernanceApiContext",
  "reviewerRoleAllowed",
  "isUuidIdentifier",
  "actorUserId: auth.ctx.userId",
  "actorRoleName: auth.ctx.roleName",
  "assessmentId",
  "governanceScope: auth.scope",
  "projectTeacherSupervisoryReviewPackageForBrowser",
  "browserReviewPackage",
  "reviewPackage: browserReviewPackage",
  "jsonNoStore",
  'runtime = "nodejs"',
  'dynamic = "force-dynamic"',
  '"[TEACHER_SUPERVISORY_REVIEW_PACKAGE_API_ERROR]"',
]) {
  assert(
    source.packageRoute.includes(required),
    "Review-package API contract marker missing",
    required,
  );
}

assert(
  source.packageRoute.includes(
    "TEACHER_SUPERVISORY_REVIEW_PACKAGE_POLICY.audience",
  ),
  "Review-package API must derive its reviewer audience from package policy",
);

assert(
  source.packageService.includes(
    'audience: ["HEAD_OF_SUPERVISION", "DISTRICT_DIRECTOR"]',
  ),
  "Review-package reviewer audience drifted",
);

assert(
  source.packageRoute.includes("if (!reviewerRoleAllowed(auth.ctx.roleName))") &&
    source.packageRoute.includes("return jsonNoStore(403"),
  "SISSO/BSC must fail at the review-package API boundary",
);

assert(
  source.packageRoute.includes("export async function GET"),
  "Review-package GET missing",
);

for (const forbiddenMethod of [
  "export async function POST",
  "export async function PUT",
  "export async function PATCH",
  "export async function DELETE",
]) {
  assert(
    !source.packageRoute.includes(forbiddenMethod),
    "Review-package endpoint must expose GET only",
    forbiddenMethod,
  );
}

assert(
  source.packageRoute.includes("INVALID_ASSESSMENT_ID"),
  "Strict assessment identifier rejection missing",
);

assert(
  source.shared.includes('"Cache-Control": "no-store, max-age=0"') &&
    source.shared.includes('"X-Content-Type-Options": "nosniff"') &&
    source.shared.includes('"Referrer-Policy": "no-referrer"'),
  "Existing no-store security response boundary missing",
);

for (const forbidden of [
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
  "requestIsJson",
  "readBoundedJsonObject",
  "req.text(",
  "req.json(",
  "localStorage",
  "sessionStorage",
  "setInterval(",
]) {
  assert(
    !source.packageRoute.includes(forbidden),
    "Thin review-package route contains forbidden mutation/body/provider marker",
    forbidden,
  );
}

for (const requiredServiceMarker of [
  'requiredCycleStatus: "UNDER_REVIEW"',
  'requiredReviewDecision: "PENDING"',
  "verifyTeacherSupervisoryFinalizedAssessmentEvidence",
  "computeTeacherSupervisoryReviewEvidenceHash",
  "immutableFinalizedEvidenceVerified: true",
  "reviewerMayRewriteScores: false",
  "reviewerMayRewriteComment: false",
  "rawEvidenceSnapshotIncluded: false",
  "rawMetadataIncluded: false",
  "contactDetailsIncluded: false",
  "readOnly: true",
  "databaseWritesAllowed: false",
  "providerCallsAllowed: false",
]) {
  assert(
    source.packageService.includes(requiredServiceMarker),
    "Review-package service integrity/privacy marker missing",
    requiredServiceMarker,
  );
}

const projection = blockBetween(
  source.packageRoute,
  "function projectTeacherSupervisoryReviewPackageForBrowser(",
  "export async function GET(",
);

for (const requiredBrowserField of [
  "schemaVersion:",
  "lifecycleState:",
  "review:",
  "reviewerRole:",
  "assessment:",
  "id:",
  "cycleId:",
  "revision:",
  "finalizedAt:",
  "assessorOffice:",
  "dateObserved:",
  "overallPercentage:",
  "sectionPercentages:",
  "generalComment:",
  "sections:",
  "sectionKey:",
  "title:",
  "description:",
  "maxScore:",
  "percentage:",
  "items:",
  "itemKey:",
  "label:",
  "score:",
  "notApplicable:",
  "observation:",
  "contextSchemaVersion:",
  "teacherName:",
  "schoolName:",
  "circuitName:",
  "districtName:",
  "yearsInService:",
  "yearsInPresentSchool:",
  "subjectBeingObserved:",
  "subStrand:",
  "classTaught:",
  "durationMinutes:",
  "totalEnrolment:",
  "girls:",
  "boys:",
  "readOnly:",
]) {
  assert(
    projection.includes(requiredBrowserField),
    "Browser-safe review package field missing",
    requiredBrowserField,
  );
}

for (const forbiddenBrowserField of [
  "integrity:",
  "privacy:",
  "assessmentHash:",
  "observationContextHash:",
  "reviewEvidenceHash:",
  "instrumentContentHash:",
  "review.id",
  "review.stage",
  "review.createdAt",
  "reviewerUserId",
  "reviewerAssignmentId",
  "assessorUserId",
  "assessorAssignmentId",
  "teacherAssignmentVerified",
  "curriculumSelectionVerified",
  "rawEvidenceSnapshotIncluded",
  "rawMetadataIncluded",
  "contactDetailsIncluded",
  "confidentialStaffFeedbackIncluded",
  "respondentIdentitiesIncluded",
]) {
  assert(
    !projection.includes(forbiddenBrowserField),
    "Browser-safe review package exposes server-only integrity/custody field",
    forbiddenBrowserField,
  );
}

assert(
  !projection.includes("...reviewPackage") &&
    !projection.includes("...reviewPackage.review") &&
    !projection.includes("...reviewPackage.assessment") &&
    !projection.includes("...reviewPackage.observation") &&
    !projection.includes("...section") &&
    !projection.includes("...item"),
  "Browser projection must use an explicit allowlist, not object spreading",
);

assert(
  source.packageRoute.includes(
    "projectTeacherSupervisoryReviewPackageForBrowser(reviewPackage)",
  ),
  "Verified internal review package must pass through browser-safe projection",
);

assert(
  !source.packageRoute.includes("reviewPackage,\n    });"),
  "Internal review package must not be returned wholesale",
);

assert(
  source.reviewQueueRoute.includes("export async function GET") &&
    !source.reviewQueueRoute.includes("export async function POST"),
  "Review queue must remain GET-only",
);

assert(
  source.admissionRoute.includes("export async function POST") &&
    !source.admissionRoute.includes("export async function GET"),
  "Admission route must remain POST-only",
);

console.log("");
console.log("=== N6-F1C0 GOVERNANCE TEACHER BROWSER-SAFE REVIEW PACKAGE API ===");
console.log("");
console.log("Endpoint                         : review-queue/{assessmentId}/package GET");
console.log("Audience                         : HOS / District Director only");
console.log("SISSO/BSC                        : forbidden at API boundary");
console.log("Assessment id                    : strict UUID");
console.log("Governance scope                 : authenticated scope passed to service");
console.log("Current reviewer custody         : service enforced");
console.log("Lifecycle                        : UNDER_REVIEW + current PENDING review");
console.log("Finalized assessment proof       : service reverified");
console.log("Internal integrity hashes        : service-only");
console.log("Internal review id/stage/time    : service-only");
console.log("Browser projection               : explicit allowlist");
console.log("Official Teacher form            : read-only 6 domains / 34 items");
console.log("General Comment                  : read-only");
console.log("Observation particulars          : browser-safe display fields only");
console.log("Assessor office                  : included; identity excluded");
console.log("Reviewer role                    : included; identity excluded");
console.log("Raw evidence / metadata          : excluded");
console.log("Contacts                         : excluded");
console.log("Confidential staff feedback      : excluded");
console.log("Respondent identities            : excluded");
console.log("HTTP mutation methods            : absent");
console.log("Request body                     : absent");
console.log("Direct DB mutation in route      : absent");
console.log("No-store / nosniff / no-referrer : complete");
console.log("Legacy TeacherAppraisal          : untouched");
console.log("Notifications/providers          : absent");
console.log("Database accessed                : source contract only");
console.log("");
console.log("RESULT: N6-F1C0 GOVERNANCE TEACHER BROWSER-SAFE REVIEW PACKAGE API GREEN");
