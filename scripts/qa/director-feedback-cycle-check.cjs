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
  if ((transpiled.diagnostics ?? []).length) {
    fail("D3_3A_TYPESCRIPT_TRANSPILE_FAILED", transpiled.diagnostics);
  }
  module._compile(transpiled.outputText, filename);
};

function clone(value) {
  return structuredClone(value);
}

function makeFixture() {
  const now = new Date("2026-07-25T10:00:00.000Z");
  const director = {
    id: "director-assignment",
    userId: "director-user",
    role: "DISTRICT_DIRECTOR",
    status: "ACTIVE",
    revokedAt: null,
    startsAt: null,
    endsAt: null,
    title: "District Director Akatsi South District",
    user: {
      id: "director-user",
      name: "Karim Ayana Umar",
      firstName: "Karim",
      lastName: "Umar",
      email: "director.akatsi.test@edulifeos.local",
    },
    zone: {
      id: "district-zone",
      name: "Akatsi South District",
      countryCode: "GH",
      isActive: true,
      zoneType: { level: 2, name: "District", countryCode: "GH" },
    },
  };

  const circuits = [
    { id: "circuit-one", name: "Gefia Circuit" },
    { id: "circuit-two", name: "Avenorpeme Circuit" },
  ];

  const memberships = Array.from({ length: 6 }, (_, index) => {
    const circuit = circuits[index % circuits.length];
    return {
      id: `membership-${index + 1}`,
      userId: `headteacher-${index + 1}`,
      tenantId: `school-${index + 1}`,
      status: "ACTIVE",
      role: { name: "HEADTEACHER" },
      user: { id: `headteacher-${index + 1}` },
      tenant: {
        id: `school-${index + 1}`,
        name: `School ${index + 1}`,
        status: "ACTIVE",
        zone: {
          id: circuit.id,
          name: circuit.name,
          parentZoneId: "district-zone",
          isActive: true,
          zoneType: { level: 1, countryCode: "GH" },
        },
      },
    };
  });

  return { now, director, memberships };
}

