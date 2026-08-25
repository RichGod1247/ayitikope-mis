#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS QA harness intentionally reads repository source files. */

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..", "..");

const files = {
  tokens: "src/lib/essentialAlerts/tokens.ts",
  enrollment: "src/lib/essentialAlerts/enrollment.ts",
  publicPage: "src/lib/essentialAlerts/publicPage.ts",
  campaignPreview: "src/app/api/consent/campaign/preview/route.ts",
  campaignSend: "src/app/api/consent/campaign/send/route.ts",
  smsText: "src/app/api/consent/optin/sms-text/route.ts",
  guardianLegacy: "src/app/api/consent/optin/student/link/route.ts",
  staffLegacy: "src/app/api/consent/optin/teacher/link/route.ts",
  compactRoute: "src/app/a/[code]/route.ts",
  adminStudentSend: "src/app/api/admin/students/consent/send/route.ts",
  headteacherUi: "src/app/headteacher/consent/page.tsx",
};

function fail(message, detail) {
  const suffix = detail === undefined ? "" : `\n${JSON.stringify(detail, null, 2)}`;
  throw new Error(`${message}${suffix}`);
}

function assert(condition, message, detail) {
  if (!condition) fail(message, detail);
}

function read(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  if (!fs.existsSync(absolutePath)) fail("Required file missing", relativePath);
  return fs
    .readFileSync(absolutePath, "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
}

function sectionBetween(text, startMarker, endMarker, message) {
  const start = text.indexOf(startMarker);
  const end = text.indexOf(endMarker, start + startMarker.length);
  assert(start >= 0, `${message}_START_MISSING`, startMarker);
  assert(end > start, `${message}_END_MISSING`, endMarker);
  return text.slice(start, end);
}

const source = Object.fromEntries(
  Object.entries(files).map(([key, relativePath]) => [key, read(relativePath)]),
);

for (const marker of [
  "signEssentialAlertCompactInvite",
  "verifyEssentialAlertCompactInvite",
  "ESSENTIAL_ALERT_SHORT_V1",
  "COMPACT_SIGNATURE_BYTES = 16",
  "invitationCount.toString(36)",
  "timingSafeEqual",
]) {
  assert(source.tokens.includes(marker), "Compact token contract marker missing", marker);
}

for (const marker of [
  "guardianFamilyContact",
  "normalizeGuardianNameKey",
  "A phone number alone is not enough to merge households",
  "buildGuardianFamilyEssentialAlertInvitation",
  "buildGuardianFamilyEssentialAlertInvitationBatch",
  "guardianFamilyDirectory",
  "MAX_GUARDIAN_DIRECTORY_STUDENTS",
  "recordGuardianFamilyInvitationAttempt",
  "revalidatePreparedGuardianFamily",
  "recordGuardianFamilyInvitationSent",
  "resolveEssentialAlertCompactInvitation",
  "applyEssentialAlertCompactDecision",
  "ESSENTIAL_ALERT_LINK_ALREADY_USED",
  "ESSENTIAL_ALERT_LINK_SUPERSEDED",
  "ESSENTIAL_ALERT_LINK_EXPIRED",
  "lastInvitationAttemptAt",
  "invitationCount",
  "familyDecision: true",
]) {
  assert(source.enrollment.includes(marker), "Family/single-use authority marker missing", marker);
}

const guardianBatchSection = sectionBetween(
  source.enrollment,
  "export async function buildGuardianFamilyEssentialAlertInvitationBatch",
  "export async function buildStaffEssentialAlertInvitation",
  "Guardian family batch section",
);

for (const marker of [
  "directory.flatMap((family)",
  "const materialized = directory.map((family)",
  "const inviteable = materialized.filter(",
  "family.inviteableChildren > 0",
  "return [...inviteable, ...notInviteable].slice(0, limit);",
]) {
  assert(
    guardianBatchSection.includes(marker),
    "Guardian campaign batch progression marker missing",
    marker,
  );
}

assert(
  !guardianBatchSection.includes("directory.slice(0, limit)"),
  "Guardian campaign must not truncate the family directory before eligibility is known",
);

assert(
  guardianBatchSection.indexOf("const materialized = directory.map") <
    guardianBatchSection.indexOf(".slice(0, limit)"),
  "Guardian campaign must determine family eligibility before applying the send window",
);

const individualAttemptSection = sectionBetween(
  source.enrollment,
  "export async function recordEssentialAlertInvitationAttempt",
  "export async function recordGuardianFamilyInvitationAttempt",
  "Individual invitation attempt section",
);
const familyAttemptSection = sectionBetween(
  source.enrollment,
  "export async function recordGuardianFamilyInvitationAttempt",
  "export async function recordEssentialAlertInvitationSent",
  "Guardian family invitation attempt section",
);
const individualSentSection = sectionBetween(
  source.enrollment,
  "export async function recordEssentialAlertInvitationSent",
  "export async function recordGuardianFamilyInvitationSent",
  "Individual invitation sent section",
);
const familySentSection = sectionBetween(
  source.enrollment,
  "export async function recordGuardianFamilyInvitationSent",
  "function legacyTokenMatchesCurrentAttempt",
  "Guardian family invitation sent section",
);

for (const [label, attemptSection] of [
  ["INDIVIDUAL", individualAttemptSection],
  ["GUARDIAN_FAMILY", familyAttemptSection],
]) {
  assert(
    attemptSection.includes("lastInvitationAttemptAt: now"),
    "Current invitation attempt timestamp missing",
    label,
  );
  assert(
    attemptSection.includes("lastInvitationSentAt: null"),
    "New invitation attempt must clear stale sent evidence",
    label,
  );
  assert(
    attemptSection.indexOf("lastInvitationAttemptAt: now") <
      attemptSection.indexOf("lastInvitationSentAt: null"),
    "Sent evidence must be cleared as part of the new attempt state",
    label,
  );
}

for (const [label, sentSection] of [
  ["INDIVIDUAL", individualSentSection],
  ["GUARDIAN_FAMILY", familySentSection],
]) {
  for (const marker of [
    "updateMany({",
    "lastInvitationSentAt: null",
    "data: { lastInvitationSentAt: now }",
    "ESSENTIAL_ALERT_INVITATION_SENT_ATTEMPT_MISMATCH",
    "attemptBound: true",
  ]) {
    assert(
      sentSection.includes(marker),
      "Sent evidence must be atomically bound to the accepted invitation attempt",
      { label, marker },
    );
  }
}

for (const marker of [
  "expectedInvitationCount: number",
  "invitationCount: expectedInvitationCount",
  "claimed.count !== 1",
]) {
  assert(
    individualSentSection.includes(marker),
    "Individual sent recorder attempt-binding marker missing",
    marker,
  );
}

for (const marker of [
  "attempts: Array<{",
  "attemptsById",
  "recipientKind: EssentialAlertRecipientKind.GUARDIAN",
  "invitationCount,",
  "claimed.count !== 1",
]) {
  assert(
    familySentSection.includes(marker),
    "Family sent recorder attempt-binding marker missing",
    marker,
  );
}
assert(
  source.enrollment.includes('if (!input.lastInvitationSentAt) return "NOT_SENT";'),
  "Compact resolver must treat an unconfirmed current attempt as NOT_SENT",
);

// Protect the already-green A16A2A attendance authority while hardening A16A1.
for (const marker of [
  "getGuardianEssentialAlertEligibilityMap",
  'consentSource === "SIGNED_GUARDIAN_LINK"',
  'reason: "POLICY_VERSION_MISMATCH"',
  '"CONSENT_EVIDENCE_MISMATCH"',
  "phoneNormSnapshot",
]) {
  assert(source.enrollment.includes(marker), "A16A2A attendance authority marker lost", marker);
}

for (const marker of [
  "essentialAlertPublicOrigin",
  'url.hostname === "127.0.0.1"',
  'url.hostname === "localhost"',
  'req.headers.get("host")',
  '"x-forwarded-host"',
  "isLoopbackOrigin(headerOrigin)",
  "NEXT_PUBLIC_BASE_URL",
  "NEXT_PUBLIC_APP_URL",
  "APP_BASE_URL",
  "NEXTAUTH_URL",
]) {
  assert(source.publicPage.includes(marker), "Public-origin hardening marker missing", marker);
}

assert(
  source.publicPage.indexOf("NEXT_PUBLIC_BASE_URL") <
    source.publicPage.indexOf("NEXTAUTH_URL"),
  "Public application URL must be preferred over NEXTAUTH_URL",
);


for (const marker of [
  "ESSENTIAL_ALERT_PUBLIC_ORIGIN_REQUIRED",
  "ESSENTIAL_ALERT_PUBLIC_ORIGIN_INSECURE",
  'parsed.protocol !== "https:"',
  "if (configured && !isLoopbackOrigin(configured)) return configured;",
]) {
  assert(
    source.publicPage.includes(marker),
    "Hosted public-origin fail-closed marker missing",
    marker,
  );
}

assert(
  !source.publicPage.includes("if (requested) return requested;"),
  "Hosted Essential Alerts origin must never fail open to request-derived host",
);

for (const marker of [
  "buildGuardianFamilyEssentialAlertInvitationBatch",
  "recordGuardianFamilyInvitationAttempt",
  "preparedFamily: family",
  "signEssentialAlertCompactInvite",
  "recordGuardianFamilyInvitationSent",
  "coveredStudentIds",
  "shortLink: true",
  "essentialAlertPublicOrigin(req)",
]) {
  assert(source.campaignSend.includes(marker), "Campaign family/short-link marker missing", marker);
}

assert(
  !source.campaignSend.includes("seenFamilies"),
  "Campaign Guardian send must not deduplicate only after per-student family resolution",
);
assert(
  !source.campaignSend.includes("buildGuardianFamilyEssentialAlertInvitation({"),
  "Campaign Guardian send must use the batched family directory",
);

assert(
  !source.campaignSend.includes("/api/consent/optin/student/link?token="),
  "Campaign must not emit long Guardian token links",
);
assert(
  !source.campaignSend.includes("/api/consent/optin/teacher/link?token="),
  "Campaign must not emit long staff token links",
);
assert(
  source.campaignSend.includes("/a/${encodeURIComponent(code)}"),
  "Campaign compact /a/ link missing",
);

for (const marker of [
  "if (sms.ok) {\n          await recordGuardianFamilyInvitationSent({",
  "if (sms.ok) {\n          await recordEssentialAlertInvitationSent({",
]) {
  assert(
    source.campaignSend.includes(marker),
    "Campaign must record sent state only after provider acceptance",
    marker,
  );
}


for (const marker of [
  "expectedInvitationCount: attempt.row.invitationCount",
  "attempts: attempt.rows.map((row) => ({",
  "invitationCount: row.invitationCount",
]) {
  assert(
    source.campaignSend.includes(marker),
    "Campaign sent evidence must carry the exact accepted attempt identity",
    marker,
  );
}

const adminTeacherStart = source.adminStudentSend.indexOf(
  'if (roleName === "TEACHER")',
);
const adminFamilyStart = source.adminStudentSend.indexOf(
  "const invite = await buildGuardianFamilyEssentialAlertInvitation({",
  adminTeacherStart,
);
assert(adminTeacherStart >= 0, "Admin Teacher invitation branch missing");
assert(adminFamilyStart > adminTeacherStart, "Admin family invitation branch missing");

const adminTeacherSection = source.adminStudentSend.slice(
  adminTeacherStart,
  adminFamilyStart,
);
const adminFamilySection = source.adminStudentSend.slice(adminFamilyStart);

for (const [label, sendSection, sentMarker] of [
  ["TEACHER_SINGLE", adminTeacherSection, "await recordEssentialAlertInvitationSent({"],
  ["GUARDIAN_FAMILY", adminFamilySection, "await recordGuardianFamilyInvitationSent({"],
]) {
  const providerResultCheck = sendSection.indexOf("if (!sms.ok)");
  const sentRecord = sendSection.indexOf(sentMarker);
  assert(providerResultCheck >= 0, "Provider acceptance check missing", label);
  assert(sentRecord > providerResultCheck, "Sent state recorded before provider acceptance", label);
}


assert(
  adminTeacherSection.includes(
    "expectedInvitationCount: attempt.row.invitationCount",
  ),
  "Admin single-learner sent evidence must bind to the exact invitation count",
);
for (const marker of [
  "attempts: attempt.rows.map((row) => ({",
  "invitationCount: row.invitationCount",
]) {
  assert(
    adminFamilySection.includes(marker),
    "Admin family sent evidence must bind every row to its exact invitation count",
    marker,
  );
}

for (const marker of [
  'const STAFF_NO_PHONE_ERROR = "ESSENTIAL_ALERT_STAFF_PHONE_MISSING";',
  "function staffInvitationSkipReason(error: unknown)",
  "error.message === STAFF_NO_PHONE_ERROR",
  'return "PHONE_MISSING" as const;',
  "const skipReason = staffInvitationSkipReason(error);",
  "reason: skipReason,",
]) {
  assert(
    source.campaignSend.includes(marker),
    "Staff no-phone skip reporting marker missing",
    marker,
  );
}

const staffSkipBranchStart = source.campaignSend.indexOf(
  "const skipReason = staffInvitationSkipReason(error);",
);
const staffGenericFailureStart = source.campaignSend.indexOf(
  'reason: error instanceof Error ? error.message : "INVITATION_FAILED"',
  staffSkipBranchStart,
);
assert(staffSkipBranchStart >= 0, "Staff no-phone skip branch missing");
assert(
  staffGenericFailureStart > staffSkipBranchStart,
  "Staff no-phone skip branch must run before generic failure reporting",
);

const staffSkipBranch = source.campaignSend.slice(
  staffSkipBranchStart,
  staffGenericFailureStart,
);
for (const marker of ["ok: true", "skipped: true", "continue;"]) {
  assert(
    staffSkipBranch.includes(marker),
    "Staff no-phone branch must be an explicit skip",
    marker,
  );
}
assert(
  !staffSkipBranch.includes("sendSms({"),
  "Staff no-phone skip branch must not call the SMS provider",
);

const staffBuildStart = source.campaignSend.indexOf(
  "const invite = await buildStaffEssentialAlertInvitation({",
);
const staffProviderStart = source.campaignSend.indexOf(
  "const sms = await sendSms({",
  staffBuildStart,
);
assert(staffBuildStart >= 0, "Staff invitation eligibility builder missing");
assert(
  staffProviderStart > staffBuildStart,
  "Staff eligibility must resolve before SMS provider dispatch",
);

for (const marker of [
  "buildGuardianFamilyEssentialAlertInvitationBatch",
  "coveredLearners",
  "childNames",
]) {
  assert(source.campaignPreview.includes(marker), "Family preview marker missing", marker);
}

assert(
  !source.campaignPreview.includes("seenFamilies"),
  "Guardian preview must not deduplicate only after per-student family resolution",
);
assert(
  !source.campaignPreview.includes("buildGuardianFamilyEssentialAlertInvitation({"),
  "Guardian preview must use the batched family directory",
);

for (const marker of [
  "signEssentialAlertCompactInvite",
  "activeInvitation",
  "essentialAlertPublicOrigin(req)",
  "familyLearnerCount",
  "databaseWrites: 0",
]) {
  assert(source.smsText.includes(marker), "SMS text compact-link marker missing", marker);
}
assert(
  !source.smsText.includes("/api/consent/optin/student/link?token="),
  "SMS text preview must not emit long Guardian token links",
);

for (const marker of [
  "resolveEssentialAlertCompactInvitation",
  "applyEssentialAlertCompactDecision",
  'resolved.state !== "READY"',
  'case "USED_ENABLED"',
  'case "USED_DECLINED"',
  "This invitation has expired",
  "Use the newest invitation",
  "includedInInvitation",
  "expires",
]) {
  assert(source.compactRoute.includes(marker), "Compact public route marker missing", marker);
}

for (const routeKey of ["guardianLegacy", "staffLegacy"]) {
  for (const marker of [
    "lastInvitationAttemptAt",
    "INVITATION_SUPERSEDED",
    "function usedPage",
    "EssentialAlertEnrollmentStatus.INVITED",
  ]) {
    assert(source[routeKey].includes(marker), "Legacy replay hardening marker missing", {
      routeKey,
      marker,
    });
  }
}

for (const marker of [
  "buildGuardianFamilyEssentialAlertInvitation",
  "signEssentialAlertCompactInvite",
  "recordGuardianFamilyInvitationAttempt",
  "recordGuardianFamilyInvitationSent",
  "healthConsentChanged: false",
  "legacySmsOptInChanged: false",
  'roleName === "TEACHER"',
  "assertCanAccessClassroom",
]) {
  assert(source.adminStudentSend.includes(marker), "Admin consent route hardening marker missing", marker);
}
assert(
  !source.adminStudentSend.includes("signStudentConsentToken"),
  "Legacy student consent token must not remain authoritative in admin send route",
);
assert(
  !source.adminStudentSend.includes("Please confirm health & SMS consent"),
  "Health consent must not be coupled to Essential Alerts",
);
assert(
  !source.adminStudentSend.includes("sendViaHubtel"),
  "Admin route must use the shared SMS provider wrapper",
);

for (const marker of [
  "Learners covered",
  "same guardian name and phone",
]) {
  assert(source.headteacherUi.includes(marker), "Headteacher family UX marker missing", marker);
}

for (const [surface, value] of Object.entries({
  compactRoute: source.compactRoute,
  guardianLegacy: source.guardianLegacy,
  staffLegacy: source.staffLegacy,
  headteacherUi: source.headteacherUi,
})) {
  for (const forbiddenCopy of [
    "Health information and health consent are separate",
    "Health consent was not changed",
    "This choice does not include health or wellbeing consent",
    "This invitation has now been used and cannot submit another decision",
    "This invitation has already been used",
    "This old invitation cannot submit another decision",
  ]) {
    assert(
      !value.includes(forbiddenCopy),
      "Unnecessary public consent copy must remain absent",
      { surface, forbiddenCopy },
    );
  }
}

for (const value of Object.values(source)) {
  assert(!value.includes("guardianSmsOptIn = true"), "Legacy Guardian SMS flag must not be manufactured");
  assert(!value.includes("healthConsentAt ="), "Health consent must not be changed by Essential Alerts");
}

console.log("=== A16A1-R1 FAMILY CONSENT + COMPACT SINGLE-USE LINKS ===");
console.log("");
console.log("Guardian grouping             : PHONE + GUARDIAN NAME");
console.log("Missing guardian name         : SEED LEARNER ONLY / FAIL CLOSED");
console.log("Family enrollment rows        : CHILD-LEVEL PRESERVED");
console.log("One current family decision   : SUPPORTED");
console.log("Later-added learner inheritance: FORBIDDEN");
console.log("Guardian outgoing link        : COMPACT /a/<signed-reference>");
console.log("Teacher/Headteacher link      : COMPACT /a/<signed-reference>");
console.log("Compact signature             : HMAC-SHA256 / 128-BIT TAG");
console.log("Invitation expiry             : SERVER-SIDE 14-DAY POLICY");
console.log("Decision replay               : FORBIDDEN");
console.log("Older link after resend       : SUPERSEDED");
console.log("Phone change                  : INVALIDATES LINK");
console.log("Policy change                 : INVALIDATES LINK");
console.log("UAT loopback origin           : ACTUAL REQUEST HOST + PORT");
console.log("Staff no-phone reporting      : SKIPPED / NOT FAILED");
console.log("Staff no-phone provider call  : FORBIDDEN");
console.log("New-attempt stale sent evidence: CLEARED");
console.log("Failed resend state            : NOT_SENT");
console.log("Sent timestamp authority       : PROVIDER ACCEPTANCE ONLY");
console.log("Sent evidence attempt binding  : ATOMIC / INVITATION COUNT");
console.log("Guardian campaign discovery    : BATCHED / ONE DIRECTORY READ");
console.log("Hosted public origin           : EXPLICIT HTTPS / FAIL CLOSED");
console.log("Legacy long links             : RETAINED + REPLAY-HARDENED");
console.log("Health consent coupling       : ABSENT");
console.log("A16A2A attendance authority   : PRESERVED");
console.log("Guardian campaign progression : INVITEABLE-FIRST / NO PREFIX STARVATION");
console.log("Database access by QA         : NONE");
console.log("Provider calls by QA          : NONE");
console.log("");
console.log("RESULT: A16A1-R1 FAMILY + SHORT-LINK HARDENING GREEN");
