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

function assertDeepEqual(actual, expected, message) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(message, { expected, actual });
  }
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

  const diagnostics = transpiled.diagnostics ?? [];
  if (diagnostics.length) {
    fail(
      `TypeScript transpilation diagnostics in ${filename}`,
      ts.formatDiagnosticsWithColorAndContext(diagnostics, {
        getCanonicalFileName: (fileName) => fileName,
        getCurrentDirectory: () => repoRoot,
        getNewLine: () => "\n",
      }),
    );
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
  const sectionPercentages = percentages(scores);
  const overallPercentage = Number(
    (
      Object.values(sectionPercentages).reduce((sum, value) => sum + value, 0) /
      Object.values(sectionPercentages).length
    ).toFixed(2),
  );
  return {
    status: "FINALIZED",
    response: {
      status: "FINALIZED",
      responseHash,
      overallPercentage,
      sectionPercentages,
      generalComment: null,
      scores,
    },
  };
}

function baseInput(participants) {
  return {
    cycleId: "cycle-headteacher-aggregate-001",
    cycleStatus: "CLOSED",
    workflow: "HEADTEACHER_CONFIDENTIAL_STAFF_FEEDBACK",
    instrumentCode: "HEADTEACHER_STAFF_FEEDBACK_V1",
    instrumentVersion: 1,
    instrumentDefinitionHash: hash("d"),
    minimumResponses: 1,
    participants,
  };
}

function expectFailure(calculate, input, code, message) {
  const result = calculate(input);
  assert(!result.ok, message, result);
  assertEqual(result.code, code, message);
}

