#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- deterministic source-contract QA. */

const crypto = require("crypto");
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
  const absolute = path.join(repoRoot, relativePath);
  assert(fs.existsSync(absolute), `Missing required file: ${relativePath}`);
  return fs.readFileSync(absolute, "utf8").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}
function sha256(relativePath) {
  const absolute = path.join(repoRoot, relativePath);
  assert(fs.existsSync(absolute), `Missing required file for SHA lock: ${relativePath}`);
  return crypto.createHash("sha256").update(fs.readFileSync(absolute)).digest("hex").toUpperCase();
}
function has(source, needle, label) {
  assert(source.includes(needle), `Missing ${label}`, { needle });
}
function lacks(source, needle, label) {
  assert(!source.includes(needle), `Forbidden ${label}`, { needle });
}
function count(source, needle) {
  return source.split(needle).length - 1;
}

const schema = read("prisma/schema.prisma");
const evidenceMigrationPath = "prisma/migrations/20260913131500_teacher_translation_evidence_authority/migration.sql";
const evidenceMigration = read(evidenceMigrationPath);
const completionMigration = read("prisma/migrations/20260915094500_ghanaian_translation_completion_authority/migration.sql");
const confirmationMigration = read("prisma/migrations/20260915140500_teacher_target_language_confirmation_authority/migration.sql");
const completionHelper = read("src/lib/lessonNotes/translationCompletion.ts");

const expectedEvidenceMigrationSha = "84FEFA196FA277BD42E6CEB623FD44DDAC781ACBC023F407DF1C0DEA073385DB";
assert(
  sha256(evidenceMigrationPath) === expectedEvidenceMigrationSha,
  "Immutable LessonTranslationEvidence migration drifted",
  { expectedEvidenceMigrationSha, actual: sha256(evidenceMigrationPath) },
);

for (const marker of [
  "lessonTranslationEvidence           LessonTranslationEvidence[]",
  "lessonTranslationEvidence     LessonTranslationEvidence[]",
  "model LessonTranslationEvidence {",
  "sourceText           String   @db.Text",
  "suggestedText        String   @db.Text",
  "finalText            String   @db.Text",
  'receiptId            String   @unique(map: "LessonTranslationEvidence_receipt_unique") @db.Uuid',
  "corpusOptIn          Boolean  @default(false)",
  "corpusEligible       Boolean  @default(false)",
]) has(schema, marker, "immutable translation-evidence schema marker");

for (const marker of [
  'CONSTRAINT "LessonTranslationEvidence_field_check"',
  "'lessonTitle'",
  "'objectives'",
  "'teachingLearningResources'",
  "'introduction'",
  "'lessonDevelopment'",
  "'conclusion'",
  "'assessment'",
  "'homework'",
  'CHECK ("corpusEligible" = false)',
  'CREATE TRIGGER "LessonTranslationEvidence_insert_guard"',
  'CREATE TRIGGER "LessonTranslationEvidence_immutable_guard"',
  "TRANSLATION_EVIDENCE_UPDATE_FORBIDDEN",
  "TRANSLATION_EVIDENCE_DELETE_FORBIDDEN",
]) has(evidenceMigration, marker, "translation-evidence migration guard");

assert(
  count(evidenceMigration, "'lessonTitle'") === 1 &&
    count(evidenceMigration, "'objectives'") === 1 &&
    count(evidenceMigration, "'teachingLearningResources'") === 1 &&
    count(evidenceMigration, "'introduction'") === 1 &&
    count(evidenceMigration, "'lessonDevelopment'") === 1 &&
    count(evidenceMigration, "'conclusion'") === 1 &&
    count(evidenceMigration, "'assessment'") === 1 &&
    count(evidenceMigration, "'homework'") === 1,
  "Reusable evidence whitelist must remain exactly the approved eight fields",
);

for (const forbiddenField of [
  "priorKnowledge",
  "coreCompetencies",
  "keywords",
  "differentiationNotes",
  "reflectionNotes",
]) {
  lacks(evidenceMigration, `'${forbiddenField}'`, `reusable evidence field ${forbiddenField}`);
}

