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

const NOW = new Date("2026-08-07T18:10:00.000Z");
const OPENED = new Date("2026-08-07T17:00:00.000Z");
const OBSERVED = new Date("2026-08-07T00:00:00.000Z");
const CONTENT_HASH = "f".repeat(64);

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, stableValue(nested)]),
  );
}
function hashJson(value) {
  return require("crypto")
    .createHash("sha256")
    .update(JSON.stringify(stableValue(value)), "utf8")
    .digest("hex");
}

function instrumentVersion() {
  const { APPRAISAL_INSTRUMENT_DEFINITIONS } = require(
    path.join(repoRoot, "src/lib/appraisals/instruments.ts"),
  );
  const definition = APPRAISAL_INSTRUMENT_DEFINITIONS.TEACHER_OBSERVATION_V1;
  return {
    id: "teacher-version-workspace-001",
    version: 1,
    status: "ACTIVE",
    contentHash: CONTENT_HASH,
    instrument: {
      id: "teacher-instrument-workspace-001",
      code: "TEACHER_OBSERVATION_V1",
      purpose: "TEACHER_OBSERVATION",
      subjectType: "TEACHER",
      isActive: true,
    },
    sections: definition.sections.map((section, sectionIndex) => ({
      id: `workspace-section-${sectionIndex + 1}`,
      key: section.key,
      title: section.title,
      description: section.description ?? null,
      order: section.order,
      maxScore: section.maxScore,
      items: section.items.map((item, itemIndex) => ({
        id: `workspace-item-${sectionIndex + 1}-${itemIndex + 1}`,
        key: item.key,
        label: item.label,
        order: item.order,
        maxScore: item.maxScore,
        isRequired: item.isRequired,
      })),
    })),
  };
}

function evidenceContext() {
  return {
    schemaVersion: 1,
    workflow: "TEACHER_GOVERNANCE_SUPERVISORY_ASSESSMENT",
    evidenceStream: "GOVERNANCE_TEACHER_OBSERVATION",
    cycle: {
      id: "cycle-workspace-001",
      statusAtDraft: "OPEN",
      openedAt: OPENED.toISOString(),
    },
    target: {
      userId: "teacher-workspace-001",
      role: "TEACHER",
      tenantId: "tenant-workspace-001",
      name: "Teacher Workspace",
      schoolName: "Workspace Basic School",
    },
    assessor: {
      userId: "actor-workspace-001",
      name: "HOS Workspace",
      role: "HEAD_OF_SUPERVISION",
      assignmentId: "assignment-hos-workspace-001",
      assignmentRole: "HEAD_OF_SUPERVISION",
      scopeLevel: "DISTRICT",
    },
    jurisdiction: {
      districtZoneId: "district-workspace-001",
      districtName: "Workspace District",
      circuitZoneId: "circuit-workspace-001",
      circuitName: "Workspace Circuit",
      assignmentZoneId: "district-workspace-001",
      assignmentZoneName: "Workspace District",
      assignmentParentZoneId: null,
      assignmentParentZoneName: null,
    },
    instrument: {
      instrumentId: "teacher-instrument-workspace-001",
      instrumentVersionId: "teacher-version-workspace-001",
      code: "TEACHER_OBSERVATION_V1",
      version: 1,
      contentHash: CONTENT_HASH,
    },
    observation: {
      dateObserved: "2026-08-07",
      details: {
        schemaVersion: 1,
        dateObserved: "2026-08-07",
        yearsInService: 12,
        yearsInPresentSchool: 4,
        subjectBeingObserved: "English Language",
        subStrand: "Reading",
        classTaught: "Basic 5",
        durationMinutes: 45,
      },
    },
  };
}

