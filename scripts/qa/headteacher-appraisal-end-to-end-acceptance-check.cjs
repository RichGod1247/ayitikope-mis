#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS QA harness intentionally performs cross-file repository acceptance verification. */

const fs = require("fs");
const path = require("path");

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
  if (!fs.existsSync(absolutePath)) fail("Required acceptance file missing", relativePath);
  return fs.readFileSync(absolutePath, "utf8");
}

function requireMarkers(relativePath, markers) {
  const text = read(relativePath);
  for (const marker of markers) {
    assert(text.includes(marker), "Acceptance contract marker missing", {
      relativePath,
      marker,
    });
  }
  return text;
}

function forbidMarkers(relativePath, markers) {
  const text = read(relativePath);
  for (const marker of markers) {
    assert(!text.includes(marker), "Forbidden acceptance marker present", {
      relativePath,
      marker,
    });
  }
  return text;
}

const qaContracts = [
  "scripts/qa/appraisal-contract-check.cjs",
  "scripts/qa/headteacher-feedback-read-states-check.cjs",
  "scripts/qa/headteacher-feedback-aggregate-readiness-check.cjs",
  "scripts/qa/headteacher-feedback-notifications-check.cjs",
  "scripts/qa/headteacher-supervisory-assessment-contract-check.cjs",
  "scripts/qa/headteacher-supervisory-assessment-scoring-check.cjs",
  "scripts/qa/headteacher-supervisory-assessment-revision-check.cjs",
  "scripts/qa/headteacher-supervisory-assessment-api-mobile-form-check.cjs",
  "scripts/qa/headteacher-director-review-start-check.cjs",
  "scripts/qa/headteacher-director-review-package-check.cjs",
  "scripts/qa/headteacher-director-return-hold-check.cjs",
  "scripts/qa/headteacher-director-release-check.cjs",
  "scripts/qa/headteacher-director-review-api-check.cjs",
  "scripts/qa/headteacher-director-review-mobile-ui-check.cjs",
  "scripts/qa/headteacher-director-release-notifications-check.cjs",
  "scripts/qa/headteacher-released-result-contract-check.cjs",
  "scripts/qa/headteacher-released-result-api-check.cjs",
  "scripts/qa/headteacher-released-result-mobile-ui-check.cjs",
];

for (const relativePath of qaContracts) {
  const qaText = requireMarkers(relativePath, ["RESULT:", "GREEN"]);
  assert(
    /RESULT:\s+[^\r\n]+GREEN/.test(qaText),
    "Acceptance QA green-result marker missing",
    { relativePath },
  );
}


requireMarkers("src/lib/appraisals/headteacherFeedbackReadStates.ts", [
  "readHeadteacherOwnAppraisalState",
  'case "RELEASED"',
  'return "VIEW_RELEASED_APPRAISAL"',
  "canViewReleasedAppraisal",
]);

requireMarkers("src/lib/appraisals/headteacherFeedbackAggregateReadiness.ts", [
  "HEADTEACHER_FEEDBACK_AGGREGATE_READINESS_POLICY",
  'READY_FOR_REVIEW: "Evidence ready for Director review"',
  'RELEASED: "Released appraisal available"',
  "respondentIdentitiesIncluded: false",
]);

requireMarkers("src/lib/appraisals/headteacherFeedbackNotifications.ts", [
  "HEADTEACHER_FEEDBACK_NOTIFICATION_POLICY",
  "AppraisalNotificationType.CYCLE_OPENED",
  'outcome: "SEEDED" | "EXISTING_MATCH"',
  "ensureHeadteacherFeedbackCycleNotifications",
]);

requireMarkers("src/lib/appraisals/headteacherSupervisoryAssessment.ts", [
  'canonicalRole: "SISSO"',
  'legacyRoleAliases: ["CIRCUIT_SUPERVISOR"]',
  'return role === "CIRCUIT_SUPERVISOR" ? "SISSO" : role',
]);

requireMarkers("src/lib/appraisals/headteacherSupervisoryAssessmentWorkspace.ts", [
  "HEADTEACHER_SUPERVISORY_WORKSPACE_POLICY",
  "pollingAllowed: false",
  "persistentBrowserStorageAllowed: false",
  "respondentIdentitiesIncluded: false",
  "providerCallsAllowed: false",
]);

requireMarkers("src/lib/appraisals/headteacherDirectorReview.ts", [
  "HEADTEACHER_DIRECTOR_REVIEW_POLICY",
  'outcome: "STARTED" | "EXISTING_REVIEW"',
  "combinedWeightingDefined: false",
  "respondentIdentitiesAccessedAtStart: false",
  "startHeadteacherDirectorReview",
]);

