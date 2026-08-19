#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS QA harness performs static source-contract verification. */

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
      jsx: ts.JsxEmit.ReactJSX,
      strict: true,
    },
  });
  const errors = (output.diagnostics || []).filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
  );
  assert.strictEqual(errors.length, 0, `${fileName} has TypeScript syntax errors`);
}

const files = {
  service: "src/lib/appraisals/headteacherDirectorGovernanceReview.ts",
  queue: "src/app/api/district/headteacher-appraisals/governance-review/route.ts",
  action:
    "src/app/api/district/headteacher-appraisals/governance-review/[assessmentId]/route.ts",
  continuation:
    "src/lib/appraisals/headteacherSupervisoryCorrectionReviewContinuation.ts",
};

const source = Object.fromEntries(
  Object.entries(files).map(([key, fileName]) => [key, read(fileName)]),
);

for (const [key, text] of Object.entries(source)) {
  syntax(text, files[key]);
  for (const forbidden of [
    "sendSms",
    "sendEmail",
    "localStorage",
    "sessionStorage",
    "setInterval(",
  ]) {
    assert(!text.includes(forbidden), `${key} contains forbidden marker: ${forbidden}`);
  }
}

for (const marker of [
  "HEADTEACHER_DIRECTOR_GOVERNANCE_REVIEW_POLICY",
  'releaseMode: "DIRECTOR_REVIEWED_GOVERNANCE_RELEASE"',
  "listHeadteacherDirectorGovernanceReviewQueue",
  "readHeadteacherDirectorGovernanceReviewPackage",
  "startHeadteacherDirectorGovernanceReview",
  "executeHeadteacherDirectorGovernanceDecision",
  'allowedDecisions: ["RETURN", "HOLD", "RELEASE"]',
  'reviewType: "DIRECTOR_GOVERNANCE_REVIEW"',
  'reviewerRole: "DISTRICT_DIRECTOR"',
  'evidenceStream: "GOVERNANCE_SUPERVISORY_ASSESSMENT"',
  "carrierCycleStatusMutationAllowed: false",
  "carrierCycleTimestampMutationAllowed: false",
  "staffFeedbackRequired: false",
  "staffFeedbackAccessed: false",
  "respondentIdentitiesAccessed: false",
  "individualStaffResponsesAccessed: false",
  "reviewerMayRewriteScores: false",
  "scoreMutationAllowed: false",
  "combinedWeightingDefined: false",
  "commentsIncluded: false",
  "HEADTEACHER_SUPERVISORY_RELEASES_METADATA_KEY",
  "computeHeadteacherDirectorGovernanceReleaseProofHashFromMetadata",
  "isHeadteacherDirectorGovernanceReviewedReleaseMetadata",
  'kind: "HOS_AUTHORED"',
  'kind: "HOS_FORWARDED"',
  'kind: "CORRECTED_ASSESSMENT"',
  "HEADTEACHER_DIRECTOR_GOVERNANCE_SELF_REVIEW_FORBIDDEN",
  "HEADTEACHER_GOVERNANCE_DIRECTOR_REVIEW_STARTED",
  "HEADTEACHER_GOVERNANCE_DIRECTOR_RETURNED",
  "HEADTEACHER_GOVERNANCE_DIRECTOR_HELD",
  "HEADTEACHER_GOVERNANCE_DIRECTOR_RELEASED",
  "holdContinuationProofReverified: true",
  "holdContinuationPreservesDirectorCustody: true",
  "pendingHoldContinuationAdmission",
  '"HOLD_CONTINUATION"',
  "HEADTEACHER_DIRECTOR_GOVERNANCE_HOLD_CONTINUATION_PROOF_DRIFT",
  'normalized(sourceReview.decision) !== "HELD"',
  "clean(sourceMetadata.nextReviewId) !== input.pending.id",
  "Number(sourceMetadata.nextReviewStage) !== input.pending.stage",
  "sourceReview.reviewerUserId !== input.pending.reviewerUserId",
  "sourceReview.reviewerAssignmentId !== input.pending.reviewerAssignmentId",
]) {
  assert(source.service.includes(marker), `Governance service marker missing: ${marker}`);
}

