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
function clone(value) {
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
  HEADTEACHER_FEEDBACK_POLICY,
} = require(path.join(repoRoot, "src/lib/appraisals/headteacherFeedback.ts"));
const {
  HEADTEACHER_SUPERVISORY_REVIEW_PACKAGE_POLICY,
  readHeadteacherSupervisoryReviewPackage,
} = require(
  path.join(
    repoRoot,
    "src/lib/appraisals/headteacherSupervisoryReviewPackage.ts",
  ),
);

const NOW = new Date("2026-08-12T12:00:00.000Z");
const DISTRICT_ID = "district-001";
const CIRCUIT_ID = "circuit-001";
const TENANT_ID = "tenant-001";
const HEADTEACHER_ID = "headteacher-001";
const ASSESSMENT_ID = "assessment-001";
const ASSESSOR_ID = "sisso-user-001";
const ASSESSOR_ASSIGNMENT_ID = "sisso-assignment-001";
const HOS_ID = "hos-user-001";
const HOS_ASSIGNMENT_ID = "hos-assignment-001";
const SUPERVISORY_CONTENT_HASH = "d".repeat(64);
const STAFF_CONTENT_HASH = "a".repeat(64);

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
      description: section.description ?? null,
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
          isRequired: true,
        })),
    }));
}

function calculationRows(sections, scores) {
  const stored = new Map(
    scores.map((row) => [row.instrumentItemId, row]),
  );
  return sections.flatMap((section) =>
    section.items.map((item) => {
      const row = stored.get(item.id);
      return {
        itemKey: item.key,
        sectionKey: section.key,
        sectionTitle: section.title,
        sectionOrder: section.order,
        score: row?.score ?? null,
        notApplicable: row?.notApplicable ?? false,
        itemMaxScore: item.maxScore,
      };
    }),
  );
}

function makeVisitContext({
  schemaVersion = 2,
  assessorRole = "SISSO",
  assignmentRole = assessorRole,
  assessorUserId = ASSESSOR_ID,
  assessorAssignmentId = ASSESSOR_ASSIGNMENT_ID,
  includeVisitDetails = true,
} = {}) {
  const scopeLevel =
    assessorRole === "BASIC_SCHOOL_COORDINATOR" ? "DISTRICT" : "CIRCUIT";

  return {
    schemaVersion,
    workflow: "HEADTEACHER_GOVERNANCE_SUPERVISORY_ASSESSMENT",
    evidenceStream: "GOVERNANCE_SUPERVISORY_ASSESSMENT",
    cycle: {
      id: "cycle-001",
      statusAtDraft: "CLOSED",
      openedAt: "2026-08-01T08:00:00.000Z",
      deadlineAt: "2026-08-10T17:00:00.000Z",
      closedAt: "2026-08-11T08:00:00.000Z",
    },
    target: {
      userId: HEADTEACHER_ID,
      role: "HEADTEACHER",
      tenantId: TENANT_ID,
      name: "Ama Headteacher",
      schoolName: "Ayitikope M/A Basic School",
    },
    assessor: {
      userId: assessorUserId,
      name:
        assessorRole === "BASIC_SCHOOL_COORDINATOR"
          ? "BSC Officer"
          : "Sena SISSO",
      role: assessorRole,
      assignmentId: assessorAssignmentId,
      assignmentRole,
      scopeLevel,
    },
    jurisdiction: {
      districtZoneId: DISTRICT_ID,
      districtName: "Akatsi South",
      circuitZoneId: CIRCUIT_ID,
      circuitName: "Gefia Circuit",
      assignmentZoneId:
        assessorRole === "BASIC_SCHOOL_COORDINATOR"
          ? DISTRICT_ID
          : CIRCUIT_ID,
      assignmentZoneName:
        assessorRole === "BASIC_SCHOOL_COORDINATOR"
          ? "Akatsi South"
          : "Gefia Circuit",
      assignmentParentZoneId:
        assessorRole === "BASIC_SCHOOL_COORDINATOR"
          ? null
          : DISTRICT_ID,
      assignmentParentZoneName:
        assessorRole === "BASIC_SCHOOL_COORDINATOR"
          ? null
          : "Akatsi South",
    },
    instrument: {
      instrumentId: "supervisory-instrument-001",
      instrumentVersionId: "supervisory-version-001",
      code:
        APPRAISAL_INSTRUMENT_CODES.HEADTEACHER_SUPERVISORY_ASSESSMENT_V1,
      version: 1,
      contentHash: SUPERVISORY_CONTENT_HASH,
    },
    observation: {
      dateObserved: "2026-08-11",
      ...(schemaVersion === 2 && includeVisitDetails
        ? {
            visitDetails: {
              schemaVersion: 1,
              arrivalTime: "08:10",
              staffStrength: 12,
              totalEnrolment: 410,
              girls: 205,
              boys: 205,
              teachersPresentAtVisit: 10,
            },
          }
        : {}),
    },
  };
}

