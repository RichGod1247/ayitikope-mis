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
    fail("D3_4C4_TYPESCRIPT_TRANSPILE_FAILED", {
      filename,
      diagnostics: errors.map((diagnostic) =>
        ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
      ),
    });
  }

  module._compile(transpiled.outputText, filename);
};

function makeFixture() {
  const now = new Date("2026-07-27T12:00:00.000Z");

  const target = {
    id: "membership-headteacher",
    userId: "headteacher-user",
    tenantId: "school-one",
    status: "ACTIVE",
    role: { name: "HEADTEACHER" },
    user: {
      id: "headteacher-user",
      name: "Headteacher One",
      firstName: "Headteacher",
      lastName: "One",
      email: "headteacher@example.test",
    },
    tenant: {
      id: "school-one",
      name: "School One",
      status: "ACTIVE",
      zone: {
        id: "circuit-one",
        name: "Gefia Circuit",
        isActive: true,
        parentZoneId: "district-one",
        zoneType: { level: 1, countryCode: "GH" },
        parentZone: {
          id: "district-one",
          name: "Akatsi South District",
          isActive: true,
          zoneType: { level: 2, countryCode: "GH" },
        },
      },
    },
  };

  const teachers = [
    {
      id: "membership-teacher-1",
      userId: "teacher-user-1",
      tenantId: "school-one",
      status: "ACTIVE",
      role: { name: "TEACHER" },
      tenant: { id: "school-one", status: "ACTIVE" },
    },
    {
      id: "membership-teacher-2",
      userId: "teacher-user-2",
      tenantId: "school-one",
      status: "ACTIVE",
      role: { name: "TEACHER" },
      tenant: { id: "school-one", status: "ACTIVE" },
    },
    {
      id: "membership-teacher-inactive",
      userId: "teacher-inactive",
      tenantId: "school-one",
      status: "INACTIVE",
      role: { name: "TEACHER" },
      tenant: { id: "school-one", status: "ACTIVE" },
    },
    {
      id: "membership-headteacher-copy",
      userId: "headteacher-user",
      tenantId: "school-one",
      status: "ACTIVE",
      role: { name: "HEADTEACHER" },
      tenant: { id: "school-one", status: "ACTIVE" },
    },
    {
      id: "membership-cross-tenant",
      userId: "teacher-cross-tenant",
      tenantId: "school-two",
      status: "ACTIVE",
      role: { name: "TEACHER" },
      tenant: { id: "school-two", status: "ACTIVE" },
    },
  ];

  const instrumentVersion = {
    id: "instrument-version-headteacher-staff-v1",
    version: 1,
    status: "ACTIVE",
    instrument: {
      id: "instrument-headteacher-staff",
      code: "HEADTEACHER_STAFF_FEEDBACK_V1",
      isActive: true,
    },
  };

  return { now, target, teachers, instrumentVersion };
}

