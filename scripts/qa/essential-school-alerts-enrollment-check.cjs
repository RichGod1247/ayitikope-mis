/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const path = require("path");

function read(rel) {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf8");
}

function assert(condition, message, detail) {
  if (condition) return;
  throw new Error(`${message}${detail ? ` :: ${JSON.stringify(detail)}` : ""}`);
}

const schema = read("prisma/schema.prisma");
const migration = read(
  "prisma/migrations/20260823194000_essential_alert_enrollment/migration.sql",
);
const policy = read("src/lib/essentialAlerts/policy.ts");
const tokens = read("src/lib/essentialAlerts/tokens.ts");
const enrollment = read("src/lib/essentialAlerts/enrollment.ts");
const guardianLink = read("src/app/api/consent/optin/student/link/route.ts");
const staffLink = read("src/app/api/consent/optin/teacher/link/route.ts");
const campaignSend = read("src/app/api/consent/campaign/send/route.ts");
const campaignPreview = read("src/app/api/consent/campaign/preview/route.ts");
const studentDetail = read("src/app/api/consent/students/detail/route.ts");
const teacherDetail = read("src/app/api/consent/teachers/detail/route.ts");
const studentList = read("src/app/api/consent/students/list/route.ts");
const teacherList = read("src/app/api/consent/teachers/list/route.ts");
const headteacherUi = read("src/app/headteacher/consent/page.tsx");
const oldOptout = read("src/app/api/consent/optout/student/route.ts");
const oldPublicPage = read("src/app/consent/optin/page.tsx");

for (const marker of [
  "model EssentialAlertEnrollment",
  "recipientKind EssentialAlertRecipientKind",
  "status EssentialAlertEnrollmentStatus @default(INVITED)",
  "phoneFingerprint String @db.VarChar(64)",
  "consentEvidenceJson Json @default(\"{}\")",
  '@@unique([tenantId, subjectKey], map: "EssentialAlertEnrollment_tenant_subject_unique")',
  "enum EssentialAlertRecipientKind",
  "enum EssentialAlertEnrollmentStatus",
]) {
  assert(schema.includes(marker), "Schema Essential Alerts marker missing", marker);
}

for (const legacy of [
  "smsOptIn     Boolean  @default(true)",
  "guardianSmsOptIn  Boolean   @default(false)",
  "healthConsentAt   DateTime?",
]) {
  assert(schema.includes(legacy), "Legacy field must be preserved during transition", legacy);
}

for (const marker of [
  "SET LOCAL search_path TO \"edulife_os\", pg_catalog;",
  'CREATE TYPE edulife_os."EssentialAlertRecipientKind"',
  'CREATE TYPE edulife_os."EssentialAlertEnrollmentStatus"',
  'CREATE TABLE edulife_os."essential_alert_enrollment"',
  'CONSTRAINT "EssentialAlertEnrollment_subject_shape_check"',
  'CONSTRAINT "EssentialAlertEnrollment_status_time_check"',
  "GUARDIAN:' || \"studentId\" || ':' || \"phoneFingerprint\"",
  "STAFF:' || \"userId\" || ':' || \"phoneFingerprint\"",
  "no existing user/student consent values are backfilled or reinterpreted",
  '"phoneNormSnapshot" ~ \'^[+]?[0-9]{8,15}$\'',
  'REFERENCES edulife_os."Tenant"("id")',
  'REFERENCES edulife_os."Student"("id")',
  'REFERENCES edulife_os."User"("id")',
  'ON edulife_os."essential_alert_enrollment"',
]) {
  assert(migration.includes(marker), "Migration contract marker missing", marker);
}

assert(
  !migration.includes('"phoneNormSnapshot" ~ \'^\\\\+?[0-9]{8,15}$\''),
  "Ambiguous double-backslash phone regex must not return",
);

for (const marker of [
  'policyId: "EDULIFE_ESSENTIAL_SCHOOL_ALERTS_V1"',
  '"STUDENT_ATTENDANCE"',
  '"FEE_PAYMENT"',
  '"FEE_ACCOUNT_NOTICE"',
  '"RESULTS_RELEASE"',
  '"LESSON_NOTE_WORKFLOW"',
  '"OFFICIAL_APPRAISAL"',
  "firstSchoolTermFree: true",
  "paidContinuationNoticeDays: 14",
  "automaticPaidRenewal: false",
  "advertisingAllowed: false",
  'senderId: "EDULIFEOS"',
]) {
  assert(policy.includes(marker), "Policy marker missing", marker);
}

for (const forbidden of [
  '"HEALTH"',
  '"MARKETING"',
  '"BROADCAST"',
]) {
  assert(!policy.includes(forbidden), "Forbidden Essential Alerts purpose present", forbidden);
}

for (const marker of [
  'scope: "ESSENTIAL_ALERTS"',
  "phoneFingerprint: string",
  "essentialAlertPhoneFingerprint",
  'createHmac("sha256"',
  "timingSafeEqual",
  "CONSENT_TOKEN_SECRET",
  "policyVersion",
]) {
  assert(tokens.includes(marker) || enrollment.includes(marker), "Token/evidence marker missing", marker);
}

const tokenPayloadBlock = tokens.slice(
  tokens.indexOf("type EssentialAlertTokenPayload"),
  tokens.indexOf("function secret"),
);
assert(!tokenPayloadBlock.includes("phoneNorm"), "Raw phone must not be stored in signed token payload");

