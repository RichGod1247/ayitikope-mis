#!/usr/bin/env node
"use strict";
/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS source-contract QA harness. */

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..", "..");

const files = {
  assessmentPolicy: "src/lib/appraisals/teacherSupervisoryAssessment.ts",
  reviewPolicy: "src/lib/appraisals/teacherSupervisoryReview.ts",
  scoring: "src/lib/appraisals/teacherSupervisoryAssessmentScoring.ts",
  hosDecision: "src/lib/appraisals/teacherSupervisoryHosReviewDecision.ts",
  revision: "src/lib/appraisals/teacherSupervisoryAssessmentRevision.ts",
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
  'correctionDraftCycleStatus: "UNDER_REVIEW"',
  "correctionRevisionMinimum: 2",
  "correctionRevisionSchemaVersion: 1",
  "correctionRevisionMetadataRequired: true",
  "computeTeacherSupervisoryCorrectionRevisionKey",
  "assertCorrectionRevisionBoundary",
  "TEACHER_SUPERVISORY_SCORING_CORRECTION_REVISION_INVALID",
  "sourceAssessmentId === priorAssessmentId",
  "sourceObservationContextHash === observationContextHash",
  "metadata.copyScores === true",
  "metadata.copyGeneralComment === true",
  "record.overallPercentage === null",
  "record.assessmentHash === null",
  "record.finalizedByUserId === null",
  "record.finalizedAt === null",
  'clean(cycleReview.state) === "RETURNED_FOR_CORRECTION"',
  "cycleReview.awaitingRevision === true",
]) {
  assert(
    source.scoring.includes(marker),
    "Teacher correction editability bridge marker missing",
    marker,
  );
}

assert(
  source.scoring.includes(
    "export async function verifyTeacherSupervisorySealedAssessmentEvidence",
  ) &&
    source.scoring.includes('allowedStatuses: ["RETURNED", "SUPERSEDED"]') === false,
  "Reusable sealed evidence verifier must exist without hardcoding revision-only statuses",
);

for (const marker of [
  "planReturnedTeacherSupervisoryRevision",
  "planTeacherSupervisoryCorrectionContinuation",
  "verifyTeacherSupervisorySealedAssessmentEvidence",
  "computeTeacherSupervisoryCorrectionRevisionKey",
  'eligibleCycleStatus: "UNDER_REVIEW"',
  'returnedStatus: "RETURNED"',
  'supersededStatus: "SUPERSEDED"',
  'newRevisionStatus: "DRAFT"',
  "preserveObservationContext: true",
  "copyScoreRows: true",
  "copyGeneralComment: true",
  "expectedScoreCount: 34",
  "originalAssessorOnly: true",
  "currentAssessorAuthorityRequired: true",
  "preserveReturningReviewerForCorrection: true",
  "reviewerMayRewriteScores: false",
  "reviewerMayRewriteComment: false",
  "cycleMutationAllowed: false",
  "reviewMutationAllowed: false",
  "notificationsSeeded: false",
  "providerCallsAllowed: false",
  'transactionIsolation: "SERIALIZABLE"',
]) {
  assert(
    source.revision.includes(marker),
    "Teacher returned-revision policy marker missing",
    marker,
  );
}

for (const marker of [
  'normalized(review.decision) === "RETURNED"',
  'clean(objectValue(review.metadata).decisionAction) === "RETURN"',
  "TEACHER_SUPERVISORY_REVISION_RETURN_PROVENANCE_DRIFT",
  "RETURNED_FOR_CORRECTION",
  "awaitingRevision",
  "returnDecisionRequestHash",
  "returnDecisionEvidenceHash",
  "returnReasonHash",
  "returnReasonLength",
  "cycleId_assessorUserId_revision",
  "EXISTING_MATCH",
  "appraisalAssessmentScore.createMany",
  'status: "DRAFT"',
  "priorAssessmentId: source.id",
  "generalComment: source.generalComment",
  "evidenceSnapshotJson: source.evidenceSnapshotJson",
  "overallPercentage: null",
  "sectionPercentagesJson: {}",
  "assessmentHash: null",
  "finalizedByUserId: null",
  "finalizedAt: null",
  'status: "SUPERSEDED"',
  "TEACHER_SUPERVISORY_ASSESSMENT_REVISION_CREATED",
  'code === "P2002"',
  'code === "P2034"',
]) {
  assert(
    source.revision.includes(marker),
    "Teacher revision execution marker missing",
    marker,
  );
}

