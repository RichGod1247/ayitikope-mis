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
    fail("D3_4D1_TYPESCRIPT_TRANSPILE_FAILED", {
      filename,
      diagnostics: errors.map((diagnostic) =>
        ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
      ),
    });
  }

  module._compile(transpiled.outputText, filename);
};

function makeFixture() {
  const instruments = require(
    path.join(repoRoot, "src", "lib", "appraisals", "instruments.ts"),
  );
  const definition =
    instruments.APPRAISAL_INSTRUMENT_DEFINITIONS.HEADTEACHER_STAFF_FEEDBACK_V1;
  const now = new Date("2026-07-27T12:00:00.000Z");

  const sections = definition.sections.map((section, sectionIndex) => ({
    id: `section-${sectionIndex + 1}`,
    key: section.key,
    title: section.title,
    description: section.description ?? null,
    order: section.order,
    maxScore: section.maxScore,
    items: section.items.map((item, itemIndex) => ({
      id: `item-${sectionIndex + 1}-${itemIndex + 1}`,
      key: item.key,
      label: item.label,
      order: item.order,
      maxScore: item.maxScore,
      isRequired: item.isRequired,
    })),
  }));

  return {
    now,
    participant: {
      id: "participant-teacher-one",
      cycleId: "cycle-headteacher-feedback-one",
      respondentUserId: "teacher-user-one",
      respondentTenantId: "school-one",
      respondentRoleSnapshot: "TEACHER",
      status: "NOT_STARTED",
      startedAt: null,
      finalizedAt: null,
      eligibilitySnapshotJson: {
        membershipId: "membership-teacher-one",
        tenantId: "school-one",
        selectionBasis: "ACTIVE_TEACHER_MEMBERSHIP_AT_CYCLE_OPEN",
      },
      cycle: {
        id: "cycle-headteacher-feedback-one",
        status: "OPEN",
        openedAt: new Date("2026-07-27T10:00:00.000Z"),
        deadlineAt: new Date("2026-08-03T10:00:00.000Z"),
        targetUserId: "headteacher-user-one",
        targetTenantId: "school-one",
        targetNameSnapshot: "Headteacher One",
        targetRoleSnapshot: "HEADTEACHER",
        targetSchoolNameSnapshot: "School One",
        targetZoneNameSnapshot: "Circuit One",
        instrumentVersionId: "instrument-version-headteacher-staff-v1",
        metadata: {
          workflow: "HEADTEACHER_CONFIDENTIAL_STAFF_FEEDBACK",
        },
        instrumentVersion: {
          id: "instrument-version-headteacher-staff-v1",
          version: 1,
          status: "ACTIVE",
          title: definition.officialHeader.documentTitle,
          instructions: definition.instructions,
          scaleMin: definition.scaleMin,
          scaleMax: definition.scaleMax,
          allowNotApplicable: definition.allowNotApplicable,
          allowComments: false,
          instrument: {
            code: definition.code,
            isActive: true,
          },
          sections,
        },
      },
      response: null,
    },
  };
}

