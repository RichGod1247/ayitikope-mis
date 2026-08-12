#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS source-contract QA harness. */

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..", "..");

const files = {
  shared:
    "src/app/api/governance/appraisals/headteacher-supervisory/_shared.ts",
  route:
    "src/app/api/governance/appraisals/headteacher-supervisory/review-queue/route.ts",
  queue:
    "src/lib/appraisals/headteacherSupervisoryReviewQueue.ts",
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

const source = Object.fromEntries(
  Object.entries(files).map(([key, relativePath]) => [key, read(relativePath)]),
);

for (const forbidden of [
  "appraisalReview.create",
  "appraisalReview.update",
  "appraisalCycle.update",
  "appraisalAssessment.update",
  "appraisalAggregateSnapshot",
  "sendSms",
  "sendEmail",
  "export async function POST",
  "export async function PUT",
  "export async function PATCH",
  "export async function DELETE",
]) {
  assert(
    !source.route.includes(forbidden),
    "Headteacher HOS review queue API contains forbidden mutation/provider marker",
    forbidden,
  );
}

for (const required of [
  "HEADTEACHER_SUPERVISORY_REVIEW_QUEUE_POLICY",
  "readHeadteacherSupervisoryReviewQueue",
  "requireSupervisoryGovernanceApiContext",
  "normalizedRole",
  "auth.ctx.userId",
  "auth.ctx.roleName",
  "governanceScope: auth.scope",
  "jsonNoStore",
  'runtime = "nodejs"',
  'dynamic = "force-dynamic"',
  '"[HEADTEACHER_SUPERVISORY_REVIEW_QUEUE_API_ERROR]"',
  "export async function GET",
  "reviewQueue,",
]) {
  assert(
    source.route.includes(required),
    "Headteacher HOS review queue API contract marker missing",
    required,
  );
}

assert(
  source.route.includes(
    "HEADTEACHER_SUPERVISORY_REVIEW_QUEUE_POLICY.reviewerRole",
  ) &&
    source.route.includes("return jsonNoStore(403"),
  "Route must narrow broad supervisory authentication to HOS only",
);

assert(
  source.shared.includes('"Cache-Control": "no-store, max-age=0"') &&
    source.shared.includes('"X-Content-Type-Options": "nosniff"'),
  "Existing no-store/nosniff response boundary missing",
);

for (const forbiddenPayload of [
  "sectionPercentagesJson",
  "overallPercentage",
  "evidenceSnapshotJson",
  "assessmentHash",
  "scores:",
  "aggregateSnapshot",
  "respondentUserId",
  "responseHash",
]) {
  assert(
    !source.route.includes(forbiddenPayload),
    "Thin Headteacher HOS review queue route must not project evidence/private data",
    forbiddenPayload,
  );
}

for (const requiredQueueContract of [
  'reviewerRole: "HEAD_OF_SUPERVISION"',
  'eligibleAssessorRoles: ["SISSO", "BASIC_SCHOOL_COORDINATOR"]',
  'requiredAssessmentStatus: "FINALIZED"',
  'requiredCycleStatus: "CLOSED"',
  "requiredReviewCount: 0",
  "supervisoryEvidenceIncluded: false",
  "staffFeedbackIncluded: false",
  "respondentIdentitiesIncluded: false",
  "individualStaffResponsesIncluded: false",
  "contactDetailsIncluded: false",
  "assessorUserIdIncluded: false",
  "targetUserIdIncluded: false",
  "reviewIdIncluded: false",
  "assignmentIdsIncluded: false",
  "proofHashesIncluded: false",
  "noBackgroundPolling: true",
  "providerCalled: false",
]) {
  assert(
    source.queue.includes(requiredQueueContract),
    "Headteacher HOS review queue browser contract marker missing",
    requiredQueueContract,
  );
}

console.log("");
console.log("=== N6-F1C6B1 HOS HEADTEACHER REVIEW QUEUE THIN API ===");
console.log("");
console.log("Endpoint                         : governance Headteacher review queue GET");
console.log("Audience                         : Head of Supervision only");
console.log("Broader assessor auth helper     : retained + narrowed at route boundary");
console.log("SISSO/BSC/Director API access    : forbidden");
console.log("Verified governance scope        : passed to read-only queue service");
console.log("Response                         : compact reviewQueue metadata");
console.log("Supervisory form/scores          : excluded");
console.log("Confidential staff feedback      : excluded");
console.log("Respondent identities/forms      : excluded");
console.log("Browser authority IDs/hashes     : excluded");
console.log("Review creation                  : absent");
console.log("Cycle transition                 : absent");
console.log("Assessment mutation              : absent");
console.log("HTTP mutation methods            : absent");
console.log("No-store / nosniff               : inherited from shared boundary");
console.log("Notifications/providers          : absent");
console.log("Database writes                  : absent");
console.log("Database accessed                : source contract only");
console.log("");
console.log("RESULT: N6-F1C6B1 HOS HEADTEACHER REVIEW QUEUE THIN API GREEN");
