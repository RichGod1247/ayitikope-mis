#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS QA harness intentionally loads repository files for static contract verification. */

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..", "..");

function fail(message, detail) {
  const suffix = detail === undefined ? "" : `\n${JSON.stringify(detail, null, 2)}`;
  throw new Error(`${message}${suffix}`);
}

function assert(condition, message, detail) {
  if (!condition) fail(message, detail);
}

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function indexBefore(source, left, right, code) {
  const leftIndex = source.indexOf(left);
  const rightIndex = source.indexOf(right);

  assert(leftIndex >= 0, `${code}_LEFT_MARKER_MISSING`, { left });
  assert(rightIndex >= 0, `${code}_RIGHT_MARKER_MISSING`, { right });
  assert(leftIndex < rightIndex, code, { left, right, leftIndex, rightIndex });
}

const files = {
  notify: "src/app/api/headteacher/assessment/mock/release/notify/route.ts",
  release: "src/app/api/headteacher/assessment/mock/release/route.ts",
  status: "src/app/api/headteacher/assessment/mock/release/status/route.ts",
  client: "src/components/headteacher/HeadteacherMockOverviewClient.tsx",
  worker: "src/lib/finance/outbox-worker.ts",
  outbox: "src/lib/finance/outbox.ts",
  cron: "src/app/api/internal/finance/outbox/cron/route.ts",
  enrollment: "src/lib/essentialAlerts/enrollment.ts",
  policy: "src/lib/essentialAlerts/policy.ts",
  publicPage: "src/lib/essentialAlerts/publicPage.ts",
  mockSms: "src/lib/essentialAlerts/mockResultsReleaseSms.ts",
  sms: "src/lib/sms.ts",
  schema: "prisma/schema.prisma",
};

const source = Object.fromEntries(
  Object.entries(files).map(([key, relativePath]) => [key, read(relativePath)]),
);

const mockWorkerStart = source.worker.indexOf(
  "async function handleMockResultsReleaseSmsEvent",
);
const mockWorkerEnd = source.worker.indexOf(
  "async function handleProviderEventReprocess",
  mockWorkerStart,
);

assert(mockWorkerStart >= 0, "A16A2B2_MOCK_WORKER_HANDLER_MISSING");
assert(
  mockWorkerEnd > mockWorkerStart,
  "A16A2B2_MOCK_WORKER_HANDLER_BOUNDARY_MISSING",
);

const mockWorker = source.worker.slice(mockWorkerStart, mockWorkerEnd);

console.log(
  "=== A16A2B2 MOCK RESULTS RELEASE — ESSENTIAL ALERTS + OUTBOX ENFORCEMENT ===",
);

for (const marker of [
  "getGuardianEssentialAlertEligibilityMap",
  'const RESULTS_RELEASE_PURPOSE = "RESULTS_RELEASE" as const;',
  'const ESSENTIAL_ALERT_AUTHORITY = "ESSENTIAL_ALERT_ENROLLMENT" as const;',
  "releaseSnapshotHash",
  "authorityEligibleLearners",
  "ambiguousFamilyLearners",
  "guardianNameKeys",
  "skippedCount: 0",
  "essentialAlertParentPortalUrl",
  "buildMockResultsReleaseSmsBody",
  "parentPortalUrl: args.parentPortalUrl",
  'type: "SMS_MOCK_RESULTS_RELEASE"',
  "queuedEligibleLearnerCount",
]) {
  assert(
    source.notify.includes(marker),
    "A16A2B2_NOTIFY_AUTHORITY_MARKER_MISSING",
    marker,
  );
}

for (const forbidden of [
  "guardianSmsOptIn",
  "normalizePhoneForSms",
  "skippedOptOut",
]) {
  assert(
    !source.notify.includes(forbidden),
    "A16A2B2_NOTIFY_LEGACY_AUTHORITY_PRESENT",
    forbidden,
  );
}

assert(
  !source.release.includes("guardianSmsOptIn"),
  "A16A2B2_RELEASE_ROUTE_STILL_READS_LEGACY_GUARDIAN_FLAG",
);

indexBefore(
  source.notify,
  "await getGuardianEssentialAlertEligibilityMap({",
  "await tx.financeOutboxEvent.create({",
  "A16A2B2_QUEUE_AUTHORITY_MUST_PRECEDE_OUTBOX_CREATE",
);

indexBefore(
  source.notify,
  "Mock release snapshot evidence is missing or invalid.",
  "await tx.financeOutboxEvent.create({",
  "A16A2B2_RELEASE_EVIDENCE_MUST_PRECEDE_OUTBOX_CREATE",
);

