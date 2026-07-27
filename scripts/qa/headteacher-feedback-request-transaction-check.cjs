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
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    fail(message, { expected, actual });
  }
}

const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveFilename(
  request,
  parent,
  isMain,
  options,
) {
  if (typeof request === "string" && request.startsWith("@/")) {
    request = path.join(repoRoot, "src", request.slice(2));
  }

  return originalResolveFilename.call(
    this,
    request,
    parent,
    isMain,
    options,
  );
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
    fail("D3_4C2_TYPESCRIPT_TRANSPILE_FAILED", {
      filename,
      diagnostics: errors.map((diagnostic) =>
        ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
      ),
    });
  }

  module._compile(transpiled.outputText, filename);
};

function clone(value) {
  return structuredClone(value);
}

function fixture() {
  return {
    now: new Date("2026-07-27T12:00:00.000Z"),
    membership: {
      id: "membership-headteacher-1",
      userId: "headteacher-user-1",
      tenantId: "school-tenant-1",
      status: "ACTIVE",
      role: {
        name: "HEADTEACHER",
      },
      user: {
        id: "headteacher-user-1",
        name: "Akosua Example",
        firstName: "Akosua",
        lastName: "Example",
        email: "headteacher@example.test",
      },
      tenant: {
        id: "school-tenant-1",
        name: "Example M/A Basic School",
        status: "ACTIVE",
        zone: {
          id: "circuit-zone-1",
          name: "Example Circuit",
          isActive: true,
          parentZoneId: "district-zone-1",
          zoneType: {
            level: 1,
            countryCode: "GH",
          },
          parentZone: {
            id: "district-zone-1",
            name: "Example District",
            isActive: true,
            zoneType: {
              level: 2,
              countryCode: "GH",
            },
          },
        },
      },
    },
    instrumentVersion: {
      id: "00000000-0000-4000-8000-000000000111",
      version: 1,
      status: "ACTIVE",
      instrument: {
        id: "00000000-0000-4000-8000-000000000110",
        code: "HEADTEACHER_STAFF_FEEDBACK_V1",
        isActive: true,
      },
    },
  };
}

