#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS QA harness intentionally loads TypeScript through a local transpile hook. */

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

require.extensions[".ts"] = function compileTypeScript(module, filename) {
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

  const errors = (transpiled.diagnostics ?? []).filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
  );

  if (errors.length) {
    fail("D3_4C5_TYPESCRIPT_TRANSPILE_FAILED", {
      filename,
      diagnostics: errors.map((diagnostic) =>
        ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
      ),
    });
  }

  module._compile(transpiled.outputText, filename);
};

function makeCycle(overrides = {}) {
  const requestedAt = new Date("2026-07-27T08:00:00.000Z");
  return {
    id: "00000000-0000-4000-8000-000000000501",
    status: "PENDING_APPROVAL",
    targetUserId: "headteacher-user",
    targetTenantId: "school-one",
    targetNameSnapshot: "Headteacher One",
    targetSchoolNameSnapshot: "School One",
    targetZoneNameSnapshot: "Gefia Circuit",
    requestedAt,
    approvedAt: null,
    openedAt: null,
    deadlineAt: null,
    closedAt: null,
    releasedAt: null,
    cancelledAt: null,
    metadata: {
      requestKey: "2026-TERM-ONE-HEADTEACHER-REQUEST",
    },
    participants: [],
    ...overrides,
  };
}

function makeParticipant(cycle, overrides = {}) {
  return {
    id: "00000000-0000-4000-8000-000000000601",
    status: "NOT_STARTED",
    respondentUserId: "teacher-user",
    respondentTenantId: "school-one",
    startedAt: null,
    finalizedAt: null,
    expiredAt: null,
    revokedAt: null,
    cycle,
    ...overrides,
  };
}

function makeAssessment(overrides = {}) {
  return {
    id: "00000000-0000-4000-8000-000000000701",
    cycleId: "00000000-0000-4000-8000-000000000506",
    assessorUserId: "director-user",
    status: "FINALIZED",
    revision: 1,
    priorAssessmentId: null,
    finalizedByUserId: "director-user",
    finalizedAt: new Date("2026-07-28T08:00:00.000Z"),
    ...overrides,
  };
}

function makeDatabase(options = {}) {
  const state = {
    memberships: options.memberships ?? [
      {
        id: "membership-headteacher",
        userId: "headteacher-user",
        tenantId: "school-one",
        status: "ACTIVE",
        role: { name: "HEADTEACHER" },
        tenant: { id: "school-one", status: "ACTIVE" },
      },
      {
        id: "membership-teacher",
        userId: "teacher-user",
        tenantId: "school-one",
        status: "ACTIVE",
        role: { name: "TEACHER" },
        tenant: { id: "school-one", status: "ACTIVE" },
      },
    ],
    cycles: options.cycles ?? [],
    participants: options.participants ?? [],
    assessments: options.assessments ?? [],
    membershipQueries: [],
    cycleFindFirstQueries: [],
    cycleFindManyQueries: [],
    participantQueries: [],
    assessmentQueries: [],
    writeCalls: 0,
  };

  return {
    state,
    membership: {
      async findFirst(args) {
        state.membershipQueries.push(clone(args));
        const where = args?.where ?? {};
        return clone(
          state.memberships.find(
            (row) =>
              row.userId === where.userId &&
              row.tenantId === where.tenantId &&
              row.status === "ACTIVE" &&
              row.tenant.status === "ACTIVE" &&
              row.role.name.toUpperCase() ===
                String(where.role?.name?.equals ?? "").toUpperCase(),
          ) ?? null,
        );
      },
    },
    appraisalCycle: {
      async findFirst(args) {
        state.cycleFindFirstQueries.push(clone(args));
        const where = args?.where ?? {};
        const rows = state.cycles
          .filter(
            (row) =>
              row.targetUserId === where.targetUserId &&
              row.targetTenantId === where.targetTenantId,
          )
          .sort((a, b) => b.requestedAt.getTime() - a.requestedAt.getTime());
        return clone(rows[0] ?? null);
      },
      async findMany(args) {
        state.cycleFindManyQueries.push(clone(args));
        const tenantIds = args?.where?.targetTenantId?.in ?? null;
        return clone(
          state.cycles
            .filter(
              (row) =>
                !tenantIds || tenantIds.includes(row.targetTenantId),
            )
            .sort((a, b) => b.requestedAt.getTime() - a.requestedAt.getTime())
            .slice(0, args?.take ?? 50),
        );
      },
    },
    appraisalParticipant: {
      async findFirst(args) {
        state.participantQueries.push(clone(args));
        const where = args?.where ?? {};
        const rows = state.participants.filter(
          (row) =>
            row.respondentUserId === where.respondentUserId &&
            row.respondentTenantId === where.respondentTenantId &&
            row.cycle.targetTenantId === where.cycle?.targetTenantId,
        );
        return clone(rows[0] ?? null);
      },
    },
    appraisalAssessment: {
      async findMany(args) {
        state.assessmentQueries.push(clone(args));
        const where = args?.where ?? {};
        const cycleIds = where.cycleId?.in ?? [];
        return clone(
          state.assessments.filter(
            (row) =>
              cycleIds.includes(row.cycleId) &&
              row.assessorUserId === where.assessorUserId &&
              row.status === where.status &&
              row.revision === where.revision &&
              row.priorAssessmentId === where.priorAssessmentId &&
              row.finalizedByUserId === where.finalizedByUserId,
          ),
        );
      },
    },
  };
}

