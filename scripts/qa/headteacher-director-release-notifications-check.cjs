#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS QA harness intentionally loads TypeScript source through an isolated fixture runtime. */

const fs = require("fs");
const path = require("path");
const Module = require("module");
const ts = require("typescript");

function fail(message, details) {
  const suffix = details ? `\n${JSON.stringify(details, null, 2)}` : "";
  throw new Error(`${message}${suffix}`);
}

function equal(actual, expected, message) {
  if (actual !== expected) fail(message, { expected, actual });
}

function truthy(value, message) {
  if (!value) fail(message, { value });
}

function includes(source, marker, message) {
  if (!source.includes(marker)) fail(message, { marker });
}

function excludes(source, marker, message) {
  if (source.includes(marker)) fail(message, { marker });
}

function enumObject(values) {
  return Object.freeze(Object.fromEntries(values.map((value) => [value, value])));
}

const AppraisalNotificationChannel = enumObject(["IN_APP", "SMS", "EMAIL"]);
const AppraisalNotificationStatus = enumObject([
  "PENDING",
  "PROCESSING",
  "SENT",
  "FAILED",
  "SKIPPED",
  "CANCELLED",
  "DEAD",
]);
const AppraisalNotificationType = enumObject([
  "REQUEST_SUBMITTED",
  "CYCLE_OPENED",
  "DEADLINE_EXTENDED",
  "DEADLINE_REMINDER",
  "RESPONSE_FINALIZED",
  "REVIEW_READY",
  "FEEDBACK_RELEASED",
  "CYCLE_CANCELLED",
]);
const GovernanceInterventionPriority = enumObject([
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
]);
const GovernanceOfficialNoticeAudienceMode = enumObject([
  "ROLE_SCOPE",
  "INDIVIDUALS",
  "SCHOOL_SET",
]);
const GovernanceOfficialNoticeChannel = enumObject(["IN_APP", "SMS", "EMAIL"]);
const GovernanceOfficialNoticeDeliveryStatus = enumObject([
  "PENDING",
  "SENT",
  "FAILED",
  "SKIPPED",
]);
const GovernanceOfficialNoticeRecipientType = enumObject([
  "GOVERNANCE_OFFICER",
  "SCHOOL_ADMIN",
  "HEADTEACHER",
  "TEACHER",
  "PARENT",
  "CUSTOM",
]);
const GovernanceOfficialNoticeStatus = enumObject([
  "DRAFT",
  "QUEUED",
  "SENT",
  "PARTIALLY_FAILED",
  "FAILED",
  "CANCELLED",
]);
const Prisma = {
  TransactionIsolationLevel: { Serializable: "Serializable" },
};

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === "@prisma/client") {
    return {
      AppraisalNotificationChannel,
      AppraisalNotificationStatus,
      AppraisalNotificationType,
      GovernanceInterventionPriority,
      GovernanceOfficialNoticeAudienceMode,
      GovernanceOfficialNoticeChannel,
      GovernanceOfficialNoticeDeliveryStatus,
      GovernanceOfficialNoticeRecipientType,
      GovernanceOfficialNoticeStatus,
      Prisma,
    };
  }
  if (request === "@/lib/prisma") return { prisma: {} };
  if (request === "@/lib/appraisals/audit") {
    return {
      APPRAISAL_AUDIT_ACTIONS: {
        NOTIFICATION_QUEUED: "NOTIFICATION_QUEUED",
      },
    };
  }
  if (request === "@/lib/appraisals/headteacherFeedback") {
    return {
      HEADTEACHER_FEEDBACK_POLICY: {
        workflow: "HEADTEACHER_CONFIDENTIAL_STAFF_FEEDBACK",
      },
    };
  }
  if (
    request ===
    "@/lib/appraisals/headteacherSupervisoryDirectorDirectRelease"
  ) {
    return {
      HEADTEACHER_SUPERVISORY_RELEASES_METADATA_KEY:
        "headteacherSupervisoryReleases",
      HEADTEACHER_SUPERVISORY_DIRECTOR_DIRECT_RELEASE_POLICY: {
        proofSchemaVersion: 1,
        workflow: "HEADTEACHER_GOVERNANCE_SUPERVISORY_ASSESSMENT",
        evidenceStream: "GOVERNANCE_SUPERVISORY_ASSESSMENT",
        releaseMode: "DIRECTOR_AUTHORED_DIRECT_RELEASE",
        eligibleCarrierCycleStatuses: [
          "OPEN",
          "CLOSED",
          "UNDER_REVIEW",
          "RELEASED",
        ],
      },
      computeHeadteacherSupervisoryDirectorDirectReleaseProofHashFromMetadata() {
        return "0".repeat(64);
      },
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

require.extensions[".ts"] = function transpile(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
    },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
};

const repositoryRoot = process.cwd();
const servicePath = path.join(
  repositoryRoot,
  "src/lib/appraisals/headteacherDirectorReleaseNotifications.ts",
);
const routePath = path.join(
  repositoryRoot,
  "src/app/api/district/headteacher-appraisals/[cycleId]/release/route.ts",
);
const noticeClientPath = path.join(
  repositoryRoot,
  "src/components/governance/OfficialNoticeInboxClient.tsx",
);
const directorClientPath = path.join(
  repositoryRoot,
  "src/app/governance/appraisals/headteacher-supervisory/HeadteacherSupervisoryAssessmentClient.tsx",
);

const serviceSource = fs.readFileSync(servicePath, "utf8");
const routeSource = fs.readFileSync(routePath, "utf8");
const noticeClientSource = fs.readFileSync(noticeClientPath, "utf8");
const directorClientSource = fs.readFileSync(directorClientPath, "utf8");
const service = require(servicePath);

const proofHash = "a".repeat(64);
const releasedAt = "2026-07-28T13:30:00.000Z";
const now = new Date("2026-07-28T13:31:00.000Z");

function releasedCycle(overrides = {}) {
  return {
    id: "cycle_release_001",
    status: "RELEASED",
    targetUserId: "headteacher_user_001",
    targetTenantId: "tenant_school_001",
    targetRoleSnapshot: "HEADTEACHER",
    releasedAt: new Date(releasedAt),
    metadata: {
      headteacherDirectorRelease: {
        proofSchemaVersion: 1,
        workflow: "HEADTEACHER_CONFIDENTIAL_STAFF_FEEDBACK",
        cycleId: "cycle_release_001",
        reviewDecision: "ACCEPTED",
        assessmentStatus: "FINALIZED",
        reviewerUserId: "director_user_001",
        releasedAt,
        releaseProofHash: proofHash,
        notificationsSeeded: false,
        notificationReadiness: "READY_FOR_POST_RELEASE_SEEDING",
        providerCalled: false,
        respondentIdentitiesAccessed: false,
        individualStaffResponsesAccessed: false,
        scoreMutationPerformed: false,
      },
    },
    targetUser: {
      email: "headteacher@example.com",
      phone: "0244000000",
      phoneNorm: null,
      smsOptIn: true,
      teacherProfiles: [
        { tenantId: "tenant_school_001", phone: "0244000000" },
      ],
    },
    ...overrides,
  };
}

function fixtureDatabase(cycle = releasedCycle(), initialRows = []) {
  const rows = [...initialRows];
  const notices = [];
  const recipients = [];
  const deliveries = [];
  const audits = [];
  const transactionOptions = [];
  let noticeCounter = 0;
  let recipientCounter = 0;

  const notificationDelegate = {
    async createMany(args) {
      let count = 0;
      for (const row of args.data) {
        if (rows.some((existing) => existing.idempotencyKey === row.idempotencyKey)) {
          continue;
        }
        rows.push(row);
        count += 1;
      }
      return { count };
    },
    async findMany(args) {
      const channels = args.where.channel?.in ?? [];
      return rows
        .filter(
          (row) =>
            row.cycleId === args.where.cycleId &&
            row.type === args.where.type &&
            (!channels.length || channels.includes(row.channel)),
        )
        .map((row) => ({ channel: row.channel, status: row.status }));
    },
  };

  const officialNoticeDelegate = {
    async findUnique(args) {
      return (
        notices.find(
          (notice) => notice.idempotencyKey === args.where.idempotencyKey,
        ) ?? null
      );
    },
    async create(args) {
      if (
        notices.some(
          (notice) => notice.idempotencyKey === args.data.idempotencyKey,
        )
      ) {
        const error = new Error("unique");
        error.code = "P2002";
        throw error;
      }
      const notice = {
        id: `notice_${++noticeCounter}`,
        ...args.data,
      };
      notices.push(notice);
      return { id: notice.id };
    },
  };

  const database = {
    appraisalCycle: {
      async findUnique(args) {
        return args.where.id === cycle.id ? cycle : null;
      },
    },
    membership: {
      async findFirst() {
        return {
          id: "membership_head_001",
          userId: cycle.targetUserId,
          tenantId: cycle.targetTenantId,
          status: "ACTIVE",
          role: { name: "HEADTEACHER" },
          tenant: { id: cycle.targetTenantId, status: "ACTIVE" },
        };
      },
    },
    appraisalNotification: notificationDelegate,
    governanceOfficialNotice: officialNoticeDelegate,
    async $transaction(operation, options) {
      transactionOptions.push(options);
      return operation({
        appraisalNotification: notificationDelegate,
        governanceOfficialNotice: officialNoticeDelegate,
        governanceOfficialNoticeRecipient: {
          async create(args) {
            const recipient = {
              id: `recipient_${++recipientCounter}`,
              ...args.data,
            };
            recipients.push(recipient);
            return { id: recipient.id };
          },
        },
        governanceOfficialNoticeDelivery: {
          async create(args) {
            deliveries.push(args.data);
            return args.data;
          },
        },
        auditLog: {
          async create(args) {
            audits.push(args.data);
            return args.data;
          },
        },
      });
    },
  };

  return {
    database,
    rows,
    notices,
    recipients,
    deliveries,
    audits,
    transactionOptions,
  };
}

async function expectReject(operation, expectedCode, message) {
  try {
    await operation();
  } catch (error) {
    equal(error.code || error.message, expectedCode, message);
    return;
  }
  fail(message, { expectedCode, actual: "resolved" });
}

async function main() {
  equal(
    service.HEADTEACHER_DIRECTOR_RELEASE_NOTIFICATION_POLICY.schemaVersion,
    2,
    "visible notification policy version",
  );
  equal(
    service.HEADTEACHER_DIRECTOR_RELEASE_NOTIFICATION_POLICY.notificationType,
    "FEEDBACK_RELEASED",
    "release event type",
  );
  equal(
    service.HEADTEACHER_DIRECTOR_RELEASE_NOTIFICATION_POLICY.inAppHref,
    "/headteacher/my-appraisal",
    "released-result action route",
  );
  equal(
    service.HEADTEACHER_DIRECTOR_RELEASE_NOTIFICATION_POLICY.externalChannels.length,
    2,
    "only SMS and email use appraisal outbox",
  );
  equal(
    service.HEADTEACHER_DIRECTOR_RELEASE_NOTIFICATION_POLICY.providerCallsAllowed,
    false,
    "providers forbidden in seeding",
  );

  const cycle = releasedCycle();
  const built = service.buildHeadteacherDirectorReleaseNotificationRows({
    cycle,
    releasedAt,
    releaseProofHash: proofHash,
    now,
  });
  equal(built.length, 2, "only external outbox rows are built");
  equal(built[0].channel, "SMS", "SMS outbox row first");
  equal(built[0].status, "PENDING", "valid opted-in SMS pending");
  equal(built[1].channel, "EMAIL", "email outbox row second");
  equal(built[1].status, "PENDING", "valid email pending");
  truthy(
    built.every((row) => row.channel !== "IN_APP"),
    "in-app is not written to the invisible appraisal outbox",
  );
  equal(
    built[0].payload.delivery.template,
    "headteacher-appraisal-feedback-released",
    "payload-selected SMS template",
  );
  equal(new Set(built.map((row) => row.idempotencyKey)).size, 2, "unique keys");
  truthy(
    built.every((row) => row.idempotencyKey.length <= 180),
    "idempotency keys within schema limit",
  );
  includes(
    JSON.stringify(built),
    "\"releaseNoteIncluded\":false",
    "release note exclusion declared",
  );
  excludes(JSON.stringify(built), "respondentUserId", "respondents excluded");
  includes(
    JSON.stringify(built),
    "\"scoreValuesIncluded\":false",
    "score exclusion declared",
  );

  const skippedRows = service.buildHeadteacherDirectorReleaseNotificationRows({
    cycle: releasedCycle({
      targetUser: {
        email: "invalid",
        phone: null,
        phoneNorm: null,
        smsOptIn: false,
        teacherProfiles: [],
      },
    }),
    releasedAt,
    releaseProofHash: proofHash,
    now,
  });
  equal(skippedRows[0].status, "SKIPPED", "SMS opt-out skipped");
  equal(skippedRows[0].lastError, "SMS_OPT_OUT", "SMS opt-out reason");
  equal(skippedRows[1].status, "SKIPPED", "invalid email skipped");
  equal(skippedRows[1].lastError, "EMAIL_UNAVAILABLE", "email skip reason");

  const fixture = fixtureDatabase();
  const first = await service.ensureHeadteacherDirectorReleaseNotifications({
    cycleId: cycle.id,
    actorUserId: "director_user_001",
    releaseProofHash: proofHash,
    releasedAt,
    reqId: "request_release_notification_001",
    now,
    database: fixture.database,
  });
  equal(first.outcome, "SEEDED", "first call seeds visible notification");
  equal(first.rowsInserted, 3, "one inbox notice plus two external rows");
  equal(first.officialInAppNoticeCreated, true, "official notice created");
  equal(first.officialInAppNoticeVisible, true, "official notice visible");
  equal(first.summary.recipientCount, 1, "one Headteacher recipient");
  equal(first.summary.channels.inApp.sent, 1, "official inbox visible summary");
  equal(first.summary.channels.sms.pending, 1, "SMS pending summary");
  equal(first.summary.channels.email.pending, 1, "email pending summary");
  equal(first.providerCalled, false, "no provider call");
  equal(first.recipientIdentityReturned, false, "identity not returned");
  equal(first.contactDestinationsReturned, false, "contacts not returned");
  equal(fixture.notices.length, 1, "one official notice");
  equal(fixture.recipients.length, 1, "one official notice recipient");
  equal(fixture.deliveries.length, 1, "one visible in-app delivery");
  equal(fixture.deliveries[0].channel, "IN_APP", "in-app delivery channel");
  equal(fixture.deliveries[0].status, "SENT", "in-app delivery sent");
  equal(fixture.notices[0].status, "SENT", "official notice sent");
  equal(
    fixture.notices[0].audienceMode,
    "INDIVIDUALS",
    "exact recipient audience",
  );
  equal(fixture.audits.length, 1, "one audit on first seed");
  excludes(
    JSON.stringify(fixture.audits),
    "headteacher@example.com",
    "email absent from audit",
  );
  excludes(
    JSON.stringify(fixture.audits),
    "+233244000000",
    "phone absent from audit",
  );
  equal(
    fixture.transactionOptions[0].isolationLevel,
    "Serializable",
    "serializable transaction",
  );
  equal(fixture.transactionOptions[0].maxWait, 10000, "bounded maxWait");
  equal(fixture.transactionOptions[0].timeout, 30000, "bounded timeout");

  const retry = await service.ensureHeadteacherDirectorReleaseNotifications({
    cycleId: cycle.id,
    actorUserId: "director_user_001",
    releaseProofHash: proofHash,
    releasedAt,
    reqId: "request_release_notification_002",
    now,
    database: fixture.database,
  });
  equal(retry.outcome, "EXISTING_MATCH", "retry is idempotent");
  equal(retry.rowsInserted, 0, "retry inserts no rows");
  equal(retry.officialInAppNoticeCreated, false, "retry reuses official notice");
  equal(fixture.notices.length, 1, "retry preserves one notice");
  equal(fixture.recipients.length, 1, "retry preserves one recipient");
  equal(fixture.deliveries.length, 1, "retry preserves one in-app delivery");
  equal(fixture.rows.length, 2, "retry preserves exact external rows");
  equal(fixture.audits.length, 1, "retry creates no duplicate audit");

  const legacyRows = [
    {
      cycleId: cycle.id,
      recipientUserId: cycle.targetUserId,
      channel: "IN_APP",
      type: "FEEDBACK_RELEASED",
      status: "SENT",
      idempotencyKey: "legacy-in-app-row",
    },
    ...built,
  ];
  const repairFixture = fixtureDatabase(cycle, legacyRows);
  const repair = await service.ensureHeadteacherDirectorReleaseNotifications({
    cycleId: cycle.id,
    actorUserId: "director_user_001",
    releaseProofHash: proofHash,
    releasedAt,
    reqId: "request_release_notification_repair_001",
    now,
    database: repairFixture.database,
  });
  equal(repair.outcome, "SEEDED", "existing release can be repaired");
  equal(repair.rowsInserted, 1, "repair creates only visible official notice");
  equal(repair.officialInAppNoticeCreated, true, "repair creates inbox notice");
  equal(
    repair.summary.channels.inApp.total,
    1,
    "legacy invisible row is not double-counted as visible delivery",
  );
  equal(repairFixture.rows.length, 3, "legacy outbox rows remain historical");
  equal(repairFixture.notices.length, 1, "repair creates one official notice");

  const driftFixture = fixtureDatabase(
    releasedCycle({
      metadata: {
        headteacherDirectorRelease: {
          ...releasedCycle().metadata.headteacherDirectorRelease,
          releaseProofHash: "b".repeat(64),
        },
      },
    }),
  );
  await expectReject(
    () =>
      service.ensureHeadteacherDirectorReleaseNotifications({
        cycleId: cycle.id,
        actorUserId: "director_user_001",
        releaseProofHash: proofHash,
        releasedAt,
        reqId: "request_release_notification_003",
        now,
        database: driftFixture.database,
      }),
    "HEADTEACHER_RELEASE_NOTIFICATION_RELEASE_PROOF_DRIFT",
    "release-proof drift fails closed",
  );

  for (const marker of [
    "ensureHeadteacherDirectorReleaseNotifications",
    "result.releaseProofHash",
    "result.releasedAt",
    "HEADTEACHER_RELEASE_NOTIFICATION_SEEDING_RETRY_REQUIRED",
    "releaseCommitted: true",
    "retrySafe: true",
    "providerCalled: false",
    "jsonNoStore(503",
  ]) {
    includes(routeSource, marker, `release route integration: ${marker}`);
  }
  excludes(routeSource, "sendSms", "route has no SMS provider call");
  excludes(routeSource, "sendEmail", "route has no email provider call");

  for (const marker of [
    "HEADTEACHER_RELEASE_NOTIFICATION_SEEDING_RETRY_REQUIRED",
    "payload.releaseCommitted === true",
    "payload.retrySafe === true",
    "The appraisal was released, but the Headteacher notification still needs retrying.",
    "Repeating release will not duplicate the official result.",
    "The Headteacher notification was queued safely.",
  ]) {
    includes(
      directorClientSource,
      marker,
      `truthful BBC retry contract: ${marker}`,
    );
  }
  excludes(directorClientSource, "localStorage", "no browser persistence");
  excludes(directorClientSource, "setInterval(", "no polling");

  for (const marker of [
    "GovernanceOfficialNoticeStatus.SENT",
    "GovernanceOfficialNoticeAudienceMode.INDIVIDUALS",
    "GovernanceOfficialNoticeRecipientType.HEADTEACHER",
    "GovernanceOfficialNoticeDeliveryStatus.SENT",
    "inAppVisible: true",
    'inAppHref: "/headteacher/my-appraisal"',
    'inAppActionLabel: "Open released appraisal"',
    'noticeKind: "INFORMATION_ONLY"',
    "officialInAppNoticeCreated",
    "officialInAppNoticeVisible: true",
  ]) {
    includes(serviceSource, marker, `visible in-app contract: ${marker}`);
  }
  excludes(
    serviceSource,
    "channel: AppraisalNotificationChannel.IN_APP",
    "invisible appraisal in-app row removed",
  );

  for (const marker of [
    'import Link from "next/link"',
    "safeInternalNoticeAction",
    'metadataString(metadata, "actionHref")',
    'rawHref.startsWith("/")',
    'rawHref.startsWith("//")',
    "resolved.origin !== base.origin",
    'metadataString(metadata, "actionLabel")',
    "noticeAction.href",
    "noticeAction.label",
    "Open the secure EduLife OS page connected to this notice.",
  ]) {
    includes(noticeClientSource, marker, `safe inbox action: ${marker}`);
  }
  excludes(noticeClientSource, 'target="_blank"', "notice action stays in portal");
  excludes(noticeClientSource, "window.location", "no unchecked imperative redirect");

  for (const forbidden of [
    "sendSms",
    "sendEmail",
    "provider.send",
    "appraisalIdentityAccess",
    "appraisalResponse.find",
    "appraisalAssessmentScore",
  ]) {
    excludes(serviceSource, forbidden, `forbidden service marker: ${forbidden}`);
  }

  console.log("=== D3.4G4C VISIBLE POST-RELEASE NOTIFICATION SEEDING ===");
  console.log("");
  console.log("Trigger boundary                : after verified Director release");
  console.log("Recipient                       : exact released Headteacher only");
  console.log("Notification event              : FEEDBACK_RELEASED");
  console.log("In-app system                   : Official Notice Inbox");
  console.log("In-app route                    : /headteacher/my-appraisal");
  console.log("In-app lifecycle                : visible + read tracking");
  console.log("SMS/email                       : appraisal outbox only");
  console.log("Legacy invisible in-app rows    : ignored, not duplicated");
  console.log("Queue idempotency               : release proof + cycle + channel hash");
  console.log("Official notice idempotency     : deterministic release-proof key");
  console.log("Repeated seeding                : EXISTING_MATCH");
  console.log("Historical release repair       : supported without manual SQL");
  console.log("Release proof                   : revalidated before queueing");
  console.log("Release transaction             : remains separate and immutable");
  console.log("Partial-success response        : releaseCommitted + retrySafe");
  console.log("Respondent identities/forms     : not accessed");
  console.log("Score/release-note payload      : absent");
  console.log("Audit contacts/identity         : absent");
  console.log("Provider calls                  : absent");
  console.log("Transaction                     : serializable and bounded");
  console.log("Database accessed               : false");
  console.log("");
  console.log("RESULT: D3.4G4C VISIBLE RELEASE NOTIFICATION GREEN");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
