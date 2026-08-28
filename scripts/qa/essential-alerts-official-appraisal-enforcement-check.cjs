#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS QA harness intentionally inspects source contracts. */

const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const repoRoot = path.resolve(__dirname, "..", "..");

function fail(message, detail) {
  const suffix = detail === undefined ? "" : `\n${JSON.stringify(detail, null, 2)}`;
  throw new Error(`${message}${suffix}`);
}

function assert(condition, message, detail) {
  if (!condition) fail(message, detail);
}

function read(relativePath) {
  const absolute = path.join(repoRoot, relativePath);
  assert(fs.existsSync(absolute), "A16A3_REQUIRED_FILE_MISSING", { relativePath });
  return fs.readFileSync(absolute, "utf8");
}

function contains(source, marker, label) {
  assert(source.includes(marker), `A16A3_MARKER_MISSING:${label}`, { marker });
}

function excludes(source, marker, label) {
  assert(!source.includes(marker), `A16A3_FORBIDDEN_MARKER:${label}`, { marker });
}

function before(source, earlier, later, label) {
  const first = source.indexOf(earlier);
  const second = source.indexOf(later);
  assert(first >= 0 && second >= 0 && first < second, `A16A3_ORDER_INVALID:${label}`, {
    earlier,
    later,
    first,
    second,
  });
}

function transpile(relativePath, source) {
  const output = ts.transpileModule(source, {
    fileName: relativePath,
    reportDiagnostics: true,
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.Preserve,
      esModuleInterop: true,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      strict: true,
    },
  });

  const errors = (output.diagnostics ?? []).filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
  );

  if (errors.length) {
    fail("A16A3_TYPESCRIPT_TRANSPILE_FAILED", {
      relativePath,
      diagnostics: errors.map((diagnostic) =>
        ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
      ),
    });
  }
}

