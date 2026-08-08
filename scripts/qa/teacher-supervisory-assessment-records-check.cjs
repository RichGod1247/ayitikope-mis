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

class FakeRecordsDatabase {
  constructor(rows) {
    this.rows = rows;
    this.findManyCalls = [];
    this.appraisalAssessment = {
      findMany: async (args) => {
        this.findManyCalls.push(args);
        // Deliberately return cross-owner and invalid rows too. The service
        // must still enforce owner + contract boundaries in memory.
        return this.rows.map((row) => structuredClone(row));
      },
    };
  }
}

const WORKFLOW = "TEACHER_GOVERNANCE_SUPERVISORY_ASSESSMENT";
const STREAM = "GOVERNANCE_TEACHER_OBSERVATION";
const CODE = "TEACHER_OBSERVATION_V1";

function row(overrides = {}) {
  const id = overrides.id ?? "assessment-001";
  const cycleId = overrides.cycleId ?? `cycle-${id}`;
  const status = overrides.status ?? "DRAFT";
  const actor = overrides.assessorUserId ?? "actor-001";
  const scoreCount = overrides.scoreCount ?? (status === "FINALIZED" ? 34 : 12);
  return {
    id,
    cycleId,
    instrumentVersionId: "teacher-version-001",
    assessorUserId: actor,
    status,
    revision: overrides.revision ?? 1,
    dateObserved: overrides.dateObserved ?? new Date("2026-08-08T00:00:00.000Z"),
    overallPercentage:
      overrides.overallPercentage ?? (status === "FINALIZED" ? 82.5 : 91.25),
    finalizedAt:
      overrides.finalizedAt ??
      (status === "FINALIZED" ? new Date("2026-08-08T12:00:00.000Z") : null),
    generalComment: "PRIVATE COMMENT MUST NOT LEAK",
    metadata: {
      workflow: overrides.assessmentWorkflow ?? WORKFLOW,
      evidenceStream: overrides.assessmentStream ?? STREAM,
    },
    createdAt: overrides.createdAt ?? new Date("2026-08-08T08:00:00.000Z"),
    updatedAt: overrides.updatedAt ?? new Date("2026-08-08T09:00:00.000Z"),
    _count: { scores: scoreCount },
    cycle: {
      id: cycleId,
      status: "OPEN",
      targetUserId: overrides.targetUserId ?? "teacher-001",
      targetTenantId: overrides.schoolId ?? "school-001",
      targetZoneId: overrides.circuitId ?? "circuit-001",
      scopeZoneId: overrides.districtId ?? "district-001",
      targetNameSnapshot: overrides.targetName ?? "Teacher One",
      targetRoleSnapshot: overrides.targetRoleSnapshot ?? "TEACHER",
      targetSchoolNameSnapshot: overrides.schoolName ?? "School One",
      targetZoneNameSnapshot: overrides.circuitName ?? "Circuit One",
      metadata: {
        workflow: overrides.cycleWorkflow ?? WORKFLOW,
        evidenceStream: overrides.cycleStream ?? STREAM,
      },
      scopeZone: {
        id: overrides.scopeZoneRecordId ?? (overrides.districtId ?? "district-001"),
        name: overrides.districtName ?? "District One",
      },
    },
    instrumentVersion: {
      id: overrides.instrumentVersionRecordId ?? "teacher-version-001",
      version: overrides.instrumentVersion ?? 1,
      contentHash: "a".repeat(64),
      instrument: {
        id: "teacher-instrument-001",
        code: overrides.instrumentCode ?? CODE,
        purpose: overrides.purpose ?? "TEACHER_OBSERVATION",
        subjectType: overrides.subjectType ?? "TEACHER",
      },
    },
  };
}

function governanceScope(overrides = {}) {
  return {
    userId: "actor-001",
    email: "actor@example.test",
    name: "Actor One",
    isSuperAdmin: false,
    assignments: [],
    zoneIds: ["circuit-001", "district-001"],
    tenantIds: ["school-001"],
    ...overrides,
  };
}

function assertNoForbiddenOutput(records) {
  const itemsSerialized = JSON.stringify(records.items);
  for (const forbidden of [
    "PRIVATE COMMENT MUST NOT LEAK",
    "generalComment",
    "scores\"",
    "email",
    "phone",
    "reviewerUserId",
    "legacyTeacherAppraisal",
  ]) {
    assert(!itemsSerialized.includes(forbidden), `Forbidden record-item marker: ${forbidden}`);
  }
}

