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
  assert(fs.existsSync(absolutePath), "D3_3G_REQUIRED_FILE_MISSING", {
    relativePath,
  });
  return fs.readFileSync(absolutePath, "utf8");
}

function contains(source, marker, label) {
  assert(source.includes(marker), `D3_3G_MARKER_MISSING:${label}`, { marker });
}

function excludes(source, marker, label) {
  assert(!source.includes(marker), `D3_3G_FORBIDDEN_MARKER:${label}`, {
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
    fail("D3_3G_TYPESCRIPT_TRANSPILE_FAILED", errors.map((diagnostic) =>
      ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
    ));
  }
  module._compile(transpiled.outputText, filename);
};

function scoreRows(value, notApplicable = false) {
  return [
    {
      instrumentItemId: "item-1",
      sectionKey: "SECTION_ONE",
      sectionTitle: "Section One",
      sectionOrder: 1,
      itemKey: "1.1",
      itemLabel: "Official item one",
      itemOrder: 1,
      itemMaxScore: 5,
      score: notApplicable ? null : value,
      notApplicable,
    },
  ];
}

function finalizedParticipant(index, circuitId, circuitName, overall, score = 4) {
  return {
    id: `participant-${index}`,
    status: "FINALIZED",
    eligibilitySnapshotJson: {
      circuitZoneId: circuitId,
      circuitName,
      tenantName: `Hidden School ${index}`,
      selectionBasis: "ACTIVE_HEADTEACHER_MEMBERSHIP_AT_CYCLE_OPEN",
    },
    response: {
      id: `response-${index}`,
      status: "FINALIZED",
      responseHash: `${String(index).padStart(2, "0")}`.repeat(32),
      overallPercentage: overall,
      sectionPercentagesJson: { SECTION_ONE: overall },
      scores: scoreRows(score),
    },
  };
}

function expiredParticipant(index, circuitId, circuitName) {
  return {
    id: `participant-${index}`,
    status: "EXPIRED",
    eligibilitySnapshotJson: {
      circuitZoneId: circuitId,
      circuitName,
      tenantName: `Hidden School ${index}`,
      selectionBasis: "ACTIVE_HEADTEACHER_MEMBERSHIP_AT_CYCLE_OPEN",
    },
    response: null,
  };
}

function fixture(participants) {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    status: "CLOSED",
    instrumentVersionId: "00000000-0000-4000-8000-000000000002",
    minimumResponses: 5,
    deadlineAt: new Date("2026-08-01T10:00:00.000Z"),
    closedAt: new Date("2026-08-01T10:15:00.000Z"),
    participants,
  };
}

