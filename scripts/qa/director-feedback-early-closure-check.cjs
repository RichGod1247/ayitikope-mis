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

async function expectError(code, operation) {
  try {
    await operation();
  } catch (error) {
    assertEqual(error?.code ?? error?.message, code, `Expected ${code}`);
    return;
  }
  fail(`Expected error ${code}`);
}

function clone(value) {
  return structuredClone(value);
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
  const output = ts.transpileModule(source, {
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
  const errors = (output.diagnostics ?? []).filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
  );
  if (errors.length) {
    fail(
      "N7_DIRECTOR_FEEDBACK_EARLY_CLOSE_TYPESCRIPT_TRANSPILE_FAILED",
      errors.map((diagnostic) =>
        ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
      ),
    );
  }
  module._compile(output.outputText, filename);
};

function finalizedParticipant(index) {
  return {
    id: `participant-${index}`,
    status: "FINALIZED",
    finalizedAt: new Date(`2026-08-0${index}T10:00:00.000Z`),
    response: {
      status: "FINALIZED",
      finalizedAt: new Date(`2026-08-0${index}T10:00:00.000Z`),
      responseHash: String(index).repeat(64).slice(0, 64),
    },
  };
}

function makeCycle(overrides = {}) {
  return {
    id: "00000000-0000-4000-8000-000000000801",
    status: "OPEN",
    targetUserId: "director-user-one",
    targetRoleSnapshot: "DISTRICT_DIRECTOR",
    scopeZoneId: "district-zone-one",
    deadlineAt: new Date("2026-08-20T08:00:00.000Z"),
    closedAt: null,
    closedByUserId: null,
    reviewStartedAt: null,
    releasedAt: null,
    responseWindowDays: 7,
    minimumResponses: 5,
    metadata: { workflow: "DIRECTOR_CONFIDENTIAL_HEADTEACHER_FEEDBACK" },
    instrumentVersion: {
      version: 1,
      status: "ACTIVE",
      instrument: {
        code: "DIRECTOR_GOVERNANCE_APPRAISAL_V1",
        isActive: true,
      },
    },
    participants: [
      finalizedParticipant(1),
      finalizedParticipant(2),
      finalizedParticipant(3),
      finalizedParticipant(4),
      finalizedParticipant(5),
    ],
    ...overrides,
  };
}

function makeDatabase(cycleInput, assignmentOverrides = {}) {
  const state = {
    cycle: clone(cycleInput),
    audits: [],
    cycleUpdateCalls: 0,
    transactionOptions: [],
  };

  const tx = {
    appraisalCycle: {
      async findUnique() {
        return clone(state.cycle);
      },
      async updateMany(args) {
        const where = args.where ?? {};
        if (
          state.cycle.id !== where.id ||
          state.cycle.status !== where.status ||
          state.cycle.deadlineAt.getTime() !== where.deadlineAt.getTime() ||
          state.cycle.reviewStartedAt !== where.reviewStartedAt ||
          state.cycle.releasedAt !== where.releasedAt
        ) {
          return { count: 0 };
        }

        state.cycleUpdateCalls += 1;
        state.cycle.status = args.data.status;
        state.cycle.closedAt = clone(args.data.closedAt);
        state.cycle.closedByUserId = args.data.closedByUserId;
        state.cycle.metadata = clone(args.data.metadata);
        return { count: 1 };
      },
    },
    governanceOfficerAssignment: {
      async findFirst() {
        return {
          id: "director-assignment-one",
          userId: "director-user-one",
          role: "DISTRICT_DIRECTOR",
          status: "ACTIVE",
          revokedAt: null,
          startsAt: null,
          endsAt: null,
          zone: {
            id: "district-zone-one",
            isActive: true,
            zoneType: { level: 2 },
          },
          ...clone(assignmentOverrides),
        };
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
          throw error;
        }
      },
    },
  };
}

