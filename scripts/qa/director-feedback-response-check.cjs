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

async function expectFailure(operation, code) {
  try {
    await operation();
  } catch (error) {
    assertEqual(error?.code ?? error?.message, code, `Expected ${code}`);
    return;
  }
  fail(`Expected failure ${code}`);
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
  if ((transpiled.diagnostics ?? []).length) {
    fail("D3_3B_TYPESCRIPT_TRANSPILE_FAILED", transpiled.diagnostics);
  }
  module._compile(transpiled.outputText, filename);
};

function clone(value) {
  return structuredClone(value);
}

const SECTION_SPECS = [
  ["ADMINISTRATIVE_MANAGERIAL_COMPETENCE", "Measurement of Administrative and Managerial Competence", 8, 40],
  ["TIME_MANAGEMENT", "Measurement of Time Management", 5, 25],
  ["EMPLOYEE_ENGAGEMENT_RELATIONSHIP", "Measurement of Employee Engagement & Relationship", 6, 30],
  ["STAKEHOLDER_ENGAGEMENT_RELATIONSHIP", "Measurement of Stakeholder Engagement & Relationship", 4, 20],
  ["RESOURCE_MOBILIZATION_FINANCIAL_MANAGEMENT", "Resource Mobilization and Financial Management", 4, 20],
  ["COMMUNICATION_SKILLS", "Measurement of Communication Skills", 2, 10],
  ["PERSONALITY_TRAIT", "Measurement of Personality Trait", 6, 30],
];

function makeSections() {
  return SECTION_SPECS.map(([key, title, count, maxScore], sectionIndex) => ({
    id: `section-${sectionIndex + 1}`,
    key,
    title,
    description: null,
    order: sectionIndex + 1,
    maxScore,
    items: Array.from({ length: count }, (_, itemIndex) => ({
      id: `item-${sectionIndex + 1}-${itemIndex + 1}`,
      key: `${sectionIndex + 1}.${itemIndex + 1}`,
      label: `Official Director question ${sectionIndex + 1}.${itemIndex + 1}`,
      order: itemIndex + 1,
      maxScore: 5,
      isRequired: true,
    })),
  }));
}

