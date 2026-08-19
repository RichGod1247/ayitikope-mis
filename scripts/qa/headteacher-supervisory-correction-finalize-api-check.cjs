#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS QA source-contract harness. */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const repoRoot = path.resolve(__dirname, "..", "..");

function read(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  assert(fs.existsSync(absolutePath), `Required file missing: ${relativePath}`);
  return fs.readFileSync(absolutePath, "utf8").replace(/\r\n/g, "\n");
}

function syntax(source, fileName) {
  const output = ts.transpileModule(source, {
    fileName,
    reportDiagnostics: true,
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      strict: true,
    },
  });
  const errors = (output.diagnostics || []).filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
  );
  assert.strictEqual(errors.length, 0, `${fileName} has TypeScript syntax errors`);
}

const finalizePath =
  "src/app/api/governance/appraisals/headteacher-supervisory/[assessmentId]/finalize/route.ts";
const continuationPath =
  "src/lib/appraisals/headteacherSupervisoryCorrectionReviewContinuation.ts";
const mobileQaPath =
  "scripts/qa/headteacher-supervisory-assessment-api-mobile-form-check.cjs";

const finalize = read(finalizePath);
const continuation = read(continuationPath);
const mobileQa = read(mobileQaPath);

syntax(finalize, finalizePath);
syntax(continuation, continuationPath);

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

for (const forbidden of [
  "ensureHeadteacherDirectorCorrectionReviewContinuation",
  "headteacherDirectorReview\"",
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
  'directorContinuationMode: "INDEPENDENT_GOVERNANCE"',
  "staffFeedbackIncludedInHosContinuation: false",
  "staffFeedbackIncludedInDirectorContinuation: false",
  'reviewType: "DIRECTOR_GOVERNANCE_REVIEW"',
  "HEADTEACHER_GOVERNANCE_DIRECTOR_CORRECTION_REVIEW_CONTINUED",
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
  assert(
    continuation.includes(marker),
    `Continuation service marker missing: ${marker}`,
  );
}

for (const forbidden of [
  'from "@/lib/appraisals/headteacherDirectorReview"',
  "ensureHeadteacherDirectorCorrectionReviewContinuation",
  "readHeadteacherFeedbackAggregateReadiness",
  "appraisalAggregateSnapshot",
  "headteacherFeedbackResponse",
  "respondentUserId",
  "staffFeedbackIncluded: true",
  "sendSms",
  "sendEmail",
  "appraisalAssessmentScore",
  "localStorage",
  "sessionStorage",
  "setInterval(",
]) {
  assert(
    !continuation.includes(forbidden),
    `Continuation service contains forbidden marker: ${forbidden}`,
  );
}

assert(
  mobileQa.includes("ensureHeadteacherSupervisoryCorrectionReviewContinuation"),
  "Mobile/API regression must retain the post-finalization provenance dispatcher",
);
assert(
  mobileQa.includes("ensureHeadteacherDirectorCorrectionReviewContinuation"),
  "Mobile/API regression must retain its explicit obsolete-bridge guard",
);
assert(
  mobileQa.includes(
    "Correction continuation        : post-finalization return-provenance dispatcher",
  ),
  "Mobile/API regression summary must retain the provenance-dispatcher contract",
);

console.log("");
console.log("=== N7 SLICE B1 CORRECTION FINALIZE API CONTRACT ===");
console.log("");
console.log("Finalization                    : existing scoring transaction first");
console.log("Continuation dispatch           : post-finalization return provenance");
console.log("HOS-return correction           : same HOS reviewer + stage");
console.log("Director-return correction      : independent Governance bridge");
console.log("Old combined Director bridge    : absent");
console.log("Staff feedback in either branch : absent");
console.log("No-store response               : preserved");
console.log("Direct Prisma in route          : absent");
console.log("Respondent identities           : absent");
console.log("Providers / polling / storage   : absent");
console.log("Database accessed               : false");
console.log("");
console.log("RESULT: N7 SLICE B1 CORRECTION FINALIZE API GREEN");
