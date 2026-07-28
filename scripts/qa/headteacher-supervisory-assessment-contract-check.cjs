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

function assignment(role, zoneLevel, zoneId, parentZoneId = null, overrides = {}) {
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
    userId: "headteacher-001",
    roleName: "HEADTEACHER",
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
    now: new Date("2026-07-27T12:00:00.000Z"),
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
    "headteacherSupervisoryAssessment.ts",
  );
  const source = fs.readFileSync(sourcePath, "utf8");
  const supervisoryModule = require(sourcePath);
  const {
    HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY,
    canonicalHeadteacherSupervisoryAssessorRole,
    inspectHeadteacherSupervisoryInstrument,
    decideHeadteacherSupervisoryAssessmentAuthority,
    canTransitionHeadteacherSupervisoryAssessment,
    decideHeadteacherSupervisoryScoreMutation,
    planReturnedHeadteacherSupervisoryRevision,
  } = supervisoryModule;

  assertEqual(
    HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.instrumentCode,
    "HEADTEACHER_SUPERVISORY_ASSESSMENT_V1",
    "Supervisory instrument code",
  );
  assertEqual(
    HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.expectedSectionCount,
    4,
    "Section count policy",
  );
  assertEqual(
    HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.expectedItemCount,
    34,
    "Item count policy",
  );
  assertEqual(
    HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.expectedRawMaximum,
    170,
    "Raw maximum policy",
  );
  assertDeepEqual(
    HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.expectedSectionMaximums,
    [55, 45, 40, 30],
    "Section maximums policy",
  );
  assertEqual(
    HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.separateFromStaffFeedback,
    true,
    "Evidence streams must remain separate",
  );
  assertEqual(
    HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.combinedWeightingDefined,
    false,
    "Combined weighting must remain undefined",
  );
  assertEqual(
    HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.reviewerMayRewriteScores,
    false,
    "Reviewer score rewrites must be forbidden",
  );

  const instrument = inspectHeadteacherSupervisoryInstrument();
  assert(instrument.valid, "Published supervisory instrument contract invalid", instrument);
  assertEqual(instrument.sectionCount, 4, "Instrument section count");
  assertEqual(instrument.itemCount, 34, "Instrument item count");
  assertEqual(instrument.rawMaximum, 170, "Instrument raw maximum");
  assertDeepEqual(instrument.sectionMaximums, [55, 45, 40, 30], "Instrument section maximums");
  assertEqual(instrument.commentsAllowed, false, "Comments must be disabled");
  assertEqual(instrument.allowNotApplicable, true, "N/A must remain available");
  assertEqual(
    instrument.sharesOfficialItemBankWithStaffFeedback,
    true,
    "Supervisory and staff instruments must share the official item bank",
  );
  assertEqual(instrument.separateEvidenceStream, true, "Evidence stream separation");

  const districtRoles = [
    "DISTRICT_DIRECTOR",
    "HEAD_OF_SUPERVISION",
    "BASIC_SCHOOL_COORDINATOR",
  ];
  for (const role of districtRoles) {
    const result = decideHeadteacherSupervisoryAssessmentAuthority(
      authorityInput(role, [assignment(role, 2, "district-aks-001")]),
    );
    assert(result.allowed, `${role} district assessment should be allowed`, result);
    assertEqual(result.scopeLevel, "DISTRICT", `${role} scope level`);
  }

  for (const role of ["SISSO", "CIRCUIT_SUPERVISOR"]) {
    const result = decideHeadteacherSupervisoryAssessmentAuthority(
      authorityInput(role, [
        assignment(role, 1, "circuit-gef-001", "district-aks-001"),
      ]),
    );
    assert(result.allowed, `${role} circuit assessment should be allowed`, result);
    assertEqual(result.scopeLevel, "CIRCUIT", `${role} scope level`);
  }

  const aliasResult = decideHeadteacherSupervisoryAssessmentAuthority(
    authorityInput("CIRCUIT_SUPERVISOR", [
      assignment("SISSO", 1, "circuit-gef-001", "district-aks-001"),
    ]),
  );
  assert(aliasResult.allowed, "SISSO/Circuit Supervisor alias should preserve circuit authority", aliasResult);
  assertEqual(
    aliasResult.effectiveRole,
    "SISSO",
    "Circuit Supervisor legacy alias must canonicalize to the single SISSO office",
  );
  assertEqual(
    canonicalHeadteacherSupervisoryAssessorRole("Circuit Supervisor"),
    "SISSO",
    "Circuit Supervisor must be a legacy alias, not a separate office",
  );
  assertEqual(
    HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.circuitOffice.distinctOfficeCount,
    1,
    "SISSO and Circuit Supervisor must not be counted as separate offices",
  );

  expectDenied(
    decideHeadteacherSupervisoryAssessmentAuthority,
    authorityInput("DISTRICT_DIRECTOR", [assignment("DISTRICT_DIRECTOR", 2, "district-other")]),
    "DISTRICT_SCOPE_MISMATCH",
    "Director outside district must be denied",
  );
  expectDenied(
    decideHeadteacherSupervisoryAssessmentAuthority,
    authorityInput("SISSO", [assignment("SISSO", 1, "circuit-other", "district-aks-001")]),
    "CIRCUIT_SCOPE_MISMATCH",
    "SISSO outside circuit must be denied",
  );
  expectDenied(
    decideHeadteacherSupervisoryAssessmentAuthority,
    authorityInput("SISSO", [assignment("SISSO", 1, "circuit-gef-001", "district-other")]),
    "CIRCUIT_SCOPE_MISMATCH",
    "SISSO parent district drift must be denied",
  );
  expectDenied(
    decideHeadteacherSupervisoryAssessmentAuthority,
    authorityInput("HEAD_OF_SUPERVISION", []),
    "ACTIVE_ASSIGNMENT_REQUIRED",
    "Governance role without active assignment must be denied",
  );
  expectDenied(
    decideHeadteacherSupervisoryAssessmentAuthority,
    authorityInput("BASIC_SCHOOL_COORDINATOR", [
      assignment("BASIC_SCHOOL_COORDINATOR", 2, "district-aks-001", null, { status: "REVOKED" }),
    ]),
    "ACTIVE_ASSIGNMENT_REQUIRED",
    "Revoked assignment must be denied",
  );
  expectDenied(
    decideHeadteacherSupervisoryAssessmentAuthority,
    authorityInput("DISTRICT_DIRECTOR", [
      assignment("DISTRICT_DIRECTOR", 2, "district-aks-001"),
      assignment("DISTRICT_DIRECTOR", 2, "district-aks-001", null, { id: "duplicate-assignment" }),
    ]),
    "AMBIGUOUS_ACTIVE_ASSIGNMENT",
    "Overlapping active assignments must fail closed",
  );
  expectDenied(
    decideHeadteacherSupervisoryAssessmentAuthority,
    authorityInput("TEACHER", []),
    "CAPABILITY_NOT_GRANTED",
    "Teacher must not assess Headteacher",
  );
  expectDenied(
    decideHeadteacherSupervisoryAssessmentAuthority,
    authorityInput("HEADTEACHER", []),
    "CAPABILITY_NOT_GRANTED",
    "Headteacher must not assess Headteacher",
  );
  expectDenied(
    decideHeadteacherSupervisoryAssessmentAuthority,
    authorityInput("SUPERADMIN", []),
    "ASSESSOR_ROLE_NOT_OPERATIONAL",
    "Superadmin must not become an operational governance assessor",
  );
  expectDenied(
    decideHeadteacherSupervisoryAssessmentAuthority,
    {
      ...authorityInput("DISTRICT_DIRECTOR", [assignment("DISTRICT_DIRECTOR", 2, "district-aks-001")]),
      actorUserId: "headteacher-001",
    },
    "SELF_APPRAISAL_FORBIDDEN",
    "Self appraisal must be forbidden",
  );
  expectDenied(
    decideHeadteacherSupervisoryAssessmentAuthority,
    authorityInput("DISTRICT_DIRECTOR", [assignment("DISTRICT_DIRECTOR", 2, "district-aks-001")], {
      roleName: "TEACHER",
    }),
    "TARGET_NOT_HEADTEACHER",
    "Non-Headteacher target must be denied",
  );
  expectDenied(
    decideHeadteacherSupervisoryAssessmentAuthority,
    authorityInput("DISTRICT_DIRECTOR", [assignment("DISTRICT_DIRECTOR", 2, "district-aks-001")], {
      isActive: false,
    }),
    "TARGET_INACTIVE",
    "Inactive Headteacher must be denied",
  );
  expectDenied(
    decideHeadteacherSupervisoryAssessmentAuthority,
    authorityInput("DISTRICT_DIRECTOR", [assignment("DISTRICT_DIRECTOR", 2, "district-aks-001")], {
      tenantStatus: "SUSPENDED",
    }),
    "TARGET_TENANT_INACTIVE",
    "Inactive school must be denied",
  );

  assert(canTransitionHeadteacherSupervisoryAssessment("DRAFT", "FINALIZED"), "Draft must finalize");
  assert(canTransitionHeadteacherSupervisoryAssessment("FINALIZED", "RETURNED"), "Finalized may be returned");
  assert(canTransitionHeadteacherSupervisoryAssessment("RETURNED", "SUPERSEDED"), "Returned may be superseded by revision");
  assert(!canTransitionHeadteacherSupervisoryAssessment("FINALIZED", "DRAFT"), "Finalized must not reopen in place");
  assert(!canTransitionHeadteacherSupervisoryAssessment("SUPERSEDED", "DRAFT"), "Superseded assessment is terminal");

  assertDeepEqual(
    decideHeadteacherSupervisoryScoreMutation({
      status: "DRAFT",
      actorUserId: "assessor-001",
      assessorUserId: "assessor-001",
    }),
    { allowed: true, reason: "DRAFT_OWNER_EDIT" },
    "Draft owner edit",
  );
  assertDeepEqual(
    decideHeadteacherSupervisoryScoreMutation({
      status: "FINALIZED",
      actorUserId: "assessor-001",
      assessorUserId: "assessor-001",
    }),
    { allowed: false, reason: "FINALIZED_SCORES_IMMUTABLE" },
    "Finalized scores immutable",
  );
  assertDeepEqual(
    decideHeadteacherSupervisoryScoreMutation({
      status: "RETURNED",
      actorUserId: "assessor-001",
      assessorUserId: "assessor-001",
    }),
    { allowed: false, reason: "RETURNED_REQUIRES_REVISION" },
    "Returned assessment requires revision",
  );
  assertDeepEqual(
    decideHeadteacherSupervisoryScoreMutation({
      status: "DRAFT",
      actorUserId: "reviewer-001",
      assessorUserId: "assessor-001",
    }),
    { allowed: false, reason: "ASSESSOR_ONLY" },
    "Reviewer cannot edit assessor draft",
  );

  const revision = planReturnedHeadteacherSupervisoryRevision({
    assessmentId: "assessment-001",
    status: "RETURNED",
    revisionNumber: 1,
    assessorUserId: "assessor-001",
    targetUserId: "headteacher-001",
    returnReason: "Clarify the evidence for selected indicators.",
  });
  assert(revision.ok, "Returned assessment revision plan failed", revision);
  assertEqual(revision.value.originalTransition.from, "RETURNED", "Original revision from state");
  assertEqual(revision.value.originalTransition.to, "SUPERSEDED", "Original revision terminal state");
  assertEqual(revision.value.newRevision.status, "DRAFT", "New revision state");
  assertEqual(revision.value.newRevision.revisionNumber, 2, "Revision number increments");
  assertEqual(revision.value.newRevision.assessorUserId, "assessor-001", "Assessor ownership preserved");
  assertEqual(revision.value.newRevision.targetUserId, "headteacher-001", "Target preserved");
  assertEqual(revision.value.reviewerMayRewriteScores, false, "Reviewer rewrite policy");

  const rewrite = planReturnedHeadteacherSupervisoryRevision({
    assessmentId: "assessment-001",
    status: "RETURNED",
    revisionNumber: 1,
    assessorUserId: "assessor-001",
    targetUserId: "headteacher-001",
    returnReason: "Clarify evidence.",
    reviewerScoreEdits: [{ itemKey: "1.1", score: 5 }],
  });
  assert(!rewrite.ok, "Reviewer score rewrite must fail", rewrite);
  assertEqual(rewrite.code, "REVIEWER_SCORE_REWRITE_FORBIDDEN", "Reviewer rewrite failure code");

  const wrongStatus = planReturnedHeadteacherSupervisoryRevision({
    assessmentId: "assessment-001",
    status: "FINALIZED",
    revisionNumber: 1,
    assessorUserId: "assessor-001",
    targetUserId: "headteacher-001",
    returnReason: "Clarify evidence.",
  });
  assert(!wrongStatus.ok, "Revision before return must fail", wrongStatus);
  assertEqual(wrongStatus.code, "RETURNED_STATUS_REQUIRED", "Return status required");

  for (const forbidden of [
    "Akatsi",
    "appraisalSupervisoryAssessment.create",
    "prisma.$transaction",
    "sendSms",
    "sendEmail",
    "staffFeedbackWeight",
    "supervisoryWeight",
  ]) {
    assert(!source.includes(forbidden), `Forbidden contract marker present: ${forbidden}`);
  }

  console.log("");
  console.log("=== D3.4F1 HEADTEACHER SUPERVISORY AUTHORITY + LIFECYCLE CONTRACT ===");
  console.log("");
  console.log("Instrument                      : HEADTEACHER_SUPERVISORY_ASSESSMENT_V1");
  console.log("Official form                   : 4 sections / 34 items");
  console.log("Raw/section maximums            : 170 / 55-45-40-30");
  console.log("Shared official item bank       : verified");
  console.log("Evidence stream                 : separate from staff feedback");
  console.log("Combined weighting              : undefined");
  console.log("District assessors              : Director / HOS / BSC");
  console.log("Circuit office                  : SISSO (Circuit Supervisor is a legacy alias)");
  console.log("Capability + active assignment  : both required");
  console.log("District/circuit jurisdiction   : verified");
  console.log("Cross-scope/self assessment     : forbidden");
  console.log("Finalized scores                : immutable");
  console.log("Returned assessment             : revision required");
  console.log("Reviewer score rewriting        : forbidden");
  console.log("Assessment lifecycle            : DRAFT -> FINALIZED -> RETURNED -> SUPERSEDED");
  console.log("Database/transaction/API/UI     : absent");
  console.log("Database accessed               : false");
  console.log("");
  console.log("RESULT: D3.4F1 HEADTEACHER SUPERVISORY CONTRACT GREEN");
}

main();
