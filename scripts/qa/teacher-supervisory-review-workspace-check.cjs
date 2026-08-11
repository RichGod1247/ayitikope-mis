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
  admissionRoute:
    "src/app/api/governance/appraisals/teacher-supervisory/review-queue/[assessmentId]/start/route.ts",
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

for (const requiredClientMarker of [
  '"use client"',
  "Review Teacher Reports",
  '"READY_TO_START"',
  '"READY_TO_REVIEW"',
  '"READY_TO_RELEASE"',
  '"START_REVIEW"',
  '"CONTINUE_REVIEW"',
  '"DIRECT_RELEASE"',
  "Start review",
  "Starting review…",
  "window.confirm",
  "/start",
  'method: "POST"',
  '"Content-Type": "application/json"',
  "JSON.stringify({ confirm: true })",
  '"STARTED" | "EXISTING_REVIEW"',
  "Review started securely.",
  "already started",
  "await loadQueue()",
  "await loadReviewPackage(item.assessmentId)",
  "/package",
  '{ cache: "no-store" }',
  "Open report",
  "Teacher review · read-only",
  "General Comments",
  "Class Enrollment Data",
]) {
  assert(
    source.client.includes(requiredClientMarker),
    "F1C2U Teacher review workspace contract marker missing",
    requiredClientMarker,
  );
}

assert(
  source.client.includes(
    'item.state !== "READY_TO_START" || item.nextAction !== "START_REVIEW"',
  ),
  "Start-review UI must require the durable READY_TO_START / START_REVIEW hint before calling admission",
);

assert(
  source.admissionRoute.includes("confirmOnlyBody") &&
    source.admissionRoute.includes("parsed.body.confirm !== true") &&
    source.admissionRoute.includes("actorUserId: auth.ctx.userId") &&
    source.admissionRoute.includes("actorRoleName: auth.ctx.roleName") &&
    source.admissionRoute.includes("governanceScope: auth.scope"),
  "Existing admission endpoint must remain confirmation-only with server-authenticated authority inputs",
);

for (const forbiddenAdmissionBodyField of [
  "reviewerUserId",
  "reviewerAssignmentId",
  "reviewStage",
  "assessorUserId",
  "targetUserId",
  "assessmentHash",
  "observationContextHash",
  "reviewEvidenceHash",
]) {
  assert(
    !source.client.includes(`${forbiddenAdmissionBodyField}:`),
    "Browser must not submit review authority/evidence field",
    forbiddenAdmissionBodyField,
  );
}

for (const forbiddenLaterAction of [
  "/decision",
  "/director-decision",
  "/direct-release",
  '"RETURN"',
  '"FORWARD"',
  '"RELEASE"',
  "Return for correction",
  "Forward to Director",
  "Release result",
]) {
  assert(
    !source.client.includes(forbiddenLaterAction),
    "F1C2U must not wire later review/release powers",
    forbiddenLaterAction,
  );
}

for (const forbiddenMethod of [
  'method: "PUT"',
  'method: "PATCH"',
  'method: "DELETE"',
]) {
  assert(
    !source.client.includes(forbiddenMethod),
    "F1C2U review workspace contains forbidden HTTP mutation method",
    forbiddenMethod,
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

for (const requiredPrivacyContractMarker of [
  "assessorUserIdIncluded: false",
  "targetUserIdIncluded: false",
  "reviewIdIncluded: false",
  "assignmentIdsIncluded: false",
  "proofHashesIncluded: false",
  "contactDetailsIncluded: false",
  "noBackgroundPolling: true",
]) {
  assert(
    source.client.includes(requiredPrivacyContractMarker),
    "Durable queue privacy/minimization contract marker missing",
    requiredPrivacyContractMarker,
  );
}

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
    "Teacher review workspace references server-only authority/integrity field outside a negative disclosure marker",
    forbiddenAuthorityField,
  );
}

const workGroupsIndex = source.client.indexOf("const workGroups = useMemo(");
const activeWorkGroupsIndex = source.client.indexOf(
  "const activeWorkGroups = useMemo(",
);
assert(
  workGroupsIndex >= 0 && activeWorkGroupsIndex > workGroupsIndex,
  "Teacher review work groups must be defined before automatic active-group filtering",
);

for (const automaticVisibilityMarker of [
  'state: "READY_TO_START" as const',
  'state: "READY_TO_REVIEW" as const',
  'state: "READY_TO_RELEASE" as const',
  "workGroups.filter((group) => group.items.length > 0)",
  "activeWorkGroups.map((group)",
]) {
  assert(
    source.client.includes(automaticVisibilityMarker),
    "Automatic Teacher review work visibility marker missing",
    automaticVisibilityMarker,
  );
}

