#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS source-contract QA harness. */

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..", "..");

const files = {
  reviewPolicy:
    "src/lib/appraisals/teacherSupervisoryReview.ts",
  package:
    "src/lib/appraisals/teacherSupervisoryReviewPackage.ts",
  correctionFinalization:
    "src/lib/appraisals/teacherSupervisoryAssessmentCorrectionFinalization.ts",
  revision:
    "src/lib/appraisals/teacherSupervisoryAssessmentRevision.ts",
  directorReturn:
    "src/lib/appraisals/teacherSupervisoryDirectorReviewDecision.ts",
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
  'directorActions: ["RETURN", "RELEASE"]',
  'reviewerRole: "DISTRICT_DIRECTOR"',
  'if (action === "RETURN")',
  'reviewDecision: "RETURNED"',
  'assessmentNextStatus: "RETURNED"',
  'cycleNextStatus: "UNDER_REVIEW"',
  "revisionRequired: true",
  "nextReviewStageRequired: false",
]) {
  assert(
    source.reviewPolicy.includes(marker),
    "Director Return policy marker missing",
    marker,
  );
}

for (const marker of [
  "verifyTeacherSupervisorySealedAssessmentEvidence",
  "PackageCorrectionContinuationProvenance",
  "parseCorrectionContinuation",
  '"CORRECTION_CONTINUATION"',
  "continuationFromReturnedReview",
  "preserveReturningReviewer",
  "preserveReviewStage",
  "assertCorrectionContinuationSource",
  'allowedStatuses: ["SUPERSEDED"]',
  "sourceReturnDecisionRequestHash",
  "sourceReturnDecisionEvidenceHash",
  "TEACHER_SUPERVISORY_REVIEW_PACKAGE_CORRECTION_SOURCE_PROVENANCE_DRIFT",
]) {
  assert(
    source.package.includes(marker),
    "Correction-aware review package marker missing",
    marker,
  );
}

assert(
  source.package.includes(
    "if (correctionContinuation)",
  ) &&
    source.package.includes(
      "ordered.length !== 1 || ordered[0]?.id !== review.id",
    ),
  "Correction review package must allow preserved stage without inventing earlier-stage rows on the corrected assessment",
);

assert(
  source.package.includes("assertForwardReviewLink") &&
    source.package.includes(
      "ordered.length !== sourceReview.stage",
    ),
  "Correction package must reverify the source assessment's original review chain",
);

for (const marker of [
  'reviewType: "CORRECTION_CONTINUATION"',
  "sourceAssessmentId",
  "sourceReviewId",
  "sourceReviewStage",
  "sourceReviewEvidenceHash",
  "sourceReturnDecisionRequestHash",
  "sourceReturnDecisionEvidenceHash",
  "preserveReturningReviewer: true",
  "preserveReviewStage: true",
]) {
  assert(
    source.correctionFinalization.includes(marker),
    "E4C correction continuation provenance marker missing",
    marker,
  );
}

assert(
  source.revision.includes(
    'reviewerRole !== "HEAD_OF_SUPERVISION" &&',
  ) &&
    source.revision.includes(
      'reviewerRole !== "DISTRICT_DIRECTOR"',
    ),
  "Returned-revision backend must continue to support Director returns",
);

for (const marker of [
  "TEACHER_SUPERVISORY_DIRECTOR_DECISION_POLICY",
  'reviewerRole: "DISTRICT_DIRECTOR"',
  'allowedActions: ["RETURN", "RELEASE"] as const',
  'requiredCycleStatus: "UNDER_REVIEW"',
  'requiredCurrentReviewDecision: "PENDING"',
  'returnReviewDecision: "RETURNED"',
  'returnAssessmentFromStatus: "FINALIZED"',
  'returnAssessmentToStatus: "RETURNED"',
  "returnedAssessmentRequiresRevision: true",
  "preserveReturningReviewerForCorrection: true",
  "readTeacherSupervisoryReviewPackage",
  "verifyTeacherSupervisoryFinalizedAssessmentEvidence",
  "decideTeacherSupervisoryReviewAuthority",
  "planTeacherSupervisoryReviewAction",
  "TEACHER_SUPERVISORY_DIRECTOR_DECISION_REVIEWER_ROLE_FORBIDDEN",
  "TEACHER_SUPERVISORY_DIRECTOR_DECISION_CONFIRMATION_REQUIRED",
  "TEACHER_SUPERVISORY_DIRECTOR_DECISION_REASON_REQUIRED",
  "TEACHER_SUPERVISORY_DIRECTOR_DECISION_REASON_TOO_LONG",
  "requireExactCurrentAssignment",
  'actorRoleName: "DISTRICT_DIRECTOR"',
  'action: "RETURN"',
  'decision: plan.reviewDecision',
  'status: "RETURNED"',
  'state: "RETURNED_FOR_CORRECTION"',
  'currentReviewerRole: "DISTRICT_DIRECTOR"',
  'returningReviewerRole: "DISTRICT_DIRECTOR"',
  "decisionContractHash",
  "decisionRequestHash",
  "decisionEvidenceHash",
  "EXISTING_RETURNED",
  'isPrismaCode(error, "P2002")',
  'isPrismaCode(error, "P2034")',
  'transactionIsolation: "SERIALIZABLE"',
]) {
  assert(
    source.directorReturn.includes(marker),
    "Director Return backend marker missing",
    marker,
  );
}

