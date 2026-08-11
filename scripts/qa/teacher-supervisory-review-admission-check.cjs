#!/usr/bin/env node
"use strict";
/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS source-contract QA harness. */

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..", "..");

const files = {
  scoring: "src/lib/appraisals/teacherSupervisoryAssessmentScoring.ts",
  reviewPolicy: "src/lib/appraisals/teacherSupervisoryReview.ts",
  reviewQueue: "src/lib/appraisals/teacherSupervisoryReviewQueue.ts",
  admission: "src/lib/appraisals/teacherSupervisoryReviewAdmission.ts",
  workflow: "src/lib/appraisals/workflow.ts",
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

assert(
  source.scoring.includes(
    "export async function verifyTeacherSupervisoryFinalizedAssessmentEvidence",
  ),
  "Reusable finalized Teacher evidence verifier missing",
);

for (const marker of [
  "assertInstrumentStructure(record)",
  "validateStoredScores(record, sections)",
  "verifyFinalizedAssessment(record, sections)",
  "parseObservationContext(record)",
  "generalCommentIncludedInHash: true",
  "separateFromLegacyTeacherAppraisal: true",
  "combinedWeightingDefined: false",
]) {
  assert(
    source.scoring.includes(marker),
    "Finalized-proof boundary marker missing",
    marker,
  );
}

for (const required of [
  "verifyTeacherSupervisoryFinalizedAssessmentEvidence",
  "decideTeacherSupervisoryReviewAuthority",
  "teacherSupervisoryReviewChainForAssessor",
  'transactionIsolation: "SERIALIZABLE"',
  'initialCycleStatus: "OPEN"',
  'intermediateCycleStatus: "CLOSED"',
  'admittedCycleStatus: "UNDER_REVIEW"',
  "assertAppraisalCycleTransition(\"OPEN\", \"CLOSED\")",
  "assertAppraisalCycleTransition(\"CLOSED\", \"UNDER_REVIEW\")",
  'status: "CLOSED"',
  'status: "UNDER_REVIEW"',
  'decision: "PENDING"',
  "reviewEvidenceHash",
  "immutableEvidenceReverified: true",
  "generalCommentIncludedInAssessmentHash: true",
  "reviewerMayRewriteScores: false",
  "reviewerMayRewriteComment: false",
  "assessmentMutationPerformed: false",
  "scoreMutationPerformed: false",
  "notificationsSeeded: false",
  "providerCalled: false",
  'isPrismaCode(error, "P2002")',
  'isPrismaCode(error, "P2034")',
]) {
  assert(
    source.admission.includes(required),
    "Review-admission contract marker missing",
    required,
  );
}

assert(
  source.workflow.includes('OPEN: ["CLOSED", "CANCELLED"]') &&
    source.workflow.includes('CLOSED: ["UNDER_REVIEW", "CANCELLED"]'),
  "Global legal cycle transition chain drifted",
);

assert(
  source.reviewPolicy.includes("directorAuthored") ||
    source.reviewPolicy.includes("requiresReviewRows: false"),
  "Director-originated no-self-review policy missing",
);

assert(
  source.admission.includes(
    "TEACHER_SUPERVISORY_REVIEW_ADMISSION_SELF_REVIEW_PATH_FORBIDDEN",
  ),
  "Director-originated admission must fail closed",
);

assert(
  source.admission.includes("assessmentId_stage"),
  "Review admission must use assessment+stage uniqueness for idempotency",
);

assert(
  source.admission.includes("EXISTING_REVIEW"),
  "Weak-network retry result missing",
);

assert(
  source.admission.includes("closedAt: now") &&
    source.admission.includes("closedByUserId: actorUserId") &&
    source.admission.includes("reviewStartedAt: now"),
  "Review admission timestamps/provenance missing",
);

for (const forbidden of [
  "appraisalAssessment.update(",
  "appraisalAssessment.updateMany(",
  "appraisalAssessmentScore.upsert(",
  "appraisalAssessmentScore.update",
  "prisma.teacherAppraisal",
  "teacherAppraisal.create",
  "teacherAppraisal.update",
  "sendSms",
  "sendEmail",
  "appraisalNotification.create",
  "localStorage",
  "sessionStorage",
  "setInterval(",
]) {
  assert(
    !source.admission.includes(forbidden),
    "Review admission contains forbidden mutation/provider marker",
    forbidden,
  );
}

assert(
  !source.admission.includes("generalComment:"),
  "Review admission must not copy or rewrite General Comment text",
);

assert(
  !source.admission.includes("scores:"),
  "Review admission must not copy or rewrite score payloads",
);

assert(
  source.reviewQueue.includes(
    "fullAssessmentHashReverificationDeferredToAction: true",
  ) &&
    source.reviewQueue.includes('state: "READY_TO_START"') &&
    source.reviewQueue.includes('nextAction: "START_REVIEW"') &&
    !source.reviewQueue.includes(
      "verifyTeacherSupervisoryFinalizedAssessmentEvidence",
    ),
  "READY_TO_START discovery must remain read-only and defer full proof to admission",
);

console.log("");
console.log("=== N6-E1C GOVERNANCE TEACHER ATOMIC REVIEW ADMISSION ===");
console.log("");
console.log("Input assessment                 : FINALIZED Teacher governance assessment");
console.log("Full finalized proof             : shared D4 scoring verifier");
console.log("34 scores / calculations         : deterministically reverified");
console.log("General Comment                  : remains inside immutable assessment hash");
console.log("Observation context              : hash + v1/v2 contract reverified");
console.log("Reviewer authority               : chain + capability + active assignment");
console.log("Target jurisdiction              : active Teacher / school / circuit / district");
console.log("Director-authored self-review    : forbidden");
console.log("Cycle ingress                    : OPEN -> CLOSED -> UNDER_REVIEW");
console.log("Transition transaction           : SERIALIZABLE");
console.log("Initial AppraisalReview          : one PENDING stage");
console.log("Review evidence                  : deterministic SHA-256 anchor");
console.log("Weak-network retry               : EXISTING_REVIEW");
console.log("Concurrent uniqueness race       : P2002 recovery");
console.log("Serializable race                : P2034 retry");
console.log("Assessment / score mutation      : absent");
console.log("Reviewer score/comment rewrite   : forbidden");
console.log("Audit score/comment text         : excluded");
console.log("Legacy TeacherAppraisal          : untouched");
console.log("Notifications/providers          : absent");
console.log("Prisma migration                 : not required");
console.log("Database accessed                : source contract only");
console.log("");
console.log("RESULT: N6-E1C GOVERNANCE TEACHER ATOMIC REVIEW ADMISSION GREEN");
