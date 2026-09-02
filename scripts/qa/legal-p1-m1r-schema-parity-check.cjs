#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS QA harness intentionally reads exact repository source. */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..", "..");

const FILES = {
  schema: "prisma/schema.prisma",
  migration:
    "prisma/migrations/20260902190000_legal_acceptance_onboarding_authority/migration.sql",
};

const LOCKS = {
  migration:
    "9514BC974CCF9486E0DACE1A87EB6A40F1F363EC5CB171DD2A82A4439FE52DC0",
};

function fail(message, detail) {
  const suffix =
    detail === undefined ? "" : `\n${JSON.stringify(detail, null, 2)}`;
  throw new Error(`${message}${suffix}`);
}

function assert(condition, message, detail) {
  if (!condition) fail(message, detail);
}

function read(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  assert(fs.existsSync(absolutePath), "LEGAL_P1_M1R_FILE_MISSING", {
    relativePath,
  });
  return fs.readFileSync(absolutePath, "utf8");
}

function canonical(text) {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function canonicalSha256(relativePath) {
  return crypto
    .createHash("sha256")
    .update(canonical(read(relativePath)), "utf8")
    .digest("hex")
    .toUpperCase();
}

function occurrences(text, needle) {
  if (!needle) return 0;
  let count = 0;
  let offset = 0;
  for (;;) {
    const next = text.indexOf(needle, offset);
    if (next < 0) return count;
    count += 1;
    offset = next + needle.length;
  }
}

function modelWindow(schema, modelName) {
  const marker = `model ${modelName} {`;
  const start = schema.indexOf(marker);
  assert(start >= 0, "LEGAL_P1_M1R_MODEL_NOT_FOUND", { modelName });
  const end = schema.indexOf("\n}", start);
  assert(end > start, "LEGAL_P1_M1R_MODEL_WINDOW_NOT_FOUND", { modelName });
  return schema.slice(start, end + 2);
}

function sha256Text(text) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex").toUpperCase();
}

function requireMarkers(text, markers, code) {
  for (const marker of markers) {
    assert(text.includes(marker), code, { marker });
  }
}

const schema = canonical(read(FILES.schema));
const migration = canonical(read(FILES.migration));

assert(
  canonicalSha256(FILES.migration) === LOCKS.migration,
  "LEGAL_P1_M1R_MIGRATION_HASH_DRIFT",
  {
    expected: LOCKS.migration,
    actual: canonicalSha256(FILES.migration),
  }
);

for (const modelName of [
  "LegalDocumentVersion",
  "LegalAcceptance",
  "OnboardingWelcome",
]) {
  assert(
    occurrences(schema, `model ${modelName} {`) === 1,
    "LEGAL_P1_M1R_MODEL_MUST_EXIST_EXACTLY_ONCE",
    { modelName }
  );
}

const legalDocument = modelWindow(schema, "LegalDocumentVersion");
const legalAcceptance = modelWindow(schema, "LegalAcceptance");
const onboardingWelcome = modelWindow(schema, "OnboardingWelcome");

requireMarkers(
  legalDocument,
  [
    'id                         String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid',
    "documentType               String    @db.VarChar(40)",
    "version                    String    @db.VarChar(64)",
    "contentText                String    @db.Text",
    "contentHash                String    @db.VarChar(64)",
    "operatorLegalName          String    @db.VarChar(240)",
    "operatorRegistrationNumber String?   @db.VarChar(120)",
    "operatorRegisteredAddress  String?   @db.Text",
    "operatorServiceEmail       String    @db.VarChar(320)",
    "productSupportEmail        String    @db.VarChar(320)",
    "effectiveAt                DateTime  @db.Timestamptz(6)",
    "publishedAt                DateTime  @default(now()) @db.Timestamptz(6)",
    "isCurrent                  Boolean   @default(true)",
    "supersededAt               DateTime? @db.Timestamptz(6)",
    "createdAt                  DateTime  @default(now()) @db.Timestamptz(6)",
    'termsAcceptances   LegalAcceptance[] @relation("LegalAcceptanceTermsDocument")',
    'privacyAcceptances LegalAcceptance[] @relation("LegalAcceptancePrivacyDocument")',
    '@@unique([documentType, version], map: "LegalDocumentVersion_type_version_unique")',
    '@@index([documentType, effectiveAt(sort: Desc)], map: "LegalDocumentVersion_effective_idx")',
    "LegalDocumentVersion_current_type_unique",
    "partial unique index",
  ],
  "LEGAL_P1_M1R_LEGAL_DOCUMENT_MODEL_CONTRACT_MISSING"
);

