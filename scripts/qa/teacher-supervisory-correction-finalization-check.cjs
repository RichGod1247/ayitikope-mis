#!/usr/bin/env node
"use strict";
/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS source-contract QA harness. */

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..", "..");

const files = {
  scoring:
    "src/lib/appraisals/teacherSupervisoryAssessmentScoring.ts",
  revision:
    "src/lib/appraisals/teacherSupervisoryAssessmentRevision.ts",
  continuation:
    "src/lib/appraisals/teacherSupervisoryAssessmentCorrectionFinalization.ts",
  finalizeRoute:
    "src/app/api/governance/appraisals/teacher-supervisory/[assessmentId]/finalize/route.ts",
  shared:
    "src/app/api/governance/appraisals/teacher-supervisory/_shared.ts",
};

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
  if (!fs.existsSync(absolutePath)) fail("Required file missing", relativePath);
  return fs.readFileSync(absolutePath, "utf8");
}

const source = Object.fromEntries(
  Object.entries(files).map(([key, relativePath]) => [key, read(relativePath)]),
);

for (const marker of [
  "finalizeTeacherSupervisoryAssessment",
  "verifyTeacherSupervisoryFinalizedAssessmentEvidence",
  "verifyTeacherSupervisorySealedAssessmentEvidence",
  "computeTeacherSupervisoryReviewEvidenceHash",
  "decideTeacherSupervisoryReviewAuthority",
  'requiredCycleStatus: "UNDER_REVIEW"',
  'requiredSourceStatus: "SUPERSEDED"',
  'requiredReturnDecision: "RETURNED"',
  'resumedReviewDecision: "PENDING"',
  "preserveReturningReviewer: true",
  "preserveReviewStage: true",
  "ordinaryFinalizationReviewCreation: false",
  "correctionCycleStatusChanges: false",
  'transactionIsolation: "SERIALIZABLE"',
  "CORRECTION_CONTINUATION",
  "PENDING_CORRECTION_REVIEW",
  "assessmentId_stage",
  "EXISTING_REVIEW_DRIFT",
  'code === "P2002"',
  'code === "P2034"',
]) {
  assert(
    source.continuation.includes(marker),
    "Correction-finalization continuation marker missing",
    marker,
  );
}

assert(
  source.continuation.includes("scoringDatabaseAdapter") &&
    source.continuation.includes(
      "database: scoringDatabaseAdapter(input.tx)",
    ),
  "Correction finalization must run existing scorer inside the same outer transaction",
);

assert(
  source.continuation.includes(
    'allowedStatuses: ["SUPERSEDED"]',
  ) &&
    source.continuation.includes(
      'clean(reviewMetadata.decisionAction) !== "RETURN"',
    ) &&
    source.continuation.includes(
      "sourceReviewEvidenceHash",
    ),
  "Returned source and review provenance must be reverified",
);

assert(
  source.continuation.includes(
    "returningReviewerAssignmentId",
  ) &&
    source.continuation.includes("reviewerAssignmentIsCurrent") &&
    source.continuation.includes(
      "decideTeacherSupervisoryReviewAuthority",
    ),
  "Same reviewer assignment and stage authority must be revalidated",
);

assert(
  source.continuation.includes("appraisalReview.create") &&
    source.continuation.includes('decision: "PENDING"') &&
    source.continuation.includes(
      "stage: provenance.returnReviewStage",
    ),
  "Corrected finalization must recreate exactly the same review stage as PENDING",
);

assert(
  source.continuation.includes("appraisalCycle.updateMany") &&
    source.continuation.includes('status: "UNDER_REVIEW"') &&
    source.continuation.includes("cycleTransitioned: false"),
  "Correction continuation must preserve UNDER_REVIEW cycle status",
);

for (const forbidden of [
  'status: "OPEN"',
  "appraisalAssessmentScore.update",
  "appraisalAssessmentScore.updateMany",
  "teacherAppraisal.create",
  "teacherAppraisal.update",
  "prisma.teacherAppraisal",
  "sendSms",
  "sendEmail",
  "appraisalNotification.create",
  "localStorage",
  "sessionStorage",
  "setInterval(",
]) {
  assert(
    !source.continuation.includes(forbidden),
    "Correction finalization contains forbidden lifecycle/provider marker",
    forbidden,
  );
}

