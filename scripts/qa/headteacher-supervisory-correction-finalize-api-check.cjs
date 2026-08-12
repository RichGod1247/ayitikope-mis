#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS QA source-contract harness. */

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..", "..");

function read(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  assert(fs.existsSync(absolutePath), `Required file missing: ${relativePath}`);
  return fs.readFileSync(absolutePath, "utf8");
}

const finalize = read(
  "src/app/api/governance/appraisals/headteacher-supervisory/[assessmentId]/finalize/route.ts",
);
const continuation = read(
  "src/lib/appraisals/headteacherSupervisoryCorrectionReviewContinuation.ts",
);
const mobileQa = read(
  "scripts/qa/headteacher-supervisory-assessment-api-mobile-form-check.cjs",
);

for (const marker of [
  'runtime = "nodejs"',
  'dynamic = "force-dynamic"',
  "requireSupervisoryGovernanceApiContext",
  "requestIsJson",
  "isUuidIdentifier",
  "jsonNoStore",
  "finalizeHeadteacherSupervisoryAssessment",
  "confirmFinalization",
  "ensureHeadteacherSupervisoryCorrectionReviewContinuation",
  "finalizationCommitted: true",
  "retrySafe: true",
  "HEADTEACHER_SUPERVISORY_FINALIZATION_CONTINUATION_RETRY_REQUIRED",
]) {
  assert(finalize.includes(marker), `Finalize route marker missing: ${marker}`);
}

assert(
  finalize.indexOf("finalizeHeadteacherSupervisoryAssessment") <
    finalize.lastIndexOf("ensureHeadteacherSupervisoryCorrectionReviewContinuation"),
  "Correction continuation must run only after scoring finalization",
);
assert(
  !finalize.includes("ensureHeadteacherDirectorCorrectionReviewContinuation"),
  "Finalize route must not directly select Director correction custody",
);
assert(
  !finalize.includes("auth.scope"),
  "Finalize route must not depend on an unverified auth scope shape",
);
for (const forbidden of [
  "prisma.",
  "appraisalReview.",
  "appraisalCycle.",
  "sendSms",
  "sendEmail",
  "localStorage",
  "sessionStorage",
  "setInterval(",
]) {
  assert(!finalize.includes(forbidden), `Finalize route contains forbidden marker: ${forbidden}`);
}

for (const marker of [
  "ensureHeadteacherSupervisoryCorrectionReviewContinuation",
  'continuationReviewerRole: "HEAD_OF_SUPERVISION"',
  'continuationReviewerRole: result.continuationRequired',
  '"DISTRICT_DIRECTOR"',
  "ensureHeadteacherDirectorCorrectionReviewContinuation",
  "headteacherSupervisoryReturn",
  "returnedByDirectorReviewId",
  "returnReviewId",
  "returnReviewStage",
  "returnEvidenceHash",
  "sourceAssessmentHash",
  "visitContextHash",
  'reviewType: "HOS_SUPERVISORY_REVIEW"',
  'continuationType: "CORRECTED_ASSESSMENT"',
  'decision: "PENDING"',
  "preserveReturningReviewer: true",
  "preserveReviewStage: true",
  "Prisma.TransactionIsolationLevel.Serializable",
]) {
  assert(continuation.includes(marker), `Continuation service marker missing: ${marker}`);
}

for (const forbidden of [
  "appraisalAggregateSnapshot",
  "headteacherFeedbackResponse",
  "respondentUserId",
  "sendSms",
  "sendEmail",
  "appraisalAssessment.update",
  "appraisalAssessmentScore",
  "localStorage",
  "sessionStorage",
  "setInterval(",
]) {
  assert(!continuation.includes(forbidden), `Continuation service contains forbidden marker: ${forbidden}`);
}

assert(
  mobileQa.includes("ensureHeadteacherSupervisoryCorrectionReviewContinuation"),
  "Mobile/API regression must require the provenance dispatcher",
);
assert(
  mobileQa.includes(
    '!source.finalize.includes(\n    "ensureHeadteacherDirectorCorrectionReviewContinuation"',
  ),
  "Mobile/API regression must explicitly forbid the obsolete Director-only bridge",
);
assert(
  mobileQa.includes(
    "Correction continuation        : post-finalization return-provenance dispatcher",
  ),
  "Mobile/API regression summary must describe the B4 dispatcher",
);

console.log("");
console.log("=== N6-F1C6B4 CORRECTION FINALIZE API CONTRACT ===");
console.log("");
console.log("Finalize authority              : existing governance assessor gate");
console.log("Finalization                    : existing F3 scoring transaction first");
console.log("Continuation dispatch           : server-side return provenance");
console.log("HOS-return correction           : same HOS reviewer + stage");
console.log("Director-return correction      : existing Director bridge delegated");
console.log("Direct Director bridge in route : absent");
console.log("Retry after committed finalize  : explicit 503 + retry-safe contract");
console.log("No-store response               : preserved");
console.log("Direct Prisma in route          : absent");
console.log("Staff feedback in HOS branch    : absent");
console.log("Respondent identities           : absent");
console.log("Providers / polling / storage   : absent");
console.log("Database accessed               : false");
console.log("");
console.log("RESULT: N6-F1C6B4 CORRECTION FINALIZE API GREEN");
