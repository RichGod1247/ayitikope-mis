#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS QA harness intentionally loads TypeScript through a local transpile hook. */

const fs = require("fs");
const path = require("path");
const Module = require("module");
const ts = require("typescript");
const crypto = require("crypto");

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
function expectThrow(operation, code, message) {
  try {
    operation();
  } catch (error) {
    assertEqual(error && error.message, code, message);
    return error;
  }
  fail(message, { expectedError: code });
}
function deepClone(value) {
  return structuredClone(value);
}
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
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(stableValue(value)), "utf8")
    .digest("hex");
}
function round2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
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

const {
  APPRAISAL_INSTRUMENT_DEFINITIONS,
  APPRAISAL_INSTRUMENT_CODES,
} = require(path.join(repoRoot, "src/lib/appraisals/instruments.ts"));
const { calculateAppraisalScores } = require(
  path.join(repoRoot, "src/lib/appraisals/scoring.ts"),
);
const {
  HEADTEACHER_DIRECTOR_REVIEW_POLICY,
} = require(path.join(repoRoot, "src/lib/appraisals/headteacherDirectorReview.ts"));
const {
  HEADTEACHER_DIRECTOR_REVIEW_PACKAGE_POLICY,
  HEADTEACHER_DIRECTOR_REVIEW_DECISION_POLICY,
  readHeadteacherDirectorReviewPackage,
  planHeadteacherDirectorReviewDecision,
} = require(
  path.join(repoRoot, "src/lib/appraisals/headteacherDirectorReviewPackage.ts"),
);

const NOW = new Date("2026-07-30T12:00:00.000Z");
const REVIEW_STARTED = new Date("2026-07-29T12:00:00.000Z");
const STAFF_DEFINITION_HASH = "a".repeat(64);
const STAFF_SOURCE_HASH = "b".repeat(64);
const SUPERVISORY_DEFINITION_HASH = "d".repeat(64);

function officialSections() {
  const definition =
    APPRAISAL_INSTRUMENT_DEFINITIONS[
      APPRAISAL_INSTRUMENT_CODES.HEADTEACHER_SUPERVISORY_ASSESSMENT_V1
    ];
  return [...definition.sections]
    .sort((left, right) => left.order - right.order)
    .map((section) => ({
      id: `section-${section.order}`,
      key: section.key,
      title: section.title,
      order: section.order,
      maxScore: section.maxScore,
      items: [...section.items]
        .sort((left, right) => left.order - right.order)
        .map((item) => ({
          id: `item-${section.order}-${item.order}`,
          key: item.key,
          label: item.label,
          order: item.order,
          maxScore: item.maxScore,
        })),
    }));
}

function calculationRows(sections, scoreRows) {
  const stored = new Map(scoreRows.map((score) => [score.instrumentItemId, score]));
  return sections.flatMap((section) =>
    section.items.map((item) => {
      const score = stored.get(item.id);
      return {
        itemKey: item.key,
        sectionKey: section.key,
        sectionTitle: section.title,
        sectionOrder: section.order,
        score: score?.score ?? null,
        notApplicable: score?.notApplicable ?? false,
        itemMaxScore: item.maxScore,
      };
    }),
  );
}

function assessmentHashPayload(assessment, sections, sectionPercentages, overall) {
  const stored = new Map(
    assessment.scores.map((score) => [score.instrumentItemId, score]),
  );
  return {
    schemaVersion: 1,
    workflow: "HEADTEACHER_GOVERNANCE_SUPERVISORY_ASSESSMENT",
    evidenceStream: "GOVERNANCE_SUPERVISORY_ASSESSMENT",
    assessment: {
      id: assessment.id,
      cycleId: assessment.cycleId,
      revision: assessment.revision,
      assessorUserId: assessment.assessorUserId,
      assessorAssignmentId: assessment.assessorAssignmentId,
      dateObserved: assessment.dateObserved.toISOString().slice(0, 10),
      visitContextHash: assessment.metadata.visitContextHash,
    },
    instrument: {
      instrumentVersionId: assessment.instrumentVersionId,
      code: assessment.instrumentVersion.instrument.code,
      version: assessment.instrumentVersion.version,
      contentHash: assessment.instrumentVersion.contentHash,
    },
    scores: sections.flatMap((section) =>
      section.items.map((item) => {
        const score = stored.get(item.id);
        return {
          instrumentItemId: item.id,
          itemKey: item.key,
          sectionKey: section.key,
          sectionOrder: section.order,
          itemOrder: item.order,
          itemMaxScore: item.maxScore,
          score: score?.score ?? null,
          notApplicable: score?.notApplicable ?? false,
        };
      }),
    ),
    sectionPercentages,
    overallPercentage: overall,
    commentsIncluded: false,
    separateFromStaffFeedback: true,
    combinedWeightingDefined: false,
  };
}

