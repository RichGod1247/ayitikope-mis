#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- deterministic source-contract QA. */

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
  if (!fs.existsSync(absolute)) fail("Required GL-P1 source file missing", { relativePath });
  return fs.readFileSync(absolute, "utf8").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function has(source, marker, label) {
  assert(source.includes(marker), `Missing ${label}`, { marker });
}

function lacks(source, marker, label) {
  assert(!source.includes(marker), `Forbidden ${label}`, { marker });
}

const registry = read("src/lib/ghanaianLanguages/registry.ts");
const text = read("src/lib/ghanaianLanguages/text.ts");
const languageAuthority = read("src/lib/lessonNotes/teacherLanguage.ts");
const palette = read("src/components/teacher/GhanaianLanguageCharacterPalette.tsx");
const schema = read("prisma/schema.prisma");
const migration = read("prisma/migrations/20260908123000_ghanaian_language_lesson_note_authority/migration.sql");
const subjectScope = read("src/lib/teachingSubjectScope.ts");
const timetable = read("src/lib/lessonNotes/teacherTimetable.ts");
const settingsRoute = read("src/app/api/teacher/lesson-notes/settings/route.ts");
const settingsClient = read("src/app/teacher/lesson-notes/settings/TeacherLessonTimetableSettingsClient.tsx");
const createFromScheme = read("src/app/api/teachers/lesson-notes/create-from-scheme/route.ts");
const generateFromCurriculum = read("src/app/api/teachers/lesson-notes/generate-from-curriculum/route.ts");
const itemRoute = read("src/app/api/teachers/lesson-notes/item/[id]/route.ts");
const upsertRoute = read("src/app/api/teachers/lesson-notes/upsert/route.ts");
const aiRoute = read("src/app/api/teachers/lesson-notes/ai-support/route.ts");
const editor = read("src/app/teacher/lesson-notes/[id]/ui/LessonNoteEditorClient.tsx");
const printPage = read("src/app/teacher/lesson-notes/[id]/print/page.tsx");

const expectedCodes = [
  "AKUAPEM_TWI",
  "ASANTE_TWI",
  "FANTE",
  "NZEMA",
  "GA",
  "DANGME",
  "EWE",
  "GONJA",
  "KASEM",
  "DAGBANI",
  "DAGAARE",
];

for (const code of expectedCodes) has(registry, `"${code}"`, `registry language ${code}`);
assert((registry.match(/code:\s*"(?:AKUAPEM_TWI|ASANTE_TWI|FANTE|NZEMA|GA|DANGME|EWE|GONJA|KASEM|DAGBANI|DAGAARE)"/g) || []).length === 11,
  "Registry must define exactly 11 Ghanaian teaching languages");
has(registry, 'GH_EDU_LANGUAGE_REGISTRY_V1', "registry version");
has(registry, 'translationStatus: "NOT_ENABLED_GL_P1"', "translation disabled marker");
has(registry, 'keyboardCharacters: ["ɖ", "Ɖ", "ɛ", "Ɛ", "ƒ", "Ƒ", "ɣ", "Ɣ", "ŋ", "Ŋ", "ɔ", "Ɔ", "ʋ", "Ʋ"]', "Ewe native keyboard characters");
has(registry, 'singleLetters:', "single-letter orthography metadata");
has(registry, 'multipleLetters:', "multiple-letter orthography metadata");
has(registry, 'sourceAuthority:', "source authority metadata");

for (const marker of [
  '.normalize("NFC")',
  '/[\\p{L}\\p{M}\\p{N}]+',
  'normalizeEducationalTextNullable',
  'tokenizeEducationalText',
]) has(text, marker, "Unicode/NFC text authority");

for (const source of [subjectScope, timetable]) {
  has(source, 'GHANAIANLANGUAGE: "GHANAIANLANGUAGE"', "Ghanaian Language canonical subject alias");
  has(source, 'GHANAIANLANGUAGES: "GHANAIANLANGUAGE"', "plural Ghanaian Languages canonical alias");
}

for (const marker of [
  'model TeacherLessonLanguageSetting {',
  'lessonLanguageCode        String?   @db.VarChar(40)',
  'languageRegistryVersion   String?   @db.VarChar(80)',
  'map: "LessonNote_language_idx"',
  'map: "TeacherLessonLanguageSetting_teacher_active_idx"',
]) has(schema, marker, "Prisma language authority marker");

for (const marker of [
  "BEGIN;",
  "COMMIT;",
  "GL_LANGUAGE_SETTING_TABLE_ALREADY_EXISTS",
  "GL_LANGUAGE_LESSON_NOTE_COLUMNS_ALREADY_EXIST",
  'CREATE TABLE edulife_os."TeacherLessonLanguageSetting"',
  'CREATE UNIQUE INDEX "TeacherLessonLanguageSetting_active_unique"',
  'ADD COLUMN "lessonLanguageCode" varchar(40) NULL',
  'ADD COLUMN "languageRegistryVersion" varchar(80) NULL',
  'CONSTRAINT "LessonNote_language_pair_check"',
  "'GH_EDU_LANGUAGE_REGISTRY_V1'",
  "'AKUAPEM_TWI', 'ASANTE_TWI', 'FANTE', 'NZEMA', 'GA', 'DANGME'",
  "'EWE', 'GONJA', 'KASEM', 'DAGBANI', 'DAGAARE'",
  "GL_LANGUAGE_CLASSROOM_TENANT_SCOPE_INVALID",
  "GL_LANGUAGE_TEACHER_MEMBERSHIP_INACTIVE",
  "GL_LANGUAGE_SETTING_DELETE_FORBIDDEN",
  "GL_LANGUAGE_RETIRED_SETTING_IMMUTABLE",
  "LESSON_NOTE_LANGUAGE_EVIDENCE_IMMUTABLE",
  "LESSON_NOTE_LANGUAGE_LATE_FREEZE_FORBIDDEN",
  'CREATE TRIGGER "TeacherLessonLanguageSetting_insert_guard"',
  'CREATE TRIGGER "TeacherLessonLanguageSetting_evidence_guard"',
  'CREATE TRIGGER "LessonNote_language_evidence_guard"',
]) has(migration, marker, "database migration guard");
lacks(migration, "UPDATE edulife_os.\"LessonNote\" SET \"lessonLanguageCode\"", "guessed LessonNote language backfill");