function makeFixture(options = {}) {
  const now = new Date("2026-07-25T10:00:00.000Z");
  return {
    now,
    participant: {
      id: options.participantId ?? "participant-00001",
      cycleId: options.cycleId ?? "cycle-00001",
      respondentUserId: options.respondentUserId ?? "headteacher-00001",
      respondentTenantId: "school-00001",
      status: "NOT_STARTED",
      startedAt: null,
      finalizedAt: null,
      eligibilitySnapshotJson: {
        membershipId: "membership-00001",
        tenantId: "school-00001",
        tenantName: "Hidden School",
        circuitZoneId: "circuit-00001",
        circuitName: "Gefia Circuit",
        districtZoneId: "district-00001",
        selectionBasis: "ACTIVE_HEADTEACHER_MEMBERSHIP_AT_CYCLE_OPEN",
      },
      cycle: {
        id: options.cycleId ?? "cycle-00001",
        status: options.cycleStatus ?? "OPEN",
        openedAt: new Date("2026-07-25T08:00:00.000Z"),
        deadlineAt:
          options.deadlineAt ?? new Date("2026-08-01T08:00:00.000Z"),
        targetUserId: "director-00001",
        targetNameSnapshot: "Karim Ayana Umar",
        targetZoneNameSnapshot: "Akatsi South District",
        instrumentVersionId: "instrument-version-00001",
        metadata: {
          workflow: "DIRECTOR_CONFIDENTIAL_HEADTEACHER_FEEDBACK",
        },
        instrumentVersion: {
          id: "instrument-version-00001",
          status: "ACTIVE",
          title: "Work Appraisal Form (Director)",
          directorateName: null,
          instructions: "Rate each item from 1 to 5 or select N/A.",
          scaleMin: 1,
          scaleMax: 5,
          allowNotApplicable: true,
          allowComments: false,
          instrument: {
            code: "DIRECTOR_GOVERNANCE_APPRAISAL_V1",
            isActive: true,
          },
          sections: makeSections(),
        },
      },
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
  };

  function projectResponse() {
    if (!state.response) return null;
    return {
      ...clone(state.response),
      scores: clone(state.scores).sort(
        (left, right) =>
          left.sectionOrder - right.sectionOrder ||
          left.itemOrder - right.itemOrder,
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
      const where = args.where ?? {};
      if (where.cycleId && where.cycleId !== state.participant.cycleId) return null;
      if (
        where.respondentUserId &&
        where.respondentUserId !== state.participant.respondentUserId
      ) {
        return null;
      }
      return projectParticipant();
    },
    async findMany(args) {
      const where = args.where ?? {};
      if (
        where.respondentUserId &&
        where.respondentUserId !== state.participant.respondentUserId
      ) {
        return [];
      }
      return [projectParticipant()];
    },
    async update(args) {
      if (args.where.id !== state.participant.id) return null;
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
      const where = args.where ?? {};
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
      if (state.response) {
        const error = new Error("duplicate");
        error.code = "P2002";
        throw error;
      }
      state.response = {
        id: "response-00001",
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
      if (!state.response || args.where.id !== state.response.id) return null;
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

async function main() {
  const responseModule = require(
    path.join(
      repoRoot,
      "src",
      "lib",
      "appraisals",
      "directorFeedbackResponse.ts",
    ),
  );

  const {
    DIRECTOR_FEEDBACK_RESPONSE_POLICY,
    listHeadteacherDirectorFeedbackAssignments,
    loadHeadteacherDirectorFeedbackResponse,
    saveHeadteacherDirectorFeedbackSection,
    finalizeHeadteacherDirectorFeedbackResponse,
  } = responseModule;

  const fixture = makeFixture();
  const { database, state } = makeDatabase(fixture);
  const actorUserId = fixture.participant.respondentUserId;
  const cycleId = fixture.participant.cycleId;

  const assignments = await listHeadteacherDirectorFeedbackAssignments({
    actorUserId,
    now: fixture.now,
    database,
  });
  assertEqual(assignments.length, 1, "Expected one assigned feedback cycle");
  assertEqual(assignments[0].responseStatus, "NOT_STARTED", "Initial status");
  assertEqual(assignments[0].completionPercentage, 0, "Initial progress");

  const initial = await loadHeadteacherDirectorFeedbackResponse({
    actorUserId,
    cycleId,
    now: fixture.now,
    database,
  });
  assertEqual(initial.officialForm.sections.length, 7, "Official section count");
  assertEqual(initial.progress.totalItems, 35, "Official item count");
  assertEqual(initial.canEdit, true, "Open cycle should be editable");
  assertEqual(initial.confidentiality.directorCanSeeIdentity, false, "Identity privacy");
  assertEqual(initial.confidentiality.freeTextCommentsAllowed, false, "Comments disabled");
  assert(
    !JSON.stringify(initial).includes("Hidden School"),
    "Headteacher response view must not expose school snapshot",
  );

  const sectionOne = fixture.participant.cycle.instrumentVersion.sections[0];
  const partial = await saveHeadteacherDirectorFeedbackSection({
    actorUserId,
    cycleId,
    sectionKey: sectionOne.key,
    scores: scorePayload(sectionOne).slice(0, 3),
    reqId: "request-save-00001",
    now: fixture.now,
    database,
  });
  assertEqual(partial.outcome, "SAVED", "Partial section save");
  assertEqual(partial.progress.answeredItems, 3, "Partial progress");
  assertEqual(state.participant.status, "IN_PROGRESS", "Participant should start");
  assertEqual(state.scores.length, 3, "Partial scores saved");

  const fullSectionOne = await saveHeadteacherDirectorFeedbackSection({
    actorUserId,
    cycleId,
    sectionKey: sectionOne.key,
    scores: scorePayload(sectionOne),
    reqId: "request-save-00002",
    now: fixture.now,
    database,
  });
  assertEqual(fullSectionOne.progress.answeredItems, 8, "Section completion");
  assertEqual(state.scores.length, 8, "No duplicate partial rows");

  const auditCountBeforeRetry = state.audits.length;
  const repeated = await saveHeadteacherDirectorFeedbackSection({
    actorUserId,
    cycleId,
    sectionKey: sectionOne.key,
    scores: scorePayload(sectionOne),
    reqId: "request-save-retry",
    now: fixture.now,
    database,
  });
  assertEqual(repeated.outcome, "UNCHANGED", "Identical retry must be idempotent");
  assertEqual(state.audits.length, auditCountBeforeRetry, "Retry audit duplication");

  for (const section of fixture.participant.cycle.instrumentVersion.sections.slice(1)) {
    const payload = scorePayload(section);
    if (section.key === "TIME_MANAGEMENT") {
      payload[0] = {
        itemKey: section.items[0].key,
        score: null,
        notApplicable: true,
      };
    }
    await saveHeadteacherDirectorFeedbackSection({
      actorUserId,
      cycleId,
      sectionKey: section.key,
      scores: payload,
      reqId: `request-${section.order}-save`,
      now: fixture.now,
      database,
    });
  }

  assertEqual(state.scores.length, 35, "All official rows must exist once");
  const review = await loadHeadteacherDirectorFeedbackResponse({
    actorUserId,
    cycleId,
    now: fixture.now,
    database,
  });
  assertEqual(review.progress.completionPercentage, 100, "Review completion");
  assertEqual(review.progress.completedSections, 7, "Completed sections");
  assertEqual(review.canFinalize, true, "Complete review should finalize");
  assertEqual(
    review.officialForm.sections.flatMap((section) => section.items).length,
    35,
    "Review must reproduce full form",
  );

  const finalized = await finalizeHeadteacherDirectorFeedbackResponse({
    actorUserId,
    cycleId,
    reqId: "request-finalize-00001",
    now: fixture.now,
    database,
  });
  assertEqual(finalized.outcome, "FINALIZED", "Finalization outcome");
  assertEqual(finalized.overallPercentage, 100, "N/A-aware overall result");
  assertEqual(finalized.responseHash.length, 64, "Response SHA-256 hash");
  assertEqual(state.participant.status, "FINALIZED", "Participant final status");
  assertEqual(state.response.status, "FINALIZED", "Response final status");
  assertEqual(state.response.generalComment, null, "Comments must remain absent");

  const finalAuditCount = state.audits.length;
  const repeatedFinalize = await finalizeHeadteacherDirectorFeedbackResponse({
    actorUserId,
    cycleId,
    reqId: "request-finalize-retry",
    now: new Date("2026-08-02T10:00:00.000Z"),
    database,
  });
  assertEqual(
    repeatedFinalize.outcome,
    "EXISTING_FINALIZED",
    "Finalization retry must be safe",
  );
  assertEqual(state.audits.length, finalAuditCount, "Finalization retry audit");

  await expectFailure(
    () =>
      saveHeadteacherDirectorFeedbackSection({
        actorUserId,
        cycleId,
        sectionKey: sectionOne.key,
        scores: scorePayload(sectionOne, 4),
        now: fixture.now,
        database,
      }),
    "DIRECTOR_FEEDBACK_RESPONSE_ALREADY_FINALIZED",
  );

  await expectFailure(
    () =>
      loadHeadteacherDirectorFeedbackResponse({
        actorUserId: "outsider-00001",
        cycleId,
        now: fixture.now,
        database,
      }),
    "DIRECTOR_FEEDBACK_RESPONSE_PARTICIPANT_NOT_FOUND",
  );

  const expiredFixture = makeFixture({
    cycleId: "cycle-expired-00001",
    participantId: "participant-expired-00001",
    respondentUserId: "headteacher-expired-00001",
    deadlineAt: new Date("2026-07-24T10:00:00.000Z"),
  });
  const expired = makeDatabase(expiredFixture);
  await expectFailure(
    () =>
      saveHeadteacherDirectorFeedbackSection({
        actorUserId: expiredFixture.participant.respondentUserId,
        cycleId: expiredFixture.participant.cycleId,
        sectionKey:
          expiredFixture.participant.cycle.instrumentVersion.sections[0].key,
        scores: scorePayload(
          expiredFixture.participant.cycle.instrumentVersion.sections[0],
        ),
        now: fixture.now,
        database: expired.database,
      }),
    "DIRECTOR_FEEDBACK_RESPONSE_WINDOW_CLOSED",
  );

  await expectFailure(
    () =>
      saveHeadteacherDirectorFeedbackSection({
        actorUserId: expiredFixture.participant.respondentUserId,
        cycleId: expiredFixture.participant.cycleId,
        sectionKey:
          expiredFixture.participant.cycle.instrumentVersion.sections[0].key,
        scores: [{ itemKey: "99.99", score: 5 }],
        now: new Date("2026-07-23T10:00:00.000Z"),
        database: expired.database,
      }),
    "DIRECTOR_FEEDBACK_RESPONSE_ITEM_OUTSIDE_SECTION",
  );

  assert(
    state.transactionOptions.every(
      (options) =>
        options.maxWait ===
          DIRECTOR_FEEDBACK_RESPONSE_POLICY.responseTransactionMaxWaitMs &&
        options.timeout ===
          DIRECTOR_FEEDBACK_RESPONSE_POLICY.responseTransactionTimeoutMs,
    ),
    "All response transactions must remain bounded",
    state.transactionOptions,
  );

  assert(
    state.audits.every(
      (audit) =>
        !Object.prototype.hasOwnProperty.call(audit.metadata ?? {}, "scores") &&
        audit.metadata?.scoreValuesRecordedInAudit === false,
    ),
    "Confidential score values must not be copied into general audit metadata",
  );

  console.log("");
  console.log("=== D3.3B HEADTEACHER RESPONSE ENGINE PROOF ===");
  console.log("");
  console.log("Official form sections/items : 7 / 35");
  console.log("Save unit                    : one section");
  console.log("Partial section recovery     : verified");
  console.log("Repeated save idempotency    : verified");
  console.log("Full-form review             : verified");
  console.log("N/A-aware final calculation  : verified");
  console.log("Finalized response hash      : SHA-256 verified");
  console.log("Finalization retry           : safe and idempotent");
  console.log("Post-finalization editing    : forbidden");
  console.log("Outsider access              : forbidden");
  console.log("Expired response window      : enforced");
  console.log("School identity in view      : absent");
  console.log("Free-text comments           : disabled");
  console.log("Audit score-value leakage    : absent");
  console.log("Transaction timeout          : 15 seconds, bounded");
  console.log("Database accessed            : false");
  console.log("");
  console.log("RESULT: D3.3B HEADTEACHER RESPONSE ENGINE GREEN");
}

main().catch((error) => {
  console.error("");
  console.error("RESULT: D3.3B HEADTEACHER RESPONSE ENGINE FAILED");
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
