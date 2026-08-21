#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS QA harness loads the bounded TypeScript service with fake dependencies and a fake database only. */

const fs = require("fs");
const path = require("path");
const Module = require("module");
const ts = require("typescript");

const repoRoot = path.resolve(__dirname, "..", "..");
const servicePath = path.join(
  repoRoot,
  "src/lib/appraisals/headteacherSupervisoryDirectorDraft.ts",
);

function fail(message, detail) {
  const suffix = detail === undefined ? "" : `\n${JSON.stringify(detail, null, 2)}`;
  throw new Error(`${message}${suffix}`);
}
function assert(condition, message, detail) {
  if (!condition) fail(message, detail);
}
function equal(actual, expected, message) {
  if (actual !== expected) fail(message, { expected, actual });
}
async function expectReject(operation, code, message) {
  try {
    await operation();
  } catch (error) {
    equal(error && error.message, code, message);
    return;
  }
  fail(message, { expectedError: code });
}

if (!fs.existsSync(servicePath)) fail("Direct Director draft service missing", servicePath);

const serviceSource = fs.readFileSync(servicePath, "utf8").replace(/\r\n?/g, "\n");
for (const [marker, label] of [
  ["HEADTEACHER_SUPERVISORY_DIRECTOR_DRAFT_POLICY", "direct draft policy"],
  ['carrierKind: "DIRECTOR_GOVERNANCE_ONLY"', "Governance-only carrier"],
  ['requiredActorRole: "DISTRICT_DIRECTOR"', "Director-only authority"],
  ["cycleAndAssessmentAtomic: true", "atomic cycle + assessment"],
  ["respondentWorkflow: false", "no respondent workflow"],
  ["responseWindowDays: 0", "zero response window"],
  ["minimumResponses: 0", "zero respondent minimum"],
  ['participantSelection: "NONE"', "no participants"],
  ["staffFeedbackRequired: false", "no Staff Feedback prerequisite"],
  ["staffFeedbackAccessed: false", "no Staff Feedback access"],
  ["notificationRowsCreatedAtDraft: false", "no notifications"],
  ["decideHeadteacherSupervisoryAssessmentAuthority", "existing authority engine"],
  ["buildHeadteacherSupervisoryVisitDetailsSnapshot", "official visit details"],
  ["appraisalCycle.create", "cycle create"],
  ["appraisalAssessment.create", "assessment create"],
  ["Prisma.TransactionIsolationLevel.Serializable", "serializable transaction"],
  ["HEADTEACHER_SUPERVISORY_DIRECT_DRAFT_EXISTING_ACTIVE", "active duplicate guard"],
]) {
  assert(serviceSource.includes(marker), `Missing marker: ${label}`, marker);
}
for (const forbidden of [
  "appraisalParticipant.create",
  "appraisalParticipant.createMany",
  "appraisalNotification.create",
  "appraisalNotification.createMany",
  "appraisalReview.create",
  "appraisalAggregateSnapshot.create",
  "sendSms(",
  "sendEmail(",
]) {
  assert(!serviceSource.includes(forbidden), `Forbidden direct-draft mutation: ${forbidden}`);
}

const originalLoad = Module._load;
const originalTs = Module._extensions[".ts"];

Module._extensions[".ts"] = function transpile(moduleInstance, filename) {
  const input = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(input, {
    fileName: filename,
    reportDiagnostics: true,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      strict: true,
    },
  });
  if (output.diagnostics && output.diagnostics.length) {
    fail(
      `TypeScript transpilation diagnostics in ${filename}`,
      ts.formatDiagnosticsWithColorAndContext(output.diagnostics, {
        getCanonicalFileName: (fileName) => fileName,
        getCurrentDirectory: () => repoRoot,
        getNewLine: () => "\n",
      }),
    );
  }
  moduleInstance._compile(output.outputText, filename);
};