function makeDatabase(inputFixture, options = {}) {
  const state = {
    cycles: [],
    audits: [],
    transactionOptions: [],
    calls: {
      membershipFindFirst: 0,
      instrumentFindFirst: 0,
      cycleFindUnique: 0,
      cycleFindFirst: 0,
      cycleCreate: 0,
      auditCreate: 0,
      participantCreate: 0,
      notificationCreate: 0,
    },
  };

  function projectedCycle(cycle) {
    return {
      id: cycle.id,
      status: cycle.status,
      targetUserId: cycle.targetUserId,
      targetTenantId: cycle.targetTenantId,
      targetNameSnapshot: cycle.targetNameSnapshot,
      targetRoleSnapshot: cycle.targetRoleSnapshot,
      targetSchoolNameSnapshot: cycle.targetSchoolNameSnapshot,
      targetZoneId: cycle.targetZoneId,
      targetZoneNameSnapshot: cycle.targetZoneNameSnapshot,
      scopeZoneId: cycle.scopeZoneId,
      requestedAt: cycle.requestedAt,
      openedAt: cycle.openedAt ?? null,
      deadlineAt: cycle.deadlineAt ?? null,
      responseWindowDays: cycle.responseWindowDays,
      minimumResponses: cycle.minimumResponses,
      metadata: clone(cycle.metadata),
      _count: {
        participants: cycle.participants?.length ?? 0,
      },
    };
  }

  function activeStatusesFrom(where) {
    return where?.status?.in ?? [];
  }

  const cycleDelegate = {
    async findUnique(args) {
      state.calls.cycleFindUnique += 1;
      const key = args.where?.idempotencyKey;
      const row = state.cycles.find((cycle) => cycle.idempotencyKey === key);
      return row ? projectedCycle(row) : null;
    },

    async findFirst(args) {
      state.calls.cycleFindFirst += 1;
      const where = args.where ?? {};
      const statuses = activeStatusesFrom(where);

      const row = state.cycles.find((cycle) => {
        if (where.targetUserId && cycle.targetUserId !== where.targetUserId) {
          return false;
        }
        if (
          where.targetTenantId &&
          cycle.targetTenantId !== where.targetTenantId
        ) {
          return false;
        }
        if (
          where.targetRoleSnapshot &&
          cycle.targetRoleSnapshot !== where.targetRoleSnapshot
        ) {
          return false;
        }
        if (statuses.length && !statuses.includes(cycle.status)) {
          return false;
        }
        return true;
      });

      return row ? projectedCycle(row) : null;
    },

    async create(args) {
      state.calls.cycleCreate += 1;
      const data = clone(args.data);

      assert(
        !Object.prototype.hasOwnProperty.call(data, "participants"),
        "Pending request must not create participants",
        data,
      );

      const cycle = {
        id: `00000000-0000-4000-8000-${String(
          state.cycles.length + 1,
        ).padStart(12, "0")}`,
        ...data,
        approvedAt: null,
        openedAt: null,
        deadlineAt: null,
        participants: [],
      };

      state.cycles.push(cycle);
      return projectedCycle(cycle);
    },
  };

  const tx = {
    appraisalCycle: cycleDelegate,
    auditLog: {
      async create(args) {
        state.calls.auditCreate += 1;
        state.audits.push(clone(args.data));
        return args.data;
      },
    },
  };

  return {
    state,
    membership: {
      async findFirst(args) {
        state.calls.membershipFindFirst += 1;
        const membership = inputFixture.membership;
        const where = args.where ?? {};

        if (options.missingMembership) return null;
        if (where.userId && membership.userId !== where.userId) return null;
        if (where.tenantId && membership.tenantId !== where.tenantId) {
          return null;
        }

        return clone(membership);
      },
    },
    appraisalInstrumentVersion: {
      async findFirst() {
        state.calls.instrumentFindFirst += 1;
        if (options.missingInstrument) return null;
        return clone(inputFixture.instrumentVersion);
      },
    },
    appraisalCycle: cycleDelegate,
    async $transaction(operation, transactionOptions) {
      state.transactionOptions.push(clone(transactionOptions));

      if (options.raceCycle && state.cycles.length === 0) {
        state.cycles.push(clone(options.raceCycle));
      }

      return operation(tx);
    },
  };
}

async function expectFailure(run, expectedCode) {
  try {
    await run();
  } catch (error) {
    assertEqual(
      error.code ?? error.message,
      expectedCode,
      "Unexpected failure code",
    );
    return error;
  }

  fail(`Expected failure ${expectedCode}`);
}

function requestInput(database, now) {
  return {
    actorUserId: "headteacher-user-1",
    actorRoleName: "HEADTEACHER",
    actorTenantId: "school-tenant-1",
    targetHeadteacherUserId: "headteacher-user-1",
    requestKey: "request-2026-term-one-0001",
    requestReason: "Annual Headteacher appraisal request",
    requestedRespondentUserIds: undefined,
    reqId: "request-0001",
    ip: "127.0.0.1",
    userAgent: "D3.4C2-QA",
    now,
    database,
  };
}

