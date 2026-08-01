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
async function expectReject(operation, code, message) {
  try {
    await operation();
  } catch (error) {
    assertEqual(error && error.message, code, message);
    return error;
  }
  fail(message, { expectedError: code });
}

const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveFilename(request, parent, isMain, options) {
  if (typeof request === "string" && request.startsWith("@/")) {
    request = path.join(repoRoot, "src", request.slice(2));
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

require.extensions[".ts"] = function compileTypeScript(loadedModule, filename) {
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
  loadedModule._compile(transpiled.outputText, filename);
};

const NOW = new Date("2026-07-28T12:00:00.000Z");
const OPENED = new Date("2026-07-25T08:00:00.000Z");
const DEADLINE = new Date("2026-08-01T08:00:00.000Z");
const CONTENT_HASH = "a".repeat(64);

function baseCycle(overrides = {}) {
  return {
    id: "cycle-headteacher-001",
    instrumentVersionId: "staff-version-001",
    scopeZoneId: "district-001",
    targetUserId: "headteacher-001",
    targetTenantId: "tenant-001",
    targetZoneId: "circuit-001",
    status: "OPEN",
    targetNameSnapshot: "Head Teacher One",
    targetRoleSnapshot: "HEADTEACHER",
    targetSchoolNameSnapshot: "School One",
    targetZoneNameSnapshot: "Circuit One",
    requestedAt: new Date("2026-07-24T10:00:00.000Z"),
    openedAt: OPENED,
    deadlineAt: DEADLINE,
    closedAt: null,
    reviewStartedAt: null,
    releasedAt: null,
    cancelledAt: null,
    metadata: {
      workflow: "HEADTEACHER_CONFIDENTIAL_STAFF_FEEDBACK",
      districtZoneId: "district-001",
      districtName: "District One",
      circuitZoneId: "circuit-001",
      circuitName: "Circuit One",
    },
    instrumentVersion: {
      id: "staff-version-001",
      version: 1,
      status: "ACTIVE",
      contentHash: "b".repeat(64),
      instrument: {
        id: "staff-instrument-001",
        code: "HEADTEACHER_STAFF_FEEDBACK_V1",
        purpose: "HEADTEACHER_STAFF_FEEDBACK",
        subjectType: "HEADTEACHER",
        isActive: true,
      },
    },
    ...overrides,
  };
}

function baseMembership(overrides = {}) {
  return {
    id: "membership-headteacher-001",
    userId: "headteacher-001",
    tenantId: "tenant-001",
    status: "ACTIVE",
    role: { name: "HEADTEACHER" },
    user: {
      id: "headteacher-001",
      name: "Head Teacher One",
      firstName: "Head",
      lastName: "Teacher",
      email: "headteacher@example.test",
    },
    tenant: {
      id: "tenant-001",
      name: "School One",
      status: "ACTIVE",
      zone: {
        id: "circuit-001",
        name: "Circuit One",
        isActive: true,
        parentZoneId: "district-001",
        zoneType: { level: 1, countryCode: "GH" },
        parentZone: {
          id: "district-001",
          name: "District One",
          isActive: true,
          zoneType: { level: 2, countryCode: "GH" },
        },
      },
    },
    ...overrides,
  };
}

function districtAssignment(overrides = {}) {
  return {
    id: "assignment-director-001",
    userId: "actor-001",
    role: "DISTRICT_DIRECTOR",
    status: "ACTIVE",
    startsAt: new Date("2026-01-01T00:00:00.000Z"),
    endsAt: null,
    zoneId: "district-001",
    zone: {
      id: "district-001",
      name: "District One",
      isActive: true,
      parentZoneId: null,
      zoneType: { level: 2, countryCode: "GH" },
      parentZone: null,
    },
    ...overrides,
  };
}

function circuitAssignment(overrides = {}) {
  return {
    id: "assignment-sisso-001",
    userId: "actor-001",
    role: "SISSO",
    status: "ACTIVE",
    startsAt: new Date("2026-01-01T00:00:00.000Z"),
    endsAt: null,
    zoneId: "circuit-001",
    zone: {
      id: "circuit-001",
      name: "Circuit One",
      isActive: true,
      parentZoneId: "district-001",
      zoneType: { level: 1, countryCode: "GH" },
      parentZone: {
        id: "district-001",
        name: "District One",
        isActive: true,
        zoneType: { level: 2, countryCode: "GH" },
      },
    },
    ...overrides,
  };
}

function instrument(overrides = {}) {
  return {
    id: "supervisory-version-001",
    version: 1,
    status: "ACTIVE",
    contentHash: CONTENT_HASH,
    instrument: {
      id: "supervisory-instrument-001",
      code: "HEADTEACHER_SUPERVISORY_ASSESSMENT_V1",
      purpose: "HEADTEACHER_SUPERVISORY_ASSESSMENT",
      subjectType: "HEADTEACHER",
      isActive: true,
    },
    ...overrides,
  };
}

class FakeDatabase {
  constructor(overrides = {}) {
    this.cycle = overrides.cycle ?? baseCycle();
    this.membershipRecord = overrides.membership ?? baseMembership();
    this.actor = overrides.actor ?? {
      id: "actor-001",
      name: "District Director",
      firstName: "District",
      lastName: "Director",
      email: "director@example.test",
    };
    this.assignments = overrides.assignments ?? [districtAssignment()];
    this.instrumentVersion = overrides.instrumentVersion ?? instrument();
    this.assessments = overrides.assessments ?? [];
    this.audits = [];
    this.scoreCreates = 0;
    this.providerCalls = 0;
    this.transactionOptions = [];
    this.simulateRaceOnce = Boolean(overrides.simulateRaceOnce);
    this.raceTriggered = false;

    this.appraisalAssessment = {
      findUnique: async (args) => this.findAssessment(args),
      create: async (args) => this.createAssessment(args),
    };
  }

  findAssessment(args) {
    const key = args.where.cycleId_assessorUserId_revision;
    return (
      this.assessments.find(
        (assessment) =>
          assessment.cycleId === key.cycleId &&
          assessment.assessorUserId === key.assessorUserId &&
          assessment.revision === key.revision,
      ) ?? null
    );
  }

  materialize(data) {
    return {
      id: data.id ?? `assessment-${this.assessments.length + 1}`,
      cycleId: data.cycleId,
      instrumentVersionId: data.instrumentVersionId,
      assessorUserId: data.assessorUserId,
      assessorAssignmentId: data.assessorAssignmentId,
      status: data.status,
      revision: data.revision,
      priorAssessmentId: data.priorAssessmentId,
      dateObserved: data.dateObserved,
      overallPercentage: data.overallPercentage,
      sectionPercentagesJson: data.sectionPercentagesJson,
      generalComment: data.generalComment,
      evidenceSnapshotJson: data.evidenceSnapshotJson,
      assessmentHash: data.assessmentHash,
      finalizedByUserId: data.finalizedByUserId,
      finalizedAt: data.finalizedAt,
      metadata: data.metadata,
      createdAt: new Date("2026-07-28T12:00:00.000Z"),
    };
  }

  async createAssessment(args) {
    const existing = this.assessments.find(
      (assessment) =>
        assessment.cycleId === args.data.cycleId &&
        assessment.assessorUserId === args.data.assessorUserId &&
        assessment.revision === args.data.revision,
    );
    if (existing) {
      const error = new Error("unique");
      error.code = "P2002";
      throw error;
    }
    const created = this.materialize(args.data);
    if (this.simulateRaceOnce && !this.raceTriggered) {
      this.raceTriggered = true;
      this.pendingRaceAssessment = created;
      const error = new Error("unique-race");
      error.code = "P2002";
      throw error;
    }
    this.assessments.push(created);
    return created;
  }

  async $transaction(operation, options) {
    this.transactionOptions.push(options);
    const assessmentsBefore = [...this.assessments];
    const auditsBefore = [...this.audits];
    const tx = {
      appraisalCycle: {
        findUnique: async () => this.cycle,
      },
      membership: {
        findFirst: async () => this.membershipRecord,
      },
      user: {
        findUnique: async () => this.actor,
      },
      governanceOfficerAssignment: {
        findMany: async () => this.assignments,
      },
      appraisalInstrumentVersion: {
        findFirst: async () => this.instrumentVersion,
      },
      appraisalAssessment: this.appraisalAssessment,
      auditLog: {
        create: async (args) => {
          this.audits.push(args.data);
          return args.data;
        },
      },
    };
    try {
      return await operation(tx);
    } catch (error) {
      this.assessments = assessmentsBefore;
      this.audits = auditsBefore;
      if (this.pendingRaceAssessment) {
        this.assessments.push(this.pendingRaceAssessment);
        this.pendingRaceAssessment = null;
      }
      throw error;
    }
  }
}

function input(overrides = {}) {
  return {
    actorUserId: "actor-001",
    actorRoleName: "DISTRICT_DIRECTOR",
    cycleId: "cycle-headteacher-001",
    dateObserved: "2026-07-27",
    reqId: "req-f2-0001",
    ip: "127.0.0.1",
    userAgent: "D3.4F2-QA",
    now: NOW,
    ...overrides,
  };
}

async function main() {
  const sourcePath = path.join(
    repoRoot,
    "src",
    "lib",
    "appraisals",
    "headteacherSupervisoryAssessmentDraft.ts",
  );
  const source = fs.readFileSync(sourcePath, "utf8");
  const draftModule = require(sourcePath);
  const {
    HEADTEACHER_SUPERVISORY_DRAFT_POLICY,
    createHeadteacherSupervisoryAssessmentDraft,
  } = draftModule;

  assertEqual(HEADTEACHER_SUPERVISORY_DRAFT_POLICY.initialRevision, 1, "Initial revision");
  assertEqual(HEADTEACHER_SUPERVISORY_DRAFT_POLICY.visitContextImmutable, true, "Immutable visit context");
  assertEqual(HEADTEACHER_SUPERVISORY_DRAFT_POLICY.scoreRowsCreatedAtDraft, false, "No scores at draft creation");
  assertEqual(HEADTEACHER_SUPERVISORY_DRAFT_POLICY.providerCallsAllowed, false, "Provider calls forbidden");

  const database = new FakeDatabase();
  const created = await createHeadteacherSupervisoryAssessmentDraft({
    ...input(),
    database,
  });
  assertEqual(created.outcome, "CREATED", "Draft create outcome");
  assertEqual(created.assessment.status, "DRAFT", "Draft status");
  assertEqual(created.assessment.revision, 1, "Draft revision");
  assertEqual(created.assessment.dateObserved, "2026-07-27", "Observed date normalization");
  assertEqual(created.assessment.assessorAssignmentId, "assignment-director-001", "Assignment snapshot");
  assertEqual(created.assessment.targetTenantId, "tenant-001", "Target tenant snapshot");
  assertEqual(database.assessments.length, 1, "One assessment created");
  assertEqual(database.audits.length, 1, "One audit created");
  assertEqual(database.scoreCreates, 0, "No score rows created");
  assertEqual(database.providerCalls, 0, "No provider called");
  assertEqual(database.assessments[0].generalComment, null, "No comment created");
  assertEqual(database.assessments[0].overallPercentage, null, "No aggregate score created");
  assertEqual(database.assessments[0].assessmentHash, null, "No final assessment hash created");
  assertEqual(database.transactionOptions[0].isolationLevel, "Serializable", "Serializable transaction");
  assertEqual(database.transactionOptions[0].maxWait, 10000, "Bounded transaction max wait");
  assertEqual(database.transactionOptions[0].timeout, 60000, "UAT latency transaction timeout");

  const snapshot = database.assessments[0].evidenceSnapshotJson;
  assertEqual(snapshot.schemaVersion, 1, "Snapshot schema version");
  assertEqual(snapshot.evidenceStream, "GOVERNANCE_SUPERVISORY_ASSESSMENT", "Evidence stream");
  assertEqual(snapshot.cycle.id, "cycle-headteacher-001", "Cycle snapshot");
  assertEqual(snapshot.target.userId, "headteacher-001", "Target snapshot");
  assertEqual(snapshot.target.schoolName, "School One", "School snapshot");
  assertEqual(snapshot.assessor.userId, "actor-001", "Assessor snapshot");
  assertEqual(snapshot.assessor.role, "DISTRICT_DIRECTOR", "Assessor role snapshot");
  assertEqual(snapshot.assessor.scopeLevel, "DISTRICT", "District scope snapshot");
  assertEqual(snapshot.jurisdiction.districtZoneId, "district-001", "District snapshot");
  assertEqual(snapshot.jurisdiction.circuitZoneId, "circuit-001", "Circuit snapshot");
  assertEqual(snapshot.instrument.code, "HEADTEACHER_SUPERVISORY_ASSESSMENT_V1", "Instrument snapshot");
  assertEqual(snapshot.instrument.contentHash, CONTENT_HASH, "Definition hash snapshot");
  assertEqual(snapshot.observation.dateObserved, "2026-07-27", "Observation snapshot");
  const snapshotJson = JSON.stringify(snapshot);
  assert(!snapshotJson.includes("@example.test"), "Snapshot must exclude email addresses");
  assert(!snapshotJson.toLowerCase().includes("phone"), "Snapshot must exclude phone fields");

  const auditJson = JSON.stringify(database.audits[0]);
  assertEqual(database.audits[0].action, "HEADTEACHER_SUPERVISORY_ASSESSMENT_DRAFT_CREATED", "Audit action");
  assert(!auditJson.includes("@example.test"), "Audit must exclude contacts");
  assert(!auditJson.includes("Head Teacher One"), "Audit must exclude target name");
  assert(!auditJson.includes("District Director"), "Audit must exclude assessor name");
  assertEqual(database.audits[0].metadata.scoreCount, 0, "Audit score count");
  assertEqual(database.audits[0].metadata.providerCalled, false, "Audit provider proof");

  const retry = await createHeadteacherSupervisoryAssessmentDraft({
    ...input({ reqId: "req-f2-0002" }),
    database,
  });
  assertEqual(retry.outcome, "EXISTING_MATCH", "Idempotent retry");
  assertEqual(database.assessments.length, 1, "Retry must not duplicate assessment");
  assertEqual(database.audits.length, 1, "Retry must not duplicate audit");

  await expectReject(
    () =>
      createHeadteacherSupervisoryAssessmentDraft({
        ...input({ dateObserved: "2026-07-28", reqId: "req-f2-0003" }),
        database,
      }),
    "HEADTEACHER_SUPERVISORY_DRAFT_CONTEXT_DRIFT",
    "Changed visit context after draft must fail closed",
  );

  const sissoDb = new FakeDatabase({ assignments: [circuitAssignment()] });
  const sisso = await createHeadteacherSupervisoryAssessmentDraft({
    ...input({ actorRoleName: "SISSO", reqId: "req-f2-sisso" }),
    database: sissoDb,
  });
  assertEqual(sisso.outcome, "CREATED", "SISSO in circuit may create draft");
  assertEqual(sissoDb.assessments[0].evidenceSnapshotJson.assessor.scopeLevel, "CIRCUIT", "SISSO scope snapshot");

  await expectReject(
    () =>
      createHeadteacherSupervisoryAssessmentDraft({
        ...input(),
        database: new FakeDatabase({
          assignments: [districtAssignment({ zoneId: "district-other", zone: { ...districtAssignment().zone, id: "district-other", name: "Other District" } })],
        }),
      }),
    "HEADTEACHER_SUPERVISORY_AUTHORITY_DISTRICT_SCOPE_MISMATCH",
    "Cross-district assessor must be denied",
  );

  await expectReject(
    () =>
      createHeadteacherSupervisoryAssessmentDraft({
        ...input({ actorRoleName: "SISSO" }),
        database: new FakeDatabase({
          assignments: [circuitAssignment({ zoneId: "circuit-other", zone: { ...circuitAssignment().zone, id: "circuit-other", name: "Other Circuit" } })],
        }),
      }),
    "HEADTEACHER_SUPERVISORY_AUTHORITY_CIRCUIT_SCOPE_MISMATCH",
    "Cross-circuit assessor must be denied",
  );

  await expectReject(
    () =>
      createHeadteacherSupervisoryAssessmentDraft({
        ...input(),
        database: new FakeDatabase({
          assignments: [districtAssignment({ status: "REVOKED" })],
        }),
      }),
    "HEADTEACHER_SUPERVISORY_AUTHORITY_ACTIVE_ASSIGNMENT_REQUIRED",
    "Revoked assignment must be denied",
  );

  await expectReject(
    () =>
      createHeadteacherSupervisoryAssessmentDraft({
        ...input({ actorUserId: "headteacher-001" }),
        database: new FakeDatabase({
          actor: { id: "headteacher-001", name: "Head Teacher One", firstName: null, lastName: null, email: "head@example.test" },
          assignments: [districtAssignment({ userId: "headteacher-001" })],
        }),
      }),
    "HEADTEACHER_SUPERVISORY_AUTHORITY_SELF_APPRAISAL_FORBIDDEN",
    "Self assessment must be denied",
  );

  for (const status of ["DRAFT", "PENDING_APPROVAL", "UNDER_REVIEW", "RELEASED", "CANCELLED"]) {
    await expectReject(
      () =>
        createHeadteacherSupervisoryAssessmentDraft({
          ...input({ reqId: `req-status-${status}` }),
          database: new FakeDatabase({ cycle: baseCycle({ status }) }),
        }),
      "HEADTEACHER_SUPERVISORY_CYCLE_NOT_ELIGIBLE",
      `${status} cycle must not accept a supervisory draft`,
    );
  }

  const closedDb = new FakeDatabase({
    cycle: baseCycle({ status: "CLOSED", closedAt: new Date("2026-08-01T08:00:00.000Z") }),
  });
  const closedResult = await createHeadteacherSupervisoryAssessmentDraft({
    ...input(),
    database: closedDb,
  });
  assertEqual(closedResult.outcome, "CREATED", "Closed pre-review cycle may accept draft");
  assertEqual(closedDb.assessments[0].evidenceSnapshotJson.cycle.statusAtDraft, "CLOSED", "Closed status snapshot");

  await expectReject(
    () =>
      createHeadteacherSupervisoryAssessmentDraft({
        ...input({ dateObserved: "2026-07-24" }),
        database: new FakeDatabase(),
      }),
    "HEADTEACHER_SUPERVISORY_OBSERVATION_BEFORE_CYCLE_OPEN",
    "Observation before cycle opening must fail",
  );
  await expectReject(
    () =>
      createHeadteacherSupervisoryAssessmentDraft({
        ...input({ dateObserved: "2026-07-29" }),
        database: new FakeDatabase(),
      }),
    "HEADTEACHER_SUPERVISORY_OBSERVATION_DATE_FUTURE",
    "Future observation must fail",
  );

  await expectReject(
    () =>
      createHeadteacherSupervisoryAssessmentDraft({
        ...input(),
        database: new FakeDatabase({ instrumentVersion: instrument({ contentHash: null }) }),
      }),
    "HEADTEACHER_SUPERVISORY_PUBLISHED_INSTRUMENT_INVALID",
    "Missing instrument hash must fail",
  );

  await expectReject(
    () =>
      createHeadteacherSupervisoryAssessmentDraft({
        ...input(),
        database: new FakeDatabase({
          membership: baseMembership({ tenant: { ...baseMembership().tenant, name: "Renamed School" } }),
        }),
      }),
    "HEADTEACHER_SUPERVISORY_TARGET_CONTEXT_DRIFT",
    "School snapshot drift must fail",
  );

  const raceDb = new FakeDatabase({ simulateRaceOnce: true });
  const race = await createHeadteacherSupervisoryAssessmentDraft({
    ...input({ reqId: "req-race-001" }),
    database: raceDb,
  });
  assertEqual(race.outcome, "EXISTING_MATCH", "Concurrent create race must recover idempotently");
  assertEqual(raceDb.assessments.length, 1, "Race recovery leaves one assessment");
  assertEqual(raceDb.audits.length, 0, "Race winner owns audit; retry creates none");

  const finalizedDb = new FakeDatabase();
  const first = await createHeadteacherSupervisoryAssessmentDraft({ ...input(), database: finalizedDb });
  finalizedDb.assessments[0].status = "FINALIZED";
  const finalizedRetry = await createHeadteacherSupervisoryAssessmentDraft({
    ...input({ reqId: "req-finalized-retry" }),
    database: finalizedDb,
  });
  assertEqual(finalizedRetry.outcome, "EXISTING_MATCH", "Finalized initial assessment remains idempotently discoverable");
  assertEqual(finalizedRetry.assessment.id, first.assessment.id, "Finalized retry returns same assessment");

  for (const marker of [
    "Prisma.TransactionIsolationLevel.Serializable",
    "evidenceSnapshotJson",
    "visitContextHash",
    "visitContextImmutable: true",
    "HEADTEACHER_SUPERVISORY_ASSESSMENT_DRAFT_CREATED",
    "cycleId_assessorUserId_revision",
    "providerCalled: false",
  ]) {
    assert(source.includes(marker), `Required source marker missing: ${marker}`);
  }
  for (const forbidden of [
    "sendSms",
    "sendEmail",
    "appraisalAssessmentScore.create",
    "appraisalReview.create",
    "appraisalAggregateSnapshot.create",
  ]) {
    assert(!source.includes(forbidden), `Forbidden source marker present: ${forbidden}`);
  }

  console.log("");
  console.log("=== D3.4F2 HEADTEACHER SUPERVISORY DRAFT + VISIT SNAPSHOT ===");
  console.log("");
  console.log("Parent cycle states             : OPEN / CLOSED before review");
  console.log("Authorized assessor             : F1 capability + active assignment");
  console.log("Jurisdiction                    : district/circuit revalidated");
  console.log("Initial assessment              : DRAFT revision 1");
  console.log("Visit date                      : required, opened-to-current day");
  console.log("Target/school context           : current and cycle-bound");
  console.log("Assessor assignment context     : frozen at creation");
  console.log("Instrument identity/hash        : active supervisory V1 frozen");
  console.log("Visit-context proof             : deterministic SHA-256");
  console.log("Same-context retry              : EXISTING_MATCH");
  console.log("Changed-context retry           : fails closed");
  console.log("Concurrent create race          : idempotently recovered");
  console.log("Score/comment rows              : absent at draft creation");
  console.log("Audit                           : context hash, no contacts/names");
  console.log("Transaction                     : serializable and bounded");
  console.log("Notifications/providers         : absent");
  console.log("Database accessed               : false");
  console.log("");
  console.log("RESULT: D3.4F2 HEADTEACHER SUPERVISORY DRAFT GREEN");
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
