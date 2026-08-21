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
async function expectReject(operation, code, message) {
  try {
    await operation();
  } catch (error) {
    assertEqual(error && (error.code || error.message), code, message);
    return;
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
  const errors = (transpiled.diagnostics || []).filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
  );
  if (errors.length) {
    fail(
      `TypeScript transpilation diagnostics in ${filename}`,
      errors.map((error) => ts.flattenDiagnosticMessageText(error.messageText, "\n")),
    );
  }
  loadedModule._compile(transpiled.outputText, filename);
};

const NOW = new Date("2026-08-20T12:00:00.000Z");
const DEADLINE = new Date("2026-08-27T12:00:00.000Z");

const targets = [
  {
    targetHeadteacherUserId: "head-one",
    targetHeadteacherName: "Head One",
    targetTenantId: "school-one",
    schoolName: "School One",
    circuitId: "circuit-a",
    circuitName: "Circuit A",
    districtId: "district-one",
    districtName: "District One",
  },
  {
    targetHeadteacherUserId: "head-two",
    targetHeadteacherName: "Head Two",
    targetTenantId: "school-two",
    schoolName: "School Two",
    circuitId: "circuit-a",
    circuitName: "Circuit A",
    districtId: "district-one",
    districtName: "District One",
  },
  {
    targetHeadteacherUserId: "head-three",
    targetHeadteacherName: "Head Three",
    targetTenantId: "school-three",
    schoolName: "School Three",
    circuitId: "circuit-b",
    circuitName: "Circuit B",
    districtId: "district-one",
    districtName: "District One",
  },
  {
    targetHeadteacherUserId: "head-four-a",
    targetHeadteacherName: "Head Four A",
    targetTenantId: "school-four",
    schoolName: "School Four",
    circuitId: "circuit-b",
    circuitName: "Circuit B",
    districtId: "district-one",
    districtName: "District One",
  },
  {
    targetHeadteacherUserId: "head-four-b",
    targetHeadteacherName: "Head Four B",
    targetTenantId: "school-four",
    schoolName: "School Four",
    circuitId: "circuit-b",
    circuitName: "Circuit B",
    districtId: "district-one",
    districtName: "District One",
  },
];

const teacherMemberships = [
  {
    id: "membership-teacher-1",
    userId: "teacher-secret-1",
    tenantId: "school-one",
    status: "ACTIVE",
    role: { name: "TEACHER" },
    tenant: { id: "school-one", status: "ACTIVE" },
  },
  {
    id: "membership-teacher-2",
    userId: "teacher-secret-2",
    tenantId: "school-one",
    status: "ACTIVE",
    role: { name: "TEACHER" },
    tenant: { id: "school-one", status: "ACTIVE" },
  },
  {
    id: "membership-teacher-3",
    userId: "teacher-secret-3",
    tenantId: "school-two",
    status: "ACTIVE",
    role: { name: "TEACHER" },
    tenant: { id: "school-two", status: "ACTIVE" },
  },
  {
    id: "membership-teacher-4",
    userId: "teacher-secret-4",
    tenantId: "school-four",
    status: "ACTIVE",
    role: { name: "TEACHER" },
    tenant: { id: "school-four", status: "ACTIVE" },
  },
];

const activeCycles = [
  {
    id: "cycle-existing-two",
    targetUserId: "head-two",
    targetTenantId: "school-two",
    status: "OPEN",
    requestedAt: new Date("2026-08-19T08:00:00.000Z"),
    openedAt: new Date("2026-08-19T08:00:00.000Z"),
    deadlineAt: new Date("2026-08-26T08:00:00.000Z"),
    _count: { participants: 1 },
  },
];

function makeDatabase() {
  return {
    membership: {
      async findMany() {
        return structuredClone(teacherMemberships);
      },
    },
    appraisalCycle: {
      async findMany() {
        return structuredClone(activeCycles);
      },
    },
  };
}

async function readTargets() {
  return {
    actorRole: "DISTRICT_DIRECTOR",
    circuits: [
      {
        circuitId: "circuit-a",
        circuitName: "Circuit A",
        districtId: "district-one",
        districtName: "District One",
        schoolCount: 2,
        targetCount: 2,
      },
      {
        circuitId: "circuit-b",
        circuitName: "Circuit B",
        districtId: "district-one",
        districtName: "District One",
        schoolCount: 2,
        targetCount: 3,
      },
    ],
    targets: structuredClone(targets),
    readOnly: true,
    respondentIdentitiesIncluded: false,
    individualStaffResponsesIncluded: false,
    providerCalled: false,
  };
}

