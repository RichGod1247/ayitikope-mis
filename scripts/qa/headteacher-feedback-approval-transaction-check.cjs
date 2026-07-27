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
    fail("D3_4C3_TYPESCRIPT_TRANSPILE_FAILED", {
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
    {
      id: "membership-governance",
      userId: "governance-user",
      tenantId: "school-one",
      status: "ACTIVE",
      role: { name: "SISSO" },
      tenant: { id: "school-one", status: "ACTIVE" },
    },
  ];

  const cycle = {
    id: "00000000-0000-4000-8000-000000000301",
    instrumentVersionId: "instrument-version-headteacher-staff-v1",
    scopeZoneId: "district-one",
    targetUserId: "headteacher-user",
    targetTenantId: "school-one",
    targetZoneId: "circuit-one",
    status: "PENDING_APPROVAL",
    identityVisibility: "DIRECTOR_ONLY",
    targetNameSnapshot: "Headteacher One",
    targetRoleSnapshot: "HEADTEACHER",
    targetSchoolNameSnapshot: "School One",
    targetZoneNameSnapshot: "Gefia Circuit",
    requestedByUserId: "headteacher-user",
    requestedAt: new Date("2026-07-27T10:00:00.000Z"),
    approvedByUserId: null,
    openedByUserId: null,
    approvedAt: null,
    openedAt: null,
    deadlineAt: null,
    responseWindowDays: 7,
    minimumResponses: 1,
    approvalNote: null,
    metadata: {
      workflow: "HEADTEACHER_CONFIDENTIAL_STAFF_FEEDBACK",
      districtZoneId: "district-one",
      districtName: "Akatsi South District",
      circuitZoneId: "circuit-one",
      circuitName: "Gefia Circuit",
      participantsFrozen: false,
      notificationsSeeded: false,
    },
    instrumentVersion: {
      id: "instrument-version-headteacher-staff-v1",
      version: 1,
      status: "ACTIVE",
      instrument: {
        id: "instrument-headteacher-staff",
        code: "HEADTEACHER_STAFF_FEEDBACK_V1",
        isActive: true,
      },
    },
  };

  return { now, target, teachers, cycle };
}

