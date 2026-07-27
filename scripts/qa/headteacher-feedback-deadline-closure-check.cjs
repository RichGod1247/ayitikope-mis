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
    return;
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
    fail("D3_4E1_TYPESCRIPT_TRANSPILE_FAILED", {
      filename,
      diagnostics: errors.map((diagnostic) =>
        ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
      ),
    });
  }

  module._compile(transpiled.outputText, filename);
};

function makeCycle(overrides = {}) {
  return {
    id: "cycle-headteacher-feedback-close",
    status: "OPEN",
    targetUserId: "headteacher-user-one",
    targetTenantId: "school-one",
    targetRoleSnapshot: "HEADTEACHER",
    openedAt: new Date("2026-07-20T12:00:00.000Z"),
    deadlineAt: new Date("2026-07-27T12:00:00.000Z"),
    closedAt: null,
    closedByUserId: null,
    minimumResponses: 1,
    responseWindowDays: 7,
    identityVisibility: "DIRECTOR_ONLY",
    metadata: {
      workflow: "HEADTEACHER_CONFIDENTIAL_STAFF_FEEDBACK",
    },
    instrumentVersion: {
      id: "instrument-version-headteacher-feedback-v1",
      version: 1,
      status: "ACTIVE",
      instrument: {
        code: "HEADTEACHER_STAFF_FEEDBACK_V1",
        isActive: true,
      },
    },
    participants: [
      {
        id: "participant-finalized",
        status: "FINALIZED",
        finalizedAt: new Date("2026-07-26T10:00:00.000Z"),
        expiredAt: null,
        response: {
          id: "response-finalized",
          status: "FINALIZED",
          finalizedAt: new Date("2026-07-26T10:00:00.000Z"),
          responseHash: "a".repeat(64),
        },
      },
      {
        id: "participant-in-progress",
        status: "IN_PROGRESS",
        finalizedAt: null,
        expiredAt: null,
        response: {
          id: "response-draft",
          status: "DRAFT",
          finalizedAt: null,
          responseHash: null,
        },
      },
      {
        id: "participant-not-started",
        status: "NOT_STARTED",
        finalizedAt: null,
        expiredAt: null,
        response: null,
      },
      {
        id: "participant-revoked",
        status: "REVOKED",
        finalizedAt: null,
        expiredAt: null,
        response: null,
      },
    ],
    ...overrides,
  };
}

