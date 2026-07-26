// src/lib/appraisals/directorFeedbackAnalysis.ts
import {
  APPRAISAL_INSTRUMENT_CODES,
  APPRAISAL_INSTRUMENT_DEFINITIONS,
} from "@/lib/appraisals/instruments";

export const DIRECTOR_FEEDBACK_ANALYSIS_POLICY = {
  instrumentCode:
    APPRAISAL_INSTRUMENT_CODES.DIRECTOR_GOVERNANCE_APPRAISAL_V1,
  instrumentVersion: 1,
  expectedSectionCount: 7,
  expectedItemCount: 35,
  scaleMin: 1,
  scaleMax: 5,
  rawResponseAccessed: false,
  respondentIdentityIncluded: false,
  schoolIdentityIncluded: false,
  scoreFrequencyDistributionAvailable: false,
  presentationBandsAreDevelopmentalOnly: true,
} as const;

export type DirectorFeedbackDevelopmentBand =
  | "STRONG"
  | "GENERALLY_POSITIVE"
  | "DEVELOPMENT_NEEDED"
  | "PRIORITY_ATTENTION"
  | "NO_DATA";

export type DirectorFeedbackDevelopmentGuide = {
  band: DirectorFeedbackDevelopmentBand;
  label: string;
  minimumPercentage: number | null;
  maximumPercentage: number | null;
  interpretation: string;
};

export type DirectorFeedbackAnalysisItem = {
  itemKey: string;
  itemLabel: string;
  itemOrder: number;
  maxScore: number;
  averageScore: number | null;
  averagePercentage: number | null;
  validResponses: number;
  notApplicableResponses: number;
  band: DirectorFeedbackDevelopmentBand;
  bandLabel: string;
};

export type DirectorFeedbackAnalysisSection = {
  sectionKey: string;
  sectionTitle: string;
  sectionOrder: number;
  maxScore: number;
  averagePercentage: number | null;
  validResponses: number;
  band: DirectorFeedbackDevelopmentBand;
  bandLabel: string;
  interpretation: string;
  strongestItemKey: string | null;
  lowestItemKey: string | null;
  items: DirectorFeedbackAnalysisItem[];
};

export type DirectorFeedbackAnalysis = {
  instrument: {
    code: typeof DIRECTOR_FEEDBACK_ANALYSIS_POLICY.instrumentCode;
    version: 1;
    title: string;
    sectionCount: 7;
    itemCount: 35;
    scale: {
      minimum: 1;
      maximum: 5;
      notApplicableAllowed: true;
      labels: {
        1: "Very Poor";
        2: "Poor";
        3: "Acceptable";
        4: "Good";
        5: "Very Good";
      };
    };
  };
  overall: {
    percentage: number | null;
    band: DirectorFeedbackDevelopmentBand;
    bandLabel: string;
    interpretation: string;
  };
  participation: {
    eligibleResponses: number;
    finalizedResponses: number;
    expiredResponses: number;
    participationPercentage: number | null;
  };
  evidence: {
    snapshotVersion: number;
    generatedAt: string;
    sourceFingerprint: string;
    municipalBand: "BLOCKED" | "LIMITED" | "PREFERRED";
  };
  guide: DirectorFeedbackDevelopmentGuide[];
  strongestSectionKey: string | null;
  lowestSectionKey: string | null;
  sections: DirectorFeedbackAnalysisSection[];
  limitations: {
    individualAnswersAvailable: false;
    scoreFrequencyDistributionAvailable: false;
    rawResponsesQueried: false;
    presentationBandsAreOfficialGrades: false;
  };
};

type JsonRecord = Record<string, unknown>;

export type BuildDirectorFeedbackAnalysisInput = {
  canViewScores: boolean;
  overallPercentage: number | null;
  sectionAveragesJson: unknown;
  itemAveragesJson: unknown;
  eligibleResponses: number;
  finalizedResponses: number;
  expiredResponses: number;
  snapshotVersion: number;
  generatedAt: string;
  sourceFingerprint: string;
  municipalBand: "BLOCKED" | "LIMITED" | "PREFERRED";
};

const DEVELOPMENT_GUIDE: DirectorFeedbackDevelopmentGuide[] = [
  {
    band: "STRONG",
    label: "Strong",
    minimumPercentage: 80,
    maximumPercentage: 100,
    interpretation:
      "Responses indicate a consistent leadership strength. Preserve the practice and document what is working.",
  },
  {
    band: "GENERALLY_POSITIVE",
    label: "Generally positive",
    minimumPercentage: 60,
    maximumPercentage: 79.99,
    interpretation:
      "Responses are positive overall, with room to make the practice more consistent across the jurisdiction.",
  },
  {
    band: "DEVELOPMENT_NEEDED",
    label: "Development needed",
    minimumPercentage: 40,
    maximumPercentage: 59.99,
    interpretation:
      "The area needs a clear improvement action, ownership and a date for checking progress.",
  },
  {
    band: "PRIORITY_ATTENTION",
    label: "Priority attention",
    minimumPercentage: 0,
    maximumPercentage: 39.99,
    interpretation:
      "The area requires prompt leadership attention and practical corrective support.",
  },
  {
    band: "NO_DATA",
    label: "No valid data",
    minimumPercentage: null,
    maximumPercentage: null,
    interpretation:
      "No valid aggregate score is available. Do not draw a conclusion from this item or section.",
  },
];