function makeVisitContext({ schemaVersion = 2, includeVisitDetails = true } = {}) {
  return {
    schemaVersion,
    workflow: "HEADTEACHER_GOVERNANCE_SUPERVISORY_ASSESSMENT",
    evidenceStream: "GOVERNANCE_SUPERVISORY_ASSESSMENT",
    cycle: {
      id: "cycle-headteacher-001",
      statusAtDraft: "CLOSED",
      openedAt: "2026-07-20T00:00:00.000Z",
      deadlineAt: "2026-07-27T00:00:00.000Z",
      closedAt: "2026-07-29T08:00:00.000Z",
    },
    target: {
      userId: "headteacher-001",
      role: "HEADTEACHER",
      tenantId: "tenant-001",
      name: "Ama Headteacher",
      schoolName: "Ayitikope M/A Basic School",
    },
    assessor: {
      userId: "sisso-user-001",
      name: "Sena SISSO",
      role: "CIRCUIT_SUPERVISOR",
      assignmentId: "sisso-assignment-001",
      assignmentRole: "CIRCUIT_SUPERVISOR",
      scopeLevel: "CIRCUIT",
    },
    jurisdiction: {
      districtZoneId: "district-001",
      districtName: "Akatsi South",
      circuitZoneId: "circuit-001",
      circuitName: "Gefia Circuit",
      assignmentZoneId: "circuit-001",
      assignmentZoneName: "Gefia Circuit",
      assignmentParentZoneId: "district-001",
      assignmentParentZoneName: "Akatsi South",
    },
    instrument: {
      instrumentId: "supervisory-instrument-001",
      instrumentVersionId: "supervisory-version-001",
      code: APPRAISAL_INSTRUMENT_CODES.HEADTEACHER_SUPERVISORY_ASSESSMENT_V1,
      version: 1,
      contentHash: SUPERVISORY_DEFINITION_HASH,
    },
    observation: {
      dateObserved: "2026-07-27",
      ...(schemaVersion === 2 && includeVisitDetails
        ? {
            visitDetails: {
              schemaVersion: 1,
              arrivalTime: "08:00",
              staffStrength: 5,
              totalEnrolment: 200,
              girls: 90,
              boys: 110,
              teachersPresentAtVisit: 4,
            },
          }
        : {}),
    },
  };
}
function makeAssessment(overrides = {}) {
  const sections = officialSections();
  const scoreRows = sections.flatMap((section) =>
    section.items.map((item, index) => ({
      id: `score-${section.order}-${item.order}`,
      assessmentId: "assessment-001",
      instrumentItemId: item.id,
      sectionKey: section.key,
      sectionTitle: section.title,
      sectionOrder: section.order,
      sectionMaxScore: section.maxScore,
      itemKey: item.key,
      itemLabel: item.label,
      itemOrder: item.order,
      itemMaxScore: item.maxScore,
      score: section.order === 4 && index === 0 ? null : 5,
      notApplicable: section.order === 4 && index === 0,
    })),
  );
  const calculated = calculateAppraisalScores(
    calculationRows(sections, scoreRows),
    { requireComplete: true },
  );
  assert(calculated.ok, "Fixture supervisory scores must calculate", calculated);

  const context = overrides.evidenceSnapshotJson ?? makeVisitContext();
  const visitContextHash = hashJson(context);
  const contextSchemaVersion = Number(context.schemaVersion);
  const assessment = {
    id: "assessment-001",
    cycleId: "cycle-headteacher-001",
    instrumentVersionId: "supervisory-version-001",
    assessorUserId: "sisso-user-001",
    assessorAssignmentId: "sisso-assignment-001",
    status: "FINALIZED",
    revision: 1,
    priorAssessmentId: null,
    dateObserved: new Date("2026-07-27T00:00:00.000Z"),
    overallPercentage: calculated.value.overallPercentage,
    sectionPercentagesJson: calculated.value.sectionPercentages,
    generalComment: null,
    evidenceSnapshotJson: context,
    assessmentHash: null,
    finalizedByUserId: "sisso-user-001",
    finalizedAt: new Date("2026-07-28T10:00:00.000Z"),
    metadata: {
      visitContextHash,
      ...(contextSchemaVersion === 2
        ? {
            visitContextSchemaVersion: 2,
            visitDetailsSchemaVersion: 1,
            officialVisitDetailsIncluded: true,
          }
        : {}),
      reviewerMayRewriteScores: false,
      combinedWeightingDefined: false,
    },
    createdAt: new Date("2026-07-27T08:00:00.000Z"),
    scores: scoreRows,
    instrumentVersion: {
      id: "supervisory-version-001",
      version: 1,
      status: "ACTIVE",
      contentHash: SUPERVISORY_DEFINITION_HASH,
      instrument: {
        id: "supervisory-instrument-001",
        code: APPRAISAL_INSTRUMENT_CODES.HEADTEACHER_SUPERVISORY_ASSESSMENT_V1,
        purpose: "HEADTEACHER_SUPERVISORY_ASSESSMENT",
        subjectType: "HEADTEACHER",
        isActive: true,
      },
      sections,
    },
  };
  assessment.assessmentHash = hashJson(
    assessmentHashPayload(
      assessment,
      sections,
      calculated.value.sectionPercentages,
      calculated.value.overallPercentage,
    ),
  );
  return { ...assessment, ...overrides };
}

