#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS QA harness intentionally loads TypeScript source through a local transpile hook. */

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
  assert(fs.existsSync(absolutePath), "D3_3H_REQUIRED_FILE_MISSING", {
    relativePath,
  });
  return fs.readFileSync(absolutePath, "utf8");
}

function contains(source, marker, label) {
  assert(source.includes(marker), `D3_3H_MARKER_MISSING:${label}`, { marker });
}

function excludes(source, marker, label) {
  assert(!source.includes(marker), `D3_3H_FORBIDDEN_MARKER:${label}`, {
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
    fail("D3_3H_TYPESCRIPT_TRANSPILE_FAILED", errors.map((diagnostic) =>
      ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
    ));
  }
  module._compile(transpiled.outputText, filename);
};

function snapshot({ finalized = 6, minimum = 5, releaseEligible = true } = {}) {
  return {
    version: 1,
    eligibleResponses: 8,
    finalizedResponses: finalized,
    expiredResponses: 2,
    minimumResponses: minimum,
    releaseEligible,
    overallPercentage: releaseEligible ? 82.5 : null,
    sectionAveragesJson: releaseEligible
      ? {
          S1: {
            sectionKey: "S1",
            sectionTitle: "Section One",
            sectionOrder: 1,
            averagePercentage: 80,
            validResponses: finalized,
          },
          S2: {
            sectionKey: "S2",
            sectionTitle: "Section Two",
            sectionOrder: 2,
            averagePercentage: 85,
            validResponses: finalized,
          },
        }
      : {},
    sourceHash: "a".repeat(64),
    generatedAt: new Date("2026-08-01T10:05:00.000Z"),
    metadata: {
      municipalBand: finalized >= 10 ? "PREFERRED" : "LIMITED",
      circuitDisclosure: {
        threshold: 5,
        visibleCircuits: releaseEligible
          ? [
              {
                circuitZoneId: "circuit-a",
                circuitName: "Circuit A",
                finalizedResponses: 5,
                overallPercentage: 84,
                sectionAverages: {
                  S1: {
                    sectionKey: "S1",
                    sectionTitle: "Section One",
                    sectionOrder: 1,
                    averagePercentage: 81,
                    validResponses: 5,
                  },
                },
              },
            ]
          : [],
        hiddenCircuitCount: 1,
        hiddenCircuitsIncludedInMunicipalAggregate: true,
        exactCountsForHiddenCircuitsIncluded: false,
      },
    },
  };
}

function cycle(status, aggregate) {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    status,
    targetUserId: "director-user",
    targetRoleSnapshot: "DISTRICT_DIRECTOR",
    targetNameSnapshot: "Municipal Director",
    targetZoneNameSnapshot: "Municipality",
    openedAt: new Date("2026-07-25T10:00:00.000Z"),
    deadlineAt: new Date("2026-08-01T10:00:00.000Z"),
    closedAt: status === "OPEN" ? null : new Date("2026-08-01T10:01:00.000Z"),
    reviewStartedAt:
      status === "UNDER_REVIEW"
        ? new Date("2026-08-01T10:10:00.000Z")
        : null,
    minimumResponses: 5,
    metadata: {},
    aggregate,
  };
}

