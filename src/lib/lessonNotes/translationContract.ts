import { createHash } from "crypto";
import {
  GHANAIAN_LANGUAGE_REGISTRY_VERSION,
  getGhanaianLanguage,
  type GhanaianLanguageCode,
} from "@/lib/ghanaianLanguages/registry";
import { normalizeEducationalText } from "@/lib/ghanaianLanguages/text";

export const TRANSLATION_RECEIPT_VERSION =
  "EDULIFE_TRANSLATION_RECEIPT_V1" as const;

export const TRANSLATION_NORMALIZATION_VERSION =
  "EDULIFE_EDU_TEXT_NFC_V1" as const;

export const TRANSLATION_PROTECTED_TOKEN_VERSION =
  "EDULIFE_TRANSLATION_PROTECTED_TOKEN_V1" as const;

export const TRANSLATABLE_LESSON_FIELDS_V1 = [
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
] as const;

export type TranslatableLessonField =
  (typeof TRANSLATABLE_LESSON_FIELDS_V1)[number];

export const REQUIRED_GHANAIAN_TRANSLATION_CONTENT_FIELDS_V1 = [
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
] as const satisfies readonly TranslatableLessonField[];

export const TRANSLATION_COMPLETION_LANGUAGE_CODES_V1 = [
  "EWE",
] as const;

const REQUIRED_TRANSLATION_CONTENT_FIELD_SET = new Set<string>(
  REQUIRED_GHANAIAN_TRANSLATION_CONTENT_FIELDS_V1,
);

const TRANSLATION_COMPLETION_LANGUAGE_SET = new Set<string>(
  TRANSLATION_COMPLETION_LANGUAGE_CODES_V1,
);

export function isRequiredGhanaianTranslationContentField(
  value: unknown,
): value is (typeof REQUIRED_GHANAIAN_TRANSLATION_CONTENT_FIELDS_V1)[number] {
  return (
    typeof value === "string" &&
    REQUIRED_TRANSLATION_CONTENT_FIELD_SET.has(value)
  );
}

export function isTranslationCompletionLanguageCode(
  value: unknown,
): value is (typeof TRANSLATION_COMPLETION_LANGUAGE_CODES_V1)[number] {
  return (
    typeof value === "string" &&
    TRANSLATION_COMPLETION_LANGUAGE_SET.has(value)
  );
}

export const LEARNABLE_TRANSLATION_FIELDS_V1 = [
  "lessonTitle",
  "objectives",
  "teachingLearningResources",
  "introduction",
  "lessonDevelopment",
  "conclusion",
  "assessment",
  "homework",
] as const;

export type LearnableTranslationField =
  (typeof LEARNABLE_TRANSLATION_FIELDS_V1)[number];

export const TRANSLATION_SUGGESTION_SOURCES = [
  "MODEL",
  "PERSONAL_MEMORY",
  "SCHOOL_MEMORY",
] as const;

export type TranslationSuggestionSource =
  (typeof TRANSLATION_SUGGESTION_SOURCES)[number];

export const MAX_TRANSLATION_TEXT_CHARS = 50_000;

const TRANSLATABLE_FIELD_SET = new Set<string>(
  TRANSLATABLE_LESSON_FIELDS_V1,
);

const LEARNABLE_FIELD_SET = new Set<string>(
  LEARNABLE_TRANSLATION_FIELDS_V1,
);

const SUGGESTION_SOURCE_SET = new Set<string>(
  TRANSLATION_SUGGESTION_SOURCES,
);

export function isTranslatableLessonField(
  value: unknown,
): value is TranslatableLessonField {
  return (
    typeof value === "string" &&
    TRANSLATABLE_FIELD_SET.has(value)
  );
}

export function isLearnableTranslationField(
  value: unknown,
): value is LearnableTranslationField {
  return (
    typeof value === "string" &&
    LEARNABLE_FIELD_SET.has(value)
  );
}

export function isTranslationSuggestionSource(
  value: unknown,
): value is TranslationSuggestionSource {
  return (
    typeof value === "string" &&
    SUGGESTION_SOURCE_SET.has(value)
  );
}

export function normalizeTranslationText(value: unknown) {
  return normalizeEducationalText(value).trim();
}

export function validateTranslationText(value: unknown) {
  const text = normalizeTranslationText(value);

  if (!text) {
    return {
      ok: false as const,
      error: "TRANSLATION_TEXT_REQUIRED" as const,
    };
  }

  if (text.length > MAX_TRANSLATION_TEXT_CHARS) {
    return {
      ok: false as const,
      error: "TRANSLATION_TEXT_TOO_LARGE" as const,
    };
  }

  return {
    ok: true as const,
    text,
  };
}

export function hashTranslationText(value: unknown) {
  return createHash("sha256")
    .update(normalizeTranslationText(value), "utf8")
    .digest("hex");
}

export function isSha256Hex(value: unknown) {
  return (
    typeof value === "string" &&
    /^[a-f0-9]{64}$/.test(value)
  );
}

export function resolveTranslationLanguage(
  languageCode: unknown,
  registryVersion: unknown,
):
  | {
      ok: true;
      languageCode: GhanaianLanguageCode;
      registryVersion: typeof GHANAIAN_LANGUAGE_REGISTRY_VERSION;
      languageName: string;
    }
  | {
      ok: false;
      error:
        | "TRANSLATION_LANGUAGE_REQUIRED"
        | "TRANSLATION_LANGUAGE_REGISTRY_MISMATCH";
    } {
  const language = getGhanaianLanguage(languageCode);

  if (!language) {
    return {
      ok: false,
      error: "TRANSLATION_LANGUAGE_REQUIRED",
    };
  }

  if (registryVersion !== GHANAIAN_LANGUAGE_REGISTRY_VERSION) {
    return {
      ok: false,
      error: "TRANSLATION_LANGUAGE_REGISTRY_MISMATCH",
    };
  }

  return {
    ok: true,
    languageCode: language.code,
    registryVersion: GHANAIAN_LANGUAGE_REGISTRY_VERSION,
    languageName: language.name,
  };
}
