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
function equal(actual, expected, message) {
  if (actual !== expected) fail(message, { actual, expected });
}
function read(relativePath) {
  const absolute = path.join(repoRoot, relativePath);
  assert(fs.existsSync(absolute), "D3_4E3_REQUIRED_FILE_MISSING", { relativePath });
  return fs.readFileSync(absolute, "utf8");
}
function contains(source, marker, label) {
  assert(source.includes(marker), `D3_4E3_MARKER_MISSING:${label}`, { marker });
}
function excludes(source, marker, label) {
  assert(!source.includes(marker), `D3_4E3_FORBIDDEN_MARKER:${label}`, { marker });
}

const originalLoader = Module._load;
const originalTs = require.extensions[".ts"];
let approveCalls = 0;
let directCalls = 0;

const enumObject = (values) => Object.fromEntries(values.map((value) => [value, value]));
const prismaClientMock = {
  AppraisalNotificationChannel: enumObject(["IN_APP", "SMS", "EMAIL"]),
  AppraisalNotificationStatus: enumObject([
    "PENDING", "PROCESSING", "SENT", "FAILED", "SKIPPED", "CANCELLED", "DEAD",
  ]),
  AppraisalNotificationType: enumObject([
    "REQUEST_SUBMITTED", "CYCLE_OPENED", "DEADLINE_EXTENDED", "DEADLINE_REMINDER",
    "RESPONSE_FINALIZED", "REVIEW_READY", "FEEDBACK_RELEASED", "CYCLE_CANCELLED",
  ]),
  AppraisalParticipantStatus: enumObject([
    "NOT_STARTED", "IN_PROGRESS", "FINALIZED", "EXPIRED", "REVOKED",
  ]),
  Prisma: {
    TransactionIsolationLevel: { Serializable: "Serializable" },
  },
};

const policy = {
  workflow: "HEADTEACHER_CONFIDENTIAL_STAFF_FEEDBACK",
  instrumentCode: "HEADTEACHER_STAFF_FEEDBACK_V1",
  instrumentVersion: 1,
  targetRole: "HEADTEACHER",
  responseWindowDays: 7,
  minimumFinalizedResponses: 1,
};

Module._load = function mockLoad(request, parent, isMain) {
  if (request === "@prisma/client") return prismaClientMock;
  if (request === "@/lib/prisma") return { prisma: {} };
  if (request === "@/lib/appraisals/audit") {
    return { APPRAISAL_AUDIT_ACTIONS: { NOTIFICATION_QUEUED: "APPRAISAL_NOTIFICATION_QUEUED" } };
  }
  if (request === "@/lib/appraisals/headteacherFeedback") {
    return {
      HEADTEACHER_FEEDBACK_POLICY: policy,
      assertHeadteacherFeedbackInstrumentReady() { return true; },
    };
  }
  if (request === "@/lib/appraisals/headteacherFeedbackApproval") {
    return {
      async approveAndOpenHeadteacherFeedbackCycle() {
        approveCalls += 1;
        return {
          outcome: "APPROVED_AND_OPENED",
          cycle: openedCycleSummary("cycle-approval"),
        };
      },
    };
  }
  if (request === "@/lib/appraisals/headteacherFeedbackDirectOpen") {
    return {
      async directOpenHeadteacherFeedbackCycle() {
        directCalls += 1;
        return {
          outcome: "DIRECTLY_OPENED",
          cycle: openedCycleSummary("cycle-direct"),
        };
      },
    };
  }
  return originalLoader(request, parent, isMain);
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
      strict: true,
    },
  });
  const errors = (transpiled.diagnostics ?? []).filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
  );
  if (errors.length) {
    fail("D3_4E3_TYPESCRIPT_TRANSPILE_FAILED", errors.map((diagnostic) =>
      ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
    ));
  }
  loadedModule._compile(transpiled.outputText, filename);
};

function openedCycleSummary(id) {
  return {
    id,
    status: "OPEN",
    targetUserId: "headteacher-user",
    targetTenantId: "tenant-school",
    targetName: "Headteacher",
    targetRole: "HEADTEACHER",
    schoolName: "School",
    circuitZoneId: "circuit-zone",
    circuitName: "Circuit",
    districtZoneId: "district-zone",
    districtName: "District",
    approvedAt: "2026-08-01T08:00:00.000Z",
    openedAt: "2026-08-01T08:00:00.000Z",
    deadlineAt: "2026-08-08T08:00:00.000Z",
    responseWindowDays: 7,
    minimumResponses: 1,
    participantCount: 2,
    notificationsSeeded: false,
  };
}

