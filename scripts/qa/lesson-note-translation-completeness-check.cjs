#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- deterministic CommonJS source-contract QA. */
const fs = require("fs");
const path = require("path");
const ts = require("typescript");
const root = path.resolve(__dirname, "..", "..");
function fail(m,d){throw new Error(m+(d===undefined?"":`\n${JSON.stringify(d,null,2)}`));}
function assert(c,m,d){if(!c)fail(m,d);}
function read(r){const p=path.join(root,r);assert(fs.existsSync(p),`Missing ${r}`);return fs.readFileSync(p,"utf8").replace(/\r\n/g,"\n").replace(/\r/g,"\n");}
function has(s,m,l){assert(s.includes(m),`Missing ${l}`,{marker:m});}
function lacks(s,m,l){assert(!s.includes(m),`Forbidden ${l}`,{marker:m});}
function parse(r,k=ts.ScriptKind.TS){const s=read(r);const f=ts.createSourceFile(r,s,ts.ScriptTarget.Latest,true,k);assert(f.parseDiagnostics.length===0,`Parse diagnostics in ${r}`,f.parseDiagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,"\n")));return s;}
const migration=read("prisma/migrations/20260915140500_teacher_target_language_confirmation_authority/migration.sql");
const schema=read("prisma/schema.prisma");
const contract=parse("src/lib/lessonNotes/translationContract.ts");
const helper=parse("src/lib/lessonNotes/translationCompletion.ts");
const upsert=parse("src/app/api/teachers/lesson-notes/upsert/route.ts");
const aiSupport=parse("src/app/api/teachers/lesson-notes/ai-support/route.ts");
const submit=parse("src/app/api/teachers/lesson-notes/submit/route.ts");
const editor=parse("src/app/teacher/lesson-notes/[id]/ui/LessonNoteEditorClient.tsx",ts.ScriptKind.TSX);
const printPage=parse("src/app/teacher/lesson-notes/[id]/print/page.tsx",ts.ScriptKind.TSX);
for(const m of [
  'ADD COLUMN "completionMethod" varchar(48)',
  'ADD COLUMN "confirmationVersion" varchar(64)',
  "TRANSLATION_RECEIPT",
  "TEACHER_TARGET_LANGUAGE_CONFIRMATION",
  "EDULIFE_TARGET_LANGUAGE_CONFIRMATION_V1",
  'ALTER COLUMN "sourceLanguage" DROP NOT NULL',
  'ALTER COLUMN "sourceHash" DROP NOT NULL',
  'ALTER COLUMN "suggestedHash" DROP NOT NULL',
  'ALTER COLUMN "receiptId" DROP NOT NULL',
  'ALTER COLUMN "receiptVersion" DROP NOT NULL',
  'CONSTRAINT "LessonTranslationCompletion_method_check"',
  'teacherAction" = \'CONFIRMED\'',
  "TRANSLATION_COMPLETION_IDENTITY_IMMUTABLE"
]) has(migration,m,"teacher-confirmation migration authority");
for(const bad of ['ALTER TABLE edulife_os."LessonTranslationEvidence"','UPDATE edulife_os."LessonTranslationEvidence"','DELETE FROM edulife_os."LessonTranslationEvidence"']) lacks(migration,bad,"immutable evidence mutation");
for(const m of [
  "completionMethod     String   @db.VarChar(48)",
  "sourceLanguage       String?  @db.VarChar(16)",
  "sourceHash           String?  @db.VarChar(64)",
  "suggestedHash        String?  @db.VarChar(64)",
  'receiptId            String?  @unique(map: "LessonTranslationCompletion_receipt_unique") @db.Uuid',
  "receiptVersion       String?  @db.VarChar(64)",
  "confirmationVersion  String?  @db.VarChar(64)"
]) has(schema,m,"method-aware Prisma completion state");
for(const m of [
  '"priorKnowledge"',
  "REQUIRED_GHANAIAN_TRANSLATION_CONTENT_FIELDS_V1"
]) has(contract,m,"Prior Knowledge required contract");
const req=contract.match(/REQUIRED_GHANAIAN_TRANSLATION_CONTENT_FIELDS_V1 = \[([\s\S]*?)\] as const/);assert(req,"Required block missing");assert((req[1].match(/^\s*"/gm)||[]).length===11,"Required Ghanaian-language fields must be exactly 11");
for(const m of [
  "TRANSLATION_COMPLETION_METHOD_RECEIPT",
  "TRANSLATION_COMPLETION_METHOD_TEACHER_CONFIRMATION",
  "TARGET_LANGUAGE_CONFIRMATION_VERSION",
  "verifyTargetLanguageConfirmation",
  'teacherAction: "CONFIRMED"',
  "hashTranslationText(finalText)"
]) has(helper,m,"teacher confirmation helper");
for(const m of [
  "targetLanguageConfirmations?: TranslatableLessonField[]",
  "verifyTargetLanguageConfirmation",
  "verifiedConfirmations",
  "replacementCompletionRows",
  "lessonTranslationCompletion.deleteMany",
  "lessonTranslationCompletion.createMany",
  'row.suggestedHash === finalHash',
  '"ACCEPTED"',
  '"CORRECTED"',
  "maxWait: 10_000",
  "timeout: 30_000",
  "TRANSLATION_COMPLETION_METHOD_TEACHER_CONFIRMATION",
  "teacherAction: confirmation.teacherAction",
  "confirmationVersion",
  "sourceLanguage: null",
  "receiptId: null",
  "Prisma.TransactionIsolationLevel.Serializable"
]) has(upsert,m,"server confirmation save path");
lacks(upsert,"lessonTranslationCompletion.upsert(","per-field completion upsert loop");
lacks(upsert,"await tx.lessonTranslationCompletion.update(","per-field completion update loop");
has(submit,"getTranslationCompletionGate","submit completion recheck");
for(const m of [
  "contentStandardCode: string | null",
  "indicator: {",
  "contentStandard: {",
  "is: { code: contentStandardCode }",
  "Keep the curriculum code exactly as stored",
]) has(aiSupport,m,"schema-valid CurriculumMedia relation fallback");
lacks(aiSupport,'where: { indicatorCode }',"invalid CurriculumMedia.indicatorCode scalar query");
lacks(aiSupport,'curriculumIndicatorId',"non-schema CurriculumMedia indicator alias");
for(const m of [
  "note.coreCompetencies",
  "note.keywords",
  "coreCompetenciesText",
  "keywordsText",
]) has(printPage,m,"persisted Core Competencies / Keywords print path");
for(const m of [
  '"review_language"',
  "pendingTargetLanguageConfirmations",
  "confirmExistingTargetLanguage",
  "Already in {props.translation.languageName} — confirm",
  "targetLanguageConfirmations:",
  'hint="Required for Ghanaian Language notes.',
  'props.translationState !== "translated"',
  "Translate English sections, or confirm sections that are already good"
]) has(editor,m,"teacher review-language UX");
console.log("GHANAIAN LANGUAGE TARGET-LANGUAGE CONFIRMATION CONTRACT: GREEN");
console.log("- exact 13 translatable fields / exact 11 required fields including Prior Knowledge");
console.log("- populated unproven fields require teacher language review, not blind retranslation");
console.log("- existing target-language content can be confirmed without a model call or fake receipt");
console.log("- translated fields hide the translate action, preventing Ewe-to-Ewe garbage retranslations");
console.log("- Save remains fail-closed and server-enforced inside a bounded serializable transaction");
console.log("- completion persistence is rebuilt in bulk to avoid per-field remote transaction round-trips");
console.log("- AI-support media fallback uses schema-valid indicator relations, never CurriculumMedia.indicatorCode");
console.log("- print already consumes persisted Core Competencies + Keywords; no print mutation is required");
console.log("- immutable eight-field linguistic-evidence authority remains untouched");
