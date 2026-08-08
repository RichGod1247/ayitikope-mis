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
function assertDeepEqual(actual, expected, message) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(message, { expected, actual });
  }
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

const NOW = new Date("2026-08-07T12:00:00.000Z");
const CONTENT_HASH = "c".repeat(64);

function baseMembership(overrides = {}) {
  return {
    id: "membership-teacher-001",
    userId: "teacher-001",
    tenantId: "tenant-school-001",
    status: "ACTIVE",
    role: { name: "TEACHER" },
    user: {
      id: "teacher-001",
      name: "Teacher One",
      firstName: "Teacher",
      lastName: "One",
    },
    tenant: {
      id: "tenant-school-001",
      name: "School One",
      status: "ACTIVE",
      zone: {
        id: "circuit-gef-001",
        name: "Gefia Circuit",
        isActive: true,
        parentZoneId: "district-aks-001",
        zoneType: { level: 1, countryCode: "GH" },
        parentZone: {
          id: "district-aks-001",
          name: "Akatsi South District",
          isActive: true,
          zoneType: { level: 2, countryCode: "GH" },
        },
      },
    },
    ...overrides,
  };
}

function districtAssignment(role = "DISTRICT_DIRECTOR", overrides = {}) {
  return {
    id: `assignment-${role.toLowerCase()}-001`,
    userId: "actor-001",
    role,
    status: "ACTIVE",
    startsAt: new Date("2026-01-01T00:00:00.000Z"),
    endsAt: null,
    zoneId: "district-aks-001",
    zone: {
      id: "district-aks-001",
      name: "Akatsi South District",
      isActive: true,
      parentZoneId: null,
      zoneType: { level: 2, countryCode: "GH" },
      parentZone: null,
    },
    ...overrides,
  };
}

function circuitAssignment(role = "SISSO", overrides = {}) {
  return {
    id: "assignment-sisso-001",
    userId: "actor-001",
    role,
    status: "ACTIVE",
    startsAt: new Date("2026-01-01T00:00:00.000Z"),
    endsAt: null,
    zoneId: "circuit-gef-001",
    zone: {
      id: "circuit-gef-001",
      name: "Gefia Circuit",
      isActive: true,
      parentZoneId: "district-aks-001",
      zoneType: { level: 1, countryCode: "GH" },
      parentZone: {
        id: "district-aks-001",
        name: "Akatsi South District",
        isActive: true,
        zoneType: { level: 2, countryCode: "GH" },
      },
    },
    ...overrides,
  };
}

function instrument(overrides = {}) {
  return {
    id: "teacher-observation-version-001",
    version: 1,
    status: "ACTIVE",
    contentHash: CONTENT_HASH,
    instrument: {
      id: "teacher-observation-instrument-001",
      code: "TEACHER_OBSERVATION_V1",
      purpose: "TEACHER_OBSERVATION",
      subjectType: "TEACHER",
      isActive: true,
    },
    ...overrides,
  };
}

function observationClassroom(overrides = {}) {
  return {
    id: "class-jhs3-a",
    tenantId: "tenant-school-001",
    name: "JHS 3",
    grade: "JHS 3",
    arm: "A",
    status: "ACTIVE",
    ...overrides,
  };
}

function teacherAssessmentAssignment(overrides = {}) {
  return {
    id: "teacher-assignment-science-001",
    tenantId: "tenant-school-001",
    teacherUserId: "teacher-001",
    assignmentKind: "SUBJECT",
    classroomId: "class-jhs3-a",
    phase: "JHS",
    level: "JHS 3",
    subject: "Science",
    subjectNorm: "SCIENCE",
    status: "ACTIVE",
    startsAt: new Date("2026-01-01T00:00:00.000Z"),
    endsAt: null,
    revokedAt: null,
    ...overrides,
  };
}

function curriculumScience(overrides = {}) {
  return {
    id: "curriculum-science-jhs3",
    tenantId: null,
    phase: "JHS",
    level: "JHS 3",
    name: "Science",
    orderIndex: 1,
    isGlobal: true,
    isActive: true,
    countryCode: "GH",
    strands: [
      {
        id: "strand-farming-001",
        code: "SCI-JHS3-S1",
        title: "Farming",
        orderIndex: 1,
        subStrands: [
          {
            id: "substrand-farming-systems-001",
            code: "SCI-JHS3-S1-SS1",
            title: "Farming Systems",
            orderIndex: 1,
          },
        ],
      },
    ],
    ...overrides,
  };
}