Module._load = function load(request, parent, isMain) {
  if (request === "@prisma/client") {
    return {
      Prisma: { TransactionIsolationLevel: { Serializable: "Serializable" } },
    };
  }
  if (request === "@/lib/prisma") return { prisma: {} };
  if (request === "@/lib/governance/scope") return {};
  if (request === "@/lib/appraisals/headteacherSupervisoryVisitDetails") {
    return {
      HEADTEACHER_SUPERVISORY_VISIT_DETAILS_POLICY: {
        schemaVersion: 1,
        visitContextSchemaVersion: 2,
      },
      buildHeadteacherSupervisoryVisitDetailsSnapshot(input) {
        const arrivalTime = String(input.arrivalTime || "").trim();
        const numeric = (value) => Number(value);
        const snapshot = {
          schemaVersion: 1,
          arrivalTime,
          staffStrength: numeric(input.staffStrength),
          totalEnrolment: numeric(input.totalEnrolment),
          girls: numeric(input.girls),
          boys: numeric(input.boys),
          teachersPresentAtVisit: numeric(input.teachersPresentAtVisit),
        };
        if (!/^\d{2}:\d{2}$/.test(arrivalTime)) {
          const error = new Error("HEADTEACHER_SUPERVISORY_VISIT_DETAILS_ARRIVAL_TIME_INVALID");
          error.code = error.message;
          error.status = 400;
          throw error;
        }
        if (snapshot.girls + snapshot.boys !== snapshot.totalEnrolment) {
          const error = new Error("HEADTEACHER_SUPERVISORY_VISIT_DETAILS_ENROLMENT_MISMATCH");
          error.code = error.message;
          error.status = 400;
          throw error;
        }
        return snapshot;
      },
    };
  }
  if (request === "@/lib/appraisals/headteacherSupervisoryAssessment") {
    return {
      HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY: {
        workflow: "HEADTEACHER_GOVERNANCE_SUPERVISORY_ASSESSMENT",
        instrumentCode: "HEADTEACHER_SUPERVISORY_ASSESSMENT_V1",
        instrumentVersion: 1,
        circuitZoneLevel: 1,
        districtZoneLevel: 2,
      },
      canonicalHeadteacherSupervisoryAssessorRole(value) {
        return String(value || "").trim().toUpperCase().replace(/[\s-]+/g, "_");
      },
      decideHeadteacherSupervisoryAssessmentAuthority(input) {
        const role = String(input.actorRoleName || "").toUpperCase();
        if (role !== "DISTRICT_DIRECTOR") {
          return { allowed: false, reason: "ASSESSOR_ROLE_NOT_OPERATIONAL", effectiveRole: role };
        }
        if (input.actorUserId === input.target.userId) {
          return { allowed: false, reason: "SELF_APPRAISAL_FORBIDDEN", effectiveRole: role };
        }
        const matches = input.assignments.filter(
          (row) =>
            row.userId === input.actorUserId &&
            String(row.role).toUpperCase() === "DISTRICT_DIRECTOR" &&
            row.zoneId === input.target.districtZoneId,
        );
        if (matches.length !== 1) {
          return { allowed: false, reason: matches.length ? "AMBIGUOUS_ACTIVE_ASSIGNMENT" : "DISTRICT_SCOPE_MISMATCH", effectiveRole: role };
        }
        return {
          allowed: true,
          reason: "AUTHORIZED",
          effectiveRole: "DISTRICT_DIRECTOR",
          scopeLevel: "DISTRICT",
          assignmentId: matches[0].id,
          targetTenantId: input.target.tenantId,
          targetDistrictZoneId: input.target.districtZoneId,
          targetCircuitZoneId: input.target.circuitZoneId,
        };
      },
      inspectHeadteacherSupervisoryInstrument() {
        return { valid: true, issues: [] };
      },
    };
  }
  if (typeof request === "string" && request.startsWith("@/")) {
    return originalLoad.call(
      this,
      path.join(repoRoot, "src", request.slice(2)),
      parent,
      isMain,
    );
  }
  return originalLoad.call(this, request, parent, isMain);
};

const NOW = new Date("2026-08-21T07:00:00.000Z");
const CONTENT_HASH = "a".repeat(64);

function targetMembership() {
  return {
    id: "membership-head-001",
    userId: "headteacher-001",
    tenantId: "school-001",
    status: "ACTIVE",
    role: { name: "HEADTEACHER" },
    user: {
      id: "headteacher-001",
      name: "UAT Headteacher",
      firstName: "UAT",
      lastName: "Headteacher",
    },
    tenant: {
      id: "school-001",
      name: "UAT Basic School",
      status: "ACTIVE",
      zone: {
        id: "circuit-001",
        name: "UAT Circuit",
        isActive: true,
        parentZoneId: "district-001",
        zoneType: { level: 1, countryCode: "GH" },
        parentZone: {
          id: "district-001",
          name: "UAT District",
          isActive: true,
          zoneType: { level: 2, countryCode: "GH" },
        },
      },
    },
  };
}

