#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS QA harness intentionally loads repository files for deterministic static contract verification. */

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
  const full = path.join(repoRoot, relativePath);
  assert(fs.existsSync(full), "A16A2A_REQUIRED_FILE_MISSING", { relativePath });
  return fs.readFileSync(full, "utf8").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function indexBefore(text, first, second, message) {
  const a = text.indexOf(first);
  const b = text.indexOf(second);
  assert(a >= 0, `${message}_FIRST_MARKER_MISSING`, { first });
  assert(b >= 0, `${message}_SECOND_MARKER_MISSING`, { second });
  assert(a < b, `${message}_ORDER_INVALID`, { first, second, a, b });
}

function countOccurrences(text, marker) {
  return text.split(marker).length - 1;
}

const files = {
  sender: "src/app/api/attendance/notify-absentees/route.ts",
  preview: "src/app/api/admin/attendance/absentees/route.ts",
  page: "src/app/admin/attendance/page.tsx",
  enrollment: "src/lib/essentialAlerts/enrollment.ts",
  policy: "src/lib/essentialAlerts/policy.ts",
  teacherSender: "src/app/api/teacher/attendance/notify-parents/route.ts",
  teacherSession: "src/app/api/teacher/attendance/sessions/get/route.ts",
  teacherSessionClient: "src/components/attendance/AttendanceSessionClient.tsx",
  teacherListClient: "src/components/teacher/TeacherAttendanceClient.tsx",
};

const sender = read(files.sender);
const preview = read(files.preview);
const page = read(files.page);
const enrollment = read(files.enrollment);
const policy = read(files.policy);
const teacherSender = read(files.teacherSender);
const teacherSession = read(files.teacherSession);
const teacherSessionClient = read(files.teacherSessionClient);
const teacherListClient = read(files.teacherListClient);

assert(
  policy.includes('"STUDENT_ATTENDANCE"'),
  "A16A2A_POLICY_PURPOSE_MISSING",
);

assert(
  enrollment.includes("export async function getGuardianEssentialAlertEligibilityMap"),
  "A16A2A_SHARED_ELIGIBILITY_AUTHORITY_MISSING",
);
assert(
  enrollment.includes("recipientKind: EssentialAlertRecipientKind.GUARDIAN"),
  "A16A2A_GUARDIAN_KIND_CHECK_MISSING",
);
assert(
  enrollment.includes("EssentialAlertEnrollmentStatus.ENROLLED"),
  "A16A2A_ENROLLED_STATUS_CHECK_MISSING",
);
assert(
  enrollment.includes("current.policyVersion !== ESSENTIAL_ALERT_POLICY.version"),
  "A16A2A_POLICY_VERSION_CHECK_MISSING",
);
assert(
  enrollment.includes("current.phoneNormSnapshot !== student.phoneNorm"),
  "A16A2A_PHONE_SNAPSHOT_CHECK_MISSING",
);
assert(
  enrollment.includes("row.phoneFingerprint === student.phoneFingerprint"),
  "A16A2A_PHONE_FINGERPRINT_CHECK_MISSING",
);
assert(
  enrollment.includes("guardianEvidenceAllowsPurpose"),
  "A16A2A_PURPOSE_EVIDENCE_CHECK_MISSING",
);
assert(
  enrollment.includes('evidence.consentSource === "SIGNED_GUARDIAN_LINK"'),
  "A16A2A_GUARDIAN_CONSENT_SOURCE_CHECK_MISSING",
);
assert(
  enrollment.includes('evidence.decision === "ENABLE"'),
  "A16A2A_ENABLE_DECISION_CHECK_MISSING",
);
assert(
  !enrollment.includes("guardianSmsOptIn"),
  "A16A2A_LEGACY_FLAG_LEAKED_INTO_AUTHORITY",
);

assert(
  sender.includes("getGuardianEssentialAlertEligibilityMap"),
  "A16A2A_SENDER_SHARED_AUTHORITY_MISSING",
);
assert(
  sender.includes('purpose: "STUDENT_ATTENDANCE"'),
  "A16A2A_SENDER_PURPOSE_MISSING",
);
assert(
  !sender.includes("guardianSmsOptIn"),
  "A16A2A_SENDER_STILL_USES_LEGACY_FLAG",
);
assert(
  sender.includes('eligibilityAuthority: "ESSENTIAL_ALERT_ENROLLMENT"'),
  "A16A2A_SENDER_AUTHORITY_AUDIT_MARKER_MISSING",
);
indexBefore(
  sender,
  "getGuardianEssentialAlertEligibilityMap",
  "await sendSms({",
  "A16A2A_ELIGIBILITY_MUST_PRECEDE_PROVIDER",
);