function makeCycle(overrides = {}) {
  return {
    id: "cycle-headteacher-001",
    instrumentVersionId: "staff-version-001",
    scopeZoneId: "district-001",
    targetUserId: "headteacher-001",
    targetTenantId: "tenant-001",
    targetZoneId: "circuit-001",
    status: "UNDER_REVIEW",
    minimumResponses: 1,
    targetRoleSnapshot: "HEADTEACHER",
    reviewStartedAt: REVIEW_STARTED,
    releasedAt: null,
    cancelledAt: null,
    metadata: { workflow: "HEADTEACHER_CONFIDENTIAL_STAFF_FEEDBACK" },
    participants: [
      { status: "FINALIZED" },
      { status: "FINALIZED" },
      { status: "FINALIZED" },
      { status: "EXPIRED" },
    ],
    scopeZone: {
      id: "district-001",
      name: "Akatsi South",
      isActive: true,
      zoneType: { level: 2, countryCode: "GH" },
    },
    instrumentVersion: {
      id: "staff-version-001",
      version: 1,
      contentHash: STAFF_DEFINITION_HASH,
      instrument: {
        code: APPRAISAL_INSTRUMENT_CODES.HEADTEACHER_STAFF_FEEDBACK_V1,
        purpose: "HEADTEACHER_STAFF_FEEDBACK",
        subjectType: "HEADTEACHER",
        isActive: true,
      },
    },
    ...overrides,
  };
}

function makeMembership(overrides = {}) {
  return {
    id: "membership-headteacher-001",
    userId: "headteacher-001",
    tenantId: "tenant-001",
    status: "ACTIVE",
    role: { name: "HEADTEACHER" },
    user: {
      id: "headteacher-001",
      name: "Ama Headteacher",
      firstName: "Ama",
      lastName: "Headteacher",
    },
    tenant: {
      id: "tenant-001",
      name: "Ayitikope M/A Basic School",
      status: "ACTIVE",
      zone: {
        id: "circuit-001",
        name: "Gefia Circuit",
        isActive: true,
        parentZoneId: "district-001",
        zoneType: { level: 1, countryCode: "GH" },
        parentZone: {
          id: "district-001",
          name: "Akatsi South",
          isActive: true,
          zoneType: { level: 2, countryCode: "GH" },
        },
      },
    },
    ...overrides,
  };
}

function makeAssignment(overrides = {}) {
  return {
    id: "director-assignment-001",
    userId: "director-user-001",
    role: "DISTRICT_DIRECTOR",
    status: "ACTIVE",
    revokedAt: null,
    startsAt: new Date("2026-01-01T00:00:00.000Z"),
    endsAt: null,
    zoneId: "district-001",
    zone: {
      id: "district-001",
      name: "Akatsi South",
      isActive: true,
      zoneType: { level: 2, countryCode: "GH" },
    },
    ...overrides,
  };
}

function makeStaffEvidence() {
  const sections = officialSections();
  const sectionPercentages = [80, 82, 84, 86];
  const sectionEvidence = {};
  const itemEvidence = {};

  for (const section of sections) {
    sectionEvidence[section.key] = {
      sectionKey: section.key,
      sectionTitle: section.title,
      sectionOrder: section.order,
      sectionMaxScore: section.maxScore,
      finalizedResponses: 3,
      averagePercentage: sectionPercentages[section.order - 1],
    };
    for (const [index, item] of section.items.entries()) {
      const allNotApplicable = section.order === 1 && index === 0;
      const averageScore = allNotApplicable ? null : 4;
      itemEvidence[item.key] = {
        itemKey: item.key,
        itemLabel: item.label,
        itemOrder: item.order,
        itemMaxScore: item.maxScore,
        sectionKey: section.key,
        sectionOrder: section.order,
        applicableResponses: allNotApplicable ? 0 : 3,
        notApplicableResponses: allNotApplicable ? 3 : 0,
        averageScore,
        averagePercentage: allNotApplicable
          ? null
          : round2((averageScore / item.maxScore) * 100),
      };
    }
  }
  return { sectionEvidence, itemEvidence };
}

