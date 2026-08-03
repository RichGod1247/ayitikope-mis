#!/usr/bin/env node
"use strict";

// scripts/qa/headteacher-director-correction-continuation-check.cjs

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
function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
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
const reviewModule = require(
  path.join(repoRoot, "src/lib/appraisals/headteacherDirectorReview.ts"),
);
const supervisoryContract = require(
  path.join(repoRoot, "src/lib/appraisals/headteacherSupervisoryAssessment.ts"),
);

const {
  HEADTEACHER_DIRECTOR_CORRECTION_CONTINUATION_POLICY,
  ensureHeadteacherDirectorCorrectionReviewContinuation,
} = reviewModule;
const { HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY } = supervisoryContract;

const NOW = new Date("2026-08-03T17:30:00.000Z");
const REVIEW_STARTED = new Date("2026-08-03T12:00:00.000Z");
const RETURNED_AT = new Date("2026-08-03T14:00:00.000Z");
const FINALIZED_AT = new Date("2026-08-03T16:50:00.000Z");
const STAFF_SOURCE_HASH = "b".repeat(64);
const VISIT_HASH = "c".repeat(64);
const CONTENT_HASH = "d".repeat(64);

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
    workflow: HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.workflow,
    evidenceStream: "GOVERNANCE_SUPERVISORY_ASSESSMENT",
    assessment: {
      id: assessment.id,
      cycleId: assessment.cycleId,
      revision: assessment.revision,
      assessorUserId: assessment.assessorUserId,
      assessorAssignmentId: assessment.assessorAssignmentId,
      dateObserved: assessment.dateObserved.toISOString().slice(0, 10),
      visitContextHash: VISIT_HASH,
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

function makeAssessment({
  id,
  revision,
  status,
  priorAssessmentId = null,
  scoreOverrides = {},
  metadata = {},
}) {
  const sections = officialSections();
  const scoreRows = sections.flatMap((section) =>
    section.items.map((item) => {
      const override = scoreOverrides[item.key];
      const notApplicable = override === "N/A";
      return {
        id: `score-${id}-${section.order}-${item.order}`,
        assessmentId: id,
        instrumentItemId: item.id,
        sectionKey: section.key,
        sectionTitle: section.title,
        sectionOrder: section.order,
        sectionMaxScore: section.maxScore,
        itemKey: item.key,
        itemLabel: item.label,
        itemOrder: item.order,
        itemMaxScore: item.maxScore,
        score: notApplicable ? null : Number(override ?? 4),
        notApplicable,
      };
    }),
  );
  const calculated = calculateAppraisalScores(
    calculationRows(sections, scoreRows),
    { requireComplete: true },
  );
  assert(calculated.ok, "Assessment fixture must calculate", calculated);
  const assessment = {
    id,
    cycleId: "cycle-headteacher-001",
    instrumentVersionId: "supervisory-version-001",
    assessorUserId: "sisso-user-001",
    assessorAssignmentId: "sisso-assignment-001",
    status,
    revision,
    priorAssessmentId,
    dateObserved: new Date("2026-08-03T00:00:00.000Z"),
    overallPercentage: calculated.value.overallPercentage,
    sectionPercentagesJson: calculated.value.sectionPercentages,
    generalComment: null,
    evidenceSnapshotJson: {
      schemaVersion: 2,
      target: { userId: "headteacher-001" },
      observation: {
        dateObserved: "2026-08-03",
        visitDetails: {
          schemaVersion: 1,
          arrivalTime: "08:00",
          staffStrength: 5,
          totalEnrolment: 200,
          girls: 90,
          boys: 110,
          teachersPresentAtVisit: 4,
        },
      },
    },
    assessmentHash: null,
    finalizedByUserId: "sisso-user-001",
    finalizedAt: FINALIZED_AT,
    metadata: {
      visitContextHash: VISIT_HASH,
      reviewerMayRewriteScores: false,
      separateFromStaffFeedback: true,
      combinedWeightingDefined: false,
      ...metadata,
    },
    scores: scoreRows,
    instrumentVersion: {
      id: "supervisory-version-001",
      version: 1,
      status: "ACTIVE",
      contentHash: CONTENT_HASH,
      instrument: {
        id: "supervisory-instrument-001",
        code:
          APPRAISAL_INSTRUMENT_CODES.HEADTEACHER_SUPERVISORY_ASSESSMENT_V1,
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
  return assessment;
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
    metadata: {
      workflow: "HEADTEACHER_CONFIDENTIAL_STAFF_FEEDBACK",
    },
    scopeZone: {
      id: "district-001",
      name: "Akatsi South",
      isActive: true,
      zoneType: { level: 2, countryCode: "GH" },
    },
    instrumentVersion: {
      id: "staff-version-001",
      version: 1,
      contentHash: "a".repeat(64),
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

function makeMembership() {
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
        name: "EduLife Appraisal UAT Circuit",
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
  };
}

function makeSissoAssignment(overrides = {}) {
  return {
    id: "sisso-assignment-001",
    userId: "sisso-user-001",
    role: "SISSO",
    status: "ACTIVE",
    revokedAt: null,
    startsAt: new Date("2026-01-01T00:00:00.000Z"),
    endsAt: null,
    zoneId: "circuit-001",
    zone: {
      id: "circuit-001",
      name: "EduLife Appraisal UAT Circuit",
      isActive: true,
      zoneType: { level: 1, countryCode: "GH" },
    },
    ...overrides,
  };
}

function makeDirectorAssignment(overrides = {}) {
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

function returnEvidenceHash(sourceAssessment, sourceReview) {
  return hashJson({
    schemaVersion: 1,
    workflow: HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.workflow,
    assessmentId: sourceAssessment.id,
    assessmentHash: sourceAssessment.assessmentHash,
    review: {
      id: sourceReview.id,
      stage: sourceReview.stage,
      decision: sourceReview.decision,
      note: sourceReview.note,
      reviewerUserId: sourceReview.reviewerUserId,
      reviewerAssignmentId: sourceReview.reviewerAssignmentId,
      decidedAt: sourceReview.decidedAt.toISOString(),
    },
    reviewerScoreEditsIncluded: false,
  });
}

function createFixture(options = {}) {
  const sourceAssessment = makeAssessment({
    id: "assessment-revision-001",
    revision: 1,
    status: "SUPERSEDED",
    scoreOverrides: { "1.4": "N/A", "4.5": "N/A" },
  });
  const sourceReview = {
    id: "review-returned-003",
    cycleId: sourceAssessment.cycleId,
    assessmentId: sourceAssessment.id,
    reviewerUserId: "director-user-001",
    reviewerAssignmentId: "director-assignment-001",
    stage: 3,
    decision: "RETURNED",
    note:
      "Please correct item 1.1 from score 1 to score 3 and item 2.2 from score 2 to score 4.",
    decidedAt: RETURNED_AT,
    metadata: {
      reviewerMayRewriteScores: false,
      scoreMutationPerformed: false,
      providerCalled: false,
    },
    createdAt: new Date("2026-08-03T13:00:00.000Z"),
  };
  const returnHash = returnEvidenceHash(sourceAssessment, sourceReview);
  const revisionKey = hashJson({
    schemaVersion: 1,
    originalAssessmentId: sourceAssessment.id,
    nextRevision: 2,
    sourceAssessmentHash: sourceAssessment.assessmentHash,
    returnEvidenceHash: returnHash,
    visitContextHash: VISIT_HASH,
  });
  const currentAssessment = makeAssessment({
    id: "assessment-revision-002",
    revision: 2,
    status: "FINALIZED",
    priorAssessmentId: sourceAssessment.id,
    scoreOverrides: {
      "1.1": 3,
      "2.2": 4,
      "1.4": "N/A",
      "4.5": "N/A",
    },
    metadata: {
      revisionSchemaVersion: 1,
      revisionKey,
      sourceAssessmentId: sourceAssessment.id,
      sourceAssessmentHash: sourceAssessment.assessmentHash,
      returnReviewId: sourceReview.id,
      returnReviewStage: sourceReview.stage,
      returnEvidenceHash: returnHash,
      returnReason: sourceReview.note,
      preserveVisitContext: true,
      copiedScoreCount: 34,
      returnedAssessmentRequiresRevision: true,
      providerCalled: false,
    },
  });

  const state = {
    cycle: makeCycle(options.cycle),
    membership: makeMembership(),
    assignments:
      options.assignments === undefined
        ? [makeSissoAssignment(), makeDirectorAssignment()]
        : options.assignments,
    assessments:
      options.assessments ?? [sourceAssessment, currentAssessment],
    reviews: options.reviews ?? [sourceReview],
    audits: [],
    transactionOptions: [],
    aggregateCalls: [],
    uniqueRace: options.uniqueRace ?? false,
    raceTriggered: false,
    preserveRaceReview: false,
  };

  function selectAssessment(id) {
    return state.assessments.find((assessment) => assessment.id === id) ?? null;
  }
  function selectReview(where) {
    if (where.id) return state.reviews.find((review) => review.id === where.id) ?? null;
    const key = where.assessmentId_stage;
    if (key) {
      return (
        state.reviews.find(
          (review) =>
            review.assessmentId === key.assessmentId &&
            review.stage === key.stage,
        ) ?? null
      );
    }
    return null;
  }

  const db = {
    appraisalCycle: {
      async findUnique() {
        return structuredClone(state.cycle);
      },
      async update(args) {
        state.cycle = {
          ...state.cycle,
          ...structuredClone(args.data),
        };
        return structuredClone({
          id: state.cycle.id,
          status: state.cycle.status,
          reviewStartedAt: state.cycle.reviewStartedAt,
          metadata: state.cycle.metadata,
        });
      },
    },
    membership: {
      async findFirst() {
        return structuredClone(state.membership);
      },
    },
    governanceOfficerAssignment: {
      async findMany(args) {
        const userId = args?.where?.userId;
        return structuredClone(
          userId
            ? state.assignments.filter((assignment) => assignment.userId === userId)
            : state.assignments,
        );
      },
    },
    appraisalAggregateSnapshot: {
      async findMany() {
        return [];
      },
    },
    appraisalAssessment: {
      async findUnique(args) {
        return structuredClone(selectAssessment(args.where.id));
      },
      async findMany(args) {
        const cycleId = args?.where?.cycleId;
        return structuredClone(
          cycleId
            ? state.assessments.filter((assessment) => assessment.cycleId === cycleId)
            : state.assessments,
        );
      },
    },
    appraisalReview: {
      async findUnique(args) {
        return structuredClone(selectReview(args.where));
      },
      async findMany(args) {
        const assessmentId = args?.where?.assessmentId;
        return structuredClone(
          state.reviews
            .filter(
              (review) => !assessmentId || review.assessmentId === assessmentId,
            )
            .sort(
              (left, right) =>
                left.stage - right.stage ||
                left.createdAt.getTime() - right.createdAt.getTime(),
            ),
        );
      },
      async create(args) {
        if (state.uniqueRace && !state.raceTriggered) {
          state.raceTriggered = true;
          state.reviews.push({
            id: "review-race-stage-1",
            ...structuredClone(args.data),
            createdAt: NOW,
          });
          state.preserveRaceReview = true;
          const error = new Error("unique");
          error.code = "P2002";
          throw error;
        }
        const review = {
          id: `review-${state.reviews.length + 1}`,
          ...structuredClone(args.data),
          createdAt: NOW,
        };
        state.reviews.push(review);
        return structuredClone(review);
      },
    },
    auditLog: {
      async create(args) {
        state.audits.push(structuredClone(args.data));
        return structuredClone(args.data);
      },
    },
    async $transaction(operation, transactionOptions) {
      state.transactionOptions.push(structuredClone(transactionOptions));
      const snapshot = structuredClone({
        cycle: state.cycle,
        reviews: state.reviews,
        audits: state.audits,
      });
      try {
        return await operation(db);
      } catch (error) {
        const racedReview =
          state.preserveRaceReview && error?.code === "P2002"
            ? state.reviews.find(
                (review) => review.id === "review-race-stage-1",
              )
            : null;
        state.cycle = snapshot.cycle;
        state.reviews = snapshot.reviews;
        state.audits = snapshot.audits;
        state.preserveRaceReview = false;
        if (racedReview) state.reviews.push(racedReview);
        throw error;
      }
    },
  };

  const dependencies = {
    async readAggregateReadiness(args) {
      state.aggregateCalls.push({
        actorUserId: args.actorUserId,
        actorRoleName: args.actorRoleName,
        cycleId: args.cycleId,
        governanceScope: structuredClone(args.governanceScope),
      });
      return {
        audience: "DIRECTOR",
        state: "UNDER_REVIEW",
        snapshotId: "snapshot-001",
        snapshotVersion: 1,
        snapshotSourceHash: STAFF_SOURCE_HASH,
        finalizedResponses: 2,
        minimumResponses: 1,
        aggregateScoresIncluded: false,
        respondentIdentitiesIncluded: false,
        participantListIncluded: false,
      };
    },
  };

  return {
    db,
    state,
    dependencies,
    sourceAssessment,
    sourceReview,
    currentAssessment,
  };
}

function baseInput(fixture, overrides = {}) {
  return {
    actorUserId: "sisso-user-001",
    actorRoleName: "SISSO",
    assessmentId: fixture.currentAssessment.id,
    reqId: "continuation-request-001",
    ip: "127.0.0.1",
    userAgent: "qa",
    now: NOW,
    database: fixture.db,
    dependencies: fixture.dependencies,
    ...overrides,
  };
}

async function main() {
  const sourcePath = path.join(
    repoRoot,
    "src/lib/appraisals/headteacherDirectorReview.ts",
  );
  const source = fs.readFileSync(sourcePath, "utf8");
  for (const marker of [
    "ensureHeadteacherDirectorCorrectionReviewContinuation",
    "CORRECTED_ASSESSMENT",
    "HEADTEACHER_APPRAISAL_DIRECTOR_CORRECTION_REVIEW_CONTINUED",
    "continuedFromAssessmentId",
    "returnEvidenceHash",
    "reviewEvidenceHash",
    "Prisma.TransactionIsolationLevel.Serializable",
    "scoreMutationPerformed: false",
    "providerCalled: false",
  ]) {
    assert(source.includes(marker), `Missing continuation source marker: ${marker}`);
  }
  for (const forbidden of [
    "sendSms",
    "sendEmail",
    "appraisalIdentityAccess.create",
  ]) {
    assert(!source.includes(forbidden), `Forbidden continuation marker: ${forbidden}`);
  }

  assertEqual(
    HEADTEACHER_DIRECTOR_CORRECTION_CONTINUATION_POLICY.reviewStage,
    1,
    "Correction assessment must start a fresh assessment-scoped stage chain",
  );
  assertEqual(
    HEADTEACHER_DIRECTOR_CORRECTION_CONTINUATION_POLICY.requiredCycleStatus,
    "UNDER_REVIEW",
    "Correction continuation cycle boundary drift",
  );
  assertEqual(
    HEADTEACHER_DIRECTOR_CORRECTION_CONTINUATION_POLICY.preserveOriginalReviewer,
    true,
    "Original Director must remain the correction reviewer",
  );

  const created = createFixture();
  const createdResult =
    await ensureHeadteacherDirectorCorrectionReviewContinuation(
      baseInput(created),
    );
  assertEqual(createdResult.outcome, "CREATED", "Continuation should be created");
  assertEqual(createdResult.reviewStage, 1, "Revision 2 must begin at review stage 1");
  assertEqual(createdResult.reviewDecision, "PENDING", "New review must be pending");
  assertEqual(createdResult.reviewerUserId, "director-user-001", "Original Director must be preserved");
  assertEqual(createdResult.reviewerAssignmentId, "director-assignment-001", "Original Director assignment must be preserved");
  assertEqual(created.state.reviews.length, 2, "Exactly one new review should be created");
  assertEqual(created.state.audits.length, 1, "Exactly one continuation audit required");
  assertEqual(created.state.aggregateCalls.length, 1, "Staff aggregate readiness should be read once");
  assertEqual(created.state.aggregateCalls[0].actorUserId, "director-user-001", "Aggregate readiness must be evaluated for the preserved Director");
  assertEqual(created.state.aggregateCalls[0].governanceScope.isSuperAdmin, false, "Continuation scope must not invent superadmin authority");
  assertEqual(created.state.aggregateCalls[0].governanceScope.tenantIds.join(","), "tenant-001", "Continuation scope must be derived from the cycle target tenant");
  assertEqual(created.state.transactionOptions[0].isolationLevel, "Serializable", "Continuation write transaction must be serializable");
  assertEqual(created.state.transactionOptions[0].maxWait, 10000, "Continuation transaction maxWait drift");
  assertEqual(created.state.transactionOptions[0].timeout, 20000, "Continuation transaction timeout drift");
  const newReview = created.state.reviews.find(
    (review) => review.assessmentId === created.currentAssessment.id,
  );
  assert(newReview, "Correction review record missing");
  assertEqual(newReview.stage, 1, "Correction review stage must reset per assessment");
  assertEqual(newReview.decision, "PENDING", "Correction review must be pending");
  assertEqual(newReview.metadata.continuationType, "CORRECTED_ASSESSMENT", "Continuation metadata type missing");
  assertEqual(newReview.metadata.continuedFromAssessmentId, created.sourceAssessment.id, "Source assessment anchor missing");
  assertEqual(newReview.metadata.continuedFromReviewId, created.sourceReview.id, "Source returned-review anchor missing");
  assertEqual(
    objectValue(created.state.cycle.metadata).directorReview.reviewId,
    newReview.id,
    "Cycle review pointer must advance to Revision 2",
  );
  const auditText = JSON.stringify(created.state.audits);
  assert(!auditText.includes('"score":'), "Continuation audit must not contain scores");
  assert(!auditText.includes("UAT Headteacher"), "Continuation audit must not contain names");
  assert(!auditText.includes(created.sourceReview.note), "Continuation audit must hash, not copy, the return reason");

  const retryResult =
    await ensureHeadteacherDirectorCorrectionReviewContinuation(
      baseInput(created, { reqId: "continuation-request-002" }),
    );
  assertEqual(retryResult.outcome, "EXISTING_REVIEW", "Retry must be idempotent");
  assertEqual(created.state.reviews.length, 2, "Retry must not duplicate review");
  assertEqual(created.state.audits.length, 1, "Retry must not duplicate audit");

  const ordinary = createFixture();
  ordinary.state.cycle = makeCycle({
    status: "CLOSED",
    reviewStartedAt: null,
  });
  ordinary.state.assessments = [
    makeAssessment({
      id: "assessment-initial-001",
      revision: 1,
      status: "FINALIZED",
    }),
  ];
  ordinary.currentAssessment = ordinary.state.assessments[0];
  const ordinaryResult =
    await ensureHeadteacherDirectorCorrectionReviewContinuation(
      baseInput(ordinary, {
        assessmentId: ordinary.currentAssessment.id,
      }),
    );
  assertEqual(ordinaryResult.outcome, "NOT_REQUIRED", "Initial finalization must not auto-start Director review");
  assertEqual(ordinary.state.aggregateCalls.length, 0, "Initial finalization must not read Director aggregate readiness");
  assertEqual(ordinary.state.transactionOptions.length, 0, "Initial finalization must not open a continuation transaction");

  const malformed = createFixture();
  malformed.state.assessments[1].metadata.returnEvidenceHash = "0".repeat(64);
  await expectReject(
    () =>
      ensureHeadteacherDirectorCorrectionReviewContinuation(baseInput(malformed)),
    "HEADTEACHER_DIRECTOR_REVIEW_CONTINUATION_REVISION_CHAIN_INVALID",
    "Malformed correction metadata must fail closed",
  );

  const notLatest = createFixture();
  notLatest.state.reviews.push({
    ...structuredClone(notLatest.sourceReview),
    id: "review-later-004",
    stage: 4,
    decision: "HELD",
    note: "Later decision",
    decidedAt: new Date("2026-08-03T15:00:00.000Z"),
    createdAt: new Date("2026-08-03T15:00:00.000Z"),
  });
  await expectReject(
    () =>
      ensureHeadteacherDirectorCorrectionReviewContinuation(baseInput(notLatest)),
    "HEADTEACHER_DIRECTOR_REVIEW_CONTINUATION_SOURCE_REVIEW_NOT_LATEST",
    "Continuation must anchor to the latest returned source review",
  );

  const noDirector = createFixture({
    assignments: [makeSissoAssignment()],
  });
  await expectReject(
    () =>
      ensureHeadteacherDirectorCorrectionReviewContinuation(baseInput(noDirector)),
    "HEADTEACHER_DIRECTOR_REVIEW_ACTIVE_ASSIGNMENT_REQUIRED",
    "The preserved Director assignment must remain active",
  );

  const ambiguous = createFixture();
  ambiguous.state.assessments.push(
    makeAssessment({
      id: "assessment-other-finalized",
      revision: 3,
      status: "FINALIZED",
      priorAssessmentId: ambiguous.currentAssessment.id,
    }),
  );
  await expectReject(
    () =>
      ensureHeadteacherDirectorCorrectionReviewContinuation(baseInput(ambiguous)),
    "HEADTEACHER_DIRECTOR_REVIEW_SUPERVISORY_ASSESSMENT_AMBIGUOUS",
    "Multiple current finalized assessments must fail closed",
  );

  const raced = createFixture({ uniqueRace: true });
  const racedResult =
    await ensureHeadteacherDirectorCorrectionReviewContinuation(baseInput(raced));
  assertEqual(racedResult.outcome, "EXISTING_REVIEW", "Unique race must recover idempotently");
  assertEqual(
    raced.state.reviews.filter(
      (review) => review.assessmentId === raced.currentAssessment.id,
    ).length,
    1,
    "Race recovery must preserve one correction review",
  );
  assertEqual(raced.state.audits.length, 0, "Competing transaction owns the continuation audit");

  console.log("");
  console.log("=== D3.4G4 CORRECTED FINALIZATION → DIRECTOR REVIEW CONTINUATION ===");
  console.log("");
  console.log("Trigger                         : route-level post-finalization orchestration");
  console.log("Initial finalization            : continuation not required");
  console.log("Correction assessment           : finalized Revision 2+ only");
  console.log("Cycle boundary                  : UNDER_REVIEW only");
  console.log("Revision ancestry               : prior assessment + revision metadata verified");
  console.log("Source assessment               : SUPERSEDED and hash verified");
  console.log("Source Director decision        : latest RETURNED review required");
  console.log("Reviewer continuity             : same active District Director assignment");
  console.log("Authorization scope             : derived from validated cycle target tenant");
  console.log("Staff aggregate                 : immutable existing snapshot reused");
  console.log("New review chain                : assessment-scoped Stage 1 / PENDING");
  console.log("Evidence hash                   : recalculated for corrected assessment");
  console.log("Same-evidence retry             : EXISTING_REVIEW");
  console.log("Concurrent creation             : unique-race recovery");
  console.log("Write transaction               : short, serializable and bounded");
  console.log("Reviewer score rewriting        : absent");
  console.log("Respondent identities/forms     : absent");
  console.log("Notifications/providers         : absent");
  console.log("Database accessed               : false");
  console.log("");
  console.log("RESULT: CORRECTED DIRECTOR REVIEW CONTINUATION GREEN");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
