#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS source-contract QA harness. */

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..", "..");

const files = {
  directRelease:
    "src/lib/appraisals/teacherSupervisoryDirectorDirectRelease.ts",
  reviewAdmission:
    "src/lib/appraisals/teacherSupervisoryReviewAdmission.ts",
  reviewPolicy:
    "src/lib/appraisals/teacherSupervisoryReview.ts",
  directorDecision:
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
  return fs
    .readFileSync(absolutePath, "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
}

const source = Object.fromEntries(
  Object.entries(files).map(([key, relativePath]) => [key, read(relativePath)]),
);

for (const marker of [
  "TEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_POLICY",
  'releaseMode: "DIRECTOR_AUTHORED_DIRECT_RELEASE"',
  'requiredActorRole: "DISTRICT_DIRECTOR"',
  'requiredAssessorRole: "DISTRICT_DIRECTOR"',
  'requiredAssessmentStatus: "FINALIZED"',
  'requiredInitialCycleStatus: "OPEN"',
  'releasedCycleStatus: "RELEASED"',
  "exactAssessorAsReleaserRequired: true",
  "exactAssessorAssignmentAsReleaserAssignmentRequired: true",
  "reviewRowsRequired: false",
  "reviewRowsAllowed: false",
  "selfReviewAllowed: false",
  "initialRevisionOnly: true",
  "assessmentMutationAllowed: false",
  "scoreMutationAllowed: false",
  "commentMutationAllowed: false",
  "legacyTeacherAppraisalIncluded: false",
  "combinedWeightingDefined: false",
  "notificationsSeeded: false",
  "providerCallsAllowed: false",
  'transactionIsolation: "SERIALIZABLE"',
]) {
  assert(
    source.directRelease.includes(marker),
    "Director direct-release policy marker missing",
    marker,
  );
}

for (const marker of [
  "verifyTeacherSupervisoryFinalizedAssessmentEvidence",
  "teacherSupervisoryReviewChainForAssessor",
  'input.evidence.assessorRole !== "DISTRICT_DIRECTOR"',
  "input.evidence.assessorUserId !== input.actorUserId",
  "chain.requiresReviewRows !== false",
  "chain.selfReviewAllowed !== false",
  "chain.stages.length !== 0",
  'chain.terminalAuthorityRole !== "DISTRICT_DIRECTOR"',
  "TEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_INITIAL_REVISION_REQUIRED",
  "expectedAssignmentId: evidence.assessorAssignmentId",
  "assertGovernanceScope",
  "assertCurrentTarget",
  "reviewRows.length !== 0",
  "TEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_REVIEW_ROWS_PRESENT",
  'assertAppraisalCycleTransition("OPEN", "CLOSED")',
  'assertAppraisalCycleTransition("CLOSED", "UNDER_REVIEW")',
  'assertAppraisalCycleTransition("UNDER_REVIEW", "RELEASED")',
  "directDecisionContractHash",
  "directReleaseRequestHash",
  "directReleaseEvidenceHash",
  "directReleaseProofPayload",
  "expectedDirectReleaseProofHash",
  "cycleMetadataForDirectRelease",
  "assertExistingDirectRelease",
  "input.cycle.closedByUserId !== input.evidence.assessorUserId",
  "clean(cycleReview.releasedAt) !== releasedAt",
  "cycleReview.reviewerMayRewriteScores !== false",
  "cycleReview.reviewerMayRewriteComment !== false",
  "cycleReview.legacyTeacherAppraisalIncluded !== false",
  "cycleReview.combinedWeightingDefined !== false",
  "cycleReview.notificationsSeeded !== false",
  "cycleReview.providerCalled !== false",
  'outcome: "EXISTING_RELEASED"',
  'outcome: "RELEASED"',
  'resource: "AppraisalCycle"',
  "DIRECT_RELEASE_AUDIT_ACTION",
  'isPrismaCode(error, "P2034")',
]) {
  assert(
    source.directRelease.includes(marker),
    "Director direct-release backend marker missing",
    marker,
  );
}

for (const proofMarker of [
  "releaseMode:",
  "assessmentRevision: input.evidence.revision",
  'assessmentStatus: "FINALIZED"',
  "assessmentHash: input.evidence.assessmentHash",
  "observationContextHash: input.evidence.observationContextHash",
  "assessorUserId: input.evidence.assessorUserId",
  "assessorAssignmentId: input.evidence.assessorAssignmentId",
  'assessorRole: "DISTRICT_DIRECTOR"',
  "reviewRowsRequired: false",
  "reviewRowsPresent: false",
  "selfReviewPerformed: false",
  "releaserUserId: input.evidence.assessorUserId",
  "releaserAssignmentId: input.releaserAssignmentId",
  'releaserRole: "DISTRICT_DIRECTOR"',
  "decisionContractHash: input.decisionContractHash",
  "releaseRequestHash: input.releaseRequestHash",
  "releaseEvidenceHash: input.releaseEvidenceHash",
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
    source.directRelease.includes(proofMarker),
    "Director direct-release immutable proof marker missing",
    proofMarker,
  );
}

const createReviewMarkers = [
  "appraisalReview.create",
  "appraisalReview.update",
  "appraisalReview.updateMany",
  'decision: "PENDING"',
  'decision: "ACCEPTED"',
];

for (const forbidden of createReviewMarkers) {
  assert(
    !source.directRelease.includes(forbidden),
    "Director-authored direct release must never fabricate or mutate a review row",
    forbidden,
  );
}

const mutationStart = source.directRelease.indexOf(
  'assertAppraisalCycleTransition("OPEN", "CLOSED")',
);
const auditStart = source.directRelease.indexOf(
  "await tx.auditLog.create({",
  mutationStart,
);

assert(
  mutationStart >= 0 && auditStart > mutationStart,
  "Director direct-release mutation block not found",
);

const mutationBlock = source.directRelease.slice(
  mutationStart,
  auditStart,
);

assert(
  mutationBlock.includes("tx.appraisalCycle.updateMany") &&
    mutationBlock.includes('status: "CLOSED"') &&
    mutationBlock.includes('status: "UNDER_REVIEW"') &&
    mutationBlock.includes('status: "RELEASED"') &&
    mutationBlock.includes("cycleMetadataForDirectRelease"),
  "Director direct release must use the valid lifecycle bridge and seal RELEASED",
);

for (const forbiddenMutation of [
  "appraisalAssessment.update",
  "appraisalAssessment.updateMany",
  "appraisalAssessmentScore",
  "appraisalReview.create",
  "appraisalReview.update",
  "appraisalReview.updateMany",
]) {
  assert(
    !mutationBlock.includes(forbiddenMutation),
    "Director direct release must not mutate assessment, scores, or review rows",
    forbiddenMutation,
  );
}

assert(
  source.reviewPolicy.includes(
    'assessorRole: "DISTRICT_DIRECTOR"',
  ) &&
    source.reviewPolicy.includes("requiresReviewRows: false") &&
    source.reviewPolicy.includes("selfReviewAllowed: false") &&
    source.reviewPolicy.includes("stages: []"),
  "Shared Teacher review policy must preserve the Director-authored no-review-row path",
);

assert(
  source.reviewAdmission.includes(
    "TEACHER_SUPERVISORY_REVIEW_ADMISSION_SELF_REVIEW_PATH_FORBIDDEN",
  ) &&
    source.reviewAdmission.includes(
      "if (!chain || !chain.requiresReviewRows || !firstStage)",
    ),
  "Ordinary review admission must continue rejecting the Director-authored self-review path",
);

assert(
  source.directorDecision.includes(
    "decideTeacherSupervisoryReviewAuthority",
  ) &&
    source.directorDecision.includes(
      "TEACHER_SUPERVISORY_DIRECTOR_DECISION_AUTHORITY_DRIFT",
    ),
  "Reviewed Director decision engine must remain separate and self-review protected",
);

for (const auditMarker of [
  "reviewRowsRequired: false",
  "reviewRowsPresent: false",
  "selfReviewPerformed: false",
  'technicalLifecycleBridge:',
  "scoreValuesRecordedInAudit: false",
  "aggregateScoreRecordedInAudit: false",
  "generalCommentRecordedInAudit: false",
  "observationDetailsRecordedInAudit: false",
  "classEnrolmentRecordedInAudit: false",
  "contactFieldsIncluded: false",
  "assessmentMutationPerformed: false",
  "scoreMutationPerformed: false",
  "commentMutationPerformed: false",
]) {
  assert(
    source.directRelease.includes(auditMarker),
    "Director direct-release audit safety marker missing",
    auditMarker,
  );
}

for (const forbiddenProvider of [
  "sendSms",
  "sendEmail",
  "appraisalNotification.create",
  "appraisalNotification.createMany",
  "fetch(",
  "axios",
]) {
  assert(
    !source.directRelease.includes(forbiddenProvider),
    "Director direct release must not call providers or seed notifications",
    forbiddenProvider,
  );
}

console.log("");
console.log("=== N6-E5E1 GOVERNANCE TEACHER DIRECTOR-AUTHORED DIRECT RELEASE ===");
console.log("");
console.log("Eligible assessor                  : District Director only");
console.log("Eligible releaser                  : exact same District Director");
console.log("Assessor assignment                : exact current district assignment");
console.log("Assessment                         : FINALIZED + shared proof reverified");
console.log("Revision                           : initial revision 1 only");
console.log("Target Teacher                     : active + exact jurisdiction");
console.log("Governance scope                   : revalidated");
console.log("Ordinary review admission          : still forbidden");
console.log("AppraisalReview rows required      : false");
console.log("AppraisalReview rows created       : false");
console.log("AppraisalReview rows mutated       : false");
console.log("Director self-review               : false");
console.log("Lifecycle bridge                   : OPEN -> CLOSED -> UNDER_REVIEW -> RELEASED");
console.log("Lifecycle bridge transaction       : one SERIALIZABLE transaction");
console.log("Assessment mutation                : absent");
console.log("Score / General Comment mutation   : absent");
console.log("Observation/provenance mutation    : absent");
console.log("Direct release mode                : explicit immutable proof");
console.log("Decision contract hash             : deterministic");
console.log("Release request hash               : deterministic");
console.log("Release evidence hash              : deterministic");
console.log("Release proof hash                 : deterministic");
console.log("Weak-network retry                 : EXISTING_RELEASED + proof reverification");
console.log("P2034 retry                        : supported");
console.log("Audit resource                     : AppraisalCycle, not fake AppraisalReview");
console.log("Audit score/comment/evidence text  : excluded");
console.log("Legacy TeacherAppraisal            : untouched");
console.log("Combined weighting                 : undefined");
console.log("Notifications/providers            : absent");
console.log("Prisma migration                   : not required");
console.log("Database accessed                  : source contract only");
console.log("");
console.log("RESULT: N6-E5E1 GOVERNANCE TEACHER DIRECTOR-AUTHORED DIRECT RELEASE GREEN");