function objectValue(value: unknown): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as JsonRecord;
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function numeric(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function integer(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isInteger(number) ? number : fallback;
}

function round1(value: number) {
  return Number(value.toFixed(1));
}

function bandFor(percentage: number | null): DirectorFeedbackDevelopmentGuide {
  if (percentage == null) {
    return DEVELOPMENT_GUIDE.find((entry) => entry.band === "NO_DATA")!;
  }
  if (percentage >= 80) {
    return DEVELOPMENT_GUIDE.find((entry) => entry.band === "STRONG")!;
  }
  if (percentage >= 60) {
    return DEVELOPMENT_GUIDE.find(
      (entry) => entry.band === "GENERALLY_POSITIVE",
    )!;
  }
  if (percentage >= 40) {
    return DEVELOPMENT_GUIDE.find(
      (entry) => entry.band === "DEVELOPMENT_NEEDED",
    )!;
  }
  return DEVELOPMENT_GUIDE.find(
    (entry) => entry.band === "PRIORITY_ATTENTION",
  )!;
}

function rankedKey<T extends { key: string; percentage: number | null }>(
  rows: T[],
  direction: "HIGH" | "LOW",
) {
  const valid = rows.filter(
    (row): row is T & { percentage: number } => row.percentage != null,
  );
  if (!valid.length) return null;

  valid.sort((left, right) =>
    direction === "HIGH"
      ? right.percentage - left.percentage || left.key.localeCompare(right.key)
      : left.percentage - right.percentage || left.key.localeCompare(right.key),
  );

  return valid[0]?.key ?? null;
}

export function buildDirectorFeedbackAnalysis(
  input: BuildDirectorFeedbackAnalysisInput,
): DirectorFeedbackAnalysis | null {
  if (!input.canViewScores || input.municipalBand === "BLOCKED") return null;

  const instrument =
    APPRAISAL_INSTRUMENT_DEFINITIONS[
      APPRAISAL_INSTRUMENT_CODES.DIRECTOR_GOVERNANCE_APPRAISAL_V1
    ];
  const sectionRows = objectValue(input.sectionAveragesJson);
  const itemRows = objectValue(input.itemAveragesJson);

  const sections = instrument.sections.map((section) => {
    const sectionAggregate = objectValue(sectionRows[section.key]);
    const sectionPercentage = numeric(sectionAggregate.averagePercentage);
    const sectionBand = bandFor(sectionPercentage);

    const items = section.items.map((item): DirectorFeedbackAnalysisItem => {
      const itemAggregate = objectValue(itemRows[item.key]);
      const averageScore = numeric(itemAggregate.averageScore);
      const averagePercentage = numeric(itemAggregate.averagePercentage);
      const itemBand = bandFor(averagePercentage);

      return {
        itemKey: item.key,
        itemLabel: item.label,
        itemOrder: item.order,
        maxScore: item.maxScore,
        averageScore,
        averagePercentage,
        validResponses: Math.max(0, integer(itemAggregate.validResponses)),
        notApplicableResponses: Math.max(
          0,
          integer(itemAggregate.notApplicableResponses),
        ),
        band: itemBand.band,
        bandLabel: itemBand.label,
      };
    });

    return {
      sectionKey: section.key,
      sectionTitle: section.title,
      sectionOrder: section.order,
      maxScore: section.maxScore,
      averagePercentage: sectionPercentage,
      validResponses: Math.max(0, integer(sectionAggregate.validResponses)),
      band: sectionBand.band,
      bandLabel: sectionBand.label,
      interpretation: sectionBand.interpretation,
      strongestItemKey: rankedKey(
        items.map((item) => ({
          key: item.itemKey,
          percentage: item.averagePercentage,
        })),
        "HIGH",
      ),
      lowestItemKey: rankedKey(
        items.map((item) => ({
          key: item.itemKey,
          percentage: item.averagePercentage,
        })),
        "LOW",
      ),
      items,
    } satisfies DirectorFeedbackAnalysisSection;
  });

  const overallBand = bandFor(input.overallPercentage);
  const participationPercentage =
    input.eligibleResponses > 0
      ? round1((input.finalizedResponses / input.eligibleResponses) * 100)
      : null;

  return {
    instrument: {
      code: DIRECTOR_FEEDBACK_ANALYSIS_POLICY.instrumentCode,
      version: 1,
      title: instrument.documentTitle,
      sectionCount: 7,
      itemCount: 35,
      scale: {
        minimum: 1,
        maximum: 5,
        notApplicableAllowed: true,
        labels: {
          1: "Very Poor",
          2: "Poor",
          3: "Acceptable",
          4: "Good",
          5: "Very Good",
        },
      },
    },
    overall: {
      percentage: input.overallPercentage,
      band: overallBand.band,
      bandLabel: overallBand.label,
      interpretation: overallBand.interpretation,
    },
    participation: {
      eligibleResponses: input.eligibleResponses,
      finalizedResponses: input.finalizedResponses,
      expiredResponses: input.expiredResponses,
      participationPercentage,
    },
    evidence: {
      snapshotVersion: input.snapshotVersion,
      generatedAt: input.generatedAt,
      sourceFingerprint: clean(input.sourceFingerprint),
      municipalBand: input.municipalBand,
    },
    guide: DEVELOPMENT_GUIDE.map((entry) => ({ ...entry })),
    strongestSectionKey: rankedKey(
      sections.map((section) => ({
        key: section.sectionKey,
        percentage: section.averagePercentage,
      })),
      "HIGH",
    ),
    lowestSectionKey: rankedKey(
      sections.map((section) => ({
        key: section.sectionKey,
        percentage: section.averagePercentage,
      })),
      "LOW",
    ),
    sections,
    limitations: {
      individualAnswersAvailable: false,
      scoreFrequencyDistributionAvailable: false,
      rawResponsesQueried: false,
      presentationBandsAreOfficialGrades: false,
    },
  };
}
