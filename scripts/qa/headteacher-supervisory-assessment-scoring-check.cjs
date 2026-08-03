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

const NOW = new Date("2026-07-29T12:00:00.000Z");
const OPENED = new Date("2026-07-25T08:00:00.000Z");
const OBSERVED = new Date("2026-07-28T00:00:00.000Z");
const CONTENT_HASH = "d".repeat(64);

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
  const definition =
    APPRAISAL_INSTRUMENT_DEFINITIONS.HEADTEACHER_SUPERVISORY_ASSESSMENT_V1;
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
    sections: definition.sections.map((section, sectionIndex) => ({
      id: `section-${sectionIndex + 1}`,
      key: section.key,
      title: section.title,
      description: section.description ?? null,
      order: section.order,
      maxScore: section.maxScore,
      items: section.items.map((item, itemIndex) => ({
        id: `item-${sectionIndex + 1}-${itemIndex + 1}`,
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
    id: "cycle-headteacher-001",
    scopeZoneId: "district-001",
    targetUserId: "headteacher-001",
    targetTenantId: "tenant-001",
    targetZoneId: "circuit-001",
    status: "OPEN",
    openedAt: OPENED,
    closedAt: null,
    reviewStartedAt: null,
    releasedAt: null,
    cancelledAt: null,
    metadata: {
      workflow: "HEADTEACHER_CONFIDENTIAL_STAFF_FEEDBACK",
      districtZoneId: "district-001",
      circuitZoneId: "circuit-001",
    },
    ...overrides,
  };
}

function visitContext() {
  return {
    schemaVersion: 1,
    workflow: "HEADTEACHER_GOVERNANCE_SUPERVISORY_ASSESSMENT",
    evidenceStream: "GOVERNANCE_SUPERVISORY_ASSESSMENT",
    cycle: {
      id: "cycle-headteacher-001",
      statusAtDraft: "OPEN",
      openedAt: OPENED.toISOString(),
      deadlineAt: "2026-08-01T08:00:00.000Z",
      closedAt: null,
    },
    target: {
      userId: "headteacher-001",
      role: "HEADTEACHER",
      tenantId: "tenant-001",
      name: "Head Teacher One",
      schoolName: "School One",
    },
    assessor: {
      userId: "actor-001",
      name: "Director One",
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
      instrumentId: "supervisory-instrument-001",
      instrumentVersionId: "supervisory-version-001",
      code: "HEADTEACHER_SUPERVISORY_ASSESSMENT_V1",
      version: 1,
      contentHash: CONTENT_HASH,
    },
    observation: { dateObserved: "2026-07-28" },
  };
}

function baseAssessment(overrides = {}) {
  const context = visitContext();
  return {
    id: "assessment-001",
    cycleId: "cycle-headteacher-001",
    instrumentVersionId: "supervisory-version-001",
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
      workflow: "HEADTEACHER_GOVERNANCE_SUPERVISORY_ASSESSMENT",
      evidenceStream: "GOVERNANCE_SUPERVISORY_ASSESSMENT",
      visitContextSchemaVersion: 1,
      visitContextHash: hashJson(context),
      visitContextImmutable: true,
      separateFromStaffFeedback: true,
      combinedWeightingDefined: false,
    },
    createdAt: new Date("2026-07-28T10:00:00.000Z"),
    scores: [],
    cycle: baseCycle(),
    instrumentVersion: buildInstrumentVersion(),
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
            id: `score-${this.nextScore++}`,
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

function storedScoreRows(assessmentId, instrumentVersion, scoreValue = 5) {
  let scoreIndex = 1;
  return instrumentVersion.sections.flatMap((section) =>
    section.items.map((item) => ({
      id: `stored-score-${scoreIndex++}`,
      assessmentId,
      instrumentItemId: item.id,
      sectionKey: section.key,
      sectionTitle: section.title,
      sectionOrder: section.order,
      sectionMaxScore: section.maxScore,
      itemKey: item.key,
      itemLabel: item.label,
      itemOrder: item.order,
      itemMaxScore: item.maxScore,
      score: scoreValue,
      notApplicable: false,
    })),
  );
}

function correctionRevisionAssessment(overrides = {}) {
  const context = visitContext();
  const instrumentVersion = buildInstrumentVersion();
  const assessmentId = "assessment-revision-002";
  const reviewStartedAt = new Date("2026-07-29T09:00:00.000Z");
  const visitContextHash = hashJson(context);

  return {
    id: assessmentId,
    revision: 2,
    priorAssessmentId: "assessment-returned-001",
    createdAt: new Date("2026-07-29T10:00:00.000Z"),
    evidenceSnapshotJson: context,
    instrumentVersion,
    scores: storedScoreRows(assessmentId, instrumentVersion),
    cycle: baseCycle({
      status: "UNDER_REVIEW",
      closedAt: new Date("2026-07-28T18:00:00.000Z"),
      reviewStartedAt,
    }),
    metadata: {
      workflow: "HEADTEACHER_GOVERNANCE_SUPERVISORY_ASSESSMENT",
      evidenceStream: "GOVERNANCE_SUPERVISORY_ASSESSMENT",
      revisionSchemaVersion: 1,
      revisionKey: "1".repeat(64),
      sourceAssessmentId: "assessment-returned-001",
      sourceAssessmentHash: "2".repeat(64),
      returnReviewId: "review-returned-001",
      returnReviewStage: 3,
      returnEvidenceHash: "3".repeat(64),
      returnReason: "Correct the two specified scores.",
      visitContextHash,
      visitContextSchemaVersion: 1,
      visitDetailsSchemaVersion: null,
      officialVisitDetailsIncluded: false,
      preserveVisitContext: true,
      copiedScoreCount: 34,
      reviewerMayRewriteScores: false,
      returnedAssessmentRequiresRevision: true,
      separateFromStaffFeedback: true,
      combinedWeightingDefined: false,
      providerCalled: false,
    },
    ...overrides,
  };
}

function auditText(database) {
  return JSON.stringify(database.audits);
}

async function main() {
  const sourcePath = path.join(
    repoRoot,
    "src/lib/appraisals/headteacherSupervisoryAssessmentScoring.ts",
  );
  const source = fs.readFileSync(sourcePath, "utf8");
  const scoringModule = require(sourcePath);
  const {
    HEADTEACHER_SUPERVISORY_SCORING_POLICY,
    loadHeadteacherSupervisoryAssessment,
    saveHeadteacherSupervisoryAssessmentSection,
    finalizeHeadteacherSupervisoryAssessment,
  } = scoringModule;

  assertEqual(HEADTEACHER_SUPERVISORY_SCORING_POLICY.saveUnit, "SECTION", "Save unit drift");
  assertEqual(HEADTEACHER_SUPERVISORY_SCORING_POLICY.commentsAllowed, false, "Comments must remain prohibited");
  assertEqual(HEADTEACHER_SUPERVISORY_SCORING_POLICY.expectedItemCount, 34, "Official item count drift");
  assertEqual(HEADTEACHER_SUPERVISORY_SCORING_POLICY.finalizedScoresImmutable, true, "Finalized immutability missing");
  assertEqual(HEADTEACHER_SUPERVISORY_SCORING_POLICY.reviewerMayRewriteScores, false, "Reviewer score rewrite must remain forbidden");
  assertEqual(HEADTEACHER_SUPERVISORY_SCORING_POLICY.correctionDraftCycleStatus, "UNDER_REVIEW", "Correction-cycle boundary drift");
  assertEqual(HEADTEACHER_SUPERVISORY_SCORING_POLICY.correctionRevisionMetadataRequired, true, "Correction metadata gate missing");

  const database = new FakeDatabase();
  const initial = await loadHeadteacherSupervisoryAssessment({
    actorUserId: "actor-001",
    actorRoleName: "DISTRICT_DIRECTOR",
    assessmentId: "assessment-001",
    now: NOW,
    database,
  });
  assertEqual(initial.status, "DRAFT", "Initial assessment must be draft");
  assertEqual(initial.progress.totalSections, 4, "Expected four sections");
  assertEqual(initial.progress.totalItems, 34, "Expected 34 items");
  assertEqual(initial.progress.answeredItems, 0, "New draft should have no scores");
  assertEqual(initial.canFinalize, false, "Incomplete draft must not finalize");

  const firstSection = database.assessment.instrumentVersion.sections[0];
  const partial = await saveHeadteacherSupervisoryAssessmentSection({
    actorUserId: "actor-001",
    actorRoleName: "DISTRICT_DIRECTOR",
    assessmentId: "assessment-001",
    sectionKey: firstSection.key,
    scores: [
      { itemKey: firstSection.items[0].key, score: 5 },
      { itemKey: firstSection.items[1].key, notApplicable: true },
    ],
    reqId: "request-save-001",
    now: NOW,
    database,
  });
  assertEqual(partial.outcome, "SAVED", "Partial section save should succeed");
  assertEqual(partial.progress.answeredItems, 2, "Partial progress mismatch");
  assertEqual(partial.progress.notApplicableItems, 1, "N/A progress mismatch");
  assertEqual(database.audits.length, 1, "One changed save should create one audit");
  assertEqual(database.transactionOptions[0].isolationLevel, "Serializable", "Serializable transaction");
  assertEqual(database.transactionOptions[0].maxWait, 10000, "Bounded transaction max wait");
  assertEqual(database.transactionOptions[0].timeout, 60000, "UAT latency transaction timeout");

  const unchanged = await saveHeadteacherSupervisoryAssessmentSection({
    actorUserId: "actor-001",
    actorRoleName: "DISTRICT_DIRECTOR",
    assessmentId: "assessment-001",
    sectionKey: firstSection.key,
    scores: [
      { itemKey: firstSection.items[0].key, score: 5 },
      { itemKey: firstSection.items[1].key, notApplicable: true },
    ],
    reqId: "request-save-002",
    now: NOW,
    database,
  });
  assertEqual(unchanged.outcome, "UNCHANGED", "Identical retry should be unchanged");
  assertEqual(database.audits.length, 1, "Identical retry must not duplicate audit");

  await expectReject(
    () =>
      saveHeadteacherSupervisoryAssessmentSection({
        actorUserId: "outsider-001",
        actorRoleName: "DISTRICT_DIRECTOR",
        assessmentId: "assessment-001",
        sectionKey: firstSection.key,
        scores: [{ itemKey: firstSection.items[0].key, score: 4 }],
        now: NOW,
        database,
      }),
    "HEADTEACHER_SUPERVISORY_SCORING_ASSESSOR_ONLY",
    "Only the owning assessor may save scores",
  );

  await expectReject(
    () =>
      saveHeadteacherSupervisoryAssessmentSection({
        actorUserId: "actor-001",
        actorRoleName: "DISTRICT_DIRECTOR",
        assessmentId: "assessment-001",
        sectionKey: firstSection.key,
        scores: [{ itemKey: firstSection.items[0].key, score: 6 }],
        now: NOW,
        database,
      }),
    "HEADTEACHER_SUPERVISORY_SCORING_INVALID_SCORE",
    "Out-of-range score must fail",
  );

  await expectReject(
    () =>
      saveHeadteacherSupervisoryAssessmentSection({
        actorUserId: "actor-001",
        actorRoleName: "DISTRICT_DIRECTOR",
        assessmentId: "assessment-001",
        sectionKey: firstSection.key,
        scores: [{ itemKey: firstSection.items[0].key, score: 4 }],
        generalComment: "Forbidden comment",
        now: NOW,
        database,
      }),
    "HEADTEACHER_SUPERVISORY_COMMENTS_FORBIDDEN",
    "Supervisory V1 comments must remain prohibited",
  );

  await expectReject(
    () =>
      finalizeHeadteacherSupervisoryAssessment({
        actorUserId: "actor-001",
        actorRoleName: "DISTRICT_DIRECTOR",
        assessmentId: "assessment-001",
        reqId: "request-finalize-incomplete",
        now: NOW,
        database,
      }),
    "HEADTEACHER_SUPERVISORY_SCORING_INCOMPLETE",
    "Incomplete assessment must not finalize",
  );
  assertEqual(database.assessment.status, "DRAFT", "Incomplete finalization must roll back");

  for (const [sectionIndex, section] of database.assessment.instrumentVersion.sections.entries()) {
    const naItemKey = sectionIndex === 0 ? section.items[1].key : null;
    await saveHeadteacherSupervisoryAssessmentSection({
      actorUserId: "actor-001",
      actorRoleName: "DISTRICT_DIRECTOR",
      assessmentId: "assessment-001",
      sectionKey: section.key,
      scores: sectionPayload(section, sectionIndex === 1 ? 4 : 5, naItemKey),
      reqId: `request-section-${sectionIndex + 1}`,
      now: NOW,
      database,
    });
  }

  const ready = await loadHeadteacherSupervisoryAssessment({
    actorUserId: "actor-001",
    actorRoleName: "DISTRICT_DIRECTOR",
    assessmentId: "assessment-001",
    now: NOW,
    database,
  });
  assertEqual(ready.progress.answeredItems, 34, "All items should be answered");
  assertEqual(ready.progress.notApplicableItems, 1, "One N/A expected");
  assertEqual(ready.canFinalize, true, "Complete draft should be finalizable");

  const finalized = await finalizeHeadteacherSupervisoryAssessment({
    actorUserId: "actor-001",
    actorRoleName: "DISTRICT_DIRECTOR",
    assessmentId: "assessment-001",
    reqId: "request-finalize-001",
    now: NOW,
    database,
  });
  assertEqual(finalized.outcome, "FINALIZED", "Complete assessment should finalize");
  assertEqual(database.assessment.status, "FINALIZED", "Stored status should finalize");
  assertEqual(database.assessment.generalComment, null, "General comment must remain null");
  assert(/^[a-f0-9]{64}$/.test(finalized.assessmentHash), "Assessment hash must be SHA-256");
  assertEqual(finalized.notApplicableItems, 1, "Finalized N/A count mismatch");
  assertEqual(finalized.sectionPercentages[firstSection.key], 100, "N/A must be excluded from denominator");
  assertEqual(finalized.overallPercentage, 95, "Expected N/A-aware overall percentage");

  const finalAuditCount = database.audits.filter(
    (audit) => audit.action === "HEADTEACHER_SUPERVISORY_ASSESSMENT_FINALIZED",
  ).length;
  assertEqual(finalAuditCount, 1, "Finalization should create one audit");
  const auditJson = auditText(database);
  assert(!auditJson.includes('"score":'), "Audit must not contain score values");
  assert(!auditJson.includes("Head Teacher One"), "Audit must not contain target name");
  assert(!auditJson.includes("director@example"), "Audit must not contain contacts");

  const retry = await finalizeHeadteacherSupervisoryAssessment({
    actorUserId: "actor-001",
    actorRoleName: "DISTRICT_DIRECTOR",
    assessmentId: "assessment-001",
    reqId: "request-finalize-002",
    now: new Date("2026-07-29T13:00:00.000Z"),
    database,
  });
  assertEqual(retry.outcome, "EXISTING_FINALIZED", "Finalization retry must be idempotent");
  assertEqual(retry.assessmentHash, finalized.assessmentHash, "Retry hash must match");
  assertEqual(
    database.audits.filter(
      (audit) => audit.action === "HEADTEACHER_SUPERVISORY_ASSESSMENT_FINALIZED",
    ).length,
    1,
    "Finalization retry must not duplicate audit",
  );

  await expectReject(
    () =>
      saveHeadteacherSupervisoryAssessmentSection({
        actorUserId: "actor-001",
        actorRoleName: "DISTRICT_DIRECTOR",
        assessmentId: "assessment-001",
        sectionKey: firstSection.key,
        scores: [{ itemKey: firstSection.items[0].key, score: 1 }],
        now: NOW,
        database,
      }),
    "HEADTEACHER_SUPERVISORY_SCORING_FINALIZED_SCORES_IMMUTABLE",
    "Finalized scores must be immutable",
  );

  const tampered = new FakeDatabase();
  for (const section of tampered.assessment.instrumentVersion.sections) {
    await saveHeadteacherSupervisoryAssessmentSection({
      actorUserId: "actor-001",
      actorRoleName: "DISTRICT_DIRECTOR",
      assessmentId: "assessment-001",
      sectionKey: section.key,
      scores: sectionPayload(section, 5),
      now: NOW,
      database: tampered,
    });
  }
  await finalizeHeadteacherSupervisoryAssessment({
    actorUserId: "actor-001",
    actorRoleName: "DISTRICT_DIRECTOR",
    assessmentId: "assessment-001",
    now: NOW,
    database: tampered,
  });
  tampered.assessment.scores[0].score = 1;
  await expectReject(
    () =>
      finalizeHeadteacherSupervisoryAssessment({
        actorUserId: "actor-001",
        actorRoleName: "DISTRICT_DIRECTOR",
        assessmentId: "assessment-001",
        now: NOW,
        database: tampered,
      }),
    "HEADTEACHER_SUPERVISORY_FINALIZED_CALCULATION_DRIFT",
    "Tampered finalized evidence must fail closed",
  );

  const inactive = new FakeDatabase({
    assignments: [districtAssignment({ status: "REVOKED" })],
  });
  await expectReject(
    () =>
      saveHeadteacherSupervisoryAssessmentSection({
        actorUserId: "actor-001",
        actorRoleName: "DISTRICT_DIRECTOR",
        assessmentId: "assessment-001",
        sectionKey: inactive.assessment.instrumentVersion.sections[0].key,
        scores: [{
          itemKey: inactive.assessment.instrumentVersion.sections[0].items[0].key,
          score: 5,
        }],
        now: NOW,
        database: inactive,
      }),
    "HEADTEACHER_SUPERVISORY_SCORING_AUTHORITY_ACTIVE_ASSIGNMENT_REQUIRED",
    "Inactive assignment must block mutation",
  );

  const returned = new FakeDatabase({ assessment: { status: "RETURNED" } });
  await expectReject(
    () =>
      saveHeadteacherSupervisoryAssessmentSection({
        actorUserId: "actor-001",
        actorRoleName: "DISTRICT_DIRECTOR",
        assessmentId: "assessment-001",
        sectionKey: returned.assessment.instrumentVersion.sections[0].key,
        scores: [{
          itemKey: returned.assessment.instrumentVersion.sections[0].items[0].key,
          score: 5,
        }],
        now: NOW,
        database: returned,
      }),
    "HEADTEACHER_SUPERVISORY_SCORING_RETURNED_REQUIRES_REVISION",
    "Returned work must require a new revision",
  );

  const ordinaryUnderReview = new FakeDatabase({
    assessment: {
      cycle: baseCycle({
        status: "UNDER_REVIEW",
        closedAt: new Date("2026-07-28T18:00:00.000Z"),
        reviewStartedAt: new Date("2026-07-29T09:00:00.000Z"),
      }),
    },
  });
  await expectReject(
    () =>
      loadHeadteacherSupervisoryAssessment({
        actorUserId: "actor-001",
        actorRoleName: "DISTRICT_DIRECTOR",
        assessmentId: "assessment-001",
        now: NOW,
        database: ordinaryUnderReview,
      }),
    "HEADTEACHER_SUPERVISORY_SCORING_CORRECTION_REVISION_INVALID",
    "An ordinary draft must not reopen after Director review starts",
  );

  const malformedCorrection = new FakeDatabase({
    assessment: correctionRevisionAssessment({
      metadata: {
        ...correctionRevisionAssessment().metadata,
        returnEvidenceHash: "",
      },
    }),
  });
  await expectReject(
    () =>
      loadHeadteacherSupervisoryAssessment({
        actorUserId: "actor-001",
        actorRoleName: "DISTRICT_DIRECTOR",
        assessmentId: "assessment-revision-002",
        now: NOW,
        database: malformedCorrection,
      }),
    "HEADTEACHER_SUPERVISORY_SCORING_CORRECTION_REVISION_INVALID",
    "Malformed correction metadata must fail closed",
  );

  const correction = new FakeDatabase({
    assessment: correctionRevisionAssessment(),
  });
  const correctionLoaded = await loadHeadteacherSupervisoryAssessment({
    actorUserId: "actor-001",
    actorRoleName: "DISTRICT_DIRECTOR",
    assessmentId: "assessment-revision-002",
    now: NOW,
    database: correction,
  });
  assertEqual(correctionLoaded.revision, 2, "Correction revision number mismatch");
  assertEqual(correctionLoaded.status, "DRAFT", "Correction copy must remain draft");
  assertEqual(correctionLoaded.canEdit, true, "Verified correction copy must be editable");
  assertEqual(correctionLoaded.canFinalize, true, "Copied complete correction must be finalizable");

  const correctionFirstSection =
    correction.assessment.instrumentVersion.sections[0];
  const correctionSave = await saveHeadteacherSupervisoryAssessmentSection({
    actorUserId: "actor-001",
    actorRoleName: "DISTRICT_DIRECTOR",
    assessmentId: "assessment-revision-002",
    sectionKey: correctionFirstSection.key,
    scores: [{
      itemKey: correctionFirstSection.items[0].key,
      score: 3,
      notApplicable: false,
    }],
    reqId: "request-correction-save-001",
    now: NOW,
    database: correction,
  });
  assertEqual(correctionSave.outcome, "SAVED", "Correction score save should succeed");
  assertEqual(correction.assessment.cycle.status, "UNDER_REVIEW", "Correction save must not transition the cycle");

  const correctionFinalized = await finalizeHeadteacherSupervisoryAssessment({
    actorUserId: "actor-001",
    actorRoleName: "DISTRICT_DIRECTOR",
    assessmentId: "assessment-revision-002",
    reqId: "request-correction-finalize-001",
    now: NOW,
    database: correction,
  });
  assertEqual(correctionFinalized.outcome, "FINALIZED", "Verified correction revision should finalize");
  assertEqual(correction.assessment.status, "FINALIZED", "Correction revision final status mismatch");
  assertEqual(correction.assessment.cycle.status, "UNDER_REVIEW", "Correction finalization must leave Director review open");

  assert(source.includes("Prisma.TransactionIsolationLevel.Serializable"), "Serializable transaction marker missing");
  assert(source.includes("calculateAppraisalScores"), "Shared scoring engine must be reused");
  assert(source.includes("assessmentId_instrumentItemId"), "Score upsert idempotency marker missing");
  assert(source.includes("assessmentHashSchemaVersion"), "Assessment hash schema marker missing");
  assert(source.includes('correctionDraftCycleStatus: "UNDER_REVIEW"'), "Correction cycle marker missing");
  assert(source.includes("HEADTEACHER_SUPERVISORY_SCORING_CORRECTION_REVISION_INVALID"), "Correction metadata fail-closed marker missing");
  assert(!source.includes("appraisalReview.create"), "F3 must not create reviews");
  assert(!source.includes("appraisalCycle.update"), "F3 must not transition cycles");
  assert(!source.includes("sendSms"), "F3 must not call SMS providers");
  assert(!source.includes("sendEmail"), "F3 must not call email providers");

  console.log("=== D3.4F3 HEADTEACHER SUPERVISORY SCORING + FINALIZATION ===");
  console.log("");
  console.log("Score ownership                  : exact assessor only");
  console.log("Current authority               : capability + active assignment revalidated");
  console.log("Save unit                       : partial/full section");
  console.log("Repeated identical save         : UNCHANGED, no duplicate audit");
  console.log("Official form                   : 4 sections / 34 items");
  console.log("Rating controls                 : 1-5 plus N/A");
  console.log("N/A denominator                 : excluded");
  console.log("Finalization completeness       : all 34 items required");
  console.log("Finalized evidence              : immutable SHA-256 proof");
  console.log("Finalization retry              : EXISTING_FINALIZED");
  console.log("Returned assessment             : new revision required");
  console.log("Correction revision             : verified draft editable during UNDER_REVIEW");
  console.log("Unverified review-time draft    : rejected");
  console.log("Reviewer score rewriting        : absent");
  console.log("Free-text comments              : prohibited");
  console.log("Audit score/contact leakage     : absent");
  console.log("Cycle/review transition         : absent");
  console.log("Transaction                     : serializable and bounded");
  console.log("Notifications/providers         : absent");
  console.log("Database accessed               : false");
  console.log("");
  console.log("RESULT: D3.4F3 HEADTEACHER SUPERVISORY SCORING GREEN");
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