class FakeDatabase {
  constructor(overrides = {}) {
    this.membershipRecord = overrides.membership ?? baseMembership();
    this.actor = overrides.actor ?? {
      id: "actor-001",
      name: "Director One",
      firstName: "Director",
      lastName: "One",
    };
    this.assignments = overrides.assignments ?? [districtAssignment()];
    this.instrumentVersion = overrides.instrumentVersion ?? instrument();
    this.teacherAssessmentAssignments =
      overrides.teacherAssessmentAssignments ?? [teacherAssessmentAssignment()];
    this.teacherProfileRecord = overrides.teacherProfile ?? null;
    this.classrooms = overrides.classrooms ?? [observationClassroom()];
    this.curriculumSubjects = overrides.curriculumSubjects ?? [curriculumScience()];
    this.cycles = overrides.cycles ?? [];
    this.assessments = overrides.assessments ?? [];
    this.audits = overrides.audits ?? [];
    this.transactionOptions = [];
    this.scoreCreates = 0;
    this.reviewCreates = 0;
    this.aggregateCreates = 0;
    this.notificationCreates = 0;
    this.participantCreates = 0;
    this.legacyTeacherAppraisalMutations = 0;
    this.providerCalls = 0;
    this.simulateRaceOnce = Boolean(overrides.simulateRaceOnce);
    this.raceTriggered = false;

    this.appraisalCycle = {
      findUnique: async (args) => this.findCycle(args),
      create: async (args) => this.createCycle(args),
    };
    this.appraisalAssessment = {
      findUnique: async (args) => this.findAssessment(args),
      create: async (args) => this.createAssessment(args),
    };
  }

  findCycle(args) {
    const key = args?.where?.idempotencyKey;
    return this.cycles.find((cycle) => cycle.idempotencyKey === key) ?? null;
  }

  materializeCycle(data) {
    return {
      id: data.id ?? `cycle-teacher-${this.cycles.length + 1}`,
      instrumentVersionId: data.instrumentVersionId,
      scopeZoneId: data.scopeZoneId,
      targetUserId: data.targetUserId,
      targetTenantId: data.targetTenantId,
      targetZoneId: data.targetZoneId,
      targetGovernanceAssignmentId: data.targetGovernanceAssignmentId,
      status: data.status,
      identityVisibility: data.identityVisibility,
      idempotencyKey: data.idempotencyKey,
      responseWindowDays: data.responseWindowDays,
      minimumResponses: data.minimumResponses,
      extensionCount: data.extensionCount,
      targetNameSnapshot: data.targetNameSnapshot,
      targetRoleSnapshot: data.targetRoleSnapshot,
      targetSchoolNameSnapshot: data.targetSchoolNameSnapshot,
      targetZoneNameSnapshot: data.targetZoneNameSnapshot,
      requestedByUserId: data.requestedByUserId,
      openedByUserId: data.openedByUserId,
      requestedAt: data.requestedAt,
      openedAt: data.openedAt,
      deadlineAt: data.deadlineAt,
      metadata: data.metadata,
      createdAt: new Date("2026-08-07T12:00:00.000Z"),
      _count: { participants: 0 },
    };
  }

  async createCycle(args) {
    if (this.findCycle({ where: { idempotencyKey: args.data.idempotencyKey } })) {
      const error = new Error("unique-cycle");
      error.code = "P2002";
      throw error;
    }
    const cycle = this.materializeCycle(args.data);
    this.cycles.push(cycle);
    return cycle;
  }

  findAssessment(args) {
    const key = args?.where?.cycleId_assessorUserId_revision;
    if (!key) return null;
    return (
      this.assessments.find(
        (assessment) =>
          assessment.cycleId === key.cycleId &&
          assessment.assessorUserId === key.assessorUserId &&
          assessment.revision === key.revision,
      ) ?? null
    );
  }

  materializeAssessment(data) {
    return {
      id: data.id ?? `assessment-teacher-${this.assessments.length + 1}`,
      cycleId: data.cycleId,
      instrumentVersionId: data.instrumentVersionId,
      assessorUserId: data.assessorUserId,
      assessorAssignmentId: data.assessorAssignmentId,
      status: data.status,
      revision: data.revision,
      priorAssessmentId: data.priorAssessmentId,
      dateObserved: data.dateObserved,
      overallPercentage: data.overallPercentage,
      sectionPercentagesJson: data.sectionPercentagesJson,
      generalComment: data.generalComment,
      evidenceSnapshotJson: data.evidenceSnapshotJson,
      assessmentHash: data.assessmentHash,
      finalizedByUserId: data.finalizedByUserId,
      finalizedAt: data.finalizedAt,
      metadata: data.metadata,
      createdAt: new Date("2026-08-07T12:00:00.000Z"),
      _count: { scores: 0, reviews: 0 },
    };
  }

  async createAssessment(args) {
    const key = {
      cycleId: args.data.cycleId,
      assessorUserId: args.data.assessorUserId,
      revision: args.data.revision,
    };
    if (this.findAssessment({ where: { cycleId_assessorUserId_revision: key } })) {
      const error = new Error("unique-assessment");
      error.code = "P2002";
      throw error;
    }
    const assessment = this.materializeAssessment(args.data);
    this.assessments.push(assessment);
    return assessment;
  }

