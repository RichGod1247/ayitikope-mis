#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS QA harness intentionally inspects and transpiles source contracts. */

const fs = require("fs");
const path = require("path");
const Module = require("module");
const ts = require("typescript");

const repoRoot = path.resolve(__dirname, "..", "..");

function fail(message, detail) {
  const suffix = detail === undefined ? "" : `\n${JSON.stringify(detail, null, 2)}`;
  throw new Error(`${message}${suffix}`);
}

function assert(condition, message, detail) {
  if (!condition) fail(message, detail);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) fail(message, { expected, actual });
}

function read(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  assert(fs.existsSync(absolutePath), "D3_3I_REQUIRED_FILE_MISSING", {
    relativePath,
  });
  return fs.readFileSync(absolutePath, "utf8");
}

function contains(source, marker, label) {
  assert(source.includes(marker), `D3_3I_MARKER_MISSING:${label}`, { marker });
}

function excludes(source, marker, label) {
  assert(!source.includes(marker), `D3_3I_FORBIDDEN_MARKER:${label}`, {
    marker,
  });
}

const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveFilename(request, parent, isMain, options) {
  if (typeof request === "string" && request.startsWith("@/")) {
    request = path.join(repoRoot, "src", request.slice(2));
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

require.extensions[".ts"] = function compileTypeScript(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const transpiled = ts.transpileModule(source, {
    fileName: filename,
    reportDiagnostics: true,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
      resolveJsonModule: true,
      skipLibCheck: true,
      strict: true,
    },
  });
  const errors = (transpiled.diagnostics ?? []).filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
  );
  if (errors.length) {
    fail("D3_3I_TYPESCRIPT_TRANSPILE_FAILED", errors.map((diagnostic) =>
      ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
    ));
  }
  module._compile(transpiled.outputText, filename);
};

function snapshot() {
  return {
    version: 1,
    eligibleResponses: 8,
    finalizedResponses: 6,
    expiredResponses: 2,
    minimumResponses: 5,
    releaseEligible: true,
    overallPercentage: 82.5,
    sectionAveragesJson: {
      S1: {
        sectionKey: "S1",
        sectionTitle: "Section One",
        sectionOrder: 1,
        averagePercentage: 82.5,
        validResponses: 6,
      },
    },
    sourceHash: "a".repeat(64),
    generatedAt: new Date("2026-08-01T10:05:00.000Z"),
    metadata: {
      circuitDisclosure: {
        threshold: 5,
        visibleCircuits: [],
        hiddenCircuitCount: 2,
      },
    },
  };
}

function cycle(status) {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    status,
    targetUserId: "director-user",
    targetRoleSnapshot: "DISTRICT_DIRECTOR",
    targetNameSnapshot: "Municipal Director",
    targetZoneNameSnapshot: "Municipality",
    openedAt: new Date("2026-07-25T10:00:00.000Z"),
    deadlineAt: new Date("2026-08-01T10:00:00.000Z"),
    closedAt: new Date("2026-08-01T10:01:00.000Z"),
    reviewStartedAt:
      status === "UNDER_REVIEW" || status === "RELEASED"
        ? new Date("2026-08-01T10:10:00.000Z")
        : null,
    releasedAt:
      status === "RELEASED"
        ? new Date("2026-08-01T11:00:00.000Z")
        : null,
    minimumResponses: 5,
    metadata: {},
    aggregate: snapshot(),
  };
}

