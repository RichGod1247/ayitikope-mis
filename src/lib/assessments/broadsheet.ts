//src/lib/assessments/broadsheet.ts
import type { AssessmentItemStatus } from "@prisma/client";
import {
  AssessmentPolicyLite,
  gradeFromPolicy,
} from "@/lib/assessments/policy";
import { normalizeAssessmentCategory } from "@/lib/assessments/categories";

export type BroadsheetItemInput = {
  id: string;
  subject: string;
  title: string;
  type: string;
  maxScore: number;
  weighting: number | null;
  status: AssessmentItemStatus | string;
  componentCode: string | null;
  policyComponentId: string | null;
  sortOrder: number | null;
  isRequired: boolean;
};

export type BroadsheetStudentInput = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  otherNames?: string | null;
  sex?: string | null;
  gender?: string | null;
};

export type BroadsheetScoreInput = {
  itemId: string;
  studentId: string;
  score: number;
  comment: string | null;
};

export type BroadsheetComponent = {
  code: string;
  label: string;
  kind: string;
  maxScore: number;
  weightPercent: number;
  required: boolean;
  orderIndex: number;
  itemId: string | null;
  itemTitle: string | null;
  itemStatus: string | null;
  itemCount: number;
};

export type BroadsheetEvidenceCandidate = {
  itemId: string;
  itemTitle: string;
  itemStatus: string;
  score: number;
  maxScore: number;
  normalizedScore: number;
  weightedScore: number;
  weightPercent: number;
  comment: string | null;
  readonly: boolean;
};

export type BroadsheetCell = {
  componentCode: string;
  itemId: string | null;
  score: number | null;
  maxScore: number;
  weightedScore: number | null;
  weightPercent: number;
  missing: boolean;
  readonly: boolean;
  comment: string | null;

  /**
   * A14.2C evidence trace:
   * - evidenceCount = how many scored evidences existed for this learner/category.
   * - candidateItemCount = how many assessment items existed for this category.
   * - selectedEvidence = the highest normalized evidence selected into the broadsheet.
   */
  evidenceCount: number;
  candidateItemCount: number;
  selectedEvidence: BroadsheetEvidenceCandidate | null;
  evidenceCandidates: BroadsheetEvidenceCandidate[];
};

export type BroadsheetLearnerRow = {
  studentId: string;
  name: string;
  sex: string;
  cells: BroadsheetCell[];
  rawTotal: number;
  rawMaxTotal: number;
  weightedTotal: number;
  totalPercent: number | null;
  grade: string | null;
  gradeLabel: string | null;
  remark: string | null;
  position: number | null;
  missingRequiredCount: number;
  missingOptionalCount: number;
  complete: boolean;
};

export type BroadsheetReadiness = {
  status: "READY" | "BLOCKED";
  score: number;
  learnerCount: number;
  componentCount: number;
  requiredComponentCount: number;
  totalRequiredCells: number;
  missingRequiredCells: number;
  missingOptionalCells: number;
  blockedReasons: string[];
};

export type BuildBroadsheetArgs = {
  policy: AssessmentPolicyLite;
  subject: string;
  students: BroadsheetStudentInput[];
  items: BroadsheetItemInput[];
  scores: BroadsheetScoreInput[];
};

function clean(v: unknown) {
  return String(v ?? "").trim();
}

