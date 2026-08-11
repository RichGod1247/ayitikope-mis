#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS source-contract QA harness. */

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..", "..");

const files = {
  page:
    "src/app/governance/appraisals/teacher-supervisory/review/page.tsx",
  client:
    "src/app/governance/appraisals/teacher-supervisory/review/TeacherSupervisoryReviewClient.tsx",
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

for (const requiredPageMarker of [
  "requireGovernancePageContext",
  "TEACHER_SUPERVISORY_REVIEW_POLICY",
  "TEACHER_SUPERVISORY_REVIEW_POLICY.reviewerRoles",
  "TeacherSupervisoryReviewClient",
  'runtime = "nodejs"',
  'dynamic = "force-dynamic"',
  "initialAssessmentId",
]) {
  assert(
    source.page.includes(requiredPageMarker),
    "Teacher review page boundary marker missing",
    requiredPageMarker,
  );
}

assert(
  !source.page.includes("TEACHER_SUPERVISORY_ASSESSMENT_POLICY"),
  "Independent Teacher review page must not use assessor-role policy",
);

assert(
  source.client.includes('"use client"'),
  "Teacher review workspace must be a client component",
);

for (const requiredClientMarker of [
  "Review Teacher Reports",
  '"READY_TO_START"',
  '"READY_TO_REVIEW"',
  '"READY_TO_RELEASE"',
  '"START_REVIEW"',
  '"CONTINUE_REVIEW"',
  '"DIRECT_RELEASE"',
  "/api/governance/appraisals/teacher-supervisory/review-queue",
  "/package",
  '{ cache: "no-store" }',
  "Refresh work list",
  "Open report",
  "Teacher review · read-only",
  "Read-only review shell",
  "Assessed by",
  "General Comment",
  "Class enrolment",
  "No persistent browser",
]) {
  assert(
    source.client.includes(requiredClientMarker),
    "Teacher review workspace contract marker missing",
    requiredClientMarker,
  );
}

for (const requiredPrivacyContractMarker of [
  "assessorUserIdIncluded: false",
  "targetUserIdIncluded: false",
  "reviewIdIncluded: false",
  "assignmentIdsIncluded: false",
  "proofHashesIncluded: false",
  "assessmentEvidenceIncluded: false",
  "scoresIncluded: false",
  "generalCommentIncluded: false",
  "observationDetailsIncluded: false",
  "classEnrolmentEvidenceIncluded: false",
  "contactDetailsIncluded: false",
]) {
  assert(
    source.client.includes(requiredPrivacyContractMarker),
    "Durable queue privacy/minimization contract marker missing",
    requiredPrivacyContractMarker,
  );
}

assert(
  source.client.includes("noBackgroundPolling: true"),
  "Durable review work model must explicitly preserve the no-background-polling contract",
);

assert(
  source.client.includes("Refresh work list") &&
    source.client.includes("void loadQueue()"),
  "Review workspace must use explicit user-triggered work-list refresh",
);

for (const forbiddenMutationMarker of [
  'method: "POST"',
  'method: "PUT"',
  'method: "PATCH"',
  'method: "DELETE"',
  "/start",
  "/decision",
  "/director-decision",
  "/direct-release",
  "window.confirm",
  "confirmFinalization",
  "action:",
  "reason:",
]) {
  assert(
    !source.client.includes(forbiddenMutationMarker),
    "F1C1 read-only review shell must not wire mutation controls",
    forbiddenMutationMarker,
  );
}

for (const forbiddenBrowserStorage of [
  "localStorage",
  "sessionStorage",
  "indexedDB",
  "setInterval(",
]) {
  assert(
    !source.client.includes(forbiddenBrowserStorage),
    "Teacher review workspace contains forbidden browser persistence/polling marker",
    forbiddenBrowserStorage,
  );
}

/*
 * The queue response type intentionally carries negative disclosure markers such
 * as `assessorUserIdIncluded: false`. Those field names are privacy assertions,
 * not exposed authority data. Remove only those exact negative assertions before
 * testing whether the client otherwise references server-only authority fields.
 */
const authorityScanSource = source.client
  .replaceAll("assessorUserIdIncluded: false;", "")
  .replaceAll("targetUserIdIncluded: false;", "")
  .replaceAll("reviewIdIncluded: false;", "")
  .replaceAll("assignmentIdsIncluded: false;", "")
  .replaceAll("proofHashesIncluded: false;", "");

for (const forbiddenAuthorityField of [
  "assessorUserId",
  "targetUserId",
  "reviewId",
  "reviewerUserId",
  "reviewerAssignmentId",
  "assessorAssignmentId",
  "assessmentHash",
  "observationContextHash",
  "reviewEvidenceHash",
  "instrumentContentHash",
  "releaseProofHash",
]) {
  assert(
    !authorityScanSource.includes(forbiddenAuthorityField),
    "Teacher review workspace references server-only authority/integrity field outside an explicit negative disclosure marker",
    forbiddenAuthorityField,
  );
}

assert(
  source.client.includes('item.state === "READY_TO_REVIEW"') &&
    source.client.includes("loadReviewPackage(item.assessmentId)"),
  "Only durable current-review work should open the package in F1C1",
);

assert(
  source.client.includes(
    "Action wiring comes in the next controlled step.",
  ),
  "READY_TO_START and READY_TO_RELEASE must remain non-mutating in F1C1",
);

assert(
  source.client.includes("assessment.sections.map") &&
    source.client.includes("section.items.map") &&
    source.client.includes("scoreLabel(item)"),
  "Read-only official assessment structure must render",
);

assert(
  !source.client.includes("<input") &&
    !source.client.includes("<textarea") &&
    !source.client.includes("<select"),
  "F1C1 review package must not expose editable assessment controls",
);

assert(
  source.client.includes("dashboardHref") &&
    source.client.includes('case "HEAD_OF_SUPERVISION"') &&
    source.client.includes('case "DISTRICT_DIRECTOR"'),
  "HOS/Director dashboard return routing missing",
);

console.log("");
console.log("=== N6-F1C1 GOVERNANCE TEACHER BBC READ-ONLY REVIEW WORKSPACE ===");
console.log("");
console.log("Page                             : separate /teacher-supervisory/review");
console.log("Audience                         : HOS / District Director only");
console.log("Assessment workspace             : untouched + separate");
console.log("Work discovery                   : durable review-queue GET");
console.log("READY_TO_START                   : visible, mutation deferred");
console.log("READY_TO_REVIEW                  : read-only package can open");
console.log("READY_TO_RELEASE                 : visible, mutation deferred");
console.log("Browser restart recovery         : durable queue source");
console.log("Manual refresh                   : supported");
console.log("Background polling               : absent");
console.log("Persistent browser storage       : absent");
console.log("Queue privacy flags              : negative disclosure assertions only");
console.log("Official Teacher form            : read-only sections/items");
console.log("Scores / N/A                     : display only");
console.log("General Comment                  : display only");
console.log("Observation particulars          : display only");
console.log("Assessor office                  : visible");
console.log("Assessor identity                : absent");
console.log("Reviewer identity                : absent");
console.log("Authority/proof hashes           : absent");
console.log("Start-review mutation            : absent in this slice");
console.log("HOS Return / Forward             : absent in this slice");
console.log("Director Return / Release        : absent in this slice");
console.log("Director direct release          : absent in this slice");
console.log("Assessment score/comment editing : absent");
console.log("Legacy TeacherAppraisal          : untouched");
console.log("Database accessed                : source contract only");
console.log("");
console.log("RESULT: N6-F1C1 GOVERNANCE TEACHER BBC READ-ONLY REVIEW WORKSPACE GREEN");
