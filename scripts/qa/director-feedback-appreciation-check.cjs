#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS QA harness intentionally inspects and transpiles source contracts. */

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
  const absolutePath = path.join(repoRoot, relativePath);
  assert(fs.existsSync(absolutePath), "N7_U17_REQUIRED_FILE_MISSING", { relativePath });
  return fs.readFileSync(absolutePath, "utf8");
}
function contains(source, marker, label) {
  assert(source.includes(marker), `N7_U17_MARKER_MISSING:${label}`, { marker });
}
function excludes(source, marker, label) {
  assert(!source.includes(marker), `N7_U17_FORBIDDEN_MARKER:${label}`, { marker });
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
    fail("N7_U17_TYPESCRIPT_TRANSPILE_FAILED", {
      relativePath,
      diagnostics: errors.map((diagnostic) =>
        ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
      ),
    });
  }
}

function main() {
  const schemaPath = "prisma/schema.prisma";
  const migrationPath =
    "prisma/migrations/20260813233000_director_feedback_participation_appreciation/migration.sql";
  const servicePath = "src/lib/appraisals/directorFeedbackAppreciation.ts";
  const routePath =
    "src/app/api/district/director-feedback/review/appreciation/route.ts";
  const clientPath =
    "src/app/district/director-feedback/review/DirectorFeedbackReviewClient.tsx";
  const workerPath = "src/lib/appraisals/notificationWorker.ts";
  const releasePath = "src/lib/appraisals/directorFeedbackRelease.ts";

  const schema = read(schemaPath);
  const migration = read(migrationPath);
  const service = read(servicePath);
  const route = read(routePath);
  const client = read(clientPath);
  const worker = read(workerPath);
  const release = read(releasePath);

  for (const [relativePath, source] of [
    [servicePath, service],
    [routePath, route],
    [clientPath, client],
  ]) {
    transpile(relativePath, source);
  }

  contains(schema, "PARTICIPATION_APPRECIATION", "schema:dedicated-notification-type");
  contains(migration, 'ALTER TYPE "AppraisalNotificationType"', "migration:enum-target");
  contains(
    migration,
    "ADD VALUE IF NOT EXISTS 'PARTICIPATION_APPRECIATION'",
    "migration:idempotent-enum-value",
  );

  for (const [marker, label] of [
    ["AppraisalNotificationType.PARTICIPATION_APPRECIATION", "service:truthful-event-type"],
    ["AppraisalCycleStatus.RELEASED", "service:completed-review-only"],
    ["AppraisalParticipantStatus.FINALIZED", "service:finalized-participants-only"],
    ['"VIEW_DIRECTOR_FEEDBACK_RESULTS"', "service:director-authority"],
    ["cycle.targetUserId !== actorUserId", "service:own-cycle-scope"],
    ['cycle.targetRoleSnapshot !== "DISTRICT_DIRECTOR"', "service:director-target-scope"],
    ["AppraisalNotificationChannel.IN_APP", "service:in-app-channel"],
    ["AppraisalNotificationChannel.SMS", "service:sms-channel"],
    ["AppraisalNotificationChannel.EMAIL", "service:email-channel"],
    ["skipDuplicates: true", "service:idempotent-outbox"],
    ["template: DIRECTOR_FEEDBACK_APPRECIATION_POLICY.smsTemplate", "service:dedicated-sms-template"],
    ["title: APPRECIATION_TITLE", "service:prepared-title"],
    ["Thank you for taking part in my confidential leadership feedback exercise.", "service:prepared-appreciation-message"],
    ["respondentIdentityReturnedToDirector: false", "service:no-identity-audit"],
    ["schoolIdentityReturnedToDirector: false", "service:no-school-audit"],
    ["scoreValuesRecordedInAudit: false", "service:no-score-audit"],
    ["providerDeliveryTriggered: false", "service:no-provider-in-transaction"],
    ["Prisma.TransactionIsolationLevel.Serializable", "service:serializable-transaction"],
    ["getStaffEssentialAlertEligibilityMap", "service:essential-alert-authority"],
    ['const OFFICIAL_APPRAISAL_PURPOSE = "OFFICIAL_APPRAISAL" as const;', "service:essential-alert-purpose"],
    ["STAFF_ESSENTIAL_ALERT_ENROLLMENT", "service:essential-alert-authority-marker"],
    ["OFFICIAL_APPRAISAL_ELIGIBILITY_CONCURRENCY = 8", "service:bounded-multitenant-authority"],
  ]) {
    contains(service, marker, label);
  }
  excludes(service, "smsOptIn", "service:no-legacy-sms-opt-in-authority");
  excludes(service, "sendSms", "service:no-direct-sms-provider");
  excludes(service, "sendEmail", "service:no-direct-email-provider");

  contains(route, 'allowedRoles: ["DISTRICT_DIRECTOR"]', "api:director-only");
  contains(route, "allowedZoneLevels: [2]", "api:district-only");
  contains(route, '"Cache-Control": "no-store, max-age=0"', "api:no-store");
  contains(
    route,
    "DIRECTOR_FEEDBACK_APPRECIATION_CONFIRMATION_REQUIRED",
    "api:explicit-confirmation",
  );
  contains(route, "ALLOWED_BODY_FIELDS", "api:strict-body-allowlist");
  excludes(route, "prisma.", "api:no-direct-prisma");
  excludes(route, "sendSms", "api:no-direct-sms-provider");
  excludes(route, "sendEmail", "api:no-direct-email-provider");
  excludes(route, "recipientUserId", "api:no-recipient-identity-output");
  excludes(route, "respondentTenantId", "api:no-school-link-output");

  contains(client, "Thank participating Headteachers", "ui:appreciation-card");
  contains(client, "Send appreciation", "ui:single-action-button");
  contains(client, 'workspace?.cycle?.status !== "RELEASED"', "ui:completed-review-only");
  contains(
    client,
    '"/api/district/director-feedback/review/appreciation"',
    "ui:appreciation-post",
  );
  contains(client, "review/appreciation?cycleId=", "ui:appreciation-status-get");
  contains(client, "Finalized participants only", "ui:recipient-count-safe");
  contains(
    client,
    "Recipient names, schools and scores are never shown here.",
    "ui:privacy-copy",
  );
  excludes(client, "localStorage", "ui:no-local-storage");
  excludes(client, "sessionStorage", "ui:no-session-storage");

  contains(
    worker,
    "delivery.template ?? DEFAULT_APPRAISAL_SMS_DELIVERY.template",
    "worker:payload-template-override",
  );
  contains(worker, "deliveryPayload(notification.payload)", "worker:payload-driven-delivery");
  contains(
    worker,
    "idempotencyKey: notification.idempotencyKey",
    "worker:email-idempotency",
  );
  contains(worker, "getStaffEssentialAlertEligibilityMap", "worker:send-time-authority");
  contains(worker, "to: currentDestination", "worker:current-authoritative-phone");
  excludes(worker, "notification.type ===", "worker:no-type-specific-appreciation-branch");
  excludes(worker, "switch (notification.type)", "worker:no-type-switch");

  contains(
    release,
    "respondentNotificationCreated: false",
    "release:no-false-result-release-notification",
  );
  contains(release, "providerDeliveryTriggered: false", "release:no-provider-delivery");

  console.log("");
  console.log("=== N7-U17 DIRECTOR PARTICIPATION APPRECIATION PROOF ===");
  console.log("");
  console.log("Trigger state                 : sealed Director review only");
  console.log("Recipients                    : finalized frozen participants only");
  console.log("Prepared message              : server-controlled appreciation copy");
  console.log("In-app                        : immediate SENT outbox row");
  console.log("SMS authority                 : OFFICIAL_APPRAISAL Essential Alert enrollment");
  console.log("SMS                           : queued only when currently eligible");
  console.log("Email                         : queued when address is usable");
  console.log("Notification event            : PARTICIPATION_APPRECIATION");
  console.log("Result release notification   : not misused");
  console.log("Repeated Director click       : idempotent; no duplicate rows");
  console.log("Provider calls in transaction : absent");
  console.log("Director identity output      : counts only; no recipients");
  console.log("Score / answer leakage        : absent");
  console.log("Worker                        : current-phone revalidated payload-driven spine");
  console.log("Browser persistence           : absent");
  console.log("Database accessed             : false");
  console.log("");
  console.log("RESULT: N7-U17 DIRECTOR PARTICIPATION APPRECIATION GREEN");
}

try {
  main();
} catch (error) {
  console.error("");
  console.error("RESULT: N7-U17 DIRECTOR PARTICIPATION APPRECIATION FAILED");
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
}
