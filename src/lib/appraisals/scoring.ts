//src/lib/appraisals/scoring.ts
export type AppraisalScoreInput = {
  itemKey: string;
  sectionKey: string;
  sectionTitle: string;
  sectionOrder: number;
  score: number | null;
  notApplicable: boolean;
  itemMaxScore: number;
};

export type AppraisalSectionScore = {
  sectionKey: string;
  sectionTitle: string;
  sectionOrder: number;
  totalScore: number;
  maximumApplicableScore: number;
  percentage: number | null;
  answeredItems: number;
  notApplicableItems: number;
};

export type AppraisalScoreCalculation = {
  sections: AppraisalSectionScore[];
  sectionPercentages: Record<string, number | null>;
  overallPercentage: number | null;
  answeredItems: number;
  notApplicableItems: number;
};

export type AppraisalScoreErrorCode =
  | "DUPLICATE_ITEM_KEY"
  | "INVALID_ITEM_MAXIMUM"
  | "INVALID_SCORE"
  | "NOT_APPLICABLE_WITH_SCORE"
  | "INCOMPLETE_SCORES";

export type AppraisalScoreFailure = {
  ok: false;
  code: AppraisalScoreErrorCode;
  itemKeys: string[];
};

export type AppraisalScoreSuccess = {
  ok: true;
  value: AppraisalScoreCalculation;
};

function round2(value: number) {
  return Number(value.toFixed(2));
}

function average(values: number[]) {
  if (!values.length) return null;
  return round2(values.reduce((sum, value) => sum + value, 0) / values.length);
}

export function calculateAppraisalScores(
  rows: readonly AppraisalScoreInput[],
  options?: { requireComplete?: boolean },
): AppraisalScoreSuccess | AppraisalScoreFailure {
  const requireComplete = options?.requireComplete !== false;
  const seenItemKeys = new Set<string>();
  const duplicateItemKeys: string[] = [];
  const invalidMaximumKeys: string[] = [];
  const invalidScoreKeys: string[] = [];
  const notApplicableWithScoreKeys: string[] = [];
  const missingItemKeys: string[] = [];

  for (const row of rows) {
    if (seenItemKeys.has(row.itemKey)) duplicateItemKeys.push(row.itemKey);
    seenItemKeys.add(row.itemKey);

    if (!Number.isInteger(row.itemMaxScore) || row.itemMaxScore <= 0) {
      invalidMaximumKeys.push(row.itemKey);
      continue;
    }

    if (row.notApplicable) {
      if (row.score != null) notApplicableWithScoreKeys.push(row.itemKey);
      continue;
    }

    if (row.score == null) {
      if (requireComplete) missingItemKeys.push(row.itemKey);
      continue;
    }

    if (
      !Number.isInteger(row.score) ||
      row.score < 1 ||
      row.score > row.itemMaxScore
    ) {
      invalidScoreKeys.push(row.itemKey);
    }
  }

  if (duplicateItemKeys.length) {
    return { ok: false, code: "DUPLICATE_ITEM_KEY", itemKeys: duplicateItemKeys };
  }
  if (invalidMaximumKeys.length) {
    return {
      ok: false,
      code: "INVALID_ITEM_MAXIMUM",
      itemKeys: invalidMaximumKeys,
    };
  }
  if (invalidScoreKeys.length) {
    return { ok: false, code: "INVALID_SCORE", itemKeys: invalidScoreKeys };
  }
  if (notApplicableWithScoreKeys.length) {
    return {
      ok: false,
      code: "NOT_APPLICABLE_WITH_SCORE",
      itemKeys: notApplicableWithScoreKeys,
    };
  }
  if (missingItemKeys.length) {
    return {
      ok: false,
      code: "INCOMPLETE_SCORES",
      itemKeys: missingItemKeys,
    };
  }

  const grouped = new Map<
    string,
    {
      sectionKey: string;
      sectionTitle: string;
      sectionOrder: number;
      totalScore: number;
      maximumApplicableScore: number;
      answeredItems: number;
      notApplicableItems: number;
    }
  >();

  for (const row of rows) {
    const current = grouped.get(row.sectionKey) ?? {
      sectionKey: row.sectionKey,
      sectionTitle: row.sectionTitle,
      sectionOrder: row.sectionOrder,
      totalScore: 0,
      maximumApplicableScore: 0,
      answeredItems: 0,
      notApplicableItems: 0,
    };

    if (row.notApplicable) {
      current.notApplicableItems += 1;
    } else if (row.score != null) {
      current.totalScore += row.score;
      current.maximumApplicableScore += row.itemMaxScore;
      current.answeredItems += 1;
    }

    grouped.set(row.sectionKey, current);
  }

  const sections: AppraisalSectionScore[] = [...grouped.values()]
    .sort((a, b) => a.sectionOrder - b.sectionOrder)
    .map((section) => ({
      ...section,
      percentage:
        section.maximumApplicableScore > 0
          ? round2((section.totalScore / section.maximumApplicableScore) * 100)
          : null,
    }));

  const validSectionPercentages = sections
    .map((section) => section.percentage)
    .filter((value): value is number => value != null && Number.isFinite(value));

  return {
    ok: true,
    value: {
      sections,
      sectionPercentages: Object.fromEntries(
        sections.map((section) => [section.sectionKey, section.percentage]),
      ),
      overallPercentage: average(validSectionPercentages),
      answeredItems: sections.reduce((sum, section) => sum + section.answeredItems, 0),
      notApplicableItems: sections.reduce(
        (sum, section) => sum + section.notApplicableItems,
        0,
      ),
    },
  };
}