requireMarkers(
  legalAcceptance,
  [
    'id                         String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid',
    "userId                     String",
    "termsDocumentId            String   @db.Uuid",
    "privacyDocumentId          String   @db.Uuid",
    "termsVersionSnapshot       String   @db.VarChar(64)",
    "privacyVersionSnapshot     String   @db.VarChar(64)",
    "termsContentHashSnapshot   String   @db.VarChar(64)",
    "privacyContentHashSnapshot String   @db.VarChar(64)",
    "authorityType              String   @db.VarChar(40)",
    "authorityId                String",
    "membershipId               String?",
    "governanceAssignmentId     String?",
    "roleSnapshot               String   @db.VarChar(80)",
    "scopeType                  String   @db.VarChar(40)",
    "scopeId                    String",
    "acceptanceSource           String   @db.VarChar(80)",
    "acceptedAt                 DateTime @default(now()) @db.Timestamptz(6)",
    'evidenceJson               Json     @default("{}")',
    'user                 User                         @relation(fields: [userId], references: [id], onDelete: Restrict, onUpdate: NoAction, map: "LegalAcceptance_user_fkey")',
    '@relation("LegalAcceptanceTermsDocument", fields: [termsDocumentId]',
    '@relation("LegalAcceptancePrivacyDocument", fields: [privacyDocumentId]',
    'map: "LegalAcceptance_membership_fkey"',
    'map: "LegalAcceptance_governance_assignment_fkey"',
    '@@unique([userId, termsDocumentId, privacyDocumentId, authorityType, authorityId], map: "LegalAcceptance_idempotency_unique")',
    '@@index([userId, acceptedAt(sort: Desc)], map: "LegalAcceptance_user_idx")',
    '@@index([authorityType, authorityId, acceptedAt(sort: Desc)], map: "LegalAcceptance_authority_idx")',
    '@@index([acceptedAt(sort: Desc)], map: "LegalAcceptance_accepted_idx")',
    "append-only",
  ],
  "LEGAL_P1_M1R_LEGAL_ACCEPTANCE_MODEL_CONTRACT_MISSING"
);

requireMarkers(
  onboardingWelcome,
  [
    'id                  String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid',
    "userId              String",
    "tenantId            String",
    'membershipId        String    @unique(map: "OnboardingWelcome_idempotency_unique")',
    "roleSnapshot        String    @db.VarChar(80)",
    "messageVersion      String    @db.VarChar(80)",
    "messageSnapshotJson Json",
    'emailStatus         String    @default("PENDING") @db.VarChar(20)',
    "emailAttemptCount   Int       @default(0)",
    'smsStatus           String    @default("PENDING") @db.VarChar(20)',
    "smsAttemptCount     Int       @default(0)",
    "inAppVisibleAt      DateTime  @default(now()) @db.Timestamptz(6)",
    "inAppSeenAt         DateTime? @db.Timestamptz(6)",
    "inAppDismissedAt    DateTime? @db.Timestamptz(6)",
    "updatedAt           DateTime  @default(now()) @updatedAt @db.Timestamptz(6)",
    'map: "OnboardingWelcome_user_fkey"',
    'map: "OnboardingWelcome_tenant_fkey"',
    'map: "OnboardingWelcome_membership_fkey"',
    '@@index([userId, tenantId, createdAt(sort: Desc)], map: "OnboardingWelcome_user_tenant_idx")',
    '@@index([emailStatus, smsStatus, createdAt], map: "OnboardingWelcome_delivery_idx")',
    "OnboardingWelcome_inapp_idx",
    "partial index",
  ],
  "LEGAL_P1_M1R_ONBOARDING_WELCOME_MODEL_CONTRACT_MISSING"
);

requireMarkers(
  schema,
  [
    "Essential Alerts remain a separate optional consent",
    "legalAcceptances                    LegalAcceptance[]",
    "onboardingWelcomes                  OnboardingWelcome[]",
    "onboardingWelcome OnboardingWelcome?",
    "legalAcceptances LegalAcceptance[]",
  ],
  "LEGAL_P1_M1R_BACK_RELATION_CONTRACT_MISSING"
);

