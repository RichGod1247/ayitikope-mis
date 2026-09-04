#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS QA harness intentionally loads repository files for static contract verification. */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const root = path.resolve(__dirname, "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function sha(relativePath) {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(path.join(root, relativePath)))
    .digest("hex")
    .toUpperCase();
}

function fail(message, detail) {
  throw new Error(detail === undefined ? message : `${message}\n${JSON.stringify(detail, null, 2)}`);
}

function assert(condition, message, detail) {
  if (!condition) fail(message, detail);
}

function includes(source, marker, label) {
  assert(source.includes(marker), `P4 marker missing: ${label}`, marker);
}

function excludes(source, marker, label) {
  assert(!source.includes(marker), `P4 forbidden marker present: ${label}`, marker);
}

const teacherSignup = read("src/app/api/auth/teacher-signup/route.ts");
const welcome = read("src/lib/onboarding/staffWelcome.ts");
const staffInvitation = read("src/lib/essentialAlerts/staffInvitation.ts");
const campaign = read("src/app/api/consent/campaign/send/route.ts");
const api = read("src/app/api/teacher/onboarding-welcome/route.ts");
const card = read("src/components/onboarding/StaffOnboardingWelcomeCard.tsx");
const headteacherLayout = read("src/app/headteacher/layout.tsx");
const teacherLayout = read("src/app/teacher/layout.tsx");
const schema = read("prisma/schema.prisma");
const migration = read(
  "prisma/migrations/20260902190000_legal_acceptance_onboarding_authority/migration.sql",
);
const publicPage = read("src/lib/essentialAlerts/publicPage.ts");
const enrollment = read("src/lib/essentialAlerts/enrollment.ts");
const policy = read("src/lib/essentialAlerts/policy.ts");

assert(
  sha("prisma/schema.prisma") ===
    "6CF921745C4CF0ACBCA793D9872CFF25AFE17F8BCC50A148BB2A6B0B6FCA53D8",
  "P4 schema authority drifted",
);
assert(
  sha("prisma/migrations/20260902190000_legal_acceptance_onboarding_authority/migration.sql") ===
    "9514BC974CCF9486E0DACE1A87EB6A40F1F363EC5CB171DD2A82A4439FE52DC0",
  "P4 legal migration authority drifted",
);
assert(
  sha("src/lib/essentialAlerts/publicPage.ts") ===
    "4AD81FA4F825288056329A2B6A7EEC6698B65A4406010FFFE68532A7B4CD317A",
  "P4 Essential Alerts public-origin authority drifted",
);

includes(schema, "model OnboardingWelcome {", "welcome:model");
includes(schema, '@unique(map: "OnboardingWelcome_idempotency_unique")', "welcome:membership-idempotency");
includes(schema, "Essential Alerts remain a separate optional consent", "welcome:consent-separation");
includes(migration, 'CONSTRAINT "OnboardingWelcome_idempotency_unique"', "welcome:db-idempotency");
includes(migration, 'NEW."userId" := membership_user_id;', "welcome:db-user-derivation");
includes(migration, 'NEW."tenantId" := membership_tenant_id;', "welcome:db-tenant-derivation");
includes(migration, 'NEW."roleSnapshot" := membership_role_name;', "welcome:db-role-derivation");

includes(welcome, '"EDULIFE_STAFF_ONBOARDING_WELCOME_V1"', "welcome:message-version");
includes(welcome, 'ON CONFLICT ON CONSTRAINT "OnboardingWelcome_idempotency_unique"', "welcome:insert-idempotency");
includes(welcome, '"membershipId",\n        "messageVersion",\n        "messageSnapshotJson"', "welcome:trusted-insert-fields");
includes(welcome, 'essentialAlertsSeparate: true', "welcome:snapshot-consent-separation");
includes(welcome, '"emailAttemptCount" = 0', "welcome:email-single-claim");
includes(welcome, '"smsAttemptCount" = 0', "welcome:sms-single-claim");
includes(welcome, 'idempotencyKey: `staff-onboarding-welcome:${welcome.id}`', "welcome:email-provider-idempotency");
includes(welcome, 'template: "STAFF_ONBOARDING_WELCOME"', "welcome:sms-template");
includes(welcome, 'essentialAlertsConsentGranted: false', "welcome:no-alert-consent");
includes(welcome, '"inAppDismissedAt" IS NULL', "welcome:inapp-active-query");

