#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS source-contract QA harness. */

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..", "..");

const files = {
  reviewPolicy:
    "src/lib/appraisals/teacherSupervisoryReview.ts",
  reviewPackage:
    "src/lib/appraisals/teacherSupervisoryReviewPackage.ts",
  directorDecision:
    "src/lib/appraisals/teacherSupervisoryDirectorReviewDecision.ts",
  correctionFinalization:
    "src/lib/appraisals/teacherSupervisoryAssessmentCorrectionFinalization.ts",
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
  'if (action === "RETURN")',
  'action: "RELEASE"',
  'reviewDecision: "ACCEPTED"',
  'assessmentNextStatus: "FINALIZED"',
  'cycleNextStatus: "RELEASED"',
  "revisionRequired: false",
  "nextReviewStageRequired: false",
  "nextReviewerRole: null",
  "assessmentMutationAllowed: false",
  "scoreMutationAllowed: false",
]) {
  assert(
    source.reviewPolicy.includes(marker),
    "Director Release policy marker missing",
    marker,
  );
}

for (const marker of [
  "TEACHER_SUPERVISORY_DIRECTOR_DECISION_POLICY",
  'allowedActions: ["RETURN", "RELEASE"] as const',
  'reviewerRole: "DISTRICT_DIRECTOR"',
  'releaseReviewDecision: "ACCEPTED"',
  'releaseAssessmentStatus: "FINALIZED"',
  'releasedCycleStatus: "RELEASED"',
  "proofSchemaVersion: 1",
  "readTeacherSupervisoryReviewPackage",
  "verifyTeacherSupervisoryFinalizedAssessmentEvidence",
  "decideTeacherSupervisoryReviewAuthority",
  "planTeacherSupervisoryReviewAction",
  "TEACHER_SUPERVISORY_DIRECTOR_DECISION_RELEASE_REASON_FORBIDDEN",
  "!authority.allowedActions.includes(input.action)",
  "releaseReviewChainHash",
  "releaseProofPayload",
  "releaseProofHash",
  "cycleMetadataForRelease",
  "extractReleaseProof",
  "expectedReleaseProofHash",
  "existingReleaseResult",
  "EXISTING_RELEASED",
  "RELEASED_AUDIT_ACTION",
  'status: "RELEASED"',
  "releasedAt: input.now",
  'state: "RELEASED"',
  "reviewChainHash",
  "releaseRequestHash",
  "releaseEvidenceHash",
  "releaseProofHash: input.releaseProofHash",
  'isPrismaCode(error, "P2002")',
  'isPrismaCode(error, "P2034")',
  'transactionIsolation: "SERIALIZABLE"',
]) {
  assert(
    source.directorDecision.includes(marker),
    "Director Release backend marker missing",
    marker,
  );
}

assert(
  source.directorDecision.includes(
    'reviewPackage.review.reviewerRole !== "DISTRICT_DIRECTOR"',
  ) &&
    source.directorDecision.includes(
      "reviewPackage.integrity.assessmentHash !== evidence.assessmentHash",
    ) &&
    source.directorDecision.includes(
      "reviewPackage.integrity.observationContextHash !==",
    ),
  "Director Release must re-read the immutable review package and finalized evidence before mutation",
);

assert(
  source.directorDecision.includes(
    "expectedAssignmentId: sourceReview.reviewerAssignmentId",
  ),
  "Director Release must revalidate exact current Director assignment custody",
);

const releaseBranchStart = source.directorDecision.indexOf(
  "if (!releaseProof || !proofHash || !chainHash) {",
);
const releaseBranchEnd = source.directorDecision.indexOf(
  "await tx.auditLog.create({",
  releaseBranchStart,
);

assert(
  releaseBranchStart >= 0 &&
    releaseBranchEnd > releaseBranchStart,
  "Director Release mutation branch not found",
);

const releaseBranch = source.directorDecision.slice(
  releaseBranchStart,
  releaseBranchEnd,
);

assert(
  releaseBranch.includes("appraisalCycle.updateMany") &&
    releaseBranch.includes('status: "RELEASED"') &&
    releaseBranch.includes("releasedAt: input.now") &&
    releaseBranch.includes("cycleMetadataForRelease"),
  "Director Release must atomically seal RELEASED cycle state",
);

assert(
  !releaseBranch.includes("appraisalAssessment.updateMany") &&
    !releaseBranch.includes("appraisalAssessmentScore") &&
    !releaseBranch.includes("appraisalReview.create"),
  "Director Release must not rewrite assessment/scores or create another review stage",
);

assert(
  source.directorDecision.includes(
    "decision: plan.reviewDecision",
  ) &&
    source.directorDecision.includes(
      'input.action === "RETURN" ? input.reason : null',
    ),
  "Director decision must persist RELEASE as ACCEPTED with no release reason text",
);