function makeDatabase(cycleInput) {
  const state = {
    cycle: clone(cycleInput),
    audits: [],
    transactionOptions: [],
    cycleUpdateCalls: 0,
    participantUpdateManyCalls: 0,
  };

  const tx = {
    appraisalCycle: {
      async findUnique() {
        return clone(state.cycle);
      },
      async update(args) {
        state.cycleUpdateCalls += 1;
        if (state.cycle.status !== args.where.status) {
          throw Object.assign(new Error("RACE"), { code: "RACE" });
        }
        state.cycle.status = args.data.status;
        state.cycle.closedAt = args.data.closedAt;
        state.cycle.closedByUserId = args.data.closedByUserId;
        state.cycle.metadata = clone(args.data.metadata);
        return {
          id: state.cycle.id,
          status: state.cycle.status,
          closedAt: state.cycle.closedAt,
          deadlineAt: state.cycle.deadlineAt,
          minimumResponses: state.cycle.minimumResponses,
          metadata: clone(state.cycle.metadata),
        };
      },
    },
    appraisalParticipant: {
      async updateMany(args) {
        state.participantUpdateManyCalls += 1;
        let count = 0;
        for (const participant of state.cycle.participants) {
          if (args.where.status.in.includes(participant.status)) {
            participant.status = args.data.status;
            participant.expiredAt = args.data.expiredAt;
            count += 1;
          }
        }
        return { count };
      },
    },
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
      ...tx,
      async $transaction(operation, options) {
        state.transactionOptions.push(clone(options));
        const snapshot = clone(state);
        try {
          return await operation(tx);
        } catch (error) {
          state.cycle = snapshot.cycle;
          state.audits = snapshot.audits;
          state.cycleUpdateCalls = snapshot.cycleUpdateCalls;
          state.participantUpdateManyCalls = snapshot.participantUpdateManyCalls;
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
    "headteacherFeedbackDeadlineClosure.ts",
  );
  const source = fs.readFileSync(sourcePath, "utf8");

  assert(
    source.includes('closureMode: "SYSTEM_DEADLINE"'),
    "System deadline mode missing",
  );
  assert(
    source.includes(
      "prisma as unknown as HeadteacherFeedbackDeadlineClosureDatabase",
    ),
    "Prisma client must be narrowed to the injected deadline-closure database contract",
  );
  assert(
    source.includes(
      "tx: HeadteacherFeedbackDeadlineClosureTransactionClient",
    ),
    "Deadline-closure transaction callback must remain explicitly typed",
  );
  assert(
    !source.includes("sendSms") &&
      !source.includes("sendEmail") &&
      !source.includes("notification.create"),
    "Notification/provider code must be absent",
  );
  assert(
    !source.includes("aggregateSnapshot.create") &&
      !source.includes('status: "UNDER_REVIEW"'),
    "Aggregate/review start must be absent from D3.4E1",
  );

  const moduleUnderTest = require(sourcePath);
  const close = moduleUnderTest.closeExpiredHeadteacherFeedbackCycle;

  const now = new Date("2026-07-27T12:00:00.000Z");
  const fixture = makeDatabase(makeCycle());
  const result = await close({
    cycleId: fixture.state.cycle.id,
    now,
    reqId: "deadline-run-1",
    database: fixture.database,
  });

  assertEqual(result.outcome, "CLOSED", "Closure outcome");
  assertEqual(result.status, "CLOSED", "Closed status");
  assertEqual(result.finalizedResponseCount, 1, "Finalized response count");
  assertEqual(result.expiredParticipantCount, 2, "Expired participant count");
  assertEqual(result.revokedParticipantCount, 1, "Revoked participant count");
  assertEqual(result.reviewReadiness, "READY", "Review readiness");
  assertEqual(fixture.state.cycle.status, "CLOSED", "Cycle persisted closed");
  assertEqual(
    fixture.state.cycle.closedAt.toISOString(),
    now.toISOString(),
    "Closure timestamp",
  );
  assertEqual(
    fixture.state.cycle.closedByUserId,
    null,
    "Automatic closure has no human closer",
  );
  assertEqual(fixture.state.audits.length, 1, "One closure audit");
  assertEqual(
    fixture.state.audits[0].action,
    "APPRAISAL_CYCLE_CLOSED",
    "Closure audit action",
  );
  assertEqual(
    fixture.state.audits[0].metadata.respondentIdentityCopiedIntoAudit,
    false,
    "Respondent identity excluded",
  );
  assertEqual(
    fixture.state.audits[0].metadata.scoreValuesRecordedInAudit,
    false,
    "Score values excluded",
  );
  assert(
    !JSON.stringify(fixture.state.audits[0]).includes("participant-finalized"),
    "Participant IDs leaked into closure audit",
  );
  assertEqual(
    fixture.state.transactionOptions[0].isolationLevel,
    "Serializable",
    "Serializable transaction",
  );
  assertEqual(
    fixture.state.transactionOptions[0].maxWait,
    5000,
    "Transaction max wait",
  );
  assertEqual(
    fixture.state.transactionOptions[0].timeout,
    30000,
    "Transaction timeout",
  );

  const retry = await close({
    cycleId: fixture.state.cycle.id,
    now: new Date("2026-07-27T13:00:00.000Z"),
    database: fixture.database,
  });
  assertEqual(retry.outcome, "EXISTING_CLOSED", "Closure retry outcome");
  assertEqual(fixture.state.audits.length, 1, "Retry creates no audit");
  assertEqual(fixture.state.cycleUpdateCalls, 1, "Retry creates no cycle update");

  const tooEarly = makeDatabase(makeCycle());
  await expectError("HEADTEACHER_FEEDBACK_CLOSURE_DEADLINE_NOT_REACHED", () =>
    close({
      cycleId: tooEarly.state.cycle.id,
      now: new Date("2026-07-27T11:59:59.999Z"),
      database: tooEarly.database,
    }),
  );
  assertEqual(tooEarly.state.cycle.status, "OPEN", "Early cycle unchanged");
  assertEqual(tooEarly.state.audits.length, 0, "Early closure has no audit");

  const zeroFinalizedCycle = makeCycle({
    participants: [
      {
        id: "participant-zero-one",
        status: "NOT_STARTED",
        finalizedAt: null,
        expiredAt: null,
        response: null,
      },
      {
        id: "participant-zero-two",
        status: "IN_PROGRESS",
        finalizedAt: null,
        expiredAt: null,
        response: {
          id: "response-zero-draft",
          status: "DRAFT",
          finalizedAt: null,
          responseHash: null,
        },
      },
    ],
  });
  const zeroFinalized = makeDatabase(zeroFinalizedCycle);
  const zeroResult = await close({
    cycleId: zeroFinalized.state.cycle.id,
    now,
    database: zeroFinalized.database,
  });
  assertEqual(
    zeroResult.reviewReadiness,
    "INSUFFICIENT_RESPONSES",
    "Zero-response cycle closes truthfully",
  );
  assertEqual(zeroResult.expiredParticipantCount, 2, "All unfinished expired");

  const inconsistent = makeDatabase(
    makeCycle({
      participants: [
        {
          id: "participant-inconsistent",
          status: "FINALIZED",
          finalizedAt: null,
          expiredAt: null,
          response: null,
        },
      ],
    }),
  );
  await expectError(
    "HEADTEACHER_FEEDBACK_CLOSURE_FINALIZED_EVIDENCE_INVALID",
    () =>
      close({
        cycleId: inconsistent.state.cycle.id,
        now,
        database: inconsistent.database,
      }),
  );
  assertEqual(
    inconsistent.state.cycle.status,
    "OPEN",
    "Inconsistent cycle rolls back",
  );

  const pending = makeDatabase(makeCycle({ status: "PENDING_APPROVAL" }));
  await expectError("HEADTEACHER_FEEDBACK_CLOSURE_OPEN_CYCLE_REQUIRED", () =>
    close({
      cycleId: pending.state.cycle.id,
      now,
      database: pending.database,
    }),
  );

  const advanced = makeDatabase(
    makeCycle({
      status: "UNDER_REVIEW",
      closedAt: new Date("2026-07-27T12:00:00.000Z"),
      participants: [
        {
          id: "participant-advanced-finalized",
          status: "FINALIZED",
          finalizedAt: new Date("2026-07-26T10:00:00.000Z"),
          expiredAt: null,
          response: {
            id: "response-advanced-finalized",
            status: "FINALIZED",
            finalizedAt: new Date("2026-07-26T10:00:00.000Z"),
            responseHash: "b".repeat(64),
          },
        },
      ],
    }),
  );
  const advancedResult = await close({
    cycleId: advanced.state.cycle.id,
    now,
    database: advanced.database,
  });
  assertEqual(advancedResult.outcome, "ALREADY_ADVANCED", "Advanced idempotency");
  assertEqual(advanced.state.audits.length, 0, "Advanced retry has no audit");

  console.log("");
  console.log("=== D3.4E1 HEADTEACHER FEEDBACK DEADLINE CLOSURE ===");
  console.log("");
  console.log("Closure trigger                 : deadline reached or passed");
  console.log("Eligible lifecycle state        : OPEN only");
  console.log("Finalized responses             : preserved");
  console.log("Not-started/in-progress teachers: expired atomically");
  console.log("Revoked participants            : preserved");
  console.log("Minimum-response readiness      : READY / INSUFFICIENT_RESPONSES");
  console.log("Zero-response deadline          : closes truthfully");
  console.log("Closure retry                   : EXISTING_CLOSED");
  console.log("Advanced-cycle retry            : ALREADY_ADVANCED");
  console.log("Evidence inconsistency          : fails closed and rolls back");
  console.log("Closure audit                   : aggregate counts only");
  console.log("Respondent identities/scores    : absent");
  console.log("Transaction                     : serializable and bounded");
  console.log("Notifications/providers         : absent");
  console.log("Aggregate/review start          : absent");
  console.log("Database accessed               : false");
  console.log("");
  console.log("RESULT: D3.4E1 HEADTEACHER FEEDBACK DEADLINE CLOSURE GREEN");
}

main().catch((error) => {
  console.error(error?.stack ?? error);
  process.exit(1);
});