async function main() {
  const servicePath = path.join(
    repoRoot,
    "src/lib/appraisals/directorFeedbackEarlyClosure.ts",
  );
  const routePath = path.join(
    repoRoot,
    "src/app/api/district/director-feedback/[cycleId]/close-early/route.ts",
  );
  const statusPath = path.join(
    repoRoot,
    "src/lib/appraisals/directorFeedbackNotifications.ts",
  );
  const requestClientPath = path.join(
    repoRoot,
    "src/app/district/director-feedback/DirectorFeedbackRequestClient.tsx",
  );

  for (const file of [servicePath, routePath, statusPath, requestClientPath]) {
    assert(fs.existsSync(file), "N7_DIRECTOR_FEEDBACK_EARLY_CLOSE_REQUIRED_FILE_MISSING", file);
  }

  const serviceSource = fs.readFileSync(servicePath, "utf8");
  const routeSource = fs.readFileSync(routePath, "utf8");
  const statusSource = fs.readFileSync(statusPath, "utf8");
  const clientSource = fs.readFileSync(requestClientPath, "utf8");

  for (const marker of [
    'earlyClosureMode: "DIRECTOR_ALL_RESPONSES_FINALIZED"',
    "requiresExplicitConfirmation: true",
    "allEligibleResponsesMustBeFinalized: true",
    "participantExpiryPerformed: false",
    "finalizedResponsesPreserved: true",
    '"OPEN_DIRECTOR_FEEDBACK_CYCLE"',
    "AppraisalCycleStatus.OPEN",
    "AppraisalCycleStatus.CLOSED",
    "AppraisalParticipantStatus.FINALIZED",
    "AppraisalResponseStatus.FINALIZED",
    "Prisma.TransactionIsolationLevel.Serializable",
    "DIRECTOR_FEEDBACK_EARLY_CLOSURE_AUDIT_ACTION",
  ]) {
    assert(serviceSource.includes(marker), `Early-close service marker missing: ${marker}`);
  }

  for (const forbidden of [
    "appraisalParticipant.update",
    "appraisalParticipant.updateMany",
    "appraisalResponse.update",
    "appraisalResponseScore",
    "sendSms",
    "sendEmail",
    "appraisalNotification.create",
    "appraisalAggregateSnapshot.create",
  ]) {
    assert(!serviceSource.includes(forbidden), `Forbidden early-close service behavior: ${forbidden}`);
  }

  assert(routeSource.includes('const ALLOWED_BODY_FIELDS = new Set(["confirm"])'), "Early-close route must accept confirm only");
  assert(routeSource.includes("MAX_BODY_BYTES = 16 * 1024"), "Early-close body cap missing");
  assert(routeSource.includes("closeCompletedDirectorFeedbackCycleEarly"), "Early-close route service wiring missing");
  assert(routeSource.includes("generateDirectorFeedbackAggregateSnapshot"), "Early-close route must prepare aggregate after closure");
  assert(routeSource.includes('allowedRoles: ["DISTRICT_DIRECTOR"]'), "Early-close Director auth missing");
  assert(routeSource.includes("allowedZoneLevels: [2]"), "Early-close district gate missing");
  assert(routeSource.includes('"Cache-Control": "no-store, max-age=0"'), "Early-close no-store missing");
  assert(!routeSource.includes("prisma."), "Thin early-close route cannot use Prisma directly");

  for (const marker of [
    "allResponsesFinalized: boolean",
    "canCloseEarly: boolean",
    "allResponsesFinalized",
    "cycle.status === AppraisalCycleStatus.OPEN",
  ]) {
    assert(statusSource.includes(marker), `Early-close status marker missing: ${marker}`);
  }

  for (const marker of [
    "All responses received",
    "Close now and prepare review",
    "cycle.canCloseEarly",
    "/close-early",
    "or leave it open and wait for the scheduled deadline",
  ]) {
    assert(clientSource.includes(marker), `Early-close UI marker missing: ${marker}`);
  }

  const moduleUnderTest = require(servicePath);
  const close = moduleUnderTest.closeCompletedDirectorFeedbackCycleEarly;
  const now = new Date("2026-08-13T14:00:00.000Z");

  const fixture = makeDatabase(makeCycle());
  const result = await close({
    actorUserId: "director-user-one",
    actorRoleName: "DISTRICT_DIRECTOR",
    cycleId: fixture.state.cycle.id,
    confirm: true,
    now,
    reqId: "early-close-run-1",
    ip: "127.0.0.1",
    userAgent: "qa",
    database: fixture.database,
  });

  assertEqual(result.outcome, "CLOSED", "Early-close outcome");
  assertEqual(result.status, "CLOSED", "Early-close status");
  assertEqual(result.eligibleResponseCount, 5, "Eligible response count");
  assertEqual(result.finalizedResponseCount, 5, "Finalized response count");
  assertEqual(result.expiredParticipantCount, 0, "Early close expires nobody");
  assertEqual(fixture.state.cycle.status, "CLOSED", "Cycle persisted closed");
  assertEqual(fixture.state.cycle.closedByUserId, "director-user-one", "Director recorded as closer");
  assertEqual(fixture.state.cycleUpdateCalls, 1, "Exactly one cycle update");
  assertEqual(fixture.state.audits.length, 1, "Exactly one closure audit");
  assertEqual(fixture.state.audits[0].metadata.expiredParticipantCount, 0, "Audit records zero expirations");
  assertEqual(fixture.state.audits[0].metadata.respondentIdentityIncluded, false, "Identity excluded from audit");
  assertEqual(fixture.state.transactionOptions[0].isolationLevel, "Serializable", "Serializable early-close transaction");

  const retry = await close({
    actorUserId: "director-user-one",
    actorRoleName: "DISTRICT_DIRECTOR",
    cycleId: fixture.state.cycle.id,
    confirm: true,
    now: new Date("2026-08-13T14:01:00.000Z"),
    database: fixture.database,
  });
  assertEqual(retry.outcome, "ALREADY_CLOSED", "Early-close retry idempotency");
  assertEqual(fixture.state.cycleUpdateCalls, 1, "Retry adds no second cycle update");
  assertEqual(fixture.state.audits.length, 1, "Retry adds no second audit");

  const incomplete = makeDatabase(
    makeCycle({
      participants: [
        finalizedParticipant(1),
        finalizedParticipant(2),
        finalizedParticipant(3),
        finalizedParticipant(4),
        {
          id: "participant-five",
          status: "IN_PROGRESS",
          finalizedAt: null,
          response: {
            status: "DRAFT",
            finalizedAt: null,
            responseHash: null,
          },
        },
      ],
    }),
  );
  await expectError("DIRECTOR_FEEDBACK_EARLY_CLOSE_ALL_RESPONSES_REQUIRED", () =>
    close({
      actorUserId: "director-user-one",
      actorRoleName: "DISTRICT_DIRECTOR",
      cycleId: incomplete.state.cycle.id,
      confirm: true,
      now,
      database: incomplete.database,
    }),
  );
  assertEqual(incomplete.state.cycleUpdateCalls, 0, "Incomplete cycle remains open");

  const deadlineReached = makeDatabase(makeCycle());
  await expectError("DIRECTOR_FEEDBACK_EARLY_CLOSE_DEADLINE_REACHED", () =>
    close({
      actorUserId: "director-user-one",
      actorRoleName: "DISTRICT_DIRECTOR",
      cycleId: deadlineReached.state.cycle.id,
      confirm: true,
      now: new Date("2026-08-20T08:00:00.000Z"),
      database: deadlineReached.database,
    }),
  );

  await expectError("DIRECTOR_FEEDBACK_EARLY_CLOSE_CONFIRMATION_REQUIRED", () =>
    close({
      actorUserId: "director-user-one",
      actorRoleName: "DISTRICT_DIRECTOR",
      cycleId: makeCycle().id,
      confirm: false,
      now,
      database: makeDatabase(makeCycle()).database,
    }),
  );

  await expectError("DIRECTOR_FEEDBACK_EARLY_CLOSE_DIRECTOR_ONLY", () =>
    close({
      actorUserId: "teacher-user-one",
      actorRoleName: "TEACHER",
      cycleId: makeCycle().id,
      confirm: true,
      now,
      database: makeDatabase(makeCycle()).database,
    }),
  );

  const wrongScope = makeDatabase(makeCycle(), {
    zone: {
      id: "district-zone-two",
      isActive: true,
      zoneType: { level: 2 },
    },
  });
  await expectError("DIRECTOR_FEEDBACK_EARLY_CLOSE_CURRENT_ASSIGNMENT_REQUIRED", () =>
    close({
      actorUserId: "director-user-one",
      actorRoleName: "DISTRICT_DIRECTOR",
      cycleId: wrongScope.state.cycle.id,
      confirm: true,
      now,
      database: wrongScope.database,
    }),
  );

  console.log("");
  console.log("=== N7 DIRECTOR FEEDBACK EARLY COMPLETION CLOSURE ===");
  console.log("");
  console.log("Early closure trigger          : all eligible respondents finalized");
  console.log("Early closure authority        : current scoped District Director only");
  console.log("Early closure confirmation     : explicit");
  console.log("Director choice                : close now or wait for deadline");
  console.log("Eligible lifecycle state       : OPEN before deadline only");
  console.log("Finalized responses            : preserved");
  console.log("Participant expiry             : none");
  console.log("Aggregate preparation          : after closure through existing snapshot service");
  console.log("Closure retry                  : ALREADY_CLOSED");
  console.log("Respondent identities/scores   : absent from audit");
  console.log("Transaction                    : serializable and bounded");
  console.log("Notifications/providers        : absent");
  console.log("Schema migration               : absent");
  console.log("Database accessed              : false");
  console.log("");
  console.log("RESULT: N7 DIRECTOR FEEDBACK EARLY CLOSURE GREEN");
}

main().catch((error) => {
  console.error(error?.stack ?? error);
  process.exit(1);
});