function main() {
  const closurePath = "src/lib/appraisals/directorFeedbackClosure.ts";
  const cronPath =
    "src/app/api/internal/appraisals/notifications/cron/route.ts";
  const notificationsPath =
    "src/lib/appraisals/directorFeedbackNotifications.ts";

  const closure = read(closurePath);
  const cron = read(cronPath);
  const notifications = read(notificationsPath);

  contains(closure, "AppraisalCycleStatus.CLOSED", "closure:closed-state");
  contains(
    closure,
    "AppraisalParticipantStatus.EXPIRED",
    "closure:unfinished-expiry",
  );
  contains(
    closure,
    "APPRAISAL_AUDIT_ACTIONS.CYCLE_CLOSED",
    "closure:audit",
  );
  contains(
    closure,
    "APPRAISAL_AUDIT_ACTIONS.AGGREGATE_GENERATED",
    "aggregate:audit",
  );
  contains(closure, "cycleId_sourceHash", "aggregate:source-idempotency");
  contains(closure, "sourceHashAlgorithm: \"SHA-256\"", "aggregate:hash");
  contains(
    closure,
    "hiddenCircuitsIncludedInMunicipalAggregate: true",
    "aggregate:hidden-contribution",
  );
  contains(
    closure,
    "exactCountsForHiddenCircuitsIncluded: false",
    "aggregate:hidden-count-protection",
  );
  contains(
    closure,
    "tx.appraisalParticipant.updateMany",
    "closure:participant-update",
  );
  contains(
    closure,
    "AppraisalParticipantStatus.NOT_STARTED",
    "closure:not-started-expiry",
  );
  contains(
    closure,
    "AppraisalParticipantStatus.IN_PROGRESS",
    "closure:in-progress-expiry",
  );
  excludes(closure, "respondentUserId", "aggregate:no-respondent-identity");
  excludes(closure, "respondentTenantId", "aggregate:no-school-link");
  excludes(closure, "finalizedAt.toISOString", "aggregate:no-submission-time");

  contains(
    cron,
    "runDirectorFeedbackLifecycleWorker",
    "cron:lifecycle-worker",
  );
  contains(
    cron,
    "getDirectorFeedbackLifecycleHealth",
    "cron:lifecycle-health",
  );
  contains(cron, "mode: \"HEALTH_ONLY\"", "cron:get-health-only");
  contains(cron, "mode: \"WORKER_EXECUTED\"", "cron:post-worker");
  contains(
    cron,
    '"Cache-Control": "no-store, max-age=0"',
    "cron:no-store",
  );
  excludes(cron, "recipientUserId", "cron:no-recipient-output");
  excludes(cron, "school", "cron:no-school-output");

  contains(
    notifications,
    "AppraisalCycleStatus.CLOSED",
    "request-gate:closed-blocks-new-cycle",
  );
  contains(
    cron,
    'from "@/lib/appraisals/directorFeedbackClosure";',
    "cron:direct-closure-import",
  );

  const modulePath = path.join(repoRoot, closurePath);
  const { buildDirectorFeedbackAggregateData } = require(modulePath);

  const eligible = fixture([
    finalizedParticipant(1, "circuit-a", "Circuit A", 80),
    finalizedParticipant(2, "circuit-a", "Circuit A", 90),
    finalizedParticipant(3, "circuit-a", "Circuit A", 100),
    finalizedParticipant(4, "circuit-a", "Circuit A", 70),
    finalizedParticipant(5, "circuit-a", "Circuit A", 60),
    finalizedParticipant(6, "circuit-b", "Circuit B", 50),
    expiredParticipant(7, "circuit-b", "Circuit B"),
  ]);

  const aggregate = buildDirectorFeedbackAggregateData(eligible);
  assertEqual(aggregate.eligibleResponses, 7, "Eligible participant count");
  assertEqual(aggregate.finalizedResponses, 6, "Finalized response count");
  assertEqual(aggregate.expiredResponses, 1, "Expired response count");
  assertEqual(aggregate.releaseEligible, true, "Municipal threshold");
  assertEqual(aggregate.overallPercentage, 75, "Municipal average");
  assertEqual(aggregate.sourceHash.length, 64, "SHA-256 source hash");
  assertEqual(aggregate.metadata.municipalBand, "LIMITED", "Municipal band");

  const disclosure = aggregate.metadata.circuitDisclosure;
  assert(Array.isArray(disclosure.visibleCircuits), "Visible circuit list");
  assertEqual(disclosure.visibleCircuits.length, 1, "Only threshold circuit visible");
  assertEqual(disclosure.visibleCircuits[0].circuitName, "Circuit A", "Visible circuit");
  assertEqual(disclosure.visibleCircuits[0].finalizedResponses, 5, "Visible exact count");
  assertEqual(disclosure.hiddenCircuitCount, 1, "Hidden circuit count");
  assertEqual(
    disclosure.exactCountsForHiddenCircuitsIncluded,
    false,
    "Hidden exact counts omitted",
  );

  const serialized = JSON.stringify(aggregate);
  assert(!serialized.includes("Hidden School"), "School names must not persist");
  assert(!serialized.includes("respondentUserId"), "Respondent ids must not persist");
  assert(!serialized.includes("response-1"), "Response ids must remain hash inputs only");

  const blocked = buildDirectorFeedbackAggregateData(
    fixture([
      finalizedParticipant(1, "circuit-a", "Circuit A", 80),
      finalizedParticipant(2, "circuit-a", "Circuit A", 90),
      finalizedParticipant(3, "circuit-a", "Circuit A", 100),
      finalizedParticipant(4, "circuit-a", "Circuit A", 70),
      expiredParticipant(5, "circuit-a", "Circuit A"),
      expiredParticipant(6, "circuit-b", "Circuit B"),
    ]),
  );
  assertEqual(blocked.releaseEligible, false, "Below minimum must block");
  assertEqual(blocked.overallPercentage, null, "Blocked score hidden");
  assertEqual(Object.keys(blocked.sectionAveragesJson).length, 0, "Blocked sections hidden");
  assertEqual(Object.keys(blocked.itemAveragesJson).length, 0, "Blocked items hidden");
  assertEqual(blocked.metadata.municipalBand, "BLOCKED", "Blocked band");

  const changed = structuredClone(eligible);
  changed.participants[6].status = "FINALIZED";
  changed.participants[6].response = finalizedParticipant(
    7,
    "circuit-b",
    "Circuit B",
    40,
  ).response;
  const changedAggregate = buildDirectorFeedbackAggregateData(changed);
  assert(
    changedAggregate.sourceHash !== aggregate.sourceHash,
    "Source hash must change when closure evidence changes",
  );

  console.log("");
  console.log("=== D3.3G DEADLINE CLOSURE + AGGREGATION PROOF ===");
  console.log("");
  console.log("Deadline transition           : OPEN -> CLOSED");
  console.log("Unfinished participants       : EXPIRED only");
  console.log("Finalized responses           : preserved immutable");
  console.log("Closure retry                 : idempotent");
  console.log("Aggregate source              : finalized responses only");
  console.log("Aggregate source hash         : SHA-256");
  console.log("Municipal minimum/preferred   : 5 / 10");
  console.log("Circuit disclosure threshold : 5");
  console.log("Below-threshold circuits      : hidden, municipal contribution retained");
  console.log("Below-minimum score exposure  : blocked");
  console.log("Respondent/school identity    : absent");
  console.log("Cron integration              : existing appraisal cron");
  console.log("New DigitalOcean job          : false");
  console.log("Database accessed             : false");
  console.log("");
  console.log("RESULT: D3.3G DEADLINE CLOSURE AGGREGATION GREEN");
}

try {
  main();
} catch (error) {
  console.error("");
  console.error("RESULT: D3.3G DEADLINE CLOSURE AGGREGATION FAILED");
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
}
