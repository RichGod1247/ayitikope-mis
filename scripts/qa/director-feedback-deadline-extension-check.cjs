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
      "N7_DIRECTOR_FEEDBACK_EXTENSION_TYPESCRIPT_TRANSPILE_FAILED",
      errors.map((diagnostic) =>
        ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
      ),
    );
  }
  module._compile(output.outputText, filename);
};

function makeCycle(overrides = {}) {
  return {
    id: "00000000-0000-4000-8000-000000000701",
    status: "CLOSED",
    targetUserId: "director-user-one",
    targetRoleSnapshot: "DISTRICT_DIRECTOR",
    scopeZoneId: "district-zone-one",
    openedAt: new Date("2026-08-01T08:00:00.000Z"),
    deadlineAt: new Date("2026-08-08T08:00:00.000Z"),
    closedAt: new Date("2026-08-08T08:01:00.000Z"),
    closedByUserId: null,
    reviewStartedAt: null,
    releasedAt: null,
    responseWindowDays: 7,
    minimumResponses: 5,
    extensionCount: 0,
    metadata: {
      workflow: "DIRECTOR_CONFIDENTIAL_HEADTEACHER_FEEDBACK",
      deadlineClosure: {
        actor: "SYSTEM_DEADLINE_WORKER",
        occurredAt: "2026-08-08T08:01:00.000Z",
      },
    },
    instrumentVersion: {
      version: 1,
      status: "ACTIVE",
      instrument: {
        code: "DIRECTOR_GOVERNANCE_APPRAISAL_V1",
        isActive: true,
      },
    },
    participants: [
      {
        status: "EXPIRED",
        startedAt: null,
        finalizedAt: null,
        expiredAt: new Date("2026-08-08T08:01:00.000Z"),
      },
      {
        status: "EXPIRED",
        startedAt: new Date("2026-08-05T10:00:00.000Z"),
        finalizedAt: null,
        expiredAt: new Date("2026-08-08T08:01:00.000Z"),
      },
      {
        status: "FINALIZED",
        startedAt: new Date("2026-08-04T09:00:00.000Z"),
        finalizedAt: new Date("2026-08-06T09:00:00.000Z"),
        expiredAt: null,
      },
    ],
    aggregates: [
      {
        version: 1,
        sourceHash: "a".repeat(64),
      },
    ],
    ...overrides,
  };
}

function makeDatabase(cycleInput, assignmentOverrides = {}) {
  const state = {
    cycle: clone(cycleInput),
    audits: [],
    cycleUpdateCalls: 0,
    participantUpdateCalls: 0,
    transactionOptions: [],
  };

  function matchesParticipant(participant, where) {
    if (where.cycleId && where.cycleId !== state.cycle.id) return false;
    if (where.status && participant.status !== where.status) return false;
    if (where.finalizedAt === null && participant.finalizedAt !== null) return false;
    if (where.startedAt === null && participant.startedAt !== null) return false;
    if (where.startedAt?.not === null && participant.startedAt === null) return false;
    return true;
  }

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
          state.cycle.extensionCount !== where.extensionCount ||
          state.cycle.deadlineAt.getTime() !== where.deadlineAt.getTime() ||
          state.cycle.reviewStartedAt !== where.reviewStartedAt ||
          state.cycle.releasedAt !== where.releasedAt
        ) {
          return { count: 0 };
        }

        state.cycleUpdateCalls += 1;
        const data = args.data;
        state.cycle.status = data.status;
        state.cycle.deadlineAt = clone(data.deadlineAt);
        state.cycle.extensionCount += data.extensionCount.increment;
        state.cycle.closedAt = data.closedAt;
        state.cycle.closedByUserId = data.closedByUserId;
        state.cycle.metadata = clone(data.metadata);
        return { count: 1 };
      },
    },
    appraisalParticipant: {
      async updateMany(args) {
        state.participantUpdateCalls += 1;
        let count = 0;
        for (const participant of state.cycle.participants) {
          if (!matchesParticipant(participant, args.where ?? {})) continue;
          Object.assign(participant, clone(args.data));
          count += 1;
        }
        return { count };
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
          state.participantUpdateCalls = snapshot.participantUpdateCalls;
          throw error;
        }
      },
    },
  };
}