function scoringAssessment() {
  const context = evidenceContext();
  return {
    id: "assessment-workspace-001",
    cycleId: "cycle-workspace-001",
    instrumentVersionId: "teacher-version-workspace-001",
    assessorUserId: "actor-workspace-001",
    assessorAssignmentId: "assignment-hos-workspace-001",
    status: "DRAFT",
    revision: 1,
    priorAssessmentId: null,
    dateObserved: OBSERVED,
    overallPercentage: null,
    sectionPercentagesJson: {},
    generalComment: "Support learner questioning more consistently.",
    evidenceSnapshotJson: context,
    assessmentHash: null,
    finalizedByUserId: null,
    finalizedAt: null,
    metadata: {
      workflow: "TEACHER_GOVERNANCE_SUPERVISORY_ASSESSMENT",
      evidenceStream: "GOVERNANCE_TEACHER_OBSERVATION",
      observationContextSchemaVersion: 1,
      observationContextHash: hashJson(context),
      observationContextImmutable: true,
      observationDetailsSchemaVersion: 1,
      officialObservationDetailsIncluded: true,
      separateFromLegacyTeacherAppraisal: true,
      legacyTeacherAppraisalMutationAllowed: false,
      combinedWeightingDefined: false,
      providerCalled: false,
    },
    createdAt: new Date("2026-08-07T17:05:00.000Z"),
    scores: [],
    cycle: {
      id: "cycle-workspace-001",
      scopeZoneId: "district-workspace-001",
      targetUserId: "teacher-workspace-001",
      targetTenantId: "tenant-workspace-001",
      targetZoneId: "circuit-workspace-001",
      status: "OPEN",
      responseWindowDays: 0,
      minimumResponses: 0,
      openedAt: OPENED,
      deadlineAt: null,
      closedAt: null,
      reviewStartedAt: null,
      releasedAt: null,
      cancelledAt: null,
      metadata: {
        workflow: "TEACHER_GOVERNANCE_SUPERVISORY_ASSESSMENT",
        evidenceStream: "GOVERNANCE_TEACHER_OBSERVATION",
        respondentWorkflow: false,
        participantSelection: "NONE",
        legacyTeacherAppraisalIncluded: false,
        combinedWeightingDefined: false,
        providerCalled: false,
      },
      _count: { participants: 0 },
    },
    instrumentVersion: instrumentVersion(),
  };
}

function workspaceRecord() {
  const assessment = scoringAssessment();
  return {
    id: assessment.id,
    cycleId: assessment.cycleId,
    assessorUserId: assessment.assessorUserId,
    status: assessment.status,
    revision: assessment.revision,
    generalComment: assessment.generalComment,
    evidenceSnapshotJson: assessment.evidenceSnapshotJson,
    scores: assessment.scores.map((score) => ({
      instrumentItemId: score.instrumentItemId,
      itemKey: score.itemKey,
      score: score.score,
      notApplicable: score.notApplicable,
    })),
    instrumentVersion: {
      id: assessment.instrumentVersion.id,
      version: assessment.instrumentVersion.version,
      instrument: {
        code: assessment.instrumentVersion.instrument.code,
      },
      sections: assessment.instrumentVersion.sections.map((section) => ({
        key: section.key,
        title: section.title,
        description: section.description,
        order: section.order,
        maxScore: section.maxScore,
        items: section.items.map((item) => ({
          id: item.id,
          key: item.key,
          label: item.label,
          order: item.order,
          maxScore: item.maxScore,
        })),
      })),
    },
  };
}

function scoringDatabase() {
  const assessment = scoringAssessment();
  return {
    appraisalAssessment: {
      findUnique: async () => structuredClone(assessment),
    },
    membership: {
      findFirst: async () => ({
        id: "membership-workspace-001",
        userId: "teacher-workspace-001",
        tenantId: "tenant-workspace-001",
        status: "ACTIVE",
        role: { name: "TEACHER" },
        tenant: {
          id: "tenant-workspace-001",
          status: "ACTIVE",
          zone: {
            id: "circuit-workspace-001",
            name: "Workspace Circuit",
            isActive: true,
            parentZoneId: "district-workspace-001",
            zoneType: { level: 1, countryCode: "GH" },
            parentZone: {
              id: "district-workspace-001",
              name: "Workspace District",
              isActive: true,
              zoneType: { level: 2, countryCode: "GH" },
            },
          },
        },
      }),
    },
    governanceOfficerAssignment: {
      findMany: async () => [
        {
          id: "assignment-hos-workspace-001",
          userId: "actor-workspace-001",
          role: "HEAD_OF_SUPERVISION",
          status: "ACTIVE",
          startsAt: new Date("2026-01-01T00:00:00.000Z"),
          endsAt: null,
          zoneId: "district-workspace-001",
          zone: {
            id: "district-workspace-001",
            name: "Workspace District",
            isActive: true,
            parentZoneId: null,
            zoneType: { level: 2, countryCode: "GH" },
            parentZone: null,
          },
        },
      ],
    },
  };
}