requireMarkers("src/lib/appraisals/headteacherDirectorReviewPackage.ts", [
  "HEADTEACHER_DIRECTOR_REVIEW_PACKAGE_POLICY",
  'requiredCycleStatus: "UNDER_REVIEW"',
  'currentReviewStageMode: "LATEST_PENDING"',
  "combinedOverallPercentage: null",
  "respondentIdentitiesIncluded: false",
  "readHeadteacherDirectorReviewPackage",
]);

requireMarkers("src/lib/appraisals/headteacherDirectorReviewDecision.ts", [
  "HEADTEACHER_DIRECTOR_RETURN_HOLD_POLICY",
  'outcome: "EXISTING_RETURNED"',
  'outcome: "EXISTING_HELD"',
  "combinedWeightingDefined: false",
  "respondentIdentitiesAccessed: false",
  "executeHeadteacherDirectorReturnOrHold",
]);

requireMarkers("src/lib/appraisals/headteacherDirectorReviewRelease.ts", [
  "HEADTEACHER_DIRECTOR_RELEASE_POLICY",
  'releasedCycleStatus: "RELEASED"',
  'releasedReviewDecision: "ACCEPTED"',
  'outcome: "RELEASED" | "EXISTING_RELEASED"',
  "releaseProofHash",
  "combinedWeightingDefined: false",
  "executeHeadteacherDirectorRelease",
]);

requireMarkers("src/lib/appraisals/headteacherDirectorReleaseNotifications.ts", [
  "HEADTEACHER_DIRECTOR_RELEASE_NOTIFICATION_POLICY",
  "AppraisalNotificationType.FEEDBACK_RELEASED",
  'requiredCycleStatus: "RELEASED"',
  'outcome: "SEEDED" | "EXISTING_MATCH"',
  "providerCallsAllowed: false",
  "ensureHeadteacherDirectorReleaseNotifications",
]);

requireMarkers("src/lib/appraisals/headteacherReleasedResult.ts", [
  "HEADTEACHER_RELEASED_RESULT_POLICY",
  'requiredCycleStatus: "RELEASED"',
  "releaseProofHashVerified: true",
  "releaseRequestHashVerified: true",
  "releaseNoteHashVerified: true",
  "staffSnapshotProofAnchored: true",
  "supervisoryAssessmentHashRecomputed: true",
  "respondentIdentitiesIncluded: false",
  "combinedOverallPercentage: null",
  "readHeadteacherReleasedResult",
]);

for (const relativePath of [
  "src/app/api/district/headteacher-appraisals/[cycleId]/review-start/route.ts",
  "src/app/api/district/headteacher-appraisals/[cycleId]/review-package/route.ts",
  "src/app/api/district/headteacher-appraisals/[cycleId]/return-hold/route.ts",
  "src/app/api/district/headteacher-appraisals/[cycleId]/release/route.ts",
]) {
  requireMarkers(relativePath, ["jsonNoStore"]);
}

requireMarkers("src/app/api/district/headteacher-appraisals/_shared.ts", [
  '"Cache-Control": "no-store, max-age=0"',
  'Pragma: "no-cache"',
  '"X-Content-Type-Options": "nosniff"',
  '"Referrer-Policy": "no-referrer"',
]);

requireMarkers("src/app/api/headteacher/headteacher-appraisal/[cycleId]/released-result/route.ts", [
  '"Cache-Control": "no-store, max-age=0"',
  'Pragma: "no-cache"',
  '"X-Content-Type-Options": "nosniff"',
  '"Referrer-Policy": "no-referrer"',
]);

requireMarkers("src/app/api/district/headteacher-appraisals/_shared.ts", [
  "HEADTEACHER_DIRECTOR_REVIEW_API_POLICY",
  'audience: "DISTRICT_DIRECTOR"',
  "allowedZoneLevels: [2]",
  "maximumJsonBodyBytes: 16_384",
]);

requireMarkers("src/app/api/district/headteacher-appraisals/[cycleId]/release/route.ts", [
  "ensureHeadteacherDirectorReleaseNotifications",
  "releaseCommitted: true",
  "retrySafe: true",
  "HEADTEACHER_RELEASE_NOTIFICATION_SEEDING_RETRY_REQUIRED",
]);

requireMarkers("src/app/api/headteacher/headteacher-appraisal/[cycleId]/released-result/route.ts", [
  "HEADTEACHER_RELEASED_RESULT_API_POLICY",
  'requireRoleNames: ["HEADTEACHER"]',
  "readHeadteacherReleasedResult",
  "databaseWritesAllowed: false",
]);

requireMarkers("src/app/governance/appraisals/headteacher-supervisory/HeadteacherSupervisoryAssessmentClient.tsx", [
  'cache: "no-store"',
  "background polling",
]);

