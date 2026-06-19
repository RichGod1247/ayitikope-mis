// src/lib/assessments/itemWriteGuard.ts
import {
  getAssessmentItemWriteBlock as getCanonicalAssessmentItemWriteBlock,
  normalizeAssessmentItemStatus as normalizeCanonicalAssessmentItemStatus,
} from "@/lib/assessments/itemWriteState";

type ItemWriteState = {
  status?: string | null;
  publishedAt?: Date | string | null;
  lockedAt?: Date | string | null;
};

export type AssessmentItemWriteBlock =
  | {
      ok: false;
      error: "ITEM_ALREADY_PUBLISHED";
      message: string;
      status: string;
    }
  | {
      ok: false;
      error: "ITEM_ALREADY_LOCKED";
      message: string;
      status: string;
    }
  | {
      ok: true;
      status: string;
    };

export function normalizeAssessmentItemStatus(raw: unknown) {
  return normalizeCanonicalAssessmentItemStatus(raw);
}

/**
 * Compatibility shell only.
 *
 * Canonical write-state logic now lives in:
 * src/lib/assessments/itemWriteState.ts
 */
export function getAssessmentItemWriteBlock(
  item: ItemWriteState
): AssessmentItemWriteBlock {
  const status = normalizeCanonicalAssessmentItemStatus(item.status);
  const block = getCanonicalAssessmentItemWriteBlock(item);

  if (block === "ITEM_LOCKED") {
    return {
      ok: false,
      error: "ITEM_ALREADY_LOCKED",
      message:
        "This assessment item is locked and can no longer be edited or scored.",
      status: "LOCKED",
    };
  }

  if (block === "ITEM_PUBLISHED") {
    return {
      ok: false,
      error: "ITEM_ALREADY_PUBLISHED",
      message:
        "This assessment item has been published and must be reopened before editing or scoring.",
      status: "PUBLISHED",
    };
  }

  return {
    ok: true,
    status,
  };
}