for (const marker of [
  'subjectNorm" = ${GHANAIAN_LANGUAGE_SUBJECT_KEY}',
  '"isActive" = true',
  'GHANAIAN_LANGUAGE_SETTING_REQUIRED',
  'GHANAIAN_LANGUAGE_SETTING_INVALID',
  'getGhanaianLanguage',
]) has(languageAuthority, marker, "server language resolution authority");

for (const marker of [
  'requireRoleNames: ["TEACHER"]',
  '"Cache-Control": "no-store"',
  'languageCode: z.string().trim().min(2).max(40).optional().nullable()',
  'languages: listGhanaianLanguageOptions()',
  'readActiveTeacherLessonLanguageSettings',
  'GHANAIAN_LANGUAGE_REQUIRED',
  'GHANAIAN_LANGUAGE_NOT_APPLICABLE',
  'Prisma.TransactionIsolationLevel.Serializable',
  'pg_advisory_xact_lock',
  'INSERT INTO edulife_os."TeacherLessonLanguageSetting"',
  '"isActive" = false',
  'languageSettingChanged: languageChanged',
]) has(settingsRoute, marker, "settings API bank-grade contract");
lacks(settingsRoute, "tenantId: parsed.data", "client tenant override");
lacks(settingsRoute, "teacherUserId: parsed.data", "client teacher override");

for (const marker of [
  'subjectKey === "GHANAIANLANGUAGE"',
  'htmlFor="lesson-setting-language"',
  'Choose language',
  'Choose the Ghanaian language you teach.',
  'Choose once for this subject and class.',
  'Save settings',
  'Language: {group.languageName}',
]) has(settingsClient, marker, "BBC settings UI contract");

for (const source of [createFromScheme, generateFromCurriculum, upsertRoute]) {
  has(source, "resolveTeacherLessonLanguageForNote", "server-derived LessonNote language freeze");
  has(source, "lessonLanguageCode", "frozen LessonNote language field");
  has(source, "languageRegistryVersion", "frozen registry version field");
}
lacks(createFromScheme, "body.lessonLanguageCode", "client-selected language on Scheme creation");
lacks(generateFromCurriculum, "body.lessonLanguageCode", "client-selected language on curriculum generation");
lacks(upsertRoute, "body.lessonLanguageCode", "client-selected language on upsert");
has(upsertRoute, "normalizeEducationalTextNullable", "NFC normalization on LessonNote writes");
has(upsertRoute, "subject of a language-frozen Ghanaian Language lesson note cannot be changed", "frozen language subject guard");

for (const marker of ["lessonLanguageCode: true", "languageRegistryVersion: true"]) {
  has(itemRoute, marker, "LessonNote GET language evidence");
}

for (const marker of [
  'RULE_BASED_COTUTOR_V4_TEMPLATE_GROUNDED',
  'tokenizeEducationalText',
  'normalizeEducationalText',
  'lessonLanguageCode: true',
  'translationStatus: languageDefinition.translationStatus',
  'code: "GHANAIAN_LANGUAGE_REVIEW"',
]) has(aiRoute, marker, "Co-Tutor language hardening");
for (const forbidden of ["api.openai.com", "anthropic.com", "generativelanguage.googleapis.com", "OpenAI(", "Anthropic("]) {
  lacks(aiRoute, forbidden, "remote AI provider introduced into GL-P1");
}

for (const marker of [
  'GhanaianLanguageCharacterPalette',
  'data-lesson-field={props.fieldKey}',
  'selectionStart',
  'selectionEnd',
  'setSelectionRange',
  'normalizeEducationalText(',
  'Ghanaian Language · {lessonLanguage.name}',
  'Translation is not enabled yet.',
]) has(editor, marker, "native-language editor integration");
for (const marker of [
  'getGhanaianLanguage(note.lessonLanguageCode)',
  'Language: <span className="font-semibold">{lessonLanguageLabel}</span>',
]) has(printPage, marker, "native-language print evidence");

for (const marker of [
  'getGhanaianLanguage(props.languageCode)',
  'Tap a special letter to insert it where you last placed the cursor.',
  'onClick={() => props.onInsert(character)}',
]) has(palette, marker, "BBC native-character palette");

console.log("GL-P1-I1 QA GREEN");
console.log(`- Ghanaian teaching languages: ${expectedCodes.length} / exact registry V1`);
console.log("- translation: DISABLED / not part of GL-P1");
console.log("- Unicode: NFC + Unicode-letter/mark/number tokenization");
console.log("- language setting: teacher + tenant + class + subject, append/retire evidence");
console.log("- LessonNote language: server-derived + frozen + no guessed backfill");
console.log("- editor: cursor-aware native-character palette / mobile-friendly");
console.log("- Co-Tutor: RULE_BASED_COTUTOR_V4_TEMPLATE_GROUNDED preserved and Unicode-hardened");
console.log("- print: frozen Ghanaian language displayed without rewriting curriculum identifiers");