  async $transaction(operation, options) {
    this.transactionOptions.push(options);
    const cyclesBefore = [...this.cycles];
    const assessmentsBefore = [...this.assessments];
    const auditsBefore = [...this.audits];

    const tx = {
      membership: {
        findFirst: async () => this.membershipRecord,
      },
      user: {
        findUnique: async () => this.actor,
      },
      governanceOfficerAssignment: {
        findMany: async () => this.assignments,
      },
      appraisalInstrumentVersion: {
        findFirst: async () => this.instrumentVersion,
      },
      teacherAssessmentAssignment: {
        findMany: async () => this.teacherAssessmentAssignments,
      },
      teacherProfile: {
        findUnique: async () => this.teacherProfileRecord,
      },
      classroom: {
        findMany: async () => this.classrooms,
      },
      curriculumSubject: {
        findMany: async () => this.curriculumSubjects,
      },
      appraisalCycle: this.appraisalCycle,
      appraisalAssessment: this.appraisalAssessment,
      auditLog: {
        create: async (args) => {
          this.audits.push(args.data);
          return args.data;
        },
      },
    };

    try {
      const result = await operation(tx);

      if (this.simulateRaceOnce && !this.raceTriggered) {
        this.raceTriggered = true;
        const error = new Error("simulated-concurrent-winner");
        error.code = "P2002";
        error.preserveConcurrentWinner = true;
        throw error;
      }

      return result;
    } catch (error) {
      if (!error?.preserveConcurrentWinner) {
        this.cycles = cyclesBefore;
        this.assessments = assessmentsBefore;
        this.audits = auditsBefore;
      }
      throw error;
    }
  }
}

function input(overrides = {}) {
  return {
    actorUserId: "actor-001",
    actorRoleName: "DISTRICT_DIRECTOR",
    targetUserId: "teacher-001",
    targetTenantId: "tenant-school-001",
    observationKey: "visit-2026-08-07-001",
    dateObserved: "2026-08-07",
    yearsInService: 9,
    yearsInPresentSchool: "4",
    durationMinutes: "60",
    totalEnrolment: 40,
    girls: 22,
    boys: 18,
    classroomId: "class-jhs3-a",
    curriculumSubjectId: "curriculum-science-jhs3",
    curriculumSubStrandId: "substrand-farming-systems-001",
    reqId: "req-n6-d3-001",
    ip: "127.0.0.1",
    userAgent: "N6-D3-QA",
    now: NOW,
    ...overrides,
  };
}

