// src/lib/assessments/itemWriteGuard.ts

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
  return String(raw ?? "DRAFT").trim().toUpperCase() || "DRAFT";
}

export function getAssessmentItemWriteBlock(
  item: ItemWriteState
): AssessmentItemWriteBlock {
  const status = normalizeAssessmentItemStatus(item.status);

  if (status === "LOCKED" || !!item.lockedAt) {
    return {
      ok: false,
      error: "ITEM_ALREADY_LOCKED",
      message:
        "This assessment item is locked and can no longer be edited or scored.",
      status: "LOCKED",
    };
  }

  if (status === "PUBLISHED" || !!item.publishedAt) {
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