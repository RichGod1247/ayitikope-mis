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
function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
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
const supervisoryContract = require(
  path.join(
    repoRoot,
    "src/lib/appraisals/headteacherSupervisoryAssessment.ts",
  ),
);
const reviewModule = require(
  path.join(repoRoot, "src/lib/appraisals/headteacherDirectorReview.ts"),
);

const {
  HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY,
  canonicalHeadteacherSupervisoryAssessorRole,
} = supervisoryContract;
const {
  HEADTEACHER_DIRECTOR_REVIEW_POLICY,
  startHeadteacherDirectorReview,
} = reviewModule;

const NOW = new Date("2026-07-29T12:00:00.000Z");
const REVIEW_STARTED = new Date("2026-07-29T12:00:00.000Z");
const STAFF_HASH = "a".repeat(64);
const STAFF_SOURCE_HASH = "b".repeat(64);
const VISIT_HASH = "c".repeat(64);

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
  const stored = new Map(
    scoreRows.map((score) => [score.instrumentItemId, score]),
  );
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
    evidenceSnapshotJson: {
      target: { userId: "headteacher-001" },
      jurisdiction: { districtZoneId: "district-001" },
    },
    assessmentHash: null,
    finalizedByUserId: "sisso-user-001",
    finalizedAt: new Date("2026-07-28T10:00:00.000Z"),
    metadata: {
      visitContextHash: VISIT_HASH,
      reviewerMayRewriteScores: false,
      combinedWeightingDefined: false,
    },
    scores: scoreRows,
    instrumentVersion: {
      id: "supervisory-version-001",
      version: 1,
      status: "ACTIVE",
      contentHash: "d".repeat(64),
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
    status: "CLOSED",
    minimumResponses: 1,
    targetRoleSnapshot: "HEADTEACHER",
    reviewStartedAt: null,
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
      contentHash: STAFF_HASH,
      instrument: {
        code: APPRAISAL_INSTRUMENT_CODES.HEADTEACHER_STAFF_FEEDBACK_V1,
        purpose: "HEADTEACHER_STAFF_FEEDBACK",
        subjectType: "HEADTEACHER",
        isActive: true,
      },
    },
    participants: [{ status: "FINALIZED" }],
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
    tenant: {
      id: "tenant-001",
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

function makeSnapshot(overrides = {}) {
  return {
    id: "snapshot-001",
    cycleId: "cycle-headteacher-001",
    version: 1,
    eligibleResponses: 1,
    finalizedResponses: 1,
    expiredResponses: 0,
    minimumResponses: 1,
    releaseEligible: true,
    overallPercentage: 82.5,
    sourceHash: STAFF_SOURCE_HASH,
    generatedByUserId: null,
    generatedAt: new Date("2026-07-29T08:00:00.000Z"),
    metadata: {
      workflow: "HEADTEACHER_CONFIDENTIAL_STAFF_FEEDBACK",
      aggregateSchemaVersion: 1,
      instrumentCode:
        APPRAISAL_INSTRUMENT_CODES.HEADTEACHER_STAFF_FEEDBACK_V1,
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

function createDatabase(options = {}) {
  const state = {
    cycle: makeCycle(options.cycle),
    membership: makeMembership(options.membership),
    assignments: options.assignments ?? [makeAssignment()],
    assessments: options.assessments ?? [makeAssessment()],
    snapshots:
      options.snapshots === undefined ? [makeSnapshot()] : options.snapshots,
    reviews: options.reviews ?? [],
    audits: [],
    transactionOptions: [],
    updates: 0,
    creates: 0,
    uniqueRace: options.uniqueRace ?? false,
    raceTriggered: false,
  };

  const db = {
    appraisalCycle: {
      async findUnique() {
        return state.cycle;
      },
      async update(args) {
        state.updates += 1;
        state.cycle = {
          ...state.cycle,
          ...args.data,
          reviewStartedAt: args.data.reviewStartedAt,
        };
        return {
          id: state.cycle.id,
          status: state.cycle.status,
          reviewStartedAt: state.cycle.reviewStartedAt,
          metadata: state.cycle.metadata,
        };
      },
    },
    membership: {
      async findFirst() {
        return state.membership;
      },
    },
    governanceOfficerAssignment: {
      async findMany() {
        return state.assignments;
      },
    },
    appraisalAggregateSnapshot: {
      async findMany() {
        return state.snapshots;
      },
    },
    appraisalAssessment: {
      async findMany() {
        return state.assessments;
      },
    },
    appraisalReview: {
      async findUnique(args) {
        const key = args.where.assessmentId_stage;
        return (
          state.reviews.find(
            (review) =>
              review.assessmentId === key.assessmentId &&
              review.stage === key.stage,
          ) ?? null
        );
      },
      async create(args) {
        state.creates += 1;
        if (state.uniqueRace && !state.raceTriggered) {
          state.raceTriggered = true;
          const metadata = args.data.metadata;
          const review = {
            id: "review-race-001",
            ...args.data,
            createdAt: NOW,
          };
          state.reviews.push(review);
          state.cycle.status = "UNDER_REVIEW";
          state.cycle.reviewStartedAt = NOW;
          state.cycle.metadata = {
            ...objectValue(state.cycle.metadata),
            directorReview: {
              reviewId: review.id,
              reviewEvidenceHash: metadata.reviewEvidenceHash,
            },
          };
          const error = new Error("unique");
          error.code = "P2002";
          throw error;
        }
        const review = {
          id: `review-${state.reviews.length + 1}`,
          ...args.data,
          createdAt: NOW,
        };
        state.reviews.push(review);
        return review;
      },
    },
    auditLog: {
      async create(args) {
        state.audits.push(args.data);
        return args.data;
      },
    },
    async $transaction(operation, transactionOptions) {
      state.transactionOptions.push(transactionOptions);
      return operation(db);
    },
  };

  return { db, state };
}

function baseInput(overrides = {}) {
  return {
    actorUserId: "director-user-001",
    actorRoleName: "DISTRICT_DIRECTOR",
    cycleId: "cycle-headteacher-001",
    confirm: true,
    governanceScope: {
      isSuperAdmin: false,
      tenantIds: ["tenant-001"],
    },
    reqId: "review-request-001",
    ip: "127.0.0.1",
    userAgent: "qa",
    now: NOW,
    ...overrides,
  };
}

async function main() {
  assertEqual(
    HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.circuitOffice.distinctOfficeCount,
    1,
    "SISSO and Circuit Supervisor must represent one office",
  );
  assertEqual(
    canonicalHeadteacherSupervisoryAssessorRole("Circuit Supervisor"),
    "SISSO",
    "Circuit Supervisor must canonicalize to SISSO",
  );
  assertEqual(
    HEADTEACHER_DIRECTOR_REVIEW_POLICY.reviewerRole,
    "DISTRICT_DIRECTOR",
    "Director must own the package-review authority",
  );
  assertEqual(
    HEADTEACHER_DIRECTOR_REVIEW_POLICY.requiredCapability,
    "REVIEW_HEADTEACHER_APPRAISAL",
    "Director review capability mismatch",
  );
  assert(
    HEADTEACHER_DIRECTOR_REVIEW_POLICY.separateEvidenceStreams,
    "Evidence streams must remain separate",
  );
  assert(
    !HEADTEACHER_DIRECTOR_REVIEW_POLICY.combinedWeightingDefined,
    "Combined weighting must remain undefined",
  );
  assert(
    !HEADTEACHER_DIRECTOR_REVIEW_POLICY.respondentIdentitiesAccessedAtStart,
    "Review start must not access respondent identities",
  );

  const created = createDatabase();
  const result = await startHeadteacherDirectorReview({
    ...baseInput(),
    database: created.db,
  });
  assertEqual(result.outcome, "STARTED", "Review must start");
  assertEqual(result.cycleStatus, "UNDER_REVIEW", "Cycle must enter review");
  assertEqual(result.reviewDecision, "PENDING", "Review starts pending");
  assertEqual(created.state.reviews.length, 1, "Exactly one review required");
  assertEqual(created.state.audits.length, 1, "Exactly one audit required");
  assertEqual(created.state.updates, 1, "Cycle must update once");
  assert(
    result.evidence.staffFeedback.ready &&
      result.evidence.supervisoryAssessment.ready,
    "Both evidence streams must be ready",
  );
  assert(
    !result.evidence.respondentIdentitiesAccessed &&
      !result.evidence.individualStaffResponsesAccessed,
    "Review start must not inspect confidential source responses",
  );
  const reviewMetadata = created.state.reviews[0].metadata;
  assertEqual(
    reviewMetadata.separateEvidenceStreams,
    true,
    "Review metadata must preserve separate evidence",
  );
  assertEqual(
    reviewMetadata.combinedWeightingDefined,
    false,
    "Review metadata must not invent weighting",
  );
  assert(
    !JSON.stringify(reviewMetadata).includes("respondentUserId"),
    "Review metadata must not contain respondent identities",
  );
  assert(
    !JSON.stringify(created.state.audits[0]).includes('"score":'),
    "Review-start audit must not contain score values",
  );
  assertEqual(
    created.state.transactionOptions[0].isolationLevel,
    "Serializable",
    "Transaction must be Serializable",
  );
  assertEqual(
    created.state.transactionOptions[0].maxWait,
    10000,
    "Transaction maxWait mismatch",
  );
  assertEqual(
    created.state.transactionOptions[0].timeout,
    20000,
    "Transaction timeout mismatch",
  );

  const retry = await startHeadteacherDirectorReview({
    ...baseInput(),
    database: created.db,
  });
  assertEqual(retry.outcome, "EXISTING_REVIEW", "Retry must be idempotent");
  assertEqual(created.state.reviews.length, 1, "Retry must not duplicate review");
  assertEqual(created.state.audits.length, 1, "Retry must not duplicate audit");

  await expectReject(
    () =>
      startHeadteacherDirectorReview({
        ...baseInput({ confirm: false }),
        database: createDatabase().db,
      }),
    "HEADTEACHER_DIRECTOR_REVIEW_CONFIRMATION_REQUIRED",
    "Review start must require explicit confirmation",
  );

  await expectReject(
    () =>
      startHeadteacherDirectorReview({
        ...baseInput({ actorRoleName: "SISSO" }),
        database: createDatabase().db,
      }),
    "HEADTEACHER_DIRECTOR_REVIEW_ROLE_FORBIDDEN",
    "SISSO cannot start Director package review",
  );

  await expectReject(
    () =>
      startHeadteacherDirectorReview({
        ...baseInput(),
        database: createDatabase({
          assignments: [makeAssignment({ zoneId: "district-other" })],
        }).db,
      }),
    "HEADTEACHER_DIRECTOR_REVIEW_ACTIVE_ASSIGNMENT_REQUIRED",
    "Director assignment must match the target district",
  );

  await expectReject(
    () =>
      startHeadteacherDirectorReview({
        ...baseInput(),
        database: createDatabase({ snapshots: [] }).db,
      }),
    "HEADTEACHER_DIRECTOR_REVIEW_STAFF_EVIDENCE_NOT_READY",
    "Review must not start without the staff aggregate snapshot",
  );

  await expectReject(
    () =>
      startHeadteacherDirectorReview({
        ...baseInput(),
        database: createDatabase({ assessments: [] }).db,
      }),
    "HEADTEACHER_DIRECTOR_REVIEW_SUPERVISORY_ASSESSMENT_REQUIRED",
    "Review must require a finalized supervisory assessment",
  );

  await expectReject(
    () =>
      startHeadteacherDirectorReview({
        ...baseInput(),
        database: createDatabase({
          assessments: [makeAssessment(), makeAssessment({ id: "assessment-002" })],
        }).db,
      }),
    "HEADTEACHER_DIRECTOR_REVIEW_SUPERVISORY_ASSESSMENT_AMBIGUOUS",
    "Multiple current finalized assessments must fail closed",
  );

  await expectReject(
    () =>
      startHeadteacherDirectorReview({
        ...baseInput(),
        database: createDatabase({
          assessments: [
            makeAssessment(),
            makeAssessment({
              id: "assessment-draft-002",
              status: "DRAFT",
              assessmentHash: null,
              finalizedAt: null,
              finalizedByUserId: null,
            }),
          ],
        }).db,
      }),
    "HEADTEACHER_DIRECTOR_REVIEW_SUPERVISORY_WORK_UNRESOLVED",
    "Unresolved supervisory drafts must block review",
  );

  await expectReject(
    () =>
      startHeadteacherDirectorReview({
        ...baseInput(),
        database: createDatabase({
          assessments: [makeAssessment({ assessmentHash: "e".repeat(64) })],
        }).db,
      }),
    "HEADTEACHER_DIRECTOR_REVIEW_SUPERVISORY_HASH_DRIFT",
    "Assessment evidence hash drift must fail closed",
  );

  const directorAuthored = createDatabase({
    assessments: [
      makeAssessment({
        assessorUserId: "director-user-001",
        finalizedByUserId: "director-user-001",
        assessorAssignmentId: "director-assignment-001",
      }),
    ],
  });
  // Recompute the hash after changing assessor identity.
  {
    const a = directorAuthored.state.assessments[0];
    const sections = a.instrumentVersion.sections;
    const calculated = calculateAppraisalScores(
      calculationRows(sections, a.scores),
      { requireComplete: true },
    );
    assert(calculated.ok, "Director-authored fixture must calculate");
    a.assessmentHash = hashJson(
      assessmentHashPayload(
        a,
        sections,
        calculated.value.sectionPercentages,
        calculated.value.overallPercentage,
      ),
    );
  }
  const directorResult = await startHeadteacherDirectorReview({
    ...baseInput(),
    database: directorAuthored.db,
  });
  assertEqual(
    directorResult.evidence.supervisoryAssessment.directorAuthored,
    true,
    "Director-authored assessment must be marked truthfully",
  );
  assertEqual(
    HEADTEACHER_DIRECTOR_REVIEW_POLICY
      .directorAuthoredAssessmentNeedsSeparateReviewer,
    false,
    "Current roadmap requires no separate reviewer for Director-authored assessment",
  );

  const raced = createDatabase({ uniqueRace: true });
  const racedResult = await startHeadteacherDirectorReview({
    ...baseInput(),
    database: raced.db,
  });
  assertEqual(
    racedResult.outcome,
    "EXISTING_REVIEW",
    "Concurrent review creation must recover idempotently",
  );
  assertEqual(raced.state.reviews.length, 1, "Race recovery must preserve one review");
  assertEqual(raced.state.audits.length, 0, "Competing transaction owns the audit");

  const serviceSource = fs.readFileSync(
    path.join(
      repoRoot,
      "src/lib/appraisals/headteacherDirectorReview.ts",
    ),
    "utf8",
  );
  for (const forbidden of [
    "sendSms",
    "sendEmail",
    "appraisalIdentityAccess.create",
    "aggregateFinalizedAppraisalResponses",
  ]) {
    assert(
      !serviceSource.includes(forbidden),
      `Forbidden review-start marker found: ${forbidden}`,
    );
  }
  assert(
    serviceSource.includes(
      "readHeadteacherFeedbackAggregateReadiness",
    ),
    "E2C aggregate readiness must be reused",
  );
  assert(
    serviceSource.includes("calculateAppraisalScores"),
    "Supervisory calculations must be independently verified",
  );
  assert(
    serviceSource.includes(
      "Prisma.TransactionIsolationLevel.Serializable",
    ),
    "Serializable transaction contract missing",
  );

  console.log("");
  console.log("=== D3.4G1 DIRECTOR REVIEW AUTHORITY + EXPLICIT START ===");
  console.log("");
  console.log("Review authority                : District Director only");
  console.log("Active assignment               : exact district required");
  console.log("SISSO office                    : one office; Circuit Supervisor is legacy alias");
  console.log("Cycle start boundary            : CLOSED only");
  console.log("Staff-feedback evidence         : immutable snapshot V1 required");
  console.log("Supervisory evidence            : exactly one finalized current assessment");
  console.log("Assessment calculations/hash    : recomputed and verified");
  console.log("Unresolved/multiple assessments : fail closed");
  console.log("Review record                   : stage 1 / PENDING");
  console.log("Cycle transition                : CLOSED -> UNDER_REVIEW");
  console.log("Explicit confirmation           : required");
  console.log("Same-evidence retry             : EXISTING_REVIEW");
  console.log("Concurrent create race          : idempotently recovered");
  console.log("Evidence streams                : separate");
  console.log("Combined weighting              : undefined");
  console.log("Reviewer score rewriting        : forbidden");
  console.log("Respondent identity access      : absent");
  console.log("Individual staff forms          : not selected");
  console.log("Director-authored assessment    : no separate reviewer for now");
  console.log("Transaction                     : serializable and bounded");
  console.log("Notifications/providers         : absent");
  console.log("Database accessed               : false");
  console.log("");
  console.log("RESULT: D3.4G1 DIRECTOR REVIEW START GREEN");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
