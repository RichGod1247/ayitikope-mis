#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS QA harness intentionally loads TypeScript source through a local transpile hook. */

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const Module = require("module");
const ts = require("typescript");

const repoRoot = path.resolve(__dirname, "..", "..");
const servicePath = path.join(
  repoRoot,
  "src/lib/appraisals/headteacherSupervisoryCorrectionReviewContinuation.ts",
);
const source = fs.readFileSync(servicePath, "utf8");

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

for (const marker of [
  "ensureHeadteacherSupervisoryCorrectionReviewContinuation",
  "HEADTEACHER_SUPERVISORY_HOS_CORRECTION_REVIEW_CONTINUED",
  'reviewType: "HOS_SUPERVISORY_REVIEW"',
  'continuationType: "CORRECTED_ASSESSMENT"',
  "ensureHeadteacherDirectorCorrectionReviewContinuation",
  "preserveReturningReviewer: true",
  "preserveReviewStage: true",
  'decision: "PENDING"',
  "Prisma.TransactionIsolationLevel.Serializable",
  "staffFeedbackIncluded: false",
  "respondentIdentitiesIncluded: false",
  "reviewerMayRewriteScores: false",
  "reviewerMayRewriteVisitEvidence: false",
  "scoreMutationAllowed: false",
  "assessmentMutationAllowed: false",
  "cycleStatusChanges: false",
  "providerCallsAllowed: false",
]) {
  assert(source.includes(marker), `Required B4 marker missing: ${marker}`);
}

for (const forbidden of [
  "sendSms",
  "sendEmail",
  "appraisalAggregateSnapshot",
  "headteacherFeedbackResponse",
  "respondentUserId",
  "localStorage",
  "sessionStorage",
  "setInterval(",
  "appraisalAssessment.update",
  "appraisalAssessmentScore",
]) {
  assert(!source.includes(forbidden), `Forbidden B4 marker found: ${forbidden}`);
}

const WORKFLOW = "HEADTEACHER_APPRAISAL";
const EVIDENCE_STREAM = "GOVERNANCE_SUPERVISORY_ASSESSMENT";
const NOW = new Date("2026-08-12T16:00:00.000Z");
const RETURNED_AT = new Date("2026-08-12T15:00:00.000Z");
const VISIT_HASH = "b".repeat(64);
const SOURCE_HASH = "a".repeat(64);
const CURRENT_HASH = "c".repeat(64);
const DECISION_REQUEST_HASH = "d".repeat(64);
const DECISION_EVIDENCE_HASH = "e".repeat(64);
const REASON = "Please correct the assessment evidence and resubmit.";

function reviewEvidenceHash({ assessment, cycle, reviewerUserId, reviewerAssignmentId }) {
  return hashJson({
    schemaVersion: 1,
    workflow: WORKFLOW,
    evidenceStream: EVIDENCE_STREAM,
    assessment: {
      id: assessment.id,
      cycleId: assessment.cycleId,
      revision: assessment.revision,
      assessmentHash: assessment.assessmentHash,
      visitContextHash: VISIT_HASH,
      assessorUserId: assessment.assessorUserId,
      assessorAssignmentId: assessment.assessorAssignmentId,
    },
    review: {
      stage: 1,
      reviewerUserId,
      reviewerAssignmentId,
      reviewerRole: "HEAD_OF_SUPERVISION",
    },
    jurisdiction: {
      districtZoneId: cycle.scopeZoneId,
      targetTenantId: cycle.targetTenantId,
    },
    staffFeedbackIncluded: false,
    respondentIdentitiesIncluded: false,
    reviewerMayRewriteScores: false,
    scoreMutationAllowed: false,
  });
}

function returnEvidenceHash(sourceAssessment, sourceReview) {
  return hashJson({
    schemaVersion: 1,
    workflow: WORKFLOW,
    assessmentId: sourceAssessment.id,
    assessmentHash: sourceAssessment.assessmentHash,
    review: {
      id: sourceReview.id,
      stage: sourceReview.stage,
      decision: "RETURNED",
      note: sourceReview.note,
      reviewerUserId: sourceReview.reviewerUserId,
      reviewerAssignmentId: sourceReview.reviewerAssignmentId,
      decidedAt: sourceReview.decidedAt.toISOString(),
    },
    reviewerScoreEditsIncluded: false,
  });
}

