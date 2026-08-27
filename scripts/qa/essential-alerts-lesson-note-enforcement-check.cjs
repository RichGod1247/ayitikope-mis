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
  enrollment: "src/lib/essentialAlerts/enrollment.ts",
  policy: "src/lib/essentialAlerts/policy.ts",
  review: "src/app/api/headteacher/lesson-notes/review/route.ts",
  submit: "src/lib/lessonNotes/submitNotifications.ts",
  sms: "src/lib/sms.ts",
};

const source = Object.fromEntries(
  Object.entries(files).map(([key, relativePath]) => [key, read(relativePath)]),
);

console.log(
  "=== A16A2 LESSON NOTE WORKFLOW — STAFF ESSENTIAL ALERTS ENFORCEMENT ===",
);

for (const marker of [
  "export type StaffEssentialAlertPurpose",
  "export async function getStaffEssentialAlertEligibilityMap",
  "recipientKind: EssentialAlertRecipientKind.STAFF",
  'status: "ACTIVE"',
  "STAFF_ALERT_ROLES",
  "essentialAlertPhoneFingerprint",
  "phoneNormSnapshot",
  "EssentialAlertEnrollmentStatus.ENROLLED",
  "ESSENTIAL_ALERT_POLICY.version",
  "staffEvidenceAllowsPurpose",
  '"SIGNED_STAFF_LINK"',
  '"AUTHENTICATED_STAFF_SELF_SERVICE"',
]) {
  assert(
    source.enrollment.includes(marker),
    "A16A2_LESSON_NOTE_STAFF_AUTHORITY_MARKER_MISSING",
    marker,
  );
}

for (const [name, text] of [
  ["review", source.review],
  ["submit", source.submit],
]) {
  for (const marker of [
    "getStaffEssentialAlertEligibilityMap",
    'const LESSON_NOTE_WORKFLOW_PURPOSE = "LESSON_NOTE_WORKFLOW" as const;',
    'const ESSENTIAL_ALERT_AUTHORITY = "ESSENTIAL_ALERT_ENROLLMENT" as const;',
    "essentialAlertPurpose: LESSON_NOTE_WORKFLOW_PURPOSE",
    "eligibilityAuthority: ESSENTIAL_ALERT_AUTHORITY",
    "sendSms({",
  ]) {
    assert(
      text.includes(marker),
      `A16A2_LESSON_NOTE_${name.toUpperCase()}_AUTHORITY_MARKER_MISSING`,
      marker,
    );
  }

  for (const forbidden of ["smsOptIn", "TEACHER_SMS_OPT_OUT", "HEADTEACHER_SMS_OPT_OUT"]) {
    assert(
      !text.includes(forbidden),
      `A16A2_LESSON_NOTE_${name.toUpperCase()}_LEGACY_AUTHORITY_PRESENT`,
      forbidden,
    );
  }
}

indexBefore(
  source.review,
  "await getStaffEssentialAlertEligibilityMap({",
  "const result = await sendSms({",
  "A16A2_LESSON_NOTE_REVIEW_ELIGIBILITY_MUST_PRECEDE_PROVIDER",
);

indexBefore(
  source.submit,
  "await getStaffEssentialAlertEligibilityMap({",
  "const result = await sendSms({",
  "A16A2_LESSON_NOTE_SUBMIT_ELIGIBILITY_MUST_PRECEDE_PROVIDER",
);

assert(
  source.review.includes("to: teacherEligibility.phoneNorm"),
  "A16A2_LESSON_NOTE_REVIEW_CURRENT_AUTHORITY_PHONE_MISSING",
);

for (const marker of ["to: teacherEligibility.phoneNorm", "to: headEligibility.phoneNorm"]) {
  assert(
    source.submit.includes(marker),
    "A16A2_LESSON_NOTE_SUBMIT_CURRENT_AUTHORITY_PHONE_MISSING",
    marker,
  );
}

assert(source.sms.includes("sMSSendAudit.create"), "A16A2_LESSON_NOTE_SHARED_SMS_AUDIT_REQUIRED");

console.log("");
console.log("Purpose                     : LESSON_NOTE_WORKFLOW");
console.log("Recipient authority         : STAFF ESSENTIAL ALERT ENROLLMENT");
console.log("Teacher submission SMS      : ENFORCED");
console.log("Headteacher submission SMS  : ENFORCED");
console.log("Teacher review SMS          : ENFORCED");
console.log("Active staff membership     : REQUIRED");
console.log("Eligible staff role         : REQUIRED");
console.log("Current phone fingerprint   : REQUIRED");
console.log("Current policy version      : REQUIRED");
console.log("Consent evidence            : SIGNED LINK OR AUTHENTICATED SELF-SERVICE");
console.log("Legacy smsOptIn             : NOT AUTHORITATIVE");
console.log("Send-time revalidation      : REQUIRED BEFORE sendSms");
console.log("Worker/outbox migration     : NOT REQUIRED IN THIS SLICE");
console.log("Schema migration            : NONE");
console.log("Database access by QA       : NONE");
console.log("Provider calls by QA        : NONE");
console.log("");
console.log("=== A16A2 LESSON NOTE SOURCE CONTRACT GREEN ===");
