/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS QA harness intentionally validates a TypeScript service with isolated mocks. */
const fs = require("fs");
const path = require("path");
const Module = require("module");
const ts = require("typescript");

function fail(message, details) {
  console.error(message);
  if (details !== undefined) console.error(details);
  process.exit(1);
}

function assert(value, message, details) {
  if (!value) fail(message, details);
}

function equal(actual, expected, message) {
  if (actual !== expected) fail(message, { expected, actual });
}

function read(relativePath) {
  const absolutePath = path.join(process.cwd(), relativePath);
  if (!fs.existsSync(absolutePath)) fail(`Missing required file: ${relativePath}`);
  return fs.readFileSync(absolutePath, "utf8").replace(/\r\n/g, "\n");
}

function contains(source, marker, label) {
  if (!source.includes(marker)) fail(`Missing ${label}`, marker);
}

function excludes(source, marker, label) {
  if (source.includes(marker)) fail(`Forbidden ${label}`, marker);
}

function transpile(source, fileName) {
  const output = ts.transpileModule(source, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      strict: true,
    },
    fileName,
    reportDiagnostics: true,
  });
  const errors = (output.diagnostics || []).filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
  );
  if (errors.length) {
    fail(`TypeScript syntax failed: ${fileName}`, errors.map((error) => error.messageText));
  }
  return output.outputText;
}

function clone(value) {
  return value == null ? value : structuredClone(value);
}