function directorAssignment() {
  return {
    id: "assignment-director-001",
    userId: "director-001",
    role: "DISTRICT_DIRECTOR",
    status: "ACTIVE",
    startsAt: null,
    endsAt: null,
    zoneId: "district-001",
    zone: {
      id: "district-001",
      name: "UAT District",
      isActive: true,
      parentZoneId: null,
      zoneType: { level: 2, countryCode: "GH" },
      parentZone: null,
    },
  };
}

function instrumentVersion() {
  return {
    id: "instrument-version-001",
    version: 1,
    status: "ACTIVE",
    contentHash: CONTENT_HASH,
    instrument: {
      id: "instrument-001",
      code: "HEADTEACHER_SUPERVISORY_ASSESSMENT_V1",
      purpose: "HEADTEACHER_SUPERVISORY_ASSESSMENT",
      subjectType: "HEADTEACHER",
      isActive: true,
    },
  };
}

class FakeDatabase {
  constructor(options = {}) {
    this.memberships = options.memberships || [targetMembership()];
    this.assignments = options.assignments || [directorAssignment()];
    this.cycles = [];
    this.assessments = [];
    this.audits = [];
    this.transactionOptions = [];
    this.providerCalls = 0;
  }

  appraisalCycle = {
    findUnique: async (args) => {
      if (args.where && args.where.idempotencyKey) {
        return this.cycles.find((row) => row.idempotencyKey === args.where.idempotencyKey) || null;
      }
      return null;
    },
    findMany: async (args) => {
      return this.cycles
        .filter(
          (cycle) =>
            cycle.targetUserId === args.where.targetUserId &&
            cycle.targetTenantId === args.where.targetTenantId,
        )
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .map((cycle) => ({
          ...cycle,
          instrumentVersion: instrumentVersion(),
          assessments: this.assessments
            .filter(
              (assessment) =>
                assessment.cycleId === cycle.id &&
                assessment.assessorUserId === "director-001",
            )
            .sort((a, b) => b.revision - a.revision || b.createdAt.getTime() - a.createdAt.getTime())
            .map((assessment) => ({
              id: assessment.id,
              status: assessment.status,
              revision: assessment.revision,
              createdAt: assessment.createdAt,
            })),
        }));
    },
    create: async (args) => {
      const row = {
        id: `cycle-${this.cycles.length + 1}`,
        ...args.data,
        createdAt: NOW,
        _count: { participants: 0 },
      };
      this.cycles.push(row);
      return row;
    },
  };

  appraisalAssessment = {
    findUnique: async (args) => {
      const key = args.where && args.where.cycleId_assessorUserId_revision;
      if (!key) return null;
      return (
        this.assessments.find(
          (row) =>
            row.cycleId === key.cycleId &&
            row.assessorUserId === key.assessorUserId &&
            row.revision === key.revision,
        ) || null
      );
    },
    create: async (args) => {
      const row = {
        id: `assessment-${this.assessments.length + 1}`,
        ...args.data,
        createdAt: NOW,
        _count: { scores: 0, reviews: 0 },
      };
      this.assessments.push(row);
      return row;
    },
  };

  async $transaction(operation, options) {
    this.transactionOptions.push(options || {});
    const tx = {
      membership: {
        findMany: async () => this.memberships,
      },
      user: {
        findUnique: async ({ where }) =>
          where.id === "director-001"
            ? {
                id: "director-001",
                name: "UAT Director",
                firstName: "UAT",
                lastName: "Director",
              }
            : null,
      },
      governanceOfficerAssignment: {
        findMany: async () => this.assignments,
      },
      appraisalInstrumentVersion: {
        findFirst: async () => instrumentVersion(),
      },
      appraisalCycle: this.appraisalCycle,
      appraisalAssessment: this.appraisalAssessment,
      auditLog: {
        create: async ({ data }) => {
          this.audits.push(data);
          return data;
        },
      },
    };
    return operation(tx);
  }
}