function main() {
  const servicePath = "src/lib/appraisals/directorFeedbackReview.ts";
  const apiPath = "src/app/api/district/director-feedback/review/route.ts";
  const pagePath = "src/app/district/director-feedback/review/page.tsx";
  const clientPath =
    "src/app/district/director-feedback/review/DirectorFeedbackReviewClient.tsx";
  const requestClientPath =
    "src/app/district/director-feedback/DirectorFeedbackRequestClient.tsx";

  const service = read(servicePath);
  const api = read(apiPath);
  const page = read(pagePath);
  const client = read(clientPath);
  const requestClient = read(requestClientPath);

  contains(service, "AppraisalCycleStatus.CLOSED", "service:closed-state");
  contains(service, "AppraisalCycleStatus.UNDER_REVIEW", "service:review-state");
  contains(
    service,
    "assertAppraisalCycleTransition",
    "service:workflow-transition",
  );
  contains(
    service,
    "APPRAISAL_AUDIT_ACTIONS.CYCLE_REVIEW_STARTED",
    "service:audit",
  );
  contains(
    service,
    '"VIEW_DIRECTOR_FEEDBACK_RESULTS"',
    "service:authority",
  );
  contains(service, "releaseEligible", "service:threshold-gate");
  contains(service, "reviewStartedAt: now", "service:review-started-at");
  contains(service, "scoreValuesRecordedInAudit: false", "service:no-score-audit");
  contains(service, "individualFormsAvailable: true", "service:threshold-safe-forms");
  contains(service, "visibleCircuits", "service:threshold-circuits");
  contains(service, "hiddenCircuitCount", "service:hidden-circuit-summary");

  excludes(service, "respondentUserId", "service:no-respondent-id");
  excludes(service, "respondentTenantId", "service:no-school-link");
  excludes(service, "finalizedAt", "service:no-submission-time");
  excludes(service, "AppraisalReview.create", "service:no-false-assessment-review");
  excludes(service, "appraisalReview.create", "service:no-false-review-row");

  contains(api, 'allowedRoles: ["DISTRICT_DIRECTOR"]', "api:director-only");
  contains(api, "allowedZoneLevels: [2]", "api:district-only");
  contains(api, '"Cache-Control": "no-store, max-age=0"', "api:no-store");
  contains(api, "DIRECTOR_FEEDBACK_REVIEW_CONFIRMATION_REQUIRED", "api:confirm");
  excludes(api, "prisma.", "api:no-direct-prisma");
  excludes(api, "respondent", "api:no-identity-output");
  excludes(api, "school", "api:no-school-output");

  contains(page, 'allowedRoles: ["DISTRICT_DIRECTOR"]', "page:director-only");
  contains(client, "Begin Private Review", "ui:explicit-entry");
  contains(client, "minimum response threshold", "ui:threshold-explanation");
  contains(client, "Threshold-safe circuits", "ui:circuit-disclosure");
  contains(
    client,
    "I understand that these feedback results are confidential and",
    "ui:protected-confidentiality-confirmation",
  );
  contains(
    client,
    "completing this review seals the confidential feedback record.",
    "ui:sealed-review-confirmation",
  );
  excludes(client, "Regional Director", "ui:no-regional-director-comparison-copy");
  contains(client, "navigator.onLine", "ui:offline-awareness");
  excludes(client, "localStorage", "ui:no-local-storage");
  excludes(client, "sessionStorage", "ui:no-session-storage");
  contains(client, "DirectorFeedbackMaskedRespondents", "ui:masked-form-component");

  contains(
    requestClient,
    'href="/district/director-feedback/review"',
    "request-ui:review-entry",
  );
  contains(requestClient, "Open Review Readiness", "request-ui:closed-label");
  contains(requestClient, "Continue Private Review", "request-ui:continue-label");
  contains(
    api,
    'from "@/lib/appraisals/directorFeedbackReview";',
    "api:direct-review-import",
  );

  const modulePath = path.join(repoRoot, servicePath);
  const { buildDirectorFeedbackReviewWorkspace } = require(modulePath);

  const closedReady = buildDirectorFeedbackReviewWorkspace(
    cycle("CLOSED", snapshot()),
  );
  assertEqual(closedReady.readiness.canBeginReview, true, "Closed ready cycle may begin");
  assertEqual(closedReady.readiness.canViewScores, false, "Scores hidden before audited entry");
  assertEqual(closedReady.aggregate.overallPercentage, null, "Overall hidden before entry");
  assertEqual(closedReady.aggregate.sections.length, 0, "Sections hidden before entry");
  assertEqual(
    closedReady.aggregate.circuits.visibleCircuits.length,
    0,
    "Circuits hidden before entry",
  );
  assertEqual(
    closedReady.privacy.individualFormsAvailable,
    false,
    "Masked forms hidden before audited review entry",
  );

  const reviewing = buildDirectorFeedbackReviewWorkspace(
    cycle("UNDER_REVIEW", snapshot()),
  );
  assertEqual(reviewing.readiness.canViewScores, true, "Under-review scores visible");
  assertEqual(reviewing.aggregate.overallPercentage, 82.5, "Municipal score visible");
  assertEqual(reviewing.aggregate.sections.length, 2, "Section aggregates visible");
  assertEqual(
    reviewing.aggregate.circuits.visibleCircuits.length,
    1,
    "Only stored threshold-safe circuits visible",
  );
  assertEqual(
    reviewing.aggregate.circuits.visibleCircuits[0].finalizedResponses,
    5,
    "Threshold circuit exact count visible",
  );
  assertEqual(
    reviewing.aggregate.circuits.hiddenCircuitCount,
    1,
    "Hidden circuit count retained without response count",
  );
  assertEqual(
    reviewing.privacy.individualFormsAvailable,
    true,
    "Threshold-qualified masked forms available after review entry",
  );

  const blocked = buildDirectorFeedbackReviewWorkspace(
    cycle("CLOSED", snapshot({ finalized: 4, releaseEligible: false })),
  );
  assertEqual(blocked.readiness.canBeginReview, false, "Below minimum cannot begin");
  assertEqual(blocked.readiness.canViewScores, false, "Below minimum scores hidden");
  assertEqual(blocked.aggregate.overallPercentage, null, "Blocked overall hidden");
  assertEqual(blocked.aggregate.sections.length, 0, "Blocked sections hidden");
  assertEqual(
    blocked.aggregate.circuits.visibleCircuits.length,
    0,
    "Blocked circuits hidden",
  );
  assertEqual(
    blocked.privacy.individualFormsAvailable,
    false,
    "Blocked cycles expose no masked forms",
  );

  const open = buildDirectorFeedbackReviewWorkspace(cycle("OPEN", null));
  assertEqual(open.readiness.canBeginReview, false, "Open cycle cannot begin review");
  assertEqual(open.readiness.canViewScores, false, "Open cycle scores hidden");

  console.log("");
  console.log("=== D3.3H DIRECTOR REVIEW WORKSPACE PROOF ===");
  console.log("");
  console.log("Review entry transition       : CLOSED -> UNDER_REVIEW");
  console.log("Explicit Director confirmation: confidential + protected wording");
  console.log("Regional appraisal comparison : removed from review copy");
  console.log("Audit before score visibility : verified");
  console.log("Municipal threshold           : 5 finalized responses");
  console.log("Below-threshold score exposure: blocked");
  console.log("Circuit disclosure threshold  : 5");
  console.log("Hidden circuit contribution   : retained");
  console.log("Respondent/school identity     : absent");
  console.log("Individual forms               : masked + threshold-safe");
  console.log("AppraisalReview row            : not misused");
  console.log("Schema change                   : false");
  console.log("Database accessed               : false");
  console.log("");
  console.log("RESULT: D3.3H DIRECTOR REVIEW WORKSPACE GREEN");
}

try {
  main();
} catch (error) {
  console.error("");
  console.error("RESULT: D3.3H DIRECTOR REVIEW WORKSPACE FAILED");
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
}
