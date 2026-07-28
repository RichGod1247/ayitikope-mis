#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS QA harness intentionally performs static repository contract verification. */

const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const repoRoot = path.resolve(__dirname, "..", "..");

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
  return fs.readFileSync(absolutePath, "utf8");
}

const pagePath = "src/app/headteacher/my-appraisal/page.tsx";
const clientPath = "src/app/headteacher/my-appraisal/HeadteacherReleasedResultClient.tsx";
const dashboardPath = "src/app/headteacher/dashboard/ui.tsx";
const h2RoutePath = "src/app/api/headteacher/headteacher-appraisal/[cycleId]/released-result/route.ts";
const h1ServicePath = "src/lib/appraisals/headteacherReleasedResult.ts";
const readStatePath = "src/lib/appraisals/headteacherFeedbackReadStates.ts";

const page = read(pagePath);
const client = read(clientPath);
const dashboard = read(dashboardPath);
const h2Route = read(h2RoutePath);
const h1Service = read(h1ServicePath);
const readState = read(readStatePath);

for (const [name, text, fileName] of [
  ["page", page, pagePath],
  ["client", client, clientPath],
  ["dashboard", dashboard, dashboardPath],
]) {
  const transpiled = ts.transpileModule(text, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
    fileName,
    reportDiagnostics: true,
  });
  const diagnostics = transpiled.diagnostics || [];
  assert(diagnostics.length === 0, `${name} has TypeScript syntax diagnostics`, diagnostics);
}

for (const marker of [
  "HEADTEACHER_RELEASED_RESULT_PAGE_POLICY",
  'route: "/headteacher/my-appraisal"',
  "requireServerUserContext",
  'requireRoleNames: ["HEADTEACHER"]',
  "readHeadteacherOwnAppraisalState",
  "actorUserId: auth.userId",
  "actorRoleName: auth.roleName",
  "tenantId: auth.tenantId",
  "HeadteacherReleasedResultClient",
  'href="/headteacher/dashboard"',
  "automaticResultLoadingAllowed: false",
  "dashboardEntriesAdded: 1",
  "dashboardOrderChanged: false",
]) {
  assert(page.includes(marker), "H3 server page contract missing", marker);
}

for (const marker of [
  "HEADTEACHER_RELEASED_RESULT_UI_POLICY",
  "expectedSections: 4",
  'presentation: "OVERALL_THEN_FOUR_SECTIONS"',
  'loadingMode: "EXPLICIT_BUTTON_ONLY"',
  "backgroundPollingAllowed: false",
  "persistentBrowserStorageAllowed: false",
  "combinedScoreIncluded: false",
  "responseCountsIncluded: false",
  "itemLevelValuesIncluded: false",
  "respondentIdentitiesIncluded: false",
  "reviewerIdentityIncluded: false",
  "assessorIdentityIncluded: false",
  "Load my released result",
  "/released-result",
  'cache: "no-store"',
  "No combined appraisal score is created.",
  "Four-section comparison",
  "Director’s release note",
  "Release record verified",
  "Difference means supervisory percentage minus staff-feedback percentage.",
]) {
  assert(client.includes(marker), "H3 BBC client contract missing", marker);
}

for (const forbidden of [
  "useEffect(",
  "localStorage",
  "sessionStorage",
  "setInterval(",
  "setTimeout(",
  "appraisalNotification",
  "sendSms",
  "sendEmail",
  "prisma.",
  "respondentUserId",
  "participantUserId",
  "reviewerUserId",
  "assessorUserId",
  "combinedOverallPercentage",
  ".staffFeedback.sections",
  ".supervisoryAssessment.sections",
]) {
  assert(!client.includes(forbidden), "H3 BBC client contains forbidden marker", forbidden);
}