function makeDatabase(fixture) {
  const state = {
    participant: clone(fixture.participant),
    response: null,
    scores: [],
    audits: [],
    transactionOptions: [],
    responseCreateCalls: 0,
  };

  function projectResponse() {
    if (!state.response) return null;
    return {
      ...clone(state.response),
      scores: clone(
        state.scores
          .filter((row) => row.responseId === state.response.id)
          .sort(
            (left, right) =>
              left.sectionOrder - right.sectionOrder ||
              left.itemOrder - right.itemOrder,
          ),
      ),
    };
  }

  function projectParticipant() {
    return {
      ...clone(state.participant),
      response: projectResponse(),
    };
  }

  const participantDelegate = {
    async findFirst(args) {
      const where = args?.where ?? {};
      if (where.cycleId && where.cycleId !== state.participant.cycleId) return null;
      if (
        where.respondentUserId &&
        where.respondentUserId !== state.participant.respondentUserId
      ) {
        return null;
      }
      if (
        where.respondentTenantId &&
        where.respondentTenantId !== state.participant.respondentTenantId
      ) {
        return null;
      }
      return projectParticipant();
    },
    async update(args) {
      if (args?.where?.id !== state.participant.id) return null;
      Object.assign(state.participant, clone(args.data));
      return {
        id: state.participant.id,
        status: state.participant.status,
        startedAt: state.participant.startedAt,
        finalizedAt: state.participant.finalizedAt,
      };
    },
  };

  const responseDelegate = {
    async findUnique(args) {
      const where = args?.where ?? {};
      if (!state.response) return null;
      if (where.id && where.id !== state.response.id) return null;
      if (
        where.participantId &&
        where.participantId !== state.response.participantId
      ) {
        return null;
      }
      return projectResponse();
    },
    async create(args) {
      state.responseCreateCalls += 1;
      if (state.response) fail("FAKE_RESPONSE_UNIQUE_VIOLATION");
      state.response = {
        id: "response-headteacher-feedback-one",
        cycleId: args.data.cycleId,
        participantId: args.data.participantId,
        instrumentVersionId: args.data.instrumentVersionId,
        status: args.data.status,
        overallPercentage: args.data.overallPercentage,
        sectionPercentagesJson: clone(args.data.sectionPercentagesJson),
        generalComment: args.data.generalComment,
        responseHash: args.data.responseHash,
        finalizedByUserId: null,
        finalizedAt: null,
        metadata: clone(args.data.metadata),
      };
      return projectResponse();
    },
    async update(args) {
      if (!state.response || args?.where?.id !== state.response.id) return null;
      if (state.response.status === "FINALIZED") {
        throw new Error("PUBLISHED_RESPONSE_IMMUTABLE");
      }
      Object.assign(state.response, clone(args.data));
      return {
        id: state.response.id,
        status: state.response.status,
        overallPercentage: state.response.overallPercentage,
        sectionPercentagesJson: clone(state.response.sectionPercentagesJson),
        responseHash: state.response.responseHash,
        finalizedAt: state.response.finalizedAt,
      };
    },
  };

  const scoreDelegate = {
    async upsert(args) {
      const key = args.where.responseId_instrumentItemId;
      let row = state.scores.find(
        (candidate) =>
          candidate.responseId === key.responseId &&
          candidate.instrumentItemId === key.instrumentItemId,
      );
      if (row) {
        Object.assign(row, clone(args.update));
      } else {
        row = {
          id: `score-${state.scores.length + 1}`,
          ...clone(args.create),
        };
        state.scores.push(row);
      }
      return clone(row);
    },
  };

  const auditDelegate = {
    async create(args) {
      const row = {
        id: `audit-${state.audits.length + 1}`,
        ...clone(args.data),
      };
      state.audits.push(row);
      return clone(row);
    },
  };

  const database = {
    appraisalParticipant: participantDelegate,
    appraisalResponse: responseDelegate,
    appraisalResponseScore: scoreDelegate,
    auditLog: auditDelegate,
    async $transaction(operation, options) {
      state.transactionOptions.push(clone(options ?? {}));
      const backup = clone({
        participant: state.participant,
        response: state.response,
        scores: state.scores,
        audits: state.audits,
        responseCreateCalls: state.responseCreateCalls,
      });
      try {
        return await operation({
          appraisalParticipant: participantDelegate,
          appraisalResponse: responseDelegate,
          appraisalResponseScore: scoreDelegate,
          auditLog: auditDelegate,
        });
      } catch (error) {
        state.participant = backup.participant;
        state.response = backup.response;
        state.scores = backup.scores;
        state.audits = backup.audits;
        state.responseCreateCalls = backup.responseCreateCalls;
        throw error;
      }
    },
  };

  return { database, state };
}

function scorePayload(section, value = 5) {
  return section.items.map((item) => ({
    itemKey: item.key,
    score: value,
    notApplicable: false,
  }));
}