function makeDatabase(fixture) {
  const state = {
    cycles: [],
    audits: [],
    transactionOptions: [],
  };

  function projectCycle(cycle) {
    return {
      id: cycle.id,
      status: cycle.status,
      targetNameSnapshot: cycle.targetNameSnapshot,
      targetRoleSnapshot: cycle.targetRoleSnapshot,
      targetZoneNameSnapshot: cycle.targetZoneNameSnapshot,
      scopeZoneId: cycle.scopeZoneId,
      openedAt: cycle.openedAt,
      deadlineAt: cycle.deadlineAt,
      responseWindowDays: cycle.responseWindowDays,
      minimumResponses: cycle.minimumResponses,
      extensionCount: cycle.extensionCount,
      closedAt: cycle.closedAt ?? null,
      closedByUserId: cycle.closedByUserId ?? null,
      metadata: clone(cycle.metadata),
      _count: { participants: cycle.participants.length },
      participants: cycle.participants.map((row) => ({
        eligibilitySnapshotJson: clone(row.eligibilitySnapshotJson),
      })),
    };
  }

  const cycleDelegate = {
    async findUnique(args) {
      const where = args.where ?? {};
      const cycle = state.cycles.find(
        (row) =>
          (where.id && row.id === where.id) ||
          (where.idempotencyKey && row.idempotencyKey === where.idempotencyKey),
      );
      return cycle ? projectCycle(cycle) : null;
    },
    async findFirst(args) {
      const where = args.where ?? {};
      const cycle = state.cycles.find((row) => {
        if (where.scopeZoneId && row.scopeZoneId !== where.scopeZoneId) return false;
        if (where.targetUserId && row.targetUserId !== where.targetUserId) return false;
        if (
          where.instrumentVersionId &&
          row.instrumentVersionId !== where.instrumentVersionId
        ) return false;
        if (where.status?.in && !where.status.in.includes(row.status)) return false;
        return true;
      });
      return cycle ? projectCycle(cycle) : null;
    },
    async create(args) {
      const data = clone(args.data);
      const participants = (data.participants?.create ?? []).map((row, index) => ({
        id: `participant-${state.cycles.length + 1}-${index + 1}`,
        ...row,
      }));
      const cycle = {
        id: `00000000-0000-4000-8000-${String(state.cycles.length + 1).padStart(12, "0")}`,
        ...data,
        closedAt: null,
        closedByUserId: null,
        participants,
      };
      delete cycle.participants.create;
      state.cycles.push(cycle);
      return projectCycle(cycle);
    },
    async update(args) {
      const cycle = state.cycles.find((row) => row.id === args.where.id);
      if (!cycle) fail("FAKE_CYCLE_NOT_FOUND");
      const data = args.data;
      for (const [key, value] of Object.entries(data)) {
        if (value && typeof value === "object" && "increment" in value) {
          cycle[key] += value.increment;
        } else {
          cycle[key] = clone(value);
        }
      }
      return {
        id: cycle.id,
        status: cycle.status,
        deadlineAt: cycle.deadlineAt,
        extensionCount: cycle.extensionCount,
      };
    },
  };

  const tx = {
    appraisalCycle: cycleDelegate,
    auditLog: {
      async create(args) {
        state.audits.push(clone(args.data));
        return args.data;
      },
    },
  };

  return {
    state,
    governanceOfficerAssignment: {
      async findFirst() {
        return clone(fixture.director);
      },
    },
    appraisalInstrumentVersion: {
      async findFirst() {
        return {
          id: "instrument-version",
          version: 1,
          status: "ACTIVE",
          instrument: {
            id: "instrument",
            code: "DIRECTOR_GOVERNANCE_APPRAISAL_V1",
            isActive: true,
          },
        };
      },
    },
    membership: {
      async findMany() {
        return clone(fixture.memberships);
      },
    },
    appraisalCycle: cycleDelegate,
    async $transaction(operation, options) {
      state.transactionOptions.push(clone(options));
      return operation(tx);
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

async function main() {
  const modulePath = path.join(
    repoRoot,
    "src",
    "lib",
    "appraisals",
    "directorFeedback.ts",
  );
  const authorityPath = path.join(
    repoRoot,
    "src",
    "lib",
    "appraisals",
    "authority.ts",
  );
  const directorFeedback = require(modulePath);
  const authority = require(authorityPath);

  const {
    DIRECTOR_FEEDBACK_POLICY,
    directorFeedbackMunicipalReleaseBand,
    directorFeedbackCircuitDisclosure,
    openDirectorFeedbackCycle,
    extendOrReopenDirectorFeedbackCycle,
  } = directorFeedback;

  assertEqual(DIRECTOR_FEEDBACK_POLICY.responseWindowDays, 7, "Seven-day window");
  assertEqual(DIRECTOR_FEEDBACK_POLICY.minimumMunicipalResponses, 5, "Minimum municipal threshold");
  assertEqual(DIRECTOR_FEEDBACK_POLICY.preferredMunicipalResponses, 10, "Preferred municipal threshold");
  assertEqual(DIRECTOR_FEEDBACK_POLICY.circuitDisclosureThreshold, 5, "Circuit privacy threshold");
  assertEqual(DIRECTOR_FEEDBACK_POLICY.commentsAllowed, false, "Comments disabled");
  assertEqual(DIRECTOR_FEEDBACK_POLICY.identityAccessRole, "SUPERADMIN", "Superadmin identity scope");

  assertEqual(directorFeedbackMunicipalReleaseBand(4), "BLOCKED", "Municipal blocked band");
  assertEqual(directorFeedbackMunicipalReleaseBand(5), "LIMITED", "Municipal limited band");
  assertEqual(directorFeedbackMunicipalReleaseBand(10), "PREFERRED", "Municipal preferred band");

  const hiddenCircuit = directorFeedbackCircuitDisclosure(4);
  assertEqual(hiddenCircuit.visible, false, "Small circuit must remain hidden");
  assertEqual(hiddenCircuit.exactResponseCount, null, "Small circuit exact count hidden");
  const visibleCircuit = directorFeedbackCircuitDisclosure(5);
  assertEqual(visibleCircuit.visible, true, "Threshold circuit visible");
  assertEqual(visibleCircuit.exactResponseCount, 5, "Threshold count visible");

  assert(
    authority.hasAppraisalCapability("DISTRICT_DIRECTOR", "OPEN_DIRECTOR_FEEDBACK_CYCLE"),
    "Director must be able to open own feedback cycle",
  );
  assert(
    !authority.hasAppraisalCapability("DISTRICT_DIRECTOR", "EXTEND_DIRECTOR_FEEDBACK_CYCLE"),
    "Director must not extend own cycle",
  );
  assert(
    !authority.hasAppraisalCapability("DISTRICT_DIRECTOR", "VIEW_CONFIDENTIAL_RESPONDENTS"),
    "Director must not access real respondent identities",
  );
  assert(
    authority.hasAppraisalCapability("SUPERADMIN", "VIEW_CONFIDENTIAL_RESPONDENTS"),
    "Superadmin must retain audited identity oversight",
  );

  const fixture = makeFixture();
  const database = makeDatabase(fixture);
  const openInput = {
    actorUserId: "director-user",
    actorRoleName: "DISTRICT_DIRECTOR",
    cycleKey: "2026-ANNUAL-FEEDBACK",
    requestReason: "Annual confidential leadership feedback",
    reqId: "request-0001",
    now: fixture.now,
    database,
  };

  const created = await openDirectorFeedbackCycle(openInput);
  assertEqual(created.outcome, "CREATED", "Cycle creation outcome");
  assertEqual(created.cycle.status, "OPEN", "Cycle opens directly");
  assertEqual(created.cycle.eligibleHeadteachers, 6, "Frozen headteacher count");
  assertEqual(created.cycle.eligibleCircuits, 2, "Frozen circuit count");
  assertEqual(created.cycle.minimumResponses, 5, "Stored municipal threshold");
  assertEqual(created.cycle.privacy.identityAccessRole, "SUPERADMIN", "Safe identity policy");
  assertEqual(created.cycle.privacy.schoolsVisibleToDirector, false, "Schools hidden");
  assertEqual(
    created.cycle.deadlineAt,
    "2026-08-01T10:00:00.000Z",
    "Seven calendar-day deadline",
  );
  assertEqual(database.state.cycles.length, 1, "One cycle stored");
  assertEqual(database.state.audits.length, 2, "Open and participant audits");
  assertEqual(database.state.transactionOptions[0].timeout, 30000, "Bounded transaction timeout");
  assertEqual(database.state.cycles[0].participants.length, 6, "Participants frozen");

  const firstSnapshot = database.state.cycles[0].participants[0].eligibilitySnapshotJson;
  assert(firstSnapshot.circuitZoneId, "Circuit snapshot required");
  assert(firstSnapshot.tenantId, "Tenant eligibility snapshot required");

  const repeated = await openDirectorFeedbackCycle(openInput);
  assertEqual(repeated.outcome, "EXISTING_MATCH", "Open is idempotent");
  assertEqual(database.state.cycles.length, 1, "No duplicate cycle");
  assertEqual(database.state.audits.length, 2, "No duplicate audit");

  await expectFailure(
    () =>
      openDirectorFeedbackCycle({
        ...openInput,
        actorUserId: "different-director",
        targetDirectorUserId: "director-user",
      }),
    "DIRECTOR_FEEDBACK_DIRECTOR_MAY_ONLY_OPEN_OWN_CYCLE",
  );

  await expectFailure(
    () =>
      extendOrReopenDirectorFeedbackCycle({
        actorUserId: "director-user",
        actorRoleName: "DISTRICT_DIRECTOR",
        cycleId: database.state.cycles[0].id,
        reason: "Director asks for additional response time",
        reqId: "request-0002",
        now: fixture.now,
        database,
      }),
    "CAPABILITY_NOT_GRANTED",
  );

  const extended = await extendOrReopenDirectorFeedbackCycle({
    actorUserId: "superadmin-user",
    actorRoleName: "SUPERADMIN",
    cycleId: database.state.cycles[0].id,
    reason: "Municipal network outage affected headteacher access",
    additionalDays: 3,
    reqId: "request-0003",
    now: fixture.now,
    database,
  });
  assertEqual(extended.outcome, "EXTENDED", "Superadmin extension outcome");
  assertEqual(extended.extensionCount, 1, "Extension count");
  assertEqual(database.state.audits.length, 3, "Extension audit added");

  database.state.cycles[0].status = "CLOSED";
  database.state.cycles[0].closedAt = new Date("2026-08-04T10:00:00.000Z");
  database.state.cycles[0].closedByUserId = "system-user";

  const reopened = await extendOrReopenDirectorFeedbackCycle({
    actorUserId: "superadmin-user",
    actorRoleName: "SUPERADMIN",
    cycleId: database.state.cycles[0].id,
    reason: "Approved controlled reopening after documented outage",
    additionalDays: 2,
    reqId: "request-0004",
    now: new Date("2026-08-04T12:00:00.000Z"),
    database,
  });
  assertEqual(reopened.outcome, "REOPENED", "Superadmin reopen outcome");
  assertEqual(database.state.cycles[0].status, "OPEN", "Reopened status");
  assertEqual(database.state.cycles[0].closedAt, null, "Closure timestamp cleared");
  assertEqual(database.state.audits.length, 4, "Reopen audit added");

  const duplicateFixture = makeFixture();
  duplicateFixture.memberships.push({
    ...clone(duplicateFixture.memberships[0]),
    id: "membership-duplicate",
    tenantId: "school-duplicate",
    tenant: {
      ...clone(duplicateFixture.memberships[0].tenant),
      id: "school-duplicate",
      name: "Duplicate School",
    },
  });
  await expectFailure(
    () =>
      openDirectorFeedbackCycle({
        ...openInput,
        database: makeDatabase(duplicateFixture),
      }),
    "DIRECTOR_FEEDBACK_DUPLICATE_HEADTEACHER_ASSIGNMENT",
  );

  const source = fs.readFileSync(modulePath, "utf8");
  assert(
    !source.includes("schoolNameSnapshot") &&
      !source.includes("respondentNameSnapshot"),
    "Director cycle service must not create Director-facing identity fields",
  );

  console.log("");
  console.log("=== D3.3A CONFIDENTIAL DIRECTOR FEEDBACK CYCLE PROOF ===");
  console.log("");
  console.log("Director may open own cycle : verified");
  console.log("Standard response window    : 7 calendar days");
  console.log("Eligible headteachers       : frozen at opening");
  console.log("Circuit snapshot            : frozen at opening");
  console.log("Municipal minimum/preferred : 5 / 10");
  console.log("Circuit disclosure threshold: 5");
  console.log("Director identity access    : forbidden");
  console.log("Superadmin identity access  : contract-only, audited later");
  console.log("Director extend/reopen      : forbidden");
  console.log("Superadmin extend/reopen    : reason + audit required");
  console.log("Duplicate cycles            : idempotently prevented");
  console.log("Duplicate head assignments  : fail closed");
  console.log("Free-text comments          : disabled");
  console.log("Database accessed           : false");
  console.log("");
  console.log("RESULT: D3.3A CONFIDENTIAL CYCLE CONTRACT GREEN");
}

main().catch((error) => {
  console.error("");
  console.error("RESULT: D3.3A CONFIDENTIAL CYCLE CONTRACT FAILED");
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
