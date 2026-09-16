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
  assert(fs.existsSync(absolute), `Missing required translation-security source file: ${relativePath}`);
  return fs.readFileSync(absolute, "utf8").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}
function has(source, marker, label) {
  assert(source.includes(marker), `Missing ${label}`, { marker });
}
function lacks(source, marker, label) {
  assert(!source.includes(marker), `Forbidden ${label}`, { marker });
}

const contract = read("src/lib/lessonNotes/translationContract.ts");
const completion = read("src/lib/lessonNotes/translationCompletion.ts");
const receipt = read("src/lib/lessonNotes/translationReceipt.ts");
const protectedTokens = read("src/lib/lessonNotes/protectedTranslationTokens.ts");
const translateRoute = read("src/app/api/teachers/lesson-notes/translate/route.ts");

const translatableBlock = contract.match(
  /TRANSLATABLE_LESSON_FIELDS_V1 = \[([\s\S]*?)\] as const;/,
);
assert(translatableBlock, "Translatable field block missing");

const requiredBlock = contract.match(
  /REQUIRED_GHANAIAN_TRANSLATION_CONTENT_FIELDS_V1 = \[([\s\S]*?)\] as const/,
);
assert(requiredBlock, "Required Ghanaian-language content field block missing");

const learnableBlock = contract.match(
  /LEARNABLE_TRANSLATION_FIELDS_V1 = \[([\s\S]*?)\] as const;/,
);
assert(learnableBlock, "Learnable field block missing");

const translatableFields = [
  "lessonTitle",
  "objectives",
  "priorKnowledge",
  "coreCompetencies",
  "keywords",
  "teachingLearningResources",
  "introduction",
  "lessonDevelopment",
  "conclusion",
  "assessment",
  "homework",
  "differentiationNotes",
  "reflectionNotes",
];

const requiredFields = [
  "lessonTitle",
  "objectives",
  "priorKnowledge",
  "coreCompetencies",
  "keywords",
  "teachingLearningResources",
  "introduction",
  "lessonDevelopment",
  "conclusion",
  "assessment",
  "homework",
];

const learnableFields = [
  "lessonTitle",
  "objectives",
  "teachingLearningResources",
  "introduction",
  "lessonDevelopment",
  "conclusion",
  "assessment",
  "homework",
];

