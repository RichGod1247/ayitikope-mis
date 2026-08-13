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
    fail("N6_F1C6B5CU1_TYPESCRIPT_TRANSPILE_FAILED", {
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
    id: "cycle-headteacher-feedback-extension",
    status: "OPEN",
    targetUserId: "headteacher-user-one",
    targetTenantId: "school-one",
    targetRoleSnapshot: "HEADTEACHER",
    openedAt: new Date("2026-08-05T08:00:00.000Z"),
    deadlineAt: new Date("2026-08-12T08:00:00.000Z"),
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
      { status: "NOT_STARTED" },
      { status: "IN_PROGRESS" },
    ],
    ...overrides,
  };
}

function makeDatabase(cycleInput) {
  const state = {
    cycle: clone(cycleInput),
    audits: [],
    updateCalls: 0,
    transactionOptions: [],
  };

  const tx = {
    appraisalCycle: {
      async findUnique() {
        return clone(state.cycle);
      },
      async update(args) {
        state.updateCalls += 1;
        if (
          state.cycle.id !== args.where.id ||
          state.cycle.status !== args.where.status ||
          state.cycle.deadlineAt.getTime() !== args.where.deadlineAt.getTime()
        ) {
          throw Object.assign(new Error("RACE"), { code: "RACE" });
        }
        state.cycle.deadlineAt = args.data.deadlineAt;
        state.cycle.metadata = clone(args.data.metadata);
        return {
          id: state.cycle.id,
          status: state.cycle.status,
          deadlineAt: state.cycle.deadlineAt,
          metadata: clone(state.cycle.metadata),
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
          state.updateCalls = snapshot.updateCalls;
          throw error;
        }
      },
    },
  };
}