async function serviceLifecycleProof(servicePath) {
  const absoluteServicePath = path.join(process.cwd(), servicePath);
  const originalLoader = Module._extensions[".ts"];
  const originalLoad = Module._load;

  const mocks = {
    "@prisma/client": {
      Prisma: {
        TransactionIsolationLevel: { Serializable: "Serializable" },
      },
    },
    "@/lib/prisma": { prisma: {} },
    "@/lib/appraisals/authority": {
      assertAppraisalAuthority() {},
    },
    "@/lib/appraisals/headteacherFeedback": {
      HEADTEACHER_FEEDBACK_POLICY: {
        workflow: "HEADTEACHER_CONFIDENTIAL_STAFF_FEEDBACK",
      },
      assertHeadteacherFeedbackTargetInGovernanceScope({
        governanceScope,
        targetTenantId,
      }) {
        if (
          !governanceScope?.isSuperAdmin &&
          !governanceScope?.tenantIds?.includes(targetTenantId)
        ) {
          throw new Error("SCOPE_FORBIDDEN");
        }
      },
    },
    "@/lib/appraisals/headteacherDirectorReview": {
      HEADTEACHER_DIRECTOR_REVIEW_POLICY: {
        requiredCapability: "REVIEW_HEADTEACHER_APPRAISAL",
      },
    },
    "@/lib/roleRouting": {
      effectiveRole(value) {
        return String(value || "").trim().toUpperCase();
      },
    },
  };

  Module._load = function patchedLoad(request, parent, isMain) {
    if (Object.prototype.hasOwnProperty.call(mocks, request)) return mocks[request];
    return originalLoad.call(this, request, parent, isMain);
  };

  Module._extensions[".ts"] = function compileTs(module, filename) {
    const source = fs.readFileSync(filename, "utf8");
    module._compile(transpile(source, filename), filename);
  };

  delete require.cache[absoluteServicePath];
  const service = require(absoluteServicePath);

  const cycleId = "00000000-0000-4000-8000-000000000901";
  const snapshotId = "00000000-0000-4000-8000-000000000902";
  const reviewerUserId = "director-user";
  const reviewerAssignmentId = "director-assignment";
  const tenantId = "school-one";
  const now1 = new Date("2026-08-18T16:00:00.000Z");
  const now2 = new Date("2026-08-18T16:05:00.000Z");
  const now3 = new Date("2026-08-18T16:10:00.000Z");
  const now4 = new Date("2026-08-18T16:15:00.000Z");
  const now5 = new Date("2026-08-18T16:20:00.000Z");

  const cycle = {
    id: cycleId,
    scopeZoneId: "district-zone",
    targetUserId: "headteacher-user",
    targetTenantId: tenantId,
    targetRoleSnapshot: "HEADTEACHER",
    targetNameSnapshot: "Headteacher One",
    targetSchoolNameSnapshot: "School One",
    targetZoneNameSnapshot: "Circuit One",
    status: "CLOSED",
    closedAt: new Date("2026-08-18T15:00:00.000Z"),
    cancelledAt: null,
    metadata: { workflow: "HEADTEACHER_CONFIDENTIAL_STAFF_FEEDBACK" },
  };
  const membership = {
    id: "headteacher-membership",
    userId: "headteacher-user",
    tenantId,
    status: "ACTIVE",
    role: { name: "HEADTEACHER" },
    tenant: { id: tenantId, status: "ACTIVE" },
  };
  const assignment = {
    id: reviewerAssignmentId,
    userId: reviewerUserId,
    role: "DISTRICT_DIRECTOR",
    status: "ACTIVE",
    revokedAt: null,
    startsAt: new Date("2026-01-01T00:00:00.000Z"),
    endsAt: null,
    zoneId: "district-zone",
    zone: {
      id: "district-zone",
      isActive: true,
      zoneType: { level: 2, countryCode: "GH" },
    },
  };
  const snapshot = {
    id: snapshotId,
    cycleId,
    version: 1,
    eligibleResponses: 8,
    finalizedResponses: 8,
    expiredResponses: 0,
    minimumResponses: 1,
    releaseEligible: true,
    overallPercentage: 84.5,
    sectionAveragesJson: {
      leadership: {
        sectionKey: "LEADERSHIP",
        sectionTitle: "Leadership",
        sectionOrder: 1,
        sectionMaxScore: 55,
        averagePercentage: 86,
      },
      teaching: {
        sectionKey: "TEACHING",
        sectionTitle: "Teaching and learning",
        sectionOrder: 2,
        sectionMaxScore: 45,
        averagePercentage: 84,
      },
      management: {
        sectionKey: "MANAGEMENT",
        sectionTitle: "School management",
        sectionOrder: 3,
        sectionMaxScore: 40,
        averagePercentage: 83,
      },
      community: {
        sectionKey: "COMMUNITY",
        sectionTitle: "Community engagement",
        sectionOrder: 4,
        sectionMaxScore: 30,
        averagePercentage: 85,
      },
    },
    itemAveragesJson: {},
    generatedByUserId: null,
    sourceHash: "a".repeat(64),
    generatedAt: new Date("2026-08-18T15:01:00.000Z"),
    metadata: {
      workflow: "HEADTEACHER_CONFIDENTIAL_STAFF_FEEDBACK",
      aggregateSchemaVersion: 1,
      readiness: "READY",
      privacy: {
        respondentIdentitiesIncluded: false,
        individualScoresIncluded: false,
        responseHashesIncluded: false,
        submissionTimestampsIncluded: false,
        participantListIncluded: false,
      },
      sourceIntegrity: {
        finalizedResponsesOnly: true,
        finalizedResponseHashesVerified: true,
        storedCalculationsRecomputed: true,
        immutableSnapshotVersion: 1,
      },
    },
  };

  const state = {
    reviews: [],
    audits: [],
    cycleUpdateCalls: 0,
    assessmentAccessCalls: 0,
    nextReviewNumber: 1,
  };

  const reviewDelegate = {
    async findUnique(args) {
      return clone(state.reviews.find((row) => row.id === args?.where?.id) || null);
    },
    async findMany() {
      return clone([...state.reviews].sort((a, b) => a.stage - b.stage));
    },
    async create(args) {
      const row = {
        id: `00000000-0000-4000-8000-${String(state.nextReviewNumber++).padStart(12, "0")}`,
        ...clone(args.data),
        createdAt: new Date("2026-08-18T16:00:00.000Z"),
      };
      state.reviews.push(row);
      return clone(row);
    },
    async updateMany(args) {
      const row = state.reviews.find(
        (candidate) =>
          candidate.id === args?.where?.id &&
          candidate.decision === args?.where?.decision &&
          candidate.decidedAt === args?.where?.decidedAt,
      );
      if (!row) return { count: 0 };
      Object.assign(row, clone(args.data));
      return { count: 1 };
    },
  };

  const tx = {
    appraisalCycle: {
      async findUnique() {
        return clone(cycle);
      },
    },
    membership: {
      async findFirst() {
        return clone(membership);
      },
    },
    governanceOfficerAssignment: {
      async findMany() {
        return clone([assignment]);
      },
    },
    appraisalAggregateSnapshot: {
      async findMany() {
        return clone([snapshot]);
      },
    },
    appraisalStaffFeedbackReview: reviewDelegate,
    auditLog: {
      async create(args) {
        state.audits.push(clone(args.data));
        return clone(args.data);
      },
    },
  };

  const database = {
    ...tx,
    async $transaction(operation, options) {
      equal(options?.isolationLevel, "Serializable", "Staff review uses Serializable isolation");
      return operation(tx);
    },
  };

  const base = {
    actorUserId: reviewerUserId,
    actorRoleName: "DISTRICT_DIRECTOR",
    cycleId,
    governanceScope: { isSuperAdmin: false, tenantIds: [tenantId] },
    confirm: true,
    reqId: "qa-independent-staff-review",
    database,
  };

  const started = await service.startHeadteacherStaffFeedbackReview({ ...base, now: now1 });
  equal(started.outcome, "STARTED", "Independent Staff Feedback review starts");
  equal(started.stage, 1, "First independent Staff Feedback review stage");
  equal(started.state.canDecide, true, "Started Staff Feedback review can decide");
  equal(state.reviews.length, 1, "Exactly one Staff Feedback review row created");

  const held = await service.executeHeadteacherStaffFeedbackReviewDecision({
    ...base,
    now: now2,
    reviewId: started.reviewId,
    decision: "HOLD",
    note: "Hold for a second institutional reading.",
  });
  equal(held.outcome, "HELD", "Staff Feedback HOLD recorded");
  equal(held.nextReviewStage, 2, "HOLD creates exactly one next review stage");
  equal(state.reviews.length, 2, "Exactly two stages after HOLD");
  equal(state.reviews[0].decision, "HELD", "Prior review is HELD");
  equal(state.reviews[1].decision, "PENDING", "Next review is PENDING");

  const returned = await service.executeHeadteacherStaffFeedbackReviewDecision({
    ...base,
    now: now3,
    reviewId: held.nextReviewId,
    decision: "RETURN",
    note: "Return this review to the queue for reconsideration.",
  });
  equal(returned.outcome, "RETURNED", "Staff Feedback RETURN recorded");
  equal(returned.nextReviewId, null, "RETURN does not create or reopen response forms");
  equal(state.reviews[1].decision, "RETURNED", "Second review returned to queue");

  const restarted = await service.startHeadteacherStaffFeedbackReview({ ...base, now: now4 });
  equal(restarted.outcome, "STARTED", "Returned Staff Feedback can start a new review stage");
  equal(restarted.stage, 3, "Returned Staff Feedback continues at next stage");
  equal(state.reviews.length, 3, "Third independent Staff Feedback review stage created");

  const released = await service.executeHeadteacherStaffFeedbackReviewDecision({
    ...base,
    now: now5,
    reviewId: restarted.reviewId,
    decision: "RELEASE",
    note: "Evidence reviewed and released.",
  });
  equal(released.outcome, "RELEASED", "Staff Feedback RELEASE recorded");
  equal(released.sourceReviewDecision, "ACCEPTED", "Released review becomes ACCEPTED");
  assert(/^[a-f0-9]{64}$/.test(released.releaseProofHash || ""), "Release proof hash created");
  equal(released.carrierCycleStatusMutationPerformed, false, "Carrier cycle is not mutated");
  equal(released.governanceAssessmentRequired, false, "Governance assessment not required");
  equal(released.governanceAssessmentAccessed, false, "Governance assessment not accessed");
  equal(state.cycleUpdateCalls, 0, "No carrier cycle update calls exist");
  equal(state.assessmentAccessCalls, 0, "No governance assessment access exists");
  equal(state.reviews[2].decision, "ACCEPTED", "Final independent review accepted");
  assert(
    state.reviews[2].metadata?.staffFeedbackRelease?.releaseMode ===
      "INDEPENDENT_STAFF_FEEDBACK_RELEASE",
    "Independent release proof stored on Staff Feedback review",
  );
  assert(
    state.audits.some((row) => row.action === "HEADTEACHER_STAFF_FEEDBACK_RELEASED"),
    "Independent release audit written",
  );

  const releasedResultServicePath = path.join(
    process.cwd(),
    "src/lib/appraisals/headteacherStaffFeedbackReleasedResult.ts",
  );
  delete require.cache[releasedResultServicePath];
  const releasedResultService = require(releasedResultServicePath);
  const releasedResult = await releasedResultService.readHeadteacherStaffFeedbackReleasedResult({
    actorUserId: "headteacher-user",
    actorRoleName: "HEADTEACHER",
    actorTenantId: tenantId,
    cycleId,
    database: {
      membership: {
        async findFirst() {
          return clone(membership);
        },
      },
      appraisalCycle: {
        async findUnique() {
          return clone(cycle);
        },
      },
      appraisalAggregateSnapshot: {
        async findUnique() {
          return clone(snapshot);
        },
      },
      appraisalStaffFeedbackReview: {
        async findMany() {
          return clone([...state.reviews].sort((a, b) => a.stage - b.stage));
        },
      },
    },
  });
  equal(
    releasedResult.audience,
    "RELEASED_HEADTEACHER_STAFF_FEEDBACK",
    "Headteacher reads independent Staff Feedback release",
  );
  equal(
    releasedResult.staffFeedback.overallPercentage,
    84.5,
    "Released Staff Feedback aggregate preserved",
  );
  equal(
    releasedResult.staffFeedback.sections.length,
    4,
    "Released Staff Feedback exposes four aggregate sections",
  );
  equal(
    releasedResult.privacy.governanceAssessmentIncluded,
    false,
    "Released Staff Feedback excludes Governance Appraisal evidence",
  );
  equal(
    releasedResult.integrity.releaseProofHashVerified,
    true,
    "Independent release proof verifies end-to-end",
  );

  Module._extensions[".ts"] = originalLoader;
  Module._load = originalLoad;
}

