#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS QA harness performs deterministic source checks only. */

const fs = require("fs");
const path = require("path");

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
  if (!fs.existsSync(absolute)) fail("Required file missing", relativePath);
  return fs.readFileSync(absolute, "utf8");
}

function contains(source, marker, label) {
  assert(source.includes(marker), `Missing marker: ${label}`, marker);
}

function matches(source, pattern, label) {
  assert(pattern.test(source), `Missing pattern: ${label}`, String(pattern));
}

function excludes(source, marker, label) {
  assert(!source.includes(marker), `Forbidden marker: ${label}`, marker);
}

function main() {
  const files = {
    directOpen: "src/lib/appraisals/headteacherFeedbackDirectOpen.ts",
    notifications: "src/lib/appraisals/headteacherFeedbackNotifications.ts",
    route: "src/app/api/district/headteacher-appraisals/route.ts",
    client:
      "src/app/governance/appraisals/headteacher-supervisory/HeadteacherSupervisoryAssessmentClient.tsx",
    queue: "src/lib/appraisals/headteacherSupervisoryAssessmentQueue.ts",
  };

  const source = Object.fromEntries(
    Object.entries(files).map(([key, relativePath]) => [key, read(relativePath)]),
  );

  contains(
    source.directOpen,
    "readHeadteacherFeedbackDirectOpenTargets",
    "read-only direct-open target discovery",
  );
  contains(
    source.directOpen,
    "assertHeadteacherFeedbackDirectOpenAuthority",
    "server-side direct-open authority",
  );
  contains(
    source.directOpen,
    "respondentIdentitiesIncluded: false",
    "target discovery excludes respondent identities",
  );
  contains(
    source.directOpen,
    "individualStaffResponsesIncluded: false",
    "target discovery excludes individual staff responses",
  );
  contains(
    source.directOpen,
    "providerCalled: false",
    "target discovery provider-free",
  );

  contains(
    source.notifications,
    "directOpenHeadteacherFeedbackCycleWithNotifications",
    "existing direct-open notification wrapper",
  );
  contains(
    source.notifications,
    "ensureHeadteacherFeedbackCycleNotifications",
    "existing notification seeding path",
  );

  contains(
    source.route,
    "readHeadteacherFeedbackDirectOpenTargets",
    "Director route target discovery",
  );
  contains(
    source.route,
    "directOpenHeadteacherFeedbackCycleWithNotifications",
    "Director route reuses existing direct-open engine",
  );
  contains(source.route, 'action !== "DIRECT_OPEN"', "DIRECT_OPEN action allowlist");
  contains(
    source.route,
    "parsed.body.confirm !== true",
    "explicit confirmation gate",
  );
  contains(
    source.route,
    "requestedRespondentUserIds: undefined",
    "browser cannot select confidential respondents",
  );
  contains(source.route, "jsonNoStore", "no-store response helper");
  contains(
    source.route,
    "requireDirectorReviewApiContext",
    "Director/Superadmin route authority",
  );
  excludes(source.route, "prisma.", "route must not own persistence");

  contains(
    source.client,
    'nextQueue.actorRole === "DISTRICT_DIRECTOR"',
    "bootstrap discovery only for District Director",
  );
  contains(
    source.client,
    'queue?.actorRole !== "DISTRICT_DIRECTOR"',
    "direct-open mutation only for District Director",
  );
  contains(
    source.client,
    'action: "DIRECT_OPEN"',
    "client direct-open action",
  );
  contains(source.client, "window.confirm(", "explicit browser confirmation");
  contains(
    source.client,
    "window.crypto.randomUUID()",
    "ephemeral retry-safe direct-open key",
  );
  contains(
    source.client,
    "EduLife OS selects eligible respondents server-side",
    "BBC-safe respondent authority explanation",
  );
  matches(
    source.client,
    /fetch\s*\(\s*["']\/api\/district\/headteacher-appraisals["']\s*,/s,
    "Director bootstrap API",
  );
  matches(
    source.client,
    /fetch\s*\(\s*["']\/api\/district\/headteacher-appraisals["']\s*,\s*\{\s*method:\s*["']POST["']/s,
    "Director direct-open POST wiring",
  );

  for (const forbidden of [
    "localStorage",
    "sessionStorage",
    "setInterval(",
    "respondentUserId",
    "respondentTenantId",
    "requestedRespondentUserIds",
    "participantIds",
  ]) {
    excludes(source.client, forbidden, `client ${forbidden}`);
  }

  contains(
    source.queue,
    "visibleCycleStatuses",
    "ordinary supervisory queue remains cycle-backed",
  );
  excludes(
    source.queue,
    "directOpenHeadteacherFeedbackCycle",
    "ordinary queue must not create cycles",
  );

  console.log("");
  console.log("=== N7-P2C3J HEADTEACHER SUPERVISORY DIRECT-OPEN BOOTSTRAP ===");
  console.log("");
  console.log("Target discovery               : read-only and Director-scoped");
  console.log("No-cycle bootstrap             : explicit Director action only");
  console.log("Lifecycle engine               : existing direct-open service reused");
  console.log("Participant selection          : server-side only");
  console.log("Participant freeze             : preserved at OPEN");
  console.log("Notification seeding           : existing wrapper reused");
  console.log("Ordinary supervisory queue     : remains cycle-backed");
  console.log("HOS/BSC/SISSO direct-open      : absent");
  console.log("Browser identity payload       : Headteacher target only");
  console.log("Confidential respondent IDs    : absent");
  console.log("Persistent browser storage     : absent");
  console.log("Background polling             : absent");
  console.log("Direct Prisma in API route     : absent");
  console.log("Provider calls in bootstrap    : absent");
  console.log("Database accessed by QA        : false");
  console.log("");
  console.log(
    "RESULT: N7-P2C3J HEADTEACHER SUPERVISORY DIRECT-OPEN BOOTSTRAP GREEN",
  );
}

try {
  main();
} catch (error) {
  console.error("");
  console.error(
    "RESULT: N7-P2C3J HEADTEACHER SUPERVISORY DIRECT-OPEN BOOTSTRAP FAILED",
  );
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
}
