#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS QA harness intentionally performs static repository contract verification. */

const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const repoRoot = path.resolve(__dirname, "..", "..");

function fail(message, details) {
  const suffix = details === undefined ? "" : `\n${JSON.stringify(details, null, 2)}`;
  throw new Error(`${message}${suffix}`);
}

function assert(condition, message, details) {
  if (!condition) fail(message, details);
}

function read(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  assert(fs.existsSync(absolutePath), "Required D3.5B2A file missing", {
    relativePath,
  });
  return fs.readFileSync(absolutePath, "utf8");
}

function requireMarkers(relativePath, markers) {
  const source = read(relativePath);
  for (const marker of markers) {
    assert(source.includes(marker), "D3.5B2A marker missing", {
      relativePath,
      marker,
    });
  }
  return source;
}

function transpile(relativePath) {
  const source = read(relativePath);
  const output = ts.transpileModule(source, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      strict: true,
    },
    fileName: relativePath,
    reportDiagnostics: true,
  });

  const errors = (output.diagnostics || []).filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
  );

  assert(errors.length === 0, "D3.5B2A TypeScript syntax failed", {
    relativePath,
    errors: errors.map((error) => error.messageText),
  });
}

const dashboardPath =
  "src/components/governance/GovernanceCommandDashboardClient.tsx";
const directorClientPath =
  "src/app/district/headteacher-appraisals/review/HeadteacherDirectorReviewClient.tsx";
const directorApiPath =
  "src/app/api/district/headteacher-appraisals/route.ts";
const headteacherClientPath =
  "src/app/headteacher/my-appraisal/HeadteacherReleasedResultClient.tsx";
const headteacherApiPath =
  "src/app/api/headteacher/headteacher-appraisal/route.ts";

const dashboard = requireMarkers(dashboardPath, [
  'href={\n          isDistrictView\n            ? "/district/headteacher-appraisals/review"',
  '"/governance/appraisals/headteacher-supervisory"',
  "Approve requests and review completed Headteacher appraisals.",
  "Complete authorized Headteacher supervisory assessments within your circuit.",
  "Open workspace",
  "SISSO",
]);

for (const stale of [
  "Director-approved workflow is implemented",
  "Other appraisal options open only when their controlled workflows are available",
]) {
  assert(!dashboard.includes(stale), "Stale dashboard wording remains", stale);
}

const directorApi = requireMarkers(directorApiPath, [
  "HEADTEACHER_APPRAISAL_DIRECTOR_QUEUE_API_POLICY",
  'methods: ["GET", "POST"]',
  'manualReferenceEntryRequired: false',
  "readDirectorHeadteacherAppraisalStates",
  "approveAndOpenHeadteacherFeedbackCycleWithNotifications",
  'action !== "APPROVE_AND_OPEN"',
  "EXPLICIT_CONFIRMATION_REQUIRED",
  "requireDirectorReviewApiContext",
  "reviewGovernanceScope",
  "jsonNoStore",
  '@/app/api/district/headteacher-appraisals/_shared',
  "providerCalled: false",
]);

requireMarkers(
  "src/app/api/district/headteacher-appraisals/_shared.ts",
  [
    '"Cache-Control": "no-store, max-age=0"',
    'Pragma: "no-cache"',
    '"X-Content-Type-Options": "nosniff"',
  ],
);

for (const forbidden of [
  "sendSms",
  "sendEmail",
  "providerDelivery",
  "prisma.",
]) {
  assert(!directorApi.includes(forbidden), "Director queue API bypasses service boundary", forbidden);
}

const directorClient = requireMarkers(directorClientPath, [
  "Appraisal work queue",
  "Requests awaiting approval",
  "Ready for Director review",
  "Feedback in progress",
  "No appraisal reference needs to be typed.",
  "No background polling. Refresh the queue only when new work is expected.",
  "Approve and open feedback",
  "Load review package",
  "Start Director review",
  'action: "APPROVE_AND_OPEN"',
  'method: "GET"',
  'method: "POST"',
  'cache: "no-store"',
  "useEffect(() =>",
  "void loadQueue();",
  "No combined appraisal score",
  "respondentIdentitiesIncluded: false",
  "individualStaffResponsesIncluded: false",
]);