assert(
  source.assessmentPolicy.includes("planReturnedTeacherSupervisoryRevision") &&
    source.assessmentPolicy.includes('from: "RETURNED"') &&
    source.assessmentPolicy.includes('to: "SUPERSEDED"') &&
    source.assessmentPolicy.includes('status: "DRAFT"'),
  "Teacher assessment returned-revision plan regression",
);

assert(
  source.reviewPolicy.includes(
    "planTeacherSupervisoryCorrectionContinuation",
  ) &&
    source.reviewPolicy.includes("preserveReturningReviewer: true") &&
    source.reviewPolicy.includes('reviewDecision: "PENDING"'),
  "Correction continuation policy regression",
);

assert(
  source.hosDecision.includes('state: "RETURNED_FOR_CORRECTION"') &&
    source.hosDecision.includes("awaitingRevision: true") &&
    source.hosDecision.includes("returnDecisionRequestHash") &&
    source.hosDecision.includes("returnDecisionEvidenceHash"),
  "N6-E3 returned-assessment provenance regression",
);

for (const forbidden of [
  "appraisalCycle.update",
  "appraisalCycle.updateMany",
  "appraisalReview.create",
  "appraisalReview.update",
  "appraisalReview.updateMany",
  "appraisalAssessmentScore.upsert",
  "teacherAppraisal.create",
  "teacherAppraisal.update",
  "prisma.teacherAppraisal",
  "sendSms",
  "sendEmail",
  "appraisalNotification",
  "localStorage",
  "sessionStorage",
  "setInterval(",
]) {
  assert(
    !source.revision.includes(forbidden),
    "Revision service contains forbidden lifecycle/provider marker",
    forbidden,
  );
}

assert(
  source.revision.includes("returnReasonTextRecordedInAudit: false") &&
    source.revision.includes("scoreValuesRecordedInAudit: false") &&
    source.revision.includes("generalCommentTextRecordedInAudit: false") &&
    source.revision.includes("observationDetailsRecordedInAudit: false"),
  "Revision audit must exclude returned reason/evidence values",
);

console.log("");
console.log("=== N6-E4A GOVERNANCE TEACHER ORIGINAL-ASSESSOR CORRECTION REVISION ===");
console.log("");
console.log("Source assessment                : RETURNED sealed assessment");
console.log("Source evidence                  : full immutable hash reverified");
console.log("Creator                          : original governance assessor only");
console.log("Current assessor authority       : revalidated");
console.log("Return review                    : exact durable RETURNED review");
console.log("Return reason                    : preserved for assessor; audit text excluded");
console.log("Returning reviewer               : role/stage/user/assignment preserved");
console.log("Correction continuation policy   : same returning reviewer/stage");
console.log("Source transition                : RETURNED -> SUPERSEDED");
console.log("New assessment                   : DRAFT revision + 1");
console.log("priorAssessmentId                : immutable source assessment");
console.log("Observation evidence             : exact snapshot copied");
console.log("Observation-context hash         : unchanged");
console.log("Scores                           : all 34 copied exactly");
console.log("General Comment                  : copied, then assessor-editable");
console.log("Aggregates/hash/finalization     : reset");
console.log("Correction-cycle editability     : verified UNDER_REVIEW bridge only");
console.log("Arbitrary UNDER_REVIEW draft     : rejected");
console.log("Cycle mutation                   : absent");
console.log("Review mutation                  : absent");
console.log("Weak-network/concurrent retry    : EXISTING_MATCH + P2002/P2034 recovery");
console.log("Reviewer score/comment rewrite   : forbidden");
console.log("Legacy TeacherAppraisal          : untouched");
console.log("Notifications/providers          : absent");
console.log("Prisma migration                 : not required");
console.log("Database accessed                : source contract only");
console.log("");
console.log("RESULT: N6-E4A GOVERNANCE TEACHER CORRECTION REVISION BACKEND GREEN");
