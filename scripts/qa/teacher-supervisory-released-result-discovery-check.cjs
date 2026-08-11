#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS source-contract QA harness. */

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..", "..");

const files = {
  discovery:
    "src/lib/appraisals/teacherSupervisoryReleasedResultDiscovery.ts",
  listRoute:
    "src/app/api/teacher/appraisals/governance-released/route.ts",
  detailRoute:
    "src/app/api/teacher/appraisals/governance-released/[cycleId]/route.ts",
  released:
    "src/lib/appraisals/teacherSupervisoryReleasedResult.ts",
  legacy:
    "src/app/api/teacher/appraisals/route.ts",
  ui:
    "src/app/teacher/appraisals/ui.tsx",
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
  'audience: "RELEASED_TEACHER"',
  'requiredRole: "TEACHER"',
  'requiredCycleStatus: "RELEASED"',
  "maximumResults: 20",
  "exactTargetUserRequired: true",
  "exactTargetTenantRequired: true",
  "fullReleasedResultReverificationRequired: true",
  "scoreValuesIncludedInList: false",
  "generalCommentIncludedInList: false",
  "reviewerIdentityIncluded: false",
  "returnReasonsIncluded: false",
  "releaseProofHashIncluded: false",
  "internalIntegrityDetailsIncluded: false",
  "legacyTeacherAppraisalIncluded: false",
  "combinedWeightingDefined: false",
  "databaseWritesAllowed: false",
  "providerCallsAllowed: false",
  "appraisalCycle.findMany",
  "targetUserId: actorUserId",
  "targetTenantId: actorTenantId",
  'targetRoleSnapshot: "TEACHER"',
  "cancelledAt: null",
  "readTeacherSupervisoryReleasedResult",
  'actorRoleName: "TEACHER"',
  'result.lifecycleState !== "RELEASED"',
  "result.release.integrityVerified !== true",
]) {
  assert(
    source.discovery.includes(marker),
    "Released-result discovery safety marker missing",
    marker,
  );
}

for (const forbidden of [
  "$transaction",
  "appraisalCycle.update",
  "appraisalAssessment.update",
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
    !source.discovery.includes(forbidden),
    "Released-result discovery contains forbidden mutation/provider marker",
    forbidden,
  );
}

for (const marker of [
  'runtime = "nodejs"',
  'dynamic = "force-dynamic"',
  "requireApiUserContext",
  'requireRoleNames: ["TEACHER"]',
  "readTeacherSupervisoryReleasedResultDiscovery",
  "authResponseNoStore(auth.res)",
  'actorRoleName: "TEACHER"',
  '"Cache-Control", "no-store, max-age=0"',
  '"Pragma", "no-cache"',
  '"X-Content-Type-Options", "nosniff"',
  '"Referrer-Policy", "no-referrer"',
  "export async function GET",
]) {
  assert(
    source.listRoute.includes(marker),
    "Released-result discovery route marker missing",
    marker,
  );
}

for (const forbidden of [
  "export async function POST",
  "export async function PUT",
  "export async function PATCH",
  "export async function DELETE",
  "prisma.",
  "appraisalCycle.",
  "teacherAppraisal",
  "request.json(",
  "searchParams",
  "localStorage",
  "sessionStorage",
  "setInterval(",
]) {
  assert(
    !source.listRoute.includes(forbidden),
    "Released-result discovery route contains forbidden marker",
    forbidden,
  );
}

assert(
  source.detailRoute.includes("readTeacherSupervisoryReleasedResult") &&
    source.detailRoute.includes('requireRoleNames: ["TEACHER"]'),
  "Existing protected governance released-result detail route drifted",
);

assert(
  source.legacy.includes("prisma.teacherAppraisal") &&
    source.legacy.includes("TeacherAppraisalStatus.FINALIZED") &&
    !source.legacy.includes("teacherSupervisoryReleasedResult") &&
    !source.legacy.includes("governance-released"),
  "Legacy Headteacher-to-Teacher appraisal endpoint must remain separate",
);

for (const marker of [
  "Governance appraisals",
  "Headteacher appraisals",
  "their scores are never combined",
  '"/api/teacher/appraisals/governance-released"',
  "/api/teacher/appraisals/governance-released/${encodeURIComponent(cycleId)}",
  "Governance Teacher Observation · Released Result",
  "Monitoring and Inspection Sheet (Teachers)",
  "Class Enrolment Data",
  "Overall Teacher Appraisal Result",
  'aria-expanded={active}',
  '{active ? "Hide result" : "View result"}',
  'if (active) {',
  'setSelectedCycleId("");',
  "overscroll-x-contain",
]) {
  assert(
    source.ui.includes(marker),
    "Teacher My Appraisals governance UX marker missing",
    marker,
  );
}

