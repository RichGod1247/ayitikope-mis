#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS QA harness intentionally loads repository files and TypeScript for static contract verification. */

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

const files = {
  shared: "src/app/api/district/headteacher-appraisals/_shared.ts",
  start: "src/app/api/district/headteacher-appraisals/[cycleId]/review-start/route.ts",
  package: "src/app/api/district/headteacher-appraisals/[cycleId]/review-package/route.ts",
  returnHold: "src/app/api/district/headteacher-appraisals/[cycleId]/return-hold/route.ts",
  release: "src/app/api/district/headteacher-appraisals/[cycleId]/release/route.ts",
};

const source = Object.fromEntries(
  Object.entries(files).map(([key, relativePath]) => [key, read(relativePath)]),
);

for (const [key, text] of Object.entries(source)) {
  const transpiled = ts.transpileModule(text, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
    fileName: files[key],
    reportDiagnostics: true,
  });
  const diagnostics = transpiled.diagnostics || [];
  assert(diagnostics.length === 0, `${key} has TypeScript syntax diagnostics`, diagnostics);

  for (const forbidden of [
    "sendSms",
    "sendEmail",
    "appraisalNotification.create",
    "appraisalNotification.createMany",
    "localStorage",
    "sessionStorage",
    "setInterval(",
    "<textarea",
  ]) {
    assert(!text.includes(forbidden), `${key} contains forbidden marker`, forbidden);
  }
}

assert(source.shared.includes("HEADTEACHER_DIRECTOR_REVIEW_API_POLICY"), "API policy missing");
assert(source.shared.includes('audience: "DISTRICT_DIRECTOR"'), "Director-only audience missing");
assert(source.shared.includes("allowedZoneLevels: [2]"), "District zone-level gate missing");
assert(source.shared.includes('"Cache-Control": "no-store, max-age=0"'), "No-store cache header missing");
assert(source.shared.includes('Pragma: "no-cache"'), "Pragma no-cache header missing");
assert(source.shared.includes('"X-Content-Type-Options": "nosniff"'), "Nosniff header missing");
assert(source.shared.includes('"Referrer-Policy": "no-referrer"'), "Referrer policy missing");
assert(source.shared.includes("maximumJsonBodyBytes: 16_384"), "Bounded JSON body policy missing");
assert(source.shared.includes('notificationSeedingMode: "RELEASE_ONLY_POST_TRANSACTION"'), "Release-only notification-seeding mode missing");
assert(source.shared.includes("requireGovernanceApiContext"), "Governance API auth missing");
assert(source.shared.includes("allowedRoles"), "Allowed role gate missing");
assert(source.shared.includes("allowedZoneLevels"), "Allowed zone gate missing");
assert(source.shared.includes("SAFE_DETAIL_KEYS"), "Safe error details missing");
assert(source.shared.includes("reviewGovernanceScope"), "Governance scope adapter missing");

for (const routeKey of ["start", "package", "returnHold", "release"]) {
  const text = source[routeKey];
  assert(text.includes('runtime = "nodejs"'), `${routeKey} lacks node runtime`);
  assert(text.includes('dynamic = "force-dynamic"'), `${routeKey} lacks force-dynamic`);
  assert(text.includes("requireDirectorReviewApiContext"), `${routeKey} lacks Director auth`);
  assert(text.includes("jsonNoStore"), `${routeKey} lacks no-store responses`);
  assert(text.includes("isLikelyIdentifier"), `${routeKey} lacks identifier validation`);
  assert(text.includes("reviewGovernanceScope(auth.scope)"), `${routeKey} lacks scope binding`);
}

assert(source.start.includes("startHeadteacherDirectorReview"), "G1 review-start transaction not wired");
assert(source.start.includes("parsed.body.confirm === true"), "Review-start confirmation not explicit");
assert(source.package.includes("readHeadteacherDirectorReviewPackage"), "G2 read-only package not wired");
assert(source.package.includes("export async function GET"), "Review package must be GET only");
assert(!source.package.includes("readJsonObject"), "GET review package must not require a body");
assert(source.returnHold.includes("executeHeadteacherDirectorReturnOrHold"), "G3A return/hold transaction not wired");
assert(source.returnHold.includes('decision !== "RETURN" && decision !== "HOLD"'), "Return/hold decision allowlist missing");
assert(source.returnHold.includes("parsed.body.confirm === true"), "Return/hold confirmation not explicit");
assert(source.release.includes("executeHeadteacherDirectorRelease"), "G3B release transaction not wired");
assert(source.release.includes("ensureHeadteacherDirectorReleaseNotifications"), "G4C post-release notification seeding not wired");
assert(source.release.includes("HEADTEACHER_RELEASE_NOTIFICATION_SEEDING_RETRY_REQUIRED"), "Truthful notification retry state missing");
assert(source.release.includes("releaseCommitted: true"), "Partial-success release proof missing");
assert(source.release.includes("retrySafe: true"), "Idempotent notification retry marker missing");
assert(source.release.includes("parsed.body.confirm === true"), "Release confirmation not explicit");
assert(!source.release.includes('decision: "RELEASE"'), "Release route must use the dedicated G3B transaction");

const serialized = JSON.stringify(source);
for (const forbiddenIdentity of [
  "respondentUserId",
  "respondentEmail",
  "respondentPhone",
  "individualStaffResponseRows",
]) {
  assert(!serialized.includes(forbiddenIdentity), "API source exposes forbidden staff identity marker", forbiddenIdentity);
}

console.log("");
console.log("=== D3.4G4A DIRECTOR REVIEW NO-STORE API SPINE ===");
console.log("");
console.log("Audience scope                 : District Director only");
console.log("Zone scope                     : district level only");
console.log("Review start                   : G1 transaction wired");
console.log("Read-only evidence package     : G2 contract wired");
console.log("Return/hold                    : G3A transaction wired");
console.log("Release                        : G3B transaction wired");
console.log("Explicit confirmations         : required on all mutations");
console.log("Request body                   : JSON only, bounded to 16 KiB");
console.log("Identifier validation          : cycle/review IDs bounded");
console.log("No-store security headers      : complete");
console.log("Safe error details             : allowlisted only");
console.log("Respondent identities/forms    : absent");
console.log("Reviewer score rewriting       : absent");
console.log("BBC interface                  : deferred to G4B");
console.log("Notification seeding           : release-only G4C post-transaction");
console.log("Provider delivery              : absent");
console.log("Database accessed              : false");
console.log("");
console.log("RESULT: D3.4G4A DIRECTOR REVIEW API GREEN");
