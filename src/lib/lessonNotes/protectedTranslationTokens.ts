import {
  TRANSLATION_PROTECTED_TOKEN_VERSION,
  normalizeTranslationText,
} from "@/lib/lessonNotes/translationContract";
import {
  normalizeEducationalText,
} from "@/lib/ghanaianLanguages/text";

/**
 * Ghana curriculum identifiers such as B8.1.1.1 must never enter neural
 * inference. They are partitioned out before provider calls and are copied
 * back byte-for-byte from the normalized source during deterministic assembly.
 */
const CURRICULUM_CODE_PATTERN =
  /\b[A-Za-z]{1,8}\d{1,3}(?:\.\d{1,4}){2,8}\b/g;

const CURRICULUM_CODE_EXACT_PATTERN =
  /^[A-Za-z]{1,8}\d{1,3}(?:\.\d{1,4}){2,8}$/;

const MODEL_TEXT_CONTENT_PATTERN =
  /[\p{L}\p{M}\p{N}]/u;

export type ProtectedTranslationSegment =
  | {
      kind: "MODEL_TEXT";
      text: string;
    }
  | {
      kind: "PROTECTED_TOKEN";
      text: string;
    }
  | {
      kind: "LITERAL_TEXT";
      text: string;
    };

export type ProtectedTranslationPlanV1 = {
  version: typeof TRANSLATION_PROTECTED_TOKEN_VERSION;
  sourceText: string;
  segments: ProtectedTranslationSegment[];
  modelInputCount: number;
  protectedTokenCount: number;
};

function classifyUnprotectedText(
  text: string,
): ProtectedTranslationSegment | null {
  if (!text) {
    return null;
  }

  if (MODEL_TEXT_CONTENT_PATTERN.test(text)) {
    return {
      kind: "MODEL_TEXT",
      text,
    };
  }

  return {
    kind: "LITERAL_TEXT",
    text,
  };
}

function validatePlan(
  plan: ProtectedTranslationPlanV1,
) {
  if (
    !plan ||
    plan.version !== TRANSLATION_PROTECTED_TOKEN_VERSION ||
    typeof plan.sourceText !== "string" ||
    !Array.isArray(plan.segments) ||
    !Number.isInteger(plan.modelInputCount) ||
    plan.modelInputCount < 0 ||
    !Number.isInteger(plan.protectedTokenCount) ||
    plan.protectedTokenCount < 0
  ) {
    throw new Error(
      "TRANSLATION_PROTECTED_TOKEN_PLAN_INVALID",
    );
  }

  let reconstructedSource = "";
  let modelInputCount = 0;
  let protectedTokenCount = 0;

  for (const segment of plan.segments) {
    if (
      !segment ||
      typeof segment.text !== "string" ||
      (
        segment.kind !== "MODEL_TEXT" &&
        segment.kind !== "PROTECTED_TOKEN" &&
        segment.kind !== "LITERAL_TEXT"
      )
    ) {
      throw new Error(
        "TRANSLATION_PROTECTED_TOKEN_PLAN_INVALID",
      );
    }

    if (
      segment.kind === "MODEL_TEXT" &&
      !MODEL_TEXT_CONTENT_PATTERN.test(segment.text)
    ) {
      throw new Error(
        "TRANSLATION_PROTECTED_TOKEN_PLAN_INVALID",
      );
    }

    if (
      segment.kind === "PROTECTED_TOKEN" &&
      !CURRICULUM_CODE_EXACT_PATTERN.test(segment.text)
    ) {
      throw new Error(
        "TRANSLATION_PROTECTED_TOKEN_PLAN_INVALID",
      );
    }

    reconstructedSource += segment.text;

    if (segment.kind === "MODEL_TEXT") {
      modelInputCount += 1;
    }

    if (segment.kind === "PROTECTED_TOKEN") {
      protectedTokenCount += 1;
    }
  }

  if (
    reconstructedSource !== plan.sourceText ||
    modelInputCount !== plan.modelInputCount ||
    protectedTokenCount !== plan.protectedTokenCount
  ) {
    throw new Error(
      "TRANSLATION_PROTECTED_TOKEN_INTEGRITY_FAILED",
    );
  }
}

export function createProtectedTranslationBypassPlan(
  value: unknown,
): ProtectedTranslationPlanV1 {
  const sourceText =
    normalizeTranslationText(value);

  const segments: ProtectedTranslationSegment[] = [];
  let cursor = 0;
  let modelInputCount = 0;
  let protectedTokenCount = 0;

  for (
    const match of sourceText.matchAll(
      CURRICULUM_CODE_PATTERN,
    )
  ) {
    const index = match.index;

    if (
      typeof index !== "number" ||
      typeof match[0] !== "string"
    ) {
      throw new Error(
        "TRANSLATION_PROTECTED_TOKEN_INTEGRITY_FAILED",
      );
    }

    if (index > cursor) {
      const unprotected =
        sourceText.slice(cursor, index);

      const segment =
        classifyUnprotectedText(unprotected);

      if (segment) {
        segments.push(segment);

        if (segment.kind === "MODEL_TEXT") {
          modelInputCount += 1;
        }
      }
    }

    segments.push({
      kind: "PROTECTED_TOKEN",
      text: match[0],
    });

    protectedTokenCount += 1;
    cursor = index + match[0].length;
  }

  if (cursor < sourceText.length) {
    const trailing =
      sourceText.slice(cursor);

    const segment =
      classifyUnprotectedText(trailing);

    if (segment) {
      segments.push(segment);

      if (segment.kind === "MODEL_TEXT") {
        modelInputCount += 1;
      }
    }
  }

  const plan: ProtectedTranslationPlanV1 = {
    version: TRANSLATION_PROTECTED_TOKEN_VERSION,
    sourceText,
    segments,
    modelInputCount,
    protectedTokenCount,
  };

  validatePlan(plan);

  return plan;
}

export function getProtectedTranslationModelInputs(
  plan: ProtectedTranslationPlanV1,
) {
  validatePlan(plan);

  return plan.segments
    .filter(
      (
        segment,
      ): segment is Extract<
        ProtectedTranslationSegment,
        { kind: "MODEL_TEXT" }
      > => segment.kind === "MODEL_TEXT",
    )
    .map((segment) => segment.text);
}

export function assembleProtectedTranslationBypass(
  plan: ProtectedTranslationPlanV1,
  translatedModelSegments: unknown,
) {
  validatePlan(plan);

  if (!Array.isArray(translatedModelSegments)) {
    throw new Error(
      "TRANSLATION_PROTECTED_TOKEN_PLAN_INVALID",
    );
  }

  if (
    translatedModelSegments.length !==
    plan.modelInputCount
  ) {
    throw new Error(
      "TRANSLATION_PROTECTED_TOKEN_MODEL_RESULT_COUNT_MISMATCH",
    );
  }

  let translatedIndex = 0;
  let output = "";

  for (const segment of plan.segments) {
    if (segment.kind !== "MODEL_TEXT") {
      output += segment.text;
      continue;
    }

    const translated =
      normalizeEducationalText(
        translatedModelSegments[
          translatedIndex
        ],
      );

    if (!translated.trim()) {
      throw new Error(
        "TRANSLATION_PROTECTED_TOKEN_INTEGRITY_FAILED",
      );
    }

    output += translated;
    translatedIndex += 1;
  }

  if (
    translatedIndex !== plan.modelInputCount
  ) {
    throw new Error(
      "TRANSLATION_PROTECTED_TOKEN_INTEGRITY_FAILED",
    );
  }

  return normalizeEducationalText(output).trim();
}
