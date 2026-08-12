#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS QA harness intentionally inspects TypeScript route source. */

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..", "..");
const relativePath =
  "src/app/api/governance/appraisals/headteacher-supervisory/review-queue/[assessmentId]/package/route.ts";
const source = fs.readFileSync(path.join(repoRoot, relativePath), "utf8");

function fail(message, detail) {
  const suffix = detail === undefined ? "" : `\n${JSON.stringify(detail, null, 2)}`;
  throw new Error(`${message}${suffix}`);
}
function assert(condition, message, detail) {
  if (!condition) fail(message, detail);
}
function requireMarkers(markers) {
  for (const marker of markers) {
    assert(source.includes(marker), "N6_F1C6B2_API_REQUIRED_MARKER_MISSING", {
      marker,
    });
  }
}
function forbidMarkers(markers) {
  for (const marker of markers) {
    assert(!source.includes(marker), "N6_F1C6B2_API_FORBIDDEN_MARKER_PRESENT", {
      marker,
    });
  }
}

requireMarkers([
  'export const runtime = "nodejs";',
  'export const dynamic = "force-dynamic";',
  "export async function GET(",
  "requireSupervisoryGovernanceApiContext",
  "HEADTEACHER_SUPERVISORY_REVIEW_PACKAGE_POLICY.audience",
  'error: "FORBIDDEN"',
  "isUuidIdentifier(assessmentId)",
  'error: "INVALID_ASSESSMENT_ID"',
  "readHeadteacherSupervisoryReviewPackage",
  "actorUserId: auth.ctx.userId",
  "actorRoleName: auth.ctx.roleName",
  "assessmentId,",
  "governanceScope: auth.scope",
  "jsonNoStore(200",
  "reviewPackage,",
  "supervisoryApiError",
  "[HEADTEACHER_SUPERVISORY_REVIEW_PACKAGE_API_ERROR]",
]);

forbidMarkers([
  "export async function POST(",
  "export async function PUT(",
  "export async function PATCH(",
  "export async function DELETE(",
  "prisma.",
  "appraisalReview.create",
  "appraisalReview.update",
  "appraisalAssessment.update",
  "$transaction(",
  "sendSms",
  "sendEmail",
  "readHeadteacherFeedbackAggregateReadiness",
  "HeadteacherDirectorAnonymousResponses",
  "requestIsJson(",
  "req.json(",
]);

const sharedPath =
  "src/app/api/governance/appraisals/headteacher-supervisory/_shared.ts";
const shared = fs.readFileSync(path.join(repoRoot, sharedPath), "utf8");

for (const marker of [
  '"Cache-Control": "no-store, max-age=0"',
  'Pragma: "no-cache"',
  '"X-Content-Type-Options": "nosniff"',
  '"Referrer-Policy": "no-referrer"',
]) {
  assert(
    shared.includes(marker),
    "N6_F1C6B2_SHARED_NO_STORE_MARKER_MISSING",
    marker,
  );
}

console.log("");
console.log("=== N6-F1C6B2 HOS HEADTEACHER REVIEW PACKAGE THIN API ===");
console.log("");
console.log("Endpoint                         : HOS Headteacher immutable review package GET");
console.log("Audience                         : Head of Supervision only");
console.log("Broader supervisory auth helper : retained + narrowed at route boundary");
console.log("Assessment identifier            : strict UUID");
console.log("Verified governance scope        : passed to authoritative package service");
console.log("Native supervisory form          : returned read-only");
console.log("Confidential staff feedback      : excluded");
console.log("Respondent identities/forms      : excluded");
console.log("Review creation                  : absent");
console.log("Cycle transition                 : absent");
console.log("Assessment mutation              : absent");
console.log("JSON mutation body               : absent");
console.log("HTTP mutation methods            : absent");
console.log("No-store / nosniff               : inherited from shared boundary");
console.log("Notifications/providers          : absent");
console.log("Database writes                  : absent");
console.log("Database accessed                : source contract only");
console.log("");
console.log("RESULT: N6-F1C6B2 HOS HEADTEACHER REVIEW PACKAGE THIN API GREEN");
