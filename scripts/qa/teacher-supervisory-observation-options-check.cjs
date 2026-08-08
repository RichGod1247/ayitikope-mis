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
async function expectReject(operation, code, message) {
  try {
    await operation();
  } catch (error) {
    assertEqual(error && error.message, code, message);
    return error;
  }
  fail(message, { expectedError: code });
}
function expectThrow(operation, code, message) {
  try {
    operation();
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

const NOW = new Date("2026-08-07T12:00:00.000Z");

function classroom(id = "class-jhs3-a", name = "JHS 3", arm = "A") {
  return {
    id,
    tenantId: "tenant-school-001",
    name,
    grade: "JHS 3",
    arm,
    status: "ACTIVE",
  };
}

function assignment(overrides = {}) {
  return {
    id: "teacher-assignment-science-001",
    tenantId: "tenant-school-001",
    teacherUserId: "teacher-001",
    assignmentKind: "SUBJECT",
    classroomId: "class-jhs3-a",
    phase: "JHS",
    level: "JHS 3",
    subject: "Science",
    subjectNorm: "SCIENCE",
    status: "ACTIVE",
    startsAt: new Date("2026-01-01T00:00:00.000Z"),
    endsAt: null,
    revokedAt: null,
    ...overrides,
  };
}

function profile(overrides = {}) {
  return {
    id: "teacher-profile-001",
    tenantId: "tenant-school-001",
    userId: "teacher-001",
    phase: "JHS",
    classLevel: null,
    primaryClassroomId: null,
    jhsAssignments: [{ subject: "Mathematics", classes: ["JHS 3"] }],
    ...overrides,
  };
}

function curriculumSubject({ id, name, orderIndex = 1, subStrandTitle }) {
  return {
    id,
    tenantId: null,
    phase: "JHS",
    level: "JHS 3",
    name,
    orderIndex,
    isGlobal: true,
    isActive: true,
    countryCode: "GH",
    strands: [
      {
        id: `strand-${id}`,
        code: `STR-${id}`,
        title: `${name} Strand`,
        orderIndex: 1,
        subStrands: [
          {
            id: `substrand-${id}`,
            code: `SUB-${id}`,
            title: subStrandTitle,
            orderIndex: 1,
          },
        ],
      },
    ],
  };
}

function membership() {
  return {
    id: "membership-teacher-001",
    userId: "teacher-001",
    tenantId: "tenant-school-001",
    status: "ACTIVE",
    role: { name: "TEACHER" },
    user: {
      id: "teacher-001",
      name: "Teacher One",
      firstName: "Teacher",
      lastName: "One",
    },
    tenant: {
      id: "tenant-school-001",
      name: "School One",
      status: "ACTIVE",
      zone: {
        id: "circuit-gef-001",
        name: "Gefia Circuit",
        isActive: true,
        parentZoneId: "district-aks-001",
        zoneType: { level: 1 },
        parentZone: {
          id: "district-aks-001",
          name: "Akatsi South District",
          isActive: true,
          zoneType: { level: 2 },
        },
      },
    },
  };
}

function governanceScope() {
  return {
    isSuperAdmin: false,
    tenantIds: ["tenant-school-001"],
    zoneIds: ["district-aks-001", "circuit-gef-001"],
    assignments: [
      {
        id: "assignment-director-001",
        role: "DISTRICT_DIRECTOR",
        zoneId: "district-aks-001",
        zoneName: "Akatsi South District",
        zoneLevel: 2,
        parentZoneId: null,
        parentZoneName: null,
      },
    ],
  };
}

class FakeDatabase {
  constructor(overrides = {}) {
    this.memberships = overrides.memberships ?? [membership()];
    this.assignments = overrides.assignments ?? [assignment()];
    this.profile = Object.prototype.hasOwnProperty.call(overrides, "profile")
      ? overrides.profile
      : profile();
    this.classrooms = overrides.classrooms ?? [classroom()];
    this.curriculumSubjects = overrides.curriculumSubjects ?? [
      curriculumSubject({
        id: "curriculum-science-jhs3",
        name: "Science",
        subStrandTitle: "Farming Systems",
      }),
      curriculumSubject({
        id: "curriculum-maths-jhs3",
        name: "Mathematics",
        orderIndex: 2,
        subStrandTitle: "Number Operations",
      }),
    ];
    this.writeCalls = 0;
    this.providerCalls = 0;

    this.membership = {
      findMany: async () => this.memberships,
    };
    this.teacherAssessmentAssignment = {
      findMany: async () => this.assignments,
    };
    this.teacherProfile = {
      findUnique: async () => this.profile,
    };
    this.classroom = {
      findMany: async () => this.classrooms,
    };
    this.curriculumSubject = {
      findMany: async () => this.curriculumSubjects,
    };
  }
}

function readInput(database, overrides = {}) {
  return {
    actorUserId: "actor-001",
    actorRoleName: "DISTRICT_DIRECTOR",
    governanceScope: governanceScope(),
    targetUserId: "teacher-001",
    targetTenantId: "tenant-school-001",
    dateObserved: "2026-08-07",
    now: NOW,
    database,
    ...overrides,
  };
}

function selectionInput(database, overrides = {}) {
  return {
    targetUserId: "teacher-001",
    targetTenantId: "tenant-school-001",
    dateObserved: "2026-08-07",
    classroomId: "class-jhs3-a",
    curriculumSubjectId: "curriculum-science-jhs3",
    curriculumSubStrandId: "substrand-curriculum-science-jhs3",
    database,
    ...overrides,
  };
}

async function main() {
  const sourcePath = path.join(
    repoRoot,
    "src/lib/appraisals/teacherSupervisoryObservationOptions.ts",
  );
  const source = fs.readFileSync(sourcePath, "utf8");
  const mod = require(sourcePath);
  const {
    TEACHER_SUPERVISORY_OBSERVATION_OPTIONS_POLICY,
    readTeacherSupervisoryObservationOptions,
    resolveTeacherSupervisoryObservationSelection,
    readTeacherSupervisoryObservationSelectionSnapshot,
  } = mod;

  assertEqual(TEACHER_SUPERVISORY_OBSERVATION_OPTIONS_POLICY.readOnly, true, "Options service must be read only");
  assertEqual(TEACHER_SUPERVISORY_OBSERVATION_OPTIONS_POLICY.explicitAssignmentsOverrideTeacherProfileFallback, true, "Explicit assignment precedence");
  assertEqual(TEACHER_SUPERVISORY_OBSERVATION_OPTIONS_POLICY.historicalLessonEvidenceMayWidenAuthority, false, "Historical evidence must not widen authority");
  assertEqual(TEACHER_SUPERVISORY_OBSERVATION_OPTIONS_POLICY.curriculumSubStrandRequired, true, "Curriculum sub-strand required");
  assertEqual(TEACHER_SUPERVISORY_OBSERVATION_OPTIONS_POLICY.providerCallsAllowed, false, "Provider calls forbidden");

  const database = new FakeDatabase();
  const options = await readTeacherSupervisoryObservationOptions(readInput(database));
  assertEqual(options.classes.length, 1, "Explicit SUBJECT assignment yields one assigned class");
  assertEqual(options.classes[0].classTaught, "JHS 3 A", "Class arm must remain visible");
  assertEqual(options.classes[0].subjects.length, 1, "Explicit Science assignment must not be widened by TeacherProfile Mathematics");
  assertEqual(options.classes[0].subjects[0].subject, "Science", "Assigned subject");
  assertEqual(options.classes[0].subjects[0].subStrands[0].title, "Farming Systems", "Curriculum sub-strand");
  assertEqual(options.historicalLessonEvidenceIncluded, false, "Historical lesson evidence excluded");
  assertEqual(options.contactDetailsIncluded, false, "Contacts excluded");
  assertEqual(options.providerCalled, false, "Providers absent");

  const selection = await resolveTeacherSupervisoryObservationSelection(selectionInput(database));
  assertEqual(selection.classTaught, "JHS 3 A", "Resolved class label");
  assertEqual(selection.subjectBeingObserved, "Science", "Resolved subject label");
  assertEqual(selection.subStrand, "Farming Systems", "Resolved sub-strand label");
  assertEqual(selection.authorization.source, "TEACHER_ASSESSMENT_ASSIGNMENT", "Explicit assignment provenance");
  assertDeepEqual(selection.authorization.assignmentIds, ["teacher-assignment-science-001"], "Exact assignment ID provenance");
  assertDeepEqual(selection.authorization.assignmentKinds, ["SUBJECT"], "Exact assignment kind provenance");

  await expectReject(
    () => resolveTeacherSupervisoryObservationSelection(selectionInput(database, {
      curriculumSubjectId: "curriculum-maths-jhs3",
      curriculumSubStrandId: "substrand-curriculum-maths-jhs3",
    })),
    "TEACHER_SUPERVISORY_OBSERVATION_SELECTION_INVALID",
    "Browser cannot choose a subject outside current Teacher assignment",
  );

  const notYetEffective = new FakeDatabase({
    assignments: [assignment({ startsAt: new Date("2026-09-01T00:00:00.000Z") })],
  });
  const futureAssignmentOptions = await readTeacherSupervisoryObservationOptions(readInput(notYetEffective));
  assertEqual(futureAssignmentOptions.classes.length, 0, "Explicit assignment outside date fails closed instead of falling back to profile");

  const allSubjects = new FakeDatabase({
    assignments: [assignment({
      id: "teacher-assignment-class-001",
      assignmentKind: "CLASS_ALL_SUBJECTS",
      subject: null,
      subjectNorm: null,
    })],
  });
  const allSubjectOptions = await readTeacherSupervisoryObservationOptions(readInput(allSubjects));
  assertDeepEqual(
    allSubjectOptions.classes[0].subjects.map((row) => row.subject),
    ["Mathematics", "Science"],
    "CLASS_ALL_SUBJECTS may use all curriculum subjects for exact assigned class",
  );

  const levelSubject = new FakeDatabase({
    assignments: [assignment({
      id: "teacher-assignment-level-science-001",
      classroomId: null,
      phase: "JHS",
      level: "JHS 3",
    })],
    classrooms: [
      classroom("class-jhs3-a", "JHS 3", "A"),
      classroom("class-jhs3-b", "JHS 3", "B"),
    ],
  });
  const levelOptions = await readTeacherSupervisoryObservationOptions(readInput(levelSubject));
  assertDeepEqual(
    levelOptions.classes.map((row) => row.classroomId),
    ["class-jhs3-a", "class-jhs3-b"],
    "Phase/level SUBJECT assignment may cover all matching active streams",
  );

  const multistreamProfileFallback = new FakeDatabase({
    assignments: [],
    classrooms: [
      classroom("class-jhs3-a", "JHS 3", "A"),
      classroom("class-jhs3-b", "JHS 3", "B"),
    ],
    profile: profile({ jhsAssignments: [{ subject: "Science", classes: ["JHS 3"] }] }),
  });
  const profileOptions = await readTeacherSupervisoryObservationOptions(readInput(multistreamProfileFallback));
  assertEqual(profileOptions.classes.length, 0, "Profile fallback must not guess a multistream class arm");

  const roundTrip = readTeacherSupervisoryObservationSelectionSnapshot(selection);
  assertDeepEqual(roundTrip, selection, "Selection snapshot must round-trip exactly");

  expectThrow(
    () => readTeacherSupervisoryObservationSelectionSnapshot({
      ...selection,
      authorization: {
        source: "TEACHER_ASSESSMENT_ASSIGNMENT",
        assignmentIds: [],
        assignmentKinds: ["SUBJECT"],
        teacherProfileId: null,
      },
    }),
    "TEACHER_SUPERVISORY_OBSERVATION_SELECTION_SNAPSHOT_INVALID",
    "Explicit assignment snapshot requires assignment provenance",
  );

  assertEqual(database.writeCalls, 0, "No database writes");
  assertEqual(database.providerCalls, 0, "No provider calls");

  for (const marker of [
    "teacherAssessmentAssignment.findMany",
    "teacherProfile.findUnique",
    "classroom.findMany",
    "curriculumSubject.findMany",
    "explicitAssignmentsOverrideTeacherProfileFallback: true",
    "historicalLessonEvidenceMayWidenAuthority: false",
    "SELECTION_MUST_MATCH_CURRENT_TEACHER_ASSIGNMENT_AND_CURRICULUM",
    "TEACHER_ASSESSMENT_ASSIGNMENT",
    "TEACHER_PROFILE_PRIMARY_CLASSROOM",
    "TEACHER_PROFILE_JHS_ASSIGNMENT",
  ]) {
    assert(source.includes(marker), `Observation-options source marker missing: ${marker}`);
  }

  for (const forbidden of [
    "schemeOfWork.find",
    "lessonNote.find",
    "lessonDelivery.find",
    "sendSms",
    "sendEmail",
    "localStorage",
    "sessionStorage",
    "setInterval(",
    ".create(",
    ".update(",
    ".delete(",
  ]) {
    assert(!source.includes(forbidden), `Observation-options source contains forbidden marker: ${forbidden}`);
  }

  console.log("");
  console.log("=== N6-D4D3B TEACHER OBSERVATION ASSIGNMENT + CURRICULUM OPTIONS ===");
  console.log("");
  console.log("Target authority                 : existing governance queue rechecked");
  console.log("Explicit Teacher assignments     : strongest current truth");
  console.log("Assignment effective date        : observation-date constrained");
  console.log("Profile fallback                 : only when explicit assignment rows absent");
  console.log("Multistream fallback             : no class-arm guessing");
  console.log("Class-all-subject assignment     : exact class curriculum subjects");
  console.log("Subject assignment               : exact class or phase/level scope");
  console.log("Sub-strands                      : official curriculum hierarchy only");
  console.log("Historical lessons/schemes       : cannot widen appraisal authority");
  console.log("Server selection validation      : class + subject + sub-strand exact");
  console.log("Database writes                  : absent");
  console.log("Providers                        : absent");
  console.log("");
  console.log("RESULT: N6-D4D3B TEACHER OBSERVATION OPTIONS GREEN");
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
