#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS QA harness intentionally loads TypeScript through a local transpile hook. */

const crypto = require("crypto");
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
    return;
  }
  fail(message, { expectedError: code });
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
    .update(JSON.stringify(stableValue(value)))
    .digest("hex");
}
function clone(value) {
  return structuredClone(value);
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
  if ((transpiled.diagnostics ?? []).length) {
    fail(`TypeScript transpilation diagnostics in ${filename}`);
  }
  loadedModule._compile(transpiled.outputText, filename);
};

const {
  HEADTEACHER_RELEASED_RESULT_POLICY,
  readHeadteacherReleasedResult,
} = require(path.join(
  repoRoot,
  "src/lib/appraisals/headteacherReleasedResult.ts",
));

const RELEASED_AT = new Date("2026-08-03T10:00:00.000Z");
const FINALIZED_AT = new Date("2026-08-02T10:00:00.000Z");
const OBSERVED_AT = new Date("2026-08-01T00:00:00.000Z");
const VISIT_HASH = "1".repeat(64);
const STAFF_SOURCE_HASH = "2".repeat(64);
const DECISION_HASH = "3".repeat(64);
const REVIEWER_USER = "director-user-001";
const REVIEWER_ASSIGNMENT = "director-assignment-001";

const sectionSpecs = [
  ["SECTION_A", "Professional leadership", 1, 55, 11],
  ["SECTION_B", "School management", 2, 45, 9],
  ["SECTION_C", "Instructional leadership", 3, 40, 8],
  ["SECTION_D", "Community and accountability", 4, 30, 6],
];

function makeInstrument() {
  let number = 0;
  return sectionSpecs.map(([key, title, order, maxScore, count]) => ({
    id: `section-${order}`,
    key,
    title,
    order,
    maxScore,
    items: Array.from({ length: count }, (_, offset) => {
      number += 1;
      return {
        id: `item-id-${String(number).padStart(2, "0")}`,
        key: `ITEM_${String(number).padStart(2, "0")}`,
        label: `Official appraisal item ${number}`,
        order: offset + 1,
        maxScore: 5,
      };
    }),
  }));
}

function assessmentHashPayload(assessment, sections, percentages, overall) {
  const stored = new Map(assessment.scores.map((row) => [row.instrumentItemId, row]));
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
          score: score.score,
          notApplicable: score.notApplicable,
        };
      }),
    ),
    sectionPercentages: percentages,
    overallPercentage: overall,
    commentsIncluded: false,
    separateFromStaffFeedback: true,
    combinedWeightingDefined: false,
  };
}