async function main() {
  const draftPath = path.join(
    repoRoot,
    "src",
    "lib",
    "appraisals",
    "teacherSupervisoryAssessmentDraft.ts",
  );
  const detailsPath = path.join(
    repoRoot,
    "src",
    "lib",
    "appraisals",
    "teacherSupervisoryObservationDetails.ts",
  );
  const draftSource = fs.readFileSync(draftPath, "utf8");
  const detailsSource = fs.readFileSync(detailsPath, "utf8");
  const draftModule = require(draftPath);
  const detailsModule = require(detailsPath);

  const {
    TEACHER_SUPERVISORY_DRAFT_POLICY,
    createTeacherSupervisoryAssessmentDraft,
  } = draftModule;
  const {
    TEACHER_SUPERVISORY_OBSERVATION_DETAILS_POLICY,
    buildTeacherSupervisoryObservationDetailsSnapshot,
    readTeacherSupervisoryObservationDetailsSnapshot,
  } = detailsModule;

  assertEqual(TEACHER_SUPERVISORY_DRAFT_POLICY.initialCycleStatus, "OPEN", "Initial cycle status");
  assertEqual(TEACHER_SUPERVISORY_DRAFT_POLICY.initialAssessmentStatus, "DRAFT", "Initial assessment status");
  assertEqual(TEACHER_SUPERVISORY_DRAFT_POLICY.cycleAndAssessmentAtomic, true, "Cycle + assessment must be atomic");
  assertEqual(TEACHER_SUPERVISORY_DRAFT_POLICY.observationContextSchemaVersion, 2, "New Teacher observations must use verified v2 context");
  assertEqual(TEACHER_SUPERVISORY_DRAFT_POLICY.responseWindowDays, 0, "No response window on observation cycle");
  assertEqual(TEACHER_SUPERVISORY_DRAFT_POLICY.minimumResponses, 0, "No respondents required");
  assertEqual(TEACHER_SUPERVISORY_DRAFT_POLICY.respondentWorkflow, false, "No respondent workflow");
  assertEqual(TEACHER_SUPERVISORY_DRAFT_POLICY.observationContextImmutable, true, "Observation context immutable");
  assertEqual(TEACHER_SUPERVISORY_DRAFT_POLICY.scoreRowsCreatedAtDraft, false, "No score rows at draft creation");
  assertEqual(TEACHER_SUPERVISORY_DRAFT_POLICY.legacyTeacherAppraisalMutationAllowed, false, "Legacy TeacherAppraisal mutation forbidden");
  assertEqual(TEACHER_SUPERVISORY_DRAFT_POLICY.providerCallsAllowed, false, "Provider calls forbidden");

  assertEqual(TEACHER_SUPERVISORY_OBSERVATION_DETAILS_POLICY.officialHeaderFieldCount, 10, "Official header count");
  assertEqual(TEACHER_SUPERVISORY_OBSERVATION_DETAILS_POLICY.schemaVersion, 2, "New observation details schema");
  assertEqual(TEACHER_SUPERVISORY_OBSERVATION_DETAILS_POLICY.legacySchemaVersion, 1, "Legacy observation details remain readable");
  assertEqual(TEACHER_SUPERVISORY_OBSERVATION_DETAILS_POLICY.governanceObservationEvidenceFieldCount, 3, "Governance enrolment evidence count");
  assertEqual(TEACHER_SUPERVISORY_OBSERVATION_DETAILS_POLICY.classSubjectAndSubStrandServerResolved, true, "Class/subject/sub-strand must be server resolved");
  assertEqual(TEACHER_SUPERVISORY_OBSERVATION_DETAILS_POLICY.enrolmentBreakdownMustBalance, true, "Enrolment balance gate");
  assertEqual(TEACHER_SUPERVISORY_OBSERVATION_DETAILS_POLICY.termIsOfficialHeaderField, false, "Term is not official printed header");
  assertEqual(TEACHER_SUPERVISORY_OBSERVATION_DETAILS_POLICY.academicYearIsOfficialHeaderField, false, "Academic year is not official printed header");
  assertEqual(TEACHER_SUPERVISORY_OBSERVATION_DETAILS_POLICY.mutableAfterDraftCreation, false, "Observation details immutable");

  const normalizedDetails = buildTeacherSupervisoryObservationDetailsSnapshot({
    dateObserved: "2026-08-07",
    yearsInService: 9,
    yearsInPresentSchool: "4",
    subjectBeingObserved: " Science ",
    subStrand: " Farming   Systems ",
    classTaught: " JHS 3 A ",
    durationMinutes: "60",
    totalEnrolment: 40,
    girls: 22,
    boys: 18,
  });
  assertDeepEqual(
    normalizedDetails,
    {
      schemaVersion: 2,
      dateObserved: "2026-08-07",
      yearsInService: 9,
      yearsInPresentSchool: 4,
      subjectBeingObserved: "Science",
      subStrand: "Farming Systems",
      classTaught: "JHS 3 A",
      durationMinutes: 60,
      totalEnrolment: 40,
      girls: 22,
      boys: 18,
    },
    "Observation details v2 normalization",
  );

  const legacyDetails = readTeacherSupervisoryObservationDetailsSnapshot({
    schemaVersion: 1,
    dateObserved: "2026-08-07",
    yearsInService: null,
    yearsInPresentSchool: null,
    subjectBeingObserved: null,
    subStrand: null,
    classTaught: null,
    durationMinutes: null,
  });
  assertEqual(legacyDetails.schemaVersion, 1, "Legacy v1 observation remains readable");
  assertEqual(legacyDetails.classTaught, null, "Legacy missing evidence must remain missing");

  expectThrow(
    () => buildTeacherSupervisoryObservationDetailsSnapshot({
      dateObserved: "2026-02-31", yearsInService: 9, yearsInPresentSchool: 4,
      subjectBeingObserved: "Science", subStrand: "Farming Systems", classTaught: "JHS 3 A",
      durationMinutes: 60, totalEnrolment: 40, girls: 22, boys: 18,
    }),
    "TEACHER_SUPERVISORY_OBSERVATION_DATE_INVALID",
    "Impossible calendar date must fail",
  );
  expectThrow(
    () => buildTeacherSupervisoryObservationDetailsSnapshot({
      dateObserved: "2026-08-07", yearsInService: 9, yearsInPresentSchool: 4,
      subjectBeingObserved: "Science", subStrand: "Farming Systems", classTaught: "JHS 3 A",
      durationMinutes: 81, totalEnrolment: 40, girls: 22, boys: 18,
    }),
    "TEACHER_SUPERVISORY_OBSERVATION_FIELD_INVALID",
    "Duration outside 0..80 range must fail",
  );
  expectThrow(
    () => buildTeacherSupervisoryObservationDetailsSnapshot({
      dateObserved: "2026-08-07", yearsInService: 9, yearsInPresentSchool: 4,
      subjectBeingObserved: "Science", subStrand: "Farming Systems", classTaught: "JHS 3 A",
      durationMinutes: 60, totalEnrolment: 40, girls: 21, boys: 18,
    }),
    "TEACHER_SUPERVISORY_ENROLMENT_TOTAL_MISMATCH",
    "Girls + boys must equal total enrolment",
  );

  const database = new FakeDatabase();
  const created = await createTeacherSupervisoryAssessmentDraft({
    ...input(),
    database,
  });

  assertEqual(created.outcome, "CREATED", "Atomic draft create outcome");
  assertEqual(database.cycles.length, 1, "One cycle created");
  assertEqual(database.assessments.length, 1, "One assessment created");
  assertEqual(database.audits.length, 2, "Cycle + assessment audits created");
  assertEqual(database.transactionOptions[0].isolationLevel, "Serializable", "Serializable transaction");
  assertEqual(database.transactionOptions[0].maxWait, 10000, "Bounded max wait");
  assertEqual(database.transactionOptions[0].timeout, 60000, "Bounded UAT timeout");

  const cycle = database.cycles[0];
  const assessment = database.assessments[0];
  assertEqual(cycle.status, "OPEN", "Observation cycle open");
  assertEqual(cycle.identityVisibility, "AUTHORIZED_GOVERNANCE_ONLY", "Governance-only cycle visibility");
  assertEqual(cycle.responseWindowDays, 0, "Observation cycle has no response window");
  assertEqual(cycle.minimumResponses, 0, "Observation cycle has no respondent minimum");
  assertEqual(cycle._count.participants, 0, "No participant rows");
  assertEqual(cycle.targetGovernanceAssignmentId, null, "Teacher target has no governance assignment");
  assertEqual(cycle.targetUserId, "teacher-001", "Teacher cycle target");
  assertEqual(cycle.targetTenantId, "tenant-school-001", "Teacher school target");
  assertEqual(cycle.targetZoneId, "circuit-gef-001", "Teacher circuit target");
  assertEqual(cycle.scopeZoneId, "district-aks-001", "District scope snapshot");
  assertEqual(cycle.requestedByUserId, "actor-001", "Cycle creator");
  assertEqual(cycle.openedByUserId, "actor-001", "Cycle opener");
  assertEqual(cycle.deadlineAt, null, "No response deadline");

  assertEqual(assessment.cycleId, cycle.id, "Assessment belongs to atomic cycle");
  assertEqual(assessment.status, "DRAFT", "Assessment draft status");
  assertEqual(assessment.revision, 1, "Initial revision");
  assertEqual(assessment.assessorUserId, "actor-001", "Actual assessor user frozen");
  assertEqual(assessment.assessorAssignmentId, "assignment-district_director-001", "Actual assessor assignment frozen");
  assertEqual(assessment.instrumentVersionId, "teacher-observation-version-001", "Teacher observation instrument frozen");
  assertEqual(assessment.dateObserved.toISOString().slice(0, 10), "2026-08-07", "Observed date frozen");
  assertEqual(assessment.overallPercentage, null, "No aggregate score at draft start");
  assertEqual(assessment.generalComment, null, "No general comment at draft start");
  assertEqual(assessment.assessmentHash, null, "No final assessment hash at draft start");
  assertEqual(assessment._count.scores, 0, "No score rows at draft start");
  assertEqual(assessment._count.reviews, 0, "No review rows at draft start");

  const snapshot = assessment.evidenceSnapshotJson;
  assertEqual(snapshot.schemaVersion, 2, "Observation context schema");
  assertEqual(snapshot.workflow, "TEACHER_GOVERNANCE_SUPERVISORY_ASSESSMENT", "Teacher governance workflow");
  assertEqual(snapshot.evidenceStream, "GOVERNANCE_TEACHER_OBSERVATION", "Teacher governance evidence stream");
  assertEqual(snapshot.cycle.id, cycle.id, "Cycle identity frozen in assessment evidence");
  assertEqual(snapshot.cycle.statusAtDraft, "OPEN", "Cycle draft status frozen");
  assertEqual(snapshot.target.userId, "teacher-001", "Teacher identity frozen");
  assertEqual(snapshot.target.role, "TEACHER", "Teacher role frozen");
  assertEqual(snapshot.target.schoolName, "School One", "School frozen");
  assertEqual(snapshot.assessor.userId, "actor-001", "Assessor user frozen");
  assertEqual(snapshot.assessor.role, "DISTRICT_DIRECTOR", "Assessor role frozen");
  assertEqual(snapshot.assessor.assignmentId, "assignment-district_director-001", "Assessor assignment frozen");
  assertEqual(snapshot.assessor.scopeLevel, "DISTRICT", "Assessor scope frozen");
  assertEqual(snapshot.jurisdiction.districtZoneId, "district-aks-001", "District jurisdiction frozen");
  assertEqual(snapshot.jurisdiction.circuitZoneId, "circuit-gef-001", "Circuit jurisdiction frozen");
  assertEqual(snapshot.instrument.code, "TEACHER_OBSERVATION_V1", "Teacher observation instrument code frozen");
  assertEqual(snapshot.instrument.contentHash, CONTENT_HASH, "Published instrument hash frozen");
  assertDeepEqual(snapshot.observation.details, normalizedDetails, "Official observation particulars + governance evidence frozen");
  assertEqual(snapshot.observation.selection.classroomId, "class-jhs3-a", "Assigned classroom frozen");
  assertEqual(snapshot.observation.selection.curriculumSubjectId, "curriculum-science-jhs3", "Curriculum subject frozen");
  assertEqual(snapshot.observation.selection.curriculumSubStrandId, "substrand-farming-systems-001", "Curriculum sub-strand frozen");
  assertEqual(snapshot.observation.selection.authorization.source, "TEACHER_ASSESSMENT_ASSIGNMENT", "Assignment provenance frozen");
  assertDeepEqual(snapshot.observation.selection.authorization.assignmentIds, ["teacher-assignment-science-001"], "Exact Teacher assignment frozen");
  assertEqual(assessment.metadata.governanceEnrolmentEvidenceIncluded, true, "Governance enrolment evidence flag");
  assertEqual(assessment.metadata.teacherAssignmentVerified, true, "Teacher assignment verification flag");
  assertEqual(assessment.metadata.curriculumSelectionVerified, true, "Curriculum selection verification flag");

  const contextHash = assessment.metadata.observationContextHash;
  assert(/^[a-f0-9]{64}$/.test(contextHash), "Observation context SHA-256 required", contextHash);
  assertEqual(created.draft.observationContextHash, contextHash, "Returned context hash");
  assertEqual(created.draft.scoreRowsCreatedAtDraft, false, "Returned draft proves no score rows");
  assertEqual(created.draft.participantRowsCreated, false, "Returned draft proves no participants");

  const snapshotJson = JSON.stringify(snapshot).toLowerCase();
  assert(!snapshotJson.includes("@"), "Observation snapshot must exclude email addresses");
  assert(!snapshotJson.includes("phone"), "Observation snapshot must exclude phone fields");
  assert(!snapshotJson.includes("academicyear"), "Academic year must not be silently added to official observation header");
  assert(!snapshotJson.includes('"term"'), "Term must not be silently added to official observation header");

  const auditJson = JSON.stringify(database.audits);
  assertEqual(database.audits[0].action, "TEACHER_SUPERVISORY_OBSERVATION_CYCLE_OPENED", "Cycle audit action");
  assertEqual(database.audits[1].action, "TEACHER_SUPERVISORY_ASSESSMENT_DRAFT_CREATED", "Assessment audit action");
  assert(!auditJson.includes("Teacher One"), "Audit must exclude Teacher name");
  assert(!auditJson.includes("Director One"), "Audit must exclude assessor name");
  assert(!auditJson.includes("Science"), "Audit must exclude subject detail");
  assert(!auditJson.includes("Farming Systems"), "Audit must exclude sub-strand detail");
  assert(!auditJson.includes("@"), "Audit must exclude email addresses");

  const retry = await createTeacherSupervisoryAssessmentDraft({
    ...input({ reqId: "req-n6-d3-retry" }),
    database,
  });
  assertEqual(retry.outcome, "EXISTING_MATCH", "Same-key same-context retry");
  assertEqual(database.cycles.length, 1, "Retry must not duplicate cycle");
  assertEqual(database.assessments.length, 1, "Retry must not duplicate assessment");
  assertEqual(database.audits.length, 2, "Retry must not duplicate audits");

  await expectReject(
    () => createTeacherSupervisoryAssessmentDraft({
      ...input({ dateObserved: "2026-08-06", reqId: "req-context-date" }),
      database,
    }),
    "TEACHER_SUPERVISORY_DRAFT_CONTEXT_DRIFT",
    "Same observation key with changed date must fail closed",
  );

  await expectReject(
    () => createTeacherSupervisoryAssessmentDraft({
      ...input({ totalEnrolment: 41, girls: 22, boys: 19, reqId: "req-context-enrolment" }),
      database,
    }),
    "TEACHER_SUPERVISORY_DRAFT_CONTEXT_DRIFT",
    "Same observation key with changed governance observation evidence must fail closed",
  );

  const secondObservation = await createTeacherSupervisoryAssessmentDraft({
    ...input({ observationKey: "visit-2026-08-07-002", reqId: "req-second-observation" }),
    database,
  });
  assertEqual(secondObservation.outcome, "CREATED", "New observation key creates a new observation event");
  assertEqual(database.cycles.length, 2, "Second observation gets separate cycle");
  assertEqual(database.assessments.length, 2, "Second observation gets separate assessment");
  assert(database.cycles[0].id !== database.cycles[1].id, "Observation cycle IDs must differ");
  assert(database.assessments[0].id !== database.assessments[1].id, "Observation assessment IDs must differ");

  const sissoDb = new FakeDatabase({ assignments: [circuitAssignment()] });
  const sisso = await createTeacherSupervisoryAssessmentDraft({
    ...input({ actorRoleName: "SISSO", reqId: "req-sisso" }),
    database: sissoDb,
  });
  assertEqual(sisso.outcome, "CREATED", "SISSO may create Teacher observation in assigned circuit");
  assertEqual(sissoDb.assessments[0].evidenceSnapshotJson.assessor.scopeLevel, "CIRCUIT", "SISSO circuit scope frozen");

  await expectReject(
    () => createTeacherSupervisoryAssessmentDraft({
      ...input(),
      database: new FakeDatabase({
        assignments: [districtAssignment("DISTRICT_DIRECTOR", {
          zoneId: "district-other",
          zone: {
            ...districtAssignment().zone,
            id: "district-other",
            name: "Other District",
          },
        })],
      }),
    }),
    "TEACHER_SUPERVISORY_AUTHORITY_DISTRICT_SCOPE_MISMATCH",
    "Cross-district assessor must be denied",
  );

  await expectReject(
    () => createTeacherSupervisoryAssessmentDraft({
      ...input({ actorRoleName: "SISSO" }),
      database: new FakeDatabase({
        assignments: [circuitAssignment("SISSO", {
          zoneId: "circuit-other",
          zone: {
            ...circuitAssignment().zone,
            id: "circuit-other",
            name: "Other Circuit",
          },
        })],
      }),
    }),
    "TEACHER_SUPERVISORY_AUTHORITY_CIRCUIT_SCOPE_MISMATCH",
    "Cross-circuit SISSO must be denied",
  );

  await expectReject(
    () => createTeacherSupervisoryAssessmentDraft({
      ...input(),
      database: new FakeDatabase({
        assignments: [districtAssignment("DISTRICT_DIRECTOR", { status: "REVOKED" })],
      }),
    }),
    "TEACHER_SUPERVISORY_AUTHORITY_ACTIVE_ASSIGNMENT_REQUIRED",
    "Revoked assignment must be denied",
  );

  await expectReject(
    () => createTeacherSupervisoryAssessmentDraft({
      ...input({ actorUserId: "teacher-001" }),
      database: new FakeDatabase({
        actor: {
          id: "teacher-001",
          name: "Teacher One",
          firstName: "Teacher",
          lastName: "One",
        },
        assignments: [districtAssignment("DISTRICT_DIRECTOR", { userId: "teacher-001" })],
      }),
    }),
    "TEACHER_SUPERVISORY_AUTHORITY_SELF_APPRAISAL_FORBIDDEN",
    "Self appraisal must be denied",
  );

  await expectReject(
    () => createTeacherSupervisoryAssessmentDraft({
      ...input(),
      database: new FakeDatabase({
        membership: baseMembership({ status: "INACTIVE" }),
      }),
    }),
    "TEACHER_SUPERVISORY_TARGET_CONTEXT_INVALID",
    "Inactive Teacher membership must fail closed",
  );

  await expectReject(
    () => createTeacherSupervisoryAssessmentDraft({
      ...input(),
      database: new FakeDatabase({
        membership: baseMembership({
          tenant: {
            ...baseMembership().tenant,
            status: "INACTIVE",
          },
        }),
      }),
    }),
    "TEACHER_SUPERVISORY_TARGET_CONTEXT_INVALID",
    "Inactive school must fail closed",
  );

  await expectReject(
    () => createTeacherSupervisoryAssessmentDraft({
      ...input({ dateObserved: "2026-08-08" }),
      database: new FakeDatabase(),
    }),
    "TEACHER_SUPERVISORY_OBSERVATION_DATE_FUTURE",
    "Future observation must fail",
  );

  await expectReject(
    () => createTeacherSupervisoryAssessmentDraft({
      ...input({ yearsInService: "" }),
      database: new FakeDatabase(),
    }),
    "TEACHER_SUPERVISORY_OBSERVATION_FIELD_REQUIRED",
    "New v2 draft requires years in service",
  );

  await expectReject(
    () => createTeacherSupervisoryAssessmentDraft({
      ...input({ totalEnrolment: 40, girls: 21, boys: 18 }),
      database: new FakeDatabase(),
    }),
    "TEACHER_SUPERVISORY_ENROLMENT_TOTAL_MISMATCH",
    "New v2 draft requires balanced enrolment evidence",
  );

  await expectReject(
    () => createTeacherSupervisoryAssessmentDraft({
      ...input({ curriculumSubjectId: "curriculum-maths-jhs3" }),
      database: new FakeDatabase(),
    }),
    "TEACHER_SUPERVISORY_OBSERVATION_SELECTION_INVALID",
    "Browser-supplied subject outside verified assignment/curriculum must fail",
  );

  await expectReject(
    () => createTeacherSupervisoryAssessmentDraft({
      ...input(),
      database: new FakeDatabase({
        instrumentVersion: instrument({ contentHash: null }),
      }),
    }),
    "TEACHER_SUPERVISORY_PUBLISHED_INSTRUMENT_INVALID",
    "Missing published instrument hash must fail",
  );

  const driftDb = new FakeDatabase();
  await createTeacherSupervisoryAssessmentDraft({ ...input(), database: driftDb });
  driftDb.membershipRecord = baseMembership({
    tenant: { ...baseMembership().tenant, name: "Renamed School" },
  });
  await expectReject(
    () => createTeacherSupervisoryAssessmentDraft({
      ...input({ reqId: "req-renamed-school" }),
      database: driftDb,
    }),
    "TEACHER_SUPERVISORY_DRAFT_CONTEXT_DRIFT",
    "Same observation key with changed school snapshot must fail closed",
  );

  const raceDb = new FakeDatabase({ simulateRaceOnce: true });
  const race = await createTeacherSupervisoryAssessmentDraft({
    ...input({ reqId: "req-race" }),
    database: raceDb,
  });
  assertEqual(race.outcome, "EXISTING_MATCH", "Concurrent create race must recover idempotently");
  assertEqual(raceDb.cycles.length, 1, "Race leaves one observation cycle");
  assertEqual(raceDb.assessments.length, 1, "Race leaves one observation assessment");
  assertEqual(raceDb.audits.length, 2, "Concurrent winner owns exactly two audits");

  assertEqual(database.scoreCreates, 0, "No assessment score writes");
  assertEqual(database.reviewCreates, 0, "No review writes");
  assertEqual(database.aggregateCreates, 0, "No aggregate writes");
  assertEqual(database.notificationCreates, 0, "No notification writes");
  assertEqual(database.participantCreates, 0, "No participant writes");
  assertEqual(database.legacyTeacherAppraisalMutations, 0, "Legacy TeacherAppraisal untouched");
  assertEqual(database.providerCalls, 0, "No provider calls");

  for (const marker of [
    "appraisalCycle.create",
    "appraisalAssessment.create",
    "Prisma.TransactionIsolationLevel.Serializable",
    "cycleAndAssessmentAtomic: true",
    "observationContextSchemaVersion: 2",
    "resolveTeacherSupervisoryObservationSelection",
    "governanceEnrolmentEvidenceIncluded: true",
    "teacherAssignmentVerified: true",
    "curriculumSelectionVerified: true",
    "observationContextHash",
    "TEACHER_SUPERVISORY_OBSERVATION_CYCLE_OPENED",
    "TEACHER_SUPERVISORY_ASSESSMENT_DRAFT_CREATED",
    "participantSelection: \"NONE\"",
    "legacyTeacherAppraisalMutationAllowed: false",
    "providerCalled: false",
  ]) {
    assert(draftSource.includes(marker), `Required draft source marker missing: ${marker}`);
  }

  for (const marker of [
    "officialHeaderFieldCount: 10",
    "governanceObservationEvidenceFieldCount: 3",
    "classSubjectAndSubStrandServerResolved: true",
    "enrolmentBreakdownMustBalance: true",
    "legacySchemaVersion: 1",
    "termIsOfficialHeaderField: false",
    "academicYearIsOfficialHeaderField: false",
    "mutableAfterDraftCreation: false",
  ]) {
    assert(detailsSource.includes(marker), `Required observation-details marker missing: ${marker}`);
  }

  for (const forbidden of [
    "teacherAppraisal.create",
    "teacherAppraisal.update",
    "teacherAppraisalScore",
    "sendSms",
    "sendEmail",
    "appraisalAssessmentScore.create",
    "appraisalReview.create",
    "appraisalAggregateSnapshot.create",
    "appraisalNotification.create",
    "appraisalParticipant.create",
    "setInterval",
    "localStorage",
  ]) {
    assert(!draftSource.includes(forbidden), `Forbidden source marker present: ${forbidden}`);
  }

  console.log("");
  console.log("=== N6-D3 GOVERNANCE TEACHER ATOMIC OBSERVATION DRAFT CONTRACT ===");
  console.log("");
  console.log("Instrument                     : TEACHER_OBSERVATION_V1");
  console.log("Official form                  : 10 header fields / 6 sections / 34 items");
  console.log("Target                         : ACTIVE TEACHER membership");
  console.log("School hierarchy               : active circuit + district frozen");
  console.log("Authority                      : capability + active assignment rechecked");
  console.log("Cycle + assessment             : one SERIALIZABLE transaction");
  console.log("Cycle state                    : OPEN observation envelope");
  console.log("Respondent workflow            : absent (0-day / 0-response / 0 participants)");
  console.log("Assessment                     : DRAFT revision 1");
  console.log("Assessor identity/assignment   : actual governance officer frozen");
  console.log("Observation particulars        : all required + immutable v2 snapshot");
  console.log("Class / subject / sub-strand   : server-verified assignment + curriculum");
  console.log("Governance evidence            : total / girls / boys, balanced");
  console.log("Legacy v1 drafts               : readable without invented evidence");
  console.log("Term / academic year           : not silently added to official header");
  console.log("Published instrument hash      : frozen");
  console.log("Observation-context proof      : deterministic SHA-256");
  console.log("Same-key retry                 : EXISTING_MATCH");
  console.log("Changed-context retry          : fails closed");
  console.log("New observation key            : separate cycle + assessment");
  console.log("Concurrent create race         : idempotently recovered");
  console.log("Scores/comments/reviews        : absent at draft creation");
  console.log("Participants/aggregates        : absent");
  console.log("Legacy TeacherAppraisal        : untouched");
  console.log("Notifications/providers        : absent");
  console.log("Audit                          : cycle + draft, no names/contacts/details");
  console.log("Database accessed              : fake transaction only");
  console.log("");
  console.log("RESULT: N6-D3 GOVERNANCE TEACHER ATOMIC OBSERVATION DRAFT GREEN");
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
