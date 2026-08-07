#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS QA harness intentionally loads TypeScript source through a local transpile hook. */

const fs = require("fs");
const path = require("path");
const Module = require("module");
const ts = require("typescript");

const repoRoot = path.resolve(__dirname, "..", "..");

function fail(message, detail) {
  const suffix =
    detail === undefined ? "" : `\n${JSON.stringify(detail, null, 2)}`;
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
Module._resolveFilename = function resolveFilename(
  request,
  parent,
  isMain,
  options,
) {
  if (typeof request === "string" && request.startsWith("@/")) {
    request = path.join(repoRoot, "src", request.slice(2));
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

require.extensions[".ts"] = function compileTypeScript(
  loadedModule,
  filename,
) {
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

function assignment(
  role,
  zoneLevel,
  zoneId,
  parentZoneId = null,
  overrides = {},
) {
  return {
    id: `assignment-${role}-${zoneId}`,
    userId: "actor-001",
    role,
    zoneId,
    zoneName: zoneId,
    zoneLevel,
    parentZoneId,
    parentZoneName: parentZoneId,
    status: "ACTIVE",
    isActive: true,
    ...overrides,
  };
}

function target(overrides = {}) {
  return {
    userId: "teacher-001",
    roleName: "TEACHER",
    isActive: true,
    tenantId: "tenant-school-001",
    tenantStatus: "ACTIVE",
    circuitZoneId: "circuit-gef-001",
    circuitName: "Gefia Circuit",
    districtZoneId: "district-aks-001",
    districtName: "Akatsi South District",
    ...overrides,
  };
}

function authorityInput(role, assignments, targetOverrides = {}) {
  return {
    actorUserId: "actor-001",
    actorRoleName: role,
    target: target(targetOverrides),
    assignments,
    now: new Date("2026-08-07T12:00:00.000Z"),
  };
}

function expectDenied(decide, input, reason, message) {
  const result = decide(input);
  assert(!result.allowed, message, result);
  assertEqual(result.reason, reason, message);
}

function main() {
  const sourcePath = path.join(
    repoRoot,
    "src",
    "lib",
    "appraisals",
    "teacherSupervisoryAssessment.ts",
  );
  const authorityPath = path.join(
    repoRoot,
    "src",
    "lib",
    "appraisals",
    "authority.ts",
  );

  const source = fs.readFileSync(sourcePath, "utf8");
  const authoritySource = fs.readFileSync(authorityPath, "utf8");

  const supervisoryModule = require(sourcePath);
  const {
    TEACHER_SUPERVISORY_ASSESSMENT_POLICY,
    canonicalTeacherSupervisoryAssessorRole,
    inspectTeacherSupervisoryInstrument,
    decideTeacherSupervisoryAssessmentAuthority,
    canTransitionTeacherSupervisoryAssessment,
    decideTeacherSupervisoryScoreMutation,
    planReturnedTeacherSupervisoryRevision,
  } = supervisoryModule;

  assertEqual(
    TEACHER_SUPERVISORY_ASSESSMENT_POLICY.instrumentCode,
    "TEACHER_OBSERVATION_V1",
    "Teacher supervisory instrument code",
  );
  assertEqual(
    TEACHER_SUPERVISORY_ASSESSMENT_POLICY.targetRole,
    "TEACHER",
    "Teacher target role",
  );
  assertEqual(
    TEACHER_SUPERVISORY_ASSESSMENT_POLICY.expectedHeaderFieldCount,
    10,
    "Official header field count",
  );
  assertEqual(
    TEACHER_SUPERVISORY_ASSESSMENT_POLICY.expectedSectionCount,
    6,
    "Section count policy",
  );
  assertEqual(
    TEACHER_SUPERVISORY_ASSESSMENT_POLICY.expectedItemCount,
    34,
    "Item count policy",
  );
  assertEqual(
    TEACHER_SUPERVISORY_ASSESSMENT_POLICY.expectedRawMaximum,
    170,
    "Raw maximum policy",
  );
  assertDeepEqual(
    TEACHER_SUPERVISORY_ASSESSMENT_POLICY.expectedSectionMaximums,
    [35, 25, 25, 30, 30, 25],
    "Teacher section maximums",
  );
  assertEqual(
    TEACHER_SUPERVISORY_ASSESSMENT_POLICY.commentsAllowed,
    true,
    "Official Teacher form comments must remain available",
  );
  assertEqual(
    TEACHER_SUPERVISORY_ASSESSMENT_POLICY.separateFromLegacyTeacherAppraisal,
    true,
    "Governance evidence must stay separate from legacy TeacherAppraisal",
  );
  assertEqual(
    TEACHER_SUPERVISORY_ASSESSMENT_POLICY.legacyTeacherAppraisalMutationAllowed,
    false,
    "Governance path must never mutate legacy TeacherAppraisal",
  );
  assertEqual(
    TEACHER_SUPERVISORY_ASSESSMENT_POLICY.cycleCreationMode,
    "DEFERRED_TO_ATOMIC_DRAFT_START",
    "Cycle creation must remain deferred until the draft transaction",
  );

  const instrument = inspectTeacherSupervisoryInstrument();
  assert(instrument.valid, "Teacher supervisory instrument contract invalid", instrument);
  assertEqual(instrument.headerFieldCount, 10, "Instrument header field count");
  assertEqual(instrument.sectionCount, 6, "Instrument section count");
  assertEqual(instrument.itemCount, 34, "Instrument item count");
  assertEqual(instrument.rawMaximum, 170, "Instrument raw maximum");
  assertDeepEqual(
    instrument.sectionMaximums,
    [35, 25, 25, 30, 30, 25],
    "Instrument section maximums",
  );
  assertEqual(instrument.commentsAllowed, true, "Teacher comments availability");
  assertEqual(instrument.allowNotApplicable, true, "N/A availability");
  assertEqual(
    instrument.separateFromLegacyTeacherAppraisal,
    true,
    "Legacy evidence separation",
  );

  const districtRoles = [
    "DISTRICT_DIRECTOR",
    "HEAD_OF_SUPERVISION",
    "BASIC_SCHOOL_COORDINATOR",
  ];

  for (const role of districtRoles) {
    const result = decideTeacherSupervisoryAssessmentAuthority(
      authorityInput(role, [assignment(role, 2, "district-aks-001")]),
    );
    assert(result.allowed, `${role} Teacher assessment should be allowed`, result);
    assertEqual(result.scopeLevel, "DISTRICT", `${role} scope level`);
  }

  for (const role of ["SISSO", "CIRCUIT_SUPERVISOR"]) {
    const result = decideTeacherSupervisoryAssessmentAuthority(
      authorityInput(role, [
        assignment(role, 1, "circuit-gef-001", "district-aks-001"),
      ]),
    );
    assert(result.allowed, `${role} Teacher assessment should be allowed`, result);
    assertEqual(result.scopeLevel, "CIRCUIT", `${role} scope level`);
  }

  const alias = decideTeacherSupervisoryAssessmentAuthority(
    authorityInput("CIRCUIT_SUPERVISOR", [
      assignment("SISSO", 1, "circuit-gef-001", "district-aks-001"),
    ]),
  );
  assert(alias.allowed, "Circuit Supervisor legacy alias should retain SISSO authority", alias);
  assertEqual(alias.effectiveRole, "SISSO", "Legacy alias canonical role");
  assertEqual(
    canonicalTeacherSupervisoryAssessorRole("Circuit Supervisor"),
    "SISSO",
    "Circuit Supervisor canonicalization",
  );
  assertEqual(
    TEACHER_SUPERVISORY_ASSESSMENT_POLICY.circuitOffice.distinctOfficeCount,
    1,
    "SISSO and Circuit Supervisor are one office",
  );

  expectDenied(
    decideTeacherSupervisoryAssessmentAuthority,
    authorityInput("DISTRICT_DIRECTOR", [
      assignment("DISTRICT_DIRECTOR", 2, "district-other"),
    ]),
    "DISTRICT_SCOPE_MISMATCH",
    "Director outside district must be denied",
  );
  expectDenied(
    decideTeacherSupervisoryAssessmentAuthority,
    authorityInput("SISSO", [
      assignment("SISSO", 1, "circuit-other", "district-aks-001"),
    ]),
    "CIRCUIT_SCOPE_MISMATCH",
    "SISSO outside circuit must be denied",
  );
  expectDenied(
    decideTeacherSupervisoryAssessmentAuthority,
    authorityInput("SISSO", [
      assignment("SISSO", 1, "circuit-gef-001", "district-other"),
    ]),
    "CIRCUIT_SCOPE_MISMATCH",
    "SISSO parent district drift must be denied",
  );
  expectDenied(
    decideTeacherSupervisoryAssessmentAuthority,
    authorityInput("HEAD_OF_SUPERVISION", []),
    "ACTIVE_ASSIGNMENT_REQUIRED",
    "HOS without active assignment must be denied",
  );
  expectDenied(
    decideTeacherSupervisoryAssessmentAuthority,
    authorityInput("BASIC_SCHOOL_COORDINATOR", [
      assignment("BASIC_SCHOOL_COORDINATOR", 2, "district-aks-001", null, {
        status: "REVOKED",
      }),
    ]),
    "ACTIVE_ASSIGNMENT_REQUIRED",
    "Revoked BSC assignment must be denied",
  );
  expectDenied(
    decideTeacherSupervisoryAssessmentAuthority,
    authorityInput("DISTRICT_DIRECTOR", [
      assignment("DISTRICT_DIRECTOR", 2, "district-aks-001"),
      assignment("DISTRICT_DIRECTOR", 2, "district-aks-001", null, {
        id: "duplicate-assignment",
      }),
    ]),
    "AMBIGUOUS_ACTIVE_ASSIGNMENT",
    "Overlapping district assignments must fail closed",
  );
  expectDenied(
    decideTeacherSupervisoryAssessmentAuthority,
    authorityInput("TEACHER", []),
    "CAPABILITY_NOT_GRANTED",
    "Teacher must not assess a Teacher",
  );
  expectDenied(
    decideTeacherSupervisoryAssessmentAuthority,
    authorityInput("HEADTEACHER", []),
    "ASSESSOR_ROLE_NOT_OPERATIONAL",
    "Headteacher must remain on the legacy TeacherAppraisal path",
  );
  expectDenied(
    decideTeacherSupervisoryAssessmentAuthority,
    authorityInput("SUPERADMIN", []),
    "ASSESSOR_ROLE_NOT_OPERATIONAL",
    "Superadmin must not become an operational Teacher assessor",
  );
  expectDenied(
    decideTeacherSupervisoryAssessmentAuthority,
    {
      ...authorityInput("DISTRICT_DIRECTOR", [
        assignment("DISTRICT_DIRECTOR", 2, "district-aks-001"),
      ]),
      actorUserId: "teacher-001",
    },
    "SELF_APPRAISAL_FORBIDDEN",
    "Self appraisal must be denied",
  );
  expectDenied(
    decideTeacherSupervisoryAssessmentAuthority,
    authorityInput(
      "DISTRICT_DIRECTOR",
      [assignment("DISTRICT_DIRECTOR", 2, "district-aks-001")],
      { roleName: "HEADTEACHER" },
    ),
    "TARGET_NOT_TEACHER",
    "Headteacher target must be denied on Teacher workflow",
  );
  expectDenied(
    decideTeacherSupervisoryAssessmentAuthority,
    authorityInput(
      "DISTRICT_DIRECTOR",
      [assignment("DISTRICT_DIRECTOR", 2, "district-aks-001")],
      { isActive: false },
    ),
    "TARGET_INACTIVE",
    "Inactive Teacher must be denied",
  );
  expectDenied(
    decideTeacherSupervisoryAssessmentAuthority,
    authorityInput(
      "DISTRICT_DIRECTOR",
      [assignment("DISTRICT_DIRECTOR", 2, "district-aks-001")],
      { tenantStatus: "SUSPENDED" },
    ),
    "TARGET_TENANT_INACTIVE",
    "Inactive school must be denied",
  );

  assert(
    canTransitionTeacherSupervisoryAssessment("DRAFT", "FINALIZED"),
    "Draft must finalize",
  );
  assert(
    canTransitionTeacherSupervisoryAssessment("FINALIZED", "RETURNED"),
    "Finalized may be returned",
  );
  assert(
    canTransitionTeacherSupervisoryAssessment("RETURNED", "SUPERSEDED"),
    "Returned may be superseded",
  );
  assert(
    !canTransitionTeacherSupervisoryAssessment("FINALIZED", "DRAFT"),
    "Finalized must not reopen in place",
  );

  assertDeepEqual(
    decideTeacherSupervisoryScoreMutation({
      status: "DRAFT",
      actorUserId: "assessor-001",
      assessorUserId: "assessor-001",
    }),
    { allowed: true, reason: "DRAFT_OWNER_EDIT" },
    "Draft owner edit",
  );
  assertDeepEqual(
    decideTeacherSupervisoryScoreMutation({
      status: "FINALIZED",
      actorUserId: "assessor-001",
      assessorUserId: "assessor-001",
    }),
    { allowed: false, reason: "FINALIZED_SCORES_IMMUTABLE" },
    "Finalized scores immutable",
  );
  assertDeepEqual(
    decideTeacherSupervisoryScoreMutation({
      status: "DRAFT",
      actorUserId: "other-001",
      assessorUserId: "assessor-001",
    }),
    { allowed: false, reason: "ASSESSOR_ONLY" },
    "Other governance assessor cannot edit draft",
  );

  const revision = planReturnedTeacherSupervisoryRevision({
    assessmentId: "assessment-001",
    status: "RETURNED",
    revisionNumber: 1,
    assessorUserId: "assessor-001",
    targetUserId: "teacher-001",
    returnReason: "Clarify the evidence for selected indicators.",
  });
  assert(revision.ok, "Returned Teacher assessment revision plan failed", revision);
  assertEqual(revision.value.newRevision.status, "DRAFT", "Revision state");
  assertEqual(revision.value.newRevision.revisionNumber, 2, "Revision number");
  assertEqual(
    revision.value.newRevision.assessorUserId,
    "assessor-001",
    "Assessor ownership preserved",
  );
  assertEqual(
    revision.value.newRevision.targetUserId,
    "teacher-001",
    "Teacher target preserved",
  );

  const rewrite = planReturnedTeacherSupervisoryRevision({
    assessmentId: "assessment-001",
    status: "RETURNED",
    revisionNumber: 1,
    assessorUserId: "assessor-001",
    targetUserId: "teacher-001",
    returnReason: "Clarify evidence.",
    reviewerScoreEdits: [{ itemKey: "1.1", score: 5 }],
  });
  assert(!rewrite.ok, "Reviewer score rewrite must fail", rewrite);
  assertEqual(
    rewrite.code,
    "REVIEWER_SCORE_REWRITE_FORBIDDEN",
    "Reviewer rewrite failure code",
  );

  for (const role of [
    "SISSO",
    "CIRCUIT_SUPERVISOR",
    "BASIC_SCHOOL_COORDINATOR",
    "HEAD_OF_SUPERVISION",
    "DISTRICT_DIRECTOR",
  ]) {
    assert(
      authoritySource.includes(
        `${role}: [`,
      ),
      `Authority role block missing: ${role}`,
    );
  }

  for (const forbidden of [
    "prisma.teacherAppraisal",
    "prisma.teacherAppraisalScore",
    "teacherAppraisal.create",
    "teacherAppraisal.update",
    "teacherAppraisal.delete",
    "$transaction",
    "appraisalCycle.create",
    "sendSms",
    "sendEmail",
    "Akatsi",
  ]) {
    assert(
      !source.includes(forbidden),
      `Forbidden N6-D2A policy marker present: ${forbidden}`,
    );
  }

  console.log("");
  console.log("=== N6-D2A GOVERNANCE TEACHER AUTHORITY CONTRACT ===");
  console.log("");
  console.log("Instrument                    : TEACHER_OBSERVATION_V1");
  console.log("Official form                 : 6 sections / 34 items");
  console.log("Raw/section maximums          : 170 / 35-25-25-30-30-25");
  console.log("Official header fields        : 10");
  console.log("General comments              : allowed by official form");
  console.log("District assessors            : Director / HOS / BSC");
  console.log("Circuit office                : SISSO (Circuit Supervisor legacy alias)");
  console.log("Capability + assignment       : both required");
  console.log("District/circuit jurisdiction : verified");
  console.log("Cross-scope/self assessment   : forbidden");
  console.log("Legacy TeacherAppraisal       : untouched");
  console.log("Cycle creation                : deferred to atomic draft-start transaction");
  console.log("Finalized scores              : immutable");
  console.log("Returned assessment           : revision required");
  console.log("Reviewer score rewriting      : forbidden");
  console.log("Database/API/UI               : absent");
  console.log("Database accessed             : false");
  console.log("");
  console.log("RESULT: N6-D2A GOVERNANCE TEACHER AUTHORITY GREEN");
}

main();
