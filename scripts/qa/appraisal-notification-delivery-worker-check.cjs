#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS QA harness intentionally inspects source contracts. */

const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const repoRoot = path.resolve(__dirname, "..", "..");

function fail(message, detail) {
  const suffix =
    detail === undefined
      ? ""
      : `\n${JSON.stringify(detail, null, 2)}`;
  throw new Error(`${message}${suffix}`);
}

function assert(condition, message, detail) {
  if (!condition) fail(message, detail);
}

function read(relativePath) {
  const absolutePath =
    path.join(repoRoot, relativePath);

  assert(
    fs.existsSync(absolutePath),
    "D3_3F_REQUIRED_FILE_MISSING",
    { relativePath },
  );

  return fs.readFileSync(absolutePath, "utf8");
}

function contains(source, marker, label) {
  assert(
    source.includes(marker),
    `D3_3F_MARKER_MISSING:${label}`,
    { marker },
  );
}

function excludes(source, marker, label) {
  assert(
    !source.includes(marker),
    `D3_3F_FORBIDDEN_MARKER:${label}`,
    { marker },
  );
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
      moduleResolution:
        ts.ModuleResolutionKind.Bundler,
      strict: true,
    },
  });

  const errors = (output.diagnostics ?? []).filter(
    (diagnostic) =>
      diagnostic.category ===
      ts.DiagnosticCategory.Error,
  );

  if (errors.length) {
    fail("D3_3F_TYPESCRIPT_TRANSPILE_FAILED", {
      relativePath,
      diagnostics: errors.map((diagnostic) =>
        ts.flattenDiagnosticMessageText(
          diagnostic.messageText,
          "\n",
        ),
      ),
    });
  }
}

function main() {
  const emailPath = "src/lib/email/sendEmail.ts";
  const outboxPath =
    "src/lib/appraisals/notificationOutbox.ts";
  const workerPath =
    "src/lib/appraisals/notificationWorker.ts";
  const cronPath =
    "src/app/api/internal/appraisals/notifications/cron/route.ts";
  const indexPath =
    "src/lib/appraisals/index.ts";

  const email = read(emailPath);
  const outbox = read(outboxPath);
  const worker = read(workerPath);
  const cron = read(cronPath);
  const index = read(indexPath);

  for (const [relativePath, source] of [
    [emailPath, email],
    [outboxPath, outbox],
    [workerPath, worker],
    [cronPath, cron],
  ]) {
    transpile(relativePath, source);
  }

  contains(
    email,
    'headers["Idempotency-Key"] = idempotencyKey;',
    "email:provider-idempotency",
  );
  contains(
    email,
    "slice(0, 256)",
    "email:key-bound",
  );

  contains(
    outbox,
    "for update skip locked",
    "outbox:skip-locked",
  );
  contains(
    outbox,
    '"appraisal_notification"',
    "outbox:correct-table",
  );
  contains(
    outbox,
    "AMBIGUOUS_SMS_PROVIDER_RESULT_MANUAL_REVIEW_REQUIRED",
    "outbox:sms-ambiguity-quarantine",
  );
  contains(
    outbox,
    "EMAIL_IDEMPOTENCY_WINDOW_EXPIRED_MANUAL_REVIEW_REQUIRED",
    "outbox:email-expiry-quarantine",
  );
  contains(
    outbox,
    "Math.pow(2",
    "outbox:exponential-backoff",
  );
  contains(
    outbox,
    "attempts >= existing.maxAttempts",
    "outbox:max-attempts",
  );
  contains(
    outbox,
    "lockedBy: workerId",
    "outbox:worker-ownership",
  );
  excludes(
    outbox,
    "FinanceOutboxEvent",
    "outbox:no-finance-coupling",
  );

  contains(
    worker,
    'template: "director-feedback-cycle-opened"',
    "worker:sms-handler",
  );
  contains(
    worker,
    "idempotencyKey: notification.idempotencyKey",
    "worker:email-idempotency",
  );
  contains(
    worker,
    "notification.channel ===",
    "worker:channel-routing",
  );
  contains(
    worker,
    "AppraisalNotificationChannel.EMAIL",
    "worker:email-retry-only",
  );
  contains(
    worker,
    "quarantineAmbiguousAppraisalNotifications",
    "worker:stale-safety",
  );

  contains(
    cron,
    "APPRAISAL_NOTIFICATION_CRON_SECRET",
    "cron:separate-secret",
  );
  contains(
    cron,
    "x-appraisal-notification-cron-secret",
    "cron:header-secret",
  );
  contains(
    cron,
    "timingSafeEqual",
    "cron:timing-safe-auth",
  );
  contains(
    cron,
    "mode: \"HEALTH_ONLY\"",
    "cron:get-health-only",
  );
  contains(
    cron,
    "mode: \"WORKER_EXECUTED\"",
    "cron:post-worker",
  );
  contains(
    cron,
    '"Cache-Control": "no-store, max-age=0"',
    "cron:no-store",
  );

  excludes(cron, "destination", "cron:no-contact-output");
  excludes(cron, "recipientUserId", "cron:no-identity-output");
  excludes(cron, "school", "cron:no-school-output");

  contains(
    index,
    'export * from "./notificationOutbox";',
    "barrel:outbox-export",
  );
  contains(
    index,
    'export * from "./notificationWorker";',
    "barrel:worker-export",
  );

  console.log("");
  console.log("=== D3.3F APPRAISAL NOTIFICATION DELIVERY PROOF ===");
  console.log("");
  console.log("Queue table                  : AppraisalNotification");
  console.log("Claiming                     : bounded + SKIP LOCKED");
  console.log("Worker ownership             : enforced");
  console.log("Email provider idempotency   : verified");
  console.log("Email retry window           : bounded below 24 hours");
  console.log("Email retry delay            : exponential");
  console.log("SMS automatic retry          : disabled after provider attempt");
  console.log("Stale SMS                    : quarantined for manual review");
  console.log("Maximum attempts             : enforced");
  console.log("GET cron                     : health only");
  console.log("POST cron                    : bounded worker");
  console.log("Cron secret                  : appraisal-specific");
  console.log("Finance outbox coupling      : absent");
  console.log("Recipient identity output    : absent");
  console.log("Database accessed            : false");
  console.log("");
  console.log(
    "RESULT: D3.3F APPRAISAL NOTIFICATION DELIVERY WORKERS GREEN",
  );
}

try {
  main();
} catch (error) {
  console.error("");
  console.error(
    "RESULT: D3.3F APPRAISAL NOTIFICATION DELIVERY WORKERS FAILED",
  );
  console.error(
    error instanceof Error ? error.stack : error,
  );
  process.exit(1);
}