const myAppraisalStart = dashboard.indexOf('title="My Appraisal"');
const directorFeedbackStart = dashboard.indexOf('title="Director Feedback"');
assert(myAppraisalStart >= 0, "Existing My Appraisal dashboard tile missing");
assert(directorFeedbackStart > myAppraisalStart, "Dashboard order changed around My Appraisal");
const myAppraisalBlock = dashboard.slice(myAppraisalStart, directorFeedbackStart);
for (const marker of [
  'cta="Open my appraisal"',
  'badge="Open"',
  'router.push("/headteacher/my-appraisal")',
  "Check your appraisal status and view the official released result when available.",
]) {
  assert(myAppraisalBlock.includes(marker), "Controlled dashboard entry missing", marker);
}
assert(!myAppraisalBlock.includes("disabled"), "My Appraisal dashboard entry must not remain disabled");

const tileGridStart = dashboard.indexOf(
  '<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">',
);
assert(tileGridStart >= 0, "Headteacher dashboard tile grid missing");
const tileGrid = dashboard.slice(tileGridStart);
const orderedTileMarkers = [
  "<StudentsAttendanceTile",
  'title="Teacher Attendance"',
  'title="Scheme Vetting"',
  'title="Lesson Notes"',
  'title="Students Assessment"',
  'title="Teacher Appraisal"',
  'title="My Appraisal"',
  'title="Director Feedback"',
  'title="Class Term Reports"',
  'title="Learner Term Report"',
  'title="Parent Results Release"',
];
let priorIndex = -1;
for (const marker of orderedTileMarkers) {
  const currentIndex = tileGrid.indexOf(marker);
  assert(currentIndex > priorIndex, "Headteacher dashboard tile order drift", {
    marker,
    priorIndex,
    currentIndex,
  });
  priorIndex = currentIndex;
}

for (const marker of [
  "HEADTEACHER_RELEASED_RESULT_API_POLICY",
  'method: "GET"',
  "readHeadteacherReleasedResult",
  '"Cache-Control": "no-store, max-age=0"',
  "databaseWritesAllowed: false",
]) {
  assert(h2Route.includes(marker), "H2 no-store API contract missing", marker);
}

for (const marker of [
  "HEADTEACHER_RELEASED_RESULT_POLICY",
  'requiredCycleStatus: "RELEASED"',
  "releaseProofHashVerified: true",
  "responseCountsIncluded: false",
  "staffItemAveragesIncluded: false",
  "supervisoryItemScoresIncluded: false",
  "respondentIdentitiesIncluded: false",
  "combinedOverallPercentage: null",
]) {
  assert(h1Service.includes(marker), "H1 result projection contract missing", marker);
}

for (const marker of [
  "readHeadteacherOwnAppraisalState",
  'futureRouteTarget: string',
  'canViewReleasedAppraisal: boolean',
  'case "RELEASED"',
  'return "VIEW_RELEASED_APPRAISAL"',
]) {
  assert(readState.includes(marker), "C5 Headteacher read-state contract missing", marker);
}

console.log("");
console.log("=== D3.4H3 BBC-FRIENDLY HEADTEACHER RELEASED-RESULT WORKSPACE ===");
console.log("");
console.log("Audience scope                 : exact Headteacher page session");
console.log("Dashboard entry                : existing My Appraisal tile only");
console.log("Dashboard order                : unchanged");
console.log("State source                   : C5 read-only state contract");
console.log("Result source                  : H2 GET no-store API");
console.log("Network behavior               : explicit load, no polling");
console.log("Visible result                 : overall + four sections + release note");
console.log("Comparison direction           : supervisory minus staff");
console.log("Thresholds/combined score      : absent");
console.log("Response counts/item values    : absent");
console.log("Respondent identities/forms    : absent");
console.log("Reviewer/assessor identities   : absent");
console.log("Persistent browser storage     : absent");
console.log("Writes/notifications/providers : absent");
console.log("Database accessed              : false");
console.log("");
console.log("RESULT: D3.4H3 HEADTEACHER RELEASED RESULT UI GREEN");