function assessmentHashPayload(
  assessment,
  sections,
  sectionPercentages,
  overallPercentage,
) {
  const stored = new Map(
    assessment.scores.map((row) => [row.instrumentItemId, row]),
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
        const row = stored.get(item.id);
        return {
          instrumentItemId: item.id,
          itemKey: item.key,
          sectionKey: section.key,
          sectionOrder: section.order,
          itemOrder: item.order,
          itemMaxScore: item.maxScore,
          score: row?.score ?? null,
          notApplicable: row?.notApplicable ?? false,
        };
      }),
    ),
    sectionPercentages,
    overallPercentage,
    commentsIncluded: false,
    separateFromStaffFeedback: true,
    combinedWeightingDefined: false,
  };
}

function makeAssessment({
  assessorRole = "SISSO",
  assignmentRole = assessorRole,
  assessorUserId = ASSESSOR_ID,
  assessorAssignmentId = ASSESSOR_ASSIGNMENT_ID,
  status = "FINALIZED",
  cycleStatus = "CLOSED",
  reviewStartedAt = null,
  reviews = [],
  evidenceSnapshotJson,
  metadataOverrides = {},
} = {}) {
  const sections = officialSections();
  const snapshot =
    evidenceSnapshotJson ??
    makeVisitContext({
      assessorRole,
      assignmentRole,
      assessorUserId,
      assessorAssignmentId,
    });

  const scores = sections.flatMap((section) =>
    section.items.map((item, index) => ({
      id: `score-${section.order}-${item.order}`,
      assessmentId: ASSESSMENT_ID,
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
    calculationRows(sections, scores),
    { requireComplete: true },
  );
  assert(calculated.ok, "Fixture scores must calculate", calculated);

  const visitContextHash = hashJson(snapshot);
  const assessment = {
    id: ASSESSMENT_ID,
    cycleId: "cycle-001",
    instrumentVersionId: "supervisory-version-001",
    assessorUserId,
    assessorAssignmentId,
    status,
    revision: 1,
    priorAssessmentId: null,
    dateObserved: new Date("2026-08-11T00:00:00.000Z"),
    overallPercentage: calculated.value.overallPercentage,
    sectionPercentagesJson: calculated.value.sectionPercentages,
    generalComment: null,
    evidenceSnapshotJson: snapshot,
    assessmentHash: null,
    finalizedByUserId:
      status === "FINALIZED" ? assessorUserId : null,
    finalizedAt:
      status === "FINALIZED"
        ? new Date("2026-08-11T16:00:00.000Z")
        : null,
    metadata: {
      workflow: "HEADTEACHER_GOVERNANCE_SUPERVISORY_ASSESSMENT",
      evidenceStream: "GOVERNANCE_SUPERVISORY_ASSESSMENT",
      visitContextHash,
      visitContextSchemaVersion: Number(snapshot.schemaVersion),
      visitDetailsSchemaVersion:
        Number(snapshot.schemaVersion) === 2 ? 1 : null,
      officialVisitDetailsIncluded:
        Number(snapshot.schemaVersion) === 2,
      finalizedScoresImmutable: true,
      returnedAssessmentRequiresRevision: true,
      reviewerMayRewriteScores: false,
      separateFromStaffFeedback: true,
      combinedWeightingDefined: false,
      providerCalled: false,
      ...metadataOverrides,
    },
    scores,
    reviews,
    cycle: {
      id: "cycle-001",
      instrumentVersionId: "staff-version-001",
      scopeZoneId: DISTRICT_ID,
      targetUserId: HEADTEACHER_ID,
      targetTenantId: TENANT_ID,
      targetZoneId: CIRCUIT_ID,
      targetRoleSnapshot: "HEADTEACHER",
      status: cycleStatus,
      openedAt: new Date("2026-08-01T08:00:00.000Z"),
      closedAt: new Date("2026-08-11T08:00:00.000Z"),
      reviewStartedAt,
      releasedAt: null,
      cancelledAt: null,
      metadata: {
        workflow: HEADTEACHER_FEEDBACK_POLICY.workflow,
      },
      instrumentVersion: {
        id: "staff-version-001",
        version: HEADTEACHER_FEEDBACK_POLICY.instrumentVersion,
        status: "ACTIVE",
        contentHash: STAFF_CONTENT_HASH,
        instrument: {
          code: HEADTEACHER_FEEDBACK_POLICY.instrumentCode,
          purpose: "HEADTEACHER_STAFF_FEEDBACK",
          subjectType: "HEADTEACHER",
          isActive: true,
        },
      },
    },
    instrumentVersion: {
      id: "supervisory-version-001",
      version: 1,
      status: "ACTIVE",
      contentHash: SUPERVISORY_CONTENT_HASH,
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

function makeMembership(overrides = {}) {
  return {
    id: "membership-001",
    userId: HEADTEACHER_ID,
    tenantId: TENANT_ID,
    status: "ACTIVE",
    role: { name: "HEADTEACHER" },
    user: {
      id: HEADTEACHER_ID,
      name: "Ama Headteacher",
      firstName: "Ama",
      lastName: "Headteacher",
    },
    tenant: {
      id: TENANT_ID,
      name: "Ayitikope M/A Basic School",
      status: "ACTIVE",
      zone: {
        id: CIRCUIT_ID,
        name: "Gefia Circuit",
        isActive: true,
        parentZoneId: DISTRICT_ID,
        zoneType: { level: 1 },
        parentZone: {
          id: DISTRICT_ID,
          name: "Akatsi South",
          isActive: true,
          zoneType: { level: 2 },
        },
      },
    },
    ...overrides,
  };
}

function makeHosAssignment(overrides = {}) {
  return {
    id: HOS_ASSIGNMENT_ID,
    userId: HOS_ID,
    role: "HEAD_OF_SUPERVISION",
    status: "ACTIVE",
    revokedAt: null,
    startsAt: new Date("2026-01-01T00:00:00.000Z"),
    endsAt: null,
    zoneId: DISTRICT_ID,
    zone: {
      id: DISTRICT_ID,
      name: "Akatsi South",
      isActive: true,
      zoneType: { level: 2 },
    },
    ...overrides,
  };
}

function makeScope(overrides = {}) {
  return {
    isSuperAdmin: false,
    tenantIds: [TENANT_ID],
    zoneIds: [DISTRICT_ID, CIRCUIT_ID],
    assignments: [
      {
        id: HOS_ASSIGNMENT_ID,
        role: "HEAD_OF_SUPERVISION",
        zoneId: DISTRICT_ID,
        zoneName: "Akatsi South",
        zoneLevel: 2,
        parentZoneId: null,
        parentZoneName: null,
      },
    ],
    ...overrides,
  };
}

function createDatabase(options = {}) {
  const assessment = options.assessment ?? makeAssessment();
  const state = {
    assessment,
    currentAssessments:
      options.currentAssessments ??
      [
        {
          id: assessment.id,
          cycleId: assessment.cycleId,
          status: assessment.status,
          revision: assessment.revision,
          priorAssessmentId: assessment.priorAssessmentId,
          assessorUserId: assessment.assessorUserId,
          assessorAssignmentId: assessment.assessorAssignmentId,
        },
      ],
    membership:
      options.membership === undefined
        ? makeMembership()
        : options.membership,
    assignments:
      options.assignments === undefined
        ? [makeHosAssignment()]
        : options.assignments,
    reads: [],
    writes: 0,
  };

  const db = {
    appraisalAssessment: {
      async findUnique(args) {
        state.reads.push(["appraisalAssessment.findUnique", clone(args)]);
        return state.assessment ? clone(state.assessment) : null;
      },
      async findMany(args) {
        state.reads.push(["appraisalAssessment.findMany", clone(args)]);
        const where = args?.where ?? {};
        return clone(
          state.currentAssessments.filter(
            (row) =>
              (!where.cycleId || row.cycleId === where.cycleId) &&
              (!where.assessorUserId ||
                row.assessorUserId === where.assessorUserId) &&
              (where.assessorAssignmentId === undefined ||
                row.assessorAssignmentId === where.assessorAssignmentId),
          ),
        );
      },
    },
    membership: {
      async findFirst(args) {
        state.reads.push(["membership.findFirst", clone(args)]);
        return state.membership ? clone(state.membership) : null;
      },
    },
    governanceOfficerAssignment: {
      async findMany(args) {
        state.reads.push([
          "governanceOfficerAssignment.findMany",
          clone(args),
        ]);
        return clone(state.assignments);
      },
    },
  };

  return { db, state };
}

function baseInput(overrides = {}) {
  return {
    actorUserId: HOS_ID,
    actorRoleName: "HEAD_OF_SUPERVISION",
    assessmentId: ASSESSMENT_ID,
    governanceScope: makeScope(),
    now: NOW,
    ...overrides,
  };
}

async function main() {
  assertEqual(
    HEADTEACHER_SUPERVISORY_REVIEW_PACKAGE_POLICY.audience,
    "HEAD_OF_SUPERVISION",
    "Package audience must be HOS only",
  );
  assertEqual(
    HEADTEACHER_SUPERVISORY_REVIEW_PACKAGE_POLICY.readOnly,
    true,
    "Package must be read-only",
  );
  assertEqual(
    HEADTEACHER_SUPERVISORY_REVIEW_PACKAGE_POLICY.staffFeedbackIncluded,
    false,
    "Staff feedback must not enter HOS package",
  );
  assertEqual(
    HEADTEACHER_SUPERVISORY_REVIEW_PACKAGE_POLICY.respondentIdentitiesIncluded,
    false,
    "Respondent identities must be absent",
  );
  assertEqual(
    HEADTEACHER_SUPERVISORY_REVIEW_PACKAGE_POLICY.databaseWritesAllowed,
    false,
    "B2 package must not write",
  );

  const fixture = createDatabase();
  const result = await readHeadteacherSupervisoryReviewPackage({
    ...baseInput(),
    database: fixture.db,
  });

  assertEqual(
    result.lifecycleState,
    "READY_TO_START",
    "B2 package must remain pre-mutation",
  );
  assertEqual(result.cycle.status, "CLOSED", "Cycle must remain CLOSED");
  assertEqual(
    result.assessment.sections.length,
    4,
    "Native form must contain four sections",
  );
  assertEqual(
    result.assessment.sections.reduce(
      (sum, section) => sum + section.items.length,
      0,
    ),
    34,
    "Native form must contain 34 indicators",
  );
  assertEqual(
    result.assessment.assessor.role,
    "SISSO",
    "SISSO origin must remain visible",
  );
  assertEqual(
    result.assessment.assessor.scopeLevel,
    "CIRCUIT",
    "SISSO origin must remain circuit-scoped",
  );
  assertEqual(
    result.assessment.visit.contextSchemaVersion,
    2,
    "Fresh package must preserve visit context V2",
  );
  assertEqual(
    result.assessment.visit.officialDetailsAvailable,
    true,
    "Fresh visit particulars must be available",
  );
  assertEqual(
    result.assessment.visit.arrivalTime,
    "08:10",
    "Arrival time must project from immutable snapshot",
  );
  assertEqual(
    result.assessment.visit.totalEnrolment,
    410,
    "Enrolment must project from immutable snapshot",
  );
  assertEqual(
    result.integrity.assessmentHashVerified,
    true,
    "Assessment hash must be verified",
  );
  assertEqual(
    result.integrity.calculationsVerified,
    true,
    "Scores must be independently recalculated",
  );
  assertEqual(
    result.integrity.noExistingReviewCustody,
    true,
    "B2 must require zero existing review rows",
  );
  assertEqual(fixture.state.writes, 0, "B2 must not write");

  const serialized = JSON.stringify(result);
  for (const forbidden of [
    '"respondentUserId":',
    '"participantId":',
    '"responseId":',
    '"responseHash":',
    '"targetUserId":',
    '"assessorUserId":',
    '"reviewerUserId":',
    '"reviewerAssignmentId":',
    '"assessorAssignmentId":',
    '"assessmentHash":',
    '"visitContextHash":',
    '"phone":',
    '"email":',
    '"staffFeedback":',
    '"anonymousResponses":',
  ]) {
    assert(
      !serialized.includes(forbidden),
      `Private or Director-only marker leaked: ${forbidden}`,
    );
  }

  const bscAssessment = makeAssessment({
    assessorRole: "BASIC_SCHOOL_COORDINATOR",
    assessorUserId: "bsc-user-001",
    assessorAssignmentId: "bsc-assignment-001",
  });
  const bscResult = await readHeadteacherSupervisoryReviewPackage({
    ...baseInput({ assessmentId: bscAssessment.id }),
    database: createDatabase({ assessment: bscAssessment }).db,
  });
  assertEqual(
    bscResult.assessment.assessor.role,
    "BASIC_SCHOOL_COORDINATOR",
    "BSC-originated report must be reviewable by HOS",
  );
  assertEqual(
    bscResult.assessment.assessor.scopeLevel,
    "DISTRICT",
    "BSC origin must remain district-scoped",
  );

  const legacySnapshot = makeVisitContext({
    schemaVersion: 1,
    assessorRole: "CIRCUIT_SUPERVISOR",
    assignmentRole: "CIRCUIT_SUPERVISOR",
    includeVisitDetails: false,
  });
  const legacyAssessment = makeAssessment({
    assessorRole: "CIRCUIT_SUPERVISOR",
    assignmentRole: "CIRCUIT_SUPERVISOR",
    evidenceSnapshotJson: legacySnapshot,
    metadataOverrides: {
      visitContextSchemaVersion: 1,
      visitDetailsSchemaVersion: null,
      officialVisitDetailsIncluded: false,
    },
  });
  const legacyResult = await readHeadteacherSupervisoryReviewPackage({
    ...baseInput(),
    database: createDatabase({ assessment: legacyAssessment }).db,
  });
  assertEqual(
    legacyResult.assessment.assessor.role,
    "SISSO",
    "Legacy Circuit Supervisor must canonicalize to SISSO",
  );
  assertEqual(
    legacyResult.assessment.visit.contextSchemaVersion,
    1,
    "Historical context version must remain 1",
  );
  assertEqual(
    legacyResult.assessment.visit.officialDetailsAvailable,
    false,
    "Historical visit details must not be invented",
  );

  await expectReject(
    () =>
      readHeadteacherSupervisoryReviewPackage({
        ...baseInput({ actorRoleName: "BASIC_SCHOOL_COORDINATOR" }),
        database: createDatabase().db,
      }),
    "HEADTEACHER_SUPERVISORY_REVIEW_PACKAGE_ROLE_FORBIDDEN",
    "BSC must not read the HOS review package",
  );

  await expectReject(
    () =>
      readHeadteacherSupervisoryReviewPackage({
        ...baseInput(),
        database: createDatabase({
          assignments: [
            makeHosAssignment({ zoneId: "district-other" }),
          ],
        }).db,
      }),
    "HEADTEACHER_SUPERVISORY_REVIEW_PACKAGE_ACTIVE_HOS_ASSIGNMENT_REQUIRED",
    "HOS assignment must match the target district",
  );

  await expectReject(
    () =>
      readHeadteacherSupervisoryReviewPackage({
        ...baseInput({
          governanceScope: makeScope({
            tenantIds: ["tenant-other"],
            zoneIds: ["district-other"],
          }),
        }),
        database: createDatabase().db,
      }),
    "HEADTEACHER_SUPERVISORY_REVIEW_PACKAGE_SCOPE_FORBIDDEN",
    "Out-of-scope tenant/district must fail closed",
  );

  await expectReject(
    () => {
      const assessment = makeAssessment({
        assessorRole: "HEAD_OF_SUPERVISION",
        assessorUserId: HOS_ID,
        assessorAssignmentId: HOS_ASSIGNMENT_ID,
      });
      return readHeadteacherSupervisoryReviewPackage({
        ...baseInput(),
        database: createDatabase({ assessment }).db,
      });
    },
    "HEADTEACHER_SUPERVISORY_REVIEW_PACKAGE_ASSESSOR_ORIGIN_FORBIDDEN",
    "HOS must not self-review a HOS-authored assessment",
  );

  await expectReject(
    () => {
      const assessment = makeAssessment({
        assessorRole: "DISTRICT_DIRECTOR",
        assessorUserId: "director-user-001",
        assessorAssignmentId: "director-assignment-001",
      });
      return readHeadteacherSupervisoryReviewPackage({
        ...baseInput(),
        database: createDatabase({ assessment }).db,
      });
    },
    "HEADTEACHER_SUPERVISORY_REVIEW_PACKAGE_ASSESSOR_ORIGIN_FORBIDDEN",
    "Director-authored assessment must not enter HOS review",
  );

  await expectReject(
    () => {
      const review = {
        id: "review-001",
        cycleId: "cycle-001",
        assessmentId: ASSESSMENT_ID,
        reviewerUserId: HOS_ID,
        reviewerAssignmentId: HOS_ASSIGNMENT_ID,
        stage: 1,
        decision: "PENDING",
        note: null,
        decidedAt: null,
        metadata: {},
        createdAt: NOW,
      };
      const assessment = makeAssessment({ reviews: [review] });
      return readHeadteacherSupervisoryReviewPackage({
        ...baseInput(),
        database: createDatabase({ assessment }).db,
      });
    },
    "HEADTEACHER_SUPERVISORY_REVIEW_PACKAGE_ASSESSMENT_CONTRACT_INVALID",
    "Existing review custody must block the pre-start package",
  );

  await expectReject(
    () => {
      const assessment = makeAssessment({
        cycleStatus: "UNDER_REVIEW",
        reviewStartedAt: NOW,
      });
      return readHeadteacherSupervisoryReviewPackage({
        ...baseInput(),
        database: createDatabase({ assessment }).db,
      });
    },
    "HEADTEACHER_SUPERVISORY_REVIEW_PACKAGE_CYCLE_CONTRACT_INVALID",
    "B2 package requires CLOSED pre-review cycle",
  );

  {
    const assessment = makeAssessment();
    const independentBscAssessment = {
      id: "assessment-bsc-002",
      cycleId: assessment.cycleId,
      status: "FINALIZED",
      revision: 1,
      priorAssessmentId: null,
      assessorUserId: "bsc-user-002",
      assessorAssignmentId: "bsc-assignment-002",
    };
    const resultWithParallelOfficerAssessment =
      await readHeadteacherSupervisoryReviewPackage({
        ...baseInput(),
        database: createDatabase({
          assessment,
          currentAssessments: [
            {
              id: assessment.id,
              cycleId: assessment.cycleId,
              status: assessment.status,
              revision: assessment.revision,
              priorAssessmentId: assessment.priorAssessmentId,
              assessorUserId: assessment.assessorUserId,
              assessorAssignmentId: assessment.assessorAssignmentId,
            },
            independentBscAssessment,
          ],
        }).db,
      });
    assertEqual(
      resultWithParallelOfficerAssessment.assessment.id,
      assessment.id,
      "Parallel finalized assessment from another officer lane must not make the selected HOS package ambiguous",
    );
  }

  await expectReject(
    () => {
      const assessment = makeAssessment();
      const secondSameLane = {
        id: "assessment-same-lane-002",
        cycleId: assessment.cycleId,
        status: "FINALIZED",
        revision: 1,
        priorAssessmentId: null,
        assessorUserId: assessment.assessorUserId,
        assessorAssignmentId: assessment.assessorAssignmentId,
      };
      return readHeadteacherSupervisoryReviewPackage({
        ...baseInput(),
        database: createDatabase({
          assessment,
          currentAssessments: [
            {
              id: assessment.id,
              cycleId: assessment.cycleId,
              status: assessment.status,
              revision: assessment.revision,
              priorAssessmentId: assessment.priorAssessmentId,
              assessorUserId: assessment.assessorUserId,
              assessorAssignmentId: assessment.assessorAssignmentId,
            },
            secondSameLane,
          ],
        }).db,
      });
    },
    "HEADTEACHER_SUPERVISORY_REVIEW_PACKAGE_CURRENT_ASSESSMENT_AMBIGUOUS",
    "Multiple finalized assessments in the same frozen assessor lane must fail closed",
  );

  await expectReject(
    () => {
      const assessment = makeAssessment();
      return readHeadteacherSupervisoryReviewPackage({
        ...baseInput(),
        database: createDatabase({
          assessment,
          currentAssessments: [
            {
              id: assessment.id,
              cycleId: assessment.cycleId,
              status: assessment.status,
              revision: assessment.revision,
              priorAssessmentId: null,
              assessorUserId: assessment.assessorUserId,
              assessorAssignmentId: assessment.assessorAssignmentId,
            },
            {
              id: "assessment-draft-002",
              cycleId: assessment.cycleId,
              status: "DRAFT",
              revision: 1,
              priorAssessmentId: null,
              assessorUserId: assessment.assessorUserId,
              assessorAssignmentId: assessment.assessorAssignmentId,
            },
          ],
        }).db,
      });
    },
    "HEADTEACHER_SUPERVISORY_REVIEW_PACKAGE_SUPERVISORY_WORK_UNRESOLVED",
    "Unresolved draft must block HOS review",
  );

  await expectReject(
    () => {
      const assessment = makeAssessment();
      assessment.assessmentHash = "e".repeat(64);
      return readHeadteacherSupervisoryReviewPackage({
        ...baseInput(),
        database: createDatabase({ assessment }).db,
      });
    },
    "HEADTEACHER_SUPERVISORY_REVIEW_PACKAGE_ASSESSMENT_HASH_DRIFT",
    "Assessment hash drift must fail closed",
  );

  await expectReject(
    () => {
      const assessment = makeAssessment();
      assessment.scores[0].score = 1;
      return readHeadteacherSupervisoryReviewPackage({
        ...baseInput(),
        database: createDatabase({ assessment }).db,
      });
    },
    "HEADTEACHER_SUPERVISORY_REVIEW_PACKAGE_CALCULATION_DRIFT",
    "Stored score drift must fail closed before display",
  );

  await expectReject(
    () =>
      readHeadteacherSupervisoryReviewPackage({
        ...baseInput(),
        database: createDatabase({ membership: null }).db,
      }),
    "HEADTEACHER_SUPERVISORY_REVIEW_PACKAGE_TARGET_NOT_FOUND",
    "Active target membership must be required",
  );

  const serviceSource = fs.readFileSync(
    path.join(
      repoRoot,
      "src/lib/appraisals/headteacherSupervisoryReviewPackage.ts",
    ),
    "utf8",
  );

  for (const required of [
    'audience: "HEAD_OF_SUPERVISION"',
    'eligibleAssessorRoles: ["SISSO", "BASIC_SCHOOL_COORDINATOR"]',
    'requiredAssessmentStatus: "FINALIZED"',
    'requiredCycleStatus: "CLOSED"',
    "calculateAppraisalScores",
    "visitDetailsFromEvidenceSnapshot",
    "assessmentHashPayload",
    "assessorUserId: record.assessorUserId",
    "assessorAssignmentId: record.assessorAssignmentId",
    "currentHosAssignmentVerified: true",
    "noExistingReviewCustody: true",
    "staffFeedbackIncluded: false",
    "respondentIdentitiesIncluded: false",
    "databaseWritesAllowed: false",
    "providerCallsAllowed: false",
  ]) {
    assert(
      serviceSource.includes(required),
      `Required B2 service marker missing: ${required}`,
    );
  }

  for (const forbidden of [
    "appraisalAggregateSnapshot",
    "readHeadteacherFeedbackAggregateReadiness",
    "HeadteacherDirectorAnonymousResponses",
    "anonymousResponses",
    "sendSms",
    "sendEmail",
    "appraisalReview.create",
    "appraisalReview.update",
    "appraisalAssessment.update",
    "$transaction(",
  ]) {
    assert(
      !serviceSource.includes(forbidden),
      `Forbidden B2 service marker found: ${forbidden}`,
    );
  }

  console.log("");
  console.log("=== N6-F1C6B2 HOS HEADTEACHER IMMUTABLE REVIEW PACKAGE ===");
  console.log("");
  console.log("Audience                         : Head of Supervision only");
  console.log("Lifecycle boundary               : FINALIZED assessment + CLOSED cycle");
  console.log("Review custody                   : zero existing AppraisalReview rows");
  console.log("Eligible assessor origins        : SISSO / Basic School Coordinator");
  console.log("HOS/Director self-review         : excluded");
  console.log("Current finalized assessment     : exactly one per frozen assessor lane");
  console.log("Parallel officer assessments     : allowed and independently reviewable");
  console.log("Instrument                       : native 4 sections / 34 indicators");
  console.log("Score scale                      : 1-5 / N/A");
  console.log("Stored calculations              : independently recalculated");
  console.log("Assessment proof                 : deterministic hash reverified");
  console.log("Visit-context proof              : immutable hash reverified");
  console.log("Visit particulars V2             : projected from immutable snapshot");
  console.log("Legacy visit context V1          : readable without reconstruction");
  console.log("HOS district assignment          : exact current assignment required");
  console.log("Target scope                     : active Headteacher + school + circuit + district");
  console.log("Staff-feedback evidence          : absent");
  console.log("Respondent identities/forms      : absent");
  console.log("Internal user/assignment hashes  : excluded from browser package");
  console.log("Reviewer score rewriting         : forbidden");
  console.log("Database writes                  : absent");
  console.log("Notifications/providers          : absent");
  console.log("Database accessed                : source contract only");
  console.log("");
  console.log("RESULT: N6-F1C6B2 HOS HEADTEACHER IMMUTABLE REVIEW PACKAGE GREEN");
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
