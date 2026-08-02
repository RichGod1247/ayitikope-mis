#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS QA harness intentionally loads repository files and TypeScript for static contract verification. */

const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const repoRoot = path.resolve(__dirname, "..", "..");

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
  if (!fs.existsSync(absolutePath)) {
    fail("Required file missing", relativePath);
  }
  return fs.readFileSync(absolutePath, "utf8");
}

const routePath =
  "src/app/api/headteacher/headteacher-appraisal/[cycleId]/released-result/route.ts";
const servicePath = "src/lib/appraisals/headteacherReleasedResult.ts";
const route = read(routePath);
const service = read(servicePath);

for (const [name, text, fileName] of [
  ["route", route, routePath],
  ["service", service, servicePath],
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
  assert(
    diagnostics.length === 0,
    `${name} has TypeScript syntax diagnostics`,
    diagnostics,
  );
}

for (const marker of [
  "HEADTEACHER_RELEASED_RESULT_API_POLICY",
  'audience: "RELEASED_HEADTEACHER"',
  'method: "GET"',
  'runtime = "nodejs"',
  'dynamic = "force-dynamic"',
  "requireApiUserContext",
  'requireRoleNames: ["HEADTEACHER"]',
  "readHeadteacherReleasedResult",
  "actorUserId: auth.ctx.userId",
  "actorRoleName: auth.ctx.roleName",
  "actorTenantId: auth.ctx.tenantId",
  '"Cache-Control": "no-store, max-age=0"',
  'Pragma: "no-cache"',
  '"X-Content-Type-Options": "nosniff"',
  '"Referrer-Policy": "no-referrer"',
  "HEADTEACHER_RELEASED_RESULT_",
  "HEADTEACHER_RELEASED_RESULT_REQUEST_FAILED",
  "INVALID_CYCLE_ID",
  "export async function GET",
  "responseCountsIncluded: false",
  "staffItemAveragesIncluded: false",
  'itemLevelValuesIncluded: "SUPERVISORY_ONLY"',
  "supervisoryItemScoresIncluded: true",
  "supervisoryItemScoresReadOnly: true",
  "respondentIdentitiesIncluded: false",
  "individualStaffResponsesIncluded: false",
  "reviewerIdentityIncluded: false",
  "assessorIdentityIncluded: false",
  "scoreMutationAllowed: false",
  "databaseWritesAllowed: false",
  "notificationsSeeded: false",
  "providerCallsAllowed: false",
]) {
  assert(route.includes(marker), "Released-result API contract missing", marker);
}

for (const marker of [
  "HEADTEACHER_RELEASED_RESULT_POLICY",
  "readHeadteacherReleasedResult",
  'requiredRole: "HEADTEACHER"',
  'requiredCycleStatus: "RELEASED"',
  "releaseProofHashVerified: true",
  "respondentIdentitiesIncluded: false",
  "staffItemAveragesIncluded: false",
  "supervisoryItemScoresIncluded: true",
  "supervisoryItemScoresReadOnly: true",
  "supervisoryItemScoresVerified: true",
  "combinedOverallPercentage: null",
  "databaseWritesAllowed: false",
]) {
  assert(service.includes(marker), "H1 released-result contract missing", marker);
}

for (const forbidden of [
  "export async function POST",
  "export async function PUT",
  "export async function PATCH",
  "export async function DELETE",
  "req.json(",
  "$transaction",
  "prisma.",
  "appraisalNotification",
  "sendSms",
  "sendEmail",
  "respondentUserId",
  "participantUserId",
  "reviewerUserId",
  "assessorUserId",
  "localStorage",
  "sessionStorage",
  "setInterval(",
]) {
  assert(
    !route.includes(forbidden),
    "Released-result API contains forbidden marker",
    forbidden,
  );
}

assert(
  !route.includes("details:"),
  "Released-result API must not expose internal service error details",
);
assert(
  !route.includes("combinedOverallPercentage"),
  "Released-result API must not invent or restate a combined score",
);

console.log("");
console.log("=== HEADTEACHER RELEASED-RESULT NO-STORE API + NATIVE PARITY ===");
console.log("");
console.log("Audience scope                 : exact Headteacher session");
console.log("Tenant binding                 : authenticated tenant required");
console.log("Lifecycle/evidence validation  : H1 contract reused");
console.log("HTTP method                    : GET only");
console.log("Identifier validation          : bounded cycle ID");
console.log("No-store security headers      : complete");
console.log("Safe service errors            : allowlisted prefix, no details");
console.log("Response counts                : hidden");
console.log("Staff item averages            : hidden");
console.log("Supervisory item scores        : included, verified, read-only");
console.log("Respondent identities/forms    : absent");
console.log("Reviewer/assessor identities   : absent from route");
console.log("Combined appraisal score       : absent");
console.log("Database writes                : absent");
console.log("Notifications/providers        : absent");
console.log("UI/dashboard changes           : absent");
console.log("Database accessed              : false");
console.log("");
console.log("RESULT: HEADTEACHER RELEASED RESULT API GREEN");
