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

const NOW = new Date("2026-08-07T18:00:00.000Z");
const OPENED = new Date("2026-08-07T17:00:00.000Z");
const OBSERVED = new Date("2026-08-07T00:00:00.000Z");
const CONTENT_HASH = "e".repeat(64);

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

function buildInstrumentVersion() {
  const { APPRAISAL_INSTRUMENT_DEFINITIONS } = require(
    path.join(repoRoot, "src/lib/appraisals/instruments.ts"),
  );
  const definition = APPRAISAL_INSTRUMENT_DEFINITIONS.TEACHER_OBSERVATION_V1;
  return {
    id: "teacher-version-001",
    version: 1,
    status: "ACTIVE",
    contentHash: CONTENT_HASH,
    instrument: {
      id: "teacher-instrument-001",
      code: "TEACHER_OBSERVATION_V1",
      purpose: "TEACHER_OBSERVATION",
      subjectType: "TEACHER",
      isActive: true,
    },
    sections: definition.sections.map((section, sectionIndex) => ({
      id: `teacher-section-${sectionIndex + 1}`,
      key: section.key,
      title: section.title,
      description: section.description ?? null,
      order: section.order,
      maxScore: section.maxScore,
      items: section.items.map((item, itemIndex) => ({
        id: `teacher-item-${sectionIndex + 1}-${itemIndex + 1}`,
        key: item.key,
        label: item.label,
        order: item.order,
        maxScore: item.maxScore,
        isRequired: item.isRequired,
      })),
    })),
  };
}

function baseCycle(overrides = {}) {
  return {
    id: "cycle-teacher-001",
    scopeZoneId: "district-001",
    targetUserId: "teacher-001",
    targetTenantId: "tenant-001",
    targetZoneId: "circuit-001",
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
    ...overrides,
  };
}

function observationContext() {
  return {
    schemaVersion: 1,
    workflow: "TEACHER_GOVERNANCE_SUPERVISORY_ASSESSMENT",
    evidenceStream: "GOVERNANCE_TEACHER_OBSERVATION",
    cycle: {
      id: "cycle-teacher-001",
      statusAtDraft: "OPEN",
      openedAt: OPENED.toISOString(),
    },
    target: {
      userId: "teacher-001",
      role: "TEACHER",
      tenantId: "tenant-001",
      name: "Teacher One",
      schoolName: "School One",
    },
    assessor: {
      userId: "actor-001",
      name: "District Director",
      role: "DISTRICT_DIRECTOR",
      assignmentId: "assignment-director-001",
      assignmentRole: "DISTRICT_DIRECTOR",
      scopeLevel: "DISTRICT",
    },
    jurisdiction: {
      districtZoneId: "district-001",
      districtName: "District One",
      circuitZoneId: "circuit-001",
      circuitName: "Circuit One",
      assignmentZoneId: "district-001",
      assignmentZoneName: "District One",
      assignmentParentZoneId: null,
      assignmentParentZoneName: null,
    },
    instrument: {
      instrumentId: "teacher-instrument-001",
      instrumentVersionId: "teacher-version-001",
      code: "TEACHER_OBSERVATION_V1",
      version: 1,
      contentHash: CONTENT_HASH,
    },
    observation: {
      dateObserved: "2026-08-07",
      details: {
        schemaVersion: 1,
        dateObserved: "2026-08-07",
        yearsInService: 8,
        yearsInPresentSchool: 3,
        subjectBeingObserved: "Mathematics",
        subStrand: "Fractions",
        classTaught: "Basic 6",
        durationMinutes: 60,
      },
    },
  };
}

function baseAssessment(overrides = {}) {
  const context = observationContext();
  return {
    id: "assessment-teacher-001",
    cycleId: "cycle-teacher-001",
    instrumentVersionId: "teacher-version-001",
    assessorUserId: "actor-001",
    assessorAssignmentId: "assignment-director-001",
    status: "DRAFT",
    revision: 1,
    priorAssessmentId: null,
    dateObserved: OBSERVED,
    overallPercentage: null,
    sectionPercentagesJson: {},
    generalComment: null,
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
    cycle: baseCycle(),
    instrumentVersion: buildInstrumentVersion(),
    ...overrides,
  };
}

