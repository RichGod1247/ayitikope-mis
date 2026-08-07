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
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(message, { expected, actual });
  }
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

class FakeQueueDatabase {
  constructor(rows) {
    this.rows = rows;
    this.findManyCalls = [];
    this.membership = {
      findMany: async (args) => {
        this.findManyCalls.push(args);
        // Intentionally return dirty/cross-scope rows too. The queue must fail
        // closed even if an underlying read returns more than the requested filter.
        return this.rows.map((row) => structuredClone(row));
      },
    };
  }
}

function assignment({
  id,
  role,
  zoneId,
  zoneName,
  zoneLevel,
  parentZoneId = null,
  parentZoneName = null,
}) {
  return {
    id,
    role,
    zoneId,
    zoneName,
    zoneLevel,
    zoneTypeName: zoneLevel === 2 ? "District" : "Circuit",
    parentZoneId,
    parentZoneName,
  };
}

function scope({
  userId = "actor-001",
  assignmentRows,
  tenantIds,
  zoneIds,
  isSuperAdmin = false,
}) {
  return {
    userId,
    email: "actor@example.test",
    name: "Governance Actor",
    isSuperAdmin,
    assignments: assignmentRows,
    tenantIds,
    zoneIds,
  };
}

function membership({
  id,
  userId,
  teacherName,
  tenantId,
  schoolName,
  circuitId,
  circuitName,
  districtId,
  districtName,
  status = "ACTIVE",
  roleName = "TEACHER",
  tenantStatus = "ACTIVE",
  circuitActive = true,
  districtActive = true,
  circuitLevel = 1,
  districtLevel = 2,
  userRecordId = userId,
  tenantRecordId = tenantId,
}) {
  return {
    id,
    userId,
    tenantId,
    status,
    role: { name: roleName },
    user: {
      id: userRecordId,
      name: teacherName,
      firstName: null,
      lastName: null,
      // Deliberately present in the fake source record. The queue must never
      // copy these contact fields into its output contract.
      email: `${userId}@private.example.test`,
      phone: "+233000000000",
    },
    tenant: {
      id: tenantRecordId,
      name: schoolName,
      status: tenantStatus,
      zone: circuitId
        ? {
            id: circuitId,
            name: circuitName,
            isActive: circuitActive,
            parentZoneId: districtId,
            zoneType: { level: circuitLevel },
            parentZone: districtId
              ? {
                  id: districtId,
                  name: districtName,
                  isActive: districtActive,
                  zoneType: { level: districtLevel },
                }
              : null,
          }
        : null,
    },
  };
}

function ids(queue) {
  return queue.items.map((item) => item.targetUserId);
}

function assertNoForbiddenOutputFields(queue) {
  const forbidden = new Set([
    "email",
    "phone",
    "contact",
    "contactDetails",
    "score",
    "scores",
    "overallPercentage",
    "sectionPercentages",
    "generalComment",
    "legacyTeacherAppraisal",
    "teacherAppraisal",
  ]);

  function walk(value, pathParts = []) {
    if (Array.isArray(value)) {
      value.forEach((row, index) => walk(row, [...pathParts, String(index)]));
      return;
    }
    if (!value || typeof value !== "object") return;

    for (const [key, nested] of Object.entries(value)) {
      assert(
        !forbidden.has(key),
        `Forbidden queue output field: ${[...pathParts, key].join(".")}`,
      );
      walk(nested, [...pathParts, key]);
    }
  }

  walk(queue);
}

