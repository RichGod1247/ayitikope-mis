#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS QA harness intentionally loads TypeScript through a local transpile hook. */

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

function clone(value) {
  return structuredClone(value);
}

async function expectError(code, operation) {
  try {
    await operation();
  } catch (error) {
    assertEqual(error?.code ?? error?.message, code, `Expected ${code}`);
    return error;
  }
  fail(`Expected error ${code}`);
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
    fail("D3_4E2B_TYPESCRIPT_TRANSPILE_FAILED", {
      filename,
      diagnostics: errors.map((diagnostic) =>
        ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
      ),
    });
  }
  module._compile(transpiled.outputText, filename);
};

function hash(char) {
  return char.repeat(64);
}

const sectionSpecs = [
  { key: "S1", title: "Section One", order: 1, items: 11, max: 55 },
  { key: "S2", title: "Section Two", order: 2, items: 9, max: 45 },
  { key: "S3", title: "Section Three", order: 3, items: 8, max: 40 },
  { key: "S4", title: "Section Four", order: 4, items: 6, max: 30 },
];

function scoreRows(score, naItemKey = null) {
  return sectionSpecs.flatMap((section) =>
    Array.from({ length: section.items }, (_, index) => {
      const itemKey = `${section.order}.${index + 1}`;
      const notApplicable = itemKey === naItemKey;
      return {
        sectionKey: section.key,
        sectionTitle: section.title,
        sectionOrder: section.order,
        sectionMaxScore: section.max,
        itemKey,
        itemLabel: `Indicator ${itemKey}`,
        itemOrder: index + 1,
        itemMaxScore: 5,
        score: notApplicable ? null : score,
        notApplicable,
      };
    }),
  );
}

function percentages(rows) {
  const values = {};
  for (const section of sectionSpecs) {
    const applicable = rows.filter(
      (row) => row.sectionKey === section.key && !row.notApplicable,
    );
    const earned = applicable.reduce((sum, row) => sum + row.score, 0);
    const possible = applicable.reduce((sum, row) => sum + row.itemMaxScore, 0);
    values[section.key] = Number(((earned / possible) * 100).toFixed(2));
  }
  return values;
}

function finalizedParticipant(responseHash, score, naItemKey = null) {
  const scores = scoreRows(score, naItemKey);
  const sectionPercentagesJson = percentages(scores);
  const overallPercentage = Number(
    (
      Object.values(sectionPercentagesJson).reduce((sum, value) => sum + value, 0) /
      Object.values(sectionPercentagesJson).length
    ).toFixed(2),
  );
  return {
    status: "FINALIZED",
    response: {
      status: "FINALIZED",
      responseHash,
      overallPercentage,
      sectionPercentagesJson,
      generalComment: null,
      scores,
    },
  };
}

function makeCycle(overrides = {}) {
  return {
    id: "cycle-headteacher-aggregate-001",
    status: "CLOSED",
    targetTenantId: "school-one",
    targetRoleSnapshot: "HEADTEACHER",
    minimumResponses: 1,
    metadata: {
      workflow: "HEADTEACHER_CONFIDENTIAL_STAFF_FEEDBACK",
    },
    instrumentVersion: {
      version: 1,
      contentHash: hash("d"),
      instrument: {
        code: "HEADTEACHER_STAFF_FEEDBACK_V1",
      },
    },
    participants: [
      finalizedParticipant(hash("a"), 5, "1.1"),
      finalizedParticipant(hash("b"), 3),
      { status: "EXPIRED", response: null },
      { status: "REVOKED", response: null },
    ],
    ...overrides,
  };
}