function makeHosState() {
  const cycle = {
    id: "cycle-001",
    scopeZoneId: "district-001",
    targetTenantId: "tenant-001",
    targetRoleSnapshot: "HEADTEACHER",
    status: "UNDER_REVIEW",
    reviewStartedAt: new Date("2026-08-12T14:00:00.000Z"),
    releasedAt: null,
    cancelledAt: null,
    metadata: { workflow: WORKFLOW },
  };
  const sourceAssessment = {
    id: "assessment-source",
    cycleId: cycle.id,
    status: "SUPERSEDED",
    revision: 1,
    priorAssessmentId: null,
    assessorUserId: "sisso-user",
    assessorAssignmentId: "sisso-assignment",
    assessmentHash: SOURCE_HASH,
    finalizedByUserId: "sisso-user",
    finalizedAt: new Date("2026-08-12T13:00:00.000Z"),
    metadata: { visitContextHash: VISIT_HASH },
  };
  const sourceReview = {
    id: "review-source",
    cycleId: cycle.id,
    assessmentId: sourceAssessment.id,
    reviewerUserId: "hos-user",
    reviewerAssignmentId: "hos-assignment",
    stage: 1,
    decision: "RETURNED",
    note: REASON,
    decidedAt: RETURNED_AT,
    metadata: {},
    createdAt: new Date("2026-08-12T14:00:00.000Z"),
  };
  const sourceReviewEvidenceHash = reviewEvidenceHash({
    assessment: sourceAssessment,
    cycle,
    reviewerUserId: sourceReview.reviewerUserId,
    reviewerAssignmentId: sourceReview.reviewerAssignmentId,
  });
  sourceReview.metadata = {
    schemaVersion: 1,
    workflow: WORKFLOW,
    evidenceStream: EVIDENCE_STREAM,
    reviewType: "HOS_SUPERVISORY_REVIEW",
    reviewStage: 1,
    reviewerRole: "HEAD_OF_SUPERVISION",
    reviewEvidenceHash: sourceReviewEvidenceHash,
    assessmentId: sourceAssessment.id,
    assessmentRevision: sourceAssessment.revision,
    assessmentHash: SOURCE_HASH,
    immutableEvidenceReverified: true,
    decisionSchemaVersion: 1,
    decisionAction: "RETURN",
    decisionRequestHash: DECISION_REQUEST_HASH,
    decisionEvidenceHash: DECISION_EVIDENCE_HASH,
    decidedByRole: "HEAD_OF_SUPERVISION",
    decidedAt: RETURNED_AT.toISOString(),
    reasonHash: hashJson(REASON),
    reasonLength: REASON.length,
    revisionRequired: true,
    nextReviewCreated: false,
    preserveReturningReviewerForCorrection: true,
    reviewerMayRewriteScores: false,
    reviewerMayRewriteVisitEvidence: false,
    scoreMutationPerformed: false,
    visitEvidenceMutationPerformed: false,
    staffFeedbackIncluded: false,
    respondentIdentitiesIncluded: false,
    notificationsSeeded: false,
    providerCalled: false,
  };
  const returnHash = returnEvidenceHash(sourceAssessment, sourceReview);
  sourceAssessment.metadata = {
    ...sourceAssessment.metadata,
    supersededByAssessmentId: "assessment-current",
    returnEvidenceHash: returnHash,
    headteacherSupervisoryReturn: {
      schemaVersion: 1,
      returnReviewId: sourceReview.id,
      returnReviewStage: sourceReview.stage,
      returningReviewerUserId: sourceReview.reviewerUserId,
      returningReviewerAssignmentId: sourceReview.reviewerAssignmentId,
      returningReviewerRole: "HEAD_OF_SUPERVISION",
      returnReviewEvidenceHash: sourceReviewEvidenceHash,
      visitContextHash: VISIT_HASH,
      returnDecisionRequestHash: DECISION_REQUEST_HASH,
      returnDecisionEvidenceHash: DECISION_EVIDENCE_HASH,
      reasonHash: hashJson(REASON),
      reasonLength: REASON.length,
      returnedAt: RETURNED_AT.toISOString(),
      preserveReturningReviewerForCorrection: true,
      reviewerMayRewriteScores: false,
      reviewerMayRewriteVisitEvidence: false,
      scoreMutationPerformed: false,
      visitEvidenceMutationPerformed: false,
      staffFeedbackIncluded: false,
      respondentIdentitiesIncluded: false,
      providerCalled: false,
    },
  };
  cycle.metadata.headteacherSupervisoryReview = {
    schemaVersion: 1,
    state: "RETURNED_FOR_CORRECTION",
    currentReviewId: sourceReview.id,
    currentReviewStage: sourceReview.stage,
    currentReviewerRole: "HEAD_OF_SUPERVISION",
    currentReviewerAssignmentId: sourceReview.reviewerAssignmentId,
    sourceReviewDecision: "RETURNED",
    reviewEvidenceHash: sourceReviewEvidenceHash,
    admittedAssessmentId: sourceAssessment.id,
    admittedAssessmentRevision: sourceAssessment.revision,
    assessmentHash: SOURCE_HASH,
    awaitingRevision: true,
    awaitingDirectorAdmission: false,
    directorReviewCreated: false,
    preserveReturningReviewerForCorrection: true,
    reviewerMayRewriteScores: false,
    scoreMutationAllowed: false,
    staffFeedbackIncluded: false,
    respondentIdentitiesIncluded: false,
    notificationsSeeded: false,
    providerCalled: false,
    decidedAt: RETURNED_AT.toISOString(),
  };
  const currentAssessment = {
    id: "assessment-current",
    cycleId: cycle.id,
    status: "FINALIZED",
    revision: 2,
    priorAssessmentId: sourceAssessment.id,
    assessorUserId: sourceAssessment.assessorUserId,
    assessorAssignmentId: sourceAssessment.assessorAssignmentId,
    assessmentHash: CURRENT_HASH,
    finalizedByUserId: sourceAssessment.assessorUserId,
    finalizedAt: NOW,
    metadata: {
      workflow: WORKFLOW,
      evidenceStream: EVIDENCE_STREAM,
      sourceAssessmentId: sourceAssessment.id,
      sourceAssessmentHash: SOURCE_HASH,
      returnReviewId: sourceReview.id,
      returnReviewStage: sourceReview.stage,
      returnEvidenceHash: returnHash,
      returnReason: REASON,
      visitContextHash: VISIT_HASH,
      preserveVisitContext: true,
      reviewerMayRewriteScores: false,
    },
  };
  const assignment = {
    id: "hos-assignment",
    userId: "hos-user",
    role: "HEAD_OF_SUPERVISION",
    status: "ACTIVE",
    revokedAt: null,
    startsAt: null,
    endsAt: null,
    zoneId: cycle.scopeZoneId,
    zone: {
      id: cycle.scopeZoneId,
      isActive: true,
      zoneType: { level: 2 },
    },
  };
  return {
    cycle,
    assessments: [sourceAssessment, currentAssessment],
    reviews: [sourceReview],
    assignments: [assignment],
    audits: [],
    transactionOptions: [],
  };
}

