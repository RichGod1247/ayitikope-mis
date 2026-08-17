#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS source-contract QA harness. */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..", "..");
const files = {
  discovery:
    "src/lib/appraisals/headteacherSupervisoryReleasedResultDiscovery.ts",
  listRoute:
    "src/app/api/headteacher/appraisals/governance-released/route.ts",
  client:
    "src/app/headteacher/my-appraisal/HeadteacherGovernanceReleasedResultsClient.tsx",
  page:
    "src/app/headteacher/my-appraisal/page.tsx",
  staffClient:
    "src/app/headteacher/my-appraisal/HeadteacherReleasedResultClient.tsx",
  protectedCombinedResult:
    "src/lib/appraisals/headteacherReleasedResult.ts",
};

const protectedHashes = {
  protectedCombinedResult:
    "791687fcea4b1fa2a73bd4ebf585587aaa32a42e62d089bf71f17c5932607758",
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
  if (!fs.existsSync(absolutePath)) fail("Required file missing", relativePath);
  return fs
    .readFileSync(absolutePath, "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
}

function normalizedHash(text) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

const source = Object.fromEntries(
  Object.entries(files).map(([key, relativePath]) => [key, read(relativePath)]),
);

for (const [key, expected] of Object.entries(protectedHashes)) {
  const actual = normalizedHash(source[key]);
  assert(actual === expected, "Protected Staff Feedback result lane drifted", {
    file: files[key],
    expected,
    actual,
  });
}

for (const marker of [
  "HEADTEACHER_SUPERVISORY_RELEASED_RESULT_DISCOVERY_POLICY",
  'audience: "RELEASED_HEADTEACHER_GOVERNANCE"',
  'requiredRole: "HEADTEACHER"',
  'discoverySource: "ASSESSMENT_KEYED_INDEPENDENT_RELEASE_MAP"',
  "carrierCycleReleasedStatusRequired: false",
  "fullResultReverificationRequired: true",
  'readMode: "SEQUENTIAL"',
  "staffFeedbackPrerequisite: false",
  "staffResponsesAccessed: false",
  "respondentIdentitiesAccessed: false",
  "combinedWeightingDefined: false",
  "appraisalCycle.findMany",
  "targetUserId: actorUserId",
  "targetTenantId: actorTenantId",
  'targetRoleSnapshot: "HEADTEACHER"',
  "HEADTEACHER_SUPERVISORY_RELEASES_METADATA_KEY",
  "readHeadteacherSupervisoryReleasedResult",
  "assessmentId: result.assessment.assessmentId",
  'releaseStatus: "RELEASED"',
]) {
  assert(
    source.discovery.includes(marker),
    "Headteacher governance discovery marker missing",
    marker,
  );
}

for (const forbidden of [
  'status: "RELEASED"',
  "readHeadteacherFeedbackAggregateReadiness",
  "appraisalResponse",
  "appraisalParticipant",
  "respondentUserId",
  "appraisalCycle.update",
  "appraisalAssessment.update",
  "sendSms",
  "sendEmail",
]) {
  assert(
    !source.discovery.includes(forbidden),
    "Discovery contains forbidden Staff Feedback/lifecycle/mutation coupling",
    forbidden,
  );
}

for (const marker of [
  "requireApiUserContext",
  'requireRoleNames: ["HEADTEACHER"]',
  "requireTenant: true",
  "listHeadteacherSupervisoryReleasedResults",
  "actorUserId: auth.ctx.userId",
  "actorRoleName: auth.ctx.roleName",
  "actorTenantId: auth.ctx.tenantId",
  '"Cache-Control": "no-store, max-age=0"',
  '"X-Content-Type-Options": "nosniff"',
  '"Referrer-Policy": "no-referrer"',
]) {
  assert(source.listRoute.includes(marker), "Thin list API marker missing", marker);
}

for (const forbiddenMethod of [
  "export async function POST",
  "export async function PUT",
  "export async function PATCH",
  "export async function DELETE",
]) {
  assert(
    !source.listRoute.includes(forbiddenMethod),
    "Headteacher governance list API must remain GET-only",
    forbiddenMethod,
  );
}

for (const marker of [
  'sectionTitle: "Governance Appraisal Reports"',
  "automaticLoadingAllowed: false",
  "backgroundPollingAllowed: false",
  "persistentBrowserStorageAllowed: false",
  "resultMutationAllowed: false",
  "commentsIncluded: false",
  "assessorIdentityIncluded: false",
  "assessorOfficeIncluded: true",
  "reviewerIdentityIncluded: false",
  "staffResponsesIncluded: false",
  "respondentIdentitiesIncluded: false",
  "combinedScoreIncluded: false",
  "staffFeedbackPrerequisite: false",
  'lowNetworkMode: "EXPLICIT_LOAD"',
  'nativeFormParity: "DIRECTOR_FINAL_RELEASE_INSPECTION_FORM"',
  "recipientCopyLabelOnlyDiffers: true",
  '"/api/headteacher/appraisals/governance-released"',
  "View governance result",
  "Load governance reports",
  "Official supervisory assessments released by governance appear here.",
  "Monitoring and Inspection Sheet (Headteachers)",
  "Governance supervisory assessment · Released result copy",
  "Behavioural Competence",
  "Final Score",
  "Total score",
  "Percentage score",
  "Official section maximum:",
  "Overall percentage — average of the four official section percentages",
  "Raw total",
  "Official maximum",
  "N/A exclusions",
  "Final result",
  "paperScoreCellTone",
  "min-w-[1040px]",
  "result.assessment.sections.map",
  "section.items.map",
]) {
  assert(source.client.includes(marker), "Headteacher governance client marker missing", marker);
}

for (const forbiddenBrowserMarker of [
  "useEffect(",
  "setInterval(",
  "setTimeout(",
  "localStorage",
  "sessionStorage",
  "indexedDB",
  'method: "POST"',
  'method: "PUT"',
  'method: "PATCH"',
  'method: "DELETE"',
  "General Comments",
  "Respondent 1",
  "respondentUserId",
  ">Meaning<",
  "scoreMeaning(",
]) {
  assert(
    !source.client.includes(forbiddenBrowserMarker),
    "Headteacher governance client contains forbidden polling/storage/mutation/privacy marker",
    forbiddenBrowserMarker,
  );
}

for (const marker of [
  "HeadteacherReleasedResultClient",
  "HeadteacherGovernanceReleasedResultsClient",
  "governanceStaffFeedbackPrerequisite: false",
  "combinedScoreIncluded: false",
  "bbcFriendlyRecipientLayout: true",
  "staffFeedbackControlsOwnedByClient: true",
]) {
  assert(source.page.includes(marker), "Dual recipient surface marker missing", marker);
}

for (const marker of [
  'import Link from "next/link"',
  "bbcLayoutVersion: 2",
  "topLevelRefreshBesideDashboard: true",
  "separateAppraisalActionCard: false",
  "journeyNestedInStatusCard: true",
  "separatePrivacyCard: false",
  "privacyMessageUnderStaffHeading: true",
  "← Dashboard",
  "Refresh status",
  "Staff Feedback Appraisals",
  "This screen does not show individual staff responses",
  "Headteacher · My Appraisal",
  "Appraisal journey",
  "Request appraisal",
]) {
  assert(
    source.staffClient.includes(marker),
    "BBC Headteacher Staff Feedback layout marker missing",
    marker,
  );
}

for (const forbidden of [
  ">Appraisal action<",
  ">Privacy boundary<",
]) {
  assert(
    !source.staffClient.includes(forbidden),
    "Removed BBC-clutter card marker returned",
    forbidden,
  );
}

console.log("");
console.log("=== N7-P2C4B1E HEADTEACHER GOVERNANCE RELEASED RESULT DISCOVERY + UI ===");
console.log("");
console.log("Discovery key                    : assessment-keyed release proof");
console.log("Carrier cycle RELEASED filter    : absent");
console.log("Target DB filter                 : Headteacher user + tenant");
console.log("Full result revalidation         : sequential + required");
console.log("Unreleased finalized assessments : excluded");
console.log("Staff Feedback backend           : untouched");
console.log("BBC recipient layout             : compact + explicit");
console.log("Recipient page sections          : Staff Feedback / Governance");
console.log("Governance list load             : explicit only");
console.log("Governance detail load           : explicit only");
console.log("Background polling               : absent");
console.log("Browser persistence              : absent");
console.log("Governance result mutation       : absent");
console.log("Native result                    : Director paper-form parity · read-only");
console.log("Assessor identity                : absent");
console.log("Staff responses / identities     : absent");
console.log("Combined score                   : absent");
console.log("Database accessed                : source contract only");
console.log("");
console.log("RESULT: N7-P2C4B1E HEADTEACHER GOVERNANCE RELEASED RESULT DISCOVERY + UI GREEN");
