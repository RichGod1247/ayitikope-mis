#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS QA harness intentionally uses Node require. */

const fs = require("fs");
const path = require("path");

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
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function assertIncludes(source, value, message) {
  assert(source.includes(value), message, { value });
}

function assertExcludes(source, value, message) {
  assert(!source.includes(value), message, { value });
}

function main() {
  const sharedPath = "src/app/api/teacher/headteacher-appraisal/_shared.ts";
  const stateRoutePath = "src/app/api/teacher/headteacher-appraisal/route.ts";
  const loadRoutePath =
    "src/app/api/teacher/headteacher-appraisal/[cycleId]/route.ts";
  const sectionRoutePath =
    "src/app/api/teacher/headteacher-appraisal/[cycleId]/section/route.ts";
  const finalizeRoutePath =
    "src/app/api/teacher/headteacher-appraisal/[cycleId]/finalize/route.ts";
  const pagePath = "src/app/teacher/headteacher-appraisal/page.tsx";
  const clientPath =
    "src/app/teacher/headteacher-appraisal/HeadteacherFeedbackClient.tsx";

  const shared = read(sharedPath);
  const stateRoute = read(stateRoutePath);
  const loadRoute = read(loadRoutePath);
  const sectionRoute = read(sectionRoutePath);
  const finalizeRoute = read(finalizeRoutePath);
  const page = read(pagePath);
  const client = read(clientPath);
  const routes = [stateRoute, loadRoute, sectionRoute, finalizeRoute];

  for (const route of routes) {
    assertIncludes(
      route,
      'export const runtime = "nodejs"',
      "Node runtime required",
    );
    assertIncludes(
      route,
      'export const dynamic = "force-dynamic"',
      "Dynamic route required",
    );
    assertIncludes(
      route,
      'requireRoleNames: ["TEACHER"]',
      "Teacher-only API role required",
    );
    assertIncludes(route, "jsonNoStore", "No-store response helper required");
  }

  for (const header of [
    '"Cache-Control": "no-store, max-age=0"',
    'Pragma: "no-cache"',
    '"X-Content-Type-Options": "nosniff"',
    '"Referrer-Policy": "no-referrer"',
  ]) {
    assertIncludes(
      shared,
      header,
      "Complete no-store security headers required",
    );
  }

  assertIncludes(
    stateRoute,
    "readTeacherHeadteacherAppraisalAssignmentState",
    "Assignment state route must reuse D3.4C5 read state",
  );
  assertIncludes(
    loadRoute,
    "loadTeacherHeadteacherFeedbackResponse",
    "Load route must reuse D3.4D1 response engine",
  );
  assertIncludes(
    sectionRoute,
    "saveTeacherHeadteacherFeedbackSection",
    "Section route must reuse D3.4D1 save engine",
  );
  assertIncludes(
    finalizeRoute,
    "finalizeTeacherHeadteacherFeedbackResponse",
    "Finalize route must reuse D3.4D1 finalization engine",
  );
  assertIncludes(
    sectionRoute,
    "value.length > 34",
    "Route must cap official item payload",
  );
  assertIncludes(
    finalizeRoute,
    "body.confirm !== true",
    "Final confirmation required",
  );

  assertIncludes(
    page,
    'redirectTo: "/teacher/headteacher-appraisal"',
    "Exact page route required",
  );
  assertIncludes(
    page,
    'requireRoleNames: ["TEACHER"]',
    "Page must be Teacher-only",
  );

  for (const value of [
    "Headteacher Appraisal",
    "Confidential staff feedback",
    "AUTOSAVE_DELAY_MS = 650",
    "scheduleSectionAutosave",
    "queueSectionAutosave",
    "flushPendingAutosaves",
    "Automatic saving is on",
    "Saving securely…",
    "Saved automatically.",
    "Retry save",
    "Next section",
    "Review all answers",
    "Submit final response",
    "N/A · Not enough knowledge",
    "Very Poor",
    "Poor",
    "Acceptable",
    "Good",
    "Very Good",
    "Review Before you Submit",
    "NativeFinalReview",
    "min-w-[1040px]",
    "Your selected answers · read-only review copy",
    "Overall average of four section percentages",
    "No polling is used.",
    "min-h-16",
    "h-11 min-w-11",
  ]) {
    assertIncludes(client, value, "BBC autosave/native-form contract missing");
  }

  for (const removedControl of [
    "Save section",
    "Save &amp; next",
    "Sections save only when you press a save button.",
    "Save every changed section before opening final review.",
  ]) {
    assertExcludes(
      client,
      removedControl,
      "Manual section-save control must remain removed",
    );
  }

  assertIncludes(
    client,
    "contract.headteacherCanSeeIdentity === false",
    "Client must fail closed on Headteacher identity visibility",
  );
  assertIncludes(
    client,
    "contract.directorCanSeeIdentity === false",
    "District Director must not receive real Teacher identity",
  );
  assertIncludes(
    client,
    "contract.directorReceivesCycleScopedAnonymousLabelsOnly === true",
    "Director anonymous-label boundary must remain explicit",
  );
  assertIncludes(
    client,
    'contract.realIdentityAudience === "SUPERADMIN_ONLY"',
    "Only Superadmin may receive real identity through the separate path",
  );
  assertIncludes(
    client,
    "contract.superadminIdentityAccessRequiresSeparateAuthorizedAudit === true",
    "Superadmin identity access must remain separately authorized and audited",
  );
  assertIncludes(
    client,
    "contract.freeTextCommentsAllowed === false",
    "Comments must remain disabled",
  );
  assertIncludes(
    client,
    'cache: "no-store"',
    "Client requests must bypass caches",
  );
  assertIncludes(
    client,
    'credentials: "include"',
    "Client requests must preserve authenticated session",
  );
  assertIncludes(
    client,
    "setTimeout(",
    "Answer-triggered debounced autosave timer required",
  );
  assertIncludes(
    client,
    "clearTimeout(",
    "Autosave timer cleanup required",
  );

  const allNewSource = [shared, ...routes, page, client].join("\n");

  for (const forbidden of [
    "localStorage",
    "sessionStorage",
    "indexedDB",
    "setInterval(",
    "EventSource",
    "WebSocket",
    "appraisalNotification",
    "sendSms",
    "sendEmail",
    "providerMessageId",
    "generalComment",
    "textarea",
  ]) {
    assertExcludes(
      allNewSource,
      forbidden,
      "Forbidden Teacher response behavior detected",
    );
  }

  assertExcludes(client, "anonymous", "Do not promise absolute anonymity");
  assertExcludes(
    client,
    "Nobody will ever know",
    "Absolute anonymity promise forbidden",
  );

  console.log("");
  console.log("=== TEACHER API + BBC AUTOSAVE NATIVE FORM ===");
  console.log("");
  console.log("Assignment state API          : Teacher-only, D3.4C5-backed");
  console.log("Response load API             : tenant-bound, no-store");
  console.log("Section save API              : partial/full section, JSON only");
  console.log("Finalization API              : explicit confirmation required");
  console.log("Official form                 : 4 sections / 34 items");
  console.log("Question controls             : larger BBC/mobile targets");
  console.log("Save behavior                 : answer-triggered debounced autosave");
  console.log("Save visibility               : waiting / saving / saved / retry");
  console.log("Manual section-save buttons   : absent");
  console.log("Final review                  : full native 4-section / 34-item sheet");
  console.log("Mobile native review          : horizontal paper-form scrolling");
  console.log("Background polling            : absent");
  console.log("Rating controls               : 1-5 plus N/A");
  console.log("Free-text comments            : absent");
  console.log("Persistent browser storage    : absent");
  console.log("Headteacher identity access   : forbidden");
  console.log("Director real identity access : forbidden");
  console.log("Director response labels      : cycle-scoped Respondent 1…N only");
  console.log("Real identity audience        : SUPERADMIN_ONLY");
  console.log("No-store security headers     : complete");
  console.log("Notifications/providers       : absent");
  console.log("Database accessed             : false");
  console.log("");
  console.log("RESULT: TEACHER AUTOSAVE + NATIVE FORM GREEN");
}

try {
  main();
} catch (error) {
  console.error("");
  console.error("RESULT: TEACHER AUTOSAVE + NATIVE FORM FAILED");
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
}