function norm(v: unknown) {
  return clean(v).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function categoryNorm(v: unknown) {
  return norm(normalizeAssessmentCategory(v));
}

function displayName(student: BroadsheetStudentInput) {
  return [student.lastName, student.firstName, student.otherNames]
    .map(clean)
    .filter(Boolean)
    .join(" ")
    .trim();
}

function itemStatusReadonly(status: unknown) {
  const s = clean(status).toUpperCase();
  return s === "LOCKED";
}

function percentFromWeighted(weightedTotal: number, totalWeight: number) {
  if (
    !Number.isFinite(weightedTotal) ||
    !Number.isFinite(totalWeight) ||
    totalWeight <= 0
  ) {
    return null;
  }

  return (weightedTotal / totalWeight) * 100;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function rankRows(rows: BroadsheetLearnerRow[]) {
  const completeRows = rows
    .filter((r) => r.complete && r.totalPercent != null)
    .sort((a, b) => {
      const diff = Number(b.totalPercent ?? 0) - Number(a.totalPercent ?? 0);
      if (diff !== 0) return diff;
      return a.name.localeCompare(b.name);
    });

  let lastScore: number | null = null;
  let lastRank = 0;

  completeRows.forEach((row, index) => {
    const score = Number(row.totalPercent ?? 0);

    if (lastScore == null || score !== lastScore) {
      lastRank = index + 1;
      lastScore = score;
    }

    row.position = lastRank;
  });
}

function componentMatchesItem(args: {
  item: BroadsheetItemInput;
  componentId: string | null;
  componentCode: string;
}) {
  const componentCode = categoryNorm(args.componentCode);
  const itemComponentCode = categoryNorm(args.item.componentCode);
  const itemTypeCode = categoryNorm(args.item.type);

  if (args.componentId && args.item.policyComponentId === args.componentId) {
    return true;
  }

  return itemComponentCode === componentCode || itemTypeCode === componentCode;
}

function matchItemsToComponent(
  items: BroadsheetItemInput[],
  componentId: string | null,
  componentCode: string
) {
  return items
    .filter((item) => componentMatchesItem({ item, componentId, componentCode }))
    .slice()
    .sort((a, b) => {
      const sortA = Number(a.sortOrder ?? 0);
      const sortB = Number(b.sortOrder ?? 0);
      if (sortA !== sortB) return sortA - sortB;

      return clean(a.title).localeCompare(clean(b.title));
    });
}

function pickRepresentativeItem(items: BroadsheetItemInput[]) {
  return items[0] ?? null;
}

function buildEvidenceCandidate(args: {
  item: BroadsheetItemInput;
  score: BroadsheetScoreInput;
  componentMaxScore: number;
  weightPercent: number;
}): BroadsheetEvidenceCandidate | null {
  const rawScore = Number(args.score.score ?? 0);
  const itemMaxScore = Number(args.item.maxScore ?? 0);
  const componentMaxScore = Number(args.componentMaxScore ?? 0);
  const weightPercent = Number(args.weightPercent ?? 0);

  if (!Number.isFinite(rawScore) || !Number.isFinite(itemMaxScore) || itemMaxScore <= 0) {
    return null;
  }

  const normalizedScore = componentMaxScore > 0
    ? (rawScore / itemMaxScore) * componentMaxScore
    : rawScore;

  const weightedScore = weightPercent > 0
    ? (rawScore / itemMaxScore) * weightPercent
    : 0;

  return {
    itemId: args.item.id,
    itemTitle: args.item.title,
    itemStatus: String(args.item.status ?? ""),
    score: round2(rawScore),
    maxScore: round2(itemMaxScore),
    normalizedScore: round2(normalizedScore),
    weightedScore: round2(weightedScore),
    weightPercent: round2(weightPercent),
    comment: args.score.comment ?? null,
    readonly: itemStatusReadonly(args.item.status),
  };
}

function pickBestEvidence(candidates: BroadsheetEvidenceCandidate[]) {
  if (!candidates.length) return null;

  return candidates
    .slice()
    .sort((a, b) => {
      const normalizedDiff = b.normalizedScore - a.normalizedScore;
      if (normalizedDiff !== 0) return normalizedDiff;

      const weightedDiff = b.weightedScore - a.weightedScore;
      if (weightedDiff !== 0) return weightedDiff;

      return a.itemTitle.localeCompare(b.itemTitle);
    })[0];
}

export function buildSubjectBroadsheet(args: BuildBroadsheetArgs) {
  const { policy, subject, students, items, scores } = args;

  const relevantItems = items.filter(
    (item) => norm(item.subject) === norm(subject)
  );

  const components: BroadsheetComponent[] = policy.components.map((component) => {
    const matchedItems = matchItemsToComponent(
      relevantItems,
      component.id,
      component.code
    );
    const representative = pickRepresentativeItem(matchedItems);

    return {
      code: component.code,
      label: component.label,
      kind: component.kind,
      maxScore: component.maxScore,
      weightPercent: component.weightPercent,
      required: representative?.isRequired ?? component.required,
      orderIndex: component.orderIndex,
      itemId: representative?.id ?? null,
      itemTitle: representative?.title ?? null,
      itemStatus: representative?.status ? String(representative.status) : null,
      itemCount: matchedItems.length,
    };
  });

  const itemsByComponentCode = new Map<string, BroadsheetItemInput[]>();
  for (const component of policy.components) {
    const matchedItems = matchItemsToComponent(
      relevantItems,
      component.id,
      component.code
    );
    itemsByComponentCode.set(component.code, matchedItems);
  }

  const scoreByStudentItem = new Map<string, BroadsheetScoreInput>();
  for (const score of scores) {
    scoreByStudentItem.set(`${score.studentId}:${score.itemId}`, score);
  }

  const totalRequiredWeight = components
    .filter((c) => c.required)
    .reduce((sum, c) => sum + Number(c.weightPercent ?? 0), 0);

  const rows: BroadsheetLearnerRow[] = students.map((student) => {
    let rawTotal = 0;
    let rawMaxTotal = 0;
    let weightedTotal = 0;
    let missingRequiredCount = 0;
    let missingOptionalCount = 0;

    const cells: BroadsheetCell[] = components.map((component) => {
      const candidateItems = itemsByComponentCode.get(component.code) ?? [];
      const maxScore = Number(component.maxScore ?? 0);
      const weightPercent = Number(component.weightPercent ?? 0);

      const evidenceCandidates = candidateItems
        .map((item) => {
          const score = scoreByStudentItem.get(`${student.id}:${item.id}`);
          if (!score) return null;

          return buildEvidenceCandidate({
            item,
            score,
            componentMaxScore: maxScore,
            weightPercent,
          });
        })
        .filter((candidate): candidate is BroadsheetEvidenceCandidate => !!candidate);

      const selectedEvidence = pickBestEvidence(evidenceCandidates);
      const missing = selectedEvidence == null;
      const readonly = candidateItems.length
        ? candidateItems.every((item) => itemStatusReadonly(item.status))
        : false;

      if (missing) {
        if (component.required) missingRequiredCount += 1;
        else missingOptionalCount += 1;

        return {
          componentCode: component.code,
          itemId: null,
          score: null,
          maxScore,
          weightedScore: null,
          weightPercent,
          missing: true,
          readonly,
          comment: null,
          evidenceCount: 0,
          candidateItemCount: candidateItems.length,
          selectedEvidence: null,
          evidenceCandidates,
        };
      }

      rawTotal += selectedEvidence.normalizedScore;
      rawMaxTotal += maxScore;
      weightedTotal += selectedEvidence.weightedScore;

      return {
        componentCode: component.code,
        itemId: selectedEvidence.itemId,
        score: selectedEvidence.normalizedScore,
        maxScore,
        weightedScore: selectedEvidence.weightedScore,
        weightPercent,
        missing: false,
        readonly: selectedEvidence.readonly,
        comment: selectedEvidence.comment,
        evidenceCount: evidenceCandidates.length,
        candidateItemCount: candidateItems.length,
        selectedEvidence,
        evidenceCandidates,
      };
    });

    const complete = missingRequiredCount === 0;

    const totalPercent = complete
      ? percentFromWeighted(weightedTotal, totalRequiredWeight)
      : null;

    const grade = gradeFromPolicy(policy, totalPercent ?? null);

    return {
      studentId: student.id,
      name: displayName(student) || "Unnamed learner",
      sex: clean(student.sex || student.gender),
      cells,
      rawTotal: round2(rawTotal),
      rawMaxTotal: round2(rawMaxTotal),
      weightedTotal: round2(weightedTotal),
      totalPercent: totalPercent == null ? null : round2(totalPercent),
      grade: grade?.grade ?? null,
      gradeLabel: grade?.label ?? null,
      remark: grade?.remark ?? null,
      position: null,
      missingRequiredCount,
      missingOptionalCount,
      complete,
    };
  });

  rankRows(rows);

  const totalRequiredCells =
    students.length * components.filter((c) => c.required).length;

  const missingRequiredCells = rows.reduce(
    (sum, row) => sum + row.missingRequiredCount,
    0
  );

  const missingOptionalCells = rows.reduce(
    (sum, row) => sum + row.missingOptionalCount,
    0
  );

  const blockedReasons: string[] = [];

  if (students.length === 0) {
    blockedReasons.push("No active learners found for this class.");
  }

  if (components.length === 0) {
    blockedReasons.push("No assessment policy components found.");
  }

  const missingRequiredItems = components.filter(
    (c) => c.required && c.itemCount === 0
  );

  if (missingRequiredItems.length) {
    blockedReasons.push(
      `Missing required assessment items: ${missingRequiredItems
        .map((c) => c.label)
        .join(", ")}.`
    );
  }

  if (missingRequiredCells > 0) {
    blockedReasons.push(
      `${missingRequiredCells} required learner score cell(s) are missing.`
    );
  }

  const readinessPercent =
    totalRequiredCells > 0
      ? Math.max(
          0,
          Math.round(
            ((totalRequiredCells - missingRequiredCells) / totalRequiredCells) *
              100
          )
        )
      : 0;

  const readiness: BroadsheetReadiness = {
    status: blockedReasons.length ? "BLOCKED" : "READY",
    score: readinessPercent,
    learnerCount: students.length,
    componentCount: components.length,
    requiredComponentCount: components.filter((c) => c.required).length,
    totalRequiredCells,
    missingRequiredCells,
    missingOptionalCells,
    blockedReasons,
  };

  return {
    subject,
    components,
    rows,
    readiness,
  };
}