const requiredMigrationMarkers = [
  "BEGIN;",
  "LEGAL_P1_M1R_LEGAL_DOCUMENT_VERSION_ALREADY_EXISTS",
  "LEGAL_P1_M1R_LEGAL_ACCEPTANCE_ALREADY_EXISTS",
  "LEGAL_P1_M1R_ONBOARDING_WELCOME_ALREADY_EXISTS",
  'CREATE TABLE edulife_os."LegalDocumentVersion"',
  'CREATE TABLE edulife_os."LegalAcceptance"',
  'CREATE TABLE edulife_os."OnboardingWelcome"',
  '"LegalDocumentVersion_terminal_superseded_check"',
  '"LegalDocumentVersion_current_type_unique"',
  '"LegalDocumentVersion_effective_idx"',
  "LEGAL_DOCUMENT_VERSION_REACTIVATION_FORBIDDEN",
  "LEGAL_DOCUMENT_VERSION_SUPERSESSION_TIME_IMMUTABLE",
  '"LegalAcceptance_idempotency_unique"',
  '"LegalAcceptance_user_idx"',
  '"LegalAcceptance_authority_idx"',
  '"LegalAcceptance_accepted_idx"',
  "LEGAL_ACCEPTANCE_TERMS_DOCUMENT_NOT_CURRENT",
  "LEGAL_ACCEPTANCE_PRIVACY_DOCUMENT_NOT_CURRENT",
  "LEGAL_ACCEPTANCE_MEMBERSHIP_USER_MISMATCH",
  "LEGAL_ACCEPTANCE_GOVERNANCE_USER_MISMATCH",
  "LEGAL_ACCEPTANCE_IMMUTABLE",
  '"OnboardingWelcome_idempotency_unique"',
  '"OnboardingWelcome_email_delivery_state_check"',
  '"OnboardingWelcome_sms_delivery_state_check"',
  '"OnboardingWelcome_email_attempt_timeline_check"',
  '"OnboardingWelcome_sms_attempt_timeline_check"',
  '"OnboardingWelcome_inapp_timeline_check"',
  '"OnboardingWelcome_updated_timeline_check"',
  '"OnboardingWelcome_user_tenant_idx"',
  '"OnboardingWelcome_inapp_idx"',
  '"OnboardingWelcome_delivery_idx"',
  "ONBOARDING_WELCOME_DELETE_FORBIDDEN",
  "ONBOARDING_WELCOME_CORE_EVIDENCE_IMMUTABLE",
  "ONBOARDING_WELCOME_EMAIL_ATTEMPT_COUNT_CANNOT_DECREASE",
  "ONBOARDING_WELCOME_SMS_ATTEMPT_COUNT_CANNOT_DECREASE",
  "ONBOARDING_WELCOME_EMAIL_SENT_STATUS_TERMINAL",
  "ONBOARDING_WELCOME_SMS_SENT_STATUS_TERMINAL",
  "Essential Alerts remain a separate optional consent authority",
  "COMMIT;",
];

requireMarkers(
  migration,
  requiredMigrationMarkers,
  "LEGAL_P1_M1R_MIGRATION_CONTRACT_MISSING"
);

const expectedConstraintNames = [
  "LegalDocumentVersion_pkey",
  "LegalDocumentVersion_type_version_unique",
  "LegalDocumentVersion_document_type_check",
  "LegalDocumentVersion_version_check",
  "LegalDocumentVersion_title_check",
  "LegalDocumentVersion_content_check",
  "LegalDocumentVersion_hash_check",
  "LegalDocumentVersion_timeline_check",
  "LegalDocumentVersion_current_superseded_check",
  "LegalDocumentVersion_terminal_superseded_check",
  "LegalAcceptance_pkey",
  "LegalAcceptance_user_fkey",
  "LegalAcceptance_terms_document_fkey",
  "LegalAcceptance_privacy_document_fkey",
  "LegalAcceptance_membership_fkey",
  "LegalAcceptance_governance_assignment_fkey",
  "LegalAcceptance_idempotency_unique",
  "LegalAcceptance_document_pair_check",
  "LegalAcceptance_authority_type_check",
  "LegalAcceptance_hash_snapshot_check",
  "LegalAcceptance_evidence_check",
  "OnboardingWelcome_pkey",
  "OnboardingWelcome_user_fkey",
  "OnboardingWelcome_tenant_fkey",
  "OnboardingWelcome_membership_fkey",
  "OnboardingWelcome_idempotency_unique",
  "OnboardingWelcome_role_check",
  "OnboardingWelcome_message_version_check",
  "OnboardingWelcome_message_snapshot_check",
  "OnboardingWelcome_email_status_check",
  "OnboardingWelcome_sms_status_check",
  "OnboardingWelcome_attempt_count_check",
  "OnboardingWelcome_email_delivery_state_check",
  "OnboardingWelcome_sms_delivery_state_check",
  "OnboardingWelcome_email_attempt_timeline_check",
  "OnboardingWelcome_sms_attempt_timeline_check",
  "OnboardingWelcome_inapp_timeline_check",
  "OnboardingWelcome_updated_timeline_check",
];

assert(
  expectedConstraintNames.length === 38,
  "LEGAL_P1_M1R_QA_EXPECTED_38_CONSTRAINT_NAMES"
);