for (const marker of [
  "const LOCK_TTL_MINUTES = 8",
  "notifyingAt: true",
  "if (session.notifiedAt)",
  "const claim = await prisma.attendanceSession.updateMany",
  "notifiedAt: null",
  "notifyingAt: now",
  "if (claim.count !== 1)",
  "alreadyNotified: true",
  "inProgress: true",
  '"PARTIAL_NOTIFICATION_FILTER_NOT_SUPPORTED"',
  'notificationClaim: "SESSION_NOTIFYING_AT"',
  "notificationSealed: sealedAt !== null",
  "notifiedAt: sealedAt",
  "notifyingAt: null",
  "const seal = await prisma.attendanceSession.updateMany",
  '"ATTENDANCE_NOTIFICATION_SEAL_FAILED"',
]) {
  assert(sender.includes(marker), "A16A2A_REPLAY_SEAL_MARKER_MISSING", marker);
}

assert(
  countOccurrences(sender, "const sealedAt = successCount > 0 ? new Date() : null;") >= 2,
  "A16A2A_PARTIAL_SUCCESS_SEAL_RECOVERY_MISSING",
);

indexBefore(
  sender,
  "const claim = await prisma.attendanceSession.updateMany",
  "await sendSms({",
  "A16A2A_CLAIM_MUST_PRECEDE_PROVIDER",
);

indexBefore(
  sender,
  "if (session.notifiedAt)",
  "const claim = await prisma.attendanceSession.updateMany",
  "A16A2A_ALREADY_NOTIFIED_MUST_PRECEDE_CLAIM",
);

assert(
  preview.includes("getGuardianEssentialAlertEligibilityMap"),
  "A16A2A_PREVIEW_SHARED_AUTHORITY_MISSING",
);
assert(
  preview.includes('purpose: "STUDENT_ATTENDANCE"'),
  "A16A2A_PREVIEW_PURPOSE_MISSING",
);
assert(
  !preview.includes("if (!student.guardianSmsOptIn)"),
  "A16A2A_PREVIEW_STILL_DECIDES_FROM_LEGACY_FLAG",
);
assert(
  preview.includes('eligibilityAuthority: "ESSENTIAL_ALERT_ENROLLMENT"'),
  "A16A2A_PREVIEW_AUTHORITY_MARKER_MISSING",
);

assert(
  page.includes("getGuardianEssentialAlertEligibilityMap"),
  "A16A2A_PAGE_SHARED_AUTHORITY_MISSING",
);
assert(
  page.includes('purpose: "STUDENT_ATTENDANCE"'),
  "A16A2A_PAGE_PURPOSE_MISSING",
);
assert(
  !page.includes("guardianSmsOptIn"),
  "A16A2A_PAGE_STILL_PRESENTS_LEGACY_FLAG_AS_AUTHORITY",
);
assert(
  page.includes("<th>Essential Alerts</th>"),
  "A16A2A_PAGE_LABEL_NOT_CORRECTED",
);

assert(
  sender.includes('"NO_SMS_OPT_IN"'),
  "A16A2A_BACKCOMPAT_SKIP_CODE_REMOVED",
);
assert(
  preview.includes('"NO_SMS_OPT_IN"'),
  "A16A2A_BACKCOMPAT_PREVIEW_CODE_REMOVED",
);


for (const marker of [
  "getGuardianEssentialAlertEligibilityMap",
  'purpose: "STUDENT_ATTENDANCE"',
  'eligibilityAuthority: "ESSENTIAL_ALERT_ENROLLMENT"',
  'essentialAlertPurpose: "STUDENT_ATTENDANCE"',
  "const LOCK_TTL_MINUTES = 8",
  "const claim = await prisma.attendanceSession.updateMany",
  'notificationClaim: "SESSION_NOTIFYING_AT"',
  "notificationSealed: sealedAt !== null",
  "const seal = await prisma.attendanceSession.updateMany",
  '"ATTENDANCE_NOTIFICATION_SEAL_FAILED"',
]) {
  assert(
    teacherSender.includes(marker),
    "A16A2A_TEACHER_SENDER_CONVERGENCE_MARKER_MISSING",
    marker,
  );
}