function makeDatabase(cycleInput, options = {}) {
  const state = {
    cycle: clone(cycleInput),
    snapshot: options.snapshot ? clone(options.snapshot) : null,
    concurrentSnapshot: null,
    audits: [],
    createCalls: 0,
    transactionOptions: [],
    raceOnCreate: Boolean(options.raceOnCreate),
  };

  const snapshotApi = {
    async findFirst() {
      return clone(state.snapshot ?? state.concurrentSnapshot);
    },
    async create(args) {
      state.createCalls += 1;
      const row = {
        id: "aggregate-snapshot-one",
        ...clone(args.data),
      };
      if (state.raceOnCreate) {
        state.concurrentSnapshot = row;
        throw Object.assign(new Error("P2002"), { code: "P2002" });
      }
      state.snapshot = row;
      return {
        id: row.id,
        version: row.version,
        sourceHash: row.sourceHash,
        releaseEligible: row.releaseEligible,
        eligibleResponses: row.eligibleResponses,
        finalizedResponses: row.finalizedResponses,
        expiredResponses: row.expiredResponses,
        minimumResponses: row.minimumResponses,
        overallPercentage: row.overallPercentage,
      };
    },
  };

  const tx = {
    appraisalCycle: {
      async findUnique() {
        return clone(state.cycle);
      },
    },
    appraisalAggregateSnapshot: snapshotApi,
    auditLog: {
      async create(args) {
        state.audits.push(clone(args.data));
        return clone(args.data);
      },
    },
  };

  return {
    state,
    database: {
      appraisalCycle: tx.appraisalCycle,
      appraisalAggregateSnapshot: snapshotApi,
      async $transaction(operation, transactionOptions) {
        state.transactionOptions.push(clone(transactionOptions));
        const rollback = {
          snapshot: clone(state.snapshot),
          audits: clone(state.audits),
          createCalls: state.createCalls,
        };
        try {
          return await operation(tx);
        } catch (error) {
          state.snapshot = rollback.snapshot;
          state.audits = rollback.audits;
          state.createCalls = rollback.createCalls;
          throw error;
        }
      },
    },
  };
}