for (const name of expectedConstraintNames) {
  assert(
    occurrences(migration, `"${name}"`) >= 1,
    "LEGAL_P1_M1R_NAMED_CONSTRAINT_MISSING",
    { name }
  );
}

const expectedIndexNames = [
  "LegalDocumentVersion_type_version_unique",
  "LegalDocumentVersion_current_type_unique",
  "LegalDocumentVersion_effective_idx",
  "LegalAcceptance_idempotency_unique",
  "LegalAcceptance_user_idx",
  "LegalAcceptance_authority_idx",
  "LegalAcceptance_accepted_idx",
  "OnboardingWelcome_idempotency_unique",
  "OnboardingWelcome_user_tenant_idx",
  "OnboardingWelcome_inapp_idx",
  "OnboardingWelcome_delivery_idx",
];

assert(
  expectedIndexNames.length === 11,
  "LEGAL_P1_M1R_QA_EXPECTED_11_INDEX_NAMES"
);

for (const name of expectedIndexNames) {
  assert(
    migration.includes(name),
    "LEGAL_P1_M1R_NAMED_INDEX_MISSING",
    { name }
  );
}

for (const triggerName of [
  "LegalDocumentVersion_immutability_guard",
  "LegalAcceptance_insert_guard",
  "LegalAcceptance_immutability_guard",
  "OnboardingWelcome_insert_guard",
  "OnboardingWelcome_evidence_guard",
]) {
  assert(
    migration.includes(`CREATE TRIGGER "${triggerName}"`),
    "LEGAL_P1_M1R_TRIGGER_MISSING",
    { triggerName }
  );
}

for (const functionName of [
  "legal_document_version_immutability_guard",
  "legal_acceptance_insert_guard",
  "legal_acceptance_immutability_guard",
  "onboarding_welcome_insert_guard",
  "onboarding_welcome_evidence_guard",
]) {
  assert(
    migration.includes(`CREATE FUNCTION edulife_os.${functionName}()`),
    "LEGAL_P1_M1R_FUNCTION_MISSING",
    { functionName }
  );
}

assert(
  !migration.includes('INSERT INTO edulife_os."LegalDocumentVersion"') &&
    !migration.includes('INSERT INTO edulife_os."LegalAcceptance"') &&
    !migration.includes('INSERT INTO edulife_os."OnboardingWelcome"'),
  "LEGAL_P1_M1R_MIGRATION_MUST_NOT_SEED_OR_BACKFILL_LEGAL_ONBOARDING_ROWS"
);

assert(
  !migration.includes('UPDATE edulife_os."User"') &&
    !migration.includes('UPDATE edulife_os."Membership"') &&
    !migration.includes('UPDATE edulife_os."GovernanceOfficerAssignment"') &&
    !migration.includes("UPDATE edulife_os.essential_alert_enrollment") &&
    !migration.includes("INSERT INTO edulife_os.essential_alert_enrollment") &&
    !migration.includes("DELETE FROM edulife_os.essential_alert_enrollment"),
  "LEGAL_P1_M1R_MIGRATION_MUST_NOT_MUTATE_EXISTING_AUTHORITY_OR_ESSENTIAL_ALERTS"
);

const essentialAlertModel = modelWindow(schema, "EssentialAlertEnrollment");

assert(
  occurrences(schema, "model EssentialAlertEnrollment {") === 1 &&
    schema.includes('@@map("essential_alert_enrollment")'),
  "LEGAL_P1_M1R_ESSENTIAL_ALERT_EXISTING_MODEL_MUST_REMAIN_PRESENT"
);

assert(
  sha256Text(essentialAlertModel) ===
    "BFA9074E06533CA0EB95B4ACE9CA14F3BB2BB85A5CCC065EA4B77903B8A9176D",
  "LEGAL_P1_M1R_ESSENTIAL_ALERT_MODEL_DRIFT",
  { actual: sha256Text(essentialAlertModel) }
);

console.log("UI-LEGAL-P1-M1R REPOSITORY PARITY CONTRACT: GREEN");
console.log("- LegalDocumentVersion is represented with immutable publication identity");
console.log("- current legal-document authority retains its DB-only partial unique index");
console.log("- legal-document supersession is monotonic and terminal at the DB layer");
console.log("- LegalAcceptance binds Terms + Privacy snapshots to verified authority");
console.log("- LegalAcceptance evidence is append-only and idempotent per authority/document pair");
console.log("- OnboardingWelcome is exactly-once per school membership");
console.log("- onboarding identity/message evidence is immutable while delivery lifecycle may advance");
console.log("- 38 named constraints, 11 named indexes, 5 triggers and 5 functions are represented");
console.log("- migration performs no legal-document seed, legacy backfill or existing-authority mutation");
console.log("- existing Essential Alerts authority remains separate and unmodified");
