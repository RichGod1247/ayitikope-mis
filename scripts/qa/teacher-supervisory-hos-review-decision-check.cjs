#!/usr/bin/env node
"use strict";
/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS source-contract QA harness. */

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..", "..");

const files = {
  policy: "src/lib/appraisals/teacherSupervisoryReview.ts",
  admission: "src/lib/appraisals/teacherSupervisoryReviewAdmission.ts",
  package: "src/lib/appraisals/teacherSupervisoryReviewPackage.ts",
  decision: "src/lib/appraisals/teacherSupervisoryHosReviewDecision.ts",
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

for (const required of [
  'reviewerRole: "HEAD_OF_SUPERVISION"',
  'allowedActions: ["RETURN", "FORWARD"]',
  'requiredCycleStatus: "UNDER_REVIEW"',
  'requiredCurrentReviewDecision: "PENDING"',
  'returnReviewDecision: "RETURNED"',
  'forwardReviewDecision: "ACCEPTED"',
  "returnedAssessmentRequiresRevision: true",
  "preserveReturningReviewerForCorrection: true",
  "forwardCreatesDirectorStage: true",
  "reviewerMayRewriteScores: false",
  "reviewerMayRewriteComment: false",
  "scoreMutationAllowed: false",
  "notificationsSeeded: false",
  "providerCallsAllowed: false",
  'transactionIsolation: "SERIALIZABLE"',
]) {
  assert(
    source.decision.includes(required),
    "HOS decision policy marker missing",
    required,
  );
}

for (const required of [
  "readTeacherSupervisoryReviewPackage",
  "verifyTeacherSupervisoryFinalizedAssessmentEvidence",
  "planTeacherSupervisoryReviewAction",
  "decideTeacherSupervisoryReviewAuthority",
  "computeTeacherSupervisoryReviewEvidenceHash",
  'action === "RETURN"',
  'action === "FORWARD"',
  'decision: "PENDING"',
  'role: "DISTRICT_DIRECTOR"',
  "nextReviewMetadata",
  "cycleMetadataForForward",
  "cycleMetadataForReturn",
  "assessmentMetadataForReturn",
  "decisionContractHash",
  "decisionRequestHash",
  "decisionEvidenceHash",
  "EXISTING_RETURNED",
  "EXISTING_FORWARDED",
  'isPrismaCode(error, "P2002")',
  'isPrismaCode(error, "P2034")',
  "TEACHER_SUPERVISORY_HOS_DECISION_WRITE_RACE",
]) {
  assert(
    source.decision.includes(required),
    "HOS decision execution marker missing",
    required,
  );
}

assert(
  source.policy.includes('hosActions: ["RETURN", "FORWARD"]') &&
    source.policy.includes('reviewDecision: "RETURNED"') &&
    source.policy.includes('reviewDecision: "ACCEPTED"'),
  "N6-E1A HOS action semantics drifted",
);

assert(
  source.decision.includes('status: "RETURNED"') &&
    source.decision.includes('status: "FINALIZED"'),
  "Return/Forward assessment-state semantics missing",
);

assert(
  source.decision.includes("appraisalReview.create") &&
    source.decision.includes("sourceReview.stage + 1"),
  "Forward must create exactly the next Director review stage",
);

assert(
  source.decision.includes("activeDirectors.length !== 1"),
  "Forward must fail closed on ambiguous Director assignment",
);

assert(
  source.package.includes(
    "TEACHER_SUPERVISORY_REVIEW_PACKAGE_PRIOR_FORWARD_INVALID",
  ) &&
    source.package.includes('clean(priorMetadata.decisionAction) !== "FORWARD"') &&
    source.package.includes('normalized(prior.decision) !== "ACCEPTED"'),
  "Director package must validate the durable HOS forward chain",
);

assert(
  source.package.includes("ordered.length !== review.stage") &&
    source.package.includes("candidate.stage !== index + 1"),
  "Review package must require contiguous review stages",
);

assert(
  source.admission.includes(
    "export function computeTeacherSupervisoryReviewEvidenceHash",
  ),
  "Shared review-evidence hash regression",
);

for (const forbidden of [
  "appraisalAssessmentScore.upsert",
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
    !source.decision.includes(forbidden),
    "HOS decision contains forbidden score/legacy/provider marker",
    forbidden,
  );
}

assert(
  !source.decision.includes("generalComment:"),
  "HOS decision must never rewrite General Comment",
);

assert(
  source.decision.includes("returnReasonTextRecordedInAudit: false") &&
    source.decision.includes("scoreValuesRecordedInAudit: false") &&
    source.decision.includes("generalCommentRecordedInAudit: false"),
  "Decision audit must exclude reason text and assessment evidence values",
);

console.log("");
console.log("=== N6-E3A GOVERNANCE TEACHER HOS RETURN / FORWARD ===");
console.log("");
console.log("Reviewer                         : Head of Supervision only");
console.log("Input lifecycle                  : UNDER_REVIEW + current HOS PENDING review");
console.log("Immutable package                : re-read before mutation");
console.log("Finalized evidence               : reverified before mutation");
console.log("HOS actions                      : Return / Forward");
console.log("Return durable review decision   : RETURNED");
console.log("Return assessment state          : RETURNED");
console.log("Return reason                    : required; text excluded from audit");
console.log("Return continuation              : original assessor revision required");
console.log("Returning reviewer               : preserved for correction continuation");
console.log("Forward durable review decision  : ACCEPTED");
console.log("Forward assessment state         : FINALIZED unchanged");
console.log("Forward next stage               : exactly one Director PENDING review");
console.log("Director assignment              : exactly one active district assignment");
console.log("Director package chain           : prior HOS ACCEPTED/FORWARD required");
console.log("Cycle status                     : remains UNDER_REVIEW");
console.log("Assessment scores/comment        : never rewritten");
console.log("Review evidence hash             : shared deterministic admission hash");
console.log("Decision hashes                  : contract + request + evidence");
console.log("Weak-network retry               : EXISTING_RETURNED / EXISTING_FORWARDED");
console.log("Race recovery                    : P2002 / P2034 / optimistic-write retry");
console.log("Legacy TeacherAppraisal          : untouched");
console.log("Notifications/providers          : absent");
console.log("Prisma migration                 : not required");
console.log("Database accessed                : source contract only");
console.log("");
console.log("RESULT: N6-E3A GOVERNANCE TEACHER HOS RETURN / FORWARD GREEN");