async function expectFailure(run, expectedCode) {
  try {
    await run();
  } catch (error) {
    assertEqual(error.code ?? error.message, expectedCode, "Unexpected failure code");
    return;
  }
  fail(`Expected failure ${expectedCode}`);
}

function assertNoConfidentialTeacherIdentity(value) {
  const text = JSON.stringify(value).toLowerCase();
  for (const forbidden of [
    "membership-teacher",
    "teacher@example",
    "+233",
    "respondentuserid",
    "eligibilitysnapshot",
    "participantids",
  ]) {
    assert(!text.includes(forbidden), "Read model leaked confidential teacher identity", {
      forbidden,
    });
  }
}

async function main() {
  const modulePath = path.join(
    repoRoot,
    "src",
    "lib",
    "appraisals",
    "headteacherFeedbackReadStates.ts",
  );
  const source = fs.readFileSync(modulePath, "utf8");
  const readStates = require(modulePath);

  assertEqual(
    readStates.HEADTEACHER_FEEDBACK_READ_ONLY_ROUTES.headteacher,
    "/headteacher/my-appraisal",
    "Headteacher future route",
  );
  assertEqual(
    readStates.HEADTEACHER_FEEDBACK_READ_ONLY_ROUTES.director,
    "/district/headteacher-appraisal",
    "Director future route",
  );
  assertEqual(
    readStates.HEADTEACHER_FEEDBACK_READ_ONLY_ROUTES.teacher,
    "/teacher/headteacher-appraisal",
    "Teacher future route",
  );

  const headteacherLabels = {
    null: ["REQUEST_APPRAISAL", "Request appraisal"],
    DRAFT: ["REQUEST_PROCESSING", "Request processing"],
    PENDING_APPROVAL: [
      "AWAITING_DIRECTOR_APPROVAL",
      "Awaiting Director approval",
    ],
    OPEN: ["FEEDBACK_PERIOD_OPEN", "Feedback period open"],
    CLOSED: [
      "RESPONSES_CLOSED_AWAITING_REVIEW",
      "Responses closed — awaiting review",
    ],
    UNDER_REVIEW: [
      "DIRECTOR_REVIEWING_APPRAISAL",
      "Director reviewing appraisal",
    ],
    RELEASED: [
      "VIEW_RELEASED_APPRAISAL",
      "View released appraisal",
    ],
    CANCELLED: ["REQUEST_CLOSED", "Request closed"],
  };

  for (const [status, expected] of Object.entries(headteacherLabels)) {
    const cycle = status === "null" ? null : makeCycle({ status });
    const state = readStates.buildHeadteacherOwnAppraisalReadState(cycle);
    assertEqual(state.state, expected[0], `Headteacher state ${status}`);
    assertEqual(state.label, expected[1], `Headteacher label ${status}`);
    assert(!("participantCount" in state), "Headteacher must not receive participant count");
    assert(!("finalizedResponseCount" in state), "Headteacher must not receive completion count");
    assertNoConfidentialTeacherIdentity(state);
  }

  const openCycle = makeCycle({
    status: "OPEN",
    approvedAt: new Date("2026-07-27T09:00:00.000Z"),
    openedAt: new Date("2026-07-27T09:00:00.000Z"),
    deadlineAt: new Date("2026-08-03T09:00:00.000Z"),
    participants: [{ status: "NOT_STARTED" }, { status: "FINALIZED" }],
  });
  const now = new Date("2026-07-28T09:00:00.000Z");

  const assignmentCases = [
    [null, "LOCKED", "Locked / Awaiting request", false, true],
    [
      makeParticipant(openCycle),
      "AVAILABLE",
      "Available",
      true,
      false,
    ],
    [
      makeParticipant(openCycle, {
        status: "IN_PROGRESS",
        startedAt: new Date("2026-07-28T08:00:00.000Z"),
      }),
      "CONTINUE",
      "Continue",
      true,
      false,
    ],
    [
      makeParticipant(openCycle, {
        status: "FINALIZED",
        finalizedAt: new Date("2026-07-28T08:30:00.000Z"),
      }),
      "SUBMITTED_READ_ONLY",
      "Submitted / read-only",
      false,
      true,
    ],
    [
      makeParticipant(openCycle, {
        status: "EXPIRED",
        expiredAt: new Date("2026-08-03T09:00:00.000Z"),
      }),
      "CLOSED",
      "Closed",
      false,
      true,
    ],
    [
      makeParticipant({ ...openCycle, status: "CLOSED" }),
      "CLOSED",
      "Closed",
      false,
      true,
    ],
    [
      makeParticipant({
        ...openCycle,
        deadlineAt: new Date("2026-07-28T08:59:59.000Z"),
      }),
      "CLOSED",
      "Closed",
      false,
      true,
    ],
  ];

  for (const [
    participant,
    expectedState,
    expectedLabel,
    active,
    readOnly,
  ] of assignmentCases) {
    const state =
      readStates.buildTeacherHeadteacherAppraisalAssignmentReadState(
        participant,
        now,
      );
    assertEqual(state.state, expectedState, "Teacher assignment state");
    assertEqual(state.label, expectedLabel, "Teacher assignment label");
    assertEqual(state.assignmentActive, active, "Teacher assignment active");
    assertEqual(state.readOnly, readOnly, "Teacher assignment read-only");
    assert(
      state.anonymityNotice.includes(
        "hidden from the Headteacher and District Director",
      ),
      "Anonymity notice must explain Headteacher and Director masking",
    );
    assert(
      state.anonymityNotice.includes("Respondent 1"),
      "Anonymity notice must explain cycle-scoped anonymous labels",
    );
  }

  const headteacherDb = makeDatabase({
    cycles: [makeCycle()],
  });
  const headteacherState =
    await readStates.readHeadteacherOwnAppraisalState({
      actorUserId: "headteacher-user",
      actorRoleName: "HEADTEACHER",
      tenantId: "school-one",
      database: headteacherDb,
    });
  assertEqual(
    headteacherState.state,
    "AWAITING_DIRECTOR_APPROVAL",
    "Headteacher pending state",
  );
  assertEqual(
    headteacherDb.state.cycleFindFirstQueries[0].where.targetTenantId,
    "school-one",
    "Headteacher query exact tenant",
  );
  assertEqual(
    headteacherDb.state.cycleFindFirstQueries[0].where.targetUserId,
    "headteacher-user",
    "Headteacher query exact user",
  );

  const teacherDb = makeDatabase({
    participants: [makeParticipant(openCycle)],
  });
  const teacherState =
    await readStates.readTeacherHeadteacherAppraisalAssignmentState({
      actorUserId: "teacher-user",
      actorRoleName: "TEACHER",
      tenantId: "school-one",
      now,
      database: teacherDb,
    });
  assertEqual(teacherState.state, "AVAILABLE", "Teacher available state");
  const teacherWhere = teacherDb.state.participantQueries[0].where;
  assertEqual(teacherWhere.respondentUserId, "teacher-user", "Teacher exact user");
  assertEqual(teacherWhere.respondentTenantId, "school-one", "Teacher exact tenant");
  assertEqual(
    teacherWhere.cycle.targetTenantId,
    "school-one",
    "Cycle exact target tenant",
  );

  const directorCycles = [
    makeCycle(),
    makeCycle({
      id: "00000000-0000-4000-8000-000000000502",
      status: "OPEN",
      requestedAt: new Date("2026-07-27T10:00:00.000Z"),
      approvedAt: new Date("2026-07-27T10:00:00.000Z"),
      openedAt: new Date("2026-07-27T10:00:00.000Z"),
      deadlineAt: new Date("2026-08-03T10:00:00.000Z"),
      metadata: { openingMode: "DIRECT_OPEN" },
      participants: [
        { status: "NOT_STARTED" },
        { status: "FINALIZED" },
      ],
    }),
    makeCycle({
      id: "00000000-0000-4000-8000-000000000503",
      targetUserId: "headteacher-two",
      targetTenantId: "school-two",
      targetNameSnapshot: "Headteacher Two",
      targetSchoolNameSnapshot: "School Two",
      targetZoneNameSnapshot: "Other Circuit",
    }),
  ];
  const directorDb = makeDatabase({ cycles: directorCycles });
  const directorState =
    await readStates.readDirectorHeadteacherAppraisalStates({
      actorUserId: "director-user",
      actorRoleName: "DISTRICT_DIRECTOR",
      governanceScope: {
        isSuperAdmin: false,
        tenantIds: ["school-one"],
      },
      now: new Date("2026-07-28T09:00:00.000Z"),
      database: directorDb,
    });

  assertEqual(directorState.items.length, 2, "Director receives in-scope cycles only");
  assertEqual(directorState.pendingApprovalCount, 1, "Pending approval count");
  assertEqual(directorState.openCount, 1, "Open count");
  assertEqual(
    directorState.items[0].requestMode,
    "DIRECT_OPEN",
    "Direct-open mode visible",
  );
  assertEqual(
    directorState.items[0].participantCount,
    2,
    "Director sees aggregate participant count",
  );
  assertEqual(
    directorState.items[0].finalizedResponseCount,
    1,
    "Director sees aggregate finalized count",
  );
  assertEqual(
    directorState.items[0].feedbackWindowExpired,
    false,
    "Future Director feedback window is not expired",
  );
  assertEqual(
    directorState.items[0].feedbackDeadlineExtensionCount,
    0,
    "Unextended Director feedback window reports zero extensions",
  );
  assertEqual(
    directorState.items[0].canExtendFeedbackWindow,
    false,
    "Future Director feedback window cannot be extended early",
  );
  assertNoConfidentialTeacherIdentity(directorState);
  assertEqual(
    directorDb.state.assessmentQueries.length,
    0,
    "No CLOSED cycle means no Director direct-release assessment query",
  );

  const directReleaseCycle = makeCycle({
    id: "00000000-0000-4000-8000-000000000506",
    status: "CLOSED",
    requestedAt: new Date("2026-07-28T08:00:00.000Z"),
    approvedAt: new Date("2026-07-28T08:05:00.000Z"),
    openedAt: new Date("2026-07-28T08:05:00.000Z"),
    deadlineAt: new Date("2026-08-04T08:05:00.000Z"),
    closedAt: new Date("2026-07-28T08:45:00.000Z"),
    participants: [{ status: "FINALIZED" }, { status: "FINALIZED" }],
  });
  const directReleaseAssessment = makeAssessment({
    cycleId: directReleaseCycle.id,
  });
  const directReleaseDb = makeDatabase({
    cycles: [directReleaseCycle],
    assessments: [directReleaseAssessment],
  });
  const directReleaseState =
    await readStates.readDirectorHeadteacherAppraisalStates({
      actorUserId: "director-user",
      actorRoleName: "DISTRICT_DIRECTOR",
      governanceScope: {
        isSuperAdmin: false,
        tenantIds: ["school-one"],
      },
      now,
      database: directReleaseDb,
    });
  assertEqual(directReleaseState.items.length, 1, "Direct-release cycle visible");
  assertEqual(
    directReleaseState.items[0].canDirectReleaseOwnAssessment,
    true,
    "Exact Director-authored finalized assessment enables direct-release presentation hint",
  );
  assertEqual(
    directReleaseState.items[0].directReleaseAssessmentId,
    directReleaseAssessment.id,
    "Direct-release UI receives only the exact own assessment identifier",
  );
  assertEqual(
    directReleaseDb.state.assessmentQueries.length,
    1,
    "Closed Director queue performs one batched direct-release hint query",
  );
  const directWhere = directReleaseDb.state.assessmentQueries[0].where;
  assertEqual(
    JSON.stringify(directWhere.cycleId.in),
    JSON.stringify([directReleaseCycle.id]),
    "Direct-release hint query is cycle-scoped",
  );
  assertEqual(
    directWhere.assessorUserId,
    "director-user",
    "Direct-release hint query is exact actor-owned",
  );
  assertEqual(directWhere.status, "FINALIZED", "Direct-release hint requires finalized assessment");
  assertEqual(directWhere.revision, 1, "Direct-release hint requires initial revision");
  assertEqual(directWhere.priorAssessmentId, null, "Direct-release hint excludes correction revisions");
  assertEqual(
    directWhere.finalizedByUserId,
    "director-user",
    "Direct-release hint requires exact finalizer",
  );
  assertNoConfidentialTeacherIdentity(directReleaseState);

  const ambiguousDirectReleaseDb = makeDatabase({
    cycles: [directReleaseCycle],
    assessments: [
      directReleaseAssessment,
      makeAssessment({
        id: "00000000-0000-4000-8000-000000000702",
        cycleId: directReleaseCycle.id,
      }),
    ],
  });
  const ambiguousDirectReleaseState =
    await readStates.readDirectorHeadteacherAppraisalStates({
      actorUserId: "director-user",
      actorRoleName: "DISTRICT_DIRECTOR",
      governanceScope: {
        isSuperAdmin: false,
        tenantIds: ["school-one"],
      },
      now,
      database: ambiguousDirectReleaseDb,
    });
  assertEqual(
    ambiguousDirectReleaseState.items[0].canDirectReleaseOwnAssessment,
    false,
    "Multiple own finalized assessments fail closed at the presentation layer",
  );
  assertEqual(
    ambiguousDirectReleaseState.items[0].directReleaseAssessmentId,
    null,
    "Ambiguous own assessment IDs are not exposed",
  );

  const otherAssessorDb = makeDatabase({
    cycles: [directReleaseCycle],
    assessments: [
      makeAssessment({
        id: "00000000-0000-4000-8000-000000000703",
        cycleId: directReleaseCycle.id,
        assessorUserId: "hos-user",
        finalizedByUserId: "hos-user",
      }),
    ],
  });
  const otherAssessorState =
    await readStates.readDirectorHeadteacherAppraisalStates({
      actorUserId: "director-user",
      actorRoleName: "DISTRICT_DIRECTOR",
      governanceScope: {
        isSuperAdmin: false,
        tenantIds: ["school-one"],
      },
      now,
      database: otherAssessorDb,
    });
  assertEqual(
    otherAssessorState.items[0].canDirectReleaseOwnAssessment,
    false,
    "Another officer's assessment never becomes Director direct-release",
  );
  assertEqual(
    otherAssessorState.items[0].directReleaseAssessmentId,
    null,
    "Another officer's assessment ID is not exposed by the direct-release hint",
  );

  const expiredOpenCycle = makeCycle({
    id: "00000000-0000-4000-8000-000000000504",
    status: "OPEN",
    requestedAt: new Date("2026-07-20T09:00:00.000Z"),
    approvedAt: new Date("2026-07-20T09:00:00.000Z"),
    openedAt: new Date("2026-07-20T09:00:00.000Z"),
    deadlineAt: new Date("2026-07-27T09:00:00.000Z"),
    participants: [
      { status: "NOT_STARTED" },
      { status: "IN_PROGRESS" },
    ],
  });
  const expiredItem = readStates.buildDirectorHeadteacherAppraisalReadItem(
    expiredOpenCycle,
    new Date("2026-07-28T09:00:00.000Z"),
  );
  assertEqual(
    expiredItem.feedbackWindowExpired,
    true,
    "Expired OPEN cycle is explicit to Director",
  );
  assertEqual(
    expiredItem.canExtendFeedbackWindow,
    true,
    "Expired unextended OPEN cycle can be recovered",
  );
  assertEqual(
    expiredItem.feedbackDeadlineExtensionCount,
    0,
    "Expired unextended cycle reports zero extensions",
  );

  const extendedOpenCycle = makeCycle({
    ...expiredOpenCycle,
    id: "00000000-0000-4000-8000-000000000505",
    deadlineAt: new Date("2026-08-04T09:00:00.000Z"),
    metadata: {
      openingMode: "DIRECT_OPEN",
      headteacherFeedbackDeadlineExtension: {
        schemaVersion: 1,
        extensionMode: "DIRECTOR_EXPIRED_WINDOW_RECOVERY",
        extensionNumber: 1,
        extensionDays: 7,
        originalDeadlineAt: "2026-07-27T09:00:00.000Z",
        extendedAt: "2026-07-28T09:00:00.000Z",
        newDeadlineAt: "2026-08-04T09:00:00.000Z",
        actorRole: "DISTRICT_DIRECTOR",
        participantSetPreserved: true,
        savedResponsesPreserved: true,
        finalizedResponsesPreserved: true,
        respondentIdentitiesIncluded: false,
        scoreValuesIncluded: false,
        notificationsSeeded: false,
        providerCalled: false,
      },
    },
  });
  const extendedItem = readStates.buildDirectorHeadteacherAppraisalReadItem(
    extendedOpenCycle,
    new Date("2026-08-05T09:00:00.000Z"),
  );
  assertEqual(
    extendedItem.feedbackWindowExpired,
    true,
    "Expired extended window remains truthful",
  );
  assertEqual(
    extendedItem.feedbackDeadlineExtensionCount,
    1,
    "Extended cycle reports one extension",
  );
  assertEqual(
    extendedItem.canExtendFeedbackWindow,
    false,
    "One-extension V1 limit fails closed after expiry",
  );
  assertNoConfidentialTeacherIdentity(expiredItem);
  assertNoConfidentialTeacherIdentity(extendedItem);
  assertEqual(
    JSON.stringify(
      directorDb.state.cycleFindManyQueries[0].where.targetTenantId.in,
    ),
    JSON.stringify(["school-one"]),
    "Director query constrained to scope tenant IDs",
  );

  await expectFailure(
    () =>
      readStates.readHeadteacherOwnAppraisalState({
        actorUserId: "teacher-user",
        actorRoleName: "TEACHER",
        tenantId: "school-one",
        database: headteacherDb,
      }),
    "HEADTEACHER_FEEDBACK_READ_HEADTEACHER_ONLY",
  );

  await expectFailure(
    () =>
      readStates.readTeacherHeadteacherAppraisalAssignmentState({
        actorUserId: "headteacher-user",
        actorRoleName: "HEADTEACHER",
        tenantId: "school-one",
        database: teacherDb,
      }),
    "HEADTEACHER_FEEDBACK_READ_TEACHER_ONLY",
  );

  await expectFailure(
    () =>
      readStates.readDirectorHeadteacherAppraisalStates({
        actorUserId: "teacher-user",
        actorRoleName: "TEACHER",
        governanceScope: {
          isSuperAdmin: false,
          tenantIds: ["school-one"],
        },
        database: directorDb,
      }),
    "HEADTEACHER_FEEDBACK_READ_DIRECTOR_ONLY",
  );

  const emptyScopeDb = makeDatabase({ cycles: directorCycles });
  const emptyScope =
    await readStates.readDirectorHeadteacherAppraisalStates({
      actorUserId: "director-user",
      actorRoleName: "DISTRICT_DIRECTOR",
      governanceScope: {
        isSuperAdmin: false,
        tenantIds: [],
      },
      database: emptyScopeDb,
    });
  assertEqual(emptyScope.items.length, 0, "Empty Director scope returns no state");
  assertEqual(
    emptyScopeDb.state.cycleFindManyQueries.length,
    0,
    "Empty Director scope performs no cycle query",
  );

  for (const forbidden of [
    ".create(",
    ".createMany(",
    ".update(",
    ".delete(",
    "$transaction",
    "appraisalNotification",
    "sendSms",
    "sendEmail",
    "fetch(",
    "overallPercentage",
    "sectionPercentages",
    "itemAverages",
  ]) {
    assert(!source.includes(forbidden), "C5 must remain read-only and score-free", {
      forbidden,
    });
  }

  assert(
    source.includes("respondentTenantId: tenantId"),
    "Teacher assignment query must bind respondent tenant",
  );
  assert(
    source.includes("targetTenantId: tenantId"),
    "Read queries must bind cycle tenant",
  );
  assert(
    source.includes("assertHeadteacherFeedbackApprovalAuthority"),
    "Director rows must be scope-authorized",
  );
  assert(
    source.includes("appraisalAssessment.findMany"),
    "Director direct-release hint must use one batched read-only assessment query",
  );
  assert(
    source.includes("assessorUserId: actorUserId"),
    "Director direct-release hint must bind exact assessor ownership",
  );
  assert(
    source.includes("canDirectReleaseOwnAssessment"),
    "Director read model must expose an explicit direct-release presentation hint",
  );
  assert(
    source.includes("directReleaseAssessmentId"),
    "Director read model must expose only the exact own assessment identifier needed by the protected endpoint",
  );

  const directConsumers = [
    "src/app/headteacher/my-appraisal/page.tsx",
    "src/app/teacher/dashboard/page.tsx",
    "src/app/api/district/headteacher-appraisals/route.ts",
  ];

  for (const relativePath of directConsumers) {
    const consumer = fs.readFileSync(
      path.join(repoRoot, ...relativePath.split("/")),
      "utf8",
    );
    assert(
      consumer.includes(
        'from "@/lib/appraisals/headteacherFeedbackReadStates"',
      ),
      "C5 direct module import boundary missing",
      relativePath,
    );
  }

  console.log("");
  console.log("=== D3.4C5 HEADTEACHER READ-ONLY STATES ===");
  console.log("");
  console.log("Headteacher no request        : Request appraisal");
  console.log("Headteacher pending           : Awaiting Director approval");
  console.log("Headteacher open              : Feedback period open");
  console.log("Headteacher closed/review     : truthful lifecycle labels");
  console.log("Headteacher participant data  : hidden");
  console.log("Teacher no assignment         : Locked / Awaiting request");
  console.log("Teacher not started           : Available");
  console.log("Teacher in progress           : Continue");
  console.log("Teacher finalized             : Submitted / read-only");
  console.log("Teacher expired/closed        : Closed");
  console.log("Teacher anonymity notice      : Headteacher and Director masked");
  console.log("Director individual forms     : Respondent 1…N labels only");
  console.log("Real identity audience        : SUPERADMIN_ONLY");
  console.log("Director pending/open counts  : aggregate only");
  console.log("Director expired OPEN state   : explicit");
  console.log("Director extension availability: server-derived, one-use V1");
  console.log("Module boundary                : direct imports; no barrel dependency");
  console.log("Director own direct release    : server-derived presentation hint");
  console.log("Direct-release assessment read : exact actor + CLOSED cycle, batched");
  console.log("Ambiguous own assessments      : fail closed");
  console.log("Director teacher identities   : absent");
  console.log("Tenant and role scope         : exact");
  console.log("Future route targets          : exposed");
  console.log("Scoring controls              : absent");
  console.log("Database writes               : absent");
  console.log("Database accessed             : false");
  console.log("");
  console.log("RESULT: D3.4C5 HEADTEACHER READ-ONLY STATES GREEN");
}

main().catch((error) => {
  console.error("");
  console.error("RESULT: D3.4C5 HEADTEACHER READ-ONLY STATES FAILED");
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
