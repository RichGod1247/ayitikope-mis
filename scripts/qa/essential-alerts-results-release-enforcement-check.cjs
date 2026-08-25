#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- deterministic source-contract QA */

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..", "..");

function fail(message, detail) {
  const suffix =
    detail === undefined ? "" : `\n${JSON.stringify(detail, null, 2)}`;
  throw new Error(`${message}${suffix}`);
}

function assert(condition, message, detail) {
  if (!condition) fail(message, detail);
}

function read(relativePath) {
  const full = path.join(repoRoot, relativePath);
  assert(fs.existsSync(full), "A16A2B1_REQUIRED_FILE_MISSING", relativePath);
  return fs
    .readFileSync(full, "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
}

function indexBefore(text, first, second, message) {
  const a = text.indexOf(first);
  const b = text.indexOf(second);
  assert(a >= 0, `${message}_FIRST_MARKER_MISSING`, first);
  assert(b >= 0, `${message}_SECOND_MARKER_MISSING`, second);
  assert(a < b, `${message}_ORDER_INVALID`, { first, second, a, b });
}

const files = {
  notify: "src/app/api/headteacher/results/release/notify/route.ts",
  release: "src/app/api/headteacher/results/release/route.ts",
  status: "src/app/api/headteacher/results/release/status/route.ts",
  client: "src/components/HeadteacherResultsReleaseClient.tsx",
  parentHistory: "src/app/api/parent/sms/history/route.ts",
  enrollment: "src/lib/essentialAlerts/enrollment.ts",
  policy: "src/lib/essentialAlerts/policy.ts",
  sms: "src/lib/sms.ts",
  publicPage: "src/lib/essentialAlerts/publicPage.ts",
};

const source = Object.fromEntries(
  Object.entries(files).map(([key, relativePath]) => [
    key,
    read(relativePath),
  ]),
);

for (const marker of [
  '"RESULTS_RELEASE"',
  '"EDULIFE_ESSENTIAL_SCHOOL_ALERTS_V1"',
  "automaticPaidRenewal: false",
  "advertisingAllowed: false",
]) {
  assert(
    source.policy.includes(marker),
    "A16A2B1_POLICY_CONTRACT_MISSING",
    marker,
  );
}

for (const marker of [
  "export async function getGuardianEssentialAlertEligibilityMap",
  "EssentialAlertEnrollmentStatus.ENROLLED",
  "current.policyVersion !== ESSENTIAL_ALERT_POLICY.version",
  "guardianEvidenceAllowsPurpose",
  'evidence.consentSource === "SIGNED_GUARDIAN_LINK"',
]) {
  assert(
    source.enrollment.includes(marker),
    "A16A2B1_SHARED_AUTHORITY_MARKER_MISSING",
    marker,
  );
}

for (const forbidden of [
  "guardianSmsOptIn",
  "sendViaHubtel",
  "getBaseUrl(",
  "current.eligible = current.eligible || result.eligible",
]) {
  assert(
    !source.notify.includes(forbidden),
    "A16A2B1_NOTIFY_LEGACY_OR_UNTRUSTED_PATH_PRESENT",
    forbidden,
  );
}

for (const marker of [
  "getGuardianEssentialAlertEligibilityMap",
  'const RESULTS_RELEASE_PURPOSE = "RESULTS_RELEASE" as const;',
  'eligibilityAuthority: "ESSENTIAL_ALERT_ENROLLMENT"',
  "essentialAlertPublicOrigin(req)",
  "await sendSms({",
  'template: "RESULTS_RELEASE_ALERT"',
  "RESULTS_RELEASE_NOTIFY_IN_PROGRESS",
  "JOB_LOCK_TTL_MINUTES",
  'status: "RUNNING"',
  'status: done ? "DONE" : "PENDING"',
  "releaseSnapshotHash",
  "RESULTS_RELEASE_NOT_EVIDENCE_BACKED",
  "providerAttempts",
  "eligibleTargetsByPhone",
  "eligibleLearners",
  "eligibleLearnerLabel",
  "eligibleLearnerCount",
]) {
  assert(
    source.notify.includes(marker),
    "A16A2B1_NOTIFY_CONTRACT_MARKER_MISSING",
    marker,
  );
}

indexBefore(
  source.notify,
  "await getGuardianEssentialAlertEligibilityMap",
  "await sendSms({",
  "A16A2B1_ELIGIBILITY_MUST_PRECEDE_PROVIDER",
);

indexBefore(
  source.notify,
  "essentialAlertPublicOrigin(req)",
  "await sendSms({",
  "A16A2B1_TRUSTED_ORIGIN_MUST_PRECEDE_PROVIDER",
);

indexBefore(
  source.notify,
  "RESULTS_RELEASE_NOT_EVIDENCE_BACKED",
  "await sendSms({",
  "A16A2B1_RELEASE_EVIDENCE_MUST_PRECEDE_PROVIDER",
);

indexBefore(
  source.notify,
  "const eligibleTarget = currentPhone",
  "await sendSms({",
  "A16A2B1_PER_PHONE_ELIGIBLE_LEARNERS_MUST_PRECEDE_PROVIDER",
);

indexBefore(
  source.notify,
  "const learnerLabel = eligibleLearnerLabel(",
  "await sendSms({",
  "A16A2B1_ELIGIBLE_LEARNER_MESSAGE_MUST_PRECEDE_PROVIDER",
);

assert(
  source.sms.includes("export async function sendSms"),
  "A16A2B1_SHARED_SMS_WRAPPER_MISSING",
);
assert(
  source.sms.includes("await prisma.sMSSendAudit.create"),
  "A16A2B1_SMS_AUDIT_MISSING",
);
assert(
  source.sms.includes("await sendViaHubtel({"),
  "A16A2B1_SMS_WRAPPER_PROVIDER_MISSING",
);

for (const marker of [
  "Essential School Alerts · released results",
  "current consent and phone eligibility",
  "Send next eligible batch",
  "notify.batch?.skipped",
]) {
  assert(
    source.client.includes(marker),
    "A16A2B1_BBC_UI_MARKER_MISSING",
    marker,
  );
}

assert(
  !source.client.includes("SMS consent = true"),
  "A16A2B1_UI_STILL_DESCRIBES_LEGACY_CONSENT_AUTHORITY",
);

for (const marker of [
  "termResultsHistoryMessage",
  'if (s === "SENT")',
  'if (s === "SKIPPED")',
  'if (s === "FAILED")',
  "Essential School Alerts were not currently enabled",
]) {
  assert(
    source.parentHistory.includes(marker),
    "A16A2B1_PARENT_HISTORY_STATUS_TRUTH_MISSING",
    marker,
  );
}

for (const marker of [
  "readinessStatus",
  "releaseSnapshotHash",
  'status === "READY" || status === "OVERRIDE"',
]) {
  assert(
    source.status.includes(marker),
    "A16A2B1_STATUS_EVIDENCE_CONTRACT_MISSING",
    marker,
  );
}

for (const marker of [
  "releaseSnapshotHash",
  "ResultsReleaseReadinessStatus.READY",
  "ResultsReleaseReadinessStatus.OVERRIDE",
]) {
  assert(
    source.release.includes(marker),
    "A16A2B1_RELEASE_EVIDENCE_SOURCE_MISSING",
    marker,
  );
}

console.log("");
console.log(
  "=== A16A2B1 TERM RESULTS RELEASE — ESSENTIAL ALERTS ENFORCEMENT ===",
);
console.log("");
console.log("Purpose                    : RESULTS_RELEASE");
console.log("Recipient                  : GUARDIAN");
console.log("Eligibility authority      : ESSENTIAL_ALERT_ENROLLMENT");
console.log("Required status            : ENROLLED");
console.log("Current phone fingerprint  : REQUIRED");
console.log("Current policy version     : REQUIRED");
console.log("Signed consent evidence    : REQUIRED");
console.log("Legacy guardianSmsOptIn    : NOT AUTHORITATIVE");
console.log("Direct Hubtel in producer  : FORBIDDEN");
console.log("Shared sendSms wrapper     : REQUIRED");
console.log("Provider before eligibility: FORBIDDEN");
console.log("Hosted URL source          : HARDENED PUBLIC ORIGIN");
console.log("Evidence-backed release    : REQUIRED");
console.log("Job concurrent claim       : FAIL-CLOSED");
console.log("Ineligible pending target  : SKIPPED / NO PROVIDER");
console.log("Shared-phone mixed family  : ELIGIBLE LEARNERS ONLY");
console.log("SMS learner disclosure     : ENROLLED LEARNERS ONLY");
console.log("Parent history wording     : STATUS-TRUTHFUL");
console.log("");
console.log("=== A16A2B1 SOURCE CONTRACT GREEN ===");
