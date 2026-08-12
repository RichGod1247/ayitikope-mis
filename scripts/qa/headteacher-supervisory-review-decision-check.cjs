#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS QA harness intentionally inspects and transpiles TypeScript source. */

const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const repoRoot = path.resolve(__dirname, "..", "..");

const files = {
  decision:
    "src/lib/appraisals/headteacherSupervisoryReviewDecision.ts",
  admission:
    "src/lib/appraisals/headteacherSupervisoryReviewAdmission.ts",
  reviewPackage:
    "src/lib/appraisals/headteacherSupervisoryReviewPackage.ts",
  authority:
    "src/lib/appraisals/authority.ts",
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
  assert(fs.existsSync(absolutePath), "N6_F1C6B3B_REQUIRED_FILE_MISSING", {
    relativePath,
  });
  return fs
    .readFileSync(absolutePath, "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
}

function transpile(relativePath, source) {
  const output = ts.transpileModule(source, {
    fileName: relativePath,
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      strict: true,
      esModuleInterop: true,
    },
  });

  const errors = (output.diagnostics ?? []).filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
  );

  if (errors.length) {
    fail("N6_F1C6B3B_TYPESCRIPT_TRANSPILE_FAILED", {
      relativePath,
      diagnostics: errors.map((diagnostic) =>
        ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
      ),
    });
  }
}

function blockBetween(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert(startIndex >= 0 && endIndex > startIndex, "BLOCK_NOT_FOUND", {
    start,
    end,
  });
  return source.slice(startIndex, endIndex);
}

const source = Object.fromEntries(
  Object.entries(files).map(([key, relativePath]) => {
    const text = read(relativePath);
    transpile(relativePath, text);
    return [key, text];
  }),
);

for (const required of [
  "HEADTEACHER_SUPERVISORY_HOS_DECISION_POLICY",
  'reviewerRole: "HEAD_OF_SUPERVISION"',
  'requiredCapability: "REVIEW_HEADTEACHER_APPRAISAL"',
  'allowedActions: ["RETURN", "FORWARD"]',
  'requiredCycleStatus: "UNDER_REVIEW"',
  "requiredReviewStage: 1",
  'requiredCurrentReviewDecision: "PENDING"',
  'returnReviewDecision: "RETURNED"',
  'forwardReviewDecision: "ACCEPTED"',
  'returnAssessmentToStatus: "RETURNED"',
  'forwardAssessmentStatus: "FINALIZED"',
  "minimumReturnReasonLength: 3",
  "maximumReturnReasonLength: 2_000",
  "forwardReasonAllowed: false",
  "forwardCreatesDirectorStage: false",
  "cycleStatusChanges: false",
  "returnedAssessmentRequiresRevision: true",
  "preserveReturningReviewerForCorrection: true",
  "reviewerMayRewriteScores: false",
  "reviewerMayRewriteVisitEvidence: false",
  "scoreMutationAllowed: false",
  "assessmentEvidenceMutationAllowed: false",
  "returnAssessmentStatusTransitionAllowed: true",
  "forwardAssessmentMutationAllowed: false",
  'reviewPackageReadMode: "OUTSIDE_WRITE_TRANSACTION"',
  "Prisma.TransactionIsolationLevel.Serializable",
  "executeHeadteacherSupervisoryHosDecision",
  "readHeadteacherSupervisoryReviewPackage",
  "reviewEvidenceHash",
  "decisionRequestHash",
  "decisionEvidenceHash",
  "appraisalReview.updateMany",
  "appraisalAssessment.updateMany",
  "appraisalCycle.updateMany",
  'decision: input.action === "RETURN" ? "RETURNED" : "ACCEPTED"',
  'status: "RETURNED"',
  "HEADTEACHER_SUPERVISORY_HOS_REVIEW_RETURNED",
  "HEADTEACHER_SUPERVISORY_HOS_REVIEW_FORWARDED",
  "reasonTextRecordedInAudit: false",
  "nextReviewCreated: false",
  "EXISTING_RETURNED",
  "EXISTING_FORWARDED",
  "P2034",
]) {
  assert(
    source.decision.includes(required),
    "N6_F1C6B3B_DECISION_MARKER_MISSING",
    required,
  );
}

for (const forbidden of [
  "appraisalReview.create",
  "appraisalAssessmentScore",
  "appraisalAggregateSnapshot",
  "HeadteacherDirectorAnonymousResponses",
  "anonymousResponses",
  "sendSms",
  "sendEmail",
  "appraisalNotification",
  "teacherAppraisal",
  'nextReviewerRole: "DISTRICT_DIRECTOR"',
  'reviewerRole: "DISTRICT_DIRECTOR"',
]) {
  assert(
    !source.decision.includes(forbidden),
    "N6_F1C6B3B_DECISION_FORBIDDEN_MARKER",
    forbidden,
  );
}

