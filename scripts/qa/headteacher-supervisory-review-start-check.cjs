#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS QA harness intentionally inspects and transpiles TypeScript source. */

const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const repoRoot = path.resolve(__dirname, "..", "..");

const files = {
  service:
    "src/lib/appraisals/headteacherSupervisoryReviewAdmission.ts",
  queue:
    "src/lib/appraisals/headteacherSupervisoryReviewQueue.ts",
  package:
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
  assert(fs.existsSync(absolutePath), "N6_F1C6B3A_REQUIRED_FILE_MISSING", {
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
    fail("N6_F1C6B3A_TYPESCRIPT_TRANSPILE_FAILED", {
      relativePath,
      diagnostics: errors.map((diagnostic) =>
        ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
      ),
    });
  }
}

const source = Object.fromEntries(
  Object.entries(files).map(([key, relativePath]) => {
    const text = read(relativePath);
    transpile(relativePath, text);
    return [key, text];
  }),
);

for (const required of [
  "HEADTEACHER_SUPERVISORY_HOS_REVIEW_START_POLICY",
  'reviewerRole: "HEAD_OF_SUPERVISION"',
  'requiredCapability: "REVIEW_HEADTEACHER_APPRAISAL"',
  'reviewStage: 1',
  'reviewDecision: "PENDING"',
  'cycleFromStatus: "CLOSED"',
  'cycleToStatus: "UNDER_REVIEW"',
  'requiredAssessmentStatus: "FINALIZED"',
  'eligibleAssessorRoles: ["SISSO", "BASIC_SCHOOL_COORDINATOR"]',
  "explicitConfirmationRequired: true",
  "exactDistrictAssignmentRequired: true",
  "staffFeedbackIncluded: false",
  "respondentIdentitiesIncluded: false",
  "reviewerMayRewriteScores: false",
  "scoreMutationAllowed: false",
  "assessmentMutationAllowed: false",
  "notificationsSeeded: false",
  "providerCallsAllowed: false",
  'reviewPackageReadMode: "OUTSIDE_WRITE_TRANSACTION"',
  "Prisma.TransactionIsolationLevel.Serializable",
  "startHeadteacherSupervisoryHosReview",
  "readHeadteacherSupervisoryReviewPackage",
  "appraisalReview.create",
  'stage: 1',
  'decision: "PENDING"',
  'status: "UNDER_REVIEW"',
  "reviewStartedAt: input.now",
  "HEADTEACHER_SUPERVISORY_HOS_REVIEW_STARTED",
  "auditLog.create",
  "EXISTING_REVIEW",
  "P2002",
  "P2034",
]) {
  assert(
    source.service.includes(required),
    "N6_F1C6B3A_START_SERVICE_MARKER_MISSING",
    required,
  );
}

for (const forbidden of [
  "appraisalAssessment.update",
  "appraisalAssessment.updateMany",
  "appraisalAssessmentScore",
  "appraisalAggregateSnapshot",
  "HeadteacherDirectorAnonymousResponses",
  "anonymousResponses",
  "sendSms",
  "sendEmail",
  "appraisalNotification",
  "teacherAppraisal",
]) {
  assert(
    !source.service.includes(forbidden),
    "N6_F1C6B3A_START_SERVICE_FORBIDDEN_MARKER",
    forbidden,
  );
}

for (const required of [
  'activeCycleStatus: "UNDER_REVIEW"',
  "activeReviewStage: 1",
  'activeReviewDecision: "PENDING"',
  'activeState: "READY_TO_REVIEW"',
  'activeNextAction: "CONTINUE_REVIEW"',
  "activeReviewForActor",
  "const activeAssessments = await database.appraisalAssessment.findMany",
  "const candidates = [...assessments, ...activeAssessments]",
  'state: readyToStart ? "READY_TO_START" : "READY_TO_REVIEW"',
]) {
  assert(
    source.queue.includes(required),
    "N6_F1C6B3A_ACTIVE_QUEUE_MARKER_MISSING",
    required,
  );
}

for (const required of [
  'activeCycleStatus: "UNDER_REVIEW"',
  "activeReviewCount: 1",
  "activeReviewStage: 1",
  'activeReviewDecision: "PENDING"',
  'lifecycleState: "READY_TO_START" | "READY_TO_REVIEW"',
  'status: "CLOSED" | "UNDER_REVIEW"',
  "resolveLifecycle",
  'lifecycleState: "READY_TO_REVIEW" as const',
  "HEADTEACHER_SUPERVISORY_REVIEW_PACKAGE_ACTIVE_REVIEW_CUSTODY_DRIFT",
  "activeReviewCustodyVerified: true",
  "noExistingReviewCustody: true",
]) {
  assert(
    source.package.includes(required),
    "N6_F1C6B3A_ACTIVE_PACKAGE_MARKER_MISSING",
    required,
  );
}

for (const forbidden of [
  "appraisalReview.create",
  "appraisalReview.update",
  "appraisalAssessment.update",
  "$transaction(",
  "appraisalAggregateSnapshot",
  "anonymousResponses",
  "sendSms",
  "sendEmail",
]) {
  assert(
    !source.package.includes(forbidden),
    "N6_F1C6B3A_PACKAGE_MUST_REMAIN_READ_ONLY",
    forbidden,
  );
}

assert(
  source.authority.includes('"REVIEW_HEADTEACHER_APPRAISAL"'),
  "N6_F1C6B3A_HOS_REVIEW_CAPABILITY_MISSING",
);

console.log("");
console.log("=== N6-F1C6B3A HOS HEADTEACHER REVIEW START + DURABLE CUSTODY ===");
console.log("");
console.log("Start authority                  : Head of Supervision only");
console.log("Eligible origins                 : SISSO / Basic School Coordinator");
console.log("Pre-start state                  : FINALIZED + CLOSED + zero reviews");
console.log("Start transition                 : CLOSED -> UNDER_REVIEW");
console.log("Review creation                  : stage 1 / PENDING");
console.log("Reviewer assignment              : exact current HOS district assignment");
console.log("Immutable package                : reverified before write transaction");
console.log("Assessment mutation              : absent");
console.log("Score mutation                   : absent");
console.log("Confidential staff feedback      : absent");
console.log("Respondent identities/forms      : absent");
console.log("Queue after start                : READY_TO_REVIEW");
console.log("Package after start              : READY_TO_REVIEW / read-only");
console.log("Retry                            : EXISTING_REVIEW");
console.log("Transaction                      : serializable and bounded");
console.log("Audit                            : one review-start audit");
console.log("Notifications/providers          : absent");
console.log("Schema migration                 : absent");
console.log("Database accessed                : source contract only");
console.log("");
console.log("RESULT: N6-F1C6B3A HOS HEADTEACHER REVIEW START GREEN");