for (const field of translatableFields) {
  const matches = translatableBlock[1].match(new RegExp(`"${field}"`, "g")) || [];
  assert(matches.length === 1, `Translatable field must occur exactly once: ${field}`, { count: matches.length });
}
assert((translatableBlock[1].match(/^\s*"/gm) || []).length === 13, "Translatable field contract must contain exactly 13 fields");

for (const field of requiredFields) {
  const matches = requiredBlock[1].match(new RegExp(`"${field}"`, "g")) || [];
  assert(matches.length === 1, `Required content field must occur exactly once: ${field}`, { count: matches.length });
}
assert((requiredBlock[1].match(/^\s*"/gm) || []).length === 11, "Required Ghanaian-language content contract must contain exactly 11 fields");

for (const field of learnableFields) {
  const matches = learnableBlock[1].match(new RegExp(`"${field}"`, "g")) || [];
  assert(matches.length === 1, `Learnable field must occur exactly once: ${field}`, { count: matches.length });
}
assert((learnableBlock[1].match(/^\s*"/gm) || []).length === 8, "Reusable evidence field contract must remain exactly 8 fields");

for (const forbidden of [
  "priorKnowledge",
  "coreCompetencies",
  "keywords",
  "differentiationNotes",
  "reflectionNotes",
]) {
  lacks(learnableBlock[1], `"${forbidden}"`, `reusable evidence field ${forbidden}`);
}

for (const marker of [
  'TRANSLATION_COMPLETION_LANGUAGE_CODES_V1 = [',
  '"EWE"',
  "isTranslationCompletionLanguageCode",
  '"EDULIFE_TRANSLATION_RECEIPT_V1"',
  '"EDULIFE_EDU_TEXT_NFC_V1"',
  '"EDULIFE_TRANSLATION_PROTECTED_TOKEN_V1"',
  "hashTranslationText",
  'createHash("sha256")',
  "MAX_TRANSLATION_TEXT_CHARS = 50_000",
]) {
  has(contract, marker, "translation contract marker");
}

for (const marker of [
  "translationCompletionApplies",
  "isGhanaianLanguageSubject",
  "isTranslationCompletionLanguageCode",
  "verifyTranslationReceipt",
  "verifyTargetLanguageConfirmation",
  "TARGET_LANGUAGE_CONFIRMATION_VERSION",
  "TRANSLATION_COMPLETION_METHOD_TEACHER_CONFIRMATION",
  "receipt.tenantId !== input.tenantId",
  "receipt.teacherUserId !== input.teacherUserId",
  "receipt.lessonNoteId !== input.lessonNoteId",
  "receipt.field !== review.field",
  "receipt.languageCode !== input.languageCode",
  "receipt.registryVersion !== input.registryVersion",
  "receipt.sourceHash !== sourceHash",
  "receipt.suggestedHash !== suggestedHash",
  'teacherAction:\n        suggestedHash === finalHash ? "ACCEPTED" : "CORRECTED"',
]) {
  has(completion, marker, "translation completion verification marker");
}

for (const forbidden of [
  "sourceText           String",
  "suggestedText        String",
  "finalText            String",
  "LessonTranslationEvidence",
  "corpusOptIn",
  "corpusEligible",
]) {
  lacks(completion, forbidden, `completion helper raw-evidence coupling ${forbidden}`);
}

for (const marker of [
  'createHmac("sha256", getReceiptSecret())',
  "timingSafeEqual",
  "randomUUID",
  "TRANSLATION_RECEIPT_SECRET",
  "EDULIFE_TRANSLATION_RECEIPT",
  "receiptId",
  "tenantId",
  "teacherUserId",
  "lessonNoteId",
  "field:",
  'sourceLanguage: "en"',
  "languageCode",
  "registryVersion",
  "normalizationVersion",
  "protectedTokenVersion",
  "sourceHash",
  "suggestionSource",
  "provider",
  "modelId",
  "modelRevision",
  "suggestedHash",
  "iat",
  "exp",
  "DEFAULT_RECEIPT_TTL_SECONDS = 12 * 60 * 60",
  "MAX_RECEIPT_TTL_SECONDS = 24 * 60 * 60",
  "FUTURE_CLOCK_SKEW_SECONDS = 5 * 60",
]) {
  has(receipt, marker, "translation receipt marker");
}

for (const forbidden of [
  "NEXTAUTH_SECRET",
  "CONSENT_TOKEN_SECRET",
  "jsonwebtoken",
  "jose",
  "prisma",
  "@/lib/prisma",
]) {
  lacks(receipt, forbidden, `translation receipt coupling ${forbidden}`);
}

for (const marker of [
  "TRANSLATION_PROTECTED_TOKEN_VERSION",
  "CURRICULUM_CODE_PATTERN",
  "CURRICULUM_CODE_EXACT_PATTERN",
  '"MODEL_TEXT"',
  '"PROTECTED_TOKEN"',
  '"LITERAL_TEXT"',
  "createProtectedTranslationBypassPlan",
  "getProtectedTranslationModelInputs",
  "assembleProtectedTranslationBypass",
  "TRANSLATION_PROTECTED_TOKEN_MODEL_RESULT_COUNT_MISMATCH",
  "TRANSLATION_PROTECTED_TOKEN_INTEGRITY_FAILED",
]) {
  has(protectedTokens, marker, "protected-token bypass marker");
}

for (const forbidden of [
  "ZXQEDULIFEPT",
  "maskProtectedTranslationTokens",
  "restoreProtectedTranslationTokens",
  "fetch(",
  "api.openai.com",
  "anthropic.com",
  "generativelanguage.googleapis.com",
  "@/lib/prisma",
]) {
  lacks(protectedTokens, forbidden, `protected-token forbidden coupling ${forbidden}`);
}

for (const forbidden of [
  "prisma.lessonNote.update(",
  "prisma.lessonNote.upsert(",
  "prisma.lessonNote.create(",
  "prisma.lessonTranslationEvidence",
  "prisma.lessonTranslationCompletion",
  "writeAuditLog(",
]) {
  lacks(translateRoute, forbidden, `preview-only translator route write ${forbidden}`);
}

console.log("LESSON NOTE TRANSLATION SECURITY + COMPLETION FOUNDATION: GREEN");
console.log("- translatable fields: exact 13");
console.log("- required Ghanaian-language content: exact 11 including Prior Knowledge");
console.log("- reusable linguistic evidence: exact safe 8-field boundary preserved");
console.log("- completion enforcement: certified EWE only / generic Ghanaian-language architecture preserved");
console.log("- signed receipt: tenant + teacher + note + field + language + hashes + expiry bound");
console.log("- completion state: no raw source/suggestion/final text or corpus flags");
console.log("- teacher-confirmed target-language completion uses no model receipt and no linguistic-corpus row");
console.log("- protected tokens: deterministic model bypass preserved");
console.log("- translate route: preview-only / no LessonNote, evidence or completion writes");