function baseMembership(overrides = {}) {
  return {
    id: "membership-teacher-001",
    userId: "teacher-001",
    tenantId: "tenant-001",
    status: "ACTIVE",
    role: { name: "TEACHER" },
    tenant: {
      id: "tenant-001",
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

class FakeDatabase {
  constructor(overrides = {}) {
    this.assessment = baseAssessment(overrides.assessment ?? {});
    this.membershipRecord = baseMembership(overrides.membership ?? {});
    this.assignments = overrides.assignments ?? [districtAssignment()];
    this.audits = [];
    this.transactionOptions = [];
    this.nextScore = 1;
    this.appraisalAssessment = {
      findUnique: async () => structuredClone(this.assessment),
      update: async (args) => {
        this.assessment = {
          ...this.assessment,
          ...structuredClone(args.data),
        };
        return structuredClone(this.assessment);
      },
    };
    this.appraisalAssessmentScore = {
      upsert: async (args) => {
        const key = args.where.assessmentId_instrumentItemId;
        const existingIndex = this.assessment.scores.findIndex(
          (row) =>
            row.assessmentId === key.assessmentId &&
            row.instrumentItemId === key.instrumentItemId,
        );
        let row;
        if (existingIndex >= 0) {
          row = {
            ...this.assessment.scores[existingIndex],
            ...structuredClone(args.update),
          };
          this.assessment.scores[existingIndex] = row;
        } else {
          row = {
            id: `teacher-score-${this.nextScore++}`,
            ...structuredClone(args.create),
          };
          this.assessment.scores.push(row);
        }
        return structuredClone(row);
      },
    };
    this.membership = {
      findFirst: async () => structuredClone(this.membershipRecord),
    };
    this.governanceOfficerAssignment = {
      findMany: async () => structuredClone(this.assignments),
    };
    this.auditLog = {
      create: async (args) => {
        this.audits.push(structuredClone(args.data));
        return structuredClone(args.data);
      },
    };
  }

  async $transaction(operation, options) {
    this.transactionOptions.push(structuredClone(options));
    const snapshot = structuredClone({
      assessment: this.assessment,
      audits: this.audits,
      nextScore: this.nextScore,
    });
    try {
      return await operation(this);
    } catch (error) {
      this.assessment = snapshot.assessment;
      this.audits = snapshot.audits;
      this.nextScore = snapshot.nextScore;
      throw error;
    }
  }
}

function sectionPayload(section, scoreValue = 5, naItemKey = null) {
  return section.items.map((item) =>
    item.key === naItemKey
      ? { itemKey: item.key, score: null, notApplicable: true }
      : { itemKey: item.key, score: scoreValue, notApplicable: false },
  );
}

function auditText(database) {
  return JSON.stringify(database.audits);
}

async function main() {
  const sourcePath = path.join(
    repoRoot,
    "src/lib/appraisals/teacherSupervisoryAssessmentScoring.ts",
  );
  const source = fs.readFileSync(sourcePath, "utf8");
  const scoringModule = require(sourcePath);
  const {
    TEACHER_SUPERVISORY_SCORING_POLICY,
    loadTeacherSupervisoryAssessment,
    saveTeacherSupervisoryAssessmentSection,
    saveTeacherSupervisoryGeneralComment,
    finalizeTeacherSupervisoryAssessment,
  } = scoringModule;

  assertEqual(TEACHER_SUPERVISORY_SCORING_POLICY.saveUnit, "SECTION", "Save unit drift");
  assertEqual(TEACHER_SUPERVISORY_SCORING_POLICY.commentsAllowed, true, "Teacher general comments must be allowed");
  assertEqual(TEACHER_SUPERVISORY_SCORING_POLICY.expectedSectionCount, 6, "Official section count drift");
  assertEqual(TEACHER_SUPERVISORY_SCORING_POLICY.expectedItemCount, 34, "Official item count drift");
  assertEqual(TEACHER_SUPERVISORY_SCORING_POLICY.finalizedScoresImmutable, true, "Finalized score immutability missing");
  assertEqual(TEACHER_SUPERVISORY_SCORING_POLICY.finalizedCommentImmutable, true, "Finalized comment immutability missing");
  assertEqual(TEACHER_SUPERVISORY_SCORING_POLICY.reviewerMayRewriteScores, false, "Reviewer score rewrite must remain forbidden");
  assertEqual(TEACHER_SUPERVISORY_SCORING_POLICY.reviewerMayRewriteComment, false, "Reviewer comment rewrite must remain forbidden");

  const database = new FakeDatabase();
  const initial = await loadTeacherSupervisoryAssessment({
    actorUserId: "actor-001",
    actorRoleName: "DISTRICT_DIRECTOR",
    assessmentId: "assessment-teacher-001",
    now: NOW,
    database,
  });
  assertEqual(initial.status, "DRAFT", "Initial assessment must be draft");
  assertEqual(initial.progress.totalSections, 6, "Expected six sections");
  assertEqual(initial.progress.totalItems, 34, "Expected 34 items");
  assertEqual(initial.progress.answeredItems, 0, "New draft should have no scores");
  assertEqual(initial.generalComment, null, "New draft comment should be null");
  assertEqual(initial.canFinalize, false, "Incomplete draft must not finalize");

  const firstSection = database.assessment.instrumentVersion.sections[0];
  const partial = await saveTeacherSupervisoryAssessmentSection({
    actorUserId: "actor-001",
    actorRoleName: "DISTRICT_DIRECTOR",
    assessmentId: "assessment-teacher-001",
    sectionKey: firstSection.key,
    scores: [
      { itemKey: firstSection.items[0].key, score: 5 },
      { itemKey: firstSection.items[1].key, notApplicable: true },
    ],
    reqId: "teacher-save-001",
    now: NOW,
    database,
  });
  assertEqual(partial.outcome, "SAVED", "Partial section save should succeed");
  assertEqual(partial.progress.answeredItems, 2, "Partial progress mismatch");
  assertEqual(partial.progress.notApplicableItems, 1, "N/A progress mismatch");
  assertEqual(database.audits.length, 1, "Changed section save should create one audit");
  assertEqual(database.transactionOptions[0].isolationLevel, "Serializable", "Serializable transaction required");
  assertEqual(database.transactionOptions[0].maxWait, 10000, "Bounded transaction max wait");
  assertEqual(database.transactionOptions[0].timeout, 60000, "UAT latency timeout");

  const unchanged = await saveTeacherSupervisoryAssessmentSection({
    actorUserId: "actor-001",
    actorRoleName: "DISTRICT_DIRECTOR",
    assessmentId: "assessment-teacher-001",
    sectionKey: firstSection.key,
    scores: [
      { itemKey: firstSection.items[0].key, score: 5 },
      { itemKey: firstSection.items[1].key, notApplicable: true },
    ],
    reqId: "teacher-save-002",
    now: NOW,
    database,
  });
  assertEqual(unchanged.outcome, "UNCHANGED", "Identical section retry should be unchanged");
  assertEqual(database.audits.length, 1, "Identical score retry must not duplicate audit");

  const comment = await saveTeacherSupervisoryGeneralComment({
    actorUserId: "actor-001",
    actorRoleName: "DISTRICT_DIRECTOR",
    assessmentId: "assessment-teacher-001",
    generalComment: "  Strong learner engagement.\r\nContinue improving feedback.  ",
    reqId: "teacher-comment-001",
    now: NOW,
    database,
  });
  assertEqual(comment.outcome, "SAVED", "Teacher comment save should succeed");
  assertEqual(
    comment.generalComment,
    "Strong learner engagement.\nContinue improving feedback.",
    "Comment normalization drift",
  );
  assertEqual(database.audits.length, 2, "Comment change should create one audit");

  const commentRetry = await saveTeacherSupervisoryGeneralComment({
    actorUserId: "actor-001",
    actorRoleName: "DISTRICT_DIRECTOR",
    assessmentId: "assessment-teacher-001",
    generalComment: "Strong learner engagement.\nContinue improving feedback.",
    reqId: "teacher-comment-002",
    now: NOW,
    database,
  });
  assertEqual(commentRetry.outcome, "UNCHANGED", "Identical comment retry should be unchanged");
  assertEqual(database.audits.length, 2, "Identical comment retry must not duplicate audit");

  await expectReject(
    () =>
      saveTeacherSupervisoryAssessmentSection({
        actorUserId: "outsider-001",
        actorRoleName: "DISTRICT_DIRECTOR",
        assessmentId: "assessment-teacher-001",
        sectionKey: firstSection.key,
        scores: [{ itemKey: firstSection.items[0].key, score: 4 }],
        now: NOW,
        database,
      }),
    "TEACHER_SUPERVISORY_SCORING_ASSESSOR_ONLY",
    "Only owning assessor may save scores",
  );

  await expectReject(
    () =>
      saveTeacherSupervisoryAssessmentSection({
        actorUserId: "actor-001",
        actorRoleName: "DISTRICT_DIRECTOR",
        assessmentId: "assessment-teacher-001",
        sectionKey: firstSection.key,
        scores: [{ itemKey: firstSection.items[0].key, score: 6 }],
        now: NOW,
        database,
      }),
    "TEACHER_SUPERVISORY_SCORING_INVALID_SCORE",
    "Out-of-range score must fail",
  );

  await expectReject(
    () =>
      finalizeTeacherSupervisoryAssessment({
        actorUserId: "actor-001",
        actorRoleName: "DISTRICT_DIRECTOR",
        assessmentId: "assessment-teacher-001",
        reqId: "teacher-finalize-incomplete",
        now: NOW,
        database,
      }),
    "TEACHER_SUPERVISORY_SCORING_INCOMPLETE",
    "Incomplete assessment must not finalize",
  );
  assertEqual(database.assessment.status, "DRAFT", "Incomplete finalization must roll back");

  for (const [sectionIndex, section] of database.assessment.instrumentVersion.sections.entries()) {
    const naItemKey = sectionIndex === 0 ? section.items[1].key : null;
    await saveTeacherSupervisoryAssessmentSection({
      actorUserId: "actor-001",
      actorRoleName: "DISTRICT_DIRECTOR",
      assessmentId: "assessment-teacher-001",
      sectionKey: section.key,
      scores: sectionPayload(section, sectionIndex === 1 ? 4 : 5, naItemKey),
      reqId: `teacher-section-${sectionIndex + 1}`,
      now: NOW,
      database,
    });
  }

  const ready = await loadTeacherSupervisoryAssessment({
    actorUserId: "actor-001",
    actorRoleName: "DISTRICT_DIRECTOR",
    assessmentId: "assessment-teacher-001",
    now: NOW,
    database,
  });
  assertEqual(ready.progress.answeredItems, 34, "All items should be answered");
  assertEqual(ready.progress.notApplicableItems, 1, "One N/A expected");
  assertEqual(ready.canFinalize, true, "Complete draft should be finalizable");
  assertEqual(ready.generalComment, comment.generalComment, "Saved comment should reload");

  const finalized = await finalizeTeacherSupervisoryAssessment({
    actorUserId: "actor-001",
    actorRoleName: "DISTRICT_DIRECTOR",
    assessmentId: "assessment-teacher-001",
    reqId: "teacher-finalize-001",
    now: NOW,
    database,
  });
  assertEqual(finalized.outcome, "FINALIZED", "Complete Teacher assessment should finalize");
  assertEqual(database.assessment.status, "FINALIZED", "Stored status should finalize");
  assertEqual(finalized.generalComment, comment.generalComment, "Finalized comment must be preserved");
  assert(/^[a-f0-9]{64}$/.test(finalized.assessmentHash), "Assessment hash must be SHA-256");
  assertEqual(finalized.notApplicableItems, 1, "Finalized N/A count mismatch");
  assertEqual(finalized.sectionPercentages[firstSection.key], 100, "N/A must be excluded from denominator");
  assertEqual(finalized.overallPercentage, 96.67, "Expected six-section N/A-aware overall percentage");

  const finalAuditCount = database.audits.filter(
    (audit) => audit.action === "TEACHER_SUPERVISORY_ASSESSMENT_FINALIZED",
  ).length;
  assertEqual(finalAuditCount, 1, "Finalization should create one audit");
  const auditJson = auditText(database);
  assert(!auditJson.includes('"score":'), "Audit must not contain score values");
  assert(!auditJson.includes("Strong learner engagement"), "Audit must not contain comment text");
  assert(!auditJson.includes("Teacher One"), "Audit must not contain target name");
  assert(!auditJson.toLowerCase().includes("email"), "Audit must not contain email fields");

  const retry = await finalizeTeacherSupervisoryAssessment({
    actorUserId: "actor-001",
    actorRoleName: "DISTRICT_DIRECTOR",
    assessmentId: "assessment-teacher-001",
    reqId: "teacher-finalize-002",
    now: new Date("2026-08-07T18:30:00.000Z"),
    database,
  });
  assertEqual(retry.outcome, "EXISTING_FINALIZED", "Finalization retry must be idempotent");
  assertEqual(retry.assessmentHash, finalized.assessmentHash, "Retry hash must match");
  assertEqual(
    database.audits.filter(
      (audit) => audit.action === "TEACHER_SUPERVISORY_ASSESSMENT_FINALIZED",
    ).length,
    1,
    "Finalization retry must not duplicate audit",
  );

  await expectReject(
    () =>
      saveTeacherSupervisoryAssessmentSection({
        actorUserId: "actor-001",
        actorRoleName: "DISTRICT_DIRECTOR",
        assessmentId: "assessment-teacher-001",
        sectionKey: firstSection.key,
        scores: [{ itemKey: firstSection.items[0].key, score: 1 }],
        now: NOW,
        database,
      }),
    "TEACHER_SUPERVISORY_SCORING_FINALIZED_SCORES_IMMUTABLE",
    "Finalized scores must be immutable",
  );

  await expectReject(
    () =>
      saveTeacherSupervisoryGeneralComment({
        actorUserId: "actor-001",
        actorRoleName: "DISTRICT_DIRECTOR",
        assessmentId: "assessment-teacher-001",
        generalComment: "Attempted rewrite",
        now: NOW,
        database,
      }),
    "TEACHER_SUPERVISORY_SCORING_FINALIZED_COMMENT_IMMUTABLE",
    "Finalized general comment must be immutable",
  );

  const tamperedScore = new FakeDatabase();
  for (const section of tamperedScore.assessment.instrumentVersion.sections) {
    await saveTeacherSupervisoryAssessmentSection({
      actorUserId: "actor-001",
      actorRoleName: "DISTRICT_DIRECTOR",
      assessmentId: "assessment-teacher-001",
      sectionKey: section.key,
      scores: sectionPayload(section, 5),
      now: NOW,
      database: tamperedScore,
    });
  }
  await saveTeacherSupervisoryGeneralComment({
    actorUserId: "actor-001",
    actorRoleName: "DISTRICT_DIRECTOR",
    assessmentId: "assessment-teacher-001",
    generalComment: "Original comment",
    now: NOW,
    database: tamperedScore,
  });
  await finalizeTeacherSupervisoryAssessment({
    actorUserId: "actor-001",
    actorRoleName: "DISTRICT_DIRECTOR",
    assessmentId: "assessment-teacher-001",
    now: NOW,
    database: tamperedScore,
  });
  tamperedScore.assessment.scores[0].score = 1;
  await expectReject(
    () =>
      finalizeTeacherSupervisoryAssessment({
        actorUserId: "actor-001",
        actorRoleName: "DISTRICT_DIRECTOR",
        assessmentId: "assessment-teacher-001",
        now: NOW,
        database: tamperedScore,
      }),
    "TEACHER_SUPERVISORY_FINALIZED_CALCULATION_DRIFT",
    "Tampered finalized score evidence must fail closed",
  );

  const tamperedComment = new FakeDatabase();
  for (const section of tamperedComment.assessment.instrumentVersion.sections) {
    await saveTeacherSupervisoryAssessmentSection({
      actorUserId: "actor-001",
      actorRoleName: "DISTRICT_DIRECTOR",
      assessmentId: "assessment-teacher-001",
      sectionKey: section.key,
      scores: sectionPayload(section, 5),
      now: NOW,
      database: tamperedComment,
    });
  }
  await saveTeacherSupervisoryGeneralComment({
    actorUserId: "actor-001",
    actorRoleName: "DISTRICT_DIRECTOR",
    assessmentId: "assessment-teacher-001",
    generalComment: "Original comment",
    now: NOW,
    database: tamperedComment,
  });
  await finalizeTeacherSupervisoryAssessment({
    actorUserId: "actor-001",
    actorRoleName: "DISTRICT_DIRECTOR",
    assessmentId: "assessment-teacher-001",
    now: NOW,
    database: tamperedComment,
  });
  tamperedComment.assessment.generalComment = "Tampered comment";
  await expectReject(
    () =>
      finalizeTeacherSupervisoryAssessment({
        actorUserId: "actor-001",
        actorRoleName: "DISTRICT_DIRECTOR",
        assessmentId: "assessment-teacher-001",
        now: NOW,
        database: tamperedComment,
      }),
    "TEACHER_SUPERVISORY_ASSESSMENT_HASH_DRIFT",
    "Tampered finalized comment must break assessment hash",
  );

  const inactive = new FakeDatabase({
    assignments: [districtAssignment({ status: "REVOKED" })],
  });
  await expectReject(
    () =>
      saveTeacherSupervisoryAssessmentSection({
        actorUserId: "actor-001",
        actorRoleName: "DISTRICT_DIRECTOR",
        assessmentId: "assessment-teacher-001",
        sectionKey: inactive.assessment.instrumentVersion.sections[0].key,
        scores: [{
          itemKey: inactive.assessment.instrumentVersion.sections[0].items[0].key,
          score: 5,
        }],
        now: NOW,
        database: inactive,
      }),
    "TEACHER_SUPERVISORY_SCORING_AUTHORITY_ACTIVE_ASSIGNMENT_REQUIRED",
    "Inactive assignment must block mutation",
  );

  const wrongDistrict = new FakeDatabase({
    assignments: [
      districtAssignment({
        zoneId: "district-other",
        zone: {
          ...districtAssignment().zone,
          id: "district-other",
          name: "Other District",
        },
      }),
    ],
  });
  await expectReject(
    () =>
      saveTeacherSupervisoryGeneralComment({
        actorUserId: "actor-001",
        actorRoleName: "DISTRICT_DIRECTOR",
        assessmentId: "assessment-teacher-001",
        generalComment: "Not permitted",
        now: NOW,
        database: wrongDistrict,
      }),
    "TEACHER_SUPERVISORY_SCORING_AUTHORITY_DISTRICT_SCOPE_MISMATCH",
    "Cross-district mutation must be denied",
  );

  const returned = new FakeDatabase({ assessment: { status: "RETURNED" } });
  await expectReject(
    () =>
      saveTeacherSupervisoryAssessmentSection({
        actorUserId: "actor-001",
        actorRoleName: "DISTRICT_DIRECTOR",
        assessmentId: "assessment-teacher-001",
        sectionKey: returned.assessment.instrumentVersion.sections[0].key,
        scores: [{
          itemKey: returned.assessment.instrumentVersion.sections[0].items[0].key,
          score: 5,
        }],
        now: NOW,
        database: returned,
      }),
    "TEACHER_SUPERVISORY_SCORING_RETURNED_REQUIRES_REVISION",
    "Returned work must require a new revision",
  );

  const underReview = new FakeDatabase({
    assessment: {
      cycle: baseCycle({
        status: "UNDER_REVIEW",
        reviewStartedAt: new Date("2026-08-07T17:30:00.000Z"),
      }),
    },
  });
  await expectReject(
    () =>
      loadTeacherSupervisoryAssessment({
        actorUserId: "actor-001",
        actorRoleName: "DISTRICT_DIRECTOR",
        assessmentId: "assessment-teacher-001",
        now: NOW,
        database: underReview,
      }),
    "TEACHER_SUPERVISORY_SCORING_CYCLE_NOT_EDITABLE",
    "D4A must not reopen a draft after review begins",
  );

  for (const marker of [
    "Prisma.TransactionIsolationLevel.Serializable",
    "calculateAppraisalScores",
    "assessmentId_instrumentItemId",
    "assessmentHashSchemaVersion",
    "saveTeacherSupervisoryGeneralComment",
    "generalCommentIncludedInHash: true",
    "observationContextHash",
  ]) {
    assert(source.includes(marker), `Required source marker missing: ${marker}`);
  }

  for (const forbidden of [
    "appraisalReview.create",
    "appraisalCycle.update",
    "teacherAppraisal.create",
    "teacherAppraisal.update",
    "sendSms",
    "sendEmail",
  ]) {
    assert(!source.includes(forbidden), `Forbidden source marker present: ${forbidden}`);
  }

  console.log("");
  console.log("=== N6-D4A GOVERNANCE TEACHER SCORING + FINALIZATION CONTRACT ===");
  console.log("");
  console.log("Score ownership                  : exact governance assessor only");
  console.log("Current authority               : capability + active assignment revalidated");
  console.log("Official form                   : 6 sections / 34 items / 170 raw maximum");
  console.log("Save unit                       : partial/full section");
  console.log("Repeated identical score save  : UNCHANGED, no duplicate audit");
  console.log("General comments                : allowed + separate serialized save");
  console.log("Repeated identical comment save: UNCHANGED, no duplicate audit");
  console.log("Rating controls                 : 1-5 plus N/A");
  console.log("N/A denominator                 : excluded");
  console.log("Finalization completeness       : all 34 items required");
  console.log("Finalized evidence              : immutable SHA-256 incl. comment");
  console.log("Finalization retry              : EXISTING_FINALIZED");
  console.log("Returned assessment             : new revision required");
  console.log("Review-time draft editing       : absent in N6-D4A");
  console.log("Reviewer score/comment rewrite  : absent");
  console.log("Audit score/comment leakage     : absent");
  console.log("Legacy TeacherAppraisal         : untouched");
  console.log("Cycle/review transition         : absent");
  console.log("Transaction                     : serializable and bounded");
  console.log("Notifications/providers         : absent");
  console.log("Database accessed               : fake transaction only");
  console.log("");
  console.log("RESULT: N6-D4A GOVERNANCE TEACHER SCORING GREEN");
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
