"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS QA harness intentionally uses require() for repository source verification. */

const fs = require("fs");
const path = require("path");

const repoRoot =
  path.resolve(__dirname, "..", "..");

function fail(message, detail) {
  const suffix =
    detail === undefined
      ? ""
      : `\n${JSON.stringify(detail, null, 2)}`;

  throw new Error(
    `${message}${suffix}`,
  );
}

function assert(
  condition,
  message,
  detail,
) {
  if (!condition) {
    fail(message, detail);
  }
}

function read(relativePath) {
  const absolute =
    path.join(repoRoot, relativePath);

  assert(
    fs.existsSync(absolute),
    `Missing required file: ${relativePath}`,
  );

  return fs.readFileSync(
    absolute,
    "utf8",
  );
}

function normalizedWhitespace(value) {
  return String(value)
    .replace(/\s+/g, " ")
    .trim();
}

function has(
  source,
  marker,
  label,
) {
  const found =
    source.includes(marker) ||
    normalizedWhitespace(source).includes(
      normalizedWhitespace(marker),
    );

  assert(
    found,
    `Missing ${label}`,
    { marker },
  );
}

function lacks(
  source,
  marker,
  label,
) {
  const found =
    source.includes(marker) ||
    normalizedWhitespace(source).includes(
      normalizedWhitespace(marker),
    );

  assert(
    !found,
    `Forbidden ${label}`,
    { marker },
  );
}

const providerPath =
  "src/lib/lessonNotes/translationProvider.ts";

const routePath =
  "src/app/api/teachers/lesson-notes/translate/route.ts";

const provider =
  read(providerPath);

const route =
  read(routePath);

for (const marker of [
  'HELSINKI_EWE_PROVIDER = "HELSINKI_NLP"',
  '"Helsinki-NLP/opus-mt-en-ee"',
  '"fef1362558b7948e5257f06f192d700761b3b57d"',
  'process.env.EDULIFE_TRANSLATOR_BASE_URL',
  'process.env.EDULIFE_TRANSLATION_PROVIDER_TOKEN',
  'Buffer.byteLength(providerToken, "utf8")',
  'baseUrl.hostname === "127.0.0.1"',
  'baseUrl.port === "8787"',
  "new URL(",
  '"/translate"',
  'Authorization: `Bearer ${providerToken}`',
  'body: JSON.stringify({ text })',
  'cache: "no-store"',
  'new AbortController()',
  'PROVIDER_TIMEOUT_MS = 65_000',
  'payload.sourceLanguage === HELSINKI_EWE_SOURCE_LANGUAGE',
  'payload.targetLanguage === HELSINKI_EWE_TARGET_LANGUAGE',
]) {
  has(
    provider,
    marker,
    `provider contract marker ${marker}`,
  );
}

for (const forbidden of [
  'JSON.stringify({ text, targetLanguage',
  'JSON.stringify({ targetLanguage',
  "lessonNoteId:",
  "teacherUserId:",
  "tenantId:",
  "prisma",
  "DATABASE_URL",
  "TRANSLATION_RECEIPT_SECRET",
  "NEXT_PUBLIC_",
]) {
  lacks(
    provider,
    forbidden,
    `provider ownership leak ${forbidden}`,
  );
}

for (const marker of [
  'export const runtime = "nodejs"',
  'export const dynamic = "force-dynamic"',
  "requireServerUserContext({",
  'redirectTo: "/teacher/lesson-notes"',
  "requireTenant: true",
  "prisma.membership.findUnique({",
  'membership.status !== "ACTIVE"',
  'const EXACT_BODY_KEYS = [',
  '"field"',
  '"lessonNoteId"',
  '"sourceText"',
  "hasExactBodyKeys(rawBody)",
  "isTranslatableLessonField(",
  "validateTranslationText(",
  "checkRateLimit({",
  'scope: RATE_LIMIT_SCOPE',
  "getClientIp(req)",
  "prisma.lessonNote.findFirst({",
  "tenantId: ctx.tenantId",
  "teacherUserId: ctx.userId",
  "lessonLanguageCode: true",
  "languageRegistryVersion: true",
  'status === "SUBMITTED"',
  'status === "APPROVED"',
  "isGhanaianLanguageSubject(",
  "resolveTranslationLanguage(",
  'language.languageCode !== "EWE"',
  '"TRANSLATION_ENGINE_NOT_AVAILABLE"',
  "createProtectedTranslationBypassPlan(",
  "getProtectedTranslationModelInputs(",
  "for (const modelInput of modelInputs)",
  "translateModelSegmentToEwe(",
  "assembleProtectedTranslationBypass(",
  "hashTranslationText(",
  "signTranslationReceipt({",
  'suggestionSource: "MODEL"',
  "receipt: signed.receipt",
  'Cache-Control": "no-store"',
]) {
  has(
    route,
    marker,
    `route contract marker ${marker}`,
  );
}

const planIndex =
  route.indexOf(
    "createProtectedTranslationBypassPlan(",
  );

const modelInputsIndex =
  route.indexOf(
    "getProtectedTranslationModelInputs(",
  );

const providerCallIndex =
  route.indexOf(
    "translateModelSegmentToEwe(",
  );

const assemblyIndex =
  route.indexOf(
    "assembleProtectedTranslationBypass(",
  );

const receiptIndex =
  route.indexOf(
    "signTranslationReceipt({",
  );

assert(
  planIndex >= 0 &&
    modelInputsIndex > planIndex &&
    providerCallIndex > modelInputsIndex &&
    assemblyIndex > providerCallIndex &&
    receiptIndex > assemblyIndex,
  "Protected-value/provider/receipt execution order drift",
  {
    planIndex,
    modelInputsIndex,
    providerCallIndex,
    assemblyIndex,
    receiptIndex,
  },
);

for (const forbidden of [
  "body.targetLanguage",
  "body.languageCode",
  "rawBody.targetLanguage",
  "rawBody.languageCode",
  "prisma.lessonNote.update(",
  "prisma.lessonNote.upsert(",
  "prisma.lessonNote.create(",
  "prisma.lessonTranslationEvidence",
  "writeAuditLog(",
  "aiPlanJson",
  "fetch(process.env",
  "NEXT_PUBLIC_",
]) {
  lacks(
    route,
    forbidden,
    `route forbidden ownership/write marker ${forbidden}`,
  );
}

has(
  route,
  "translatedSegments.push(",
  "provider results captured separately from protected values",
);

has(
  route,
  "plan.protectedTokenCount",
  "protected-value count response",
);

console.log(
  "=== LESSON NOTE TRANSLATION PROVIDER + API SOURCE CONTRACT ===",
);

console.log(
  "Auth                     : SERVER USER + ACTIVE MEMBERSHIP",
);

console.log(
  "Lesson authority         : TENANT + TEACHER OWNERSHIP",
);

console.log(
  "Language authority       : FROZEN NOTE CODE + REGISTRY",
);

console.log(
  "Pilot engine             : EWE ONLY",
);

console.log(
  "Browser target control   : ABSENT / STRICT BODY",
);

console.log(
  "Rate limit               : ATOMIC ApiRateLimitBucket",
);

console.log(
  "Protected values         : BYPASS MODEL / EXACT ASSEMBLY",
);

console.log(
  "Provider ingress         : SERVER-ONLY 127.0.0.1:8787 + BEARER",
);

console.log(
  "Provider provenance      : PINNED HELSINKI EWE REVISION",
);

console.log(
  "Receipt                  : SIGNED AFTER FULL ASSEMBLY",
);

console.log(
  "Lesson/evidence writes   : NONE",
);

console.log(
  "Provider/API source QA   : GREEN",
);