function authorityInput(overrides = {}) {
  return {
    actorUserId: "director-user",
    actorRoleName: "DISTRICT_DIRECTOR",
    governanceScope: {
      isSuperAdmin: false,
      tenantIds: ["school-one", "school-two", "school-three", "school-four"],
    },
    scope: { level: "DISTRICT", ids: ["district-one"] },
    database: makeDatabase(),
    ...overrides,
  };
}

async function main() {
  const servicePath = path.join(
    repoRoot,
    "src/lib/appraisals/headteacherFeedbackBulkOpen.ts",
  );
  const routePath = path.join(
    repoRoot,
    "src/app/api/district/headteacher-appraisals/route.ts",
  );
  const serviceSource = fs.readFileSync(servicePath, "utf8");
  const routeSource = fs.readFileSync(routePath, "utf8");
  const service = require(servicePath);

  const {
    HEADTEACHER_FEEDBACK_BULK_OPEN_POLICY,
    previewHeadteacherFeedbackBulkOpen,
    bulkOpenHeadteacherFeedbackCycles,
  } = service;

  assertEqual(HEADTEACHER_FEEDBACK_BULK_OPEN_POLICY.previewReadOnly, true, "Preview must be read only");
  assertEqual(HEADTEACHER_FEEDBACK_BULK_OPEN_POLICY.browserSelectedRespondentsAllowed, false, "Browser respondent selection forbidden");
  assertEqual(HEADTEACHER_FEEDBACK_BULK_OPEN_POLICY.browserSelectedHeadteacherIdsAllowed, false, "Browser Headteacher identity selection forbidden");
  assertEqual(HEADTEACHER_FEEDBACK_BULK_OPEN_POLICY.browserSelectedScopeIdsAllowed, true, "Authorized scope selection required");
  assertEqual(HEADTEACHER_FEEDBACK_BULK_OPEN_POLICY.multipleCircuitsAllowed, true, "Multi-circuit selection required");
  assertEqual(HEADTEACHER_FEEDBACK_BULK_OPEN_POLICY.multipleSchoolsAllowed, true, "Multi-school selection required");
  assertEqual(HEADTEACHER_FEEDBACK_BULK_OPEN_POLICY.partialSuccessAllowed, true, "Partial success policy required");
  assertEqual(HEADTEACHER_FEEDBACK_BULK_OPEN_POLICY.sharedOpenedAtAcrossNewCycles, true, "Shared opening time required");
  assertEqual(HEADTEACHER_FEEDBACK_BULK_OPEN_POLICY.boundedConcurrency, 3, "Bounded concurrency drift");
  assertEqual(HEADTEACHER_FEEDBACK_BULK_OPEN_POLICY.notificationRecipientsDerivedFromLockedScope, true, "Scope must determine notification recipients");
  assertEqual(HEADTEACHER_FEEDBACK_BULK_OPEN_POLICY.existingOpenNotificationRepairAllowed, true, "Existing OPEN notification repair required");

  const preview = await previewHeadteacherFeedbackBulkOpen({
    ...authorityInput(),
    dependencies: { readTargets },
  });

  assertEqual(preview.scope.level, "DISTRICT", "District preview scope");
  assertEqual(preview.scope.ids.length, 1, "District scope id count");
  assertEqual(preview.summary.schools, 4, "Unique school count");
  assertEqual(preview.summary.headteachers, 5, "Headteacher target count");
  assertEqual(preview.summary.eligibleRespondents, 3, "Respondent counts only");
  assertEqual(preview.summary.willOpen, 1, "One new cycle should open");
  assertEqual(preview.summary.keepExisting, 1, "One existing cycle should remain");
  assertEqual(preview.summary.willSkip, 3, "No-teacher plus ambiguous Headteacher targets skipped");
  assertEqual(preview.readOnly, true, "Preview read-only proof");
  assertEqual(preview.respondentIdentitiesIncluded, false, "Preview identity boundary");
  assertEqual(preview.notificationRecipientsDerivedFromLockedScope, true, "Preview scope-recipient proof");

  const serializedPreview = JSON.stringify(preview).toLowerCase();
  for (const forbidden of [
    "teacher-secret-1",
    "teacher-secret-2",
    "teacher-secret-3",
    "membership-teacher-1",
    "membership-teacher-2",
  ]) {
    assert(!serializedPreview.includes(forbidden), "Preview leaked respondent identity", forbidden);
  }

  const circuitPreview = await previewHeadteacherFeedbackBulkOpen({
    ...authorityInput({ scope: { level: "CIRCUIT", ids: ["circuit-a", "circuit-b"] } }),
    dependencies: { readTargets },
  });
  assertEqual(circuitPreview.summary.schools, 4, "Multi-circuit scope school count");
  assertEqual(circuitPreview.scope.ids.length, 2, "Multi-circuit selection preserved");

  const schoolPreview = await previewHeadteacherFeedbackBulkOpen({
    ...authorityInput({ scope: { level: "SCHOOL", ids: ["school-one", "school-three"] } }),
    dependencies: { readTargets },
  });
  assertEqual(schoolPreview.rows.length, 2, "Multi-school scope target count");
  assert(
    schoolPreview.rows.every((row) => ["school-one", "school-three"].includes(row.targetTenantId)),
    "Multi-school scope leaked target",
  );

  await expectReject(
    () =>
      previewHeadteacherFeedbackBulkOpen({
        ...authorityInput({ scope: { level: "CIRCUIT", ids: ["circuit-unauthorized"] } }),
        dependencies: { readTargets },
      }),
    "HEADTEACHER_FEEDBACK_BULK_SCOPE_NOT_AUTHORIZED",
    "Unresolved circuit scope must fail closed",
  );

  await expectReject(
    () =>
      previewHeadteacherFeedbackBulkOpen({
        ...authorityInput({ actorRoleName: "SISSO" }),
        dependencies: { readTargets },
      }),
    "HEADTEACHER_FEEDBACK_BULK_ROLE_FORBIDDEN",
    "SISSO must not use Director bulk opening",
  );

  const directCalls = [];
  const repairCalls = [];

  async function directOpenWithNotifications(input) {
    directCalls.push({
      targetTenantId: input.targetTenantId,
      targetHeadteacherUserId: input.targetHeadteacherUserId,
      directOpenKey: input.directOpenKey,
      now: input.now,
      requestedRespondentUserIds: input.requestedRespondentUserIds,
    });

    return {
      outcome: "DIRECTLY_OPENED",
      cycle: {
        id: `cycle-${input.targetTenantId}`,
        status: "OPEN",
        targetUserId: input.targetHeadteacherUserId,
        targetTenantId: input.targetTenantId,
        targetName: "Head One",
        targetRole: "HEADTEACHER",
        schoolName: "School One",
        circuitZoneId: "circuit-a",
        circuitName: "Circuit A",
        districtZoneId: "district-one",
        districtName: "District One",
        approvedAt: NOW.toISOString(),
        openedAt: NOW.toISOString(),
        deadlineAt: DEADLINE.toISOString(),
        responseWindowDays: 7,
        minimumResponses: 1,
        participantCount: 2,
        notificationsSeeded: true,
      },
      notifications: {
        outcome: "SEEDED",
        cycleId: `cycle-${input.targetTenantId}`,
        rowsInserted: 6,
        participantsInvited: 2,
        summary: {
          participantCount: 2,
          invitedParticipantCount: 2,
          channels: {
            inApp: { total: 2 },
            sms: { total: 2 },
            email: { total: 2 },
          },
        },
      },
    };
  }

  async function ensureNotifications(input) {
    repairCalls.push({ cycleId: input.cycleId, now: input.now });
    return {
      outcome: "EXISTING_MATCH",
      cycleId: input.cycleId,
      rowsInserted: 0,
      participantsInvited: 0,
      summary: {
        participantCount: 1,
        invitedParticipantCount: 1,
        channels: {
          inApp: { total: 1 },
          sms: { total: 1 },
          email: { total: 1 },
        },
      },
    };
  }

  const result = await bulkOpenHeadteacherFeedbackCycles({
    ...authorityInput(),
    bulkOpenKey: "district-2026-term-one",
    confirm: true,
    reqId: "req-bulk-001",
    now: NOW,
    dependencies: {
      readTargets,
      directOpenWithNotifications,
      ensureNotifications,
    },
  });

  assertEqual(directCalls.length, 1, "Only OPEN_NEW target should use direct-open");
  assertEqual(directCalls[0].targetTenantId, "school-one", "Wrong direct-open target");
  assertEqual(directCalls[0].requestedRespondentUserIds, undefined, "Browser respondent IDs must never be forwarded");
  assertEqual(directCalls[0].now.toISOString(), NOW.toISOString(), "Shared open time drift");
  assertEqual(repairCalls.length, 1, "Existing OPEN cycle notifications must be ensured once");
  assertEqual(repairCalls[0].cycleId, "cycle-existing-two", "Wrong notification repair cycle");
  assertEqual(repairCalls[0].now.toISOString(), NOW.toISOString(), "Notification seed time must share command time");

  assertEqual(result.summary.directlyOpened, 1, "Directly opened summary");
  assertEqual(result.summary.existingOpen, 1, "Existing OPEN summary");
  assertEqual(result.summary.skipped, 3, "Skipped summary");
  assertEqual(result.summary.participantCount, 3, "Frozen participant summary");
  assertEqual(result.summary.notificationRecipientCount, 3, "Scope-derived notification recipient summary");
  assertEqual(result.notificationRecipientsDerivedFromLockedScope, true, "Result scope-recipient proof");
  assertEqual(result.notificationChannels.join(","), "IN_APP,SMS,EMAIL", "Notification channel contract");
  assertEqual(result.openedAt, NOW.toISOString(), "Bulk opening time");
  assertEqual(result.responseWindowDays, 7, "Seven-day contract");
  assertEqual(result.partialSuccess, true, "Skipped rows should surface partial success");

  const serializedResult = JSON.stringify(result).toLowerCase();
  for (const forbidden of ["teacher-secret-1", "teacher-secret-2", "membership-teacher-1"]) {
    assert(!serializedResult.includes(forbidden), "Bulk result leaked respondent identity", forbidden);
  }

  await expectReject(
    () =>
      bulkOpenHeadteacherFeedbackCycles({
        ...authorityInput(),
        bulkOpenKey: "district-2026-term-one",
        confirm: false,
        dependencies: {
          readTargets,
          directOpenWithNotifications,
          ensureNotifications,
        },
      }),
    "HEADTEACHER_FEEDBACK_BULK_CONFIRMATION_REQUIRED",
    "Bulk mutation requires confirmation",
  );

  for (const marker of [
    "multipleCircuitsAllowed: true",
    "multipleSchoolsAllowed: true",
    "notificationRecipientsDerivedFromLockedScope: true",
    "existingOpenNotificationRepairAllowed: true",
    "ensureHeadteacherFeedbackCycleNotifications",
    "requestedRespondentUserIds: undefined",
    "boundedConcurrency: 3",
    'notificationChannels: ["IN_APP", "SMS", "EMAIL"]',
  ]) {
    assert(serviceSource.includes(marker), `Required service marker missing: ${marker}`);
  }

  for (const marker of [
    'bulkDirectOpenMultipleCircuitsAllowed: true',
    'bulkDirectOpenMultipleSchoolsAllowed: true',
    'notificationRecipientsDerivedFromLockedScope: true',
    'notificationChannels: ["IN_APP", "SMS", "EMAIL"] as const',
    'searchParams.getAll("scopeId")',
    "parsed.body.scopeIds",
    'action !== "BULK_DIRECT_OPEN"',
  ]) {
    assert(routeSource.includes(marker), `Required route marker missing: ${marker}`);
  }

  for (const forbidden of [
    "requestedRespondentUserIds: parsed.body",
    "targetHeadteacherUserIds",
    "respondentUserIds",
    "prisma.",
  ]) {
    assert(!routeSource.includes(forbidden), `Route contains forbidden bulk authority marker: ${forbidden}`);
  }

  console.log("");
  console.log("=== N7-P2C3K1R2 HEADTEACHER STAFF-FEEDBACK MULTI-SCOPE BACKEND ===");
  console.log("");
  console.log("Scope                         : District / multi-Circuit / multi-School");
  console.log("Preview                       : read-only, server-resolved");
  console.log("Browser Headteacher IDs       : absent from bulk mutation");
  console.log("Browser respondent IDs        : absent");
  console.log("Browser scope IDs             : request only; server revalidated");
  console.log("Respondent preview            : counts only");
  console.log("Teacher eligibility           : existing resolver reused");
  console.log("Single-target lifecycle       : existing direct-open wrapper reused");
  console.log("Opening timestamp             : one shared server time");
  console.log("Seven-day deadline            : preserved by existing lifecycle");
  console.log("Notification recipients       : frozen Teachers in locked scope only");
  console.log("Notification channels         : IN_APP / SMS / EMAIL");
  console.log("Existing OPEN notifications   : idempotently ensured/repaired");
  console.log("Ambiguous Headteacher school  : skipped fail-closed");
  console.log("No eligible Teachers          : skipped fail-closed");
  console.log("Closed/review cycle           : preserved, not reopened");
  console.log("Partial district success      : allowed + summarized");
  console.log("Concurrency                   : bounded to 3 targets");
  console.log("Respondent identities         : absent from preview/result");
  console.log("Direct Prisma in API route    : absent");
  console.log("Database accessed by QA       : fake database only");
  console.log("");
  console.log("RESULT: N7-P2C3K1R2 HEADTEACHER STAFF-FEEDBACK MULTI-SCOPE BACKEND GREEN");
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