async function main() {
  const queuePath = path.join(
    repoRoot,
    "src",
    "lib",
    "appraisals",
    "teacherSupervisoryAssessmentQueue.ts",
  );
  const source = fs.readFileSync(queuePath, "utf8");
  const queueModule = require(queuePath);

  const {
    TEACHER_SUPERVISORY_QUEUE_POLICY,
    readTeacherSupervisoryAssessmentQueue,
  } = queueModule;

  assertEqual(TEACHER_SUPERVISORY_QUEUE_POLICY.readOnlyDiscovery, true, "Queue must be read-only discovery");
  assertEqual(TEACHER_SUPERVISORY_QUEUE_POLICY.databaseWritesAllowed, false, "Database writes policy");
  assertEqual(TEACHER_SUPERVISORY_QUEUE_POLICY.providerCallsAllowed, false, "Provider calls policy");
  assertEqual(TEACHER_SUPERVISORY_QUEUE_POLICY.contactDetailsIncluded, false, "Contact details policy");
  assertEqual(TEACHER_SUPERVISORY_QUEUE_POLICY.assessmentEvidenceIncluded, false, "Assessment evidence policy");
  assertEqual(TEACHER_SUPERVISORY_QUEUE_POLICY.legacyTeacherAppraisalIncluded, false, "Legacy appraisal policy");

  const rows = [
    membership({
      id: "m-a-1",
      userId: "teacher-a",
      teacherName: "Teacher A",
      tenantId: "school-a",
      schoolName: "School A",
      circuitId: "circuit-1",
      circuitName: "Circuit One",
      districtId: "district-1",
      districtName: "District One",
    }),
    // Duplicate active membership for the same Teacher/school must not create
    // duplicate queue targets.
    membership({
      id: "m-a-2",
      userId: "teacher-a",
      teacherName: "Teacher A",
      tenantId: "school-a",
      schoolName: "School A",
      circuitId: "circuit-1",
      circuitName: "Circuit One",
      districtId: "district-1",
      districtName: "District One",
    }),
    membership({
      id: "m-b",
      userId: "teacher-b",
      teacherName: "Teacher B",
      tenantId: "school-b",
      schoolName: "School B",
      circuitId: "circuit-2",
      circuitName: "Circuit Two",
      districtId: "district-1",
      districtName: "District One",
    }),
    membership({
      id: "m-c",
      userId: "teacher-c",
      teacherName: "Teacher C",
      tenantId: "school-c",
      schoolName: "School C",
      circuitId: "circuit-3",
      circuitName: "Circuit Three",
      districtId: "district-2",
      districtName: "District Two",
    }),
    membership({
      id: "m-inactive-membership",
      userId: "teacher-inactive-membership",
      teacherName: "Inactive Membership",
      tenantId: "school-a",
      schoolName: "School A",
      circuitId: "circuit-1",
      circuitName: "Circuit One",
      districtId: "district-1",
      districtName: "District One",
      status: "INACTIVE",
    }),
    membership({
      id: "m-inactive-school",
      userId: "teacher-inactive-school",
      teacherName: "Inactive School",
      tenantId: "school-inactive",
      schoolName: "Inactive School",
      circuitId: "circuit-1",
      circuitName: "Circuit One",
      districtId: "district-1",
      districtName: "District One",
      tenantStatus: "SUSPENDED",
    }),
    membership({
      id: "m-wrong-role",
      userId: "headteacher-1",
      teacherName: "Headteacher One",
      tenantId: "school-a",
      schoolName: "School A",
      circuitId: "circuit-1",
      circuitName: "Circuit One",
      districtId: "district-1",
      districtName: "District One",
      roleName: "HEADTEACHER",
    }),
    membership({
      id: "m-inactive-circuit",
      userId: "teacher-inactive-circuit",
      teacherName: "Inactive Circuit",
      tenantId: "school-circuit-inactive",
      schoolName: "Inactive Circuit School",
      circuitId: "circuit-inactive",
      circuitName: "Inactive Circuit",
      districtId: "district-1",
      districtName: "District One",
      circuitActive: false,
    }),
    membership({
      id: "m-inactive-district",
      userId: "teacher-inactive-district",
      teacherName: "Inactive District",
      tenantId: "school-district-inactive",
      schoolName: "Inactive District School",
      circuitId: "circuit-4",
      circuitName: "Circuit Four",
      districtId: "district-inactive",
      districtName: "Inactive District",
      districtActive: false,
    }),
    membership({
      id: "m-self",
      userId: "actor-001",
      teacherName: "Actor As Teacher",
      tenantId: "school-a",
      schoolName: "School A",
      circuitId: "circuit-1",
      circuitName: "Circuit One",
      districtId: "district-1",
      districtName: "District One",
    }),
    membership({
      id: "m-user-drift",
      userId: "teacher-user-drift",
      teacherName: "User Drift",
      tenantId: "school-a",
      schoolName: "School A",
      circuitId: "circuit-1",
      circuitName: "Circuit One",
      districtId: "district-1",
      districtName: "District One",
      userRecordId: "different-user-id",
    }),
    membership({
      id: "m-tenant-drift",
      userId: "teacher-tenant-drift",
      teacherName: "Tenant Drift",
      tenantId: "school-a",
      schoolName: "School A",
      circuitId: "circuit-1",
      circuitName: "Circuit One",
      districtId: "district-1",
      districtName: "District One",
      tenantRecordId: "different-tenant-id",
    }),
  ];

  const allTenantIds = [
    "school-a",
    "school-b",
    "school-c",
    "school-inactive",
    "school-circuit-inactive",
    "school-district-inactive",
  ];
  const allZoneIds = [
    "district-1",
    "district-2",
    "district-inactive",
    "circuit-1",
    "circuit-2",
    "circuit-3",
    "circuit-4",
    "circuit-inactive",
  ];
  const now = new Date("2026-08-07T12:00:00.000Z");

  for (const role of [
    "DISTRICT_DIRECTOR",
    "HEAD_OF_SUPERVISION",
    "BASIC_SCHOOL_COORDINATOR",
  ]) {
    const database = new FakeQueueDatabase(rows);
    const result = await readTeacherSupervisoryAssessmentQueue({
      actorUserId: "actor-001",
      actorRoleName: role,
      governanceScope: scope({
        assignmentRows: [
          assignment({
            id: `assignment-${role}`,
            role,
            zoneId: "district-1",
            zoneName: "District One",
            zoneLevel: 2,
          }),
        ],
        tenantIds: allTenantIds,
        zoneIds: allZoneIds,
      }),
      now,
      database,
    });

    assertDeepEqual(
      ids(result),
      ["teacher-a", "teacher-b"],
      `${role} must see only active Teachers in its district`,
    );
    assertEqual(result.summary.circuits, 2, `${role} circuit count`);
    assertEqual(result.summary.schools, 2, `${role} school count`);
    assertEqual(result.summary.teachers, 2, `${role} Teacher count`);
    assertEqual(result.selection.mode, "DISTRICT_CIRCUIT_SCHOOL_TEACHERS", `${role} selection mode`);
    assertEqual(result.selection.requiresCircuitSelection, true, `${role} circuit selection`);
    assertEqual(database.findManyCalls.length, 1, `${role} must perform one bounded membership read`);
    assertNoForbiddenOutputFields(result);
  }

  const sissoDatabase = new FakeQueueDatabase(rows);
  const sisso = await readTeacherSupervisoryAssessmentQueue({
    actorUserId: "actor-001",
    actorRoleName: "SISSO",
    governanceScope: scope({
      assignmentRows: [
        assignment({
          id: "assignment-sisso-circuit-1",
          role: "SISSO",
          zoneId: "circuit-1",
          zoneName: "Circuit One",
          zoneLevel: 1,
          parentZoneId: "district-1",
          parentZoneName: "District One",
        }),
      ],
      tenantIds: allTenantIds,
      zoneIds: allZoneIds,
    }),
    now,
    database: sissoDatabase,
  });

  assertDeepEqual(ids(sisso), ["teacher-a"], "SISSO must see only its assigned circuit");
  assertEqual(sisso.selection.mode, "ASSIGNED_CIRCUIT_TEACHERS", "SISSO selection mode");
  assertEqual(sisso.selection.requiresCircuitSelection, false, "Single-circuit SISSO selection");
  assertEqual(sisso.selection.assignedCircuitId, "circuit-1", "Assigned SISSO circuit id");
  assertEqual(sisso.summary.teachers, 1, "SISSO Teacher count");
  assertNoForbiddenOutputFields(sisso);

  const aliasDatabase = new FakeQueueDatabase(rows);
  const alias = await readTeacherSupervisoryAssessmentQueue({
    actorUserId: "actor-001",
    actorRoleName: "CIRCUIT_SUPERVISOR",
    governanceScope: scope({
      assignmentRows: [
        assignment({
          id: "assignment-sisso-alias",
          role: "SISSO",
          zoneId: "circuit-1",
          zoneName: "Circuit One",
          zoneLevel: 1,
          parentZoneId: "district-1",
          parentZoneName: "District One",
        }),
      ],
      tenantIds: allTenantIds,
      zoneIds: allZoneIds,
    }),
    now,
    database: aliasDatabase,
  });

  assertEqual(alias.actorRole, "SISSO", "Circuit Supervisor must canonicalize to SISSO");
  assertDeepEqual(ids(alias), ["teacher-a"], "Legacy Circuit Supervisor alias scope");

  const twoCircuitSissoDatabase = new FakeQueueDatabase(rows);
  const twoCircuitSisso = await readTeacherSupervisoryAssessmentQueue({
    actorUserId: "actor-001",
    actorRoleName: "SISSO",
    governanceScope: scope({
      assignmentRows: [
        assignment({
          id: "assignment-sisso-circuit-1",
          role: "SISSO",
          zoneId: "circuit-1",
          zoneName: "Circuit One",
          zoneLevel: 1,
          parentZoneId: "district-1",
          parentZoneName: "District One",
        }),
        assignment({
          id: "assignment-sisso-circuit-2",
          role: "SISSO",
          zoneId: "circuit-2",
          zoneName: "Circuit Two",
          zoneLevel: 1,
          parentZoneId: "district-1",
          parentZoneName: "District One",
        }),
      ],
      tenantIds: allTenantIds,
      zoneIds: allZoneIds,
    }),
    now,
    database: twoCircuitSissoDatabase,
  });

  assertDeepEqual(ids(twoCircuitSisso), ["teacher-a", "teacher-b"], "Multi-circuit SISSO target set");
  assertEqual(twoCircuitSisso.selection.requiresCircuitSelection, true, "Multi-circuit SISSO must select circuit");
  assertEqual(twoCircuitSisso.selection.assignedCircuitId, null, "Multi-circuit SISSO must not imply one circuit");

  for (const role of ["HEADTEACHER", "TEACHER", "SUPERADMIN"]) {
    const database = new FakeQueueDatabase(rows);
    const result = await readTeacherSupervisoryAssessmentQueue({
      actorUserId: "actor-001",
      actorRoleName: role,
      governanceScope: scope({
        assignmentRows: [],
        tenantIds: allTenantIds,
        zoneIds: allZoneIds,
        isSuperAdmin: role === "SUPERADMIN",
      }),
      now,
      database,
    });

    assertDeepEqual(ids(result), [], `${role} must not receive operational governance Teacher targets`);
    assertNoForbiddenOutputFields(result);
  }

  const emptyDatabase = new FakeQueueDatabase(rows);
  const noTenants = await readTeacherSupervisoryAssessmentQueue({
    actorUserId: "actor-001",
    actorRoleName: "DISTRICT_DIRECTOR",
    governanceScope: scope({
      assignmentRows: [
        assignment({
          id: "assignment-director",
          role: "DISTRICT_DIRECTOR",
          zoneId: "district-1",
          zoneName: "District One",
          zoneLevel: 2,
        }),
      ],
      tenantIds: [],
      zoneIds: ["district-1"],
    }),
    now,
    database: emptyDatabase,
  });
  assertEqual(noTenants.summary.teachers, 0, "No-tenant scope must be empty");
  assertEqual(emptyDatabase.findManyCalls.length, 0, "No-tenant scope must avoid database read");

  for (const forbidden of [
    "prisma.teacherAppraisal",
    "appraisalAssessment.create",
    "appraisalCycle.create",
    "membership.create",
    "membership.update",
    "membership.delete",
    "$transaction",
    "sendSms",
    "sendEmail",
  ]) {
    assert(!source.includes(forbidden), `Forbidden queue source marker present: ${forbidden}`);
  }

  assert(
    !source.includes("email: true"),
    "Teacher contact email must not be selected",
  );
  assert(
    !source.includes("phone: true"),
    "Teacher phone must not be selected",
  );

  console.log("");
  console.log("=== N6-D2B GOVERNANCE TEACHER READ-ONLY QUEUE CONTRACT ===");
  console.log("");
  console.log("Target source                  : ACTIVE TEACHER memberships");
  console.log("School state                   : ACTIVE required");
  console.log("Circuit/district hierarchy     : active + stable identifiers required");
  console.log("District target scope          : Director / HOS / BSC verified");
  console.log("Circuit target scope           : SISSO verified");
  console.log("Circuit Supervisor alias       : canonical SISSO verified");
  console.log("Cross-district/circuit targets : excluded");
  console.log("Self target                    : excluded");
  console.log("Inactive/wrong-role targets    : excluded");
  console.log("Duplicate active membership    : deduplicated");
  console.log("Teacher contact details        : excluded");
  console.log("Legacy TeacherAppraisal        : excluded");
  console.log("Assessment scores/comments     : excluded");
  console.log("Database writes                : absent");
  console.log("Cycle/assessment creation      : absent");
  console.log("Provider calls/polling         : absent");
  console.log("Database accessed              : fake read only");
  console.log("");
  console.log("RESULT: N6-D2B GOVERNANCE TEACHER READ-ONLY QUEUE GREEN");
}

main().catch((error) => {
  console.error("");
  console.error("RESULT: N6-D2B GOVERNANCE TEACHER READ-ONLY QUEUE FAILED");
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