function main() {
  const sourcePath = path.join(
    repoRoot,
    "src",
    "lib",
    "appraisals",
    "headteacherFeedbackAggregateContract.ts",
  );
  const source = fs.readFileSync(sourcePath, "utf8");
  const contract = require(sourcePath);
  const {
    HEADTEACHER_FEEDBACK_AGGREGATE_POLICY,
    calculateHeadteacherFeedbackAggregate,
  } = contract;

  assertEqual(HEADTEACHER_FEEDBACK_AGGREGATE_POLICY.expectedSectionCount, 4, "Section contract");
  assertEqual(HEADTEACHER_FEEDBACK_AGGREGATE_POLICY.expectedItemCount, 34, "Item contract");
  assertEqual(HEADTEACHER_FEEDBACK_AGGREGATE_POLICY.expectedRawMaximum, 170, "Raw maximum contract");
  assertDeepEqual(HEADTEACHER_FEEDBACK_AGGREGATE_POLICY.expectedSectionMaximums, [55, 45, 40, 30], "Section maximums");
  assertEqual(HEADTEACHER_FEEDBACK_AGGREGATE_POLICY.minimumFinalizedResponses, 1, "One-response minimum");
  assertEqual(HEADTEACHER_FEEDBACK_AGGREGATE_POLICY.commentsAllowed, false, "Comments forbidden");
  assertEqual(HEADTEACHER_FEEDBACK_AGGREGATE_POLICY.identityFieldsAllowed, false, "Identity fields forbidden");

  const first = finalizedParticipant(hash("a"), 5, "1.1");
  const second = finalizedParticipant(hash("b"), 3);
  const input = baseInput([
    first,
    second,
    { status: "EXPIRED", response: null },
    { status: "REVOKED", response: null },
  ]);
  const result = calculateHeadteacherFeedbackAggregate(input);
  assert(result.ok, "Ready aggregation failed", result);
  assertEqual(result.value.readiness, "READY", "Ready state");
  assert(result.value.snapshot, "Snapshot must exist");
  const snapshot = result.value.snapshot;
  assertEqual(snapshot.eligibleResponses, 4, "Eligible count");
  assertEqual(snapshot.finalizedResponses, 2, "Finalized count");
  assertEqual(snapshot.expiredResponses, 1, "Expired count");
  assertEqual(snapshot.revokedResponses, 1, "Revoked count");
  assertEqual(snapshot.itemAverages["1.1"], 3, "N/A excluded from item average");
  assertEqual(snapshot.itemEvidence["1.1"].applicableResponses, 1, "Applicable count");
  assertEqual(snapshot.itemEvidence["1.1"].notApplicableResponses, 1, "N/A count");
  assertEqual(snapshot.sectionAverages.S1, 80, "Section average");
  assertEqual(snapshot.sectionAverages.S4, 80, "Fourth section average");
  assertEqual(snapshot.overallPercentage, 80, "Overall average");
  assertEqual(snapshot.releaseEligible, true, "Aggregate readiness flag");
  assert(/^[a-f0-9]{64}$/.test(snapshot.sourceHash), "Source hash must be SHA-256");
  assertDeepEqual(
    snapshot.privacy,
    {
      containsRespondentIdentity: false,
      containsIndividualScores: false,
      containsResponseHashes: false,
      containsSubmissionTimestamps: false,
    },
    "Privacy contract",
  );
  assert(!JSON.stringify(snapshot).includes(hash("a")), "Response hashes must not be exposed");
  assert(!JSON.stringify(snapshot).includes(hash("b")), "Response hashes must not be exposed");

  const reversed = calculateHeadteacherFeedbackAggregate(
    baseInput([input.participants[3], input.participants[1], input.participants[2], input.participants[0]]),
  );
  assert(reversed.ok && reversed.value.snapshot, "Reordered aggregation failed", reversed);
  assertEqual(reversed.value.snapshot.sourceHash, snapshot.sourceHash, "Hash must be order independent");

  const insufficient = calculateHeadteacherFeedbackAggregate(
    baseInput([
      { status: "EXPIRED", response: null },
      { status: "REVOKED", response: null },
    ]),
  );
  assert(insufficient.ok, "Insufficient result must be truthful", insufficient);
  assertEqual(insufficient.value.readiness, "INSUFFICIENT_RESPONSES", "Insufficient state");
  assertEqual(insufficient.value.snapshot, null, "Insufficient cycle must not create snapshot contract");

  expectFailure(
    calculateHeadteacherFeedbackAggregate,
    { ...input, cycleStatus: "OPEN" },
    "CYCLE_NOT_CLOSED",
    "Open cycle must be rejected",
  );
  expectFailure(
    calculateHeadteacherFeedbackAggregate,
    { ...input, minimumResponses: 5 },
    "MINIMUM_RESPONSES_MISMATCH",
    "Director threshold must not leak into Headteacher feedback",
  );
  expectFailure(
    calculateHeadteacherFeedbackAggregate,
    baseInput([{ status: "IN_PROGRESS", response: first.response }]),
    "PARTICIPANT_STATUS_INVALID_AFTER_CLOSURE",
    "Unfinished participant must not survive closure",
  );
  expectFailure(
    calculateHeadteacherFeedbackAggregate,
    baseInput([{ status: "FINALIZED", response: null }]),
    "FINALIZED_PARTICIPANT_RESPONSE_MISSING",
    "Finalized participant requires evidence",
  );
  expectFailure(
    calculateHeadteacherFeedbackAggregate,
    baseInput([{ status: "EXPIRED", response: first.response }]),
    "FINALIZED_RESPONSE_PARTICIPANT_MISMATCH",
    "Finalized response cannot belong to expired participant",
  );

  const comment = finalizedParticipant(hash("c"), 4);
  comment.response.generalComment = "identity-risking comment";
  expectFailure(
    calculateHeadteacherFeedbackAggregate,
    baseInput([comment]),
    "FREE_TEXT_COMMENT_FORBIDDEN",
    "Comments must fail closed",
  );

  const duplicate = finalizedParticipant(hash("c"), 4);
  duplicate.response.scores[1] = { ...duplicate.response.scores[0] };
  expectFailure(
    calculateHeadteacherFeedbackAggregate,
    baseInput([duplicate]),
    "FINALIZED_RESPONSE_ITEM_DUPLICATE",
    "Duplicate item must fail closed",
  );

  const mismatch = finalizedParticipant(hash("e"), 4);
  mismatch.response.overallPercentage = 99;
  expectFailure(
    calculateHeadteacherFeedbackAggregate,
    baseInput([mismatch]),
    "FINALIZED_RESPONSE_PERCENTAGE_MISMATCH",
    "Stored percentage mismatch must fail closed",
  );

  const driftA = finalizedParticipant(hash("f"), 4);
  const driftB = finalizedParticipant(hash("1"), 4);
  driftB.response.scores[0].itemLabel = "Changed historical label";
  expectFailure(
    calculateHeadteacherFeedbackAggregate,
    baseInput([driftA, driftB]),
    "FINALIZED_RESPONSE_STRUCTURE_DRIFT",
    "Instrument structure drift must fail closed",
  );

  const duplicateHashA = finalizedParticipant(hash("2"), 4);
  const duplicateHashB = finalizedParticipant(hash("2"), 3);
  expectFailure(
    calculateHeadteacherFeedbackAggregate,
    baseInput([duplicateHashA, duplicateHashB]),
    "DUPLICATE_FINALIZED_RESPONSE_HASH",
    "Duplicate response evidence must fail closed",
  );

  const forbiddenSourceTokens = [
    "respondentUserId",
    "participantId",
    "teacherEmail",
    "teacherPhone",
    "submissionOrder",
    "finalizedAt:",
    "prisma.",
    "$transaction",
    "aggregateSnapshot.create",
  ];
  for (const token of forbiddenSourceTokens) {
    assert(!source.includes(token), `Forbidden aggregate-contract token: ${token}`);
  }

  console.log("");
  console.log("=== D3.4E2A HEADTEACHER STAFF-FEEDBACK AGGREGATE CONTRACT ===");
  console.log("");
  console.log("Eligible lifecycle state       : CLOSED only");
  console.log("Minimum finalized responses    : 1");
  console.log("Director threshold inheritance : forbidden");
  console.log("Official form                  : 4 sections / 34 items");
  console.log("Section maximums               : 55 / 45 / 40 / 30");
  console.log("Finalized responses only       : verified");
  console.log("N/A item denominator           : excluded");
  console.log("Section calculation            : respondent percentage average");
  console.log("Overall calculation            : four-section average");
  console.log("Stored score verification      : recomputed and compared");
  console.log("Instrument structure drift     : fails closed");
  console.log("Insufficient responses         : no snapshot contract");
  console.log("Snapshot source proof          : deterministic SHA-256");
  console.log("Respondent identities          : absent");
  console.log("Individual scores/hashes       : absent from output");
  console.log("Database/transaction           : absent");
  console.log("Database accessed              : false");
  console.log("");
  console.log("RESULT: D3.4E2A HEADTEACHER AGGREGATE CONTRACT GREEN");
}

main();