function participant(input) {
  return {
    id: input.id,
    respondentUserId: input.userId,
    respondentTenantId: "tenant-school",
    status: "NOT_STARTED",
    invitedAt: null,
    respondent: {
      email: input.email,
      phone: input.phone ?? null,
      phoneNorm: input.phoneNorm ?? null,
      smsOptIn: input.smsOptIn !== false,
      teacherProfiles: input.teacherProfiles ?? [],
    },
  };
}

function cycle(id) {
  return {
    id,
    status: "OPEN",
    targetTenantId: "tenant-school",
    targetRoleSnapshot: "HEADTEACHER",
    openedAt: new Date("2026-08-01T08:00:00.000Z"),
    deadlineAt: new Date("2026-08-08T08:00:00.000Z"),
    responseWindowDays: 7,
    minimumResponses: 1,
    metadata: {
      workflow: policy.workflow,
      participantsFrozen: true,
    },
    instrumentVersion: {
      version: 1,
      status: "ACTIVE",
      instrument: { code: policy.instrumentCode, isActive: true },
    },
  };
}

function fakeDatabase(input = {}) {
  const participants = input.participants ?? [
    participant({
      id: "participant-one",
      userId: "teacher-one",
      email: "one@example.com",
      phoneNorm: "0244000001",
    }),
    participant({
      id: "participant-two",
      userId: "teacher-two",
      email: "invalid",
      smsOptIn: false,
      teacherProfiles: [{ tenantId: "tenant-school", phone: "" }],
    }),
  ];
  const rows = [];
  const audits = [];
  let createdOnce = false;

  const db = {
    rows,
    audits,
    participants,
    appraisalCycle: {
      async findUnique() { return input.cycle ?? cycle(input.cycleId ?? "cycle-open"); },
    },
    appraisalParticipant: {
      async findMany(args) {
        const select = args?.select ?? {};
        if (select.invitedAt && !select.respondent) {
          return participants.map((item) => ({ invitedAt: item.invitedAt }));
        }
        return participants;
      },
      async updateMany() {
        let count = 0;
        for (const item of participants) {
          if (!item.invitedAt && item.status !== "REVOKED") {
            item.invitedAt = new Date("2026-08-01T08:01:00.000Z");
            count += 1;
          }
        }
        return { count };
      },
    },
    appraisalNotification: {
      async createMany(args) {
        if (createdOnce || input.existing) return { count: 0 };
        createdOnce = true;
        rows.push(...args.data);
        return { count: args.data.length };
      },
      async findMany() {
        return rows.map((row) => ({ channel: row.channel, status: row.status }));
      },
    },
    auditLog: {
      async create(args) { audits.push(args.data); return args.data; },
    },
    async $transaction(operation, options) {
      equal(options.isolationLevel, "Serializable", "transaction must be serializable");
      equal(options.timeout, 30000, "transaction timeout must be bounded");
      return operation(db);
    },
  };
  return db;
}