function cloneValue(value) {
  if (value instanceof Date) return new Date(value);
  if (Array.isArray(value)) return value.map(cloneValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [key, cloneValue(nested)]),
  );
}

class FakeDatabase {
  constructor(state) {
    this.state = state;
    this.appraisalAssessment = {
      findUnique: async ({ where }) =>
        this.state.assessments.find((row) => row.id === where.id) ?? null,
    };
    this.appraisalCycle = {
      findUnique: async ({ where }) =>
        this.state.cycle.id === where.id ? this.state.cycle : null,
    };
    this.appraisalReview = {
      findMany: async ({ where }) =>
        this.state.reviews
          .filter((row) => row.assessmentId === where.assessmentId)
          .sort((a, b) => a.stage - b.stage || a.createdAt - b.createdAt),
    };
  }

  async $transaction(operation, options) {
    this.state.transactionOptions.push(options);
    const tx = {
      appraisalAssessment: {
        findUnique: this.appraisalAssessment.findUnique,
      },
      appraisalCycle: {
        findUnique: this.appraisalCycle.findUnique,
        updateMany: async ({ where, data }) => {
          if (
            this.state.cycle.id !== where.id ||
            this.state.cycle.status !== where.status ||
            this.state.cycle.releasedAt !== null ||
            this.state.cycle.cancelledAt !== null
          ) {
            return { count: 0 };
          }
          this.state.cycle.metadata = cloneValue(data.metadata);
          return { count: 1 };
        },
      },
      appraisalReview: {
        findUnique: async ({ where }) =>
          this.state.reviews.find((row) => row.id === where.id) ?? null,
        findMany: this.appraisalReview.findMany,
        create: async ({ data }) => {
          if (
            this.state.reviews.some(
              (row) =>
                row.assessmentId === data.assessmentId && row.stage === data.stage,
            )
          ) {
            const error = new Error("unique");
            error.code = "P2002";
            throw error;
          }
          const created = {
            id: "review-current",
            cycleId: data.cycleId,
            assessmentId: data.assessmentId,
            reviewerUserId: data.reviewerUserId,
            reviewerAssignmentId: data.reviewerAssignmentId,
            stage: data.stage,
            decision: data.decision,
            note: data.note,
            decidedAt: data.decidedAt,
            metadata: cloneValue(data.metadata),
            createdAt: NOW,
          };
          this.state.reviews.push(created);
          return created;
        },
      },
      governanceOfficerAssignment: {
        findMany: async () => this.state.assignments,
      },
      auditLog: {
        create: async ({ data }) => {
          this.state.audits.push(cloneValue(data));
          return data;
        },
      },
    };
    return operation(tx);
  }
}

