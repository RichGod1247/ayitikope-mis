import {
  GHANAIAN_LANGUAGE_REGISTRY_VERSION,
  isGhanaianLanguageSubject,
} from "@/lib/ghanaianLanguages/registry";
import {
  LEARNABLE_TRANSLATION_FIELDS_V1,
  REQUIRED_GHANAIAN_TRANSLATION_CONTENT_FIELDS_V1,
  TRANSLATABLE_LESSON_FIELDS_V1,
  TRANSLATION_NORMALIZATION_VERSION,
  TRANSLATION_RECEIPT_VERSION,
  hashTranslationText,
  isLearnableTranslationField,
  isTranslatableLessonField,
  isTranslationCompletionLanguageCode,
  normalizeTranslationText,
  type TranslatableLessonField,
} from "@/lib/lessonNotes/translationContract";
import {
  verifyTranslationReceipt,
  type TranslationReceiptPayloadV1,
} from "@/lib/lessonNotes/translationReceipt";

export const TRANSLATION_COMPLETION_FIELDS_V1 =
  TRANSLATABLE_LESSON_FIELDS_V1;

export const TRANSLATION_COMPLETION_REQUIRED_CONTENT_FIELDS_V1 =
  REQUIRED_GHANAIAN_TRANSLATION_CONTENT_FIELDS_V1;

export type TranslationCompletionField = TranslatableLessonField;

export const TRANSLATION_COMPLETION_METHOD_RECEIPT =
  "TRANSLATION_RECEIPT" as const;

export const TRANSLATION_COMPLETION_METHOD_TEACHER_CONFIRMATION =
  "TEACHER_TARGET_LANGUAGE_CONFIRMATION" as const;

export const TARGET_LANGUAGE_CONFIRMATION_VERSION =
  "EDULIFE_TARGET_LANGUAGE_CONFIRMATION_V1" as const;

export type TranslationReviewInput = {
  field: TranslatableLessonField;
  sourceText: string;
  suggestedText: string;
  receipt: string;
};

export type TranslationCompletionRowLike = {
  fieldKey: string;
  finalHash: string;
  receiptId?: string | null;
  completionMethod?: string | null;
};

export type TranslationFieldValueRecord = Partial<
  Record<TranslatableLessonField, string | null | undefined>
>;

export type VerifiedTranslationReview = {
  field: TranslatableLessonField;
  sourceText: string;
  suggestedText: string;
  finalText: string;
  sourceHash: string;
  suggestedHash: string;
  finalHash: string;
  teacherAction: "ACCEPTED" | "CORRECTED";
  receipt: TranslationReceiptPayloadV1;
};

export type VerifiedTargetLanguageConfirmation = {
  field: TranslatableLessonField;
  finalText: string;
  finalHash: string;
  completionMethod: typeof TRANSLATION_COMPLETION_METHOD_TEACHER_CONFIRMATION;
  teacherAction: "CONFIRMED";
  confirmationVersion: typeof TARGET_LANGUAGE_CONFIRMATION_VERSION;
};

const LEARNABLE_FIELD_SET = new Set<string>(
  LEARNABLE_TRANSLATION_FIELDS_V1,
);

export function translationCompletionApplies(input: {
  subject: unknown;
  languageCode: unknown;
  registryVersion: unknown;
}) {
  return (
    isGhanaianLanguageSubject(input.subject) &&
    isTranslationCompletionLanguageCode(input.languageCode) &&
    input.registryVersion === GHANAIAN_LANGUAGE_REGISTRY_VERSION
  );
}

export function isTranslationCompletionField(
  value: unknown,
): value is TranslationCompletionField {
  return isTranslatableLessonField(value);
}

export function isTranslationEvidenceField(
  value: unknown,
): value is (typeof LEARNABLE_TRANSLATION_FIELDS_V1)[number] {
  return (
    typeof value === "string" &&
    LEARNABLE_FIELD_SET.has(value) &&
    isLearnableTranslationField(value)
  );
}

export function getCurrentCompletedTranslationFields(input: {
  values: TranslationFieldValueRecord;
  rows: readonly TranslationCompletionRowLike[];
}) {
  const byField = new Map<string, TranslationCompletionRowLike>();

  for (const row of input.rows) {
    if (isTranslationCompletionField(row.fieldKey)) {
      byField.set(row.fieldKey, row);
    }
  }

  return TRANSLATION_COMPLETION_FIELDS_V1.filter((field) => {
    const value = normalizeTranslationText(input.values[field]);
    if (!value) return false;

    const row = byField.get(field);
    return Boolean(
      row &&
        /^[a-f0-9]{64}$/.test(row.finalHash) &&
        row.finalHash === hashTranslationText(value),
    );
  });
}

export function getTranslationCompletionGate(input: {
  values: TranslationFieldValueRecord;
  completedFields: readonly string[];
}) {
  const completed = new Set(
    input.completedFields.filter(isTranslationCompletionField),
  );

  const missingContent: TranslatableLessonField[] = [];
  const needsTranslation: TranslatableLessonField[] = [];

  for (const field of TRANSLATION_COMPLETION_FIELDS_V1) {
    const value = normalizeTranslationText(input.values[field]);
    const requiredContent =
      TRANSLATION_COMPLETION_REQUIRED_CONTENT_FIELDS_V1.includes(
        field as (typeof TRANSLATION_COMPLETION_REQUIRED_CONTENT_FIELDS_V1)[number],
      );

    if (!value) {
      if (requiredContent) {
        missingContent.push(field);
      }
      continue;
    }

    if (!completed.has(field)) {
      needsTranslation.push(field);
    }
  }

  return {
    ok:
      missingContent.length === 0 &&
      needsTranslation.length === 0,
    missingContent,
    needsTranslation,
  } as const;
}