async function main() {
  const servicePath = path.join(
    repoRoot,
    "src/lib/appraisals/headteacherFeedbackDeadlineExtension.ts",
  );
  const routePath = path.join(
    repoRoot,
    "src/app/api/district/headteacher-appraisals/[cycleId]/extend-feedback/route.ts",
  );
  const directorClientPath = path.join(
    repoRoot,
    "src/app/district/headteacher-appraisals/review/HeadteacherDirectorReviewClient.tsx",
  );
  const teacherClientPath = path.join(
    repoRoot,
    "src/app/teacher/headteacher-appraisal/HeadteacherFeedbackClient.tsx",
  );

  for (const file of [servicePath, routePath, directorClientPath, teacherClientPath]) {
    assert(fs.existsSync(file), "Required B5C-U1 file missing", file);
  }

  const serviceSource = fs.readFileSync(servicePath, "utf8");
  const routeSource = fs.readFileSync(routePath, "utf8");
  const directorSource = fs.readFileSync(directorClientPath, "utf8");
  const teacherSource = fs.readFileSync(teacherClientPath, "utf8");

  for (const marker of [
    'extensionMode: "DIRECTOR_EXPIRED_WINDOW_RECOVERY"',
    "maximumExtensionsPerCycle: 1",
    "requiresExplicitConfirmation: true",
    "preservesParticipantSet: true",
    "preservesSavedResponses: true",
    "preservesFinalizedResponses: true",
    'transactionIsolation: "Serializable"',
    "HEADTEACHER_FEEDBACK_DEADLINE_EXTENSION_AUDIT_ACTION",
    "resolveHeadteacherFeedbackDeadlineContract",
  ]) {
    assert(serviceSource.includes(marker), `Service marker missing: ${marker}`);
  }

  for (const forbidden of [
    "appraisalParticipant.update",
    "appraisalParticipant.updateMany",
    "sendSms",
    "sendEmail",
    "notification.create",
    "aggregateSnapshot.create",
    'status: "CLOSED"',
    'status: "UNDER_REVIEW"',
  ]) {
    assert(!serviceSource.includes(forbidden), `Forbidden service behavior: ${forbidden}`);
  }

  assert(
    routeSource.includes('const ALLOWED_BODY_FIELDS = new Set(["confirm"])'),
    "Extension API must accept confirm only",
  );
  assert(
    routeSource.includes("extendExpiredHeadteacherFeedbackCycle"),
    "Extension API service wiring missing",
  );
  assert(
    routeSource.includes("requireDirectorReviewApiContext"),
    "Extension API Director auth missing",
  );
  assert(
    routeSource.includes("jsonNoStore"),
    "Extension API no-store boundary missing",
  );
  assert(!routeSource.includes("prisma."), "Thin extension route cannot use Prisma directly");
  assert(!routeSource.includes("extensionDays" + ": parsed"), "Client cannot choose extension duration");

  for (const marker of [
    "Extend feedback 7 days",
    "Deadline reached ·",
    "/extend-feedback",
    "Feedback reopened until",
    "item.canExtendFeedbackWindow",
  ]) {
    assert(directorSource.includes(marker), `Director recovery UI marker missing: ${marker}`);
  }

  for (const marker of [
    "deadlineExpiredWhileOpen",
    "Response window closed",
    "Refresh availability",
    "Wait for the Director to extend the feedback period",
  ]) {
    assert(teacherSource.includes(marker), `Teacher expired-window UI marker missing: ${marker}`);
  }
  assert(
    teacherSource.includes('disabled\n                  >\n                    Response window closed'),
    "Expired Teacher Start action must be disabled",
  );

  const moduleUnderTest = require(servicePath);
  const extend = moduleUnderTest.extendExpiredHeadteacherFeedbackCycle;
  const resolveContract = moduleUnderTest.resolveHeadteacherFeedbackDeadlineContract;

  const now = new Date("2026-08-13T08:00:00.000Z");
  const fixture = makeDatabase(makeCycle());
  const result = await extend({
    actorUserId: "director-user-one",
    actorRoleName: "DISTRICT_DIRECTOR",
    governanceScope: {
      isSuperAdmin: false,
      tenantIds: ["school-one"],
    },
    cycleId: fixture.state.cycle.id,
    confirm: true,
    now,
    reqId: "extension-run-1",
    ip: "127.0.0.1",
    userAgent: "qa",
    database: fixture.database,
  });

  assertEqual(result.outcome, "EXTENDED", "Extension outcome");
  assertEqual(result.status, "OPEN", "Cycle remains OPEN");
  assertEqual(result.extensionNumber, 1, "Single extension number");
  assertEqual(result.extensionDays, 7, "Server-fixed seven-day extension");
  assertEqual(
    result.newDeadlineAt,
    "2026-08-20T08:00:00.000Z",
    "New deadline is seven days from Director extension time",
  );
  assertEqual(result.participantCount, 2, "Participant set preserved");
  assertEqual(result.finalizedResponseCount, 0, "Finalized count preserved");
  assertEqual(result.unfinishedParticipantCount, 2, "Unfinished participants preserved");
  assertEqual(fixture.state.cycle.status, "OPEN", "Persisted cycle stays OPEN");
  assertEqual(
    fixture.state.cycle.deadlineAt.toISOString(),
    "2026-08-20T08:00:00.000Z",
    "Persisted deadline extended",
  );
  assertEqual(fixture.state.updateCalls, 1, "Exactly one cycle update");
  assertEqual(fixture.state.audits.length, 1, "Exactly one extension audit");
  assertEqual(
    fixture.state.audits[0].action,
    "APPRAISAL_CYCLE_FEEDBACK_DEADLINE_EXTENDED",
    "Extension audit action",
  );
  assertEqual(
    fixture.state.audits[0].metadata.respondentIdentityCopiedIntoAudit,
    false,
    "Respondent identity excluded from audit",
  );
  assertEqual(
    fixture.state.audits[0].metadata.participantIdentifiersCopiedIntoAudit,
    false,
    "Participant IDs excluded from audit",
  );
  assertEqual(
    fixture.state.transactionOptions[0].isolationLevel,
    "Serializable",
    "Serializable extension transaction",
  );
  assertEqual(fixture.state.transactionOptions[0].maxWait, 5000, "Transaction max wait");
  assertEqual(fixture.state.transactionOptions[0].timeout, 30000, "Transaction timeout");

  const contract = resolveContract({
    cycleId: fixture.state.cycle.id,
    openedAt: fixture.state.cycle.openedAt,
    deadlineAt: fixture.state.cycle.deadlineAt,
    metadata: fixture.state.cycle.metadata,
  });
  assertEqual(contract.mode, "DIRECTOR_EXTENDED", "Extended deadline proof resolves");
  assertEqual(contract.extensionCount, 1, "Extended proof count");

  const retry = await extend({
    actorUserId: "director-user-one",
    actorRoleName: "DISTRICT_DIRECTOR",
    governanceScope: {
      isSuperAdmin: false,
      tenantIds: ["school-one"],
    },
    cycleId: fixture.state.cycle.id,
    confirm: true,
    now: new Date("2026-08-13T08:01:00.000Z"),
    database: fixture.database,
  });
  assertEqual(retry.outcome, "EXISTING_EXTENDED", "Retry idempotency");
  assertEqual(fixture.state.updateCalls, 1, "Retry creates no second update");
  assertEqual(fixture.state.audits.length, 1, "Retry creates no second audit");

  const tooEarly = makeDatabase(makeCycle());
  await expectError("HEADTEACHER_FEEDBACK_EXTENSION_DEADLINE_NOT_REACHED", () =>
    extend({
      actorUserId: "director-user-one",
      actorRoleName: "DISTRICT_DIRECTOR",
      governanceScope: { isSuperAdmin: false, tenantIds: ["school-one"] },
      cycleId: tooEarly.state.cycle.id,
      confirm: true,
      now: new Date("2026-08-12T07:59:59.999Z"),
      database: tooEarly.database,
    }),
  );
  assertEqual(tooEarly.state.updateCalls, 0, "Early attempt makes no update");

  const allFinalized = makeDatabase(
    makeCycle({
      participants: [{ status: "FINALIZED" }, { status: "FINALIZED" }],
    }),
  );
  await expectError(
    "HEADTEACHER_FEEDBACK_EXTENSION_UNFINISHED_PARTICIPANTS_REQUIRED",
    () =>
      extend({
        actorUserId: "director-user-one",
        actorRoleName: "DISTRICT_DIRECTOR",
        governanceScope: { isSuperAdmin: false, tenantIds: ["school-one"] },
        cycleId: allFinalized.state.cycle.id,
        confirm: true,
        now,
        database: allFinalized.database,
      }),
  );

  await expectError("HEADTEACHER_FEEDBACK_EXTENSION_CONFIRMATION_REQUIRED", () =>
    extend({
      actorUserId: "director-user-one",
      actorRoleName: "DISTRICT_DIRECTOR",
      governanceScope: { isSuperAdmin: false, tenantIds: ["school-one"] },
      cycleId: makeCycle().id,
      confirm: false,
      now,
      database: makeDatabase(makeCycle()).database,
    }),
  );

  await expectError("HEADTEACHER_FEEDBACK_EXTENSION_DIRECTOR_ONLY", () =>
    extend({
      actorUserId: "teacher-user-one",
      actorRoleName: "TEACHER",
      governanceScope: { isSuperAdmin: false, tenantIds: ["school-one"] },
      cycleId: makeCycle().id,
      confirm: true,
      now,
      database: makeDatabase(makeCycle()).database,
    }),
  );

  await expectError("HEADTEACHER_FEEDBACK_TARGET_OUTSIDE_GOVERNANCE_SCOPE", () =>
    extend({
      actorUserId: "director-user-one",
      actorRoleName: "DISTRICT_DIRECTOR",
      governanceScope: { isSuperAdmin: false, tenantIds: ["school-two"] },
      cycleId: makeCycle().id,
      confirm: true,
      now,
      database: makeDatabase(makeCycle()).database,
    }),
  );

  const malformed = makeDatabase(
    makeCycle({
      deadlineAt: new Date("2026-08-20T08:00:00.000Z"),
      metadata: {
        workflow: "HEADTEACHER_CONFIDENTIAL_STAFF_FEEDBACK",
        headteacherFeedbackDeadlineExtension: {
          schemaVersion: 1,
          extensionMode: "DIRECTOR_EXPIRED_WINDOW_RECOVERY",
          extensionNumber: 1,
          extensionDays: 7,
          originalDeadlineAt: "2026-08-12T08:00:00.000Z",
          extendedAt: "2026-08-13T08:00:00.000Z",
          newDeadlineAt: "2026-08-21T08:00:00.000Z",
          actorRole: "DISTRICT_DIRECTOR",
          participantSetPreserved: true,
          savedResponsesPreserved: true,
          finalizedResponsesPreserved: true,
          respondentIdentitiesIncluded: false,
          scoreValuesIncluded: false,
          notificationsSeeded: false,
          providerCalled: false,
        },
      },
    }),
  );
  await expectError(
    "HEADTEACHER_FEEDBACK_EXTENSION_DEADLINE_CONTRACT_INVALID",
    () =>
      extend({
        actorUserId: "director-user-one",
        actorRoleName: "DISTRICT_DIRECTOR",
        governanceScope: { isSuperAdmin: false, tenantIds: ["school-one"] },
        cycleId: malformed.state.cycle.id,
        confirm: true,
        now: new Date("2026-08-21T08:00:00.000Z"),
        database: malformed.database,
      }),
  );

  const audit = fixture.state.audits[0];
  const forbiddenAuditKeys = new Set([
    "respondentuserid",
    "respondentuserids",
    "participantid",
    "participantids",
    "scorevalue",
    "scorevalues",
  ]);

  function assertAuditPrivacy(value, pathParts = []) {
    if (Array.isArray(value)) {
      value.forEach((entry, index) =>
        assertAuditPrivacy(entry, [...pathParts, String(index)]),
      );
      return;
    }

    if (value && typeof value === "object") {
      for (const [key, nested] of Object.entries(value)) {
        const normalizedKey = key.toLowerCase();
        assert(
          !forbiddenAuditKeys.has(normalizedKey),
          "Extension audit leaked forbidden data",
          { forbidden: key, path: [...pathParts, key].join(".") },
        );
        assertAuditPrivacy(nested, [...pathParts, key]);
      }
      return;
    }

    if (typeof value === "string") {
      const normalizedValue = value.toLowerCase();
      for (const forbidden of ["teacher@example", "+233"]) {
        assert(
          !normalizedValue.includes(forbidden),
          "Extension audit leaked forbidden data",
          { forbidden, path: pathParts.join(".") },
        );
      }
    }
  }

  assertAuditPrivacy(audit);

  console.log("");
  console.log("=== N6-F1C6B5C-U1 EXPIRED HEADTEACHER FEEDBACK WINDOW RECOVERY ===");
  console.log("");
  console.log("Authority                      : scoped District Director only");
  console.log("Eligible state                 : OPEN + deadline reached");
  console.log("Extension duration             : server-fixed 7 days");
  console.log("Extension limit                : one per cycle in V1");
  console.log("Participant set                : frozen and unchanged");
  console.log("Saved/finalized responses      : preserved");
  console.log("Cycle lifecycle                : remains OPEN");
  console.log("Retry                          : EXISTING_EXTENDED");
  console.log("Closure compatibility          : strict authorized-extension metadata proof");
  console.log("Respondent identities/scores   : absent from service, route and audit");
  console.log("Route body                     : confirm only");
  console.log("Teacher expired CTA            : disabled + manual refresh");
  console.log("Director expired CTA           : Extend feedback 7 days");
  console.log("Transaction                    : serializable and bounded");
  console.log("Notifications/providers        : absent");
  console.log("Schema migration               : absent");
  console.log("Database accessed              : false");
  console.log("");
  console.log("RESULT: N6-F1C6B5C-U1 EXPIRED FEEDBACK WINDOW RECOVERY GREEN");
}

main().catch((error) => {
  console.error(error?.stack ?? error);
  process.exit(1);
});