async function main() {
  const sourcePath = path.join(
    repoRoot,
    "src/lib/appraisals/teacherSupervisoryAssessmentWorkspace.ts",
  );
  const source = fs.readFileSync(sourcePath, "utf8");
  const workspaceModule = require(sourcePath);
  const {
    TEACHER_SUPERVISORY_WORKSPACE_POLICY,
    buildTeacherSupervisoryWorkspace,
    loadTeacherSupervisoryAssessmentWorkspace,
  } = workspaceModule;

  assertEqual(TEACHER_SUPERVISORY_WORKSPACE_POLICY.audience, "ORIGINAL_GOVERNANCE_ASSESSOR", "Workspace audience drift");
  assertEqual(TEACHER_SUPERVISORY_WORKSPACE_POLICY.saveMode, "SERIALIZED_AUTOSAVE", "Workspace save mode drift");
  assertEqual(TEACHER_SUPERVISORY_WORKSPACE_POLICY.commentsAllowed, true, "Teacher comments must be visible/editable in draft");
  assertEqual(TEACHER_SUPERVISORY_WORKSPACE_POLICY.pollingAllowed, false, "Polling must remain disabled");
  assertEqual(TEACHER_SUPERVISORY_WORKSPACE_POLICY.persistentBrowserStorageAllowed, false, "Persistent browser storage must remain disabled");
  assertEqual(TEACHER_SUPERVISORY_WORKSPACE_POLICY.reviewControlsIncluded, false, "N6-D4A must not expose review controls");

  const record = workspaceRecord();
  const assessmentView = {
    assessmentId: "assessment-workspace-001",
    cycleId: "cycle-workspace-001",
    revision: 1,
    status: "DRAFT",
    assessorUserId: "actor-workspace-001",
    assessorAssignmentId: "assignment-hos-workspace-001",
    targetUserId: "teacher-workspace-001",
    targetTenantId: "tenant-workspace-001",
    targetCircuitZoneId: "circuit-workspace-001",
    targetDistrictZoneId: "district-workspace-001",
    instrumentCode: "TEACHER_OBSERVATION_V1",
    instrumentVersion: 1,
    dateObserved: "2026-08-07",
    observationContextHash: hashJson(evidenceContext()),
    assessmentHash: null,
    finalizedAt: null,
    generalComment: "Support learner questioning more consistently.",
    canEdit: true,
    canFinalize: false,
    commentsAllowed: true,
    separateFromLegacyTeacherAppraisal: true,
    combinedWeightingDefined: false,
    progress: {
      totalSections: 6,
      completedSections: 0,
      totalItems: 34,
      answeredItems: 0,
      notApplicableItems: 0,
      completionPercentage: 0,
      missingItemKeys: record.instrumentVersion.sections.flatMap((section) => section.items.map((item) => item.key)),
      sections: record.instrumentVersion.sections.map((section) => ({
        sectionKey: section.key,
        sectionTitle: section.title,
        sectionOrder: section.order,
        totalItems: section.items.length,
        answeredItems: 0,
        notApplicableItems: 0,
        complete: false,
        percentage: null,
      })),
    },
    sectionPercentages: {},
    overallPercentage: null,
  };

  const built = buildTeacherSupervisoryWorkspace({ record, assessment: assessmentView });
  assertEqual(built.sections.length, 6, "Workspace must expose six sections");
  assertEqual(
    built.sections.reduce((sum, section) => sum + section.items.length, 0),
    34,
    "Workspace must expose all 34 items",
  );
  assertEqual(built.generalComment, assessmentView.generalComment, "Workspace comment drift");
  assertEqual(built.observation.targetName, "Teacher Workspace", "Teacher name snapshot drift");
  assertEqual(built.observation.schoolName, "Workspace Basic School", "School snapshot drift");
  assertEqual(built.observation.circuitName, "Workspace Circuit", "Circuit snapshot drift");
  assertEqual(built.observation.districtName, "Workspace District", "District snapshot drift");
  assertEqual(built.observation.subjectBeingObserved, "English Language", "Subject observation drift");
  assertEqual(built.observation.subStrand, "Reading", "Sub-strand drift");
  assertEqual(built.observation.classTaught, "Basic 5", "Class taught drift");
  assertEqual(built.observation.durationMinutes, 45, "Duration drift");
  assertEqual(built.observation.yearsInService, 12, "Years in service drift");
  assertEqual(built.observation.yearsInPresentSchool, 4, "Years in present school drift");
  assertEqual(built.lifecycle.originalAssessorOnly, true, "Original-assessor lifecycle marker missing");
  assertEqual(built.lifecycle.reviewControlsIncluded, false, "Review controls must remain absent");
  assertEqual(built.privacy.legacyTeacherAppraisalIncluded, false, "Legacy TeacherAppraisal must remain excluded");
  assertEqual(built.privacy.confidentialStaffFeedbackIncluded, false, "Confidential Headteacher staff evidence must remain excluded");
  assertEqual(built.privacy.respondentIdentitiesIncluded, false, "Respondent identities must remain excluded");
  assertEqual(built.privacy.contactDetailsIncluded, false, "Contact details must remain excluded");

  const loaded = await loadTeacherSupervisoryAssessmentWorkspace({
    actorUserId: "actor-workspace-001",
    actorRoleName: "HEAD_OF_SUPERVISION",
    assessmentId: "assessment-workspace-001",
    now: NOW,
    scoringDatabase: scoringDatabase(),
    workspaceDatabase: {
      appraisalAssessment: {
        findUnique: async () => structuredClone(workspaceRecord()),
      },
    },
  });
  assertEqual(loaded.assessment.assessorUserId, "actor-workspace-001", "Loaded workspace assessor mismatch");
  assertEqual(loaded.sections.length, 6, "Loaded workspace section count drift");
  assertEqual(loaded.policy.databaseWritesAllowed, false, "Workspace must remain read only");

  await expectReject(
    () =>
      loadTeacherSupervisoryAssessmentWorkspace({
        actorUserId: "outsider-workspace-001",
        actorRoleName: "HEAD_OF_SUPERVISION",
        assessmentId: "assessment-workspace-001",
        now: NOW,
        scoringDatabase: scoringDatabase(),
        workspaceDatabase: {
          appraisalAssessment: {
            findUnique: async () => structuredClone(workspaceRecord()),
          },
        },
      }),
    "TEACHER_SUPERVISORY_SCORING_ASSESSOR_ONLY",
    "Non-owner must be denied before workspace disclosure",
  );

  const drifted = workspaceRecord();
  drifted.instrumentVersion.sections[0].items[0].key = "DUPLICATE";
  drifted.instrumentVersion.sections[0].items[1].key = "DUPLICATE";
  await expectReject(
    async () => buildTeacherSupervisoryWorkspace({ record: drifted, assessment: assessmentView }),
    "TEACHER_SUPERVISORY_WORKSPACE_DUPLICATE_ITEM",
    "Workspace must fail closed on duplicate item keys",
  );

  const outputText = JSON.stringify(built);
  assert(!outputText.toLowerCase().includes("email"), "Workspace payload must not expose email fields");
  assert(!outputText.toLowerCase().includes("phone"), "Workspace payload must not expose phone fields");
  assert(!outputText.includes("Respondent 1"), "Teacher workspace must not contain confidential respondent data");

  for (const marker of [
    "ORIGINAL_GOVERNANCE_ASSESSOR",
    "SERIALIZED_AUTOSAVE",
    "loadTeacherSupervisoryAssessment",
    "readTeacherSupervisoryObservationDetailsSnapshot",
    "reviewControlsIncluded: false",
    "legacyTeacherAppraisalIncluded: false",
  ]) {
    assert(source.includes(marker), `Required workspace marker missing: ${marker}`);
  }

  for (const forbidden of [
    "localStorage",
    "sessionStorage",
    "setInterval",
    "appraisalReview.create",
    "teacherAppraisal",
    "respondentUserId",
    "sendSms",
    "sendEmail",
  ]) {
    assert(!source.includes(forbidden), `Forbidden workspace marker present: ${forbidden}`);
  }

  console.log("");
  console.log("=== N6-D4A GOVERNANCE TEACHER OWNER-BOUND WORKSPACE CONTRACT ===");
  console.log("");
  console.log("Audience                        : original governance assessor only");
  console.log("Official observation header     : Teacher/school/circuit + 7 observation particulars");
  console.log("Official scoring form           : 6 sections / 34 items");
  console.log("General comments                : visible in native workspace");
  console.log("Score persistence               : database-backed reload");
  console.log("Interaction model               : responsive section cards");
  console.log("Autosave contract               : serialized");
  console.log("Polling/browser storage         : absent");
  console.log("Review controls                 : absent in N6-D4A");
  console.log("Legacy TeacherAppraisal         : excluded");
  console.log("Confidential staff feedback     : excluded");
  console.log("Respondent/reviewer identities  : excluded");
  console.log("Contact details                 : excluded");
  console.log("Database writes                 : absent");
  console.log("Providers                       : absent");
  console.log("Database accessed               : fake read only");
  console.log("");
  console.log("RESULT: N6-D4A GOVERNANCE TEACHER WORKSPACE GREEN");
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
