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
  assessmentClient:
    "src/app/governance/appraisals/teacher-supervisory/TeacherSupervisoryAssessmentClient.tsx",
  admissionRoute:
    "src/app/api/governance/appraisals/teacher-supervisory/review-queue/[assessmentId]/start/route.ts",
  decisionRoute:
    "src/app/api/governance/appraisals/teacher-supervisory/review-queue/[assessmentId]/decision/route.ts",
  directorDecisionRoute:
    "src/app/api/governance/appraisals/teacher-supervisory/review-queue/[assessmentId]/director-decision/route.ts",
  directReleaseRoute:
    "src/app/api/governance/appraisals/teacher-supervisory/[assessmentId]/direct-release/route.ts",
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
  "HosDecisionAction",
  "HosDecisionOutcome",
  "hosDecisionBody",
  "submitHosDecision",
  "/decision",
  '"RETURN"',
  '"FORWARD"',
  "Return for correction",
  "Forward to Director",
  "3–2,000 characters",
  'reviewPackage.review.reviewerRole === "HEAD_OF_SUPERVISION"',
  "result: { outcome: HosDecisionOutcome }",
  "DirectorDecisionAction",
  "DirectorDecisionOutcome",
  "DirectReleaseOutcome",
  "directorDecisionBody",
  "directorDecisionSuccessMessage",
  "submitDirectorDecision",
  "/director-decision",
  '"RELEASE"',
  "District Director review decision",
  "Request assessor correction",
  "Prior completed review stages remain recorded",
  "Release result",
  'reviewPackage.review.reviewerRole === "DISTRICT_DIRECTOR"',
  "result: { outcome: DirectorDecisionOutcome }",
  "directRelease",
  "/direct-release",
  "Final inspections before release",
  "Supervision day",
  "Back to supervision days",
  "Back to circuits",
  "Back to schools",
  "Choose a Teacher to inspect the complete locked appraisal.",
  "DirectInspectionWorkspace",
  "reviewControlsIncluded",
  '"READY_FOR_DIRECT_RELEASE"',
  "Final inspection · read-only",
  "Governance Teacher observation · final inspection copy",
  "Release only after checking the form above",
  "Release my finalized assessment",
  "Releasing assessment…",
  '"RELEASED" | "EXISTING_RELEASED"',
]) {
  assert(
    source.client.includes(requiredClientMarker),
    "F1C3 Teacher review workspace contract marker missing",
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

assert(
  source.decisionRoute.includes("browserDecisionResult") &&
    source.decisionRoute.includes("outcome: result.outcome") &&
    source.decisionRoute.includes("result: browserDecisionResult(result)") &&
    source.decisionRoute.includes("actorUserId: auth.ctx.userId") &&
    source.decisionRoute.includes("actorRoleName: auth.ctx.roleName") &&
    source.decisionRoute.includes("governanceScope: auth.scope"),
  "HOS decision API must remain server-authoritative and browser-minimized",
);

assert(
  source.directorDecisionRoute.includes("browserDecisionResult") &&
    source.directorDecisionRoute.includes("outcome: result.outcome") &&
    source.directorDecisionRoute.includes("result: browserDecisionResult(result)") &&
    source.directorDecisionRoute.includes("actorUserId: auth.ctx.userId") &&
    source.directorDecisionRoute.includes("actorRoleName: auth.ctx.roleName") &&
    source.directorDecisionRoute.includes("governanceScope: auth.scope"),
  "Director decision API must remain server-authoritative and browser-minimized",
);

assert(
  source.directReleaseRoute.includes(
    'const ALLOWED_BODY_FIELDS = new Set(["confirm"])',
  ) &&
    source.directReleaseRoute.includes(
      'normalized(auth.ctx.roleName) !== "DISTRICT_DIRECTOR"',
    ) &&
    source.directReleaseRoute.includes("bodyContainsOnlyAllowedFields(parsed.body)") &&
    source.directReleaseRoute.includes("parsed.body.confirm !== true") &&
    source.directReleaseRoute.includes(
      "executeTeacherSupervisoryDirectorDirectRelease",
    ) &&
    source.directReleaseRoute.includes("actorUserId: auth.ctx.userId") &&
    source.directReleaseRoute.includes("actorRoleName: auth.ctx.roleName") &&
    source.directReleaseRoute.includes("governanceScope: auth.scope") &&
    source.directReleaseRoute.includes("confirm: true"),
  "Director direct-release API must remain confirmation-only and server-authoritative",
);

for (const forbiddenDirectReleaseMethod of [
  "export async function GET",
  "export async function PUT",
  "export async function PATCH",
  "export async function DELETE",
]) {
  assert(
    !source.directReleaseRoute.includes(forbiddenDirectReleaseMethod),
    "Director direct-release route exposes forbidden HTTP method",
    forbiddenDirectReleaseMethod,
  );
}

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

const hosDecisionBodyStart = source.client.indexOf("function hosDecisionBody(");
const hosDecisionBodyEnd = source.client.indexOf(
  "function hosDecisionSuccessMessage(",
  hosDecisionBodyStart,
);
assert(
  hosDecisionBodyStart >= 0 && hosDecisionBodyEnd > hosDecisionBodyStart,
  "HOS decision browser-body helper must be isolated",
);
const hosDecisionBodySource = source.client.slice(
  hosDecisionBodyStart,
  hosDecisionBodyEnd,
);
for (const requiredDecisionBodyField of ["action", "reason", "confirm"]) {
  assert(
    hosDecisionBodySource.includes(requiredDecisionBodyField),
    "HOS decision body field missing",
    requiredDecisionBodyField,
  );
}
for (const forbiddenDecisionBodyField of [
  "reviewerUserId",
  "reviewerAssignmentId",
  "reviewStage",
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
    !hosDecisionBodySource.includes(forbiddenDecisionBodyField),
    "HOS decision browser body contains authority/evidence field",
    forbiddenDecisionBodyField,
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
  assert(
    !source.assessmentClient.includes(forbiddenBrowserStorage),
    "Teacher final-inspection bridge contains forbidden browser persistence/polling marker",
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
const directReleaseItemsIndex = source.client.indexOf(
  "const directReleaseItems = useMemo(",
);
const directReleaseDayGroupsIndex = source.client.indexOf(
  "const directReleaseDayGroups = useMemo(",
);
assert(
  workGroupsIndex >= 0 &&
    activeWorkGroupsIndex > workGroupsIndex &&
    directReleaseItemsIndex > activeWorkGroupsIndex &&
    directReleaseDayGroupsIndex > directReleaseItemsIndex,
  "Teacher review work and Director final-inspection groups must have a stable source order",
);

for (const automaticVisibilityMarker of [
  'state: "READY_TO_START" as const',
  'state: "READY_TO_REVIEW" as const',
  "workGroups.filter((group) => group.items.length > 0)",
  "activeWorkGroups.map((group)",
  'item.state === "READY_TO_RELEASE"',
  'item.nextAction === "DIRECT_RELEASE"',
  "buildDirectReleaseDayGroups(directReleaseItems)",
  "directReleaseDayGroups.map((day)",
  "selectedDirectReleaseDay.circuits.map((circuit)",
  "selectedDirectReleaseCircuit.schools.map((school)",
  "selectedDirectReleaseSchool.items.map((item)",
]) {
  assert(
    source.client.includes(automaticVisibilityMarker),
    "Teacher review/final-inspection visibility marker missing",
    automaticVisibilityMarker,
  );
}

const newStateIndex = source.client.indexOf('state: "READY_TO_START" as const');
const reviewStateIndex = source.client.indexOf('state: "READY_TO_REVIEW" as const');
assert(
  newStateIndex >= 0 && reviewStateIndex > newStateIndex,
  "Independent review groups must retain New -> Continue order",
);

assert(
  !source.client
    .slice(workGroupsIndex, activeWorkGroupsIndex)
    .includes('state: "READY_TO_RELEASE" as const'),
  "Director-authored direct-release work must be separated from independent review groups",
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
  !source.assessmentClient.includes("finalInspectionRequested") &&
    !source.assessmentClient.includes('params.get("finalInspection")') &&
    !source.assessmentClient.includes("?inspected=") &&
    !source.assessmentClient.includes("/direct-release"),
  "Teacher assessment client must remain on the established assessor workspace; Director final inspection now stays inside the review workspace",
);

const directInspectionLoaderStart = source.client.indexOf(
  "const loadDirectReleaseInspectionPackage = useCallback(",
);
const directInspectionLoaderEnd = source.client.indexOf(
  "const startReview = useCallback(",
  directInspectionLoaderStart,
);
assert(
  directInspectionLoaderStart >= 0 &&
    directInspectionLoaderEnd > directInspectionLoaderStart,
  "Director final-inspection package loader must be isolated",
);
const directInspectionLoaderSource = source.client.slice(
  directInspectionLoaderStart,
  directInspectionLoaderEnd,
);
for (const marker of [
  'item.state !== "READY_TO_RELEASE"',
  'item.nextAction !== "DIRECT_RELEASE"',
  "/api/governance/appraisals/teacher-supervisory/${encodeURIComponent(",
  '{ cache: "no-store" }',
  "DirectInspectionWorkspace",
  'workspace.assessment.status !== "FINALIZED"',
  "workspace.lifecycle.originalAssessorOnly !== true",
  "workspace.lifecycle.reviewControlsIncluded !== false",
  'workspace.observation.assessorRole !== "DISTRICT_DIRECTOR"',
  '"READY_FOR_DIRECT_RELEASE"',
  "inspection: {",
  'actorRole: "DISTRICT_DIRECTOR"',
]) {
  assert(
    directInspectionLoaderSource.includes(marker),
    "Director final-inspection loader marker missing",
    marker,
  );
}
for (const forbidden of [
  'method: "POST"',
  "purpose=direct-release-inspection",
  "reviewerUserId",
  "reviewerAssignmentId",
  "assessorUserId",
  "assessorAssignmentId",
  "assessmentHash",
  "reviewEvidenceHash",
  "releaseProofHash",
]) {
  assert(
    !directInspectionLoaderSource.includes(forbidden),
    "Director final-inspection loader must remain read-only and authority-minimized",
    forbidden,
  );
}

assert(
  !directInspectionLoaderSource.includes("review.reviewerRole"),
  "Director final-inspection loader must consume inspection authority, not fake review metadata",
);

const textareaCount = (source.client.match(/<textarea/g) || []).length;
assert(
  !source.client.includes("<input") &&
    !source.client.includes("<select") &&
    textareaCount === 2 &&
    source.client.includes("value={returnReason}") &&
    source.client.includes("maxLength={2000}"),
  "F1C4 may expose only the mutually exclusive bounded HOS/Director correction-reason textareas; assessment controls must remain read-only",
);
assert(
  !source.client.includes("value={assessment.generalComment}") &&
    !source.client.includes("setGeneralComment") &&
    !source.client.includes("chooseItemScore"),
  "Reviewer UI must not make scores or General Comment editable",
);

const nativeResultIndex = source.client.indexOf(
  "Overall Teacher appraisal result",
);
const hosDecisionPanelIndex = source.client.indexOf("HOS review decision");
const directorDecisionPanelIndex = source.client.indexOf(
  "District Director review decision",
);
assert(
  nativeResultIndex >= 0 &&
    hosDecisionPanelIndex > nativeResultIndex &&
    directorDecisionPanelIndex > nativeResultIndex,
  "HOS and Director decision controls must sit outside and after the native official Teacher form",
);

const directReleasePanelIndex = source.client.indexOf("Final release");
assert(
  directReleasePanelIndex > nativeResultIndex,
  "Director own-assessment direct release must sit outside and after the native official Teacher form",
);

for (const hosDecisionMarker of [
  'currentPackage.review.reviewerRole !== "HEAD_OF_SUPERVISION"',
  'action === "RETURN"',
  "normalizedReason.length < 3",
  "normalizedReason.length > 2000",
  "JSON.stringify(hosDecisionBody(action, normalizedReason))",
  'submitHosDecision("RETURN")',
  'submitHosDecision("FORWARD")',
  'decisionBusy === "RETURN"',
  'decisionBusy === "FORWARD"',
  "setReviewPackage(null)",
  'setSelectedAssessmentId("")',
  "await loadQueue()",
]) {
  assert(
    source.client.includes(hosDecisionMarker),
    "HOS decision workspace behavior marker missing",
    hosDecisionMarker,
  );
}

for (const directorDecisionMarker of [
  'currentPackage.review.reviewerRole !== "DISTRICT_DIRECTOR"',
  "JSON.stringify(",
  "directorDecisionBody(action, normalizedReason)",
  'submitDirectorDecision("RETURN")',
  'submitDirectorDecision("RELEASE")',
  'decisionBusy === "RELEASE"',
  "Request a correction from the original assessor?",
  "Prior completed review stages remain recorded.",
  "Release this locked Teacher appraisal result?",
  "Releasing does not send this reason.",
  "Correction requested from the original assessor.",
  "Teacher appraisal released successfully.",
  "setReviewPackage(null)",
  'setSelectedAssessmentId("")',
  "await loadQueue()",
]) {
  assert(
    source.client.includes(directorDecisionMarker),
    "Director decision workspace behavior marker missing",
    directorDecisionMarker,
  );
}

const directorDecisionBodyStart = source.client.indexOf(
  "function directorDecisionBody(",
);
const directorDecisionBodyEnd = source.client.indexOf(
  "function directorDecisionSuccessMessage(",
  directorDecisionBodyStart,
);
assert(
  directorDecisionBodyStart >= 0 &&
    directorDecisionBodyEnd > directorDecisionBodyStart,
  "Director decision browser-body helper must be isolated",
);
const directorDecisionBodySource = source.client.slice(
  directorDecisionBodyStart,
  directorDecisionBodyEnd,
);
for (const requiredDecisionBodyField of ["action", "reason", "confirm"]) {
  assert(
    directorDecisionBodySource.includes(requiredDecisionBodyField),
    "Director decision body field missing",
    requiredDecisionBodyField,
  );
}
for (const forbiddenDecisionBodyField of [
  "reviewerUserId",
  "reviewerAssignmentId",
  "reviewStage",
  "cycleId",
  "assessmentHash",
  "observationContextHash",
  "reviewEvidenceHash",
  "decisionRequestHash",
  "decisionContractHash",
  "decisionEvidenceHash",
  "releaseProofHash",
  "scores",
  "generalComment",
]) {
  assert(
    !directorDecisionBodySource.includes(forbiddenDecisionBodyField),
    "Director decision browser body contains authority/evidence field",
    forbiddenDecisionBodyField,
  );
}

const directReleaseStart = source.client.indexOf(
  "const directRelease = useCallback(",
);
const directReleaseEnd = source.client.indexOf(
  "useEffect(() => {",
  directReleaseStart,
);
assert(
  directReleaseStart >= 0 && directReleaseEnd > directReleaseStart,
  "Director direct-release browser action must be isolated",
);
const directReleaseSource = source.client.slice(
  directReleaseStart,
  directReleaseEnd,
);

for (const directReleaseMarker of [
  'item.state !== "READY_TO_RELEASE"',
  'item.nextAction !== "DIRECT_RELEASE"',
  "You have inspected the locked form above.",
  "This is a direct release, not a review or approval.",
  "/direct-release",
  'method: "POST"',
  "JSON.stringify({ confirm: true })",
  'result: { outcome: DirectReleaseOutcome }',
  '"EXISTING_RELEASED"',
  "await loadQueue()",
]) {
  assert(
    directReleaseSource.includes(directReleaseMarker),
    "Director direct-release browser behavior marker missing",
    directReleaseMarker,
  );
}

for (const forbiddenDirectReleaseBrowserMarker of [
  "reviewerUserId",
  "reviewerAssignmentId",
  "reviewStage",
  "assessorUserId",
  "assessorAssignmentId",
  "targetUserId",
  "cycleId:",
  "assessmentHash",
  "observationContextHash",
  "reviewEvidenceHash",
  "releaseProofHash",
  "scores",
  "generalComment:",
  "returnReason",
  "reason:",
  "loadReviewPackage",
  "directorDecisionBody",
  "hosDecisionBody",
]) {
  assert(
    !directReleaseSource.includes(forbiddenDirectReleaseBrowserMarker),
    "Director direct-release browser action contains forbidden review/authority/evidence marker",
    forbiddenDirectReleaseBrowserMarker,
  );
}

assert(
  source.client.includes(
    'reviewPackage.lifecycleState === "READY_FOR_DIRECT_RELEASE"',
  ) &&
    source.client.includes("currentDirectReleaseItem") &&
    source.client.includes(
      "void directRelease(currentDirectReleaseItem)",
    ) &&
    source.client.includes(
      'directReleaseBusyId === assessment.id',
    ) &&
    !source.client.includes(
      'onClick={() => void directRelease(item)}',
    ),
  "READY_TO_RELEASE must expose direct release only after the native final-inspection package is open",
);

for (const finalInspectionHierarchyMarker of [
  "buildDirectReleaseDayGroups",
  "selectedReleaseDay",
  "selectedReleaseCircuitId",
  "selectedReleaseSchoolId",
  "showReleaseDays",
  "showReleaseCircuits",
  "showReleaseSchools",
  "showReleaseTeachers",
  "Supervision day",
  "Back to supervision days",
  "Back to circuits",
  "Back to schools",
  "Choose a Teacher to inspect the complete locked appraisal.",
  "formatPercent(item.overallPercentage)",
  "!selectedReleaseDay",
  "selectedDirectReleaseDay && !selectedReleaseCircuitId",
  "selectedDirectReleaseCircuit && !selectedReleaseSchoolId",
  "selectedDirectReleaseSchool",
]) {
  assert(
    source.client.includes(finalInspectionHierarchyMarker),
    "Director progressive final-inspection hierarchy marker missing",
    finalInspectionHierarchyMarker,
  );
}

for (const forbiddenOverbuiltMarker of [
  "Inspect finalized assessment",
  "finalInspection=1",
  'params.get("inspected")',
  "Release unlocks after you return from the final-inspection form.",
]) {
  assert(
    !source.client.includes(forbiddenOverbuiltMarker),
    "Obsolete bulky final-inspection bridge must be absent",
    forbiddenOverbuiltMarker,
  );
}

assert(
  source.client.includes('!directReleaseInspection ? (') &&
    source.client.includes('"← Back to Teachers"'),
  "Director final inspection must show the native form as the only current step with a simple return action",
);

for (const forbiddenSelfReviewLabel of [
  "Review my assessment",
  "Approve my assessment",
  "Return my assessment",
  "Return to myself",
]) {
  assert(
    !source.client.includes(forbiddenSelfReviewLabel),
    "Director-authored assessment must not be presented as self-review",
    forbiddenSelfReviewLabel,
  );
}

assert(
  source.client.includes('item.state === "READY_TO_REVIEW"') &&
    source.client.includes("loadReviewPackage(item.assessmentId)"),
  "Durable READY_TO_REVIEW work must still reopen the immutable package",
);

assert(
  !source.client.includes(
    "Direct release wiring comes in a later controlled step.",
  ),
  "READY_TO_RELEASE must no longer remain deferred after F1C5 wiring",
);

console.log("");
console.log("=== N6-F1C5K GOVERNANCE TEACHER BBC PROGRESSIVE FINAL INSPECTION ===");
console.log("");
console.log("Page                             : separate Teacher review workspace");
console.log("Audience                         : HOS / District Director only");
console.log("Independent review groups        : New -> Continue");
console.log("Director own finalized work      : progressive one-level-at-a-time drilldown");
console.log("Hierarchy level 1                : supervision day");
console.log("Hierarchy level 2                : circuit");
console.log("Hierarchy level 3                : school");
console.log("Hierarchy level 4                : Teacher");
console.log("Final inspection form            : native locked 6-section / 34-item form");
console.log("Final inspection mutation        : absent");
console.log("Final inspection source          : existing original-assessor workspace GET");
console.log("Native form location             : same review workspace; no route handoff");
console.log("Hierarchy visibility             : one current level only");
console.log("Inspection browser storage       : absent");
console.log("READY_TO_START                   : Start review preserved");
console.log("READY_TO_REVIEW                  : immutable review package reopen preserved");
console.log("Reviewed HOS Return / Forward    : preserved");
console.log("Reviewed Director Return/Release : preserved");
console.log("READY_TO_RELEASE                 : day -> circuit -> school -> Teacher -> native form -> release");
console.log("Director direct release          : confirm-only + no self-review");
console.log("Direct-release browser body      : confirm=true only");
console.log("Direct-release retry             : RELEASED / EXISTING_RELEASED");
console.log("Direct-release review row        : none");
console.log("Score / General Comment editing  : absent from review/final inspection");
console.log("Authority/proof browser fields   : absent");
console.log("Background polling               : absent");
console.log("Persistent browser storage       : absent");
console.log("Legacy TeacherAppraisal          : untouched");
console.log("Database accessed                : source contract only");
console.log("");
console.log("RESULT: N6-F1C5K GOVERNANCE TEACHER BBC PROGRESSIVE FINAL INSPECTION GREEN");