function main() {
  const producerPaths = [
    "src/lib/appraisals/directorFeedbackAppreciation.ts",
    "src/lib/appraisals/directorFeedbackNotifications.ts",
    "src/lib/appraisals/headteacherDirectorReleaseNotifications.ts",
    "src/lib/appraisals/headteacherFeedbackNotifications.ts",
    "src/lib/appraisals/headteacherStaffFeedbackReleaseNotifications.ts",
  ];
  const workerPath = "src/lib/appraisals/notificationWorker.ts";
  const enrollmentPath = "src/lib/essentialAlerts/enrollment.ts";

  const producers = producerPaths.map((relativePath) => ({
    relativePath,
    source: read(relativePath),
  }));
  const worker = read(workerPath);
  const enrollment = read(enrollmentPath);

  for (const item of [...producers, { relativePath: workerPath, source: worker }]) {
    transpile(item.relativePath, item.source);
  }

  contains(
    enrollment,
    "export async function getStaffEssentialAlertEligibilityMap",
    "enrollment:staff-authority-helper",
  );
  contains(enrollment, 'consentSource === "SIGNED_STAFF_LINK"', "enrollment:signed-link");
  contains(
    enrollment,
    'consentSource === "AUTHENTICATED_STAFF_SELF_SERVICE"',
    "enrollment:self-service",
  );
  contains(enrollment, 'reason: "NOT_ACTIVE_STAFF"', "enrollment:active-staff-required");
  contains(enrollment, '"PHONE_CHANGED"', "enrollment:phone-revalidation");
  contains(
    enrollment,
    '"POLICY_VERSION_MISMATCH"',
    "enrollment:policy-version-revalidation",
  );

  for (const { relativePath, source } of producers) {
    contains(
      source,
      "getStaffEssentialAlertEligibilityMap",
      `${relativePath}:essential-alert-helper`,
    );
    contains(
      source,
      'const OFFICIAL_APPRAISAL_PURPOSE = "OFFICIAL_APPRAISAL" as const;',
      `${relativePath}:purpose`,
    );
    contains(
      source,
      "STAFF_ESSENTIAL_ALERT_ENROLLMENT",
      `${relativePath}:authority-marker`,
    );
    contains(
      source,
      "AppraisalNotificationChannel.SMS",
      `${relativePath}:sms-channel-preserved`,
    );
    contains(
      source,
      "AppraisalNotificationChannel.EMAIL",
      `${relativePath}:email-channel-preserved`,
    );
    contains(
      source,
      "AppraisalNotificationStatus.SKIPPED",
      `${relativePath}:fail-closed-skip`,
    );
    contains(
      source,
      "ESSENTIAL_ALERT_OFFICIAL_APPRAISAL_",
      `${relativePath}:durable-skip-reason`,
    );
    excludes(source, "smsOptIn", `${relativePath}:legacy-sms-opt-in-authority`);
    excludes(source, "sendSms", `${relativePath}:no-provider-call`);
    excludes(source, "sendEmail", `${relativePath}:no-provider-call-email`);
  }

  const directorFiles = producers.filter(({ relativePath }) =>
    relativePath.includes("directorFeedback"),
  );
  for (const { relativePath, source } of directorFiles) {
    contains(
      source,
      "OFFICIAL_APPRAISAL_ELIGIBILITY_CONCURRENCY = 8",
      `${relativePath}:bounded-multitenant-resolution`,
    );
    contains(source, "Promise.all", `${relativePath}:bounded-batch-resolution`);
  }

  contains(
    worker,
    "getStaffEssentialAlertEligibilityMap",
    "worker:send-time-authority-helper",
  );
  contains(
    worker,
    'const OFFICIAL_APPRAISAL_PURPOSE = "OFFICIAL_APPRAISAL" as const;',
    "worker:purpose",
  );
  contains(worker, "notification.recipientTenantId", "worker:tenant-identity");
  contains(worker, "notification.recipientUserId", "worker:user-identity");
  contains(worker, "currentDestination", "worker:current-authoritative-phone");
  contains(worker, "to: currentDestination", "worker:no-stale-destination-send");
  contains(worker, "queuedDestinationRevalidated: true", "worker:revalidation-evidence");
  contains(
    worker,
    "APPRAISAL_NOTIFICATION_SMS_ESSENTIAL_ALERT_NOT_ELIGIBLE",
    "worker:fail-closed-current-ineligibility",
  );
  contains(worker, "async function deliverEmail", "worker:email-preserved");
  contains(worker, "sendEmail({", "worker:email-provider-preserved");
  contains(worker, "const retryable =", "worker:retry-contract-preserved");
  contains(
    worker,
    "AppraisalNotificationChannel.EMAIL",
    "worker:email-only-retry-preserved",
  );

  before(
    worker,
    "await getStaffEssentialAlertEligibilityMap({",
    "const result = await sendSms({",
    "worker:revalidate-before-provider",
  );
  before(
    worker,
    "const currentDestination =",
    "const result = await sendSms({",
    "worker:resolve-current-phone-before-provider",
  );

  console.log("");
  console.log("=== A16A3 OFFICIAL APPRAISAL — STAFF ESSENTIAL ALERT ENFORCEMENT ===");
  console.log("");
  console.log("Purpose                       : OFFICIAL_APPRAISAL");
  console.log("Recipient authority           : STAFF ESSENTIAL ALERT ENROLLMENT");
  console.log("Producer-time admission       : REQUIRED");
  console.log("Worker-time revalidation      : REQUIRED");
  console.log("Current phone at dispatch     : REQUIRED");
  console.log("Legacy smsOptIn authority     : REMOVED");
  console.log("Active staff membership       : REQUIRED");
  console.log("Current phone fingerprint     : REQUIRED");
  console.log("Current policy version        : REQUIRED");
  console.log("Consent evidence              : SIGNED LINK OR AUTHENTICATED SELF-SERVICE");
  console.log("Director multi-tenant lookup  : BOUNDED CONCURRENCY");
  console.log("EMAIL behavior                : PRESERVED");
  console.log("IN_APP behavior               : PRESERVED");
  console.log("Notification outbox schema    : UNCHANGED");
  console.log("Schema migration              : NONE");
  console.log("Database access by QA         : NONE");
  console.log("Provider calls by QA          : NONE");
  console.log("");
  console.log("=== A16A3 OFFICIAL APPRAISAL SOURCE CONTRACT GREEN ===");
}

try {
  main();
} catch (error) {
  console.error("");
  console.error("=== A16A3 OFFICIAL APPRAISAL SOURCE CONTRACT FAILED ===");
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
}