assert(
  !teacherSender.includes("guardianSmsOptIn"),
  "A16A2A_TEACHER_SENDER_STILL_USES_LEGACY_FLAG",
);
indexBefore(
  teacherSender,
  "const claim = await prisma.attendanceSession.updateMany",
  "await getGuardianEssentialAlertEligibilityMap",
  "A16A2A_TEACHER_CLAIM_MUST_PRECEDE_ELIGIBILITY",
);
indexBefore(
  teacherSender,
  "await getGuardianEssentialAlertEligibilityMap",
  "await sendSms({",
  "A16A2A_TEACHER_ELIGIBILITY_MUST_PRECEDE_PROVIDER",
);
assert(
  countOccurrences(
    teacherSender,
    "const sealedAt = successCount > 0 ? new Date() : null;",
  ) >= 2,
  "A16A2A_TEACHER_PARTIAL_SUCCESS_SEAL_RECOVERY_MISSING",
);

for (const marker of [
  "getGuardianEssentialAlertEligibilityMap",
  'purpose: "STUDENT_ATTENDANCE"',
  "essentialAlertSmsEligible",
  "essentialAlertEligibility",
  'eligibilityAuthority: "ESSENTIAL_ALERT_ENROLLMENT"',
  'essentialAlertPurpose: "STUDENT_ATTENDANCE"',
]) {
  assert(
    teacherSession.includes(marker),
    "A16A2A_TEACHER_SESSION_AUTHORITY_MARKER_MISSING",
    marker,
  );
}
assert(
  !teacherSession.includes("guardianSmsOptIn"),
  "A16A2A_TEACHER_SESSION_STILL_EXPOSES_LEGACY_ATTENDANCE_AUTHORITY",
);

for (const marker of [
  "essentialAlertSmsEligible",
  "essentialAlertEligibility",
  "Essential Alerts eligible",
  "Essential Alerts not enabled",
]) {
  assert(
    teacherSessionClient.includes(marker),
    "A16A2A_TEACHER_SESSION_UI_AUTHORITY_MARKER_MISSING",
    marker,
  );
}
assert(
  !teacherSessionClient.includes("guardianSmsOptIn"),
  "A16A2A_TEACHER_SESSION_UI_STILL_USES_LEGACY_ATTENDANCE_AUTHORITY",
);

assert(
  teacherListClient.includes(
    'fetch("/api/teacher/attendance/notify-parents"',
  ),
  "A16A2A_TEACHER_LIST_NOTIFY_CALLER_MISSING",
);
assert(
  !teacherListClient.includes("guardianSmsOptIn"),
  "A16A2A_TEACHER_LIST_CLIENT_MUST_NOT_DECIDE_FROM_LEGACY_FLAG",
);

console.log("");
console.log("=== A16A2A STUDENT ATTENDANCE — ESSENTIAL ALERT ENFORCEMENT ===");
console.log("");
console.log("Purpose                         : STUDENT_ATTENDANCE");
console.log("Eligibility authority           : ESSENTIAL_ALERT_ENROLLMENT");
console.log("Recipient kind                  : GUARDIAN");
console.log("Required status                 : ENROLLED");
console.log("Current phone fingerprint       : REQUIRED");
console.log("Current policy version          : REQUIRED");
console.log("Recorded consent evidence       : REQUIRED");
console.log("Signed guardian source          : REQUIRED");
console.log("Legacy guardianSmsOptIn sender  : NOT AUTHORITATIVE");
console.log("Preview/sender authority        : SHARED");
console.log("Teacher live producer authority : SHARED");
console.log("Teacher session/UI authority    : SHARED");
console.log("Provider call before eligibility: FORBIDDEN");
console.log("Session replay claim            : ATOMIC / STALE-LOCK RECOVERY");
console.log("Already-notified replay         : PROVIDER CALL FORBIDDEN");
console.log("Partial filtered sealing        : FORBIDDEN");
console.log("Partial-success replay          : SEALED");
console.log("Zero-success retry              : CLAIM RELEASED");
console.log("Legacy response code            : RETAINED FOR BACK-COMPAT");
console.log("");
console.log("RESULT: A16A2A ATTENDANCE ESSENTIAL ALERT ENFORCEMENT GREEN");