function makeSnapshot(overrides = {}) {
  const evidence = makeStaffEvidence();
  return {
    id: "snapshot-001",
    cycleId: "cycle-headteacher-001",
    version: 1,
    eligibleResponses: 4,
    finalizedResponses: 3,
    expiredResponses: 1,
    minimumResponses: 1,
    releaseEligible: true,
    overallPercentage: 83,
    sectionAveragesJson: evidence.sectionEvidence,
    itemAveragesJson: evidence.itemEvidence,
    sourceHash: STAFF_SOURCE_HASH,
    generatedByUserId: null,
    generatedAt: new Date("2026-07-29T08:00:00.000Z"),
    metadata: {
      workflow: "HEADTEACHER_CONFIDENTIAL_STAFF_FEEDBACK",
      aggregateSchemaVersion: 1,
      instrumentCode: APPRAISAL_INSTRUMENT_CODES.HEADTEACHER_STAFF_FEEDBACK_V1,
      instrumentVersion: 1,
      readiness: "READY",
      privacy: {
        respondentIdentitiesIncluded: false,
        individualScoresIncluded: false,
        responseHashesIncluded: false,
        submissionTimestampsIncluded: false,
        participantListIncluded: false,
      },
      sourceIntegrity: {
        sourceHashAlgorithm: "SHA-256",
        finalizedResponsesOnly: true,
        immutableSnapshotVersion: 1,
      },
    },
    ...overrides,
  };
}

function reviewEvidence(assessment) {
  return {
    staffFeedback: {
      ready: true,
      snapshotId: "snapshot-001",
      snapshotVersion: 1,
      sourceHash: STAFF_SOURCE_HASH,
      finalizedResponses: 3,
      minimumResponses: 1,
    },
    supervisoryAssessment: {
      ready: true,
      assessmentId: assessment.id,
      revision: assessment.revision,
      assessmentHash: assessment.assessmentHash,
      assessorUserId: assessment.assessorUserId,
      assessorAssignmentId: assessment.assessorAssignmentId,
      directorAuthored: false,
    },
    separateEvidenceStreams: true,
    combinedWeightingDefined: false,
    respondentIdentitiesAccessed: false,
    individualStaffResponsesAccessed: false,
    reviewerMayRewriteScores: false,
  };
}

function makeReview(assessment, overrides = {}) {
  const evidence = reviewEvidence(assessment);
  const reviewEvidenceHash = hashJson({
    schemaVersion: HEADTEACHER_DIRECTOR_REVIEW_POLICY.schemaVersion,
    workflow: HEADTEACHER_DIRECTOR_REVIEW_POLICY.workflow,
    cycleId: "cycle-headteacher-001",
    reviewerUserId: "director-user-001",
    reviewerAssignmentId: "director-assignment-001",
    staffFeedback: {
      snapshotId: evidence.staffFeedback.snapshotId,
      snapshotVersion: evidence.staffFeedback.snapshotVersion,
      sourceHash: evidence.staffFeedback.sourceHash,
      finalizedResponses: evidence.staffFeedback.finalizedResponses,
      minimumResponses: evidence.staffFeedback.minimumResponses,
    },
    supervisoryAssessment: {
      assessmentId: evidence.supervisoryAssessment.assessmentId,
      revision: evidence.supervisoryAssessment.revision,
      assessmentHash: evidence.supervisoryAssessment.assessmentHash,
      assessorAssignmentId: evidence.supervisoryAssessment.assessorAssignmentId,
      directorAuthored: evidence.supervisoryAssessment.directorAuthored,
    },
    separateEvidenceStreams: true,
    combinedWeightingDefined: false,
    respondentIdentitiesAccessed: false,
    individualStaffResponsesAccessed: false,
    reviewerMayRewriteScores: false,
  });
  return {
    id: "review-001",
    cycleId: "cycle-headteacher-001",
    assessmentId: assessment.id,
    reviewerUserId: "director-user-001",
    reviewerAssignmentId: "director-assignment-001",
    stage: 1,
    decision: "PENDING",
    note: null,
    decidedAt: null,
    metadata: {
      schemaVersion: 1,
      workflow: "HEADTEACHER_CONFIDENTIAL_STAFF_FEEDBACK",
      reviewStage: 1,
      reviewEvidenceHash,
      evidence,
      respondentIdentitiesAccessed: false,
      individualStaffResponsesAccessed: false,
      reviewerMayRewriteScores: false,
      separateEvidenceStreams: true,
      combinedWeightingDefined: false,
      providerCalled: false,
    },
    createdAt: REVIEW_STARTED,
    ...overrides,
  };
}

function createDatabase(options = {}) {
  const assessment = options.assessment ?? makeAssessment();
  const state = {
    cycle: options.cycle ?? makeCycle(),
    membership: options.membership ?? makeMembership(),
    assignments: options.assignments ?? [makeAssignment()],
    snapshots: options.snapshots ?? [makeSnapshot()],
    assessments: options.assessments ?? [assessment],
    reviews: options.reviews ?? [options.review ?? makeReview(assessment)],
    reads: [],
    writes: 0,
  };

  const db = {
    membership: {
      async findFirst(args) {
        state.reads.push(["membership.findFirst", args]);
        return state.membership;
      },
    },
    appraisalCycle: {
      async findUnique(args) {
        state.reads.push(["appraisalCycle.findUnique", args]);
        return state.cycle;
      },
    },
    governanceOfficerAssignment: {
      async findMany(args) {
        state.reads.push(["governanceOfficerAssignment.findMany", args]);
        return state.assignments;
      },
    },
    appraisalAggregateSnapshot: {
      async findMany(args) {
        state.reads.push(["appraisalAggregateSnapshot.findMany", args]);
        return state.snapshots;
      },
    },
    appraisalAssessment: {
      async findMany(args) {
        state.reads.push(["appraisalAssessment.findMany", args]);
        return state.assessments;
      },
    },
    appraisalReview: {
      async findMany(args) {
        state.reads.push(["appraisalReview.findMany", args]);
        return state.reviews;
      },
    },
  };
  return { db, state };
}