async function main() {
  const servicePath = "src/lib/appraisals/headteacherFeedbackNotifications.ts";
  const workerPath = "src/lib/appraisals/notificationWorker.ts";
  const indexPath = "src/lib/appraisals/index.ts";
  const serviceSource = read(servicePath);
  const workerSource = read(workerPath);
  const indexSource = read(indexPath);

  contains(serviceSource, "buildHeadteacherFeedbackNotificationRows", "rows:builder");
  contains(serviceSource, "ensureHeadteacherFeedbackCycleNotifications", "rows:ensure");
  contains(serviceSource, "approveAndOpenHeadteacherFeedbackCycleWithNotifications", "flow:approval-wrapper");
  contains(serviceSource, "directOpenHeadteacherFeedbackCycleWithNotifications", "flow:direct-wrapper");
  contains(serviceSource, "skipDuplicates: true", "rows:idempotent-create");
  contains(serviceSource, "AppraisalNotificationStatus.SENT", "in-app:immediate");
  contains(serviceSource, "AppraisalNotificationStatus.PENDING", "provider:queued");
  contains(serviceSource, "AppraisalNotificationStatus.SKIPPED", "provider:contact-fallback");
  contains(serviceSource, "providerCalled: false", "audit:no-provider");
  contains(serviceSource, "respondentIdentitiesIncluded: false", "audit:no-identities");
  contains(serviceSource, "contactDestinationsIncluded: false", "audit:no-contacts");
  excludes(serviceSource, "sendSms", "service:no-sms-provider");
  excludes(serviceSource, "sendEmail", "service:no-email-provider");
  excludes(serviceSource, "HEADTEACHER_FEEDBACK_NOTIFICATION_PARTICIPANT_LIST", "service:no-participant-list");

  contains(workerSource, 'const template = readString(payload.delivery, "template");', "worker:template-read");
  contains(workerSource, 'template: delivery.template ?? DEFAULT_APPRAISAL_SMS_DELIVERY.template', "worker:generic-template");
  contains(workerSource, 'template: "director-feedback-cycle-opened"', "worker:director-fallback-preserved");
  contains(indexSource, 'export * from "./headteacherFeedbackNotifications";', "barrel:export");

  const serviceAbsolute = path.join(repoRoot, servicePath);
  delete require.cache[require.resolve(serviceAbsolute)];
  const notifications = require(serviceAbsolute);

  const participants = [
    participant({
      id: "participant-one",
      userId: "teacher-one",
      email: "one@example.com",
      phoneNorm: "0244000001",
    }),
    participant({
      id: "participant-two",
      userId: "teacher-two",
      email: "invalid",
      smsOptIn: false,
    }),
  ];

  const built = notifications.buildHeadteacherFeedbackNotificationRows({
    cycleId: "cycle-open",
    deadlineAt: new Date("2026-08-08T08:00:00.000Z"),
    participants,
    now: new Date("2026-08-01T08:01:00.000Z"),
  });

  equal(built.length, 6, "three notification rows per participant");
  equal(built.filter((row) => row.channel === "IN_APP" && row.status === "SENT").length, 2, "in-app rows sent immediately");
  equal(built.filter((row) => row.channel === "SMS" && row.status === "PENDING").length, 1, "one SMS queued");
  equal(built.filter((row) => row.channel === "SMS" && row.status === "SKIPPED").length, 1, "one SMS skipped");
  equal(built.filter((row) => row.channel === "EMAIL" && row.status === "PENDING").length, 1, "one email queued");
  equal(built.filter((row) => row.channel === "EMAIL" && row.status === "SKIPPED").length, 1, "one email skipped");
  const sms = built.find((row) => row.channel === "SMS" && row.status === "PENDING");
  equal(sms.payload.delivery.template, "headteacher-feedback-cycle-opened", "worker template selected from payload");
  equal(sms.payload.href, "/teacher/headteacher-appraisal", "teacher route included");
  equal(sms.payload.confidentiality.headteacherCanSeeRespondentIdentity, false, "headteacher identity access forbidden");
  equal(sms.payload.confidentiality.absoluteAnonymityPromised, false, "absolute anonymity not promised");

  const db = fakeDatabase();
  const first = await notifications.ensureHeadteacherFeedbackCycleNotifications({
    cycleId: "cycle-open",
    actorUserId: "director-user",
    reqId: "request-e3-0001",
    now: new Date("2026-08-01T08:01:00.000Z"),
    database: db,
  });
  equal(first.outcome, "SEEDED", "first seed outcome");
  equal(first.rowsInserted, 6, "first seed writes six rows");
  equal(first.participantsInvited, 2, "participants invited once");
  equal(first.summary.channels.inApp.sent, 2, "summary in-app sent");
  equal(first.summary.channels.sms.pending, 1, "summary SMS pending");
  equal(first.summary.channels.email.pending, 1, "summary email pending");
  equal(db.audits.length, 1, "one audit for first seed");
  const metadata = db.audits[0].metadata;
  equal(metadata.respondentIdentitiesIncluded, false, "audit excludes respondent identities");
  equal(metadata.contactDestinationsIncluded, false, "audit excludes destinations");
  assert(!JSON.stringify(metadata).includes("teacher-one"), "audit must not include teacher identity");
  assert(!JSON.stringify(metadata).includes("one@example.com"), "audit must not include email");

  const second = await notifications.ensureHeadteacherFeedbackCycleNotifications({
    cycleId: "cycle-open",
    actorUserId: "director-user",
    reqId: "request-e3-0001",
    now: new Date("2026-08-01T08:02:00.000Z"),
    database: db,
  });
  equal(second.outcome, "EXISTING_MATCH", "retry idempotency outcome");
  equal(second.rowsInserted, 0, "retry creates no rows");
  equal(second.participantsInvited, 0, "retry reinvites nobody");
  equal(db.audits.length, 1, "retry creates no duplicate audit");

  const approvalDb = fakeDatabase({ cycleId: "cycle-approval" });
  const approved = await notifications.approveAndOpenHeadteacherFeedbackCycleWithNotifications({
    actorUserId: "director-user",
    actorRoleName: "DISTRICT_DIRECTOR",
    governanceScope: { isSuperAdmin: false, tenantIds: ["tenant-school"] },
    cycleId: "cycle-approval",
    reqId: "request-e3-approve",
    database: {},
    notificationDatabase: approvalDb,
  });
  equal(approveCalls, 1, "approval wrapper reuses C3 transaction");
  equal(approved.cycle.notificationsSeeded, true, "approval result marks notifications seeded");
  equal(approved.notifications.rowsInserted, 6, "approval wrapper seeds rows after opening");

  const directDb = fakeDatabase({ cycleId: "cycle-direct" });
  const directlyOpened = await notifications.directOpenHeadteacherFeedbackCycleWithNotifications({
    actorUserId: "director-user",
    actorRoleName: "DISTRICT_DIRECTOR",
    governanceScope: { isSuperAdmin: false, tenantIds: ["tenant-school"] },
    targetHeadteacherUserId: "headteacher-user",
    targetTenantId: "tenant-school",
    directOpenKey: "direct-e3-0001",
    reqId: "request-e3-direct",
    database: {},
    notificationDatabase: directDb,
  });
  equal(directCalls, 1, "direct-open wrapper reuses C4 transaction");
  equal(directlyOpened.cycle.notificationsSeeded, true, "direct-open result marks notifications seeded");
  equal(directlyOpened.notifications.rowsInserted, 6, "direct-open wrapper seeds rows after opening");

  const crossTenantDb = fakeDatabase({
    participants: [
      { ...participant({ id: "p-cross", userId: "teacher-cross", email: "cross@example.com" }), respondentTenantId: "other-tenant" },
    ],
  });
  let crossTenantCode = null;
  try {
    await notifications.ensureHeadteacherFeedbackCycleNotifications({
      cycleId: "cycle-open",
      actorUserId: "director-user",
      database: crossTenantDb,
    });
  } catch (error) {
    crossTenantCode = error.code ?? error.message;
  }
  equal(crossTenantCode, "HEADTEACHER_FEEDBACK_NOTIFICATION_PARTICIPANT_DRIFT", "cross-tenant participants fail closed");

  console.log("");
  console.log("=== D3.4E3 HEADTEACHER NOTIFICATION + WORKER INTEGRATION ===");
  console.log("");
  console.log("Trigger point                  : after participant freeze/open");
  console.log("Open-flow integration          : C3 approval + C4 direct-open wrappers");
  console.log("Notification event             : CYCLE_OPENED");
  console.log("In-app assignment              : immediately SENT");
  console.log("SMS/email                      : PENDING or contact-safe SKIPPED");
  console.log("Queue idempotency              : unique per cycle/teacher/channel");
  console.log("Repeated seeding               : EXISTING_MATCH");
  console.log("Participant invitedAt          : set once");
  console.log("Tenant binding                 : cycle = respondent tenant");
  console.log("Shared appraisal worker        : reused");
  console.log("Worker SMS template            : payload-selected with Director fallback");
  console.log("Shared hosted cron             : unchanged");
  console.log("Provider inside transaction    : absent");
  console.log("Headteacher targeted reminders : absent");
  console.log("Audit identity/contact leakage : absent");
  console.log("Database accessed              : false");
  console.log("");
  console.log("RESULT: D3.4E3 HEADTEACHER NOTIFICATION INTEGRATION GREEN");
}

main()
  .catch((error) => {
    console.error("");
    console.error("RESULT: D3.4E3 HEADTEACHER NOTIFICATION INTEGRATION FAILED");
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  })
  .finally(() => {
    Module._load = originalLoader;
    if (originalTs) require.extensions[".ts"] = originalTs;
    else delete require.extensions[".ts"];
  });