function makeState() {
  const sections = makeInstrument();
  const sectionPercentages = Object.fromEntries(sections.map((section) => [section.key, 80]));
  const scores = sections.flatMap((section) =>
    section.items.map((item) => ({
      id: `score-${item.id}`,
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
      score: 4,
      notApplicable: false,
    })),
  );
  const assessment = {
    id: "assessment-001",
    cycleId: "cycle-001",
    instrumentVersionId: "instrument-version-001",
    assessorUserId: "sisso-user-001",
    assessorAssignmentId: "sisso-assignment-001",
    status: "FINALIZED",
    revision: 1,
    dateObserved: OBSERVED_AT,
    overallPercentage: 80,
    sectionPercentagesJson: sectionPercentages,
    generalComment: null,
    assessmentHash: null,
    finalizedByUserId: "sisso-user-001",
    finalizedAt: FINALIZED_AT,
    metadata: { visitContextHash: VISIT_HASH },
    evidenceSnapshotJson: {
      schemaVersion: 2,
      observation: {
        dateObserved: "2026-08-01",
        visitDetails: {
          schemaVersion: 1,
          arrivalTime: "08:15",
          staffStrength: 12,
          totalEnrolment: 320,
          girls: 168,
          boys: 152,
          teachersPresentAtVisit: 10,
        },
      },
    },
    scores,
    instrumentVersion: {
      id: "instrument-version-001",
      version: 1,
      status: "ACTIVE",
      contentHash: "4".repeat(64),
      instrument: {
        id: "instrument-001",
        code: "HEADTEACHER_SUPERVISORY_ASSESSMENT_V1",
        purpose: "HEADTEACHER_SUPERVISORY_ASSESSMENT",
        subjectType: "HEADTEACHER",
        isActive: true,
      },
      sections,
    },
  };
  assessment.assessmentHash = hashJson(
    assessmentHashPayload(assessment, sections, sectionPercentages, 80),
  );

  const sectionAveragesJson = Object.fromEntries(
    sections.map((section) => [
      section.key,
      {
        sectionKey: section.key,
        sectionTitle: section.title,
        sectionOrder: section.order,
        sectionMaxScore: section.maxScore,
        finalizedResponses: 5,
        averagePercentage: 75,
      },
    ]),
  );
  const itemAveragesJson = Object.fromEntries(
    sections.flatMap((section) =>
      section.items.map((item) => [
        item.key,
        {
          itemKey: item.key,
          itemLabel: item.label,
          itemOrder: item.order,
          itemMaxScore: item.maxScore,
          sectionKey: section.key,
          sectionOrder: section.order,
          applicableResponses: 5,
          notApplicableResponses: 0,
          averageScore: 3.75,
          averagePercentage: 75,
        },
      ]),
    ),
  );
  const snapshot = {
    id: "snapshot-001",
    cycleId: "cycle-001",
    version: 1,
    eligibleResponses: 6,
    finalizedResponses: 5,
    expiredResponses: 1,
    minimumResponses: 1,
    releaseEligible: true,
    overallPercentage: 75,
    sectionAveragesJson,
    itemAveragesJson,
    sourceHash: STAFF_SOURCE_HASH,
    generatedByUserId: null,
    generatedAt: new Date("2026-08-02T09:00:00.000Z"),
    metadata: {
      workflow: "HEADTEACHER_CONFIDENTIAL_STAFF_FEEDBACK",
      aggregateSchemaVersion: 1,
      instrumentCode: "HEADTEACHER_STAFF_FEEDBACK_V1",
      instrumentVersion: 1,
      instrumentDefinitionHash: "5".repeat(64),
      readiness: "READY",
      revokedResponses: 0,
      reviewStarted: false,
      privacy: {
        respondentIdentitiesIncluded: false,
        individualScoresIncluded: false,
        responseHashesIncluded: false,
        submissionTimestampsIncluded: false,
        participantListIncluded: false,
      },
      sourceIntegrity: {
        generatedBy: "SYSTEM_AGGREGATE_WORKER",
        sourceHashAlgorithm: "SHA-256",
        finalizedResponsesOnly: true,
        finalizedResponseHashesVerified: true,
        storedCalculationsRecomputed: true,
        immutableSnapshotVersion: 1,
      },
    },
  };

  const evidence = {
    staffFeedback: {
      ready: true,
      snapshotId: snapshot.id,
      snapshotVersion: 1,
      sourceHash: snapshot.sourceHash,
      finalizedResponses: 5,
      minimumResponses: 1,
    },
    supervisoryAssessment: {
      ready: true,
      assessmentId: assessment.id,
      revision: 1,
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
  const reviewEvidenceHash = hashJson({
    schemaVersion: 1,
    workflow: "HEADTEACHER_CONFIDENTIAL_STAFF_FEEDBACK",
    cycleId: "cycle-001",
    reviewerUserId: REVIEWER_USER,
    reviewerAssignmentId: REVIEWER_ASSIGNMENT,
    staffFeedback: {
      snapshotId: snapshot.id,
      snapshotVersion: 1,
      sourceHash: snapshot.sourceHash,
      finalizedResponses: 5,
      minimumResponses: 1,
    },
    supervisoryAssessment: {
      assessmentId: assessment.id,
      revision: 1,
      assessmentHash: assessment.assessmentHash,
      assessorAssignmentId: assessment.assessorAssignmentId,
      directorAuthored: false,
    },
    separateEvidenceStreams: true,
    combinedWeightingDefined: false,
    respondentIdentitiesAccessed: false,
    individualStaffResponsesAccessed: false,
    reviewerMayRewriteScores: false,
  });

  const review = {
    id: "review-001",
    cycleId: "cycle-001",
    assessmentId: assessment.id,
    reviewerUserId: REVIEWER_USER,
    reviewerAssignmentId: REVIEWER_ASSIGNMENT,
    stage: 1,
    decision: "ACCEPTED",
    note: "Continue the documented improvement actions.",
    decidedAt: RELEASED_AT,
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
    createdAt: new Date("2026-08-02T11:00:00.000Z"),
  };

  const releaseRequestHash = hashJson({
    schemaVersion: 1,
    workflow: "HEADTEACHER_CONFIDENTIAL_STAFF_FEEDBACK",
    cycleId: "cycle-001",
    reviewId: review.id,
    reviewStage: review.stage,
    assessmentId: assessment.id,
    reviewerUserId: REVIEWER_USER,
    reviewerAssignmentId: REVIEWER_ASSIGNMENT,
    reviewEvidenceHash,
    snapshotId: snapshot.id,
    staffSourceHash: snapshot.sourceHash,
    supervisoryAssessmentHash: assessment.assessmentHash,
    decisionContractHash: DECISION_HASH,
    decision: "RELEASE",
    note: review.note,
    cycleNextStatus: "RELEASED",
    reviewNextDecision: "ACCEPTED",
    assessmentNextStatus: "FINALIZED",
    assessmentMutationAllowed: false,
    reviewerMayRewriteScores: false,
    scoreMutationAllowed: false,
    separateEvidenceStreams: true,
    combinedWeightingDefined: false,
    notificationsSeeded: false,
    providerCalled: false,
  });
  const proof = {
    proofSchemaVersion: 1,
    workflow: "HEADTEACHER_CONFIDENTIAL_STAFF_FEEDBACK",
    cycleId: "cycle-001",
    reviewId: review.id,
    reviewStage: review.stage,
    reviewDecision: "ACCEPTED",
    assessmentId: assessment.id,
    assessmentStatus: "FINALIZED",
    snapshotId: snapshot.id,
    reviewEvidenceHash,
    staffSourceHash: snapshot.sourceHash,
    supervisoryAssessmentHash: assessment.assessmentHash,
    decisionContractHash: DECISION_HASH,
    releaseRequestHash,
    reviewerUserId: REVIEWER_USER,
    reviewerAssignmentId: REVIEWER_ASSIGNMENT,
    releasedAt: RELEASED_AT.toISOString(),
    assessmentMutationPerformed: false,
    scoreMutationPerformed: false,
    respondentIdentitiesAccessed: false,
    individualStaffResponsesAccessed: false,
    reviewerMayRewriteScores: false,
    separateEvidenceStreams: true,
    combinedWeightingDefined: false,
    notificationsSeeded: false,
    notificationReadiness: "READY_FOR_POST_RELEASE_SEEDING",
    providerCalled: false,
  };
  proof.releaseProofHash = hashJson(proof);
  proof.releaseNoteIncluded = true;
  proof.releaseNoteHash = hashJson({ note: review.note });
  review.metadata.headteacherDirectorRelease = clone(proof);

  const cycle = {
    id: "cycle-001",
    scopeZoneId: "district-zone-001",
    targetUserId: "headteacher-user-001",
    targetTenantId: "tenant-001",
    targetRoleSnapshot: "HEADTEACHER",
    status: "RELEASED",
    releasedAt: RELEASED_AT,
    cancelledAt: null,
    metadata: {
      workflow: "HEADTEACHER_CONFIDENTIAL_STAFF_FEEDBACK",
      headteacherDirectorRelease: clone(proof),
    },
  };
  const membership = {
    id: "membership-001",
    userId: "headteacher-user-001",
    tenantId: "tenant-001",
    status: "ACTIVE",
    role: { name: "HEADTEACHER" },
    user: {
      id: "headteacher-user-001",
      name: "Headteacher One",
      firstName: "Headteacher",
      lastName: "One",
    },
    tenant: {
      id: "tenant-001",
      name: "Example Basic School",
      status: "ACTIVE",
      zone: {
        id: "circuit-zone-001",
        name: "Example Circuit",
        isActive: true,
        parentZoneId: "district-zone-001",
        zoneType: { level: 1, countryCode: "GH" },
        parentZone: {
          id: "district-zone-001",
          name: "Example District",
          isActive: true,
          zoneType: { level: 2, countryCode: "GH" },
        },
      },
    },
  };
  return { cycle, membership, snapshot, assessment, review, reviews: [review] };
}

function makeDatabase(state) {
  const reads = [];
  return {
    reads,
    membership: {
      async findMany() {
        reads.push("membership.findMany");
        return [clone(state.membership)];
      },
    },
    appraisalCycle: {
      async findUnique() {
        reads.push("appraisalCycle.findUnique");
        return clone(state.cycle);
      },
    },
    appraisalAggregateSnapshot: {
      async findUnique() {
        reads.push("appraisalAggregateSnapshot.findUnique");
        return clone(state.snapshot);
      },
    },
    appraisalAssessment: {
      async findUnique() {
        reads.push("appraisalAssessment.findUnique");
        return {
          ...clone(state.assessment),
          reviews: clone(state.reviews),
        };
      },
    },
  };
}

function input(database, overrides = {}) {
  return {
    actorUserId: "headteacher-user-001",
    actorRoleName: "HEADTEACHER",
    actorTenantId: "tenant-001",
    cycleId: "cycle-001",
    database,
    ...overrides,
  };
}

async function main() {
  assertEqual(HEADTEACHER_RELEASED_RESULT_POLICY.audience, "RELEASED_HEADTEACHER", "Audience drift");
  assertEqual(HEADTEACHER_RELEASED_RESULT_POLICY.responseCountsIncluded, false, "Response counts must remain hidden");
  assertEqual(HEADTEACHER_RELEASED_RESULT_POLICY.staffItemAveragesIncluded, false, "Staff item averages must remain hidden");
  assertEqual(
    HEADTEACHER_RELEASED_RESULT_POLICY.supervisoryItemScoresIncluded,
    true,
    "Verified supervisory item scores must be included",
  );
  assertEqual(
    HEADTEACHER_RELEASED_RESULT_POLICY.supervisoryItemScoresReadOnly,
    true,
    "Supervisory item scores must remain read-only",
  );
  assertEqual(HEADTEACHER_RELEASED_RESULT_POLICY.combinedWeightingDefined, false, "Combined weighting must remain undefined");
  assertEqual(
    HEADTEACHER_RELEASED_RESULT_POLICY.supervisoryVisitDetailsIncluded,
    true,
    "Immutable supervisory visit details must be included",
  );
  assertEqual(
    HEADTEACHER_RELEASED_RESULT_POLICY.concurrentPrismaReadsAllowed,
    false,
    "Single-connection UAT path must not launch concurrent Prisma reads",
  );

  const state = makeState();
  const database = makeDatabase(state);
  const result = await readHeadteacherReleasedResult(input(database));
  assertEqual(result.lifecycleState, "RELEASED", "Released lifecycle missing");
  assertEqual(result.cycle.schoolName, "Example Basic School", "School projection drift");
  assertEqual(result.cycle.circuitName, "Example Circuit", "Circuit projection drift");
  assertEqual(result.cycle.headteacherName, "Headteacher One", "Headteacher projection drift");
  assertEqual(result.release.integrityVerified, true, "Release proof not verified");
  assertEqual(result.staffFeedback.sections.length, 4, "Staff section count drift");
  assertEqual(result.supervisoryAssessment.sections.length, 4, "Supervisory section count drift");
  assertEqual(result.supervisoryAssessment.visit?.arrivalTime, "08:15", "Arrival time projection drift");
  assertEqual(result.supervisoryAssessment.visit?.staffStrength, 12, "Staff strength projection drift");
  assertEqual(result.supervisoryAssessment.visit?.totalEnrolment, 320, "Enrolment projection drift");
  assertEqual(result.supervisoryAssessment.visit?.girls, 168, "Girls projection drift");
  assertEqual(result.supervisoryAssessment.visit?.boys, 152, "Boys projection drift");
  assertEqual(
    result.supervisoryAssessment.visit?.teachersPresentAtVisit,
    10,
    "Teachers-present projection drift",
  );
  assertEqual(result.comparison.sections.length, 4, "Comparison section count drift");
  assertEqual(result.comparison.overall.supervisoryMinusStaffPercentagePoints, 5, "Comparison direction drift");
  assertEqual(result.comparison.combinedOverallPercentage, null, "Combined score must remain absent");
  assertEqual(result.privacy.responseCountsIncluded, false, "Response counts leaked");
  assertEqual(result.privacy.staffItemAveragesIncluded, false, "Staff item averages leaked");
  assertEqual(
    result.privacy.supervisoryItemScoresIncluded,
    true,
    "Verified supervisory item scores missing",
  );
  assert(
    result.staffFeedback.sections.every((section) => !("items" in section)),
    "Staff item evidence leaked",
  );
  const supervisoryItems = result.supervisoryAssessment.sections.flatMap(
    (section) => section.items,
  );
  assertEqual(supervisoryItems.length, 34, "Supervisory item count drift");
  assert(
    supervisoryItems.every(
      (item) =>
        item.score === 4 &&
        item.notApplicable === false &&
        item.itemMaxScore === 5,
    ),
    "Verified supervisory item projection drift",
  );
  assertEqual(
    result.integrity.supervisoryItemScoresVerified,
    true,
    "Supervisory item integrity proof missing",
  );
  assert(!JSON.stringify(result).includes(REVIEWER_USER), "Reviewer identity leaked");
  assert(!JSON.stringify(result).includes("sisso-user-001"), "Assessor identity leaked");
  assertEqual(database.reads.length, 4, "Unexpected read shape");
  assertEqual(
    database.reads.join(" -> "),
    "appraisalCycle.findUnique -> membership.findMany -> appraisalAssessment.findUnique -> appraisalAggregateSnapshot.findUnique",
    "Released-result reads must remain sequential and pool-safe",
  );

  const historicalState = makeState();
  historicalState.assessment.evidenceSnapshotJson = {
    schemaVersion: 1,
    observation: { dateObserved: "2026-08-01" },
  };
  const historical = await readHeadteacherReleasedResult(
    input(makeDatabase(historicalState)),
  );
  assertEqual(
    historical.supervisoryAssessment.visit,
    null,
    "Version-1 visit compatibility must remain truthful and unreconstructed",
  );

  await expectReject(
    () => readHeadteacherReleasedResult(input(makeDatabase(makeState()), { actorRoleName: "TEACHER" })),
    "HEADTEACHER_RELEASED_RESULT_ROLE_FORBIDDEN",
    "Teacher must not read released Headteacher result",
  );
  await expectReject(
    () => readHeadteacherReleasedResult(input(makeDatabase(makeState()), { actorTenantId: "tenant-999" })),
    "HEADTEACHER_RELEASED_RESULT_TARGET_FORBIDDEN",
    "Cross-tenant read must fail",
  );

  const proofDrift = makeState();
  proofDrift.review.metadata.headteacherDirectorRelease.releaseProofHash = "f".repeat(64);
  await expectReject(
    () => readHeadteacherReleasedResult(input(makeDatabase(proofDrift))),
    "HEADTEACHER_RELEASED_RESULT_RELEASE_PROOF_COPY_DRIFT",
    "Cycle/review proof copies must match",
  );

  const noteDrift = makeState();
  noteDrift.cycle.metadata.headteacherDirectorRelease.releaseNoteHash = "f".repeat(64);
  noteDrift.review.metadata.headteacherDirectorRelease.releaseNoteHash = "f".repeat(64);
  await expectReject(
    () => readHeadteacherReleasedResult(input(makeDatabase(noteDrift))),
    "HEADTEACHER_RELEASED_RESULT_RELEASE_NOTE_HASH_DRIFT",
    "Release note hash drift must fail",
  );

  const assessmentDrift = makeState();
  assessmentDrift.assessment.scores[0].score = 5;
  await expectReject(
    () => readHeadteacherReleasedResult(input(makeDatabase(assessmentDrift))),
    "HEADTEACHER_RELEASED_RESULT_SUPERVISORY_CALCULATION_DRIFT",
    "Supervisory score drift must fail",
  );

  const laterReview = makeState();
  laterReview.reviews.push({
    ...clone(laterReview.review),
    id: "review-002",
    stage: 2,
    decision: "PENDING",
    note: null,
    decidedAt: null,
  });
  await expectReject(
    () => readHeadteacherReleasedResult(input(makeDatabase(laterReview))),
    "HEADTEACHER_RELEASED_RESULT_CURRENT_REVIEW_DRIFT",
    "Later review after release must fail",
  );

  const source = fs.readFileSync(
    path.join(repoRoot, "src/lib/appraisals/headteacherReleasedResult.ts"),
    "utf8",
  );
  const clientSource = fs.readFileSync(
    path.join(
      repoRoot,
      "src/app/headteacher/my-appraisal/HeadteacherReleasedResultClient.tsx",
    ),
    "utf8",
  );
  for (const forbidden of [
    "$transaction",
    "auditLog",
    "appraisalResponse",
    "participants:",
    "sendSms",
    "sendEmail",
    "appraisalNotification",
    "Promise.all(",
    "appraisalReview.",
  ]) {
    assert(!source.includes(forbidden), `Forbidden write/identity marker: ${forbidden}`);
  }


  for (const marker of [
    'new Intl.DateTimeFormat("en-GH"',
    'timeZone: "Africa/Accra"',
    "Full section scale:",
    "How this percentage was calculated",
    "immutable evidence snapshot",
    "supervisoryAssessment.visit?.arrivalTime",
    "supervisoryAssessment.visit?.staffStrength",
  ]) {
    assert(clientSource.includes(marker), `Released-result client marker missing: ${marker}`);
  }
  assert(
    /supervisoryAssessment\.visit\s*\?\.\s*teachersPresentAtVisit/.test(
      clientSource,
    ),
    "Released-result client marker missing: supervisoryAssessment.visit?.teachersPresentAtVisit",
  );
  assert(
    !clientSource.includes("toLocaleDateString(undefined"),
    "Released-result dates must not depend on server/browser default locale",
  );

  console.log("=== D3.4H1 HEADTEACHER RELEASED-RESULT READ CONTRACT ===");
  console.log("");
  console.log("Audience                         : exact released Headteacher only");
  console.log("Tenant binding                   : actor = cycle target tenant");
  console.log("Lifecycle boundary               : RELEASED only");
  console.log("Release proof copies             : cycle/review exact match");
  console.log("Release proof/request hashes     : recomputed and verified");
  console.log("Release note hash                : verified");
  console.log("Staff snapshot                   : immutable V1 proof-anchored");
  console.log("Supervisory assessment           : calculations/hash recomputed");
  console.log("Version-2 visit particulars      : immutable snapshot projected");
  console.log("Version-1 visit compatibility    : null, never reconstructed");
  console.log("Database read shape              : four sequential reads, no Promise.all");
  console.log("Visible staff evidence           : aggregate overall + four sections");
  console.log("Visible supervisory evidence     : native 4-section / 34-item sheet");
  console.log("Response counts                  : hidden");
  console.log("Staff item averages              : hidden");
  console.log("Supervisory item scores          : verified, included read-only");
  console.log("Respondent identities/forms      : absent");
  console.log("Reviewer/assessor identities     : absent");
  console.log("Comparison direction             : supervisory minus staff");
  console.log("Thresholds/combined score        : absent");
  console.log("Database writes/transaction      : absent");
  console.log("Notifications/providers          : absent");
  console.log("Database accessed                : false");
  console.log("");
  console.log("RESULT: D3.4H1 HEADTEACHER RELEASED RESULT GREEN");
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