async function main() {
  const servicePath = path.join(
    repoRoot,
    "src",
    "lib",
    "appraisals",
    "headteacherFeedbackRequest.ts",
  );

  const source = fs.readFileSync(servicePath, "utf8");
  const service = require(servicePath);
  const {
    requestHeadteacherFeedbackCycle,
  } = service;

  assert(
    typeof requestHeadteacherFeedbackCycle === "function",
    "Request transaction export missing",
  );

  const baseFixture = fixture();
  const database = makeDatabase(baseFixture);
  const input = requestInput(database, baseFixture.now);

  const created = await requestHeadteacherFeedbackCycle(input);

  assertEqual(created.outcome, "CREATED", "Creation outcome");
  assertEqual(created.cycle.status, "PENDING_APPROVAL", "Pending status");
  assertEqual(
    created.cycle.targetUserId,
    "headteacher-user-1",
    "Target user",
  );
  assertEqual(
    created.cycle.targetTenantId,
    "school-tenant-1",
    "Target tenant",
  );
  assertEqual(
    created.cycle.schoolName,
    "Example M/A Basic School",
    "School snapshot",
  );
  assertEqual(
    created.cycle.circuitZoneId,
    "circuit-zone-1",
    "Circuit snapshot",
  );
  assertEqual(
    created.cycle.districtZoneId,
    "district-zone-1",
    "District scope",
  );
  assertEqual(created.cycle.openedAt, null, "Not opened");
  assertEqual(created.cycle.deadlineAt, null, "No deadline before opening");
  assertEqual(created.cycle.responseWindowDays, 7, "Seven-day policy stored");
  assertEqual(created.cycle.minimumResponses, 1, "Minimum response stored");
  assertEqual(database.state.cycles.length, 1, "One cycle stored");
  assertEqual(database.state.audits.length, 1, "One request audit stored");
  assertEqual(database.state.calls.cycleCreate, 1, "One cycle create");
  assertEqual(database.state.calls.auditCreate, 1, "One audit create");
  assertEqual(
    database.state.transactionOptions[0].isolationLevel,
    "Serializable",
    "Serializable transaction",
  );
  assertEqual(
    database.state.transactionOptions[0].maxWait,
    10000,
    "Bounded max wait",
  );
  assertEqual(
    database.state.transactionOptions[0].timeout,
    30000,
    "Bounded timeout",
  );

  const stored = database.state.cycles[0];
  assertEqual(stored.status, "PENDING_APPROVAL", "Stored pending status");
  assertEqual(stored.scopeZoneId, "district-zone-1", "Stored district scope");
  assertEqual(stored.targetZoneId, "circuit-zone-1", "Stored circuit target");
  assertEqual(stored.approvedAt, null, "Approval absent");
  assertEqual(stored.openedAt, null, "Opening absent");
  assertEqual(stored.deadlineAt, null, "Deadline absent");
  assertEqual(stored.participants.length, 0, "Participants not frozen");
  assertEqual(
    stored.metadata.participantsFrozen,
    false,
    "Participant freeze metadata",
  );
  assertEqual(
    stored.metadata.notificationsSeeded,
    false,
    "Notification metadata",
  );

  const audit = database.state.audits[0];
  assertEqual(
    audit.action,
    "APPRAISAL_CYCLE_REQUESTED",
    "Request audit action",
  );
  assertEqual(audit.tenantId, "school-tenant-1", "Audit tenant");
  assertEqual(
    audit.metadata.nextStatus,
    "PENDING_APPROVAL",
    "Audit next status",
  );
  assertEqual(
    audit.metadata.participantCount,
    0,
    "Audit participant count only",
  );

  const auditJson = JSON.stringify(audit.metadata).toLowerCase();
  for (const forbidden of [
    "teacher@example",
    "phone",
    "respondentuserid",
    "participantids",
    "participantlist",
    "scores",
  ]) {
    assert(
      !auditJson.includes(forbidden),
      `Audit metadata leaked forbidden marker: ${forbidden}`,
    );
  }

  const repeated = await requestHeadteacherFeedbackCycle(input);
  assertEqual(repeated.outcome, "EXISTING_MATCH", "Idempotent retry");
  assertEqual(database.state.cycles.length, 1, "No duplicate cycle");
  assertEqual(database.state.audits.length, 1, "No duplicate audit");

  database.state.cycles[0].status = "OPEN";
  database.state.cycles[0].openedAt = new Date(
    "2026-07-28T09:00:00.000Z",
  );
  database.state.cycles[0].deadlineAt = new Date(
    "2026-08-04T09:00:00.000Z",
  );
  database.state.cycles[0].participants.push({
    id: "participant-1",
  });

  const delayedRetry = await requestHeadteacherFeedbackCycle(input);
  assertEqual(
    delayedRetry.outcome,
    "EXISTING_MATCH",
    "Delayed same-key retry remains idempotent after opening",
  );
  assertEqual(delayedRetry.cycle.status, "OPEN", "Progressed status returned");
  assertEqual(
    delayedRetry.cycle.deadlineAt,
    "2026-08-04T09:00:00.000Z",
    "Progressed deadline returned safely",
  );
  assert(
    !Object.prototype.hasOwnProperty.call(
      delayedRetry.cycle,
      "participantCount",
    ),
    "Headteacher request summary must not expose participant counts",
  );

  await expectFailure(
    () =>
      requestHeadteacherFeedbackCycle({
        ...input,
        requestKey: "different-request-key-0002",
      }),
    "HEADTEACHER_FEEDBACK_ACTIVE_CYCLE_ALREADY_EXISTS",
  );

  const teacherDatabase = makeDatabase(baseFixture);
  const teacherCallsBefore = clone(teacherDatabase.state.calls);
  await expectFailure(
    () =>
      requestHeadteacherFeedbackCycle({
        ...requestInput(teacherDatabase, baseFixture.now),
        actorRoleName: "TEACHER",
      }),
    "HEADTEACHER_FEEDBACK_REQUEST_HEADTEACHER_ONLY",
  );
  assertDeepEqual(
    teacherDatabase.state.calls,
    teacherCallsBefore,
    "Unauthorized teacher must fail before database access",
  );

  const otherTargetDatabase = makeDatabase(baseFixture);
  await expectFailure(
    () =>
      requestHeadteacherFeedbackCycle({
        ...requestInput(otherTargetDatabase, baseFixture.now),
        targetHeadteacherUserId: "headteacher-user-2",
      }),
    "HEADTEACHER_FEEDBACK_OWN_REQUEST_ONLY",
  );

  const selectedRespondentDatabase = makeDatabase(baseFixture);
  await expectFailure(
    () =>
      requestHeadteacherFeedbackCycle({
        ...requestInput(selectedRespondentDatabase, baseFixture.now),
        requestedRespondentUserIds: ["teacher-user-1"],
      }),
    "HEADTEACHER_FEEDBACK_RESPONDENT_SELECTION_FORBIDDEN",
  );

  const wrongTenantDatabase = makeDatabase(baseFixture);
  await expectFailure(
    () =>
      requestHeadteacherFeedbackCycle({
        ...requestInput(wrongTenantDatabase, baseFixture.now),
        actorTenantId: "school-tenant-2",
      }),
    "HEADTEACHER_FEEDBACK_ACTIVE_TARGET_NOT_FOUND",
  );

  const inactiveFixture = fixture();
  inactiveFixture.membership.tenant.status = "INACTIVE";
  const inactiveDatabase = makeDatabase(inactiveFixture);
  await expectFailure(
    () =>
      requestHeadteacherFeedbackCycle(
        requestInput(inactiveDatabase, inactiveFixture.now),
      ),
    "HEADTEACHER_FEEDBACK_TARGET_TENANT_INACTIVE",
  );

  const missingJurisdictionFixture = fixture();
  missingJurisdictionFixture.membership.tenant.zone.parentZone = null;
  const missingJurisdictionDatabase = makeDatabase(missingJurisdictionFixture);
  await expectFailure(
    () =>
      requestHeadteacherFeedbackCycle(
        requestInput(
          missingJurisdictionDatabase,
          missingJurisdictionFixture.now,
        ),
      ),
    "HEADTEACHER_FEEDBACK_TARGET_JURISDICTION_NOT_FOUND",
  );

  const missingInstrumentDatabase = makeDatabase(baseFixture, {
    missingInstrument: true,
  });
  await expectFailure(
    () =>
      requestHeadteacherFeedbackCycle(
        requestInput(missingInstrumentDatabase, baseFixture.now),
      ),
    "HEADTEACHER_FEEDBACK_PUBLISHED_INSTRUMENT_NOT_FOUND",
  );

  const raceFixture = fixture();
  const raceCycle = {
    id: "00000000-0000-4000-8000-999999999999",
    instrumentVersionId: raceFixture.instrumentVersion.id,
    scopeZoneId: "district-zone-1",
    targetUserId: "headteacher-user-1",
    targetTenantId: "school-tenant-1",
    targetZoneId: "circuit-zone-1",
    status: "PENDING_APPROVAL",
    identityVisibility: "DIRECTOR_ONLY",
    idempotencyKey:
      "headteacher-feedback-request:edbfa7e8e60fabb79a3f6e8a097cb07599d700ae008b9cd2021f2ac46fcffa2c",
    responseWindowDays: 7,
    minimumResponses: 1,
    extensionCount: 0,
    targetNameSnapshot: "Akosua Example",
    targetRoleSnapshot: "HEADTEACHER",
    targetSchoolNameSnapshot: "Example M/A Basic School",
    targetZoneNameSnapshot: "Example Circuit",
    requestedByUserId: "headteacher-user-1",
    requestedAt: raceFixture.now,
    openedAt: null,
    deadlineAt: null,
    metadata: {
      workflow: "HEADTEACHER_CONFIDENTIAL_STAFF_FEEDBACK",
      districtZoneId: "district-zone-1",
      districtName: "Example District",
      circuitZoneId: "circuit-zone-1",
      circuitName: "Example Circuit",
      participantsFrozen: false,
      notificationsSeeded: false,
    },
    participants: [],
  };

  const raceDatabase = makeDatabase(raceFixture, { raceCycle });
  const raceInput = requestInput(raceDatabase, raceFixture.now);
  const raceResult = await requestHeadteacherFeedbackCycle(raceInput);
  assertEqual(
    raceResult.outcome,
    "EXISTING_MATCH",
    "Same-key transaction race recovers idempotently",
  );
  assertEqual(raceDatabase.state.cycles.length, 1, "Race stores one cycle");
  assertEqual(raceDatabase.state.audits.length, 0, "Race adds no duplicate audit");

  for (const forbiddenSourceMarker of [
    "appraisalParticipant.create",
    "appraisalParticipant.createMany",
    "appraisalNotification.create",
    "appraisalNotification.createMany",
    "FinanceOutboxEvent",
    "sendSms",
    "sendEmail",
    "Hubtel",
  ]) {
    assert(
      !source.includes(forbiddenSourceMarker),
      `Request transaction contains forbidden operation: ${forbiddenSourceMarker}`,
    );
  }

  assert(
    source.includes('status: "PENDING_APPROVAL"'),
    "Pending status must be explicit",
  );
  assert(
    source.includes("Prisma.TransactionIsolationLevel.Serializable"),
    "Serializable transaction must be explicit",
  );
  assert(
    source.includes("maxWait: 10_000"),
    "Bounded max wait must be explicit",
  );
  assert(
    source.includes("timeout: 30_000"),
    "Bounded timeout must be explicit",
  );
  assert(
    source.includes("APPRAISAL_AUDIT_ACTIONS.CYCLE_REQUESTED"),
    "Request audit must be explicit",
  );

  console.log("");
  console.log("=== D3.4C2 HEADTEACHER REQUEST TRANSACTION ===");
  console.log("");
  console.log("Authenticated target           : own Headteacher account");
  console.log("Tenant binding                 : exact active school tenant");
  console.log("Published instrument           : HEADTEACHER_STAFF_FEEDBACK_V1");
  console.log("Created lifecycle state        : PENDING_APPROVAL");
  console.log("Participants frozen            : 0");
  console.log("Opened/deadline timestamps     : absent");
  console.log("District/circuit snapshots     : preserved");
  console.log("Duplicate same-key request     : idempotent");
  console.log("Different-key active request   : rejected");
  console.log("Teacher/other-target request   : forbidden");
  console.log("Caller respondent selection    : forbidden");
  console.log("Inactive/cross-tenant target   : rejected");
  console.log("Request audit                  : one, privacy-safe");
  console.log("Transaction                    : serializable and bounded");
  console.log("Notifications/providers        : absent");
  console.log("Database accessed              : false");
  console.log("");
  console.log("RESULT: D3.4C2 HEADTEACHER REQUEST TRANSACTION GREEN");
}

main().catch((error) => {
  console.error("");
  console.error("RESULT: D3.4C2 HEADTEACHER REQUEST TRANSACTION FAILED");
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
