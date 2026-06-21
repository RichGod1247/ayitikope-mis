//src/lib/assessments/itemWriteState.ts
export type AssessmentItemStatusCode = "DRAFT" | "PUBLISHED" | "LOCKED";

export type AssessmentItemWriteBlockCode = "ITEM_PUBLISHED" | "ITEM_LOCKED";
export type AssessmentScoreWriteBlockCode = "ITEM_LOCKED";

type ItemStateLike = {
  status?: string | null;
  publishedAt?: Date | string | null;
  lockedAt?: Date | string | null;
};

export function normalizeAssessmentItemStatus(
  raw: unknown
): AssessmentItemStatusCode {
  const s = String(raw ?? "").trim().toUpperCase();

  if (s === "LOCKED") return "LOCKED";
  if (s === "PUBLISHED") return "PUBLISHED";
  return "DRAFT";
}

/**
 * Definition guard:
 * Used when editing/deleting the assessment item setup itself.
 *
 * DRAFT      => editable
 * PUBLISHED  => definition frozen
 * LOCKED     => definition frozen
 */
export function getAssessmentItemWriteBlock(
  item: ItemStateLike | null | undefined
): AssessmentItemWriteBlockCode | null {
  if (!item) return null;

  const status = normalizeAssessmentItemStatus(item.status);

  if (status === "LOCKED" || item.lockedAt) return "ITEM_LOCKED";
  if (status === "PUBLISHED" || item.publishedAt) return "ITEM_PUBLISHED";

  return null;
}

export function assertAssessmentItemWritable(
  item: ItemStateLike | null | undefined
) {
  const block = getAssessmentItemWriteBlock(item);
  if (!block) return;

  const err = new Error(block) as Error & { status?: number };
  err.status = 409;
  throw err;
}

export function isAssessmentItemReadonly(
  item: ItemStateLike | null | undefined
) {
  return getAssessmentItemWriteBlock(item) !== null;
}

/**
 * Score-entry guard:
 * Used when entering/updating learner scores.
 *
 * DRAFT      => scores allowed
 * PUBLISHED  => scores allowed
 * LOCKED     => scores blocked
 */
export function getAssessmentScoreWriteBlock(
  item: ItemStateLike | null | undefined
): AssessmentScoreWriteBlockCode | null {
  if (!item) return null;

  const status = normalizeAssessmentItemStatus(item.status);

  if (status === "LOCKED" || item.lockedAt) return "ITEM_LOCKED";

  return null;
}

export function assertAssessmentScoresWritable(
  item: ItemStateLike | null | undefined
) {
  const block = getAssessmentScoreWriteBlock(item);
  if (!block) return;

  const err = new Error(block) as Error & { status?: number };
  err.status = 409;
  throw err;
}

export function isAssessmentScoreReadonly(
  item: ItemStateLike | null | undefined
) {
  return getAssessmentScoreWriteBlock(item) !== null;
}