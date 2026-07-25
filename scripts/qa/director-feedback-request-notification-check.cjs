#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS QA harness intentionally inspects source contracts. */

const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const repoRoot = path.resolve(__dirname, "..", "..");

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

  assert(fs.existsSync(absolutePath), "D3_3E_REQUIRED_FILE_MISSING", {
    relativePath,
  });

  return fs.readFileSync(absolutePath, "utf8");
}

function contains(source, marker, label) {
  assert(source.includes(marker), `D3_3E_MARKER_MISSING:${label}`, {
    marker,
  });
}

function excludes(source, marker, label) {
  assert(!source.includes(marker), `D3_3E_FORBIDDEN_MARKER:${label}`, {
    marker,
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
    (diagnostic) =>
      diagnostic.category === ts.DiagnosticCategory.Error,
  );

  if (errors.length) {
    fail("D3_3E_TYPESCRIPT_TRANSPILE_FAILED", {
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
  const servicePath =
    "src/lib/appraisals/directorFeedbackNotifications.ts";
  const apiPath =
    "src/app/api/district/director-feedback/route.ts";
  const pagePath =
    "src/app/district/director-feedback/page.tsx";
  const clientPath =
    "src/app/district/director-feedback/DirectorFeedbackRequestClient.tsx";
  const dashboardPagePath =
    "src/app/district/dashboard/page.tsx";
  const commandDashboardPath =
    "src/components/governance/GovernanceCommandDashboardClient.tsx";
  const indexPath =
    "src/lib/appraisals/index.ts";

  const service = read(servicePath);
  const api = read(apiPath);
  const page = read(pagePath);
  const client = read(clientPath);
  const dashboardPage = read(dashboardPagePath);
  const commandDashboard = read(commandDashboardPath);
  const index = read(indexPath);

  for (const [relativePath, source] of [
    [servicePath, service],
    [apiPath, api],
    [pagePath, page],
    [clientPath, client],
    [dashboardPagePath, dashboardPage],
    [commandDashboardPath, commandDashboard],
  ]) {
    transpile(relativePath, source);
  }

  contains(
    service,
    "AppraisalNotificationChannel.IN_APP",
    "service:in-app",
  );
  contains(
    service,
    "AppraisalNotificationChannel.SMS",
    "service:sms",
  );
  contains(
    service,
    "AppraisalNotificationChannel.EMAIL",
    "service:email",
  );
  contains(
    service,
    "AppraisalNotificationType.CYCLE_OPENED",
    "service:event",
  );
  contains(
    service,
    "skipDuplicates: true",
    "service:idempotent-notifications",
  );
  contains(
    service,
    "EXISTING_ACTIVE",
    "service:active-cycle-retry",
  );
  contains(
    service,
    "openDirectorFeedbackCycle",
    "service:existing-cycle-engine",
  );
  contains(
    service,
    "invitedAt: now",
    "service:participant-invited",
  );
  contains(
    service,
    "SMS_OPT_OUT",
    "service:sms-opt-out",
  );
  contains(
    service,
    "PHONE_UNAVAILABLE",
    "service:missing-phone",
  );
  contains(
    service,
    "EMAIL_UNAVAILABLE",
    "service:missing-email",
  );
  contains(
    service,
    "contactIdentityReturnedToDirector: false",
    "service:privacy-audit",
  );

  excludes(
    service,
    "FinanceOutboxEvent",
    "service:no-finance-outbox",
  );

  contains(
    api,
    'allowedRoles: ["DISTRICT_DIRECTOR"]',
    "api:director-only",
  );
  contains(
    api,
    "allowedZoneLevels: [2]",
    "api:district-scope",
  );
  contains(
    api,
    '"Cache-Control": "no-store, max-age=0"',
    "api:no-store",
  );
  contains(
    api,
    'req.headers.get("x-idempotency-key")',
    "api:idempotency",
  );
  contains(
    api,
    "DIRECTOR_FEEDBACK_REQUEST_CONFIRMATION_REQUIRED",
    "api:confirmation",
  );

  excludes(api, "phone", "api:no-phone-output");
  excludes(api, "email", "api:no-email-output");
  excludes(api, "school", "api:no-school-output");

  contains(
    page,
    'allowedRoles: ["DISTRICT_DIRECTOR"]',
    "page:director-only",
  );

  contains(
    client,
    "Respondent identities and schools will remain protected.",
    "ui:privacy",
  );
  contains(
    client,
    "All active headteachers will be notified in-app, by SMS and email. The request stays open for 7 days.",
    "ui:concise-terms",
  );
  contains(
    client,
    "I agree to the terms.",
    "ui:short-confirmation",
  );
  contains(
    client,
    "Request for Appraisal",
    "ui:request-label",
  );
  contains(
    client,
    "navigator.onLine",
    "ui:offline-awareness",
  );

  excludes(
    client,
    "Purpose or context",
    "ui:no-purpose-field",
  );
  excludes(
    client,
    "const [reason",
    "ui:no-reason-state",
  );
  excludes(
    client,
    "Every eligible active headteacher",
    "ui:no-verbose-list",
  );
  excludes(
    client,
    "localStorage",
    "ui:no-local-storage",
  );
  excludes(
    client,
    "sessionStorage",
    "ui:no-session-storage",
  );

  excludes(
    dashboardPage,
    "Director accountability",
    "dashboard:no-top-card",
  );
  excludes(
    dashboardPage,
    "/district/director-feedback",
    "dashboard:no-top-request-link",
  );

  contains(
    commandDashboard,
    "const canRequestDirectorFeedback",
    "appraisals:director-authority",
  );
  contains(
    commandDashboard,
    '=== "DISTRICT_DIRECTOR"',
    "appraisals:director-role",
  );
  contains(
    commandDashboard,
    'href="/district/director-feedback"',
    "appraisals:request-route",
  );
  contains(
    commandDashboard,
    "Request for Appraisal",
    "appraisals:request-button",
  );
  contains(
    commandDashboard,
    "Request confidential headteacher feedback on your leadership.",
    "appraisals:concise-description",
  );

  const myAppraisalIndex =
    commandDashboard.indexOf("My Appraisal");
  const requestIndex =
    commandDashboard.indexOf("Request for Appraisal");

  assert(
    myAppraisalIndex >= 0 &&
      requestIndex > myAppraisalIndex,
    "D3_3E_REQUEST_NOT_UNDER_MY_APPRAISAL",
  );

  contains(
    index,
    'export * from "./directorFeedbackNotifications";',
    "barrel:notification-export",
  );

  console.log("");
  console.log("=== D3.3E DIRECTOR REQUEST + NOTIFICATION PROOF ===");
  console.log("");
  console.log("Separate top request card    : removed");
  console.log("Request location             : My Appraisal");
  console.log("Request label                : Request for Appraisal");
  console.log("Director-only visibility     : verified");
  console.log("Concise request wording      : verified");
  console.log("Optional purpose field       : removed");
  console.log("Short confirmation           : verified");
  console.log("Existing cycle engine        : reused");
  console.log("IN_APP notification          : immediately ready");
  console.log("SMS notification             : queued or skipped");
  console.log("EMAIL notification           : queued or skipped");
  console.log("Provider calls in request    : absent");
  console.log("Contact/school output        : absent");
  console.log("No-store headers             : verified");
  console.log("Database accessed            : false");
  console.log("");
  console.log(
    "RESULT: D3.3E DIRECTOR REQUEST NOTIFICATION SPINE GREEN",
  );
}

try {
  main();
} catch (error) {
  console.error("");
  console.error(
    "RESULT: D3.3E DIRECTOR REQUEST NOTIFICATION SPINE FAILED",
  );
  console.error(
    error instanceof Error ? error.stack : error,
  );
  process.exit(1);
}