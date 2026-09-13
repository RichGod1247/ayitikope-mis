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
  return fs.readFileSync(absolute, "utf8");
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
const migration = read("prisma/migrations/20260913131500_teacher_translation_evidence_authority/migration.sql");

const runtimeLocks = {
  "src/app/api/teachers/lesson-notes/upsert/route.ts":
    "CE5D3BA4A34DF7EFC1C53E72C2C31772FDF7DB2F94292D94554CB864672C03FE",
  "src/app/teacher/lesson-notes/[id]/ui/LessonNoteEditorClient.tsx":
    "A92D4B9089A5460E385576BAF8DA674044CCF797A8C64BC3F853FCC798F38D77",
  "src/lib/ghanaianLanguages/registry.ts":
    "3F63527C7D2CFA4AAC8401313C8670718A06D7C1CF0BC38D4B7C67BA32557A9F",
  "src/lib/lessonNotes/teacherLanguage.ts":
    "631C5D97C448BE613C89672AF5DF04FBE121EB24959A998E54E753DF1607A2B0",
  "src/app/api/teachers/lesson-notes/delete/route.ts":
    "672EC8794B5341E592AEA2A61C8D92B2EAF9DD047E23BA11134DE2D9010C8366",
  "src/lib/ghanaianLanguages/text.ts":
    "BA4B1043047AFF082A87B3511BF30918F744DE7A9D225B5473F562DB07ABA98B",
  "src/lib/audit.ts":
    "0FF232BF56D2F96CD0446141701371BD501A54A9A97A5C13A808B87D639F4DC5",
  "src/app/api/teacher/lesson-notes/settings/route.ts":
    "7410BAC27F8F0665FED74B7C8E5B74044869E4FACCE221FE0BE7F2ABD8A8DC99",
};

for (const [relativePath, expected] of Object.entries(runtimeLocks)) {
  const actual = sha256(relativePath);
  assert(actual === expected, `Runtime authority drift: ${relativePath}`, { expected, actual });
}

for (const marker of [
  "lessonTranslationEvidence           LessonTranslationEvidence[]",
  "lessonTranslationEvidence     LessonTranslationEvidence[]",
  "model LessonTranslationEvidence {",
  'id                   String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid',
  "tenantId             String",
  "teacherUserId        String",
  "lessonNoteId         String",
  "fieldKey             String   @db.VarChar(48)",
  'sourceLanguage       String   @default("en") @db.VarChar(16)',
  "languageCode         String   @db.VarChar(40)",
  "registryVersion      String   @db.VarChar(80)",
  'normalizationVersion String   @default("EDULIFE_EDU_TEXT_NFC_V1") @db.VarChar(64)',
  "sourceText           String   @db.Text",
  "sourceHash           String   @db.VarChar(64)",
  "suggestionSource     String   @db.VarChar(32)",
  "suggestedText        String   @db.Text",
  "suggestedHash        String   @db.VarChar(64)",
  "finalText            String   @db.Text",
  "finalHash            String   @db.VarChar(64)",
  "teacherAction        String   @db.VarChar(16)",
  'receiptId            String   @unique(map: "LessonTranslationEvidence_receipt_unique") @db.Uuid',
  'receiptVersion       String   @default("EDULIFE_TRANSLATION_RECEIPT_V1") @db.VarChar(64)',
  "corpusOptIn          Boolean  @default(false)",
  "corpusEligible       Boolean  @default(false)",
  'map: "LessonTranslationEvidence_tenant_fkey"',
  'map: "LessonTranslationEvidence_teacher_fkey"',
  'map: "LessonTranslationEvidence_personal_lookup_idx"',
  'map: "LessonTranslationEvidence_consensus_lookup_idx"',
  'map: "LessonTranslationEvidence_note_provenance_idx"',
]) has(schema, marker, "Prisma translation-evidence authority marker");

const evidenceModelMatch = schema.match(/model LessonTranslationEvidence \{[\s\S]*?\n\}/);
assert(evidenceModelMatch, "LessonTranslationEvidence model block missing");
const evidenceModel = evidenceModelMatch[0];
lacks(evidenceModel, "lessonNote      LessonNote", "LessonTranslationEvidence LessonNote relation");
lacks(evidenceModel, "lessonNote LessonNote", "LessonTranslationEvidence LessonNote relation");

