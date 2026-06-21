//src/lib/assessments/categories.ts
export type AssessmentCategoryCode =
  | "EXERCISE"
  | "HOMEWORK"
  | "QUIZ"
  | "CLASS_TEST"
  | "GROUP_WORK"
  | "PROJECT"
  | "PRACTICAL"
  | "EXAM"
  | "OTHER";

export type AssessmentCategoryDef = {
  code: AssessmentCategoryCode;
  label: string;
  aliases: string[];
  orderIndex: number;
};

export const ASSESSMENT_CATEGORIES: AssessmentCategoryDef[] = [
  {
    code: "EXERCISE",
    label: "Exercise",
    aliases: ["EXER", "EXERCISE", "CLASS_EXERCISE", "WRITTEN_EXERCISE"],
    orderIndex: 10,
  },
  {
    code: "HOMEWORK",
    label: "Homework",
    aliases: ["HOMEWORK", "HOME_WORK", "TAKE_HOME", "ASSIGNMENT"],
    orderIndex: 20,
  },
  {
    code: "QUIZ",
    label: "Quiz",
    aliases: ["QUIZ", "QUICK_TEST", "SHORT_TEST"],
    orderIndex: 30,
  },
  {
    code: "CLASS_TEST",
    label: "Class Test",
    aliases: ["CLASS_TEST", "TEST", "CLASSWORK", "CLASS_WORK", "CA_TEST"],
    orderIndex: 40,
  },
  {
    code: "GROUP_WORK",
    label: "Group Work",
    aliases: ["GROUP_WORK", "GROUPWORK", "GROUP_ACTIVITY", "GROUP_PROJECT"],
    orderIndex: 50,
  },
  {
    code: "PROJECT",
    label: "Project",
    aliases: ["PROJECT", "PROJECT_WORK", "INDIVIDUAL_PROJECT"],
    orderIndex: 60,
  },
  {
    code: "PRACTICAL",
    label: "Practical",
    aliases: ["PRACTICAL", "PRACTICAL_WORK", "PRACTICALS"],
    orderIndex: 70,
  },
  {
    code: "EXAM",
    label: "Exam",
    aliases: ["EXAM", "EXAMS", "EXAMINATION", "END_OF_TERM_EXAM"],
    orderIndex: 80,
  },
  {
    code: "OTHER",
    label: "Other",
    aliases: ["OTHER", "MISC", "MISCELLANEOUS"],
    orderIndex: 90,
  },
];

function clean(v: unknown) {
  return String(v ?? "").trim();
}

function canonicalToken(v: unknown) {
  return clean(v).toUpperCase().replace(/[-\s]+/g, "_").replace(/[^A-Z0-9_]/g, "");
}

export function normalizeAssessmentCategory(input: unknown): AssessmentCategoryCode {
  const token = canonicalToken(input);

  if (!token) return "OTHER";

  for (const category of ASSESSMENT_CATEGORIES) {
    if (category.code === token) return category.code;
    if (category.aliases.some((alias) => canonicalToken(alias) === token)) {
      return category.code;
    }
  }

  return "OTHER";
}

export function isAssessmentCategoryCode(input: unknown): input is AssessmentCategoryCode {
  const token = canonicalToken(input);
  return ASSESSMENT_CATEGORIES.some((category) => category.code === token);
}

export function assessmentCategoryLabel(input: unknown) {
  const code = normalizeAssessmentCategory(input);
  return ASSESSMENT_CATEGORIES.find((category) => category.code === code)?.label ?? "Other";
}

export function assessmentCategoryOrder(input: unknown) {
  const code = normalizeAssessmentCategory(input);
  return ASSESSMENT_CATEGORIES.find((category) => category.code === code)?.orderIndex ?? 999;
}