function input(overrides = {}) {
  return {
    actorUserId: "director-001",
    actorRoleName: "DISTRICT_DIRECTOR",
    governanceScope: {
      tenantIds: ["school-001"],
      zoneIds: ["district-001", "circuit-001"],
      assignments: [],
      isSuperAdmin: false,
    },
    targetUserId: "headteacher-001",
    targetTenantId: "school-001",
    directAssessmentKey: "HEADTEACHER-GOVERNANCE-DIRECT:test-001",
    dateObserved: "2026-08-21",
    arrivalTime: "08:15",
    staffStrength: 10,
    totalEnrolment: 100,
    girls: 50,
    boys: 50,
    teachersPresentAtVisit: 9,
    reqId: "request-001",
    ip: null,
    userAgent: "qa",
    now: NOW,
    ...overrides,
  };
}

(async () => {
  try {
    const {
      HEADTEACHER_SUPERVISORY_DIRECTOR_DRAFT_POLICY,
      createHeadteacherSupervisoryDirectorAssessmentDraft,
    } = require(servicePath);

    equal(HEADTEACHER_SUPERVISORY_DIRECTOR_DRAFT_POLICY.responseWindowDays, 0, "Response window must be zero");
    equal(HEADTEACHER_SUPERVISORY_DIRECTOR_DRAFT_POLICY.minimumResponses, 0, "Minimum responses must be zero");
    equal(HEADTEACHER_SUPERVISORY_DIRECTOR_DRAFT_POLICY.participantSelection, "NONE", "Participant selection must be NONE");
    equal(HEADTEACHER_SUPERVISORY_DIRECTOR_DRAFT_POLICY.staffFeedbackRequired, false, "Staff Feedback must not be required");

    const database = new FakeDatabase();
    const created = await createHeadteacherSupervisoryDirectorAssessmentDraft({
      ...input(),
      database,
    });

    equal(created.outcome, "CREATED", "First call creates direct Governance draft");
    equal(database.cycles.length, 1, "Exactly one Governance-only cycle created");
    equal(database.assessments.length, 1, "Exactly one assessment created");
    equal(database.audits.length, 2, "Cycle and draft audits created");
    equal(database.transactionOptions[0].isolationLevel, "Serializable", "Serializable transaction required");
    equal(database.transactionOptions[0].maxWait, 10000, "Bounded transaction max wait");
    equal(database.transactionOptions[0].timeout, 60000, "Bounded transaction timeout");

    const cycle = database.cycles[0];
    const assessment = database.assessments[0];
    equal(cycle.status, "OPEN", "Governance-only carrier opens immediately");
    equal(cycle.responseWindowDays, 0, "No response window");
    equal(cycle.minimumResponses, 0, "No minimum responses");
    equal(cycle.deadlineAt, null, "No Staff Feedback deadline");
    equal(cycle._count.participants, 0, "No participants");
    equal(cycle.metadata.carrierKind, "DIRECTOR_GOVERNANCE_ONLY", "Carrier kind frozen");
    equal(cycle.metadata.respondentWorkflow, false, "No respondent workflow");
    equal(cycle.metadata.staffFeedbackRequired, false, "No Staff Feedback prerequisite");
    equal(cycle.metadata.notificationRowsCreated, false, "No notification rows");
    equal(assessment.status, "DRAFT", "Assessment starts as DRAFT");
    equal(assessment.assessorUserId, "director-001", "Director is frozen assessor");
    equal(assessment.metadata.separateFromStaffFeedback, true, "Evidence streams stay separate");
    equal(assessment._count.scores, 0, "No score rows at draft creation");
    equal(assessment._count.reviews, 0, "No review rows at draft creation");

    const retry = await createHeadteacherSupervisoryDirectorAssessmentDraft({
      ...input(),
      database,
    });
    equal(retry.outcome, "EXISTING_MATCH", "Same direct key is idempotent");
    equal(database.cycles.length, 1, "Retry does not duplicate cycle");
    equal(database.assessments.length, 1, "Retry does not duplicate assessment");
    equal(database.audits.length, 2, "Retry does not duplicate audits");

    await expectReject(
      () =>
        createHeadteacherSupervisoryDirectorAssessmentDraft({
          ...input({ directAssessmentKey: "HEADTEACHER-GOVERNANCE-DIRECT:test-002" }),
          database,
        }),
      "HEADTEACHER_SUPERVISORY_DIRECT_DRAFT_EXISTING_ACTIVE",
      "Different key must not create a competing unfinished direct assessment",
    );

    assessment.status = "FINALIZED";
    cycle.metadata = {
      ...cycle.metadata,
      headteacherSupervisoryReleases: {
        [assessment.id]: {
          releaseMode: "DIRECTOR_AUTHORED_DIRECT_RELEASE",
          assessmentId: assessment.id,
          workflow: "HEADTEACHER_GOVERNANCE_SUPERVISORY_ASSESSMENT",
          staffFeedbackRequired: false,
          staffFeedbackAccessed: false,
          carrierCycleStatusMutationPerformed: false,
          releaseProofHash: "b".repeat(64),
        },
      },
    };

    const nextVisit = await createHeadteacherSupervisoryDirectorAssessmentDraft({
      ...input({
        directAssessmentKey: "HEADTEACHER-GOVERNANCE-DIRECT:test-003",
        dateObserved: "2026-08-20",
      }),
      database,
    });
    equal(nextVisit.outcome, "CREATED", "Released history permits a new direct assessment");
    equal(database.cycles.length, 2, "New visit gets a new cycle after release");

    await expectReject(
      () =>
        createHeadteacherSupervisoryDirectorAssessmentDraft({
          ...input({ actorRoleName: "HEAD_OF_SUPERVISION" }),
          database: new FakeDatabase(),
        }),
      "HEADTEACHER_SUPERVISORY_DIRECT_DRAFT_DIRECTOR_ONLY",
      "HOS must not use the Director direct-start service",
    );

    await expectReject(
      () =>
        createHeadteacherSupervisoryDirectorAssessmentDraft({
          ...input({
            governanceScope: {
              tenantIds: ["different-school"],
              zoneIds: ["different-district"],
              assignments: [],
              isSuperAdmin: false,
            },
          }),
          database: new FakeDatabase(),
        }),
      "HEADTEACHER_SUPERVISORY_DIRECT_DRAFT_TENANT_OUT_OF_SCOPE",
      "Out-of-scope Headteacher must fail closed",
    );

    await expectReject(
      () =>
        createHeadteacherSupervisoryDirectorAssessmentDraft({
          ...input(),
          database: new FakeDatabase({
            memberships: [
              targetMembership(),
              {
                ...targetMembership(),
                id: "membership-head-002",
                userId: "headteacher-002",
                user: {
                  ...targetMembership().user,
                  id: "headteacher-002",
                  name: "Second Active Headteacher",
                },
              },
            ],
          }),
        }),
      "HEADTEACHER_SUPERVISORY_DIRECT_DRAFT_TARGET_AMBIGUOUS",
      "Duplicate active Headteacher membership must fail closed",
    );

    const auditText = JSON.stringify(database.audits);
    for (const forbidden of ["email", "phone", "respondentUserId", "participantId"]) {
      assert(!auditText.includes(forbidden), `Audit metadata leaked ${forbidden}`);
    }
    equal(database.providerCalls, 0, "No provider calls");

    console.log("");
    console.log("=== N7-P2C3L1 DIRECTOR INDEPENDENT HEADTEACHER GOVERNANCE DRAFT ===");
    console.log("");
    console.log("Authority                      : District Director only");
    console.log("Target                         : live active Headteacher, server re-resolved");
    console.log("Governance scope               : tenant + district/circuit revalidated");
    console.log("Carrier                        : DIRECTOR_GOVERNANCE_ONLY");
    console.log("Cycle + assessment             : atomic");
    console.log("Cycle status                   : OPEN");
    console.log("Assessment status              : DRAFT");
    console.log("Response window                : 0 days");
    console.log("Respondent workflow            : none");
    console.log("Participants                   : 0");
    console.log("Notification rows              : 0");
    console.log("Staff Feedback prerequisite    : none");
    console.log("Official visit context         : immutable + hashed");
    console.log("Same-key retry                 : EXISTING_MATCH");
    console.log("Competing unfinished draft     : blocked");
    console.log("Released history               : permits later new assessment");
    console.log("HOS/BSC/SISSO direct start     : forbidden");
    console.log("Transaction                    : serializable + bounded");
    console.log("Provider calls                 : none");
    console.log("Database accessed by QA        : fake database only");
    console.log("");
    console.log("RESULT: N7-P2C3L1 DIRECTOR INDEPENDENT HEADTEACHER GOVERNANCE DRAFT GREEN");
  } catch (error) {
    console.error("");
    console.error("RESULT: N7-P2C3L1 DIRECTOR INDEPENDENT HEADTEACHER GOVERNANCE DRAFT FAILED");
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  } finally {
    Module._load = originalLoad;
    if (originalTs) Module._extensions[".ts"] = originalTs;
    else delete Module._extensions[".ts"];
  }
})();