for (const marker of [
  "model LessonTranslationCompletion {",
  "lessonTranslationCompletions",
  "translationCompletions LessonTranslationCompletion[]",
  'completionMethod     String   @db.VarChar(48)',
  'receiptId            String?  @unique(map: "LessonTranslationCompletion_receipt_unique") @db.Uuid',
  'confirmationVersion  String?  @db.VarChar(64)',
  'lessonNote LessonNote @relation(fields: [lessonNoteId], references: [id], onDelete: Cascade',
  '@@unique([lessonNoteId, fieldKey], map: "LessonTranslationCompletion_note_field_unique")',
]) has(schema, marker, "translation-completion state schema marker");

const completionModel = schema.match(/model LessonTranslationCompletion \{[\s\S]*?\n\}/);
assert(completionModel, "LessonTranslationCompletion model block missing");
for (const forbidden of [
  "sourceText",
  "suggestedText",
  "finalText",
  "provider",
  "modelId",
  "modelRevision",
  "corpusOptIn",
  "corpusEligible",
]) {
  lacks(completionModel[0], forbidden, `raw linguistic evidence in completion state: ${forbidden}`);
}

for (const marker of [
  'ADD COLUMN "keywords" text',
  'CREATE TABLE edulife_os."LessonTranslationCompletion"',
  'CONSTRAINT "LessonTranslationCompletion_field_check"',
  "'priorKnowledge'",
  "'coreCompetencies'",
  "'keywords'",
  'CONSTRAINT "LessonTranslationCompletion_note_fkey"',
  'ON DELETE CASCADE',
  'CREATE TRIGGER "LessonTranslationCompletion_guard"',
  "TRANSLATION_COMPLETION_TEACHER_MEMBERSHIP_INACTIVE",
  "TRANSLATION_COMPLETION_LESSON_NOTE_AUTHORITY_MISMATCH",
  "TRANSLATION_COMPLETION_IDENTITY_IMMUTABLE",
]) has(completionMigration, marker, "translation-completion migration guard");

for (const forbidden of [
  'ALTER TABLE edulife_os."LessonTranslationEvidence"',
  'UPDATE edulife_os."LessonTranslationEvidence"',
  'DELETE FROM edulife_os."LessonTranslationEvidence"',
  'DROP TABLE edulife_os."LessonTranslationEvidence"',
]) lacks(completionMigration, forbidden, `evidence authority mutation from completion migration: ${forbidden}`);


for (const marker of [
  'ADD COLUMN "completionMethod" varchar(48)',
  'ADD COLUMN "confirmationVersion" varchar(64)',
  'TEACHER_TARGET_LANGUAGE_CONFIRMATION',
  'EDULIFE_TARGET_LANGUAGE_CONFIRMATION_V1',
  "teacherAction\" = 'CONFIRMED'",
]) has(confirmationMigration, marker, "teacher target-language confirmation migration guard");

for (const forbidden of [
  'ALTER TABLE edulife_os."LessonTranslationEvidence"',
  'UPDATE edulife_os."LessonTranslationEvidence"',
  'DELETE FROM edulife_os."LessonTranslationEvidence"',
  'DROP TABLE edulife_os."LessonTranslationEvidence"',
]) lacks(confirmationMigration, forbidden, `evidence authority mutation from confirmation migration: ${forbidden}`);

for (const marker of [
  "TRANSLATION_COMPLETION_FIELDS_V1",
  "TRANSLATION_COMPLETION_REQUIRED_CONTENT_FIELDS_V1",
  "getCurrentCompletedTranslationFields",
  "getTranslationCompletionGate",
  "verifyTranslationReview",
  "verifyTranslationReceipt",
]) has(completionHelper, marker, "translation-completion helper marker");

for (const forbidden of [
  "LessonTranslationEvidence",
  "sourceText           String",
  "suggestedText        String",
  "finalText            String",
  "corpusOptIn",
  "corpusEligible",
]) lacks(completionHelper, forbidden, `completion helper evidence coupling ${forbidden}`);

console.log("TRANSLATION EVIDENCE + COMPLETION SEPARATION CONTRACT: GREEN");
console.log("- immutable LessonTranslationEvidence migration remains byte-for-byte preserved");
console.log("- reusable linguistic evidence remains exact safe 8-field boundary");
console.log("- current translation-completion state is separate and carries no raw linguistic corpus text");
console.log("- completion rows are note-scoped and cascade only with the Lesson Note");
console.log("- completion + teacher-confirmation migrations do not weaken or mutate immutable evidence authority");