function makeDatabase(fixture) {
  const state = {
    target: clone(fixture.target),
    teachers: clone(fixture.teachers),
    instrumentVersion: clone(fixture.instrumentVersion),
    cycles: [],
    participants: [],
    audits: [],
    transactionOptions: [],
    participantCreateCalls: 0,
    cycleCreateCalls: 0,
    nextCycleNumber: 401,
  };

  function projectCycle(cycle) {
    if (!cycle) return null;
    return {
      ...clone(cycle),
      instrumentVersion: clone(state.instrumentVersion),
      _count: {
        participants: state.participants.filter(
          (participant) => participant.cycleId === cycle.id,
        ).length,
      },
    };
  }

  const membership = {
    async findFirst(args) {
      const where = args?.where ?? {};
      if (!state.target) return null;
      if (where.userId && state.target.userId !== where.userId) return null;
      if (where.tenantId && state.target.tenantId !== where.tenantId) return null;
      return clone(state.target);
    },
    async findMany(args) {
      const where = args?.where ?? {};
      return clone(
        state.teachers.filter((row) => {
          if (where.tenantId && row.tenantId !== where.tenantId) return false;
          if (where.status && row.status !== where.status) return false;
          if (
            where.role?.name?.equals &&
            String(row.role.name).toUpperCase() !==
              String(where.role.name.equals).toUpperCase()
          ) {
            return false;
          }
          if (where.tenant?.status && row.tenant.status !== where.tenant.status) {
            return false;
          }
          return true;
        }),
      );
    },
  };

  const appraisalInstrumentVersion = {
    async findFirst() {
      return state.instrumentVersion
        ? clone(state.instrumentVersion)
        : null;
    },
  };

  const appraisalCycle = {
    async findUnique(args) {
      const where = args?.where ?? {};
      const cycle = state.cycles.find((row) => {
        if (where.id) return row.id === where.id;
        if (where.idempotencyKey) {
          return row.idempotencyKey === where.idempotencyKey;
        }
        return false;
      });
      return projectCycle(cycle ?? null);
    },
    async findFirst(args) {
      const where = args?.where ?? {};
      const statuses = where.status?.in ?? [];
      const cycle = state.cycles.find((row) => {
        if (where.targetUserId && row.targetUserId !== where.targetUserId) {
          return false;
        }
        if (
          where.targetTenantId &&
          row.targetTenantId !== where.targetTenantId
        ) {
          return false;
        }
        if (
          where.targetRoleSnapshot &&
          row.targetRoleSnapshot !== where.targetRoleSnapshot
        ) {
          return false;
        }
        if (statuses.length && !statuses.includes(row.status)) return false;
        return true;
      });
      return projectCycle(cycle ?? null);
    },
    async create(args) {
      state.cycleCreateCalls += 1;
      const data = clone(args?.data ?? {});

      if (
        state.cycles.some(
          (cycle) => cycle.idempotencyKey === data.idempotencyKey,
        )
      ) {
        fail("FAKE_IDEMPOTENCY_UNIQUE_VIOLATION");
      }

      const id = `00000000-0000-4000-8000-${String(
        state.nextCycleNumber++,
      ).padStart(12, "0")}`;

      const cycle = {
        id,
        approvedByUserId: null,
        openedByUserId: null,
        approvedAt: null,
        openedAt: null,
        deadlineAt: null,
        approvalNote: null,
        ...data,
      };

      state.cycles.push(cycle);
      return projectCycle(cycle);
    },
    async update(args) {
      const cycle = state.cycles.find((row) => row.id === args?.where?.id);
      if (!cycle) fail("FAKE_CYCLE_NOT_FOUND");
      Object.assign(cycle, clone(args.data));
      return projectCycle(cycle);
    },
  };

  const appraisalParticipant = {
    async createMany(args) {
      state.participantCreateCalls += 1;
      const rows = clone(args?.data ?? []);

      for (const row of rows) {
        const duplicate = state.participants.some(
          (existing) =>
            existing.cycleId === row.cycleId &&
            existing.respondentUserId === row.respondentUserId,
        );
        if (duplicate) fail("FAKE_PARTICIPANT_UNIQUE_VIOLATION");
      }

      state.participants.push(...rows);
      return { count: rows.length };
    },
  };

  const auditLog = {
    async create(args) {
      state.audits.push(clone(args.data));
      return clone(args.data);
    },
  };

  const tx = {
    membership,
    appraisalInstrumentVersion,
    appraisalCycle,
    appraisalParticipant,
    auditLog,
  };

  return {
    state,
    membership,
    appraisalInstrumentVersion,
    appraisalCycle,
    async $transaction(operation, options) {
      state.transactionOptions.push(clone(options));

      const before = clone({
        cycles: state.cycles,
        participants: state.participants,
        audits: state.audits,
        participantCreateCalls: state.participantCreateCalls,
        cycleCreateCalls: state.cycleCreateCalls,
        nextCycleNumber: state.nextCycleNumber,
      });

      try {
        return await operation(tx);
      } catch (error) {
        state.cycles = before.cycles;
        state.participants = before.participants;
        state.audits = before.audits;
        state.participantCreateCalls = before.participantCreateCalls;
        state.cycleCreateCalls = before.cycleCreateCalls;
        state.nextCycleNumber = before.nextCycleNumber;
        throw error;
      }
    },
  };
}

async function expectFailure(run, expectedCode) {
  try {
    await run();
  } catch (error) {
    assertEqual(error.code ?? error.message, expectedCode, "Unexpected failure code");
    return;
  }
  fail(`Expected failure ${expectedCode}`);
}

function directOpenInput(database, fixture, overrides = {}) {
  return {
    actorUserId: "director-user",
    actorRoleName: "DISTRICT_DIRECTOR",
    governanceScope: {
      isSuperAdmin: false,
      tenantIds: ["school-one"],
    },
    targetHeadteacherUserId: "headteacher-user",
    targetTenantId: "school-one",
    directOpenKey: "2026-TERM-ONE-DIRECT-OPEN",
    openingNote: "Director initiated the standard confidential exercise.",
    reqId: "request-direct-open-0001",
    ip: "127.0.0.1",
    userAgent: "D3.4C4-QA",
    now: fixture.now,
    database,
    ...overrides,
  };
}