async function main() {
  const servicePath = "src/lib/appraisals/headteacherStaffFeedbackReview.ts";
  const notificationsPath =
    "src/lib/appraisals/headteacherStaffFeedbackReleaseNotifications.ts";
  const resultPath =
    "src/lib/appraisals/headteacherStaffFeedbackReleasedResult.ts";
  const readinessPath =
    "src/lib/appraisals/headteacherFeedbackAggregateReadiness.ts";
  const readStatePath = "src/lib/appraisals/headteacherFeedbackReadStates.ts";
  const directorClientPath =
    "src/app/district/headteacher-appraisals/review/HeadteacherDirectorReviewClient.tsx";
  const headteacherClientPath =
    "src/app/headteacher/my-appraisal/HeadteacherReleasedResultClient.tsx";
  const schemaPath = "prisma/schema.prisma";
  const migrationPath =
    "prisma/migrations/20260818164000_headteacher_staff_feedback_independent_review/migration.sql";

  const service = read(servicePath);
  const notifications = read(notificationsPath);
  const result = read(resultPath);
  const readiness = read(readinessPath);
  const readState = read(readStatePath);
  const directorClient = read(directorClientPath);
  const headteacherClient = read(headteacherClientPath);
  const schema = read(schemaPath);
  const migration = read(migrationPath);

  for (const [file, source] of [
    [servicePath, service],
    [notificationsPath, notifications],
    [resultPath, result],
    [readinessPath, readiness],
    [readStatePath, readState],
    [directorClientPath, directorClient],
    [headteacherClientPath, headteacherClient],
  ]) {
    transpile(source, file);
  }

  contains(schema, "model AppraisalStaffFeedbackReview", "dedicated Staff Feedback review model");
  contains(schema, "assessmentId String @db.Uuid", "legacy AppraisalReview assessment authority preserved");
  contains(schema, "staffFeedbackReviews AppraisalStaffFeedbackReview[]", "Staff Feedback review cycle relation");
  excludes(migration, "ALTER TABLE \"appraisal_review\"", "legacy governance review schema mutation");
  contains(
    migration,
    'CREATE TABLE "edulife_os"."appraisal_staff_feedback_review"',
    "independent review migration",
  );
  contains(migration, '"snapshotId" UUID NOT NULL', "snapshot-anchored independent review");

  contains(service, "governanceAssessmentRequired: false", "governance-free Staff Feedback review policy");
  contains(service, "carrierCycleStatusMutationPerformed: false", "carrier cycle remains independent");
  excludes(service, "appraisalAssessment", "governance assessment database access");
  excludes(service, "appraisalCycle.update", "carrier cycle status mutation");
  contains(service, 'returnMeaning: "RETURN_REVIEW_TO_QUEUE"', "safe RETURN semantics");
  contains(service, "returnReopensParticipantForms: false", "finalized forms never reopened");

  contains(
    readiness,
    'participant.status !== "REVOKED"',
    "aggregate readiness excludes REVOKED respondents",
  );
  contains(readState, "canViewReleasedStaffFeedback", "Headteacher independent release visibility");
  contains(readState, "canDecideStaffFeedbackReview", "Director independent decision state");

  contains(directorClient, 'id="staff-evidence-review"', "Staff evidence scroll target");
  contains(directorClient, '.getElementById("staff-evidence-review")', "Review staff feedback auto-scroll");
  excludes(directorClient, "Staff evidence review only", "noisy staff-only card removed");
  contains(directorClient, "Show Governance Appraisals", "collapsed governance reveal button");
  contains(directorClient, "/staff-review/start", "independent Staff Feedback review start route");
  contains(directorClient, "/staff-review/decision", "independent Staff Feedback decision route");
  contains(
    directorClient,
    'aria-label="Staff Feedback decision controls"',
    "Staff Feedback decisions live under the opened respondent form",
  );
  contains(
    directorClient,
    "showDecisionButtons={",
    "Staff Feedback decisions remain hidden before respondent form preview",
  );
  excludes(
    directorClient,
    "No Governance Appraisal is required.",
    "standalone Staff Feedback decision explanation removed",
  );
  excludes(
    directorClient,
    "Staff Feedback review · stage {props.reviewState.latestStage",
    "standalone Staff Feedback stage card removed",
  );

  contains(
    headteacherClient,
    "/released-staff-feedback",
    "Headteacher independent Staff Feedback result endpoint",
  );
  contains(
    headteacherClient,
    "It does not wait for a Governance Appraisal.",
    "Headteacher BBC independent release guidance",
  );
  contains(result, "governanceAssessmentIncluded: false", "released Staff Feedback excludes governance evidence");
  contains(result, "releaseProofHashVerified: true", "released Staff Feedback proof verification");
  contains(notifications, "providerCallsAllowed: false", "release notification seeding does not call providers");

  await serviceLifecycleProof(servicePath);

  console.log("\n=== N7 STAFF FEEDBACK INDEPENDENT REVIEW + BBC CLEANUP ===\n");
  console.log("Dedicated review spine          : AppraisalStaffFeedbackReview");
  console.log("Governance Appraisal dependency : NONE");
  console.log("Carrier cycle status mutation   : NONE");
  console.log("RETURN semantics                : review queue only; forms stay locked");
  console.log("HOLD semantics                  : exactly one next review stage");
  console.log("RELEASE semantics               : staff aggregate only");
  console.log("Release proof                   : immutable SHA-256 anchored");
  console.log("Headteacher result              : independently readable");
  console.log("Revoked eligibility             : excluded from aggregate readiness");
  console.log("Review staff feedback           : auto-scrolls to anonymous evidence");
  console.log("Noisy staff-only card           : REMOVED");
  console.log("Governance empty/non-actionable : COLLAPSED by default");
  console.log("Respondent identities           : NOT EXPOSED");
  console.log("Combined score                  : NOT CREATED");
  console.log("Provider calls                  : NONE in service decision path");
  console.log("RESULT: N7 STAFF FEEDBACK INDEPENDENT REVIEW GREEN");
}

main().catch((error) => fail("N7 STAFF FEEDBACK INDEPENDENT REVIEW FAILED", error));