async function main() {
  const servicePath = path.join(
    repoRoot,
    "src/lib/appraisals/directorFeedbackDeadlineExtension.ts",
  );
  const routePath = path.join(
    repoRoot,
    "src/app/api/district/director-feedback/[cycleId]/extend-feedback/route.ts",
  );
  const statusPath = path.join(
    repoRoot,
    "src/lib/appraisals/directorFeedbackNotifications.ts",
  );
  const requestClientPath = path.join(
    repoRoot,
    "src/app/district/director-feedback/DirectorFeedbackRequestClient.tsx",
  );
  const reviewClientPath = path.join(
    repoRoot,
    "src/app/district/director-feedback/review/DirectorFeedbackReviewClient.tsx",
  );
  const closurePath = path.join(
    repoRoot,
    "src/lib/appraisals/directorFeedbackClosure.ts",
  );
  const authorityPath = path.join(repoRoot, "src/lib/appraisals/authority.ts");

  for (const file of [
    servicePath,
    routePath,
    statusPath,
    requestClientPath,
    reviewClientPath,
    closurePath,
    authorityPath,
  ]) {
    assert(fs.existsSync(file), "N7_DIRECTOR_FEEDBACK_EXTENSION_REQUIRED_FILE_MISSING", file);
  }

  const serviceSource = fs.readFileSync(servicePath, "utf8");
  const routeSource = fs.readFileSync(routePath, "utf8");
  const statusSource = fs.readFileSync(statusPath, "utf8");
  const requestClientSource = fs.readFileSync(requestClientPath, "utf8");
  const reviewClientSource = fs.readFileSync(reviewClientPath, "utf8");
  const closureSource = fs.readFileSync(closurePath, "utf8");
  const authoritySource = fs.readFileSync(authorityPath, "utf8");

  for (const marker of [
    'extensionMode: "DIRECTOR_EXPIRED_WINDOW_RECOVERY"',
    "maximumExtensionsPerCycle: 1",
    "preservesParticipantSet: true",
    "preservesSavedResponses: true",
    "preservesFinalizedResponses: true",
    "preservesPriorAggregateSnapshots: true",
    "restoresExpiredParticipants: true",
    '"OPEN_DIRECTOR_FEEDBACK_CYCLE"',
    "AppraisalCycleStatus.CLOSED",
    "AppraisalCycleStatus.OPEN",
    "AppraisalParticipantStatus.EXPIRED",
    "AppraisalParticipantStatus.NOT_STARTED",
    "AppraisalParticipantStatus.IN_PROGRESS",
    "Prisma.TransactionIsolationLevel.Serializable",
    "DIRECTOR_FEEDBACK_DEADLINE_EXTENSION_AUDIT_ACTION",
  ]) {
    assert(serviceSource.includes(marker), `Service marker missing: ${marker}`);
  }

  for (const forbidden of [
    '"EXTEND_DIRECTOR_FEEDBACK_CYCLE"',
    "appraisalAggregateSnapshot.delete",
    "appraisalAggregateSnapshot.deleteMany",
    "appraisalResponse.update",
    "appraisalResponseScore",
    "sendSms",
    "sendEmail",
    "appraisalNotification.create",
  ]) {
    assert(!serviceSource.includes(forbidden), `Forbidden service behavior: ${forbidden}`);
  }

  assert(
    routeSource.includes('const ALLOWED_BODY_FIELDS = new Set(["confirm"])'),
    "Extension route must accept confirm only",
  );
  assert(routeSource.includes("MAX_BODY_BYTES = 16 * 1024"), "16 KiB body cap missing");
  assert(routeSource.includes("extendExpiredDirectorFeedbackCycle"), "Route wiring missing");
  assert(routeSource.includes('allowedRoles: ["DISTRICT_DIRECTOR"]'), "Director auth missing");
  assert(routeSource.includes("allowedZoneLevels: [2]"), "District zone gate missing");
  assert(routeSource.includes('"Cache-Control": "no-store, max-age=0"'), "No-store missing");
  assert(!routeSource.includes("prisma."), "Thin route cannot use Prisma directly");

  for (const marker of [
    "expiredResponses: number",
    "canExtendFeedbackWindow: boolean",
    "AppraisalParticipantStatus.EXPIRED",
    "cycle.extensionCount === 0",
  ]) {
    assert(statusSource.includes(marker), `Status marker missing: ${marker}`);
  }

  for (const marker of [
    "Extend feedback 7 days",
    "Feedback deadline reached",
    "cycle.canExtendFeedbackWindow",
    "/extend-feedback",
    "give unfinished respondents 7 more days once",
  ]) {
    assert(requestClientSource.includes(marker), `Request UI marker missing: ${marker}`);
  }
  assert(!requestClientSource.includes("Director cannot extend it"), "Stale request policy copy remains");
  assert(
    !reviewClientSource.includes("The Director cannot\n                extend or reopen this cycle"),
    "Stale review policy copy remains",
  );

  assert(
    closureSource.includes("AppraisalCycleStatus.OPEN") &&
      closureSource.includes("AppraisalCycleStatus.CLOSED") &&
      closureSource.includes("AppraisalParticipantStatus.EXPIRED"),
    "Existing deadline closure must remain intact",
  );
  assert(
    authoritySource.includes('"OPEN_DIRECTOR_FEEDBACK_CYCLE"') &&
      authoritySource.includes('"EXTEND_DIRECTOR_FEEDBACK_CYCLE"'),
    "Existing broad capability separation missing",
  );

  const authority = require(authorityPath);
  assert(
    authority.hasAppraisalCapability(
      "DISTRICT_DIRECTOR",
      "OPEN_DIRECTOR_FEEDBACK_CYCLE",
    ),
    "Director must retain own-cycle opening authority",
  );
  assert(
    !authority.hasAppraisalCapability(
      "DISTRICT_DIRECTOR",
      "EXTEND_DIRECTOR_FEEDBACK_CYCLE",
    ),
    "Broad Director extend/reopen capability must remain forbidden",
  );

  const moduleUnderTest = require(servicePath);
  const extend = moduleUnderTest.extendExpiredDirectorFeedbackCycle;
  const now = new Date("2026-08-13T08:00:00.000Z");

  const fixture = makeDatabase(makeCycle());
  const result = await extend({
    actorUserId: "director-user-one",
    actorRoleName: "DISTRICT_DIRECTOR",
    cycleId: fixture.state.cycle.id,
    confirm: true,
    now,
    reqId: "director-extension-run-1",
    ip: "127.0.0.1",
    userAgent: "qa",
    database: fixture.database,
  });

  assertEqual(result.outcome, "EXTENDED", "Extension outcome");
  assertEqual(result.status, "OPEN", "Cycle reopened to OPEN");
  assertEqual(result.extensionNumber, 1, "Single extension number");
  assertEqual(result.extensionDays, 7, "Server-fixed seven-day extension");
  assertEqual(
    result.newDeadlineAt,
    "2026-08-20T08:00:00.000Z",
    "New deadline is seven days from Director recovery action",
  );
  assertEqual(result.finalizedResponseCount, 1, "Finalized response preserved");
  assertEqual(result.restoredNotStartedParticipants, 1, "Never-started participant restored");
  assertEqual(result.restoredInProgressParticipants, 1, "Draft participant restored");
  assertEqual(fixture.state.cycle.status, "OPEN", "Persisted cycle reopened");
  assertEqual(fixture.state.cycle.extensionCount, 1, "Extension count incremented once");
  assertEqual(fixture.state.cycle.closedAt, null, "Current closure timestamp cleared");
  assertEqual(fixture.state.cycle.closedByUserId, null, "Current close actor cleared");
  assertEqual(fixture.state.cycle.participants[0].status, "NOT_STARTED", "Not-started restored");
  assertEqual(fixture.state.cycle.participants[1].status, "IN_PROGRESS", "In-progress restored");
  assertEqual(fixture.state.cycle.participants[2].status, "FINALIZED", "Finalized preserved");
  assertEqual(fixture.state.cycle.aggregates.length, 1, "Prior aggregate snapshot preserved");
  assertEqual(fixture.state.cycleUpdateCalls, 1, "Exactly one cycle update");
  assertEqual(fixture.state.audits.length, 1, "Exactly one extension audit");
  assertEqual(
    fixture.state.audits[0].metadata.respondentIdentityCopiedIntoAudit,
    false,
    "Respondent identity excluded from audit",
  );
  assertEqual(
    fixture.state.audits[0].metadata.participantIdentifiersCopiedIntoAudit,
    false,
    "Participant identifiers excluded from audit",
  );
  assertEqual(
    fixture.state.transactionOptions[0].isolationLevel,
    "Serializable",
    "Serializable extension transaction",
  );

  const retry = await extend({
    actorUserId: "director-user-one",
    actorRoleName: "DISTRICT_DIRECTOR",
    cycleId: fixture.state.cycle.id,
    confirm: true,
    now: new Date("2026-08-13T08:01:00.000Z"),
    database: fixture.database,
  });
  assertEqual(retry.outcome, "EXISTING_EXTENDED", "Immediate retry idempotency");
  assertEqual(fixture.state.cycleUpdateCalls, 1, "Retry creates no second cycle update");
  assertEqual(fixture.state.audits.length, 1, "Retry creates no second audit");

  fixture.state.cycle.status = "CLOSED";
  fixture.state.cycle.closedAt = new Date("2026-08-20T08:01:00.000Z");
  fixture.state.cycle.participants[0].status = "EXPIRED";
  fixture.state.cycle.participants[0].expiredAt = new Date("2026-08-20T08:01:00.000Z");
  await expectError("DIRECTOR_FEEDBACK_EXTENSION_LIMIT_REACHED", () =>
    extend({
      actorUserId: "director-user-one",
      actorRoleName: "DISTRICT_DIRECTOR",
      cycleId: fixture.state.cycle.id,
      confirm: true,
      now: new Date("2026-08-20T09:00:00.000Z"),
      database: fixture.database,
    }),
  );

  await expectError("DIRECTOR_FEEDBACK_EXTENSION_CONFIRMATION_REQUIRED", () =>
    extend({
      actorUserId: "director-user-one",
      actorRoleName: "DISTRICT_DIRECTOR",
      cycleId: makeCycle().id,
      confirm: false,
      now,
      database: makeDatabase(makeCycle()).database,
    }),
  );

  await expectError("DIRECTOR_FEEDBACK_EXTENSION_DIRECTOR_ONLY", () =>
    extend({
      actorUserId: "headteacher-user-one",
      actorRoleName: "HEADTEACHER",
      cycleId: makeCycle().id,
      confirm: true,
      now,
      database: makeDatabase(makeCycle()).database,
    }),
  );

  const wrongOwner = makeDatabase(makeCycle({ targetUserId: "director-user-two" }));
  await expectError("DIRECTOR_FEEDBACK_EXTENSION_SCOPE_FORBIDDEN", () =>
    extend({
      actorUserId: "director-user-one",
      actorRoleName: "DISTRICT_DIRECTOR",
      cycleId: wrongOwner.state.cycle.id,
      confirm: true,
      now,
      database: wrongOwner.database,
    }),
  );

  const wrongZone = makeDatabase(makeCycle(), {
    zone: {
      id: "district-zone-two",
      isActive: true,
      zoneType: { level: 2 },
    },
  });
  await expectError("DIRECTOR_FEEDBACK_EXTENSION_CURRENT_ASSIGNMENT_REQUIRED", () =>
    extend({
      actorUserId: "director-user-one",
      actorRoleName: "DISTRICT_DIRECTOR",
      cycleId: wrongZone.state.cycle.id,
      confirm: true,
      now,
      database: wrongZone.database,
    }),
  );

  const allFinalized = makeDatabase(
    makeCycle({
      participants: [
        {
          status: "FINALIZED",
          startedAt: new Date("2026-08-03T08:00:00.000Z"),
          finalizedAt: new Date("2026-08-06T08:00:00.000Z"),
          expiredAt: null,
        },
      ],
    }),
  );
  await expectError("DIRECTOR_FEEDBACK_EXTENSION_EXPIRED_PARTICIPANTS_REQUIRED", () =>
    extend({
      actorUserId: "director-user-one",
      actorRoleName: "DISTRICT_DIRECTOR",
      cycleId: allFinalized.state.cycle.id,
      confirm: true,
      now,
      database: allFinalized.database,
    }),
  );

  const underReview = makeDatabase(
    makeCycle({
      status: "UNDER_REVIEW",
      reviewStartedAt: new Date("2026-08-08T09:00:00.000Z"),
    }),
  );
  await expectError("DIRECTOR_FEEDBACK_EXTENSION_CLOSED_CYCLE_REQUIRED", () =>
    extend({
      actorUserId: "director-user-one",
      actorRoleName: "DISTRICT_DIRECTOR",
      cycleId: underReview.state.cycle.id,
      confirm: true,
      now,
      database: underReview.database,
    }),
  );

  console.log("");
  console.log("=== N7 DIRECTOR FEEDBACK EXPIRED-WINDOW RECOVERY ===");
  console.log("");
  console.log("Authority                       : own District Director cycle only");
  console.log("Broad EXTEND capability         : still Superadmin-only");
  console.log("Eligible state                  : CLOSED after deadline + expired respondents");
  console.log("Recovery duration               : server-fixed 7 days");
  console.log("Recovery limit                  : one per cycle");
  console.log("Cycle lifecycle                 : CLOSED -> OPEN");
  console.log("Frozen participant set          : preserved");
  console.log("Saved/finalized responses       : preserved");
  console.log("Expired respondents             : restored to NOT_STARTED / IN_PROGRESS");
  console.log("Prior aggregate snapshot        : preserved immutable");
  console.log("Next closure aggregate          : existing worker creates new version if evidence changes");
  console.log("Immediate retry                 : EXISTING_EXTENDED");
  console.log("Director review already started : blocked");
  console.log("Current district assignment     : revalidated");
  console.log("Respondent identities/scores    : absent from extension audit");
  console.log("Route body                      : confirm only, 16 KiB max");
  console.log("Notifications/providers         : absent");
  console.log("Existing deadline worker        : unchanged");
  console.log("Schema migration                : absent");
  console.log("Database accessed               : false");
  console.log("");
  console.log("RESULT: N7 DIRECTOR FEEDBACK EXPIRED-WINDOW RECOVERY GREEN");
}

main().catch((error) => {
  console.error("");
  console.error("RESULT: N7 DIRECTOR FEEDBACK EXPIRED-WINDOW RECOVERY FAILED");
  console.error(error?.stack ?? error);
  process.exit(1);
});