function viewFor(state) {
  const current = state.assessments.find((row) => row.id === "assessment-current");
  return {
    assessmentId: current.id,
    cycleId: current.cycleId,
    revision: current.revision,
    status: "FINALIZED",
    assessorUserId: current.assessorUserId,
    assessorAssignmentId: current.assessorAssignmentId,
    visitContextHash: VISIT_HASH,
    assessmentHash: CURRENT_HASH,
  };
}

function makeInput(state, overrides = {}) {
  return {
    actorUserId: "sisso-user",
    actorRoleName: "SISSO",
    assessmentId: "assessment-current",
    reqId: "req-b4-001",
    now: NOW,
    database: new FakeDatabase(state),
    dependencies: {
      loadAssessment: async () => viewFor(state),
      ensureDirectorContinuation: async () => {
        throw new Error("Director continuation must not run for HOS return");
      },
    },
    ...overrides,
  };
}

const originalLoader = Module._load;
const originalTsExtension = Module._extensions[".ts"];

Module._extensions[".ts"] = function transpile(moduleInstance, filename) {
  const input = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(input, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  moduleInstance._compile(output.outputText, filename);
};

Module._load = function load(request, parent, isMain) {
  if (request === "@prisma/client") {
    return { Prisma: { TransactionIsolationLevel: { Serializable: "Serializable" } } };
  }
  if (request === "@/lib/prisma") return { prisma: {} };
  if (request === "@/lib/appraisals/headteacherDirectorReview") {
    return {
      ensureHeadteacherDirectorCorrectionReviewContinuation: async () => {
        throw new Error("default Director continuation not expected in QA");
      },
    };
  }
  if (request === "@/lib/appraisals/headteacherSupervisoryAssessment") {
    return {
      HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY: {
        workflow: WORKFLOW,
        districtZoneLevel: 2,
      },
    };
  }
  if (request === "@/lib/appraisals/headteacherSupervisoryAssessmentRevision") {
    return {
      HEADTEACHER_SUPERVISORY_REVISION_POLICY: {
        revisionEvidenceSchemaVersion: 1,
      },
    };
  }
  if (request === "@/lib/appraisals/headteacherSupervisoryAssessmentScoring") {
    return { loadHeadteacherSupervisoryAssessment: async () => ({}) };
  }
  if (request === "@/lib/appraisals/headteacherSupervisoryReviewAdmission") {
    return {
      HEADTEACHER_SUPERVISORY_HOS_REVIEW_START_POLICY: {
        schemaVersion: 1,
        workflow: WORKFLOW,
        evidenceStream: EVIDENCE_STREAM,
        reviewStage: 1,
      },
    };
  }
  if (request === "@/lib/appraisals/headteacherSupervisoryReviewDecision") {
    return {
      HEADTEACHER_SUPERVISORY_HOS_DECISION_POLICY: {
        requiredReviewStage: 1,
        returnReviewDecision: "RETURNED",
      },
    };
  }
  return originalLoader.call(this, request, parent, isMain);
};

async function expectCode(operation, code) {
  let caught = null;
  try {
    await operation();
  } catch (error) {
    caught = error;
  }
  assert(caught, `Expected failure ${code}`);
  assert.strictEqual(caught.code || caught.message, code);
}

(async () => {
  try {
    const moduleUnderTest = require(servicePath);
    const {
      ensureHeadteacherSupervisoryCorrectionReviewContinuation,
      HEADTEACHER_SUPERVISORY_CORRECTION_CONTINUATION_POLICY,
    } = moduleUnderTest;

    assert.strictEqual(
      HEADTEACHER_SUPERVISORY_CORRECTION_CONTINUATION_POLICY.hosReviewerRole,
      "HEAD_OF_SUPERVISION",
    );
    assert.strictEqual(
      HEADTEACHER_SUPERVISORY_CORRECTION_CONTINUATION_POLICY.directorContinuationDelegated,
      true,
    );

    const state = makeHosState();
    const created = await ensureHeadteacherSupervisoryCorrectionReviewContinuation(
      makeInput(state),
    );
    assert.strictEqual(created.outcome, "CREATED");
    assert.strictEqual(created.continuationReviewerRole, "HEAD_OF_SUPERVISION");
    assert.strictEqual(created.reviewStage, 1);
    assert.strictEqual(created.reviewDecision, "PENDING");
    assert.strictEqual(created.reviewerUserId, "hos-user");
    assert.strictEqual(created.reviewerAssignmentId, "hos-assignment");
    assert.strictEqual(created.scoreMutationPerformed, false);
    assert.strictEqual(created.visitEvidenceMutationPerformed, false);
    assert.strictEqual(created.staffFeedbackIncluded, false);
    assert.strictEqual(state.reviews.length, 2);
    assert.strictEqual(state.audits.length, 1);
    assert.strictEqual(state.assessments[1].status, "FINALIZED");
    assert.strictEqual(
      state.cycle.metadata.headteacherSupervisoryReview.state,
      "HOS_REVIEW_PENDING",
    );
    assert.strictEqual(
      state.cycle.metadata.headteacherSupervisoryReview.currentReviewId,
      "review-current",
    );
    assert.strictEqual(
      state.cycle.metadata.headteacherSupervisoryReview.awaitingRevision,
      false,
    );
    assert.strictEqual(
      state.cycle.metadata.headteacherSupervisoryReview.awaitingDirectorAdmission,
      false,
    );
    assert.strictEqual(
      state.audits[0].metadata.reasonTextRecordedInAudit,
      false,
    );
    assert(!JSON.stringify(state.audits[0]).includes(REASON));
    assert.strictEqual(
      state.transactionOptions[0].isolationLevel,
      "Serializable",
    );

    const retried = await ensureHeadteacherSupervisoryCorrectionReviewContinuation(
      makeInput(state),
    );
    assert.strictEqual(retried.outcome, "EXISTING_REVIEW");
    assert.strictEqual(state.reviews.length, 2);
    assert.strictEqual(state.audits.length, 1);

    const ordinaryState = makeHosState();
    ordinaryState.assessments = [
      {
        ...ordinaryState.assessments[1],
        id: "assessment-ordinary",
        revision: 1,
        priorAssessmentId: null,
        metadata: { visitContextHash: VISIT_HASH },
      },
    ];
    let ordinaryLoadCalled = false;
    const ordinary = await ensureHeadteacherSupervisoryCorrectionReviewContinuation({
      actorUserId: "sisso-user",
      actorRoleName: "SISSO",
      assessmentId: "assessment-ordinary",
      reqId: "req-b4-ordinary",
      now: NOW,
      database: new FakeDatabase(ordinaryState),
      dependencies: {
        loadAssessment: async () => {
          ordinaryLoadCalled = true;
          throw new Error("ordinary finalization must not load correction evidence");
        },
        ensureDirectorContinuation: async () => {
          throw new Error("ordinary finalization must not delegate");
        },
      },
    });
    assert.strictEqual(ordinary.outcome, "NOT_REQUIRED");
    assert.strictEqual(ordinary.continuationRequired, false);
    assert.strictEqual(ordinaryLoadCalled, false);

    const revokedState = makeHosState();
    revokedState.assignments[0].revokedAt = new Date("2026-08-12T15:30:00.000Z");
    await expectCode(
      () =>
        ensureHeadteacherSupervisoryCorrectionReviewContinuation(
          makeInput(revokedState),
        ),
      "HEADTEACHER_SUPERVISORY_CORRECTION_CONTINUATION_HOS_ASSIGNMENT_REQUIRED",
    );

    const ambiguousState = makeHosState();
    ambiguousState.assessments[0].metadata.returnedByDirectorReviewId =
      ambiguousState.reviews[0].id;
    ambiguousState.assessments[0].metadata.returnedByDirectorReviewStage = 1;
    await expectCode(
      () =>
        ensureHeadteacherSupervisoryCorrectionReviewContinuation(
          makeInput(ambiguousState),
        ),
      "HEADTEACHER_SUPERVISORY_CORRECTION_CONTINUATION_AMBIGUOUS_RETURN_PROVENANCE",
    );

    const directorState = makeHosState();
    delete directorState.assessments[0].metadata.headteacherSupervisoryReturn;
    directorState.assessments[0].metadata.returnedByDirectorReviewId =
      directorState.reviews[0].id;
    directorState.assessments[0].metadata.returnedByDirectorReviewStage = 1;
    let directorCalls = 0;
    const directorResult = await ensureHeadteacherSupervisoryCorrectionReviewContinuation(
      makeInput(directorState, {
        dependencies: {
          loadAssessment: async () => viewFor(directorState),
          ensureDirectorContinuation: async () => {
            directorCalls += 1;
            return {
              outcome: "CREATED",
              continuationRequired: true,
              cycleId: directorState.cycle.id,
              assessmentId: "assessment-current",
              assessmentRevision: 2,
              assessmentStatus: "FINALIZED",
              sourceAssessmentId: "assessment-source",
              sourceReviewId: "review-source",
              sourceReviewStage: 1,
              reviewId: "director-review-current",
              reviewStage: 1,
              reviewDecision: "PENDING",
              reviewerUserId: "director-user",
              reviewerAssignmentId: "director-assignment",
              reviewEvidenceHash: "f".repeat(64),
              reviewCreated: true,
              scoreMutationPerformed: false,
              providerCalled: false,
            };
          },
        },
      }),
    );
    assert.strictEqual(directorCalls, 1);
    assert.strictEqual(directorResult.continuationReviewerRole, "DISTRICT_DIRECTOR");
    assert.strictEqual(directorResult.staffFeedbackIncluded, true);
    assert.strictEqual(directorState.reviews.length, 1);
    assert.strictEqual(directorState.audits.length, 0);

    console.log("");
    console.log("=== N6-F1C6B4 HEADTEACHER CORRECTION CONTINUATION ===");
    console.log("");
    console.log("Ordinary finalization           : no continuation");
    console.log("HOS-return correction           : same HOS reviewer + assignment + stage");
    console.log("HOS continued decision          : PENDING");
    console.log("Cycle status                    : remains UNDER_REVIEW");
    console.log("Corrected assessment            : remains FINALIZED and immutable");
    console.log("Director-return correction      : delegated to existing Director bridge");
    console.log("Ambiguous return provenance     : fail closed");
    console.log("Returning HOS assignment        : revalidated active in exact district");
    console.log("Staff feedback in HOS branch    : absent");
    console.log("Respondent identities           : absent");
    console.log("Score / visit evidence mutation : absent");
    console.log("Audit reason text               : absent");
    console.log("Retry                           : idempotent existing review");
    console.log("Transaction                     : SERIALIZABLE + bounded");
    console.log("Providers                       : absent");
    console.log("Database accessed               : fake only");
    console.log("");
    console.log("RESULT: N6-F1C6B4 HEADTEACHER CORRECTION CONTINUATION GREEN");
  } finally {
    Module._load = originalLoader;
    if (originalTsExtension) Module._extensions[".ts"] = originalTsExtension;
    else delete Module._extensions[".ts"];
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