const legalIndex = teacherSignup.indexOf("await recordCurrentLegalAcceptance({");
const welcomeAuthorityIndex = teacherSignup.indexOf("await ensureStaffOnboardingWelcome({");
const transactionCloseIndex = teacherSignup.indexOf("{ maxWait: 10_000, timeout: 30_000 }");
const welcomeDeliveryIndex = teacherSignup.indexOf("await deliverStaffOnboardingWelcome({");
const alertsIndex = teacherSignup.indexOf("await deliverStaffEssentialAlertInvitationAfterWelcome({");
const successIndex = teacherSignup.indexOf("return jsonOk({ ok: true, portalUrl");
assert(legalIndex >= 0, "P4 legal acceptance call missing");
assert(welcomeAuthorityIndex > legalIndex, "P4 welcome authority must follow legal acceptance inside signup transaction");
assert(transactionCloseIndex > welcomeAuthorityIndex, "P4 welcome authority must be inside signup transaction");
assert(welcomeDeliveryIndex > transactionCloseIndex, "P4 welcome delivery must be post-commit");
assert(alertsIndex > welcomeDeliveryIndex, "P4 Essential Alerts invitation must follow welcome delivery attempt");
assert(successIndex > alertsIndex, "P4 signup response must follow post-commit attempts");
includes(teacherSignup, 'console.error(\n        "STAFF_ONBOARDING_WELCOME_DELIVERY_ERROR"', "signup:welcome-failure-contained");
includes(teacherSignup, 'console.error(\n        "STAFF_ONBOARDING_ESSENTIAL_ALERT_INVITATION_ERROR"', "signup:alert-failure-contained");

const exactStaffMessage =
  "`${input.schoolName}: EduLife work alerts cover lesson-note workflow & official appraisal activity. School-funded, no ads. Confirm: ${input.link}`";
includes(staffInvitation, exactStaffMessage, "alerts:exact-existing-message");
includes(campaign, "staffEssentialAlertInvitationMessage", "alerts:campaign-shared-builder");
excludes(campaign, "function staffMessage(", "alerts:duplicate-campaign-builder");
includes(staffInvitation, "essentialAlertPublicOrigin(input.req)", "alerts:existing-origin-authority");
includes(staffInvitation, 'kind: "STAFF"', "alerts:staff-invitation-kind");
includes(staffInvitation, "recordEssentialAlertInvitationAttempt", "alerts:attempt-authority");
includes(staffInvitation, "recordEssentialAlertInvitationSent", "alerts:sent-authority");
includes(staffInvitation, 'template: "ESSENTIAL_ALERT_STAFF_INVITATION"', "alerts:existing-template");
includes(staffInvitation, "consentGranted: false", "alerts:no-implicit-consent");
excludes(staffInvitation, "setAuthenticatedStaffEssentialAlerts", "alerts:no-self-service-consent");
excludes(staffInvitation, "consentedAt", "alerts:no-consent-timestamp-write");
excludes(staffInvitation, 'status: "ENROLLED"', "alerts:no-enrolled-write");
includes(enrollment, 'consentSource = "SIGNED_STAFF_LINK"', "alerts:signed-link-consent-authority");
includes(policy, 'policyId: "EDULIFE_ESSENTIAL_SCHOOL_ALERTS_V1"', "alerts:policy-id");
includes(publicPage, "ESSENTIAL_ALERT_PUBLIC_ORIGIN_REQUIRED", "alerts:origin-fail-closed");

includes(api, 'requireRoleNames: ["TEACHER", "HEADTEACHER"]', "inapp:role-scope");
includes(api, "userId: auth.ctx.userId", "inapp:user-scope");
includes(api, "tenantId: auth.ctx.tenantId", "inapp:tenant-scope");
includes(api, 'action?: "SEEN" | "DISMISS"', "inapp:actions");
includes(card, 'data-staff-onboarding-welcome="v1"', "inapp:compact-card");
includes(card, 'recordAction(welcome.id, "SEEN")', "inapp:seen");
includes(card, 'recordAction(welcome.id, "DISMISS")', "inapp:dismiss");
includes(card, "Got it", "inapp:bbc-action");
includes(headteacherLayout, "<StaffOnboardingWelcomeCard welcome={onboardingWelcome} />", "inapp:headteacher-consumer");
includes(teacherLayout, "<StaffOnboardingWelcomeCard welcome={onboardingWelcome} />", "inapp:teacher-consumer");

console.log("=== UI-LEGAL-P1-P4 STAFF WELCOME + ESSENTIAL ALERTS ===");
console.log("Welcome authority              : EXACTLY ONCE PER MEMBERSHIP / DB DERIVED");
console.log("Welcome provider work          : POST-COMMIT");
console.log("Email retry duplication guard  : CLAIM + PROVIDER IDEMPOTENCY KEY");
console.log("SMS retry duplication guard    : SINGLE CLAIM");
console.log("In-app welcome                 : SHARED TEACHER + HEADTEACHER CARD");
console.log("Essential Alerts message       : EXISTING STAFF COPY / SHARED BUILDER");
console.log("Essential Alerts origin        : EXISTING FAIL-CLOSED PUBLIC ORIGIN");
console.log("Essential Alerts enrollment    : INVITED ONLY");
console.log("Essential Alerts consent       : SIGNED LINK OR AUTH SELF-SERVICE / SEPARATE");
console.log("Legal acceptance               : SEPARATE / PRESERVED");
console.log("Schema + migration             : UNCHANGED");
console.log("RESULT: UI-LEGAL-P1-P4 STATIC CONTRACT GREEN");