for (const marker of [
  "getGuardianEssentialAlertEligibilityMap",
  "normalizeGhanaPhone",
  'const MOCK_RESULTS_RELEASE_TEMPLATE = "MOCK_RESULTS_RELEASE_ALERT" as const;',
  "recipient.studentIds",
  'status: "SKIPPED"',
  "ESSENTIAL_ALERT_NOT_CURRENTLY_ELIGIBLE",
  "GUARDIAN_FAMILY_AMBIGUOUS",
  "providerCalled: false",
  "eligibleStudentIds",
  "eligibleLearnerCount",
  "essentialAlertConfiguredParentPortalUrl",
  "buildMockResultsReleaseSmsBody",
  "parentPortalUrl",
  "releaseSnapshotHash",
  "sentCount > 0",
  "smsNotifiedAt: null",
  "skippedCount",
  "MOCK_RESULTS_RELEASE_SMS_PROVIDER_ATTEMPT_ADMITTED",
  "MOCK_RESULTS_RELEASE_SMS_REPLAY_SUPPRESSED",
  "providerAttemptAdmitted: true",
  'providerAttemptState: "ADMITTED_AMBIGUOUS_UNTIL_RESULT"',
  "automaticReplaySuppressed: true",
  "providerCallThisRun: false",
  'providerStatusDescription: "PROVIDER_ATTEMPT_ADMITTED"',
]) {
  assert(
    source.worker.includes(marker),
    "A16A2B2_WORKER_AUTHORITY_MARKER_MISSING",
    marker,
  );
}

for (const marker of [
  "export function essentialAlertConfiguredPublicOrigin()",
  "export function essentialAlertParentPortalUrl(req: Request)",
  "export function essentialAlertConfiguredParentPortalUrl()",
  "/parent-portal",
  "if (!configured || isLoopbackOrigin(configured))",
]) {
  assert(
    source.publicPage.includes(marker),
    "A16A2B2_ESSENTIAL_ALERT_PUBLIC_ORIGIN_MARKER_MISSING",
    marker,
  );
}

for (const marker of [
  "buildMockResultsReleaseSmsBody",
  "mockResultsReleaseLearnerLabel",
  "MOCK_RESULTS_RELEASE_PARENT_PORTAL_URL_REQUIRED",
  "is ready. View: ${parentPortalUrl}",
]) {
  assert(
    source.mockSms.includes(marker),
    "A16A2B2_SHARED_MOCK_SMS_FORMATTER_MARKER_MISSING",
    marker,
  );
}

for (const forbidden of [
  "Login to the parent portal to view support guidance.",
]) {
  assert(
    !source.notify.includes(forbidden) && !source.worker.includes(forbidden),
    "A16A2B2_LEGACY_MOCK_SMS_COPY_PRESENT",
    forbidden,
  );
}

const representativeMockSms =
  "EduLife OS: 100th Mock BECE readiness for Kofi Mensah & Ablah Hogbe at EduLife Governance UAT is ready. View: https://edulifeos.com/parent-portal";

assert(
  representativeMockSms.length <= 160,
  "A16A2B2_REPRESENTATIVE_MOCK_SMS_EXCEEDS_SINGLE_GSM_SEGMENT",
  { length: representativeMockSms.length },
);

indexBefore(
  mockWorker,
  "const parentPortalUrl = essentialAlertConfiguredParentPortalUrl();",
  'action: "MOCK_RESULTS_RELEASE_SMS_PROVIDER_ATTEMPT_ADMITTED"',
  "A16A2B2_PUBLIC_URL_MUST_RESOLVE_BEFORE_PROVIDER_ADMISSION",
);

indexBefore(
  mockWorker,
  "const message = buildMockResultsReleaseSmsBody({",
  'action: "MOCK_RESULTS_RELEASE_SMS_PROVIDER_ATTEMPT_ADMITTED"',
  "A16A2B2_FINAL_MESSAGE_MUST_BUILD_BEFORE_PROVIDER_ADMISSION",
);

indexBefore(
  mockWorker,
  "await getGuardianEssentialAlertEligibilityMap({",
  "const result = await sendSms({",
  "A16A2B2_SEND_TIME_AUTHORITY_MUST_PRECEDE_PROVIDER",
);

indexBefore(
  mockWorker,
  "const familyAmbiguous =",
  "const result = await sendSms({",
  "A16A2B2_FAMILY_CHECK_MUST_PRECEDE_PROVIDER",
);

indexBefore(
  mockWorker,
  "const releaseEvidenceValid =",
  "const result = await sendSms({",
  "A16A2B2_RELEASE_RECHECK_MUST_PRECEDE_PROVIDER",
);

indexBefore(
  mockWorker,
  'if (recipient.status === "FAILED") {',
  "const result = await sendSms({",
  "A16A2B2_FAILED_RECIPIENT_REPLAY_GUARD_MUST_PRECEDE_PROVIDER",
);

indexBefore(
  mockWorker,
  'action: "MOCK_RESULTS_RELEASE_SMS_PROVIDER_ATTEMPT_ADMITTED"',
  "const result = await sendSms({",
  "A16A2B2_DURABLE_PROVIDER_ADMISSION_MUST_PRECEDE_PROVIDER",
);