for (const forbidden of [
  'htmlFor="cycle-id"',
  'id="cycle-id"',
  "setCycleId(event.target.value)",
  "The Director cannot rewrite either evidence stream.",
  "setInterval(",
  "setTimeout(",
  "localStorage",
  "sessionStorage",
  "sendSms",
  "sendEmail",
]) {
  assert(!directorClient.includes(forbidden), "Director BBC client contains forbidden marker", forbidden);
}

const headteacherApi = requireMarkers(headteacherApiPath, [
  "HEADTEACHER_APPRAISAL_REQUEST_API_POLICY",
  'methods: ["GET", "POST"]',
  "requestHeadteacherFeedbackCycle",
  "readHeadteacherOwnAppraisalState",
  'targetHeadteacherUserId: access.auth.ctx.userId',
  "EXPLICIT_CONFIRMATION_REQUIRED",
  'req.headers.get("x-idempotency-key")',
  "requestedRespondentUserIds: undefined",
  '"Cache-Control": "no-store, max-age=0"',
  "providerCalled: false",
]);

for (const forbidden of [
  "sendSms",
  "sendEmail",
  "requestedRespondentUserIds: body",
  "prisma.",
]) {
  assert(!headteacherApi.includes(forbidden), "Headteacher request API bypasses service boundary", forbidden);
}

const headteacherClient = requireMarkers(headteacherClientPath, [
  "appraisalState?.canRequestNewCycle",
  "Request appraisal",
  "Refresh status",
  "Appraisal journey",
  "1. Request",
  "2. Director approval",
  "3. Staff feedback",
  "4. Official review",
  "5. Released result",
  'fetch("/api/headteacher/headteacher-appraisal"',
  'method: "POST"',
  'method: "GET"',
  '"X-Idempotency-Key": requestKey',
  "The Director must approve it before confidential staff feedback opens.",
  "The connection was interrupted. Refresh the status before trying again so the request is not duplicated.",
  "Privacy boundary",
  "Load my released result",
  "No combined appraisal score is created.",
]);

for (const forbidden of [
  "useEffect(",
  "setInterval(",
  "setTimeout(",
  "localStorage",
  "sessionStorage",
  "respondentUserId",
  "participantUserId",
  "reviewerUserId",
  "assessorUserId",
  "sendSms",
  "sendEmail",
]) {
  assert(!headteacherClient.includes(forbidden), "Headteacher BBC client contains forbidden marker", forbidden);
}

for (const relativePath of [
  dashboardPath,
  directorClientPath,
  directorApiPath,
  headteacherClientPath,
  headteacherApiPath,
]) {
  transpile(relativePath);
}

console.log("");
console.log("=== D3.5B2A BBC-FRIENDLY APPRAISAL NAVIGATION ===");
console.log("");
console.log("Director dashboard entry        : active and role-directed");
console.log("SISSO dashboard entry           : one office, supervisory workspace");
console.log("Director request queue          : district-scoped, automatic initial GET");
console.log("Director review queue           : closed / under-review records listed");
console.log("Manual appraisal reference      : absent from visible UI");
console.log("Headteacher request action      : explicit confirmation + idempotency");
console.log("Headteacher lifecycle tracking  : request through released result");
console.log("Evidence streams                : separate");
console.log("Respondent identities/forms     : absent");
console.log("Combined appraisal score        : absent");
console.log("Background polling/storage      : absent");
console.log("Notification provider delivery  : absent");
console.log("Database accessed               : false");
console.log("");
console.log("RESULT: D3.5B2A APPRAISAL NAVIGATION GREEN");