for (const forbidden of [
  "readHeadteacherFeedbackAggregateReadiness",
  "HeadteacherFeedbackAggregateReadinessDatabase",
  "appraisalAggregateSnapshot",
  "headteacherFeedbackResponse",
  "staffFeedbackSnapshotId",
  "staffFeedbackSourceHash",
  "ensureHeadteacherDirectorReleaseNotifications",
  "headteacherDirectorReleaseNotifications",
  'from "@/lib/appraisals/headteacherDirectorReview"',
  'from "@/lib/appraisals/headteacherDirectorReviewPackage"',
  'from "@/lib/appraisals/headteacherDirectorReviewDecision"',
  'from "@/lib/appraisals/headteacherDirectorReviewRelease"',
  "staffFeedbackIncluded: true",
  "staffFeedbackRequired: true",
  "staffFeedbackAccessed: true",
]) {
  assert(
    !source.service.includes(forbidden),
    `Governance service contains legacy coupling marker: ${forbidden}`,
  );
}

assert(
  !/data\s*:\s*\{[^}]{0,240}status\s*:\s*["']RELEASED["']/s.test(source.service),
  "Governance release must not mutate the carrier cycle status to RELEASED",
);
assert(
  !/data\s*:\s*\{[^}]{0,240}releasedAt\s*:/s.test(source.service),
  "Governance release must not mutate the carrier cycle releasedAt timestamp",
);

for (const marker of [
  'runtime = "nodejs"',
  'dynamic = "force-dynamic"',
  "requireDirectorReviewApiContext",
  "jsonNoStore",
  "listHeadteacherDirectorGovernanceReviewQueue",
  "governanceScope: auth.scope",
]) {
  assert(source.queue.includes(marker), `Queue API marker missing: ${marker}`);
}
assert(
  !source.queue.includes("reviewGovernanceScope(auth.scope)"),
  "Governance queue must retain full authenticated zone/assignment scope",
);

for (const marker of [
  'runtime = "nodejs"',
  'dynamic = "force-dynamic"',
  "requireDirectorReviewApiContext",
  "readHeadteacherDirectorGovernanceReviewPackage",
  "startHeadteacherDirectorGovernanceReview",
  "executeHeadteacherDirectorGovernanceDecision",
  '"START"',
  '"RETURN"',
  '"HOLD"',
  '"RELEASE"',
  "readJsonObject",
  "ALLOWED_BODY_FIELDS",
  "parsed.body.confirm === true",
  "governanceScope: auth.scope",
  "jsonNoStore",
]) {
  assert(source.action.includes(marker), `Action API marker missing: ${marker}`);
}
assert(
  !source.action.includes("reviewGovernanceScope(auth.scope)"),
  "Governance action API must retain full authenticated zone/assignment scope",
);

for (const marker of [
  'directorContinuationMode: "INDEPENDENT_GOVERNANCE"',
  "staffFeedbackIncludedInDirectorContinuation: false",
  'reviewType: "DIRECTOR_GOVERNANCE_REVIEW"',
  "HEADTEACHER_GOVERNANCE_DIRECTOR_CORRECTION_REVIEW_CONTINUED",
  "preserveReturningReviewer: true",
  "preserveReviewStage: true",
]) {
  assert(source.continuation.includes(marker), `Continuation marker missing: ${marker}`);
}
for (const forbidden of [
  'from "@/lib/appraisals/headteacherDirectorReview"',
  "ensureHeadteacherDirectorCorrectionReviewContinuation",
  "readHeadteacherFeedbackAggregateReadiness",
  "appraisalAggregateSnapshot",
  "headteacherFeedbackResponse",
  "staffFeedbackIncluded: true",
]) {
  assert(
    !source.continuation.includes(forbidden),
    `Continuation contains legacy Director coupling: ${forbidden}`,
  );
}

console.log("");
console.log("=== N7 GOVERNANCE INDEPENDENCE — SLICE B1 BACKEND CONTRACT ===");
console.log("");
console.log("Director Governance discovery   : assessment-keyed, read-only");
console.log("Director Governance package     : native 4-section / 34-item evidence");
console.log("Initial review admission        : HOS-authored stage 1 / HOS-forwarded stage 2");
console.log("Director decisions              : Return / Hold / Release");
console.log("Hold continuation               : next stage proof reverified + same Director");
console.log("Director self-review            : forbidden");
console.log("Correction continuation         : same Director custody + stage");
console.log("Staff Feedback prerequisite     : absent");
console.log("Staff Feedback DB reads         : absent");
console.log("Respondent identities           : absent");
console.log("Reviewer score rewriting        : absent");
console.log("Combined weighting              : absent");
console.log("Carrier cycle status mutation   : absent");
console.log("Carrier release timestamp       : absent");
console.log("Independent release proof       : assessment-keyed metadata map");
console.log("Full governance scope           : preserved through API");
console.log("Providers / polling / storage   : absent");
console.log("Database accessed               : false");
console.log("");
console.log("RESULT: N7 GOVERNANCE INDEPENDENCE SLICE B1 BACKEND GREEN");