assert(
  source.decision.includes(
    'metadata.nextReviewCreated !== false',
  ) &&
    source.decision.includes(
      'allReviews.some((candidate) => candidate.stage > 1)',
    ),
  "B3B retry must fail closed if a later Director stage already exists",
);

assert(
  source.decision.includes(
    'reviewPackage.lifecycleState !== "READY_TO_REVIEW"',
  ) &&
    source.decision.includes('reviewPackage.review.stage !== 1') &&
    source.decision.includes('reviewPackage.review.decision !== "PENDING"'),
  "Fresh HOS decision must reverify active read-only review package",
);

const returnMutationStart = source.decision.indexOf(
  'if (input.action === "RETURN") {',
);
const returnMutationEnd = source.decision.indexOf(
  'const cycleUpdated = await tx.appraisalCycle.updateMany',
  returnMutationStart,
);
assert(
  returnMutationStart >= 0 && returnMutationEnd > returnMutationStart,
  "Return-only assessment transition block missing",
);
const returnMutation = source.decision.slice(
  returnMutationStart,
  returnMutationEnd,
);
assert(
  returnMutation.includes("tx.appraisalAssessment.updateMany") &&
    returnMutation.includes('status: "FINALIZED"') &&
    returnMutation.includes('status: "RETURNED"'),
  "Return may perform only the controlled FINALIZED -> RETURNED assessment lifecycle transition",
);

const afterReturnMutation = source.decision.slice(returnMutationEnd);
assert(
  !afterReturnMutation.includes("tx.appraisalAssessment.updateMany"),
  "Forward must not rewrite the finalized assessment record",
);

const bscBlock = blockBetween(
  source.authority,
  "BASIC_SCHOOL_COORDINATOR: [",
  "HEAD_OF_SUPERVISION: [",
);
assert(
  bscBlock.includes('"ASSESS_HEADTEACHER"'),
  "BSC must retain Headteacher assessment authority",
);
assert(
  !bscBlock.includes('"REVIEW_HEADTEACHER_APPRAISAL"'),
  "BSC must not retain Headteacher review authority",
);

const hosBlock = blockBetween(
  source.authority,
  "HEAD_OF_SUPERVISION: [",
  "DISTRICT_DIRECTOR: [",
);
assert(
  hosBlock.includes('"ASSESS_HEADTEACHER"') &&
    hosBlock.includes('"REVIEW_HEADTEACHER_APPRAISAL"'),
  "HOS must retain both Headteacher assessor and reviewer capabilities",
);

const directorBlock = blockBetween(
  source.authority,
  "DISTRICT_DIRECTOR: [",
  "} as const satisfies",
);
assert(
  directorBlock.includes('"REVIEW_HEADTEACHER_APPRAISAL"'),
  "District Director Headteacher review capability must remain intact",
);

assert(
  source.admission.includes('reviewType: "HOS_SUPERVISORY_REVIEW"') &&
    source.admission.includes('reviewEvidenceHash: input.reviewEvidenceHash'),
  "B3B must consume the exact B3A HOS custody provenance",
);

assert(
  source.reviewPackage.includes('lifecycleState: "READY_TO_START" | "READY_TO_REVIEW"') &&
    source.reviewPackage.includes('activeReviewDecision: "PENDING"'),
  "B3B must preserve B3A package admission boundary",
);

console.log("");
console.log("=== N6-F1C6B3B HOS HEADTEACHER RETURN / FORWARD DECISION ===");
console.log("");
console.log("Decision authority               : Head of Supervision only");
console.log("Eligible custody                 : Stage 1 / PENDING / exact HOS assignment");
console.log("Immutable package                : reverified before write transaction");
console.log("Return reason                    : required, 3-2000 characters");
console.log("Return transition                : review RETURNED + assessment RETURNED");
console.log("Return revision requirement      : true");
console.log("Forward reason                   : forbidden");
console.log("Forward transition               : review ACCEPTED; assessment stays FINALIZED");
console.log("Director Stage 2 creation        : intentionally absent in B3B");
console.log("Cycle                            : remains UNDER_REVIEW");
console.log("Returning HOS provenance         : preserved for B4 continuation");
console.log("BSC Headteacher review capability: removed");
console.log("Reviewer score rewriting         : forbidden");
console.log("Visit-evidence mutation           : forbidden");
console.log("Confidential staff feedback      : absent");
console.log("Respondent identities/forms      : absent");
console.log("Same-decision retry              : idempotent");
console.log("Transaction                      : serializable and bounded");
console.log("Audit reason text                : excluded");
console.log("Notifications/providers          : absent");
console.log("Schema migration                 : absent");
console.log("Database accessed                : source contract only");
console.log("");
console.log("RESULT: N6-F1C6B3B HOS HEADTEACHER RETURN / FORWARD GREEN");