function input(database, fixture, overrides = {}) {
  return {
    actorUserId: fixture.participant.respondentUserId,
    actorRoleName: "TEACHER",
    tenantId: fixture.participant.respondentTenantId,
    cycleId: fixture.participant.cycleId,
    reqId: "request-headteacher-response-one",
    now: fixture.now,
    database,
    ...overrides,
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

function assertAuditSafe(audits) {
  const serialized = JSON.stringify(audits.map((audit) => audit.metadata ?? {})).toLowerCase();
  for (const forbidden of [
    "headteacher one",
    "teacher-user-one",
    "membership-teacher-one",
    "@",
    "+233",
    "phone",
    "email",
    '"scores"',
    '"score"',
    "overallpercentage",
    "sectionpercentages",
  ]) {
    assert(!serialized.includes(forbidden), "Audit leaked confidential data", {
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
    "headteacherFeedbackResponse.ts",
  );
  const source = fs.readFileSync(modulePath, "utf8");
  const sharedRoutePath = path.join(
    repoRoot,
    "src",
    "app",
    "api",
    "teacher",
    "headteacher-appraisal",
    "_shared.ts",
  );
  const sharedRouteSource = fs.readFileSync(sharedRoutePath, "utf8");
  const cycleRouteSources = [
    path.join(
      repoRoot,
      "src",
      "app",
      "api",
      "teacher",
      "headteacher-appraisal",
      "[cycleId]",
      "route.ts",
    ),
    path.join(
      repoRoot,
      "src",
      "app",
      "api",
      "teacher",
      "headteacher-appraisal",
      "[cycleId]",
      "section",
      "route.ts",
    ),
    path.join(
      repoRoot,
      "src",
      "app",
      "api",
      "teacher",
      "headteacher-appraisal",
      "[cycleId]",
      "finalize",
      "route.ts",
    ),
  ].map((routePath) => fs.readFileSync(routePath, "utf8"));
  const responseModule = require(modulePath);

  const {
    HEADTEACHER_FEEDBACK_RESPONSE_POLICY,
    loadTeacherHeadteacherFeedbackResponse,
    saveTeacherHeadteacherFeedbackSection,
    finalizeTeacherHeadteacherFeedbackResponse,
  } = responseModule;

  assertEqual(
    HEADTEACHER_FEEDBACK_RESPONSE_POLICY.responseTransactionTimeoutMs,
    60_000,
    "Low-network response transaction timeout",
  );

  const strictCycleUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  assert(
    strictCycleUuid.test(
      "33a81419-e0a2-4e7c-a062-d645cc720312",
    ),
    "Real G3A UUID must pass strict cycle validation",
  );
  assert(
    strictCycleUuid.test(
      "00000000-0000-4000-8000-000000000001",
    ),
    "Valid outsider UUID must pass syntax validation",
  );
  assert(
    !strictCycleUuid.test("uat-cycle-outsider-v1"),
    "Malformed cycle identifier must fail before Prisma",
  );

  const fixture = makeFixture();
  const { database, state } = makeDatabase(fixture);
  const sections = fixture.participant.cycle.instrumentVersion.sections;

  const initial = await loadTeacherHeadteacherFeedbackResponse(
    input(database, fixture),
  );
  assertEqual(initial.officialForm.sections.length, 4, "Official section count");
  assertEqual(initial.progress.totalItems, 34, "Official item count");
  assertEqual(initial.responseStatus, "NOT_STARTED", "Initial response status");
  assertEqual(initial.canEdit, true, "Open assignment editable");
  assertEqual(initial.canFinalize, false, "Incomplete assignment not finalizable");
  assertEqual(
    initial.confidentiality.headteacherCanSeeIdentity,
    false,
    "Headteacher identity visibility",
  );
  assertEqual(
    initial.confidentiality.directorIdentityAccessRequiresAuthorizedAudit,
    true,
    "Director identity access caveat",
  );
  assertEqual(
    initial.confidentiality.freeTextCommentsAllowed,
    false,
    "Comments disabled",
  );
  assert(
    !Object.prototype.hasOwnProperty.call(initial, "respondentUserId"),
    "Response view must not expose respondent identity",
  );

  const partial = await saveTeacherHeadteacherFeedbackSection({
    ...input(database, fixture, {
      reqId: "request-partial-section-one",
    }),
    sectionKey: sections[0].key,
    scores: scorePayload(sections[0]).slice(0, 3),
  });
  assertEqual(partial.outcome, "SAVED", "Partial section save");
  assertEqual(partial.progress.answeredItems, 3, "Partial progress");
  assertEqual(state.participant.status, "IN_PROGRESS", "Participant starts");
  assertEqual(state.scores.length, 3, "Partial score count");

  await expectFailure(
    () =>
      finalizeTeacherHeadteacherFeedbackResponse(
        input(database, fixture, {
          reqId: "request-incomplete-finalize",
        }),
      ),
    "HEADTEACHER_FEEDBACK_RESPONSE_INCOMPLETE",
  );

  const fullFirst = await saveTeacherHeadteacherFeedbackSection({
    ...input(database, fixture, {
      reqId: "request-full-section-one",
    }),
    sectionKey: sections[0].key,
    scores: scorePayload(sections[0]),
  });
  assertEqual(fullFirst.progress.answeredItems, 11, "First section complete");
  assertEqual(state.scores.length, 11, "No duplicate partial rows");

  const auditCountBeforeRetry = state.audits.length;
  const repeated = await saveTeacherHeadteacherFeedbackSection({
    ...input(database, fixture, {
      reqId: "request-identical-retry",
    }),
    sectionKey: sections[0].key,
    scores: scorePayload(sections[0]),
  });
  assertEqual(repeated.outcome, "UNCHANGED", "Identical save idempotency");
  assertEqual(state.audits.length, auditCountBeforeRetry, "No duplicate retry audit");

  for (const section of sections.slice(1)) {
    const scores = scorePayload(section);
    if (section === sections[3]) {
      scores[0] = {
        itemKey: section.items[0].key,
        score: null,
        notApplicable: true,
      };
    }
    await saveTeacherHeadteacherFeedbackSection({
      ...input(database, fixture, {
        reqId: `request-section-${section.order}`,
      }),
      sectionKey: section.key,
      scores,
    });
  }

  assertEqual(state.scores.length, 34, "All instrument rows saved once");

  const review = await loadTeacherHeadteacherFeedbackResponse(
    input(database, fixture),
  );
  assertEqual(review.progress.completionPercentage, 100, "Full completion");
  assertEqual(review.progress.completedSections, 4, "All sections complete");
  assertEqual(review.canFinalize, true, "Complete response finalizable");

  const finalized = await finalizeTeacherHeadteacherFeedbackResponse(
    input(database, fixture, {
      reqId: "request-finalize-complete",
    }),
  );
  assertEqual(finalized.outcome, "FINALIZED", "Finalization outcome");
  assertEqual(finalized.overallPercentage, 100, "N/A-aware final percentage");
  assertEqual(finalized.responseHash.length, 64, "SHA-256 response hash");
  assertEqual(state.participant.status, "FINALIZED", "Participant finalized");
  assertEqual(state.response.status, "FINALIZED", "Response finalized");
  assertEqual(state.response.generalComment, null, "Comment remains null");

  const finalizedRetry = await finalizeTeacherHeadteacherFeedbackResponse(
    input(database, fixture, {
      reqId: "request-finalize-retry",
    }),
  );
  assertEqual(
    finalizedRetry.outcome,
    "EXISTING_FINALIZED",
    "Finalize retry idempotency",
  );
  assertEqual(
    finalizedRetry.responseHash,
    finalized.responseHash,
    "Finalize retry preserves hash",
  );

  await expectFailure(
    () =>
      saveTeacherHeadteacherFeedbackSection({
        ...input(database, fixture, {
          reqId: "request-edit-finalized",
        }),
        sectionKey: sections[0].key,
        scores: scorePayload(sections[0], 4),
      }),
    "HEADTEACHER_FEEDBACK_RESPONSE_ALREADY_FINALIZED",
  );

  const wrongRoleFixture = makeFixture();
  const wrongRoleDb = makeDatabase(wrongRoleFixture);
  await expectFailure(
    () =>
      loadTeacherHeadteacherFeedbackResponse(
        input(wrongRoleDb.database, wrongRoleFixture, {
          actorRoleName: "HEADTEACHER",
        }),
      ),
    "HEADTEACHER_FEEDBACK_RESPONSE_TEACHER_ONLY",
  );

  const outsiderFixture = makeFixture();
  const outsiderDb = makeDatabase(outsiderFixture);
  await expectFailure(
    () =>
      loadTeacherHeadteacherFeedbackResponse(
        input(outsiderDb.database, outsiderFixture, {
          actorUserId: "teacher-outsider",
        }),
      ),
    "HEADTEACHER_FEEDBACK_RESPONSE_PARTICIPANT_NOT_FOUND",
  );

  const wrongTenantFixture = makeFixture();
  const wrongTenantDb = makeDatabase(wrongTenantFixture);
  await expectFailure(
    () =>
      loadTeacherHeadteacherFeedbackResponse(
        input(wrongTenantDb.database, wrongTenantFixture, {
          tenantId: "school-two",
        }),
      ),
    "HEADTEACHER_FEEDBACK_RESPONSE_PARTICIPANT_NOT_FOUND",
  );

  const driftFixture = makeFixture();
  driftFixture.participant.cycle.targetTenantId = "school-two";
  const driftDb = makeDatabase(driftFixture);
  await expectFailure(
    () =>
      loadTeacherHeadteacherFeedbackResponse(
        input(driftDb.database, driftFixture),
      ),
    "HEADTEACHER_FEEDBACK_RESPONSE_TENANT_BINDING_INVALID",
  );

  const expiredFixture = makeFixture();
  expiredFixture.participant.cycle.deadlineAt = new Date(
    "2026-07-26T12:00:00.000Z",
  );
  const expiredDb = makeDatabase(expiredFixture);
  await expectFailure(
    () =>
      saveTeacherHeadteacherFeedbackSection({
        ...input(expiredDb.database, expiredFixture),
        sectionKey:
          expiredFixture.participant.cycle.instrumentVersion.sections[0].key,
        scores: scorePayload(
          expiredFixture.participant.cycle.instrumentVersion.sections[0],
        ),
      }),
    "HEADTEACHER_FEEDBACK_RESPONSE_WINDOW_CLOSED",
  );

  const invalidFixture = makeFixture();
  const invalidDb = makeDatabase(invalidFixture);
  await expectFailure(
    () =>
      saveTeacherHeadteacherFeedbackSection({
        ...input(invalidDb.database, invalidFixture),
        sectionKey:
          invalidFixture.participant.cycle.instrumentVersion.sections[0].key,
        scores: [{ itemKey: "99.99", score: 5 }],
      }),
    "HEADTEACHER_FEEDBACK_RESPONSE_ITEM_OUTSIDE_SECTION",
  );

  await expectFailure(
    () =>
      saveTeacherHeadteacherFeedbackSection({
        ...input(invalidDb.database, invalidFixture),
        sectionKey:
          invalidFixture.participant.cycle.instrumentVersion.sections[0].key,
        scores: [
          {
            itemKey:
              invalidFixture.participant.cycle.instrumentVersion.sections[0]
                .items[0].key,
            score: 5,
            notApplicable: true,
          },
        ],
      }),
    "HEADTEACHER_FEEDBACK_RESPONSE_NA_WITH_SCORE",
  );

  await expectFailure(
    () =>
      saveTeacherHeadteacherFeedbackSection({
        ...input(invalidDb.database, invalidFixture, {
          generalComment: "This must not be accepted.",
        }),
        sectionKey:
          invalidFixture.participant.cycle.instrumentVersion.sections[0].key,
        scores: scorePayload(
          invalidFixture.participant.cycle.instrumentVersion.sections[0],
        ),
      }),
    "HEADTEACHER_FEEDBACK_RESPONSE_COMMENTS_FORBIDDEN",
  );

  assert(
    state.transactionOptions.every(
      (options) =>
        options.isolationLevel === "Serializable" &&
        options.maxWait ===
          HEADTEACHER_FEEDBACK_RESPONSE_POLICY.responseTransactionMaxWaitMs &&
        options.timeout ===
          HEADTEACHER_FEEDBACK_RESPONSE_POLICY.responseTransactionTimeoutMs,
    ),
    "All response transactions must remain serializable and bounded",
    state.transactionOptions,
  );

  assert(
    sharedRouteSource.includes("export function isUuidIdentifier") &&
      sharedRouteSource.includes(
        "/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i",
      ),
    "UUID-specific cycle identifier helper missing",
  );
  assert(
    cycleRouteSources.every(
      (routeSource) =>
        routeSource.includes("isUuidIdentifier") &&
        routeSource.includes("if (!isUuidIdentifier(cycleId))") &&
        !routeSource.includes("isLikelyIdentifier(cycleId)"),
    ),
    "Teacher cycle routes must reject malformed UUIDs before Prisma",
  );

  assertAuditSafe(state.audits);
  assert(
    state.audits.every(
      (audit) =>
        audit.metadata?.scoreValuesRecordedInAudit === false &&
        audit.metadata?.respondentIdentityCopiedIntoAudit === false,
    ),
    "Audit privacy markers",
  );

  for (const forbidden of [
    "appraisalNotification",
    "AppraisalNotificationChannel",
    "sendSms",
    "sendEmail",
    "fetch(",
    "providerMessageId",
  ]) {
    assert(!source.includes(forbidden), "D1 must not seed or deliver notifications", {
      forbidden,
    });
  }

  assert(
    source.includes("ACTIVE_TEACHER_MEMBERSHIP_AT_CYCLE_OPEN"),
    "Frozen teacher eligibility must be verified",
  );
  assert(
    source.includes("HEADTEACHER_FEEDBACK_RESPONSE_COMMENTS_FORBIDDEN"),
    "Comment rejection contract missing",
  );
  assert(
    source.includes("calculateAppraisalScores"),
    "Shared N/A-aware scoring must be reused",
  );

  console.log("");
  console.log("=== D3.4D1 TEACHER HEADTEACHER-FEEDBACK RESPONSE ENGINE ===");
  console.log("");
  console.log("Published form sections/items : 4 / 34");
  console.log("Authenticated respondent       : frozen same-school Teacher only");
  console.log("Tenant binding                 : teacher = cycle = target school");
  console.log("Save unit                      : partial or complete section");
  console.log("Repeated save                  : idempotent, no duplicate audit");
  console.log("N/A handling                   : excluded from denominator");
  console.log("Finalization completeness      : all 34 items answered or N/A");
  console.log("Finalized response             : immutable + SHA-256 proof");
  console.log("Finalization retry             : EXISTING_FINALIZED");
  console.log("Headteacher identity access    : forbidden");
  console.log("Director identity caveat       : authorized audited workflow only");
  console.log("Free-text comments             : rejected");
  console.log("Audit score/identity leakage   : absent");
  console.log("Transaction                    : serializable, 60-second low-network bound");
  console.log("Notifications/providers        : absent");
  console.log("Database accessed              : false");
  console.log("");
  console.log("RESULT: D3.4D1 HEADTEACHER RESPONSE ENGINE GREEN");
}

main().catch((error) => {
  console.error("");
  console.error("RESULT: D3.4D1 HEADTEACHER RESPONSE ENGINE FAILED");
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