function main() {
  const authorityPath = "src/lib/appraisals/authority.ts";
  const reviewPath = "src/lib/appraisals/directorFeedbackReview.ts";
  const releasePath = "src/lib/appraisals/directorFeedbackRelease.ts";
  const routePath =
    "src/app/api/district/director-feedback/review/release/route.ts";
  const clientPath =
    "src/app/district/director-feedback/review/DirectorFeedbackReviewClient.tsx";
  const indexPath = "src/lib/appraisals/index.ts";

  const authority = read(authorityPath);
  const review = read(reviewPath);
  const release = read(releasePath);
  const route = read(routePath);
  const client = read(clientPath);
  const index = read(indexPath);

  contains(authority, '"RELEASE_DIRECTOR_FEEDBACK"', "authority:capability");
  contains(release, '"RELEASE_DIRECTOR_FEEDBACK"', "release:authority");
  contains(release, "appraisalReleaseReadiness", "release:readiness");
  contains(
    release,
    "AppraisalCycleStatus.UNDER_REVIEW",
    "release:prior-state",
  );
  contains(release, "AppraisalCycleStatus.RELEASED", "release:terminal-state");
  contains(release, "releasedAt: now", "release:timestamp");
  contains(release, "releasedByUserId: actorUserId", "release:actor");
  contains(
    release,
    "APPRAISAL_AUDIT_ACTIONS.CYCLE_RELEASED",
    "release:audit",
  );
  contains(release, "aggregateSourceHash", "release:evidence-seal");
  contains(release, "scoreValuesRecordedInAudit: false", "release:no-score-audit");
  contains(
    release,
    "officialRegionalAppraisalReplaced: false",
    "release:interim-policy",
  );
  contains(release, "notificationsQueued: false", "release:no-notification");
  excludes(release, "AppraisalReview", "release:no-false-review-row");
  excludes(release, "respondentUserId", "release:no-respondent-id");
  excludes(release, "respondentTenantId", "release:no-school-id");
  excludes(release, "appraisalNotification.create", "release:no-message-queue");

  contains(review, "canRelease", "workspace:release-readiness");
  contains(review, "isReleased", "workspace:released-read-only");
  contains(review, "releasedAt", "workspace:release-timestamp");
  contains(
    review,
    "interimSupervisoryAssessmentRequired: false",
    "workspace:interim-policy",
  );

  contains(route, 'allowedRoles: ["DISTRICT_DIRECTOR"]', "api:director-only");
  contains(route, "allowedZoneLevels: [2]", "api:district-only");
  contains(route, '"Cache-Control": "no-store, max-age=0"', "api:no-store");
  contains(
    route,
    "acknowledgeDevelopmentalPurpose",
    "api:developmental-confirmation",
  );
  contains(
    route,
    "DIRECTOR_FEEDBACK_RELEASE_CONFIRMATION_REQUIRED",
    "api:explicit-confirmation",
  );
  excludes(route, "prisma.", "api:no-direct-prisma");

  contains(client, "Seal and Complete Review", "ui:release-action");
  contains(client, "confidential developmental feedback", "ui:purpose");
  contains(client, "Private review completed", "ui:released-state");
  contains(client, "navigator.onLine", "ui:offline-awareness");
  excludes(client, "localStorage", "ui:no-local-storage");
  excludes(client, "sessionStorage", "ui:no-session-storage");

  contains(
    index,
    'export * from "./directorFeedbackRelease";',
    "barrel:release-export",
  );

  const modulePath = path.join(repoRoot, reviewPath);
  const { buildDirectorFeedbackReviewWorkspace } = require(modulePath);

  const underReview = buildDirectorFeedbackReviewWorkspace(
    cycle("UNDER_REVIEW"),
  );
  assertEqual(underReview.readiness.canViewScores, true, "Scores visible in review");
  assertEqual(underReview.readiness.canRelease, true, "Ready review may release");
  assertEqual(underReview.cycle.releasedAt, null, "Not released yet");

  const released = buildDirectorFeedbackReviewWorkspace(cycle("RELEASED"));
  assertEqual(released.readiness.canViewScores, true, "Released scores remain visible");
  assertEqual(released.readiness.canRelease, false, "Released cycle cannot release again");
  assert(released.cycle.releasedAt, "Release timestamp must remain visible");
  assertEqual(
    released.aggregate.overallPercentage,
    82.5,
    "Released aggregate remains read-only",
  );

  console.log("");
  console.log("=== D3.3I DIRECTOR RELEASE DECISION PROOF ===");
  console.log("");
  console.log("Release transition            : UNDER_REVIEW -> RELEASED");
  console.log("Explicit Director confirmation: required");
  console.log("Release readiness             : workflow helper enforced");
  console.log("Aggregate evidence seal       : version + SHA-256 source hash");
  console.log("Release actor/time            : recorded on cycle");
  console.log("Release audit                 : APPRAISAL_CYCLE_RELEASED");
  console.log("Released aggregate            : remains read-only");
  console.log("Regional official appraisal   : explicitly not replaced");
  console.log("Respondent/school identity    : absent");
  console.log("Automatic notifications       : absent");
  console.log("AppraisalReview row           : not misused");
  console.log("Schema change                 : false");
  console.log("Database accessed             : false");
  console.log("");
  console.log("RESULT: D3.3I DIRECTOR RELEASE DECISION GREEN");
}

try {
  main();
} catch (error) {
  console.error("");
  console.error("RESULT: D3.3I DIRECTOR RELEASE DECISION FAILED");
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
}