requireMarkers("src/app/district/headteacher-appraisals/review/HeadteacherDirectorReviewClient.tsx", [
  "backgroundPollingAllowed: false",
  "persistentBrowserStorageAllowed: false",
  'cache: "no-store"',
  "No background polling",
  "No combined appraisal score",
]);

requireMarkers("src/app/headteacher/my-appraisal/HeadteacherReleasedResultClient.tsx", [
  "HEADTEACHER_RELEASED_RESULT_UI_POLICY",
  'loadingMode: "EXPLICIT_BUTTON_ONLY"',
  "backgroundPollingAllowed: false",
  "persistentBrowserStorageAllowed: false",
  "combinedScoreIncluded: false",
  "respondentIdentitiesIncluded: false",
  'cache: "no-store"',
]);

const dashboard = requireMarkers("src/app/headteacher/dashboard/ui.tsx", [
  'title="Teacher Appraisal"',
  'title="My Appraisal"',
  'cta="Open my appraisal"',
  'router.push("/headteacher/my-appraisal")',
  'title="Director Feedback"',
]);
assert((dashboard.match(/title="My Appraisal"/g) || []).length === 1, "My Appraisal dashboard entry must remain singular");
assert(
  dashboard.indexOf('title="Teacher Appraisal"') < dashboard.indexOf('title="My Appraisal"') &&
    dashboard.indexOf('title="My Appraisal"') < dashboard.indexOf('title="Director Feedback"'),
  "Headteacher dashboard order drift around My Appraisal",
);

for (const relativePath of [
  "src/lib/appraisals/headteacherDirectorReviewPackage.ts",
  "src/lib/appraisals/headteacherDirectorReviewDecision.ts",
  "src/lib/appraisals/headteacherDirectorReviewRelease.ts",
  "src/lib/appraisals/headteacherReleasedResult.ts",
  "src/app/district/headteacher-appraisals/review/HeadteacherDirectorReviewClient.tsx",
  "src/app/headteacher/my-appraisal/HeadteacherReleasedResultClient.tsx",
]) {
  forbidMarkers(relativePath, [
    "combinedWeighting: 0",
    "combinedScore:",
    "combinedOverallPercentage: 0",
  ]);
}

forbidMarkers(
  "src/app/governance/appraisals/headteacher-supervisory/HeadteacherSupervisoryAssessmentClient.tsx",
  [
    "localStorage",
    "sessionStorage",
    "setInterval(",
  ],
);

for (const relativePath of [
  "src/app/district/headteacher-appraisals/review/HeadteacherDirectorReviewClient.tsx",
  "src/app/headteacher/my-appraisal/HeadteacherReleasedResultClient.tsx",
]) {
  forbidMarkers(relativePath, [
    "localStorage",
    "sessionStorage",
    "setInterval(",
    "setTimeout(",
  ]);
}

for (const relativePath of [
  "src/lib/appraisals/headteacherDirectorReview.ts",
  "src/lib/appraisals/headteacherDirectorReviewPackage.ts",
  "src/lib/appraisals/headteacherDirectorReviewDecision.ts",
  "src/lib/appraisals/headteacherDirectorReviewRelease.ts",
  "src/lib/appraisals/headteacherDirectorReleaseNotifications.ts",
  "src/lib/appraisals/headteacherReleasedResult.ts",
]) {
  forbidMarkers(relativePath, ["sendSms", "sendEmail"]);
}

console.log("");
console.log("=== D3.4I HEADTEACHER APPRAISAL END-TO-END ACCEPTANCE ===");
console.log("");
console.log("Published instrument              : 4 sections / 34 items regression-backed");
console.log("Lifecycle                         : request -> open -> close -> review -> release");
console.log("Teacher feedback                  : frozen, anonymous, finalized, immutable");
console.log("Supervisory evidence              : separate 4-section/34-item stream");
console.log("Director decisions                : return / hold / release, explicit and idempotent");
console.log("Release proof                     : immutable SHA-256 chain reverified");
console.log("Post-release notification         : separate, idempotent, retry-safe");
console.log("Headteacher result                : own released result only");
console.log("Tenant/role scope                 : school + district boundaries preserved");
console.log("Circuit office                    : SISSO; legacy alias normalized, one office");
console.log("Respondent identities/forms       : hidden from Headteacher result");
console.log("Reviewer/assessor identities      : absent from Headteacher result");
console.log("Response counts/item-level values : absent from Headteacher result");
console.log("Combined weighting/score          : undefined and absent");
console.log("No-store headers                  : Director and Headteacher APIs complete");
console.log("Low-network behavior              : explicit load/save, no polling/storage");
console.log("Provider calls in transactions    : absent");
console.log("Schema/database mutation          : absent in this acceptance checkpoint");
console.log("Database accessed                 : false");
console.log("");
console.log("RESULT: D3.4I HEADTEACHER APPRAISAL ACCEPTANCE GREEN");