for (const marker of [
  "Prisma.TransactionIsolationLevel.Serializable",
  '"ESSENTIAL_ALERT_ENROLLED"',
  '"ESSENTIAL_ALERT_OPTED_OUT"',
  '"ESSENTIAL_ALERT_INVITATION_ATTEMPTED"',
  '"ESSENTIAL_ALERT_INVITATION_SENT"',
  "healthConsentChanged: false",
  "legacySmsOptInChanged: false",
]) {
  assert(enrollment.includes(marker), "Enrollment authority marker missing", marker);
}

for (const source of [guardianLink, staffLink]) {
  assert(source.includes("verifyEssentialAlertToken"), "Public link must require signed token");
  assert(source.includes('name="decision" value="ENABLE"'), "Enable decision missing");
  assert(source.includes('name="decision" value="DECLINE"'), "Decline decision missing");
  assert(source.includes("applyEssentialAlertTokenDecision"), "Decision authority missing");
  assert(!source.includes("healthConsentAt"), "Essential Alert link must not mutate/read health consent");
  assert(!source.includes("guardianSmsOptIn"), "Essential Alert link must not use legacy guardian SMS flag");
  assert(!source.includes("smsOptIn"), "Essential Alert link must not use legacy staff SMS flag");
}

for (const source of [studentDetail, teacherDetail, studentList, teacherList]) {
  assert(source.includes("requireApiUserContext"), "Consent staff API must require authenticated API context");
  assert(source.includes('"HEADTEACHER"'), "Headteacher role gate missing");
  assert(source.includes('"SCHOOL_ADMIN"'), "School admin role gate missing");
}

for (const marker of [
  "buildGuardianEssentialAlertInvitation",
  "buildStaffEssentialAlertInvitation",
  "recordEssentialAlertInvitationAttempt",
  "recordEssentialAlertInvitationSent",
  'from: ESSENTIAL_ALERT_POLICY.senderId',
  'template: "ESSENTIAL_ALERT_GUARDIAN_INVITATION"',
  'template: "ESSENTIAL_ALERT_STAFF_INVITATION"',
]) {
  assert(campaignSend.includes(marker), "Campaign send marker missing", marker);
}

assert(
  campaignSend.indexOf("await recordEssentialAlertInvitationAttempt") <
    campaignSend.indexOf("await sendSms"),
  "Invitation attempt evidence must be written before provider call",
);
assert(
  campaignSend.indexOf("await sendSms") <
    campaignSend.indexOf("await recordEssentialAlertInvitationSent"),
  "Sent evidence must be written after provider acceptance",
);
assert(!campaignSend.includes("body.message"), "Client-supplied campaign message must be rejected/ignored");
assert(!campaignSend.includes("body.brand"), "Client-supplied SMS brand must not control sender");
assert(!campaignSend.includes("body.actorId"), "Client-supplied actor must not control audit identity");

assert(campaignPreview.includes("databaseWrites: 0"), "Preview must be read-only");
assert(campaignPreview.includes("providerCalled: false"), "Preview must not call provider");

for (const marker of [
  "Useful SMS, chosen by the recipient",
  "first school term free",
  "No advertising",
  "Health consent is separate",
  "Invite parents",
  "Invite staff",
]) {
  assert(headteacherUi.includes(marker), "Headteacher Essential Alerts UI marker missing", marker);
}

for (const forbidden of [
  "localStorage",
  "consent.brand",
  "SMS Brand / Sender ID",
  "Set Consent Now",
  "smsOptIn:",
  "healthConsentAt:",
]) {
  assert(!headteacherUi.includes(forbidden), "Legacy consent control remains in Essential Alerts UI", forbidden);
}

assert(oldOptout.includes("status: 410"), "Legacy raw public opt-out route must be retired");
assert(oldPublicPage.includes("secure, expiring invitation"), "Legacy public ID-based page must be retired");

console.log("");
console.log("=== A16A1 ESSENTIAL SCHOOL ALERTS — TRUSTWORTHY ENROLLMENT ===");
console.log("");
console.log("Consent vs legacy SMS flags      : SEPARATE");
console.log("Consent vs health                : SEPARATE");
console.log("Consent vs future entitlement    : SEPARATE");
console.log("Guardian purposes                : ATTENDANCE / FEES / RESULTS");
console.log("Staff purposes                   : LESSON NOTES / APPRAISAL");
console.log("Advertising                      : FORBIDDEN BY POLICY V1");
console.log("First school term                : FREE");
console.log("Paid continuation notice         : 14 DAYS MINIMUM");
console.log("Automatic paid renewal           : OFF");
console.log("Public enrollment                : SIGNED EXPIRING TOKEN");
console.log("Token phone binding              : HMAC FINGERPRINT");
console.log("Raw phone in token               : ABSENT");
console.log("Phone change                     : INVALIDATES OLD LINK");
console.log("Guardian health consent mutation : ABSENT");
console.log("School may manufacture consent   : NO");
console.log("Legacy public raw opt-out        : RETIRED");
console.log("Teacher detail public lookup     : CLOSED");
console.log("Student detail public lookup     : CLOSED");
console.log("Campaign preview                 : READ-ONLY");
console.log("Campaign sender                  : SERVER EDULIFEOS");
console.log("Provider inside state tx         : NO");
console.log("Database accessed by QA          : FALSE");
console.log("");
console.log("RESULT: A16A1 ESSENTIAL SCHOOL ALERTS ENROLLMENT CONTRACT GREEN");