function makeDatabase(fixture) {
  const state = {
    target: clone(fixture.target),
    teachers: clone(fixture.teachers),
    cycle: clone(fixture.cycle),
    participants: [],
    audits: [],
    transactionOptions: [],
    participantCreateCalls: 0,
  };

  function projectCycle() {
    return {
      ...clone(state.cycle),
      _count: { participants: state.participants.length },
    };
  }

  const membership = {
    async findFirst() {
      return state.target ? clone(state.target) : null;
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

  const appraisalCycle = {
    async findUnique(args) {
      if (args?.where?.id !== state.cycle.id) return null;
      return projectCycle();
    },
    async update(args) {
      if (args?.where?.id !== state.cycle.id) fail("FAKE_CYCLE_NOT_FOUND");
      Object.assign(state.cycle, clone(args.data));
      return projectCycle();
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
    appraisalCycle,
    appraisalParticipant,
    auditLog,
  };

  return {
    state,
    appraisalCycle,
    async $transaction(operation, options) {
      state.transactionOptions.push(clone(options));

      const before = clone({
        cycle: state.cycle,
        participants: state.participants,
        audits: state.audits,
        participantCreateCalls: state.participantCreateCalls,
      });

      try {
        return await operation(tx);
      } catch (error) {
        state.cycle = before.cycle;
        state.participants = before.participants;
        state.audits = before.audits;
        state.participantCreateCalls = before.participantCreateCalls;
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

function approvalInput(database, fixture, overrides = {}) {
  return {
    actorUserId: "director-user",
    actorRoleName: "DISTRICT_DIRECTOR",
    governanceScope: {
      isSuperAdmin: false,
      tenantIds: ["school-one"],
    },
    cycleId: fixture.cycle.id,
    approvalNote: "Approved for the standard confidential response window.",
    reqId: "request-approval-0001",
    ip: "127.0.0.1",
    userAgent: "D3.4C3-QA",
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
    "headteacherFeedbackApproval.ts",
  );
  const source = fs.readFileSync(modulePath, "utf8");
  const approval = require(modulePath);

  assert(
    typeof approval.approveAndOpenHeadteacherFeedbackCycle === "function",
    "Approval service export missing",
  );
  assert(
    typeof approval.openHeadteacherFeedbackCycleWithinTransaction === "function",
    "Shared open core export missing",
  );

  const fixture = makeFixture();
  const database = makeDatabase(fixture);

  const created = await approval.approveAndOpenHeadteacherFeedbackCycle(
    approvalInput(database, fixture),
  );

  assertEqual(created.outcome, "APPROVED_AND_OPENED", "Approval outcome");
  assertEqual(created.cycle.status, "OPEN", "Cycle must open after approval");
  assertEqual(created.cycle.participantCount, 2, "Only two eligible teachers freeze");
  assertEqual(created.cycle.approvedAt, fixture.now.toISOString(), "Approval time");
  assertEqual(created.cycle.openedAt, fixture.now.toISOString(), "Open time");
  assertEqual(
    created.cycle.deadlineAt,
    "2026-08-03T12:00:00.000Z",
    "Seven calendar-day deadline",
  );
  assertEqual(created.cycle.notificationsSeeded, false, "Notifications remain separate");

  assertEqual(database.state.cycle.status, "OPEN", "Stored cycle status");
  assertEqual(database.state.cycle.approvedByUserId, "director-user", "Stored approver");
  assertEqual(database.state.cycle.openedByUserId, "director-user", "Stored opener");
  assertEqual(database.state.participants.length, 2, "Frozen participant count");
  assertEqual(database.state.participantCreateCalls, 1, "One participant freeze write");

  const respondentIds = database.state.participants
    .map((row) => row.respondentUserId)
    .sort();
  assertEqual(
    JSON.stringify(respondentIds),
    JSON.stringify(["teacher-user-1", "teacher-user-2"]),
    "Exact active same-school teachers",
  );

  for (const participant of database.state.participants) {
    assertEqual(participant.respondentTenantId, "school-one", "Exact tenant binding");
    assertEqual(participant.status, "NOT_STARTED", "Participant initial status");
    assertEqual(participant.invitedAt, null, "Invitation remains unseeded");
    assertEqual(
      participant.selectedAt.toISOString(),
      fixture.now.toISOString(),
      "Participant freeze time",
    );
    assertEqual(
      participant.eligibilitySnapshotJson.selectionBasis,
      "ACTIVE_TEACHER_MEMBERSHIP_AT_CYCLE_OPEN",
      "Eligibility snapshot basis",
    );
  }

  assertEqual(database.state.audits.length, 3, "Approval, participant and open audits");
  assertEqual(
    database.state.audits[0].action,
    "APPRAISAL_CYCLE_APPROVED",
    "Approval audit",
  );
  assertEqual(
    database.state.audits[1].action,
    "APPRAISAL_PARTICIPANTS_RESOLVED",
    "Participant audit",
  );
  assertEqual(
    database.state.audits[2].action,
    "APPRAISAL_CYCLE_OPENED",
    "Open audit",
  );
  assertAuditSafe(database.state.audits);

  assertEqual(
    database.state.transactionOptions[0].isolationLevel,
    "Serializable",
    "Serializable transaction",
  );
  assertEqual(database.state.transactionOptions[0].maxWait, 10000, "Bounded max wait");
  assertEqual(database.state.transactionOptions[0].timeout, 30000, "Bounded timeout");

  const repeated = await approval.approveAndOpenHeadteacherFeedbackCycle(
    approvalInput(database, fixture, { reqId: "request-approval-retry" }),
  );
  assertEqual(repeated.outcome, "EXISTING_OPEN", "Retry must be idempotent");
  assertEqual(database.state.participants.length, 2, "Retry creates no participants");
  assertEqual(database.state.audits.length, 3, "Retry creates no audits");
  assertEqual(database.state.participantCreateCalls, 1, "Retry does not freeze twice");

  const outOfScopeFixture = makeFixture();
  const outOfScopeDb = makeDatabase(outOfScopeFixture);
  await expectFailure(
    () =>
      approval.approveAndOpenHeadteacherFeedbackCycle(
        approvalInput(outOfScopeDb, outOfScopeFixture, {
          governanceScope: { isSuperAdmin: false, tenantIds: ["school-two"] },
        }),
      ),
    "HEADTEACHER_FEEDBACK_TARGET_OUTSIDE_GOVERNANCE_SCOPE",
  );

  const teacherActorFixture = makeFixture();
  const teacherActorDb = makeDatabase(teacherActorFixture);
  await expectFailure(
    () =>
      approval.approveAndOpenHeadteacherFeedbackCycle(
        approvalInput(teacherActorDb, teacherActorFixture, {
          actorUserId: "teacher-user-1",
          actorRoleName: "TEACHER",
        }),
      ),
    "HEADTEACHER_FEEDBACK_APPROVER_ROLE_FORBIDDEN",
  );

  const selectedFixture = makeFixture();
  const selectedDb = makeDatabase(selectedFixture);
  await expectFailure(
    () =>
      approval.approveAndOpenHeadteacherFeedbackCycle(
        approvalInput(selectedDb, selectedFixture, {
          requestedRespondentUserIds: ["teacher-user-1"],
        }),
      ),
    "HEADTEACHER_FEEDBACK_RESPONDENT_SELECTION_FORBIDDEN",
  );

  const preFrozenFixture = makeFixture();
  const preFrozenDb = makeDatabase(preFrozenFixture);
  preFrozenDb.state.participants.push({
    cycleId: preFrozenFixture.cycle.id,
    respondentUserId: "teacher-user-1",
  });
  await expectFailure(
    () =>
      approval.approveAndOpenHeadteacherFeedbackCycle(
        approvalInput(preFrozenDb, preFrozenFixture),
      ),
    "HEADTEACHER_FEEDBACK_PARTICIPANTS_FROZEN_BEFORE_OPEN",
  );

  const noTeachersFixture = makeFixture();
  noTeachersFixture.teachers = noTeachersFixture.teachers.filter(
    (row) => row.role.name !== "TEACHER" || row.status !== "ACTIVE" || row.tenantId !== "school-one",
  );
  const noTeachersDb = makeDatabase(noTeachersFixture);
  await expectFailure(
    () =>
      approval.approveAndOpenHeadteacherFeedbackCycle(
        approvalInput(noTeachersDb, noTeachersFixture),
      ),
    "HEADTEACHER_FEEDBACK_NO_ELIGIBLE_TEACHERS",
  );
  assertEqual(noTeachersDb.state.cycle.status, "PENDING_APPROVAL", "Failed open rolls back");
  assertEqual(noTeachersDb.state.audits.length, 0, "Failed open writes no audit");

  const duplicateFixture = makeFixture();
  duplicateFixture.teachers.push({
    ...clone(duplicateFixture.teachers[0]),
    id: "membership-teacher-1-duplicate",
  });
  const duplicateDb = makeDatabase(duplicateFixture);
  await expectFailure(
    () =>
      approval.approveAndOpenHeadteacherFeedbackCycle(
        approvalInput(duplicateDb, duplicateFixture),
      ),
    "HEADTEACHER_FEEDBACK_DUPLICATE_ELIGIBLE_TEACHER",
  );
  assertEqual(duplicateDb.state.participants.length, 0, "Duplicate data freezes nobody");

  const inactiveTargetFixture = makeFixture();
  inactiveTargetFixture.target.status = "INACTIVE";
  const inactiveTargetDb = makeDatabase(inactiveTargetFixture);
  await expectFailure(
    () =>
      approval.approveAndOpenHeadteacherFeedbackCycle(
        approvalInput(inactiveTargetDb, inactiveTargetFixture),
      ),
    "HEADTEACHER_FEEDBACK_TARGET_MEMBERSHIP_INACTIVE",
  );

  const movedFixture = makeFixture();
  movedFixture.target.tenant.zone.parentZone.id = "district-two";
  movedFixture.target.tenant.zone.parentZone.name = "Other District";
  movedFixture.target.tenant.zone.parentZoneId = "district-two";
  const movedDb = makeDatabase(movedFixture);
  await expectFailure(
    () =>
      approval.approveAndOpenHeadteacherFeedbackCycle(
        approvalInput(movedDb, movedFixture),
      ),
    "HEADTEACHER_FEEDBACK_JURISDICTION_CHANGED_SINCE_REQUEST",
  );

  const instrumentFixture = makeFixture();
  instrumentFixture.cycle.instrumentVersion.instrument.code = "WRONG_INSTRUMENT";
  const instrumentDb = makeDatabase(instrumentFixture);
  await expectFailure(
    () =>
      approval.approveAndOpenHeadteacherFeedbackCycle(
        approvalInput(instrumentDb, instrumentFixture),
      ),
    "HEADTEACHER_FEEDBACK_APPROVAL_CYCLE_CONTRACT_INVALID",
  );

  for (const forbidden of [
    "appraisalNotification",
    "AppraisalNotificationChannel",
    "sendSms",
    "sendEmail",
    "fetch(",
    "providerMessageId",
  ]) {
    assert(!source.includes(forbidden), "C3 must not seed or deliver notifications", {
      forbidden,
    });
  }

  assert(
    source.includes("openHeadteacherFeedbackCycleWithinTransaction"),
    "Shared opening core required for D3.4C4",
  );
  assert(
    source.includes('openingMode: "APPROVAL" | "DIRECT_OPEN"'),
    "Shared core must anticipate Director direct-open without duplicating freeze logic",
  );

  console.log("");
  console.log("=== D3.4C3 HEADTEACHER APPROVAL + OPEN TRANSACTION ===");
  console.log("");
  console.log("Pending request authority      : Director/Superadmin within scope");
  console.log("Lifecycle transition           : PENDING_APPROVAL -> OPEN");
  console.log("Target revalidation            : active Headteacher + active school");
  console.log("Jurisdiction drift             : fails closed");
  console.log("Eligible teacher query         : exact target tenant only");
  console.log("Participant freeze             : active same-school teachers only");
  console.log("Duplicate eligibility          : fails closed");
  console.log("Opened/deadline timestamps     : same open event + 7 days");
  console.log("Approval/open audits           : privacy-safe");
  console.log("Retry behavior                 : EXISTING_OPEN, no duplicate writes");
  console.log("Transaction                    : serializable and bounded");
  console.log("Notification records           : absent");
  console.log("Provider calls                 : absent");
  console.log("Shared direct-open core        : prepared for D3.4C4");
  console.log("Database accessed              : false");
  console.log("");
  console.log("RESULT: D3.4C3 HEADTEACHER APPROVAL TRANSACTION GREEN");
}

main().catch((error) => {
  console.error("");
  console.error("RESULT: D3.4C3 HEADTEACHER APPROVAL TRANSACTION FAILED");
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