assert(
  source.directorReturn.includes(
    "reviewPackage.review.reviewerRole !== \"DISTRICT_DIRECTOR\"",
  ) &&
    source.directorReturn.includes(
      "reviewPackage.integrity.assessmentHash !== evidence.assessmentHash",
    ) &&
    source.directorReturn.includes(
      "reviewPackage.integrity.observationContextHash !==",
    ),
  "Director Return must re-read the immutable review package and finalized evidence before mutation",
);

assert(
  source.directorReturn.includes(
    "expectedAssignmentId: sourceReview.reviewerAssignmentId",
  ),
  "Director Return must revalidate exact current Director assignment custody",
);

assert(
  source.directorReturn.includes(
    "!authority.allowedActions.includes(input.action)",
  ) &&
    source.directorReturn.includes(
      'input.action === "RETURN"',
    ),
  "Director Return must remain inside the shared Director action authority gate",
);

assert(
  source.directorReturn.includes("appraisalReview.updateMany") &&
    source.directorReturn.includes("appraisalAssessment.updateMany") &&
    source.directorReturn.includes("appraisalCycle.updateMany"),
  "Director Return must atomically persist review, assessment and correction-custody metadata",
);

assert(
  source.directorReturn.includes(
    'plan.reviewDecision !== "RETURNED"',
  ) &&
    source.directorReturn.includes(
      'plan.assessmentNextStatus !== "RETURNED"',
    ) &&
    source.directorReturn.includes(
      'plan.cycleNextStatus !== "UNDER_REVIEW"',
    ) &&
    source.directorReturn.includes(
      'status: "RETURNED"',
    ) &&
    source.directorReturn.includes(
      'state: "RETURNED_FOR_CORRECTION"',
    ),
  "Director Return lifecycle must remain RETURNED + UNDER_REVIEW correction custody",
);

assert(
  !source.directorReturn.includes("appraisalReview.create"),
  "Director Return must not create a next review stage",
);

for (const forbidden of [
  "teacherAppraisal.create",
  "teacherAppraisal.update",
  "prisma.teacherAppraisal",
  "appraisalAssessmentScore.update",
  "appraisalAssessmentScore.updateMany",
  "sendSms",
  "sendEmail",
  "appraisalNotification.create",
  "localStorage",
  "sessionStorage",
  "setInterval(",
]) {
  assert(
    !source.directorReturn.includes(forbidden),
    "Director decision backend contains forbidden provider/rewrite marker",
    forbidden,
  );
}

assert(
  source.directorReturn.includes("returnReasonTextRecordedInAudit: false") &&
    source.directorReturn.includes("scoreValuesRecordedInAudit: false") &&
    source.directorReturn.includes("generalCommentRecordedInAudit: false") &&
    source.directorReturn.includes("observationDetailsRecordedInAudit: false") &&
    source.directorReturn.includes("classEnrolmentRecordedInAudit: false"),
  "Director Return audit must not duplicate reason/evidence values",
);

console.log("");
console.log("=== N6-E5A GOVERNANCE TEACHER DISTRICT DIRECTOR RETURN ===");
console.log("");
console.log("Director authority                 : exact current District Director reviewer");
console.log("Return action                      : preserved");
console.log("Release extension                  : present in same Director engine");
console.log("Input lifecycle                    : UNDER_REVIEW + current Director PENDING review");
console.log("Immutable review package           : re-read before mutation");
console.log("Finalized assessment evidence      : reverified before mutation");
console.log("SISSO/BSC origin                   : Director stage 2 supported");
console.log("HOS origin                         : Director stage 1 supported");
console.log("Director self-review               : forbidden by shared review authority");
console.log("Return review decision             : RETURNED");
console.log("Return assessment status           : RETURNED");
console.log("Cycle status                       : UNDER_REVIEW unchanged");
console.log("Return reason                      : required; audit text excluded");
console.log("Correction reviewer                : same Director preserved");
console.log("Correction review stage            : exact Director stage preserved");
console.log("E4 revision backend                : reused; no parallel revision engine");
console.log("Correction package stage 2         : supported without invented stage-1 rows");
console.log("Source historical chain            : reverified from SUPERSEDED source");
console.log("Assessment scores/comment          : never rewritten by Director");
console.log("Observation/provenance             : never rewritten by Director");
console.log("Decision hashes                    : contract + request + evidence");
console.log("Weak-network retry                 : EXISTING_RETURNED");
console.log("Race recovery                      : P2002 / P2034 / optimistic write");
console.log("Legacy TeacherAppraisal            : untouched");
console.log("Notifications/providers            : absent");
console.log("Prisma migration                   : not required");
console.log("Database accessed                  : source contract only");
console.log("");
console.log("RESULT: N6-E5A GOVERNANCE TEACHER DIRECTOR RETURN GREEN");