function assertAuditSafe(audits) {
  const serialized = JSON.stringify(audits).toLowerCase();

  for (const forbidden of [
    "teacher-user-1",
    "teacher-user-2",
    "membership-teacher-1",
    "membership-teacher-2",
    "@",
    "+233",
    "phone",
    "email",
    "respondentuserid",
    "participantids",
  ]) {
    assert(!serialized.includes(forbidden), "Audit leaked confidential identity", {
      forbidden,
    });
  }
}

async function main() {
  const modulePath = path.join(
    repoRoot,
    "src",
    "lib",
    "appraisals",
    "headteacherFeedbackDirectOpen.ts",
  );
  const source = fs.readFileSync(modulePath, "utf8");
  const directOpen = require(modulePath);

  assert(
    typeof directOpen.directOpenHeadteacherFeedbackCycle === "function",
    "Direct-open service export missing",
  );
  assert(
    typeof directOpen.readHeadteacherFeedbackDirectOpenTargets === "function",
    "Direct-open target discovery export missing",
  );

  const fixture = makeFixture();
  const discoveryDatabase = {
    membership: {
      async findMany() {
        return [clone(fixture.target)];
      },
    },
  };
  const discovery =
    await directOpen.readHeadteacherFeedbackDirectOpenTargets({
      actorUserId: "director-user",
      actorRoleName: "DISTRICT_DIRECTOR",
      governanceScope: {
        isSuperAdmin: false,
        tenantIds: ["school-one"],
      },
      database: discoveryDatabase,
    });

  assertEqual(discovery.actorRole, "DISTRICT_DIRECTOR", "Discovery actor role");
  assertEqual(discovery.circuits.length, 1, "One discovery circuit");
  assertEqual(discovery.targets.length, 1, "One discovery Headteacher target");
  assertEqual(discovery.targets[0].targetTenantId, "school-one", "Discovery school scope");
  assertEqual(discovery.targets[0].circuitId, "circuit-one", "Discovery circuit scope");
  assertEqual(discovery.targets[0].districtId, "district-one", "Discovery district scope");
  assertEqual(discovery.readOnly, true, "Discovery is read only");
  assertEqual(discovery.respondentIdentitiesIncluded, false, "Discovery excludes respondent identities");
  assertEqual(discovery.individualStaffResponsesIncluded, false, "Discovery excludes staff responses");
  assertEqual(discovery.providerCalled, false, "Discovery calls no provider");

  const serializedDiscovery = JSON.stringify(discovery).toLowerCase();
  for (const forbidden of [
    "teacher-user-1",
    "teacher-user-2",
    "membership-teacher-1",
    "membership-teacher-2",
    "@example.test",
  ]) {
    assert(
      !serializedDiscovery.includes(forbidden),
      "Discovery leaked confidential respondent identity",
      { forbidden },
    );
  }

  await expectFailure(
    () =>
      directOpen.readHeadteacherFeedbackDirectOpenTargets({
        actorUserId: "teacher-user-1",
        actorRoleName: "TEACHER",
        governanceScope: {
          isSuperAdmin: false,
          tenantIds: ["school-one"],
        },
        database: discoveryDatabase,
      }),
    "HEADTEACHER_FEEDBACK_OPENER_ROLE_FORBIDDEN",
  );

  const database = makeDatabase(fixture);

  const created = await directOpen.directOpenHeadteacherFeedbackCycle(
    directOpenInput(database, fixture),
  );

  assertEqual(created.outcome, "DIRECTLY_OPENED", "Direct-open outcome");
  assertEqual(created.cycle.status, "OPEN", "Cycle must open directly");
  assertEqual(created.cycle.participantCount, 2, "Only eligible teachers freeze");
  assertEqual(created.cycle.approvedAt, fixture.now.toISOString(), "Approval time");
  assertEqual(created.cycle.openedAt, fixture.now.toISOString(), "Open time");
  assertEqual(
    created.cycle.deadlineAt,
    "2026-08-03T12:00:00.000Z",
    "Seven calendar-day deadline",
  );

  assertEqual(database.state.cycles.length, 1, "Exactly one cycle created");
  assertEqual(database.state.cycleCreateCalls, 1, "One draft create");
  assertEqual(database.state.cycles[0].status, "OPEN", "Draft opens atomically");
  assertEqual(
    database.state.cycles[0].requestedByUserId,
    "director-user",
    "Director is recorded as initiator",
  );
  assertEqual(
    database.state.cycles[0].approvedByUserId,
    "director-user",
    "Director is recorded as approver",
  );
  assertEqual(
    database.state.cycles[0].openedByUserId,
    "director-user",
    "Director is recorded as opener",
  );
  assertEqual(
    database.state.cycles[0].metadata.openingMode,
    "DIRECT_OPEN",
    "Direct-open mode preserved",
  );
  assertEqual(database.state.participants.length, 2, "Two participants frozen");
  assertEqual(database.state.participantCreateCalls, 1, "One participant freeze");

  const respondentIds = database.state.participants
    .map((row) => row.respondentUserId)
    .sort();
  assertEqual(
    JSON.stringify(respondentIds),
    JSON.stringify(["teacher-user-1", "teacher-user-2"]),
    "Exact same-school teacher set",
  );

  assertEqual(database.state.audits.length, 4, "Request, approval, participant, open audits");
  assertEqual(
    database.state.audits[0].action,
    "APPRAISAL_CYCLE_REQUESTED",
    "Direct-open initiation audit",
  );
  assertEqual(
    database.state.audits[1].action,
    "APPRAISAL_CYCLE_APPROVED",
    "Direct-open approval audit",
  );
  assertEqual(
    database.state.audits[2].action,
    "APPRAISAL_PARTICIPANTS_RESOLVED",
    "Participant resolution audit",
  );
  assertEqual(
    database.state.audits[3].action,
    "APPRAISAL_CYCLE_OPENED",
    "Open audit",
  );
  assertEqual(
    database.state.audits[0].metadata.openingMode,
    "DIRECT_OPEN",
    "Initiation audit identifies direct-open mode",
  );
  assertAuditSafe(database.state.audits);

  assertEqual(
    database.state.transactionOptions[0].isolationLevel,
    "Serializable",
    "Serializable transaction",
  );
  assertEqual(database.state.transactionOptions[0].maxWait, 10000, "Bounded max wait");
  assertEqual(database.state.transactionOptions[0].timeout, 30000, "Bounded timeout");

  const repeated = await directOpen.directOpenHeadteacherFeedbackCycle(
    directOpenInput(database, fixture, {
      reqId: "request-direct-open-retry",
    }),
  );
  assertEqual(repeated.outcome, "EXISTING_OPEN", "Same-key retry idempotent");
  assertEqual(database.state.cycles.length, 1, "Retry creates no cycle");
  assertEqual(database.state.participants.length, 2, "Retry freezes no participant");
  assertEqual(database.state.audits.length, 4, "Retry writes no audit");

  await expectFailure(
    () =>
      directOpen.directOpenHeadteacherFeedbackCycle(
        directOpenInput(database, fixture, {
          directOpenKey: "2026-TERM-TWO-DIRECT-OPEN",
        }),
      ),
    "HEADTEACHER_FEEDBACK_ACTIVE_CYCLE_ALREADY_EXISTS",
  );

  const outOfScopeFixture = makeFixture();
  const outOfScopeDb = makeDatabase(outOfScopeFixture);
  await expectFailure(
    () =>
      directOpen.directOpenHeadteacherFeedbackCycle(
        directOpenInput(outOfScopeDb, outOfScopeFixture, {
          governanceScope: {
            isSuperAdmin: false,
            tenantIds: ["school-two"],
          },
        }),
      ),
    "HEADTEACHER_FEEDBACK_TARGET_OUTSIDE_GOVERNANCE_SCOPE",
  );

  const teacherActorFixture = makeFixture();
  const teacherActorDb = makeDatabase(teacherActorFixture);
  await expectFailure(
    () =>
      directOpen.directOpenHeadteacherFeedbackCycle(
        directOpenInput(teacherActorDb, teacherActorFixture, {
          actorUserId: "teacher-user-1",
          actorRoleName: "TEACHER",
        }),
      ),
    "HEADTEACHER_FEEDBACK_OPENER_ROLE_FORBIDDEN",
  );

  const selectedFixture = makeFixture();
  const selectedDb = makeDatabase(selectedFixture);
  await expectFailure(
    () =>
      directOpen.directOpenHeadteacherFeedbackCycle(
        directOpenInput(selectedDb, selectedFixture, {
          requestedRespondentUserIds: ["teacher-user-1"],
        }),
      ),
    "HEADTEACHER_FEEDBACK_RESPONDENT_SELECTION_FORBIDDEN",
  );

  const inactiveFixture = makeFixture();
  inactiveFixture.target.status = "INACTIVE";
  const inactiveDb = makeDatabase(inactiveFixture);
  await expectFailure(
    () =>
      directOpen.directOpenHeadteacherFeedbackCycle(
        directOpenInput(inactiveDb, inactiveFixture),
      ),
    "HEADTEACHER_FEEDBACK_TARGET_MEMBERSHIP_INACTIVE",
  );
  assertEqual(inactiveDb.state.cycles.length, 0, "Inactive target creates no cycle");

  const noTeachersFixture = makeFixture();
  noTeachersFixture.teachers = noTeachersFixture.teachers.filter(
    (row) =>
      row.role.name !== "TEACHER" ||
      row.status !== "ACTIVE" ||
      row.tenantId !== "school-one",
  );
  const noTeachersDb = makeDatabase(noTeachersFixture);
  await expectFailure(
    () =>
      directOpen.directOpenHeadteacherFeedbackCycle(
        directOpenInput(noTeachersDb, noTeachersFixture),
      ),
    "HEADTEACHER_FEEDBACK_NO_ELIGIBLE_TEACHERS",
  );
  assertEqual(noTeachersDb.state.cycles.length, 0, "Failed direct-open rolls back draft");
  assertEqual(noTeachersDb.state.audits.length, 0, "Failed direct-open rolls back audits");

  const duplicateFixture = makeFixture();
  duplicateFixture.teachers.push({
    ...clone(duplicateFixture.teachers[0]),
    id: "membership-teacher-1-duplicate",
  });
  const duplicateDb = makeDatabase(duplicateFixture);
  await expectFailure(
    () =>
      directOpen.directOpenHeadteacherFeedbackCycle(
        directOpenInput(duplicateDb, duplicateFixture),
      ),
    "HEADTEACHER_FEEDBACK_DUPLICATE_ELIGIBLE_TEACHER",
  );
  assertEqual(duplicateDb.state.cycles.length, 0, "Duplicate eligibility rolls back cycle");
  assertEqual(duplicateDb.state.participants.length, 0, "Duplicate data freezes nobody");

  const superadminFixture = makeFixture();
  const superadminDb = makeDatabase(superadminFixture);
  const superadminResult =
    await directOpen.directOpenHeadteacherFeedbackCycle(
      directOpenInput(superadminDb, superadminFixture, {
        actorUserId: "superadmin-user",
        actorRoleName: "SUPERADMIN",
        governanceScope: {
          isSuperAdmin: true,
          tenantIds: [],
        },
        directOpenKey: "SUPERADMIN-DIRECT-OPEN-2026",
      }),
    );
  assertEqual(superadminResult.outcome, "DIRECTLY_OPENED", "Superadmin direct-open");

  for (const forbidden of [
    "appraisalNotification",
    "AppraisalNotificationChannel",
    "sendSms",
    "sendEmail",
    "fetch(",
    "providerMessageId",
  ]) {
    assert(!source.includes(forbidden), "C4 must not seed or deliver notifications", {
      forbidden,
    });
  }

  assert(
    source.includes("openHeadteacherFeedbackCycleWithinTransaction"),
    "C4 must reuse the C3 opening core",
  );
  assert(
    !source.includes("appraisalParticipant.createMany"),
    "C4 must not duplicate participant-freezing implementation",
  );
  assert(
    source.includes('status: "DRAFT"'),
    "Direct-open must create only a transient DRAFT inside the transaction",
  );
  assert(
    source.includes('openingMode: "DIRECT_OPEN"'),
    "Direct-open mode must be explicit",
  );

  console.log("");
  console.log("=== D3.4C4 HEADTEACHER DIRECT-OPEN TRANSACTION ===");
  console.log("");
  console.log("Direct-open authority          : Director/Superadmin within scope");
  console.log("Target discovery               : read-only Director/Superadmin scope");
  console.log("Target selection               : one active in-scope Headteacher");
  console.log("Lifecycle path                 : transient DRAFT -> OPEN atomically");
  console.log("Pending approval state         : bypassed by authorized Director");
  console.log("Shared opening core            : reused from D3.4C3");
  console.log("Participant freeze             : active same-school teachers only");
  console.log("Opened/deadline timestamps     : same open event + 7 days");
  console.log("Initiation/approval/open audits: privacy-safe");
  console.log("Same-key retry                 : EXISTING_OPEN");
  console.log("Different-key active cycle     : rejected");
  console.log("Transaction                    : serializable and bounded");
  console.log("Notification records           : absent");
  console.log("Provider calls                 : absent");
  console.log("Database accessed              : false");
  console.log("");
  console.log("RESULT: D3.4C4 HEADTEACHER DIRECT-OPEN TRANSACTION GREEN");
}

main().catch((error) => {
  console.error("");
  console.error("RESULT: D3.4C4 HEADTEACHER DIRECT-OPEN TRANSACTION FAILED");
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