function baseInput(overrides = {}) {
  return {
    actorUserId: "director-user-001",
    actorRoleName: "DISTRICT_DIRECTOR",
    cycleId: "cycle-headteacher-001",
    governanceScope: { isSuperAdmin: false, tenantIds: ["tenant-001"] },
    now: NOW,
    ...overrides,
  };
}

async function main() {
  assertEqual(
    HEADTEACHER_DIRECTOR_REVIEW_PACKAGE_POLICY.audience,
    "DISTRICT_DIRECTOR",
    "Director must own the review package",
  );
  assert(
    HEADTEACHER_DIRECTOR_REVIEW_PACKAGE_POLICY.readOnly,
    "Review package must remain read-only",
  );
  assert(
    !HEADTEACHER_DIRECTOR_REVIEW_PACKAGE_POLICY.databaseWritesAllowed,
    "Review package must not write",
  );
  assert(
    !HEADTEACHER_DIRECTOR_REVIEW_PACKAGE_POLICY.combinedWeightingDefined,
    "Combined weighting must remain undefined",
  );
  assertEqual(
    HEADTEACHER_DIRECTOR_REVIEW_DECISION_POLICY.executionPerformed,
    false,
    "G2 decision contract must not execute decisions",
  );
  assertEqual(
    HEADTEACHER_DIRECTOR_REVIEW_PACKAGE_POLICY.currentReviewStageMode,
    "LATEST_PENDING",
    "G2 must resolve the latest pending review stage",
  );
  assertEqual(
    HEADTEACHER_DIRECTOR_REVIEW_PACKAGE_POLICY.officialVisitDetailsIncluded,
    true,
    "Director package must include official visit details",
  );
  assertEqual(
    HEADTEACHER_DIRECTOR_REVIEW_PACKAGE_POLICY.legacyVisitContextReadable,
    true,
    "Version-1 historical visit contexts must remain readable",
  );
  assertEqual(
    HEADTEACHER_DIRECTOR_REVIEW_DECISION_POLICY.minimumReasonLength,
    3,
    "Return/hold reasons must satisfy the revision contract",
  );

  const fixture = createDatabase();
  const reviewPackage = await readHeadteacherDirectorReviewPackage({
    ...baseInput(),
    database: fixture.db,
  });

  assertEqual(
    reviewPackage.lifecycleState,
    "READY_FOR_DECISION",
    "Review package must be decision-ready",
  );
  assertEqual(reviewPackage.cycle.status, "UNDER_REVIEW", "Cycle status mismatch");
  assertEqual(reviewPackage.review.decision, "PENDING", "Review must remain pending");
  assertEqual(reviewPackage.staffFeedback.sections.length, 4, "Four staff sections required");
  assertEqual(reviewPackage.staffFeedback.items.length, 34, "Thirty-four staff items required");
  assertEqual(reviewPackage.supervisoryAssessment.items.length, 34, "Thirty-four supervisory items required");
  assertEqual(
    reviewPackage.supervisoryAssessment.visit.contextSchemaVersion,
    2,
    "Fresh supervisory evidence must expose visit-context version 2",
  );
  assertEqual(
    reviewPackage.supervisoryAssessment.visit.officialDetailsAvailable,
    true,
    "Fresh supervisory visit details must be available",
  );
  assertEqual(reviewPackage.supervisoryAssessment.visit.arrivalTime, "08:00", "Arrival time mismatch");
  assertEqual(reviewPackage.supervisoryAssessment.visit.staffStrength, 5, "Staff strength mismatch");
  assertEqual(reviewPackage.supervisoryAssessment.visit.totalEnrolment, 200, "Total enrolment mismatch");
  assertEqual(reviewPackage.supervisoryAssessment.visit.girls, 90, "Girls mismatch");
  assertEqual(reviewPackage.supervisoryAssessment.visit.boys, 110, "Boys mismatch");
  assertEqual(
    reviewPackage.supervisoryAssessment.visit.teachersPresentAtVisit,
    4,
    "Teachers-present mismatch",
  );
  assertEqual(reviewPackage.comparison.sections.length, 4, "Four section comparisons required");
  assertEqual(reviewPackage.comparison.items.length, 34, "Thirty-four item comparisons required");
  assertEqual(
    reviewPackage.supervisoryAssessment.assessor.office,
    "SISSO",
    "Legacy Circuit Supervisor role must display as SISSO",
  );
  assertEqual(
    reviewPackage.comparison.combinedOverallPercentage,
    null,
    "Combined score must not be invented",
  );
  assertEqual(
    reviewPackage.comparison.overall.supervisoryMinusStaffPercentagePoints,
    17,
    "Overall evidence difference mismatch",
  );
  assert(
    reviewPackage.comparison.items.some(
      (item) => item.comparisonState === "STAFF_ALL_NOT_APPLICABLE",
    ),
    "Staff all-N/A comparison state must be preserved",
  );
  assert(
    reviewPackage.comparison.items.some(
      (item) => item.comparisonState === "SUPERVISORY_NOT_APPLICABLE",
    ),
    "Supervisory N/A comparison state must be preserved",
  );
  assertEqual(fixture.state.writes, 0, "Read package must not write");

  const serialized = JSON.stringify(reviewPackage);
  for (const forbidden of [
    '"respondentUserId":',
    '"participantId":',
    '"responseId":',
    '"responseHash":',
    '"phone":',
    '"email":',
  ]) {
    assert(!serialized.includes(forbidden), `Private marker leaked: ${forbidden}`);
  }
  assertEqual(
    reviewPackage.privacy.respondentIdentitiesIncluded,
    false,
    "Respondent identities must remain absent",
  );
  assertEqual(
    reviewPackage.integrity.reviewerMayRewriteScores,
    false,
    "Reviewer score rewriting must remain forbidden",
  );

  const legacyAssessment = makeAssessment({
    evidenceSnapshotJson: makeVisitContext({ schemaVersion: 1 }),
    metadata: undefined,
  });
  legacyAssessment.metadata = {
    visitContextHash: hashJson(legacyAssessment.evidenceSnapshotJson),
    reviewerMayRewriteScores: false,
    combinedWeightingDefined: false,
  };
  legacyAssessment.assessmentHash = hashJson(
    assessmentHashPayload(
      legacyAssessment,
      legacyAssessment.instrumentVersion.sections,
      legacyAssessment.sectionPercentagesJson,
      legacyAssessment.overallPercentage,
    ),
  );
  const legacyPackage = await readHeadteacherDirectorReviewPackage({
    ...baseInput(),
    database: createDatabase({
      assessment: legacyAssessment,
      assessments: [legacyAssessment],
      review: makeReview(legacyAssessment),
    }).db,
  });
  assertEqual(
    legacyPackage.supervisoryAssessment.visit.contextSchemaVersion,
    1,
    "Historical supervisory context must remain version 1",
  );
  assertEqual(
    legacyPackage.supervisoryAssessment.visit.officialDetailsAvailable,
    false,
    "Historical visit details must not be invented",
  );
  assertEqual(
    legacyPackage.supervisoryAssessment.visit.arrivalTime,
    null,
    "Historical arrival time must remain unavailable",
  );

  await expectReject(
    () => {
      const malformedAssessment = makeAssessment({
        evidenceSnapshotJson: makeVisitContext({
          schemaVersion: 2,
          includeVisitDetails: false,
        }),
      });
      return readHeadteacherDirectorReviewPackage({
        ...baseInput(),
        database: createDatabase({
          assessment: malformedAssessment,
          assessments: [malformedAssessment],
          review: makeReview(malformedAssessment),
        }).db,
      });
    },
    "HEADTEACHER_DIRECTOR_REVIEW_PACKAGE_VISIT_DETAILS_INVALID",
    "Version-2 supervisory evidence must fail closed without visit details",
  );

  await expectReject(
    () =>
      readHeadteacherDirectorReviewPackage({
        ...baseInput({ actorRoleName: "SISSO" }),
        database: createDatabase().db,
      }),
    "HEADTEACHER_DIRECTOR_REVIEW_PACKAGE_ROLE_FORBIDDEN",
    "SISSO cannot read the Director decision package",
  );

  await expectReject(
    () =>
      readHeadteacherDirectorReviewPackage({
        ...baseInput(),
        database: createDatabase({
          assignments: [makeAssignment({ zoneId: "district-other" })],
        }).db,
      }),
    "HEADTEACHER_DIRECTOR_REVIEW_PACKAGE_ACTIVE_ASSIGNMENT_REQUIRED",
    "Director assignment must match district",
  );

  await expectReject(
    () =>
      readHeadteacherDirectorReviewPackage({
        ...baseInput(),
        database: createDatabase({
          cycle: makeCycle({ status: "CLOSED", reviewStartedAt: null }),
        }).db,
      }),
    "HEADTEACHER_DIRECTOR_REVIEW_PACKAGE_CYCLE_NOT_ACTIVE",
    "Review package requires UNDER_REVIEW lifecycle",
  );

  await expectReject(
    () =>
      readHeadteacherDirectorReviewPackage({
        ...baseInput(),
        database: createDatabase({
          snapshots: [makeSnapshot({ sourceHash: "e".repeat(64) })],
        }).db,
      }),
    "HEADTEACHER_DIRECTOR_REVIEW_PACKAGE_REVIEW_RECORD_DRIFT",
    "Snapshot source drift must invalidate the sealed review evidence",
  );

  const driftSnapshot = makeSnapshot();
  const firstStaffItem = Object.keys(driftSnapshot.itemAveragesJson)[0];
  driftSnapshot.itemAveragesJson[firstStaffItem].itemLabel = "Changed label";
  await expectReject(
    () =>
      readHeadteacherDirectorReviewPackage({
        ...baseInput(),
        database: createDatabase({ snapshots: [driftSnapshot] }).db,
      }),
    "HEADTEACHER_DIRECTOR_REVIEW_PACKAGE_STAFF_ITEM_DRIFT",
    "Staff item structure drift must fail closed",
  );

  await expectReject(
    () => {
      const assessment = makeAssessment({ assessmentHash: "f".repeat(64) });
      return readHeadteacherDirectorReviewPackage({
        ...baseInput(),
        database: createDatabase({
          assessment,
          assessments: [assessment],
          review: makeReview(assessment),
        }).db,
      });
    },
    "HEADTEACHER_DIRECTOR_REVIEW_PACKAGE_SUPERVISORY_HASH_DRIFT",
    "Supervisory evidence hash drift must fail closed",
  );

  await expectReject(
    () => {
      const assessment = makeAssessment();
      const second = deepClone(assessment);
      second.id = "assessment-002";
      return readHeadteacherDirectorReviewPackage({
        ...baseInput(),
        database: createDatabase({
          assessment,
          assessments: [assessment, second],
          review: makeReview(assessment),
        }).db,
      });
    },
    "HEADTEACHER_DIRECTOR_REVIEW_PACKAGE_SUPERVISORY_AMBIGUOUS",
    "Multiple finalized assessments must fail closed",
  );

  await expectReject(
    () => {
      const assessment = makeAssessment();
      return readHeadteacherDirectorReviewPackage({
        ...baseInput(),
        database: createDatabase({
          assessment,
          assessments: [assessment],
          review: makeReview(assessment, { decision: "HELD" }),
        }).db,
      });
    },
    "HEADTEACHER_DIRECTOR_REVIEW_PACKAGE_CURRENT_STAGE_INVALID",
    "Only pending review may expose a decision package",
  );

  await expectReject(
    () => {
      const assessment = makeAssessment();
      const review = makeReview(assessment);
      review.metadata.reviewEvidenceHash = "0".repeat(64);
      return readHeadteacherDirectorReviewPackage({
        ...baseInput(),
        database: createDatabase({
          assessment,
          assessments: [assessment],
          review,
        }).db,
      });
    },
    "HEADTEACHER_DIRECTOR_REVIEW_PACKAGE_REVIEW_RECORD_DRIFT",
    "Review evidence hash drift must fail closed",
  );

  const heldReview = makeReview(fixture.state.assessments[0]);
  heldReview.decision = "HELD";
  heldReview.note = "Awaiting accountable clarification.";
  heldReview.decidedAt = new Date("2026-07-29T14:00:00.000Z");
  const continuedReview = deepClone(heldReview);
  continuedReview.id = "review-002";
  continuedReview.stage = 2;
  continuedReview.decision = "PENDING";
  continuedReview.note = null;
  continuedReview.decidedAt = null;
  continuedReview.createdAt = new Date("2026-07-29T14:00:01.000Z");
  continuedReview.metadata = {
    ...continuedReview.metadata,
    reviewStage: 2,
    continuedFromReviewId: heldReview.id,
    continuedFromStage: 1,
    priorDecision: "HELD",
  };
  const continuedFixture = createDatabase({
    reviews: [heldReview, continuedReview],
  });
  const continuedPackage = await readHeadteacherDirectorReviewPackage({
    ...baseInput(),
    database: continuedFixture.db,
  });
  assertEqual(
    continuedPackage.review.stage,
    2,
    "Latest pending hold-continuation stage must be selected",
  );

  const returnPlan = planHeadteacherDirectorReviewDecision({
    reviewPackage,
    decision: "RETURN",
    note: "The supervisory assessor must correct the evidence and resubmit.",
    confirm: true,
  });
  assertEqual(returnPlan.reviewNextDecision, "RETURNED", "Return decision mismatch");
  assertEqual(returnPlan.assessmentNextStatus, "RETURNED", "Assessment must return");
  assert(returnPlan.revisionRequired, "Return must require a revision");
  assertEqual(returnPlan.executionPerformed, false, "G2 must not execute return");

  const holdPlan = planHeadteacherDirectorReviewDecision({
    reviewPackage,
    decision: "HOLD",
    note: "Awaiting an accountable clarification before final decision.",
    confirm: true,
  });
  assertEqual(holdPlan.reviewNextDecision, "HELD", "Hold decision mismatch");
  assertEqual(holdPlan.cycleNextStatus, "UNDER_REVIEW", "Hold keeps cycle under review");
  assert(holdPlan.nextReviewStageRequired, "Hold must require a later review stage");

  const releasePlan = planHeadteacherDirectorReviewDecision({
    reviewPackage,
    decision: "RELEASE",
    confirm: true,
  });
  assertEqual(releasePlan.reviewNextDecision, "ACCEPTED", "Release decision mismatch");
  assertEqual(releasePlan.cycleNextStatus, "RELEASED", "Release lifecycle mismatch");
  assert(releasePlan.releaseRequested, "Release plan must request release");
  assertEqual(releasePlan.executionPerformed, false, "G2 must not execute release");
  assertEqual(releasePlan.scoreMutationAllowed, false, "Decision cannot mutate scores");
  assert(/^[a-f0-9]{64}$/.test(releasePlan.decisionContractHash), "Decision hash required");

  expectThrow(
    () =>
      planHeadteacherDirectorReviewDecision({
        reviewPackage,
        decision: "RETURN",
        note: "",
        confirm: true,
      }),
    "HEADTEACHER_DIRECTOR_REVIEW_DECISION_REASON_REQUIRED",
    "Return requires a reason",
  );
  expectThrow(
    () =>
      planHeadteacherDirectorReviewDecision({
        reviewPackage,
        decision: "HOLD",
        note: "",
        confirm: true,
      }),
    "HEADTEACHER_DIRECTOR_REVIEW_DECISION_REASON_REQUIRED",
    "Hold requires a reason",
  );
  expectThrow(
    () =>
      planHeadteacherDirectorReviewDecision({
        reviewPackage,
        decision: "RELEASE",
        confirm: false,
      }),
    "HEADTEACHER_DIRECTOR_REVIEW_DECISION_CONFIRMATION_REQUIRED",
    "Decision planning requires explicit confirmation",
  );

  const serviceSource = fs.readFileSync(
    path.join(repoRoot, "src/lib/appraisals/headteacherDirectorReviewPackage.ts"),
    "utf8",
  );
  for (const forbidden of [
    ".$transaction",
    "appraisalCycle.update",
    "appraisalReview.update",
    "appraisalAssessment.update",
    "auditLog.create",
    "appraisalIdentityAccess",
    "sendSms",
    "sendEmail",
  ]) {
    assert(!serviceSource.includes(forbidden), `Forbidden G2 marker found: ${forbidden}`);
  }
  assert(
    serviceSource.includes("readHeadteacherFeedbackAggregateReadiness"),
    "E2C readiness must be reused",
  );
  assert(
    serviceSource.includes("calculateAppraisalScores"),
    "Supervisory calculations must be independently verified",
  );
  assert(
    serviceSource.includes("visitDetailsFromEvidenceSnapshot"),
    "Director package must reuse the canonical visit-details parser",
  );
  assert(
    serviceSource.includes("officialVisitDetailsIncluded: true"),
    "Director package policy must include official visit details",
  );
  assert(
    serviceSource.includes("legacyVisitContextReadable: true"),
    "Director package must preserve version-1 compatibility",
  );
  assert(
    serviceSource.includes("combinedOverallPercentage: null"),
    "Combined appraisal score must remain absent",
  );
  assert(
    serviceSource.includes("canonicalHeadteacherSupervisoryAssessorRole"),
    "SISSO must remain the canonical circuit office",
  );
  assert(
    serviceSource.includes("resolveCurrentPendingReview"),
    "Latest pending review-stage resolution must be explicit",
  );
  assert(
    serviceSource.includes("appraisalReview.findMany"),
    "Review-stage chain must be read without a hard-coded stage",
  );

  console.log("");
  console.log("=== D3.4G2 DIRECTOR READ-ONLY REVIEW PACKAGE + DECISION CONTRACT ===");
  console.log("");
  console.log("Review audience                 : District Director only");
  console.log("Lifecycle boundary              : UNDER_REVIEW + latest-stage PENDING");
  console.log("Staff evidence                  : immutable aggregate snapshot V1");
  console.log("Supervisory evidence            : one finalized current assessment");
  console.log("Supervisory scores/hash          : recalculated and verified");
  console.log("Version-2 visit particulars      : projected from immutable snapshot");
  console.log("Version-1 visit compatibility    : preserved without reconstruction");
  console.log("Evidence comparison              : overall / 4 sections / 34 items");
  console.log("Comparison direction             : supervisory minus staff percentage points");
  console.log("Comparison thresholds            : undefined");
  console.log("N/A comparison                   : denominator-safe and explicit");
  console.log("Combined appraisal score         : absent");
  console.log("SISSO office                     : canonical; legacy alias normalized");
  console.log("Respondent identities/forms      : absent");
  console.log("Reviewer score rewriting         : forbidden");
  console.log("Decision plans                   : return / hold / release");
  console.log("Return/hold reason               : required");
  console.log("Explicit decision confirmation   : required");
  console.log("Decision execution               : absent");
  console.log("Database writes/transaction      : absent");
  console.log("Notifications/providers          : absent");
  console.log("Database accessed                : false");
  console.log("");
  console.log("RESULT: D3.4G2 DIRECTOR REVIEW PACKAGE GREEN");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
