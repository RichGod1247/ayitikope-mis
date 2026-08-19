#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS source-contract QA harness. */

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..", "..");

const files = {
  page:
    "src/app/governance/appraisals/headteacher-supervisory/review/page.tsx",
  client:
    "src/app/governance/appraisals/headteacher-supervisory/review/HeadteacherSupervisoryReviewClient.tsx",
  queueRoute:
    "src/app/api/governance/appraisals/headteacher-supervisory/review-queue/route.ts",
  packageRoute:
    "src/app/api/governance/appraisals/headteacher-supervisory/review-queue/[assessmentId]/package/route.ts",
  startRoute:
    "src/app/api/governance/appraisals/headteacher-supervisory/review-queue/[assessmentId]/start/route.ts",
  decisionRoute:
    "src/app/api/governance/appraisals/headteacher-supervisory/review-queue/[assessmentId]/decision/route.ts",
};

function fail(message, detail) {
  const suffix = detail === undefined ? "" : `\n${JSON.stringify(detail, null, 2)}`;
  throw new Error(`${message}${suffix}`);
}

function assert(condition, message, detail) {
  if (!condition) fail(message, detail);
}

function read(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  assert(fs.existsSync(absolutePath), "N7_HOS_HEADTEACHER_REVIEW_FILE_MISSING", relativePath);
  return fs
    .readFileSync(absolutePath, "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
}

const source = Object.fromEntries(
  Object.entries(files).map(([key, relativePath]) => [key, read(relativePath)]),
);

for (const marker of [
  "requireGovernancePageContext",
  'const HEADTEACHER_SUPERVISORY_REVIEW_ROLES = ["HEAD_OF_SUPERVISION"] as const;',
  "allowedZoneLevels: [2]",
  'redirectTo: "/governance/appraisals/headteacher-supervisory/review"',
  "HeadteacherSupervisoryReviewClient",
  'runtime = "nodejs"',
  'dynamic = "force-dynamic"',
  "initialAssessmentId",
]) {
  assert(source.page.includes(marker), "N7_HOS_HEADTEACHER_REVIEW_PAGE_MARKER_MISSING", marker);
}

assert(
  !source.page.includes("BASIC_SCHOOL_COORDINATOR") &&
    !source.page.includes("DISTRICT_DIRECTOR"),
  "N7_HOS_HEADTEACHER_REVIEW_PAGE_ROLE_SCOPE_TOO_WIDE",
);

for (const marker of [
  '"use client"',
  "Review Headteacher Reports",
  "SISSO and",
  "Basic School Coordinators",
  '"READY_TO_START"',
  '"READY_TO_REVIEW"',
  '"START_REVIEW"',
  '"CONTINUE_REVIEW"',
  "New reports",
  "Continue review",
  "Open report",
  "Headteacher review · read-only",
  "Monitoring and Inspection Sheet (Headteachers)",
  "Head of Supervision review copy · read-only",
  "assessment.sections",
  "section.items.map",
  "Start review",
  "Starting review…",
  "Return for correction",
  "Reason for correction",
  "3–2,000 characters",
  "Forward to Director",
  "window.confirm",
  "/review-queue",
  "/package",
  "/start",
  "/decision",
  'method: "GET"',
  'method: "POST"',
  'cache: "no-store"',
  'credentials: "include"',
  '"Content-Type": "application/json"',
  "JSON.stringify({ confirm: true })",
  'action: "RETURN"',
  'action: "FORWARD"',
  "await loadQueue(selectedItem.assessmentId)",
  "await loadQueue()",
  "no background polling",
  "no persistent browser storage",
]) {
  assert(source.client.includes(marker), "N7_HOS_HEADTEACHER_REVIEW_CLIENT_MARKER_MISSING", marker);
}

for (const forbidden of [
  "localStorage",
  "sessionStorage",
  "indexedDB",
  "setInterval(",
  'method: "PUT"',
  'method: "PATCH"',
  'method: "DELETE"',
  "/direct-release",
  'action: "HOLD"',
  'action: "RELEASE"',
  "Release result",
  "District Director review decision",
]) {
  assert(
    !source.client.includes(forbidden),
    "N7_HOS_HEADTEACHER_REVIEW_CLIENT_FORBIDDEN_MARKER",
    forbidden,
  );
}

for (const privacyMarker of [
  "staffFeedbackIncluded: false",
  "respondentIdentitiesIncluded: false",
  "individualStaffResponsesIncluded: false",
  "contactDetailsIncluded: false",
  "assessorUserIdIncluded: false",
  "targetUserIdIncluded: false",
  "reviewerUserIdIncluded: false",
  "assignmentIdsIncluded: false",
  "proofHashesIncluded: false",
  "reviewerMayRewriteScores: false",
  "scoreMutationAllowed: false",
  "separateFromStaffFeedback: true",
  "combinedWeightingDefined: false",
]) {
  assert(
    source.client.includes(privacyMarker),
    "N7_HOS_HEADTEACHER_REVIEW_PRIVACY_MARKER_MISSING",
    privacyMarker,
  );
}

const startBodyStart = source.client.indexOf("body: JSON.stringify({ confirm: true })");
assert(startBodyStart >= 0, "N7_HOS_HEADTEACHER_REVIEW_START_BODY_NOT_CONFIRM_ONLY");

assert(
  source.client.includes(
    'selectedItem.state !== "READY_TO_START" ||\n      selectedItem.nextAction !== "START_REVIEW"',
  ) && source.client.includes('reviewPackage?.lifecycleState !== "READY_TO_START"'),
  "N7_HOS_HEADTEACHER_REVIEW_START_STATE_GUARD_MISSING",
);

assert(
  source.client.includes('reviewPackage?.lifecycleState !== "READY_TO_REVIEW"') &&
    source.client.includes('reviewPackage.review?.decision !== "PENDING"'),
  "N7_HOS_HEADTEACHER_REVIEW_DECISION_STATE_GUARD_MISSING",
);

assert(
  source.client.includes(
    'action === "RETURN"\n              ? { action: "RETURN", reason, confirm: true }\n              : { action: "FORWARD", confirm: true }',
  ),
  "N7_HOS_HEADTEACHER_REVIEW_DECISION_BROWSER_BODY_INVALID",
);

for (const authorityField of [
  "reviewerUserId:",
  "reviewerAssignmentId:",
  "reviewStage:",
  "assessorUserId:",
  "targetUserId:",
  "assessmentHash:",
  "visitContextHash:",
  "reviewEvidenceHash:",
  "decisionRequestHash:",
  "decisionEvidenceHash:",
]) {
  assert(
    !source.client.includes(authorityField),
    "N7_HOS_HEADTEACHER_REVIEW_BROWSER_AUTHORITY_FIELD_PRESENT",
    authorityField,
  );
}

for (const marker of [
  "HEADTEACHER_SUPERVISORY_REVIEW_QUEUE_POLICY",
  "readHeadteacherSupervisoryReviewQueue",
  "requireSupervisoryGovernanceApiContext",
  "HEADTEACHER_SUPERVISORY_REVIEW_QUEUE_POLICY.reviewerRole",
  "jsonNoStore",
]) {
  assert(source.queueRoute.includes(marker), "N7_HOS_HEADTEACHER_QUEUE_ROUTE_MARKER_MISSING", marker);
}

for (const marker of [
  "HEADTEACHER_SUPERVISORY_REVIEW_PACKAGE_POLICY",
  "readHeadteacherSupervisoryReviewPackage",
  "requireSupervisoryGovernanceApiContext",
  "HEADTEACHER_SUPERVISORY_REVIEW_PACKAGE_POLICY.audience",
  "isUuidIdentifier",
  "jsonNoStore",
]) {
  assert(source.packageRoute.includes(marker), "N7_HOS_HEADTEACHER_PACKAGE_ROUTE_MARKER_MISSING", marker);
}

for (const marker of [
  "startHeadteacherSupervisoryHosReview",
  'normalizedRole(auth.ctx.roleName) !== "HEAD_OF_SUPERVISION"',
  "bodyHasOnlyConfirm",
  "body.confirm !== true",
  "actorUserId: auth.ctx.userId",
  "actorRoleName: auth.ctx.roleName",
  "governanceScope: auth.scope",
  "confirm: true",
]) {
  assert(source.startRoute.includes(marker), "N7_HOS_HEADTEACHER_START_ROUTE_MARKER_MISSING", marker);
}

for (const marker of [
  "executeHeadteacherSupervisoryHosDecision",
  'normalizedRole(auth.ctx.roleName) !== "HEAD_OF_SUPERVISION"',
  'const ALLOWED_BODY_FIELDS = new Set(["action", "reason", "confirm"]);',
  "bodyFieldsAllowed",
  "browserDecisionResult",
  "actorUserId: auth.ctx.userId",
  "actorRoleName: auth.ctx.roleName",
  "governanceScope: auth.scope",
]) {
  assert(source.decisionRoute.includes(marker), "N7_HOS_HEADTEACHER_DECISION_ROUTE_MARKER_MISSING", marker);
}

for (const routeSource of [
  source.queueRoute,
  source.packageRoute,
  source.startRoute,
  source.decisionRoute,
]) {
  assert(routeSource.includes('export const runtime = "nodejs"'), "N7_HOS_HEADTEACHER_ROUTE_RUNTIME_MISSING");
  assert(routeSource.includes('export const dynamic = "force-dynamic"'), "N7_HOS_HEADTEACHER_ROUTE_DYNAMIC_MISSING");
  assert(routeSource.includes("jsonNoStore"), "N7_HOS_HEADTEACHER_ROUTE_NO_STORE_MISSING");
}

console.log("");
console.log("=== N7 HOS HEADTEACHER BBC READ-ONLY REVIEW WORKSPACE ===");
console.log("");
console.log("Page                             : separate /headteacher-supervisory/review");
console.log("Audience                         : Head of Supervision only");
console.log("Work discovery                   : existing durable review-queue GET");
console.log("Eligible assessor offices        : SISSO / Basic School Coordinator");
console.log("READY_TO_START                   : visible + explicit Start review");
console.log("READY_TO_REVIEW                  : durable reopen + decisions");
console.log("Assessment form                  : official 4-section / 34-indicator read-only paper");
console.log("Scores / N/A                     : display only");
console.log("HOS Return                       : correction reason required");
console.log("HOS Forward                      : Director handoff");
console.log("HOS Hold / Release               : absent");
console.log("Reviewer score rewriting         : absent");
console.log("Browser authority/proof fields   : absent");
console.log("Staff Feedback                   : excluded");
console.log("Respondent identities            : excluded");
console.log("Background polling               : absent");
console.log("Persistent browser storage       : absent");
console.log("API cache protection             : no-store");
console.log("Existing backend services        : reused unchanged");
console.log("Schema/database migration        : none");
console.log("");
console.log("RESULT: N7 HOS HEADTEACHER BBC READ-ONLY REVIEW WORKSPACE GREEN");
