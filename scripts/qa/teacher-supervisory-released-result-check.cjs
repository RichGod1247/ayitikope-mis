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
  "reviewEvidenceHashVerified: true",
  "reviewChainHashVerified: true",
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
    source.released.includes(
      'const RELEASE_METADATA_KEY = "teacherSupervisoryRelease"',
    ),
  "Released-result metadata key must match Director release writer",
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

assert(
  source.released.includes("releaseReviewChainHash(releaseReview)") &&
    source.released.includes("decisionContractHash({") &&
    source.released.includes("releaseRequestHash({") &&
    source.released.includes("releaseEvidenceHash({") &&
    source.released.includes("releaseProofPayload({") &&
    source.released.includes(
      "const expectedReleaseProofHash = hashJson(expectedProof)",
    ),
  "Released result must independently recompute release hashes",
);

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
    source.released.includes("notApplicable: score.notApplicable"),
  "Released official Teacher form must include sealed scores and General Comment",
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

console.log("");
console.log("=== N6-E5D1 GOVERNANCE TEACHER RELEASED-RESULT READ CONTRACT ===");
console.log("");
console.log("Audience                         : released target Teacher only");
console.log("Required lifecycle               : RELEASED");
console.log("Target binding                   : exact user + tenant + Teacher membership");
console.log("School hierarchy                 : active school / circuit / district");
console.log("Finalized assessment             : shared full verifier");
console.log("Official Teacher form            : 6 domains / 34 items");
console.log("Scores / N/A                     : sealed read-only values included");
console.log("General Comment                  : included; already sealed in assessment hash");
console.log("Official observation particulars : included");
console.log("v2 assignment/curriculum         : reverified");
console.log("Release review                   : exact Director ACCEPTED terminal review");
console.log("Review evidence hash             : independently recomputed");
console.log("Review-chain hash                : independently recomputed");
console.log("Decision contract hash           : independently recomputed");
console.log("Release request hash             : independently recomputed");
console.log("Release evidence hash            : independently recomputed");
console.log("Release proof hash               : independently recomputed");
console.log("Cycle release anchors            : independently reverified");
console.log("Correction revisions             : full lineage to revision 1 verified");
console.log("Historical Return chain          : SUPERSEDED source + durable reviews verified");
console.log("Reviewer identity                : excluded from result");
console.log("Assessor identity                : excluded; office label only");
console.log("Review notes / Return reasons    : excluded from result");
console.log("Raw evidence / metadata          : excluded from result");
console.log("Contact details                  : excluded");
console.log("Legacy TeacherAppraisal          : excluded");
console.log("Combined weighting               : undefined");
console.log("Database writes                  : absent");
console.log("Notifications/providers          : absent");
console.log("Database accessed                : source contract only");
console.log("");
console.log("RESULT: N6-E5D1 GOVERNANCE TEACHER RELEASED-RESULT READ CONTRACT GREEN");
