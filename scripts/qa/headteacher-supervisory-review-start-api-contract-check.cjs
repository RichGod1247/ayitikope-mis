#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS source-contract QA harness. */

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..", "..");

const routePath =
  "src/app/api/governance/appraisals/headteacher-supervisory/review-queue/[assessmentId]/start/route.ts";
const sharedPath =
  "src/app/api/governance/appraisals/headteacher-supervisory/_shared.ts";

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
  assert(fs.existsSync(absolutePath), "N6_F1C6B3A_REQUIRED_FILE_MISSING", {
    relativePath,
  });
  return fs
    .readFileSync(absolutePath, "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
}

const route = read(routePath);
const shared = read(sharedPath);

for (const required of [
  "startHeadteacherSupervisoryHosReview",
  "requireSupervisoryGovernanceApiContext",
  'normalizedRole(auth.ctx.roleName) !== "HEAD_OF_SUPERVISION"',
  "requestIsJson(req)",
  "isUuidIdentifier(assessmentId)",
  "bodyHasOnlyConfirm",
  "body.confirm !== true",
  "actorUserId: auth.ctx.userId",
  "actorRoleName: auth.ctx.roleName",
  "governanceScope: auth.scope",
  "reqId: meta.reqId",
  "ip: meta.ip",
  "userAgent: meta.userAgent",
  "result.outcome === \"STARTED\" ? 201 : 200",
  "export async function POST",
  'runtime = "nodejs"',
  'dynamic = "force-dynamic"',
  "[HEADTEACHER_SUPERVISORY_REVIEW_START_API_ERROR]",
]) {
  assert(
    route.includes(required),
    "N6_F1C6B3A_START_API_MARKER_MISSING",
    required,
  );
}

for (const forbidden of [
  "prisma",
  "appraisalReview.create",
  "appraisalCycle.update",
  "appraisalAssessment.update",
  "assessorUserId",
  "targetUserId",
  "reviewerAssignmentId",
  "assessmentHash",
  "visitContextHash",
  "reviewEvidenceHash",
  "sendSms",
  "sendEmail",
  "export async function PUT",
  "export async function PATCH",
  "export async function DELETE",
]) {
  assert(
    !route.includes(forbidden),
    "N6_F1C6B3A_START_API_FORBIDDEN_MARKER",
    forbidden,
  );
}

assert(
  shared.includes('"Cache-Control": "no-store, max-age=0"') &&
    shared.includes('"X-Content-Type-Options": "nosniff"'),
  "N6_F1C6B3A_NO_STORE_BOUNDARY_MISSING",
);

console.log("");
console.log("=== N6-F1C6B3A HOS HEADTEACHER REVIEW START THIN API ===");
console.log("");
console.log("Method                           : POST");
console.log("Audience                         : Head of Supervision only");
console.log("Assessment identifier            : strict UUID");
console.log("Body                             : { confirm: true } only");
console.log("Actor/reviewer identity          : server authenticated");
console.log("Governance scope                 : server verified");
console.log("Direct Prisma/provider calls     : absent");
console.log("Browser authority/proof fields   : absent");
console.log("No-store / nosniff               : inherited");
console.log("Retry result                     : 200 EXISTING_REVIEW");
console.log("Fresh start                      : 201 STARTED");
console.log("Database accessed                : source contract only");
console.log("");
console.log("RESULT: N6-F1C6B3A HOS HEADTEACHER REVIEW START API GREEN");