async function main() {
  const sourcePath = path.join(
    repoRoot,
    "src",
    "lib",
    "appraisals",
    "headteacherFeedbackAggregateSnapshot.ts",
  );
  const source = fs.readFileSync(sourcePath, "utf8");
  const snapshotModule = require(sourcePath);
  const {
    HEADTEACHER_FEEDBACK_AGGREGATE_SNAPSHOT_POLICY,
    sealHeadteacherFeedbackAggregateSnapshot,
  } = snapshotModule;

  assertEqual(HEADTEACHER_FEEDBACK_AGGREGATE_SNAPSHOT_POLICY.snapshotVersion, 1, "Version one only");
  assertEqual(HEADTEACHER_FEEDBACK_AGGREGATE_SNAPSHOT_POLICY.minimumFinalizedResponses, 1, "One-response minimum");
  assertEqual(HEADTEACHER_FEEDBACK_AGGREGATE_SNAPSHOT_POLICY.startsReview, false, "Review must not start");
  assertEqual(HEADTEACHER_FEEDBACK_AGGREGATE_SNAPSHOT_POLICY.changesCycleStatus, false, "Cycle state must not change");
  assertEqual(HEADTEACHER_FEEDBACK_AGGREGATE_SNAPSHOT_POLICY.seedsNotifications, false, "No notifications");
  assertEqual(HEADTEACHER_FEEDBACK_AGGREGATE_SNAPSHOT_POLICY.callsProviders, false, "No providers");

  assert(source.includes("calculateHeadteacherFeedbackAggregate"), "E2A contract must be reused");
  assert(source.includes("Prisma.TransactionIsolationLevel.Serializable"), "Serializable transaction missing");
  assert(source.includes("HEADTEACHER_FEEDBACK_AGGREGATE_SNAPSHOT_DRIFT"), "Drift rejection missing");
  assert(!source.includes("respondentUserId: true"), "Respondent identity must not be selected");
  assert(!source.includes("respondentTenantId: true"), "Respondent tenant identity must not be selected");
  assert(!source.includes("finalizedByUserId: true"), "Finalizer identity must not be selected");
  assert(!source.includes("participantId: true"), "Participant IDs must not be selected");
  assert(!source.includes("responseId: true"), "Response IDs must not be selected");
  assert(!source.includes("appraisalCycle.update"), "Aggregate sealing must not advance lifecycle");

  const createdFixture = makeDatabase(makeCycle());
  const created = await sealHeadteacherFeedbackAggregateSnapshot({
    cycleId: "cycle-headteacher-aggregate-001",
    reqId: "req-e2b-created",
    now: new Date("2026-07-27T15:30:00.000Z"),
    database: createdFixture.database,
  });

  assertEqual(created.outcome, "CREATED", "Snapshot should be created");
  assert(created.snapshot, "Created snapshot summary missing");
  assertEqual(created.snapshot.version, 1, "Snapshot version");
  assertEqual(created.snapshot.eligibleResponses, 4, "Eligible count");
  assertEqual(created.snapshot.finalizedResponses, 2, "Finalized count");
  assertEqual(created.snapshot.expiredResponses, 1, "Expired count");
  assertEqual(created.snapshot.minimumResponses, 1, "Minimum count");
  assertEqual(created.snapshot.releaseEligible, true, "Readiness flag");
  assertEqual(created.snapshot.overallPercentage, 80, "Overall percentage");
  assert(/^[a-f0-9]{64}$/.test(created.snapshot.sourceHash), "Source hash must be SHA-256");
  assertEqual(createdFixture.state.createCalls, 1, "One snapshot write");
  assertEqual(createdFixture.state.audits.length, 1, "One audit write");
  assertEqual(createdFixture.state.cycle.status, "CLOSED", "Cycle remains CLOSED");
  assertEqual(createdFixture.state.transactionOptions.length, 1, "One transaction");
  assertEqual(createdFixture.state.transactionOptions[0].isolationLevel, "Serializable", "Serializable option");
  assertEqual(createdFixture.state.transactionOptions[0].maxWait, 5000, "Bounded max wait");
  assertEqual(createdFixture.state.transactionOptions[0].timeout, 20000, "Bounded timeout");

  const stored = createdFixture.state.snapshot;
  assert(stored, "Stored snapshot missing");
  assertEqual(stored.version, 1, "Stored version");
  assertEqual(stored.generatedByUserId, null, "System-generated snapshot");
  assertEqual(stored.sectionAveragesJson.S1.averagePercentage, 80, "Stored section evidence");
  assertEqual(stored.itemAveragesJson["1.1"].averageScore, 3, "Stored item evidence");
  assertEqual(stored.itemAveragesJson["1.1"].applicableResponses, 1, "N/A denominator proof");
  assertEqual(stored.itemAveragesJson["1.1"].notApplicableResponses, 1, "N/A count proof");
  assertEqual(stored.metadata.reviewStarted, false, "Review remains separate");
  assertEqual(stored.metadata.privacy.respondentIdentitiesIncluded, false, "Identity privacy");
  assertEqual(stored.metadata.privacy.individualScoresIncluded, false, "Score privacy");
  assertEqual(stored.metadata.privacy.responseHashesIncluded, false, "Response-hash privacy");

  const auditText = JSON.stringify(createdFixture.state.audits[0]);
  assert(!auditText.includes(hash("a")), "Audit must not contain response hash A");
  assert(!auditText.includes(hash("b")), "Audit must not contain response hash B");
  assert(!auditText.includes("Indicator 1.1"), "Audit must not contain item values");
  assert(!auditText.includes("participant" + "s\":\["), "Audit must not contain participant list");
  assertEqual(createdFixture.state.audits[0].metadata.overallPercentageIncluded, false, "Audit score exclusion");
  assertEqual(createdFixture.state.audits[0].metadata.respondentIdentitiesIncluded, false, "Audit identity exclusion");

  const second = await sealHeadteacherFeedbackAggregateSnapshot({
    cycleId: "cycle-headteacher-aggregate-001",
    reqId: "req-e2b-retry",
    database: createdFixture.database,
  });
  assertEqual(second.outcome, "EXISTING_MATCH", "Retry must be idempotent");
  assertEqual(createdFixture.state.createCalls, 1, "Retry must not write snapshot");
  assertEqual(createdFixture.state.audits.length, 1, "Retry must not duplicate audit");
  assertEqual(second.snapshot.sourceHash, created.snapshot.sourceHash, "Retry hash");

  const driftSnapshot = clone(stored);
  driftSnapshot.sourceHash = hash("e");
  const driftFixture = makeDatabase(makeCycle(), { snapshot: driftSnapshot });
  await expectError(
    "HEADTEACHER_FEEDBACK_AGGREGATE_SNAPSHOT_DRIFT",
    () => sealHeadteacherFeedbackAggregateSnapshot({
      cycleId: "cycle-headteacher-aggregate-001",
      database: driftFixture.database,
    }),
  );
  assertEqual(driftFixture.state.createCalls, 0, "Drift must not write");
  assertEqual(driftFixture.state.audits.length, 0, "Drift must not audit creation");

  const insufficientCycle = makeCycle({
    participants: [
      { status: "EXPIRED", response: null },
      { status: "REVOKED", response: null },
    ],
  });
  const insufficientFixture = makeDatabase(insufficientCycle);
  const insufficient = await sealHeadteacherFeedbackAggregateSnapshot({
    cycleId: insufficientCycle.id,
    database: insufficientFixture.database,
  });
  assertEqual(insufficient.outcome, "INSUFFICIENT_RESPONSES", "Insufficient state");
  assertEqual(insufficient.snapshot, null, "No insufficient snapshot");
  assertEqual(insufficientFixture.state.createCalls, 0, "No insufficient write");
  assertEqual(insufficientFixture.state.audits.length, 0, "No insufficient audit");

  const invalidExistingFixture = makeDatabase(insufficientCycle, { snapshot: stored });
  await expectError(
    "HEADTEACHER_FEEDBACK_AGGREGATE_SNAPSHOT_PRESENT_WITH_INSUFFICIENT_RESPONSES",
    () => sealHeadteacherFeedbackAggregateSnapshot({
      cycleId: insufficientCycle.id,
      database: invalidExistingFixture.database,
    }),
  );

  const wrongRoleFixture = makeDatabase(makeCycle({ targetRoleSnapshot: "DISTRICT_DIRECTOR" }));
  await expectError(
    "HEADTEACHER_FEEDBACK_AGGREGATE_TARGET_INVALID",
    () => sealHeadteacherFeedbackAggregateSnapshot({
      cycleId: wrongRoleFixture.state.cycle.id,
      database: wrongRoleFixture.database,
    }),
  );

  const noTenantFixture = makeDatabase(makeCycle({ targetTenantId: null }));
  await expectError(
    "HEADTEACHER_FEEDBACK_AGGREGATE_TENANT_SCOPE_MISSING",
    () => sealHeadteacherFeedbackAggregateSnapshot({
      cycleId: noTenantFixture.state.cycle.id,
      database: noTenantFixture.database,
    }),
  );

  const openFixture = makeDatabase(makeCycle({ status: "OPEN" }));
  await expectError(
    "HEADTEACHER_FEEDBACK_AGGREGATE_CONTRACT_CYCLE_NOT_CLOSED",
    () => sealHeadteacherFeedbackAggregateSnapshot({
      cycleId: openFixture.state.cycle.id,
      database: openFixture.database,
    }),
  );

  const raceFixture = makeDatabase(makeCycle(), { raceOnCreate: true });
  const race = await sealHeadteacherFeedbackAggregateSnapshot({
    cycleId: raceFixture.state.cycle.id,
    database: raceFixture.database,
  });
  assertEqual(race.outcome, "EXISTING_MATCH", "Concurrent race recovery");
  assert(raceFixture.state.concurrentSnapshot, "Concurrent snapshot missing");
  assertEqual(raceFixture.state.audits.length, 0, "Losing race must not audit");

  const resultText = JSON.stringify({ created, second, insufficient, race });
  assert(!resultText.includes(hash("a")), "Results must not expose response hash A");
  assert(!resultText.includes(hash("b")), "Results must not expose response hash B");
  assert(!resultText.includes("respondentUserId"), "Results must not expose identity fields");

  console.log("");
  console.log("=== D3.4E2B HEADTEACHER IMMUTABLE AGGREGATE SNAPSHOT ===");
  console.log("");
  console.log("Eligible lifecycle state       : CLOSED only");
  console.log("Minimum finalized responses    : 1");
  console.log("E2A calculation contract       : reused exactly");
  console.log("Snapshot version               : immutable version 1");
  console.log("Same-evidence retry            : EXISTING_MATCH");
  console.log("Changed-evidence retry         : fails closed");
  console.log("Concurrent create race         : recovered idempotently");
  console.log("Insufficient responses         : no snapshot written");
  console.log("N/A evidence                   : persisted denominator-safe");
  console.log("Audit                          : counts + source hash only");
  console.log("Respondent identity selection  : absent");
  console.log("Individual scores/hashes       : absent from audit/result");
  console.log("Cycle lifecycle transition     : absent");
  console.log("Director review start          : absent");
  console.log("Transaction                    : serializable and bounded");
  console.log("Notifications/providers        : absent");
  console.log("Database accessed              : false");
  console.log("");
  console.log("RESULT: D3.4E2B HEADTEACHER AGGREGATE SNAPSHOT GREEN");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