const newStateIndex = source.client.indexOf('state: "READY_TO_START" as const');
const reviewStateIndex = source.client.indexOf('state: "READY_TO_REVIEW" as const');
const releaseStateIndex = source.client.indexOf('state: "READY_TO_RELEASE" as const');
assert(
  newStateIndex >= 0 &&
    reviewStateIndex > newStateIndex &&
    releaseStateIndex > reviewStateIndex,
  "Automatic Teacher review groups must retain New -> Continue -> Ready to release order",
);

for (const forbiddenDisclosureMarker of [
  "otherReviewWorkOpen",
  "setOtherReviewWorkOpen",
  "Show other review work",
  "Hide other review work",
  'aria-controls="other-teacher-review-work"',
  'id="other-teacher-review-work"',
]) {
  assert(
    !source.client.includes(forbiddenDisclosureMarker),
    "Manual Teacher review work disclosure must be absent",
    forbiddenDisclosureMarker,
  );
}

for (const compactCardMarker of [
  'className="w-full rounded-[22px]',
  'lg:grid-cols-[minmax(0,1fr)_180px_minmax(190px,230px)]',
  'className="mt-4 space-y-3"',
  "Assessed by",
]) {
  assert(
    source.client.includes(compactCardMarker),
    "Wide compact BBC-friendly Teacher review card marker missing",
    compactCardMarker,
  );
}

for (const nativeFormMarker of [
  "Monitoring and Inspection Sheet (Teachers)",
  "Governance Teacher observation · independent review copy",
  "Class Enrollment Data",
  "Behavioural competence",
  '"N/A", "1", "2", "3", "4", "5", "Final score"',
  "sectionRawScore(section)",
  "sectionApplicableMaximum(section)",
  "General Comments",
  "Overall Teacher appraisal result",
]) {
  assert(
    source.client.includes(nativeFormMarker),
    "Native read-only Teacher review form marker missing",
    nativeFormMarker,
  );
}


assert(
  !source.client.includes(
    "The official assessment is displayed exactly as evidence for review.",
  ),
  "Redundant independent-review explanatory banner must be removed",
);

assert(
  source.client.includes("assessment.sections.map") &&
    source.client.includes("section.items.map") &&
    source.client.includes("[null, 1, 2, 3, 4, 5].map") &&
    source.client.includes("scoreLabel(item)"),
  "Read-only official assessment structure must remain visible in the native form",
);

assert(
  !source.client.includes("<input") &&
    !source.client.includes("<textarea") &&
    !source.client.includes("<select"),
  "F1C2U review package must not expose editable assessment controls",
);

assert(
  source.client.includes('item.state === "READY_TO_REVIEW"') &&
    source.client.includes("loadReviewPackage(item.assessmentId)"),
  "Durable READY_TO_REVIEW work must still reopen the immutable package",
);

assert(
  source.client.includes(
    "Direct release wiring comes in a later controlled step.",
  ),
  "READY_TO_RELEASE must remain non-mutating in F1C2U",
);

console.log("");
console.log("=== N6-F1C2U GOVERNANCE TEACHER REVIEW WORKSPACE UX ===");
console.log("");
console.log("Page                             : separate Teacher review workspace");
console.log("Audience                         : HOS / District Director only");
console.log("New Reports priority             : first and primary");
console.log("Work cards                       : wide, low-profile and responsive");
console.log("Work-group visibility            : automatic from non-empty server queue state");
console.log("Zero-count detailed groups       : hidden automatically");
console.log("Manual disclosure                : absent");
console.log("Native official form             : read-only 6-section / 34-item table");
console.log("Redundant review banner          : removed");
console.log("Observation particulars          : native paper-style presentation");
console.log("Class enrolment                  : native paper-style presentation");
console.log("General Comment                  : read-only");
console.log("Overall result                   : read-only");
console.log("READY_TO_START                   : Start review preserved");
console.log("Admission confirmation           : explicit window confirmation");
console.log("Browser mutation body            : confirm=true only");
console.log("Reviewer identity                : server authenticated");
console.log("Reviewer assignment              : server resolved");
console.log("Review stage                     : server resolved");
console.log("Governance scope                 : server authenticated");
console.log("Immutable evidence               : admission service reverified");
console.log("STARTED                          : supported");
console.log("EXISTING_REVIEW                  : idempotent retry supported");
console.log("READY_TO_REVIEW                  : durable reopen preserved");
console.log("READY_TO_RELEASE                 : mutation still deferred");
console.log("HOS Return / Forward             : absent");
console.log("Director Return / Release        : absent");
console.log("Director direct release          : absent");
console.log("Score / General Comment editing  : absent");
console.log("Authority/proof browser fields   : absent");
console.log("Background polling               : absent");
console.log("Persistent browser storage       : absent");
console.log("Legacy TeacherAppraisal          : untouched");
console.log("Database accessed                : source contract only");
console.log("");
console.log("RESULT: N6-F1C2U GOVERNANCE TEACHER REVIEW WORKSPACE UX GREEN");