assert(
  !source.ui.includes('return response.items[0]?.cycleId ?? "";'),
  "Governance released result must not auto-open the first report",
);

assert(
  source.ui.includes("returnReasonsIncluded: false;"),
  "Teacher governance result type must explicitly preserve Return-reason exclusion",
);

const governanceFormStart = source.ui.indexOf(
  "function GovernanceReleasedOfficialForm",
);
const governancePanelStart = source.ui.indexOf(
  "function GovernanceReleasedResultsPanel",
);

assert(
  governanceFormStart >= 0 &&
    governancePanelStart > governanceFormStart,
  "Governance released-result UI boundary missing",
);

const governanceForm = source.ui.slice(
  governanceFormStart,
  governancePanelStart,
);

assert(
  !governanceForm.includes('space-y-2 p-3 md:hidden') &&
    !governanceForm.includes('hidden overflow-x-auto md:block') &&
    governanceForm.includes("overscroll-x-contain") &&
    governanceForm.includes("min-w-[780px]"),
  "Mobile governance result must retain the native table rather than switch to card rendering",
);

for (const forbidden of [
  "releaseProofHash",
  "reviewerUserId",
  "reviewerAssignmentId",
  ".returnReason",
  "returnReason:",
  '["returnReason"]',
  "['returnReason']",
  ".reviewNote",
  "reviewNote:",
  '["reviewNote"]',
  "['reviewNote']",
  "localStorage",
  "sessionStorage",
  "indexedDB",
  "setInterval(",
]) {
  assert(
    !source.ui.includes(forbidden),
    "Teacher My Appraisals UI exposes forbidden internal/browser marker",
    forbidden,
  );
}

const publicProjectionStart = source.released.lastIndexOf(
  'return {\n    schemaVersion: 1,\n    audience: "RELEASED_TEACHER"',
);
assert(publicProjectionStart >= 0, "Released public projection block not found");

const publicProjection = source.released.slice(publicProjectionStart);

for (const forbiddenPublicField of [
  "releaseProofHash:",
  "releaseMode:",
  "reviewStage:",
  "integrity:",
  "reviewerUserId:",
  "reviewerAssignmentId:",
  "assessorUserId:",
  "assessorAssignmentId:",
  "returnReason:",
]) {
  assert(
    !publicProjection.includes(forbiddenPublicField),
    "Teacher released-result public projection contains internal field",
    forbiddenPublicField,
  );
}

console.log("");
console.log("=== N6-F1C4R TEACHER GOVERNANCE RELEASED-RESULT DISCOVERY + MY APPRAISALS ===");
console.log("");
console.log("Teacher doorway                   : /teacher/appraisals");
console.log("Governance discovery              : Teacher-only released-cycle list");
console.log("Governance detail                 : existing fully verified protected endpoint");
console.log("Target binding                    : exact authenticated user + tenant");
console.log("Discovery result limit            : 20");
console.log("Discovery full verification       : each result reuses released-result verifier");
console.log("Governance and Headteacher streams: separate");
console.log("Combined score                    : absent");
console.log("Governance report disclosure      : click card to open / click again to hide");
console.log("Initial report state              : closed; no automatic detail request");
console.log("Governance native form            : 6 sections / 34 items");
console.log("Mobile native form                : same official score table + horizontal containment");
console.log("Observation particulars           : read-only");
console.log("Class enrolment                   : read-only");
console.log("General Comment                   : read-only");
console.log("Overall result                    : read-only");
console.log("Reviewer identities               : absent");
console.log("Return reasons                    : absent");
console.log("Release/internal hashes           : absent from browser projection");
console.log("Persistent browser storage        : absent");
console.log("Background polling                : absent");
console.log("Legacy TeacherAppraisal           : untouched");
console.log("Database writes                   : absent");
console.log("Provider calls                    : absent");
console.log("Database accessed                 : source contract only");
console.log("");
console.log("RESULT: N6-F1C4R TEACHER RELEASED-RESULT DISCOVERY + MY APPRAISALS GREEN");
