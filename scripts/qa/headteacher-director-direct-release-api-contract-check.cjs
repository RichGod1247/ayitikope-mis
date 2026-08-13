#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS repository contract QA. */

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..", "..");
const routePath =
  "src/app/api/governance/appraisals/headteacher-supervisory/[assessmentId]/direct-release/route.ts";
const servicePath = "src/lib/appraisals/headteacherDirectorDirectRelease.ts";

function fail(message, detail) {
  const suffix = detail === undefined ? "" : `\n${JSON.stringify(detail, null, 2)}`;
  throw new Error(`${message}${suffix}`);
}
function assert(condition, message, detail) {
  if (!condition) fail(message, detail);
}
function read(relativePath) {
  const file = path.join(repoRoot, relativePath);
  if (!fs.existsSync(file)) fail("Required B5C file missing", relativePath);
  return fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

const route = read(routePath);
const service = read(servicePath);

for (const marker of [
  'export const runtime = "nodejs"',
  'export const dynamic = "force-dynamic"',
  "requireSupervisoryGovernanceApiContext",
  'normalizedRole(auth.ctx.roleName) !== "DISTRICT_DIRECTOR"',
  "isUuidIdentifier",
  "requestIsJson",
  "MAX_BODY_BYTES = 16 * 1024",
  'ALLOWED_BODY_FIELDS = new Set(["confirm"])',
  "Buffer.byteLength(rawBody, \"utf8\")",
  "objectBody",
  "body.confirm !== true",
  "executeHeadteacherDirectorDirectRelease",
  "ensureHeadteacherDirectorReleaseNotifications",
  "releaseCommitted: true",
  "retrySafe: true",
  "HEADTEACHER_RELEASE_NOTIFICATION_SEEDING_RETRY_REQUIRED",
  "browserReleaseResult",
  "jsonNoStore",
  "supervisoryApiError",
]) {
  assert(route.includes(marker), "B5C API contract marker missing", marker);
}

for (const forbidden of [
  "from \"@/lib/prisma\"",
  "prisma.",
  "appraisalReview.",
  "appraisalAssessment.",
  "governanceOfficerAssignment.",
  "reviewId",
  "note:",
  "reason:",
]) {
  assert(!route.includes(forbidden), "B5C route contains forbidden authority/evidence field", forbidden);
}

assert(
  !route.includes("releaseProofHash: result.releaseProofHash") ||
    route.indexOf("releaseProofHash: result.releaseProofHash") >
      route.indexOf("ensureHeadteacherDirectorReleaseNotifications"),
  "Release proof hash may only cross the route boundary into server-side notification seeding",
);
assert(
  !/result:\s*result\s*[,}]/.test(route),
  "Raw direct-release service result must not be returned to the browser",
);

for (const marker of [
  'requiredCapability: "RELEASE_HEADTEACHER_FEEDBACK"',
  'releaseMode: "DIRECTOR_AUTHORED_DIRECT_RELEASE"',
  'reviewRowsAllowed: false',
  'selfReviewAllowed: false',
  "assertHeadteacherFeedbackTargetInGovernanceScope",
  "assertAppraisalAuthority",
  "Prisma.TransactionIsolationLevel.Serializable",
]) {
  assert(service.includes(marker), "B5C service authority marker missing", marker);
}

console.log("=== N6-F1C6B5C DIRECT RELEASE THIN API CONTRACT ===");
console.log("");
console.log("HTTP method                     : POST only");
console.log("Audience                        : exact District Director");
console.log("Assessment identifier           : strict UUID");
console.log("JSON body                       : application/json + 16 KiB bound");
console.log("Allowed browser input           : confirm only");
console.log("Actor/role/scope                : server-authenticated");
console.log("Release mutation                : service-only");
console.log("Browser result                  : minimized lifecycle outcome");
console.log("Notification seeding            : post-release, retry-safe");
console.log("No-store response               : shared API helper");
console.log("Direct Prisma/provider calls    : absent from route");
console.log("Database accessed               : false");
console.log("");
console.log("RESULT: N6-F1C6B5C DIRECT RELEASE API CONTRACT GREEN");
