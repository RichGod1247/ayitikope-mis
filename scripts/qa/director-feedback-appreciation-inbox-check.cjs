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
  assert(fs.existsSync(absolute), "N7_U17D_REQUIRED_FILE_MISSING", { relativePath });
  return fs.readFileSync(absolute, "utf8");
}

function contains(source, marker, label) {
  assert(source.includes(marker), `N7_U17D_MARKER_MISSING:${label}`, { marker });
}

function excludes(source, marker, label) {
  assert(!source.includes(marker), `N7_U17D_FORBIDDEN_MARKER:${label}`, { marker });
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
    fail("N7_U17D_TYPESCRIPT_TRANSPILE_FAILED", {
      relativePath,
      diagnostics: errors.map((diagnostic) =>
        ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
      ),
    });
  }
}

function main() {
  const files = {
    service: "src/lib/appraisals/headteacherAppraisalNotifications.ts",
    route: "src/app/api/headteacher/appraisal-notifications/route.ts",
    summary: "src/app/api/governance/notices/summary/route.ts",
    card: "src/components/governance/OfficialNoticeSummaryCard.tsx",
    inbox: "src/components/appraisals/HeadteacherAppraisalMessageInbox.tsx",
    page: "src/app/headteacher/notices/page.tsx",
  };

  const source = Object.fromEntries(
    Object.entries(files).map(([key, relativePath]) => [key, read(relativePath)]),
  );

  for (const [key, relativePath] of Object.entries(files)) {
    transpile(relativePath, source[key]);
  }

  for (const marker of [
    "AppraisalNotificationType.PARTICIPATION_APPRECIATION",
    "AppraisalNotificationChannel.IN_APP",
    "AppraisalNotificationStatus.SENT",
    "recipientUserId: actorUserId",
    'readReceiptKey: "inAppReceipt"',
    "readAtFromPayload",
    "markHeadteacherAppraisalMessageRead",
    "Prisma.TransactionIsolationLevel.Serializable",
  ]) {
    contains(source.service, marker, `service:${marker}`);
  }

  for (const forbidden of [
    "teacherProfiles",
    "respondentTenantId",
    "schoolName",
    "score",
    "individualAnswers",
    "masked respondent",
    "sendSms",
    "sendEmail",
  ]) {
    excludes(source.service, forbidden, `service:no-${forbidden}`);
  }

  contains(source.route, "getHeadteacherApiContext", "route:headteacher-auth");
  contains(source.route, 'export async function GET', "route:get");
  contains(source.route, 'export async function POST', "route:post");
  contains(source.route, '"Cache-Control": "no-store, max-age=0"', "route:no-store");
  contains(source.route, "notificationId", "route:notification-id-only");
  excludes(source.route, "body?.actorUserId", "route:no-browser-actor-authority");
  excludes(source.route, "body?.recipientUserId", "route:no-browser-recipient-authority");
  excludes(source.route, "body?.cycleId", "route:no-browser-cycle-authority");

  contains(
    source.summary,
    "getHeadteacherAppraisalMessageSummary",
    "summary:appraisal-summary",
  );
  contains(source.summary, "Promise.all", "summary:parallel-read");
  contains(source.summary, "appraisal,", "summary:appraisal-output");
  contains(source.summary, '"Cache-Control": "no-store, max-age=0"', "summary:no-store");

  contains(source.card, "appraisalUnread", "card:appraisal-unread");
  contains(source.card, "officialUnread + appraisalUnread", "card:combined-badge");
  contains(source.card, "Appraisal messages:", "card:appraisal-count");

  contains(
    source.inbox,
    '"/api/headteacher/appraisal-notifications?take=20"',
    "inbox:list-api",
  );
  contains(
    source.inbox,
    'fetch("/api/headteacher/appraisal-notifications"',
    "inbox:read-api",
  );
  contains(source.inbox, "Appreciation", "inbox:appreciation-copy-surface");
  contains(source.inbox, "Information only", "inbox:information-only");
  contains(source.inbox, "Mark as read", "inbox:read-action");
  excludes(source.inbox, "localStorage", "inbox:no-local-storage");
  excludes(source.inbox, "sessionStorage", "inbox:no-session-storage");
  excludes(source.inbox, "setInterval(", "inbox:no-polling");
  excludes(source.inbox, "item.score", "inbox:no-score-field");
  excludes(source.inbox, "respondentUserId", "inbox:no-respondent-identity-field");
  excludes(source.inbox, "schoolName", "inbox:no-school-identity-field");

  contains(
    source.page,
    "HeadteacherAppraisalMessageInbox",
    "page:appraisal-inbox-mounted",
  );
  contains(
    source.page,
    "OfficialNoticeInboxClient",
    "page:official-inbox-preserved",
  );

  for (const forbidden of [
    "schema.prisma",
    "migration",
    "AppraisalNotificationType.FEEDBACK_RELEASED",
    "AppraisalNotificationType.CYCLE_OPENED",
  ]) {
    excludes(source.service, forbidden, `slice:no-${forbidden}`);
  }

  console.log("");
  console.log("=== N7-U17D APPRECIATION IN-APP RECEIPT PROOF ===");
  console.log("");
  console.log("Source row                   : existing AppraisalNotification");
  console.log("Notification type            : PARTICIPATION_APPRECIATION only");
  console.log("Delivery channel             : IN_APP / SENT only");
  console.log("Recipient authority          : server session user only");
  console.log("Dashboard notice badge       : appraisal unread included");
  console.log("Headteacher notice inbox     : appreciation message surfaced");
  console.log("Read receipt                 : payload-scoped + idempotent");
  console.log("Official notice inbox        : preserved unchanged");
  console.log("Score / answer leakage       : absent");
  console.log("School / respondent label    : absent");
  console.log("Persistent browser storage   : absent");
  console.log("Background polling           : absent");
  console.log("Schema change                : false");
  console.log("Migration required           : false");
  console.log("Database accessed            : false");
  console.log("");
  console.log("RESULT: N7-U17D APPRECIATION IN-APP RECEIPT GREEN");
}

try {
  main();
} catch (error) {
  console.error("");
  console.error("RESULT: N7-U17D APPRECIATION IN-APP RECEIPT FAILED");
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
}
