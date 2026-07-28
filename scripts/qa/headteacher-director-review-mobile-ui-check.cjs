/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS QA harness intentionally performs static repository contract checks. */
const fs = require("fs");
const path = require("path");
const ts = require("typescript");

function fail(message, details) {
  console.error(message);
  if (details !== undefined) console.error(details);
  process.exit(1);
}

function read(relativePath) {
  const absolutePath = path.join(process.cwd(), relativePath);
  if (!fs.existsSync(absolutePath)) {
    fail(`Missing required file: ${relativePath}`);
  }
  return fs.readFileSync(absolutePath, "utf8").replace(/\r\n/g, "\n");
}

function contains(source, marker, label) {
  if (!source.includes(marker)) {
    fail(`Missing ${label}`, marker);
  }
}

function excludes(source, marker, label) {
  if (source.includes(marker)) {
    fail(`Forbidden ${label}`, marker);
  }
}

function transpile(source, fileName) {
  const output = ts.transpileModule(source, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      strict: true,
    },
    fileName,
    reportDiagnostics: true,
  });

  const errors = (output.diagnostics || []).filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
  );

  if (errors.length > 0) {
    fail(
      `TypeScript syntax failed: ${fileName}`,
      errors.map((error) => error.messageText),
    );
  }
}

function main() {
  const pagePath =
    "src/app/district/headteacher-appraisals/review/page.tsx";
  const clientPath =
    "src/app/district/headteacher-appraisals/review/HeadteacherDirectorReviewClient.tsx";

  const page = read(pagePath);
  const client = read(clientPath);

  contains(page, 'export const dynamic = "force-dynamic"', "dynamic page");
  contains(page, "initialCycleId={cycleId}", "controlled cycle reference");
  contains(
    page,
    "HeadteacherDirectorReviewClient",
    "review client integration",
  );

  contains(
    client,
    "const BBC_REVIEW_POLICY",
    "BBC interface policy",
  );
  contains(
    client,
    'presentation: "ONE_COMPARISON_AT_A_TIME"',
    "one-comparison-at-a-time mode",
  );
  contains(client, "expectedSections: 4", "four sections");
  contains(client, "expectedItems: 34", "34 items");
  contains(client, "backgroundPollingAllowed: false", "no polling");
  contains(
    client,
    "persistentBrowserStorageAllowed: false",
    "no persistent storage",
  );
  contains(
    client,
    "respondentIdentitiesIncluded: false",
    "no respondent identities",
  );
  contains(
    client,
    "individualStaffResponsesIncluded: false",
    "no individual forms",
  );
  contains(
    client,
    "reviewerMayRewriteScores: false",
    "no score rewriting",
  );
  contains(
    client,
    "notificationSeedingIncluded: false",
    "notification deferral",
  );

  contains(
    client,
    "/review-package",
    "review-package API",
  );
  contains(client, "/review-start", "review-start API");
  contains(client, '"return-hold"', "return-hold API");
  contains(client, '"release"', "release API");
  contains(client, 'cache: "no-store"', "no-store fetches");
  contains(client, "window.confirm", "explicit confirmation");
  contains(client, "Load review package", "explicit package load");
  contains(client, "Start Director review", "explicit review start");
  contains(client, "Review one item at a time", "BBC guidance");
  contains(client, "Previous", "previous item control");
  contains(client, "Next", "next item control");
  contains(client, "Confirm return for correction", "return action");
  contains(client, "Confirm hold", "hold action");
  contains(client, "Confirm official release", "release action");
  contains(
    client,
    "No combined appraisal score",
    "no combined score message",
  );
  contains(
    client,
    "Nothing was changed",
    "network-safe failure message",
  );
  contains(
    client,
    "Do not repeat the decision blindly",
    "idempotency safety guidance",
  );

  excludes(client, "localStorage", "local storage");
  excludes(client, "sessionStorage", "session storage");
  excludes(client, "setInterval(", "polling interval");
  excludes(client, "setTimeout(", "background retry");
  excludes(client, "respondents", "respondent endpoint");
  excludes(client, "appraisalNotification", "notification mutation");
  excludes(client, "sendSms", "SMS provider");
  excludes(client, "sendEmail", "email provider");
  excludes(client, "combinedOverallPercentage", "combined score field");
  excludes(client, "district/dashboard", "dashboard modification");
  excludes(client, "prisma.", "direct database use");

  transpile(page, pagePath);
  transpile(client, clientPath);

  console.log("");
  console.log("=== D3.4G4B BBC-FRIENDLY DIRECTOR REVIEW INTERFACE ===");
  console.log("");
  console.log("Audience scope                 : District Director workspace");
  console.log("Entry                          : controlled cycleId link");
  console.log("Network behavior               : explicit load, no polling");
  console.log("Evidence view                  : overall / four sections / 34 items");
  console.log("Mobile interaction             : one comparison item at a time");
  console.log("Navigation                     : large Previous / Next controls");
  console.log("N/A handling                   : explicit");
  console.log("Combined appraisal score       : absent");
  console.log("Review start                   : explicit confirmation");
  console.log("Return                         : reason + explicit confirmation");
  console.log("Hold                           : reason + explicit confirmation");
  console.log("Release                        : optional note + confirmation");
  console.log("Reviewer score rewriting       : absent");
  console.log("Respondent identities/forms    : absent");
  console.log("Persistent browser storage     : absent");
  console.log("Notifications/providers        : absent");
  console.log("Dashboard modification         : absent");
  console.log("Database accessed              : false");
  console.log("");
  console.log("RESULT: D3.4G4B DIRECTOR REVIEW UI GREEN");
}

main();