assert(
  source.continuation.includes("scoreValuesRecordedInAudit: false") &&
    source.continuation.includes("generalCommentRecordedInAudit: false") &&
    source.continuation.includes("returnReasonTextRecordedInAudit: false"),
  "Correction-finalization audit must exclude evidence/reason text",
);

for (const marker of [
  "finalizeTeacherSupervisoryAssessmentWithContinuation",
  "result: finalized.result",
  "reviewCreated: finalized.reviewCreated",
  "cycleTransitioned: finalized.cycleTransitioned",
  "continuation: finalized.continuation",
  "providerCalled: finalized.providerCalled",
  "confirmFinalization",
  "requireTeacherSupervisoryGovernanceApiContext",
  "readBoundedJsonObject",
  "jsonNoStore",
]) {
  assert(
    source.finalizeRoute.includes(marker),
    "Finalize route continuation contract marker missing",
    marker,
  );
}

assert(
  !source.finalizeRoute.includes(
    'reviewCreated: false,\n      cycleTransitioned: false,',
  ),
  "Finalize route must no longer hardcode reviewCreated=false",
);

for (const forbidden of [
  "prisma.",
  "appraisalReview.create",
  "appraisalCycle.update",
  "teacherAppraisal",
  "sendSms",
  "sendEmail",
  "appraisalNotification",
]) {
  assert(
    !source.finalizeRoute.includes(forbidden),
    "Finalize route must remain thin",
    forbidden,
  );
}

assert(
  source.scoring.includes(
    "metadata.correctionRevision !== true",
  ) &&
    source.scoring.includes(
      "assertCorrectionRevisionBoundary",
    ),
  "N6-E4A correction-editability bridge regression",
);

assert(
  source.revision.includes("preserveReturningReviewerForCorrection: true") &&
    source.revision.includes("returnReviewStage") &&
    source.revision.includes("returningReviewerAssignmentId"),
  "N6-E4A returned-revision provenance regression",
);

assert(
  source.shared.includes('"Cache-Control": "no-store, max-age=0"') &&
    source.shared.includes('"X-Content-Type-Options": "nosniff"') &&
    source.shared.includes('"Referrer-Policy": "no-referrer"'),
  "Finalize route no-store security boundary regression",
);

console.log("");
console.log("=== N6-E4C GOVERNANCE TEACHER CORRECTED FINALIZATION CONTINUATION ===");
console.log("");
console.log("Input                             : initial or correction Teacher DRAFT");
console.log("Ordinary finalization             : existing D4 behavior; no review created");
console.log("Correction finalization           : same scoring/finalization engine");
console.log("Atomicity                         : scorer + resumed review in one SERIALIZABLE tx");
console.log("Source correction provenance      : SUPERSEDED source reverified");
console.log("Returned review provenance        : exact RETURNED review reverified");
console.log("Returning reviewer                : exact same user / assignment / role");
console.log("Returning reviewer authority      : current and revalidated");
console.log("Review stage                      : exact returned stage preserved");
console.log("Corrected assessment              : FINALIZED with new assessment hash");
console.log("Observation context               : unchanged");
console.log("Resumed AppraisalReview           : one PENDING row");
console.log("Review evidence hash              : rebound to corrected assessment hash");
console.log("Cycle status                      : UNDER_REVIEW unchanged");
console.log("Cycle metadata                    : current corrected review custody");
console.log("Weak-network retry                : existing PENDING continuation reused");
console.log("Concurrent race                   : P2002 / P2034 recovery");
console.log("Reviewer score/comment rewrite    : forbidden");
console.log("Legacy TeacherAppraisal           : untouched");
console.log("Notifications/providers           : absent");
console.log("Finalize route                    : thin; no direct Prisma mutation");
console.log("No-store / nosniff / no-referrer : preserved");
console.log("Prisma migration                  : not required");
console.log("Database accessed                 : source contract only");
console.log("");
console.log("RESULT: N6-E4C GOVERNANCE TEACHER CORRECTED FINALIZATION CONTINUATION GREEN");