export type FinalizedAppraisalResponseInput = {
  responseId: string;
  scores: readonly AppraisalScoreInput[];
};

export type AppraisalResponseAggregate = {
  finalizedResponses: number;
  sectionAverages: Record<string, number | null>;
  itemAverages: Record<string, number | null>;
  overallPercentage: number | null;
};

export type AppraisalAggregateFailure = {
  ok: false;
  code: "INVALID_FINALIZED_RESPONSE" | "NO_FINALIZED_RESPONSES";
  responseId?: string;
  scoreFailure?: AppraisalScoreFailure;
};

export type AppraisalAggregateSuccess = {
  ok: true;
  value: AppraisalResponseAggregate;
};

/**
 * Staff-feedback aggregation rule:
 * 1. N/A rows are excluded.
 * 2. Each response section is calculated independently.
 * 3. A section result is the average of finalized response section percentages.
 * 4. Overall staff feedback is the average of the valid section results.
 * 5. Item averages use only answered, non-N/A rows.
 */
export function aggregateFinalizedAppraisalResponses(
  responses: readonly FinalizedAppraisalResponseInput[],
): AppraisalAggregateSuccess | AppraisalAggregateFailure {
  if (!responses.length) return { ok: false, code: "NO_FINALIZED_RESPONSES" };

  const sectionValues = new Map<string, number[]>();
  const itemValues = new Map<string, number[]>();

  for (const response of responses) {
    const calculated = calculateAppraisalScores(response.scores, {
      requireComplete: true,
    });

    if (!calculated.ok) {
      return {
        ok: false,
        code: "INVALID_FINALIZED_RESPONSE",
        responseId: response.responseId,
        scoreFailure: calculated,
      };
    }

    for (const section of calculated.value.sections) {
      if (section.percentage == null) continue;
      const values = sectionValues.get(section.sectionKey) ?? [];
      values.push(section.percentage);
      sectionValues.set(section.sectionKey, values);
    }

    for (const row of response.scores) {
      if (row.notApplicable || row.score == null) continue;
      const values = itemValues.get(row.itemKey) ?? [];
      values.push(row.score);
      itemValues.set(row.itemKey, values);
    }
  }

  const sectionAverages = Object.fromEntries(
    [...sectionValues.entries()].map(([key, values]) => [key, average(values)]),
  );

  const itemAverages = Object.fromEntries(
    [...itemValues.entries()].map(([key, values]) => [key, average(values)]),
  );

  const validSectionAverages = Object.values(sectionAverages).filter(
    (value): value is number => value != null && Number.isFinite(value),
  );

  return {
    ok: true,
    value: {
      finalizedResponses: responses.length,
      sectionAverages,
      itemAverages,
      overallPercentage: average(validSectionAverages),
    },
  };
}