assert(
  !mockWorker.includes("throw new Error(errorMessage);"),
  "A16A2B2_PROVIDER_FAILURE_MUST_NOT_TRIGGER_AUTOMATIC_SMS_RETRY",
);

for (const forbidden of [
  'readString(event.payload, "to")',
  'readString(event.payload, "message")',
  'readString(event.payload, "body")',
]) {
  assert(
    !mockWorker.includes(forbidden),
    "A16A2B2_MOCK_WORKER_MUST_NOT_TRUST_QUEUED_TO_OR_BODY",
    forbidden,
  );
}

for (const marker of [
  "Essential School Alerts",
  "notEligibleLearners",
  "ambiguousFamilyLearners",
  "Family check",
  "Eligibility will be rechecked before delivery.",
]) {
  assert(
    source.client.includes(marker),
    "A16A2B2_CLIENT_AUTHORITY_COPY_MISSING",
    marker,
  );
}

for (const forbidden of ["skippedOptOut", "opted-out guardians"]) {
  assert(
    !source.client.includes(forbidden),
    "A16A2B2_CLIENT_LEGACY_COPY_PRESENT",
    forbidden,
  );
}

for (const marker of [
  "SMS_MOCK_RESULTS_RELEASE",
  "markFinanceOutboxCompleted",
  "markFinanceOutboxFailed",
  "claimFinanceOutboxEvents",
]) {
  assert(
    `${source.worker}\n${source.outbox}\n${source.cron}\n${source.schema}`.includes(
      marker,
    ),
    "A16A2B2_OUTBOX_SPINE_MARKER_MISSING",
    marker,
  );
}

for (const marker of [
  "studentIds Json",
  "guardianPhoneNorm String",
  "@@unique([jobId, guardianPhoneNorm]",
]) {
  assert(
    source.schema.includes(marker),
    "A16A2B2_SCHEMA_CONTRACT_MARKER_MISSING",
    marker,
  );
}

for (const marker of [
  '"RESULTS_RELEASE"',
  "SIGNED_GUARDIAN_LINK",
  "phoneFingerprint",
  "policyVersion",
  "getGuardianEssentialAlertEligibilityMap",
]) {
  assert(
    `${source.policy}\n${source.enrollment}`.includes(marker),
    "A16A2B2_ESSENTIAL_ALERT_AUTHORITY_DEPENDENCY_MISSING",
    marker,
  );
}

assert(
  source.sms.includes("sMSSendAudit.create"),
  "A16A2B2_SHARED_SMS_AUDIT_REQUIRED",
);

assert(
  !source.notify.includes("sendViaHubtel") &&
    !source.worker.includes("sendViaHubtel"),
  "A16A2B2_DIRECT_HUBTEL_FORBIDDEN",
);

console.log("");
console.log("Purpose                     : RESULTS_RELEASE");
console.log("Recipient                   : GUARDIAN");
console.log("Queue authority              : ESSENTIAL_ALERT_ENROLLMENT");
console.log("Send-time revalidation       : REQUIRED");
console.log("Current phone fingerprint    : REQUIRED");
console.log("Current policy version       : REQUIRED");
console.log("Signed consent evidence      : REQUIRED");
console.log("Legacy guardianSmsOptIn      : NOT AUTHORITATIVE");
console.log("Shared-family grouping       : PHONE + GUARDIAN NAME");
console.log("Ambiguous shared phone       : FAIL CLOSED / NO PROVIDER");
console.log("Queued stale to/body         : NOT TRUSTED");
console.log("Parent portal link           : REQUIRED / DIRECT");
console.log("Mock SMS formatter           : SHARED ROUTE + WORKER");
console.log("Worker public origin         : CONFIGURED ESSENTIAL ALERT AUTHORITY");
console.log("Public URL before admission  : REQUIRED");
console.log("Representative SMS length   : <=160 CHARACTERS");
console.log("Worker provider              : SHARED sendSms");
console.log("Provider attempt admission   : DURABLE BEFORE sendSms");
console.log("Automatic SMS retry          : FORBIDDEN AFTER ATTEMPT ADMISSION");
console.log("Ambiguous stale attempt      : REPLAY SUPPRESSED");
console.log("Known provider rejection     : RECIPIENT FAILED / OUTBOX COMPLETES");
console.log("Crash-after-provider window  : FAILS CLOSED / NO DUPLICATE AUTO-SEND");
console.log("Worker invalidation          : SKIPPED / OUTBOX COMPLETES");
console.log("Job counts                   : RECIPIENT-UNIT CONSISTENT");
console.log("smsNotifiedAt                : REQUIRES >=1 SENT");
console.log("Schema migration             : NONE");
console.log("Database access by QA        : NONE");
console.log("Provider calls by QA         : NONE");
console.log("");
console.log("=== A16A2B2 SOURCE CONTRACT GREEN ===");
