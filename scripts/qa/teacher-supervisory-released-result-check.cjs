#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS source-contract QA harness. */

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..", "..");

const files = {
  released:
    "src/lib/appraisals/teacherSupervisoryReleasedResult.ts",
  decision:
    "src/lib/appraisals/teacherSupervisoryDirectorReviewDecision.ts",
  directRelease:
    "src/lib/appraisals/teacherSupervisoryDirectorDirectRelease.ts",
  scoring:
    "src/lib/appraisals/teacherSupervisoryAssessmentScoring.ts",
  review:
    "src/lib/appraisals/teacherSupervisoryReview.ts",
  reviewPackage:
    "src/lib/appraisals/teacherSupervisoryReviewPackage.ts",
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
  return fs
    .readFileSync(absolutePath, "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
}

const source = Object.fromEntries(
  Object.entries(files).map(([key, relativePath]) => [key, read(relativePath)]),
);

for (const marker of [
  'audience: "RELEASED_TEACHER"',
  'requiredRole: "TEACHER"',
  'requiredCycleStatus: "RELEASED"',
  'requiredReviewDecision: "ACCEPTED"',
  'requiredAssessmentStatus: "FINALIZED"',
  "releaseProofSchemaVersion: 1",
  'reviewedReleaseMode: "REVIEWED_DIRECTOR_RELEASE"',
  'directorAuthoredDirectReleaseMode: "DIRECTOR_AUTHORED_DIRECT_RELEASE"',
  "dualReleaseModesSupported: true",
  "expectedSectionCount: 6",
  "expectedItemCount: 34",
  "scoreValuesIncluded: true",
  "generalCommentIncluded: true",
  "assessorIdentityIncluded: false",
  "reviewerIdentityIncluded: false",
  "reviewerAssignmentIncluded: false",
  "reviewNotesIncluded: false",
  "returnReasonsIncluded: false",
  "rawEvidenceSnapshotIncluded: false",
  "rawMetadataIncluded: false",
  "contactDetailsIncluded: false",
  "legacyTeacherAppraisalIncluded: false",
  "combinedWeightingDefined: false",
  "correctionLineageVerified: true",
  "databaseWritesAllowed: false",
  "providerCallsAllowed: false",
]) {
  assert(
    source.released.includes(marker),
    "Released-result policy marker missing",
    marker,
  );
}

for (const marker of [
  "verifyTeacherSupervisoryFinalizedAssessmentEvidence",
  "verifyTeacherSupervisorySealedAssessmentEvidence",
  "computeTeacherSupervisoryCorrectionRevisionKey",
  "computeTeacherSupervisoryReviewEvidenceHash",
  "planTeacherSupervisoryReviewAction",
  "teacherSupervisoryReviewChainForAssessor",
  "readTeacherSupervisoryObservationDetailsSnapshot",
  "readTeacherSupervisoryObservationSelectionSnapshot",
  "effectiveRole",
  'actorRole !==',
  "TEACHER_SUPERVISORY_RELEASED_RESULT_TARGET_FORBIDDEN",
  "TEACHER_SUPERVISORY_RELEASED_RESULT_NOT_RELEASED",
  "TEACHER_SUPERVISORY_RELEASED_RESULT_ACTIVE_MEMBERSHIP_REQUIRED",
  "TEACHER_SUPERVISORY_RELEASED_RESULT_MEMBERSHIP_SCOPE_DRIFT",
  "TEACHER_SUPERVISORY_RELEASED_RESULT_RELEASE_REVIEW_INVALID",
  "TEACHER_SUPERVISORY_RELEASED_RESULT_RELEASE_PROOF_DRIFT",
  "TEACHER_SUPERVISORY_RELEASED_RESULT_CYCLE_RELEASE_ANCHOR_DRIFT",
  "TEACHER_SUPERVISORY_RELEASED_RESULT_RELEASE_MODE_INVALID",
  "TEACHER_SUPERVISORY_RELEASED_RESULT_DIRECT_RELEASE_AUTHORITY_DRIFT",
  "TEACHER_SUPERVISORY_RELEASED_RESULT_DIRECT_RELEASE_POLICY_DRIFT",
  "TEACHER_SUPERVISORY_RELEASED_RESULT_DIRECT_RELEASE_PROOF_DRIFT",
  "TEACHER_SUPERVISORY_RELEASED_RESULT_DIRECT_RELEASE_CYCLE_ANCHOR_DRIFT",
  "TEACHER_SUPERVISORY_RELEASED_RESULT_CORRECTION_REVISION_KEY_DRIFT",
  "TEACHER_SUPERVISORY_RELEASED_RESULT_CORRECTION_RETURN_PROOF_DRIFT",
  "TEACHER_SUPERVISORY_RELEASED_RESULT_OBSERVATION_CONTEXT_DRIFT",
  "TEACHER_SUPERVISORY_RELEASED_RESULT_FORM_STRUCTURE_DRIFT",
]) {
  assert(
    source.released.includes(marker),
    "Released-result verification marker missing",
    marker,
  );
}

for (const marker of [
  "releaseModeVerified: true",
  "reviewEvidenceHashVerified:",
  "reviewChainHashVerified:",
  "directReleaseAuthorityVerified:",
  "decisionContractHashVerified: true",
  "releaseRequestHashVerified: true",
  "releaseEvidenceHashVerified: true",
  "releaseProofHashVerified: true",
  "cycleReviewReleaseAnchorsVerified: true",
  "correctionLineageVerified: true",
  "officialFormProjectionVerified: true",
  "generalCommentIncludedInAssessmentHash: true",
  "reviewerMayRewriteScores: false",
  "reviewerMayRewriteComment: false",
  "legacyTeacherAppraisalIncluded: false",
  "combinedWeightingDefined: false",
  "scoreMutationAllowed: false",
]) {
  assert(
    source.released.includes(marker),
    "Released-result integrity projection marker missing",
    marker,
  );
}

for (const forbidden of [
  "appraisalCycle.update",
  "appraisalAssessment.update",
  "appraisalReview.update",
  "appraisalReview.create",
  "auditLog.create",
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
    !source.released.includes(forbidden),
    "Released-result reader contains forbidden mutation/provider marker",
    forbidden,
  );
}

assert(
  source.decision.includes(
    'const RELEASE_METADATA_KEY = "teacherSupervisoryRelease"',
  ) &&
    source.directRelease.includes(
      'const RELEASE_METADATA_KEY = "teacherSupervisoryRelease"',
    ) &&
    source.released.includes(
      'const RELEASE_METADATA_KEY = "teacherSupervisoryRelease"',
    ),
  "Released-result metadata key must match both Director release writers",
);

for (const marker of [
  "assessmentRevision: input.evidence.revision",
  'assessmentStatus: "FINALIZED"',
  "assessmentHash: input.evidence.assessmentHash",
  "observationContextHash: input.evidence.observationContextHash",
  'reviewDecision: "ACCEPTED"',
  "reviewEvidenceHash: input.sourceReviewEvidenceHash",
  "reviewChainHash: input.reviewChainHash",
  'reviewerRole: "DISTRICT_DIRECTOR"',
  "decisionContractHash: input.decisionContractHash",
  "releaseRequestHash: input.decisionRequestHash",
  "releaseEvidenceHash: input.decisionEvidenceHash",
  "assessmentMutationPerformed: false",
  "scoreMutationPerformed: false",
  "commentMutationPerformed: false",
  "legacyTeacherAppraisalIncluded: false",
  "combinedWeightingDefined: false",
  "notificationsSeeded: false",
  "providerCalled: false",
]) {
  assert(
    source.decision.includes(marker),
    "Director release-writer proof marker missing",
    marker,
  );
}


for (const marker of [
  'releaseMode: "DIRECTOR_AUTHORED_DIRECT_RELEASE"',
  "reviewRowsRequired: false",
  "reviewRowsAllowed: false",
  "selfReviewAllowed: false",
  "reviewRowsPresent: false",
  "selfReviewPerformed: false",
  'releaserRole: "DISTRICT_DIRECTOR"',
  "decisionContractHash: input.decisionContractHash",
  "releaseRequestHash: input.releaseRequestHash",
  "releaseEvidenceHash: input.releaseEvidenceHash",
  "assessmentMutationPerformed: false",
  "scoreMutationPerformed: false",
  "commentMutationPerformed: false",
  "legacyTeacherAppraisalIncluded: false",
  "combinedWeightingDefined: false",
  "notificationsSeeded: false",
  "providerCalled: false",
  "input.cycle.closedByUserId !== input.evidence.assessorUserId",
  "clean(cycleReview.releasedAt) !== releasedAt",
]) {
  assert(
    source.directRelease.includes(marker),
    "Director-authored direct-release proof marker missing",
    marker,
  );
}

assert(
  source.released.includes("releaseReviewChainHash(releaseReview)") &&
    source.released.includes("decisionContractHash({") &&
    source.released.includes("releaseRequestHash({") &&
    source.released.includes("releaseEvidenceHash({") &&
    source.released.includes("releaseProofPayload({") &&
    source.released.includes(
      "const expectedReleaseProofHash = hashJson(expectedProof)",
    ),
  "Released result must independently recompute reviewed release hashes",
);

assert(
  source.released.includes("directDecisionContractHash()") &&
    source.released.includes("directReleaseRequestHash({") &&
    source.released.includes("directReleaseEvidenceHash({") &&
    source.released.includes("directReleaseProofPayload({") &&
    source.released.includes("verifyDirectorAuthoredDirectRelease({") &&
    source.released.includes("verifyReviewedDirectorRelease({") &&
    source.released.includes(
      "storedReleaseMode === DIRECT_RELEASE_MODE",
    ),
  "Released result must independently verify both release-proof modes",
);

for (const marker of [
  'const REVIEWED_RELEASE_MODE = "REVIEWED_DIRECTOR_RELEASE"',
  'const DIRECT_RELEASE_MODE = "DIRECTOR_AUTHORED_DIRECT_RELEASE"',
  "input.record.reviews.length !== 0",
  'input.evidence.assessorRole !== "DISTRICT_DIRECTOR"',
  "input.evidence.revision !== 1",
  "input.record.priorAssessmentId",
  "input.cycle.closedByUserId !== input.evidence.assessorUserId",
  "chain.requiresReviewRows !== false",
  "chain.selfReviewAllowed !== false",
  "chain.stages.length !== 0",
  'chain.terminalAuthorityRole !== "DISTRICT_DIRECTOR"',
  "reviewRowsRequired !== false",
  "reviewRowsPresent !== false",
  "selfReviewPerformed !== false",
  "releaserAssignmentId !== input.evidence.assessorAssignmentId",
  "releaseVerification.releaseMode",
  "releaseVerification.reviewStage",
]) {
  assert(
    source.released.includes(marker),
    "Dual released-result integrity marker missing",
    marker,
  );
}

assert(
  source.released.includes(
    "computeTeacherSupervisoryCorrectionRevisionKey({",
  ) &&
    source.released.includes('allowedStatuses: ["SUPERSEDED"]') &&
    source.released.includes(
      'normalized(returnReview.decision) !== "RETURNED"',
    ) &&
    source.released.includes(
      "assertForwardReviewLink({",
    ),
  "Released result must verify correction lineage and historical review chain",
);

assert(
  source.released.includes("TEACHER_SUPERVISORY_RELEASED_RESULT_INITIAL_REVISION_DRIFT") &&
    source.released.includes("while (currentRecord.revision > 1)") &&
    source.released.includes("currentRecord.revision - 1"),
  "Correction lineage must resolve deterministically to revision 1",
);

assert(
  source.released.includes(
    "readTeacherSupervisoryObservationDetailsSnapshot",
  ) &&
    source.released.includes(
      "readTeacherSupervisoryObservationSelectionSnapshot",
    ) &&
    source.released.includes(
      "teacherAssignmentVerified = true",
    ) &&
    source.released.includes(
      "curriculumSelectionVerified = true",
    ),
  "Official Teacher observation evidence projection missing",
);

assert(
  source.released.includes("generalComment: record.generalComment") &&
    source.released.includes("score: score.score") &&
    source.released.includes("notApplicable: score.notApplicable") &&
    source.released.includes(
      "releaseMode: releaseVerification.releaseMode",
    ),
  "Released official Teacher form must include sealed scores, General Comment, and verified release mode",
);

const publicProjectionStart = source.released.lastIndexOf(
  'return {\n    schemaVersion: 1,\n    audience: "RELEASED_TEACHER"',
);
assert(
  publicProjectionStart >= 0,
  "Released public projection block not found",
);
const publicProjection = source.released.slice(publicProjectionStart);

for (const forbiddenPublicField of [
  "reviewerUserId:",
  "reviewerAssignmentId:",
  "assessorUserId:",
  "assessorAssignmentId:",
  "returnReason:",
  "reviewNote:",
  "rawMetadata:",
  "evidenceSnapshotJson:",
]) {
  assert(
    !publicProjection.includes(forbiddenPublicField),
    "Released public projection exposes internal provenance",
    forbiddenPublicField,
  );
}

assert(
  source.scoring.includes(
    "generalCommentIncludedInHash: true",
  ) &&
    source.review.includes(
      'directorActions: ["RETURN", "RELEASE"]',
    ) &&
    source.reviewPackage.includes(
      "TEACHER_SUPERVISORY_REVIEW_PACKAGE_PRIOR_FORWARD_INVALID",
    ),
  "Required finalized/review-chain regressions missing",
);


for (const forbidden of [
  "appraisalReview.create",
  "appraisalReview.update",
  "appraisalReview.updateMany",
  'decision: "PENDING"',
  'decision: "ACCEPTED"',
]) {
  assert(
    !source.directRelease.includes(forbidden),
    "Director-authored direct release must remain review-row free",
    forbidden,
  );
}

console.log("");
console.log("=== N6-E5E2 GOVERNANCE TEACHER DUAL RELEASE-PROOF READ CONTRACT ===");
console.log("");
console.log("Audience                         : released target Teacher only");
console.log("Required lifecycle               : RELEASED");
console.log("Release modes                    : reviewed Director / Director-authored direct");
console.log("Reviewed release                 : ACCEPTED Director review + full chain");
console.log("Direct release                   : no AppraisalReview row + no self-review");
console.log("Direct assessor/releaser         : exact same District Director + assignment");
console.log("Direct lifecycle custody         : exact closedBy + shared release timestamp");
console.log("Target binding                   : exact user + tenant + Teacher membership");
console.log("Finalized assessment             : shared full verifier");
console.log("Official Teacher form            : 6 domains / 34 items");
console.log("Scores / N/A                     : sealed read-only values included");
console.log("General Comment                  : included; sealed in assessment hash");
console.log("Observation particulars          : included + v2 provenance reverified");
console.log("Reviewed review hashes           : independently recomputed");
console.log("Direct decision contract hash    : independently recomputed");
console.log("Direct release request hash      : independently recomputed");
console.log("Direct release evidence hash     : independently recomputed");
console.log("Release proof hash               : independently recomputed in both modes");
console.log("Cycle release anchors            : independently reverified in both modes");
console.log("Correction lineage               : reviewed path verified to revision 1");
console.log("Direct revision                  : revision 1 only");
console.log("Reviewer identity                : excluded from result");
console.log("Assessor identity                : excluded; office label only");
console.log("Review notes / Return reasons    : excluded from result");
console.log("Raw evidence / metadata          : excluded from result");
console.log("Legacy TeacherAppraisal          : excluded");
console.log("Combined weighting               : undefined");
console.log("Database writes                  : absent");
console.log("Notifications/providers          : absent");
console.log("Database accessed                : source contract only");
console.log("");
console.log("RESULT: N6-E5E2 GOVERNANCE TEACHER DUAL RELEASE-PROOF READ CONTRACT GREEN");