export function verifyTargetLanguageConfirmation(input: {
  field: unknown;
  finalText: unknown;
}):
  | {
      ok: true;
      value: VerifiedTargetLanguageConfirmation;
    }
  | {
      ok: false;
      error:
        | "TARGET_LANGUAGE_CONFIRMATION_FIELD_INVALID"
        | "TARGET_LANGUAGE_CONFIRMATION_FINAL_EMPTY";
    } {
  if (!isTranslatableLessonField(input.field)) {
    return {
      ok: false,
      error: "TARGET_LANGUAGE_CONFIRMATION_FIELD_INVALID",
    };
  }

  const finalText = normalizeTranslationText(input.finalText);
  if (!finalText) {
    return {
      ok: false,
      error: "TARGET_LANGUAGE_CONFIRMATION_FINAL_EMPTY",
    };
  }

  return {
    ok: true,
    value: {
      field: input.field,
      finalText,
      finalHash: hashTranslationText(finalText),
      completionMethod:
        TRANSLATION_COMPLETION_METHOD_TEACHER_CONFIRMATION,
      teacherAction: "CONFIRMED",
      confirmationVersion: TARGET_LANGUAGE_CONFIRMATION_VERSION,
    },
  };
}

export function verifyTranslationReview(input: {
  review: unknown;
  tenantId: string;
  teacherUserId: string;
  lessonNoteId: string;
  languageCode: string;
  registryVersion: string;
  finalText: unknown;
  now?: Date;
}):
  | {
      ok: true;
      value: VerifiedTranslationReview;
    }
  | {
      ok: false;
      error:
        | "TRANSLATION_REVIEW_SHAPE_INVALID"
        | "TRANSLATION_REVIEW_RECEIPT_INVALID"
        | "TRANSLATION_REVIEW_AUTHORITY_MISMATCH"
        | "TRANSLATION_REVIEW_HASH_MISMATCH"
        | "TRANSLATION_REVIEW_FINAL_EMPTY";
    } {
  if (
    !input.review ||
    typeof input.review !== "object" ||
    Array.isArray(input.review)
  ) {
    return {
      ok: false,
      error: "TRANSLATION_REVIEW_SHAPE_INVALID",
    };
  }

  const review = input.review as Record<string, unknown>;
  const keys = Object.keys(review).sort();
  const expectedKeys = [
    "field",
    "receipt",
    "sourceText",
    "suggestedText",
  ].sort();

  if (
    keys.length !== expectedKeys.length ||
    keys.some((key, index) => key !== expectedKeys[index]) ||
    !isTranslatableLessonField(review.field) ||
    typeof review.sourceText !== "string" ||
    typeof review.suggestedText !== "string" ||
    typeof review.receipt !== "string"
  ) {
    return {
      ok: false,
      error: "TRANSLATION_REVIEW_SHAPE_INVALID",
    };
  }

  const receipt = verifyTranslationReceipt(review.receipt, {
    now: input.now,
  });

  if (!receipt) {
    return {
      ok: false,
      error: "TRANSLATION_REVIEW_RECEIPT_INVALID",
    };
  }

  if (
    receipt.tenantId !== input.tenantId ||
    receipt.teacherUserId !== input.teacherUserId ||
    receipt.lessonNoteId !== input.lessonNoteId ||
    receipt.field !== review.field ||
    receipt.languageCode !== input.languageCode ||
    receipt.registryVersion !== input.registryVersion ||
    receipt.normalizationVersion !== TRANSLATION_NORMALIZATION_VERSION ||
    receipt.receiptVersion !== TRANSLATION_RECEIPT_VERSION
  ) {
    return {
      ok: false,
      error: "TRANSLATION_REVIEW_AUTHORITY_MISMATCH",
    };
  }

  const sourceText = normalizeTranslationText(review.sourceText);
  const suggestedText = normalizeTranslationText(review.suggestedText);
  const finalText = normalizeTranslationText(input.finalText);

  if (!finalText) {
    return {
      ok: false,
      error: "TRANSLATION_REVIEW_FINAL_EMPTY",
    };
  }

  const sourceHash = hashTranslationText(sourceText);
  const suggestedHash = hashTranslationText(suggestedText);
  const finalHash = hashTranslationText(finalText);

  if (
    receipt.sourceHash !== sourceHash ||
    receipt.suggestedHash !== suggestedHash
  ) {
    return {
      ok: false,
      error: "TRANSLATION_REVIEW_HASH_MISMATCH",
    };
  }

  return {
    ok: true,
    value: {
      field: review.field,
      sourceText,
      suggestedText,
      finalText,
      sourceHash,
      suggestedHash,
      finalHash,
      teacherAction:
        suggestedHash === finalHash ? "ACCEPTED" : "CORRECTED",
      receipt,
    },
  };
}