async function expectReject(operation, expectedCode, message) {
  try {
    await operation();
  } catch (error) {
    assertEqual(error?.code ?? error?.message, expectedCode, message);
    return;
  }
  fail(message, { expectedCode, actual: "RESOLVED" });
}

async function main() {
  const servicePath = path.join(
    repoRoot,
    "src",
    "lib",
    "appraisals",
    "teacherSupervisoryAssessmentRecords.ts",
  );
  const routePath = path.join(
    repoRoot,
    "src",
    "app",
    "api",
    "governance",
    "appraisals",
    "teacher-supervisory",
    "records",
    "route.ts",
  );

  const source = fs.readFileSync(servicePath, "utf8");
  const route = fs.readFileSync(routePath, "utf8");
  const recordsModule = require(servicePath);
  const {
    TEACHER_SUPERVISORY_RECORDS_POLICY,
    readTeacherSupervisoryAssessmentRecords,
  } = recordsModule;

  assertEqual(TEACHER_SUPERVISORY_RECORDS_POLICY.actorAssessmentOnly, true, "Records must be actor-owned");
  assertEqual(TEACHER_SUPERVISORY_RECORDS_POLICY.currentGovernanceScopeRequired, true, "Current governance scope must be required");
  assertEqual(TEACHER_SUPERVISORY_RECORDS_POLICY.individualScoresReturned, false, "Score values must not be returned");
  assertEqual(TEACHER_SUPERVISORY_RECORDS_POLICY.generalCommentsReturned, false, "Comments must not be returned");
  assertEqual(TEACHER_SUPERVISORY_RECORDS_POLICY.contactDetailsReturned, false, "Contacts must not be returned");
  assertEqual(TEACHER_SUPERVISORY_RECORDS_POLICY.databaseWritesAllowed, false, "Records service must be read only");
  assertEqual(TEACHER_SUPERVISORY_RECORDS_POLICY.providerCallsAllowed, false, "Providers must be forbidden");

  const database = new FakeRecordsDatabase([
    row({ id: "draft-new", scoreCount: 18, dateObserved: new Date("2026-08-08T00:00:00.000Z") }),
    row({ id: "finalized", status: "FINALIZED", scoreCount: 34, overallPercentage: 84.17, dateObserved: new Date("2026-08-07T00:00:00.000Z") }),
    row({ id: "draft-old", scoreCount: 5, dateObserved: new Date("2026-08-06T00:00:00.000Z") }),
    row({ id: "other-actor", assessorUserId: "actor-999" }),
    row({ id: "returned", status: "RETURNED" }),
    row({ id: "wrong-workflow", assessmentWorkflow: "HEADTEACHER_GOVERNANCE_SUPERVISORY_ASSESSMENT" }),
    row({ id: "wrong-stream", assessmentStream: "OTHER_STREAM" }),
    row({ id: "wrong-cycle-workflow", cycleWorkflow: "OTHER_WORKFLOW" }),
    row({ id: "wrong-instrument", instrumentCode: "HEADTEACHER_SUPERVISORY_ASSESSMENT_V1" }),
    row({ id: "wrong-subject", subjectType: "HEADTEACHER" }),
    row({ id: "wrong-target-role", targetRoleSnapshot: "HEADTEACHER" }),
    row({ id: "broken-district", districtId: "district-001", scopeZoneRecordId: "district-999" }),
    row({ id: "wrong-school-scope", schoolId: "school-999" }),
    row({ id: "wrong-zone-scope", schoolId: "school-001", circuitId: "circuit-999", districtId: "district-999" }),
  ]);

  const records = await readTeacherSupervisoryAssessmentRecords({
    actorUserId: "actor-001",
    actorRoleName: "CIRCUIT_SUPERVISOR",
    governanceScope: governanceScope(),
    database,
  });

  assertEqual(records.actorRole, "SISSO", "Circuit Supervisor alias must canonicalize to SISSO");
  assertEqual(records.summary.total, 3, "Only valid actor-owned Teacher records should remain");
  assertEqual(records.summary.inProgress, 2, "Draft summary mismatch");
  assertEqual(records.summary.submitted, 1, "Submitted summary mismatch");
  assertEqual(records.items[0].assessmentId, "draft-new", "Newest draft should be first");
  assertEqual(records.items[1].assessmentId, "draft-old", "Drafts should precede submitted records");
  assertEqual(records.items[2].assessmentId, "finalized", "Submitted record should follow drafts");
  assertEqual(records.items[0].answeredItems, 18, "Draft progress count mismatch");
  assertEqual(records.items[0].completionPercentage, 53, "Draft progress percentage mismatch");
  assertEqual(records.items[0].overallPercentage, null, "Draft overall score must remain hidden");
  assertEqual(records.items[2].overallPercentage, 84.17, "Finalized overall score mismatch");
  assertEqual(records.items[2].finalizedAt, "2026-08-08T12:00:00.000Z", "Finalized timestamp mismatch");
  assert(records.items[0].workspaceUrl.includes("assessmentId=draft-new"), "Reopen URL missing assessment id");
  assertEqual(database.findManyCalls.length, 1, "Records service should perform one bounded read");
  assertNoForbiddenOutput(records);

  await expectReject(
    () =>
      readTeacherSupervisoryAssessmentRecords({
        actorUserId: "",
        actorRoleName: "SISSO",
        governanceScope: governanceScope(),
        database,
      }),
    "TEACHER_SUPERVISORY_RECORDS_ACTOR_REQUIRED",
    "Missing actor must fail closed",
  );

  await expectReject(
    () =>
      readTeacherSupervisoryAssessmentRecords({
        actorUserId: "actor-001",
        actorRoleName: "HEADTEACHER",
        governanceScope: governanceScope(),
        database,
      }),
    "TEACHER_SUPERVISORY_RECORDS_ROLE_FORBIDDEN",
    "Headteacher must not gain governance Teacher records access",
  );

  for (const forbidden of [
    "$transaction",
    "auditLog",
    "appraisalReview",
    "teacherAppraisal",
    "sendSms",
    "sendEmail",
    "localStorage",
    "sessionStorage",
  ]) {
    assert(!source.includes(forbidden), `Forbidden records service marker: ${forbidden}`);
  }

  assert(source.includes("appraisalAssessment.findMany"), "Assessment records read missing");
  assert(source.includes("assessorUserId: actorUserId"), "Owner-bound database filter missing");
  assert(source.includes("targetTenantId: { in: tenantIds }"), "Tenant-scoped database filter missing");
  assert(source.includes("scopedZoneIds"), "Zone-scope defense missing");
  assert(source.includes("_count"), "Progress-only count query missing");
  assert(source.includes("maximumRecords"), "Bounded records read missing");
  assert(source.includes("GOVERNANCE_TEACHER_OBSERVATION") || source.includes("evidenceStream"), "Teacher evidence-stream gate missing");

  assert(route.includes('runtime = "nodejs"'), "Records route node runtime missing");
  assert(route.includes('dynamic = "force-dynamic"'), "Records route force-dynamic missing");
  assert(route.includes("requireTeacherSupervisoryGovernanceApiContext"), "Records route governance auth missing");
  assert(route.includes("readTeacherSupervisoryAssessmentRecords"), "Records route service delegation missing");
  assert(route.includes("governanceScope: auth.scope"), "Records route must pass current governance scope");
  assert(route.includes("jsonNoStore"), "Records route no-store response missing");
  assert(!route.includes("POST("), "Records endpoint must remain GET-only");
  assert(!route.includes("PUT("), "Records endpoint must remain read-only");
  assert(!route.includes("DELETE("), "Records endpoint must remain read-only");

  console.log("");
  console.log("=== N6-D4C2 GOVERNANCE TEACHER SAVED-RECORD REOPENABILITY ===");
  console.log("");
  console.log("Audience                        : original governance assessor only");
  console.log("Records                         : DRAFT + FINALIZED Teacher observations");
  console.log("Current governance scope        : tenant + zone constrained");
  console.log("Target discovery                : remains separate D2B contract");
  console.log("Draft reopen                    : stable assessment workspace URL");
  console.log("Submitted reopen                : read-only assessment workspace URL");
  console.log("Progress                        : score-row count only");
  console.log("Draft overall result            : hidden");
  console.log("Finalized overall result        : allowed");
  console.log("Individual scores               : excluded");
  console.log("General Comments                : excluded");
  console.log("Contact details                 : excluded");
  console.log("Review evidence                 : excluded");
  console.log("Legacy TeacherAppraisal         : excluded");
  console.log("Database writes                 : absent");
  console.log("Provider calls                  : absent");
  console.log("Database accessed               : fake read only");
  console.log("");
  console.log("RESULT: N6-D4C2 GOVERNANCE TEACHER SAVED-RECORD REOPENABILITY GREEN");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