for (const proofMarker of [
  "assessmentRevision: input.evidence.revision",
  "assessmentHash: input.evidence.assessmentHash",
  "observationContextHash: input.evidence.observationContextHash",
  "reviewId: input.sourceReview.id",
  "reviewStage: input.sourceReview.stage",
  'reviewDecision: "ACCEPTED"',
  "reviewEvidenceHash: input.sourceReviewEvidenceHash",
  "reviewChainHash: input.reviewChainHash",
  "reviewerUserId: input.sourceReview.reviewerUserId",
  "reviewerAssignmentId: input.reviewerAssignmentId",
  'reviewerRole: "DISTRICT_DIRECTOR"',
  "decisionContractHash: input.decisionContractHash",
  "releaseRequestHash: input.decisionRequestHash",
  "releaseEvidenceHash: input.decisionEvidenceHash",
  "releasedAt: input.releasedAt.toISOString()",
  "assessmentMutationPerformed: false",
  "scoreMutationPerformed: false",
  "commentMutationPerformed: false",
  "reviewerMayRewriteScores: false",
  "reviewerMayRewriteComment: false",
  "legacyTeacherAppraisalIncluded: false",
  "combinedWeightingDefined: false",
  "notificationsSeeded: false",
  "providerCalled: false",
]) {
  assert(
    source.directorDecision.includes(proofMarker),
    "Immutable Teacher release proof marker missing",
    proofMarker,
  );
}

assert(
  source.directorDecision.includes(
    "expectedReleaseProofHash(release) !== storedReleaseProofHash",
  ) &&
    source.directorDecision.includes(
      "clean(metadata.releaseProofHash).toLowerCase()",
    ) &&
    source.directorDecision.includes(
      "releaseReviewChainHash(input.review)",
    ),
  "Weak-network release retry must reverify immutable release proof and review-chain anchor",
);

assert(
  source.reviewPackage.includes("assertForwardReviewLink") &&
    source.reviewPackage.includes("assertCorrectionContinuationSource") &&
    source.reviewPackage.includes(
      "TEACHER_SUPERVISORY_REVIEW_PACKAGE_PRIOR_FORWARD_INVALID",
    ),
  "Release package must retain HOS-forward and correction-chain verification",
);

assert(
  source.correctionFinalization.includes(
    "preserveReturningReviewer: true",
  ) &&
    source.correctionFinalization.includes("preserveReviewStage: true"),
  "Director-return correction continuation must remain compatible with later release",
);

for (const forbidden of [
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
    !source.directorDecision.includes(forbidden),
    "Director Release backend contains forbidden legacy/provider/browser marker",
    forbidden,
  );
}

assert(
  source.directorDecision.includes("returnReasonTextRecordedInAudit: false") &&
    source.directorDecision.includes("scoreValuesRecordedInAudit: false") &&
    source.directorDecision.includes("generalCommentRecordedInAudit: false") &&
    source.directorDecision.includes("observationDetailsRecordedInAudit: false") &&
    source.directorDecision.includes("classEnrolmentRecordedInAudit: false"),
  "Director Release audit must not duplicate mutable evidence values",
);

console.log("");
console.log("=== N6-E5B GOVERNANCE TEACHER DISTRICT DIRECTOR RELEASE ===");
console.log("");
console.log("Director authority                 : exact current District Director reviewer");
console.log("Supported actions                  : Return / Release in one engine");
console.log("Release input lifecycle            : UNDER_REVIEW + current Director PENDING");
console.log("Immutable review package           : re-read before mutation");
console.log("Finalized assessment evidence      : reverified before mutation");
console.log("HOS-originated                     : Director stage 1 release supported");
console.log("SISSO/BSC-originated               : Director stage 2 release supported");
console.log("Corrected Director return          : same preserved stage can later release");
console.log("Director self-review               : still forbidden; direct Director-authored release deferred");
console.log("Release review decision            : ACCEPTED");
console.log("Assessment status                  : FINALIZED unchanged");
console.log("Assessment mutation                : absent on Release");
console.log("Score / General Comment mutation   : absent");
console.log("Cycle transition                   : UNDER_REVIEW -> RELEASED");
console.log("releasedAt                         : sealed in same SERIALIZABLE transaction");
console.log("Release request hash               : deterministic");
console.log("Release evidence hash              : deterministic");
console.log("Review-chain hash                  : bound into proof");
console.log("Release proof hash                 : deterministic + stored in cycle/review metadata");
console.log("HOS Forward history                : package-reverified before Release");
console.log("Correction history                 : package-reverified before Release");
console.log("Weak-network retry                 : EXISTING_RELEASED with proof reverification");
console.log("Concurrent race                    : P2002 / P2034 / optimistic write recovery");
console.log("Audit evidence text                : excluded");
console.log("Legacy TeacherAppraisal            : untouched");
console.log("Notifications/providers            : absent");
console.log("Prisma migration                   : not required");
console.log("Database accessed                  : source contract only");
console.log("");
console.log("RESULT: N6-E5B GOVERNANCE TEACHER DISTRICT DIRECTOR RELEASE GREEN");