for (const marker of [
  "BEGIN;",
  "COMMIT;",
  "TRANSLATION_EVIDENCE_TABLE_ALREADY_EXISTS",
  'CREATE TABLE edulife_os."LessonTranslationEvidence"',
  'CONSTRAINT "LessonTranslationEvidence_tenant_fkey"',
  'CONSTRAINT "LessonTranslationEvidence_teacher_fkey"',
  'CONSTRAINT "LessonTranslationEvidence_receipt_unique" UNIQUE ("receiptId")',
  'CONSTRAINT "LessonTranslationEvidence_field_check"',
  'CONSTRAINT "LessonTranslationEvidence_source_language_check"',
  'CONSTRAINT "LessonTranslationEvidence_language_check"',
  'CONSTRAINT "LessonTranslationEvidence_normalization_check"',
  'CONSTRAINT "LessonTranslationEvidence_text_bounds_check"',
  'CONSTRAINT "LessonTranslationEvidence_hash_check"',
  'CONSTRAINT "LessonTranslationEvidence_suggestion_provenance_check"',
  'CONSTRAINT "LessonTranslationEvidence_teacher_action_check"',
  'CONSTRAINT "LessonTranslationEvidence_receipt_version_check"',
  'CONSTRAINT "LessonTranslationEvidence_pilot_corpus_check"',
  "'lessonTitle'",
  "'objectives'",
  "'teachingLearningResources'",
  "'introduction'",
  "'lessonDevelopment'",
  "'conclusion'",
  "'assessment'",
  "'homework'",
  "'AKUAPEM_TWI', 'ASANTE_TWI', 'FANTE', 'NZEMA', 'GA', 'DANGME'",
  "'EWE', 'GONJA', 'KASEM', 'DAGBANI', 'DAGAARE'",
  "'GH_EDU_LANGUAGE_REGISTRY_V1'",
  "'EDULIFE_EDU_TEXT_NFC_V1'",
  "'EDULIFE_TRANSLATION_RECEIPT_V1'",
  "'MODEL'",
  "'PERSONAL_MEMORY'",
  "'SCHOOL_MEMORY'",
  "'ACCEPTED'",
  "'CORRECTED'",
  'CHECK ("corpusEligible" = false)',
  'CREATE INDEX "LessonTranslationEvidence_personal_lookup_idx"',
  'CREATE INDEX "LessonTranslationEvidence_consensus_lookup_idx"',
  'CREATE INDEX "LessonTranslationEvidence_note_provenance_idx"',
  "TRANSLATION_EVIDENCE_TEACHER_MEMBERSHIP_INACTIVE",
  "TRANSLATION_EVIDENCE_LESSON_NOTE_AUTHORITY_MISMATCH",
  "TRANSLATION_EVIDENCE_DELETE_FORBIDDEN",
  "TRANSLATION_EVIDENCE_UPDATE_FORBIDDEN",
  'CREATE TRIGGER "LessonTranslationEvidence_insert_guard"',
  'CREATE TRIGGER "LessonTranslationEvidence_immutable_guard"',
]) has(migration, marker, "translation-evidence migration guard");

assert(
  count(migration, "'lessonTitle'") === 1 &&
    count(migration, "'objectives'") === 1 &&
    count(migration, "'teachingLearningResources'") === 1 &&
    count(migration, "'introduction'") === 1 &&
    count(migration, "'lessonDevelopment'") === 1 &&
    count(migration, "'conclusion'") === 1 &&
    count(migration, "'assessment'") === 1 &&
    count(migration, "'homework'") === 1,
  "Learnable field whitelist must contain exactly the eight approved V1 fields once each",
);

for (const forbiddenField of ["priorKnowledge", "differentiationNotes", "reflectionNotes"]) {
  lacks(migration, `'${forbiddenField}'`, `V1 reusable evidence field ${forbiddenField}`);
}

lacks(migration, 'FOREIGN KEY ("lessonNoteId")', "LessonNote foreign key that could couple evidence lifecycle to draft deletion");
lacks(migration, 'UPDATE edulife_os."LessonNote"', "LessonNote data mutation/backfill");
lacks(migration, 'ALTER TABLE edulife_os."LessonNote"', "LessonNote schema mutation");
lacks(migration, 'DELETE FROM edulife_os."LessonNote"', "LessonNote deletion");
lacks(migration, 'INSERT INTO edulife_os."AuditLog"', "runtime audit insertion during schema migration");

const upsert = read("src/app/api/teachers/lesson-notes/upsert/route.ts");
const editor = read("src/app/teacher/lesson-notes/[id]/ui/LessonNoteEditorClient.tsx");
const registry = read("src/lib/ghanaianLanguages/registry.ts");

lacks(upsert, "LessonTranslationEvidence", "runtime evidence capture activated in I1");
lacks(editor, "/translate", "translator UI activated in I1");
has(registry, 'translationStatus: "NOT_ENABLED_GL_P1"', "translation remains disabled during evidence-authority milestone");

console.log("GL-T1-P3-I1 QA GREEN");
console.log("- schema: immutable LessonTranslationEvidence authority present");
console.log("- lifecycle: no LessonNote FK / draft deletion cannot cascade evidence");
console.log("- tenancy: tenant + teacher FK integrity / active membership insert guard");
console.log("- language: exact EduLife 11-code registry V1");
console.log("- learnable fields: exact safe V1 set of 8");
console.log("- provenance: MODEL / PERSONAL_MEMORY / SCHOOL_MEMORY contract");
console.log("- teacher action: ACCEPTED vs CORRECTED consistency enforced");
console.log("- receipt: unique UUID + EDULIFE_TRANSLATION_RECEIPT_V1");
console.log("- pilot corpus: corpusEligible hard-disabled at DB layer");
console.log("- immutability: UPDATE + DELETE forbidden by trigger");
console.log("- runtime: current editor/upsert/language authorities SHA-locked and untouched");
console.log("- DB mutation: migration authored only / not applied by this QA");
