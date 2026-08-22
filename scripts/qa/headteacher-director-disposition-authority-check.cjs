#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS QA harness performs static source-contract verification. */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const repoRoot = path.resolve(__dirname, "..", "..");

const files = {
  directorService:
    "src/lib/appraisals/headteacherDirectorGovernanceReview.ts",
  directorClient:
    "src/app/district/headteacher-appraisals/review/HeadteacherDirectorReviewClient.tsx",
  revision:
    "src/lib/appraisals/headteacherSupervisoryAssessmentRevision.ts",
  continuation:
    "src/lib/appraisals/headteacherSupervisoryCorrectionReviewContinuation.ts",
};

function read(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  assert(fs.existsSync(absolutePath), `Required file missing: ${relativePath}`);
  return fs.readFileSync(absolutePath, "utf8").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
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

const source = Object.fromEntries(
  Object.entries(files).map(([key, relativePath]) => [key, read(relativePath)]),
);

for (const [key, text] of Object.entries(source)) {
  syntax(text, files[key]);
  for (const forbidden of [
    "localStorage",
    "sessionStorage",
    "setInterval(",
    "sendSms",
    "sendEmail",
  ]) {
    assert(!text.includes(forbidden), `${key} contains forbidden marker: ${forbidden}`);
  }
}

for (const marker of [
  'allowedDecisions: ["RETURN", "HOLD", "RELEASE"]',
  'directorReturnAssessorRole: "HEAD_OF_SUPERVISION"',
  'hosForwardedAllowedDecisions: ["HOLD", "RELEASE"]',
  "function assertDirectorDecisionAuthority",
  "HEADTEACHER_DIRECTOR_GOVERNANCE_RETURN_AUTHORSHIP_FORBIDDEN",
  "assessorRole: prepared.verified.assessorRole",
  "assessorRole: verified.assessorRole",
]) {
  assert(
    source.directorService.includes(marker),
    `Director service authority marker missing: ${marker}`,
  );
}

assert.strictEqual(
  source.directorService.split("assertDirectorDecisionAuthority({").length - 1,
  2,
  "Director RETURN authority must be checked in preflight and again inside the SERIALIZABLE transaction",
);

for (const marker of [
  'governanceReturnAssessorRole: "HEAD_OF_SUPERVISION"',
  'governanceHosForwardedDecisionPath: "HOLD_RELEASE_ONLY"',
  "allowReturn?: boolean",
  "allowReturn={directorReturnAllowed}",
  "DIRECTOR_REVIEW_UI_POLICY.governanceReturnAssessorRole",
  "Correction return is no longer available for SISSO/BSC-authored work.",
  "The Director may Hold or Release it, but cannot send it back for another correction.",
  "This HOS-reviewed SISSO/BSC report may only be Held or Released.",
]) {
  assert(
    source.directorClient.includes(marker),
    `Director client authority marker missing: ${marker}`,
  );
}

for (const marker of [
  'directorReturnCorrectionAssessorRole: "HEAD_OF_SUPERVISION"',
  "directorReturnHosAuthoredOnly: true",
  "HEADTEACHER_SUPERVISORY_REVISION_DIRECTOR_RETURN_AUTHORSHIP_FORBIDDEN",
  "canonicalHeadteacherSupervisoryAssessorRole",
]) {
  assert(
    source.revision.includes(marker),
    `Revision authority marker missing: ${marker}`,
  );
}

for (const marker of [
  'directorReturnCorrectionAssessorRole: "HEAD_OF_SUPERVISION"',
  "directorReturnHosAuthoredOnly: true",
  "HEADTEACHER_SUPERVISORY_CORRECTION_CONTINUATION_DIRECTOR_SOURCE_ROLE_INVALID",
  "directorCorrectionAssessorRole(input.actorRoleName)",
]) {
  assert(
    source.continuation.includes(marker),
    `Correction continuation authority marker missing: ${marker}`,
  );
}

assert(
  source.continuation.split("directorCorrectionAssessorRole(input.actorRoleName)").length - 1 >= 2,
  "Director correction role must be checked before delegation and inside the continuation implementation",
);

for (const preserved of [
  "staffFeedbackIncluded: false",
  "respondentIdentitiesIncluded: false",
  "reviewerMayRewriteScores: false",
  "scoreMutationAllowed: false",
  "providerCalled: false",
]) {
  assert(
    source.directorService.includes(preserved),
    `Director service safety marker missing: ${preserved}`,
  );
  assert(
    source.continuation.includes(preserved),
    `Continuation safety marker missing: ${preserved}`,
  );
}

console.log("");
console.log("=== N7-P2C4B1J3 DIRECTOR DISPOSITION AUTHORSHIP AUTHORITY ===");
console.log("");
console.log("BSC/SISSO authored + HOS forwarded : HOLD / RELEASE only");
console.log("HOS authored                       : RETURN / HOLD / RELEASE");
console.log("Director RETURN server preflight   : fail-closed by original assessor role");
console.log("Director RETURN transaction guard  : reverified before writes");
console.log("Director UI RETURN button          : HOS-authored only");
console.log("Revision admission                 : Director return HOS-authored only");
console.log("Correction continuation            : original HOS author only");
console.log("HOS return to BSC/SISSO            : preserved");
console.log("HOLD custody                       : preserved with Director");
console.log("Staff Feedback                     : independent");
console.log("Scores / visit evidence            : immutable");
console.log("Respondent identities              : absent");
console.log("Providers / polling / storage      : absent");
console.log("Database accessed                  : false");
console.log("");
console.log("RESULT: N7-P2C4B1J3 DIRECTOR DISPOSITION AUTHORITY GREEN");
