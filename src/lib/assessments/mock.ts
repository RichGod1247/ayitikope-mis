//src/lib/assessments/mock.ts
export type MockGrade = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export type MockClassroomLike = {
  id?: string | null;
  name?: string | null;
  grade?: string | null;
  arm?: string | null;
};

export type MockGradeResult = {
  score: number;
  percent: number;
  grade: MockGrade;
  label: string;
  remark: string;
  nextGrade: MockGrade | null;
  pointsToNextGrade: number | null;
};

export const MOCK_MAX_SCORE = 100;
export const MIN_MOCK_NUMBER = 1;
export const MAX_MOCK_NUMBER = 12;

export const CORE_BECE_SUBJECT_KEYS = [
  "ENGLISH",
  "MATHEMATICS",
  "MATHS",
  "INTEGRATEDSCIENCE",
  "SCIENCE",
  "SOCIALSTUDIES",
  "SOCIAL",
];

export function cleanMockStr(v: unknown) {
  return String(v ?? "").trim();
}

export function normalizeMockKey(v: unknown) {
  return cleanMockStr(v).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function sameMockSubject(a: unknown, b: unknown) {
  return normalizeMockKey(a) === normalizeMockKey(b);
}

export function normalizeMockLevelToken(raw: unknown): string | null {
  const s = cleanMockStr(raw).toUpperCase().replace(/\s+/g, " ");
  if (!s) return null;

  let m =
    s.match(/^JHS\s*([1-3])$/) ||
    s.match(/^JHS([1-3])$/) ||
    s.match(/^J\.?H\.?S\.?\s*([1-3])$/);

  if (m) return `JHS${m[1]}`;

  m =
    s.match(/^BASIC\s*([7-9])$/) ||
    s.match(/^BASIC([7-9])$/) ||
    s.match(/^B\s*([7-9])$/) ||
    s.match(/^B([7-9])$/) ||
    s.match(/^BS\s*([7-9])$/) ||
    s.match(/^BS([7-9])$/);

  if (m) {
    const n = Number(m[1]);
    return `JHS${n - 6}`;
  }

  return null;
}

export function mockClassroomLevelToken(classroom: MockClassroomLike | null | undefined) {
  return normalizeMockLevelToken(classroom?.grade) ?? normalizeMockLevelToken(classroom?.name);
}

export function isJhs3MockClassroom(classroom: MockClassroomLike | null | undefined) {
  return mockClassroomLevelToken(classroom) === "JHS3";
}

export function isValidMockNumber(n: unknown) {
  const x = Number(n);
  return Number.isInteger(x) && x >= MIN_MOCK_NUMBER && x <= MAX_MOCK_NUMBER;
}

export function ordinalNumber(n: number) {
  const x = Number(n);

  if (!Number.isInteger(x)) return String(n);

  const mod100 = x % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${x}th`;

  switch (x % 10) {
    case 1:
      return `${x}st`;
    case 2:
      return `${x}nd`;
    case 3:
      return `${x}rd`;
    default:
      return `${x}th`;
  }
}

export function mockLabel(mockNumber: number) {
  return `${ordinalNumber(mockNumber)} Mock`;
}

export function defaultMockTitle(args: {
  academicYear: string;
  mockNumber: number;
}) {
  return `${args.academicYear} BECE ${mockLabel(args.mockNumber)}`;
}

export function mockGradeFromScore(scoreInput: unknown): MockGradeResult | null {
  const score = Number(scoreInput);

  if (!Number.isFinite(score) || score < 0 || score > MOCK_MAX_SCORE) {
    return null;
  }

  const percent = score;

  if (percent >= 90) {
    return {
      score,
      percent,
      grade: 1,
      label: "Grade 1",
      remark: "Excellent",
      nextGrade: null,
      pointsToNextGrade: null,
    };
  }

  if (percent >= 80) {
    return {
      score,
      percent,
      grade: 2,
      label: "Grade 2",
      remark: "Very good",
      nextGrade: 1,
      pointsToNextGrade: round1(90 - percent),
    };
  }

  if (percent >= 70) {
    return {
      score,
      percent,
      grade: 3,
      label: "Grade 3",
      remark: "Good",
      nextGrade: 2,
      pointsToNextGrade: round1(80 - percent),
    };
  }

  if (percent >= 60) {
    return {
      score,
      percent,
      grade: 4,
      label: "Grade 4",
      remark: "Credit",
      nextGrade: 3,
      pointsToNextGrade: round1(70 - percent),
    };
  }

  if (percent >= 55) {
    return {
      score,
      percent,
      grade: 5,
      label: "Grade 5",
      remark: "Credit",
      nextGrade: 4,
      pointsToNextGrade: round1(60 - percent),
    };
  }

  if (percent >= 50) {
    return {
      score,
      percent,
      grade: 6,
      label: "Grade 6",
      remark: "Credit",
      nextGrade: 5,
      pointsToNextGrade: round1(55 - percent),
    };
  }

  if (percent >= 45) {
    return {
      score,
      percent,
      grade: 7,
      label: "Grade 7",
      remark: "Pass",
      nextGrade: 6,
      pointsToNextGrade: round1(50 - percent),
    };
  }

  if (percent >= 40) {
    return {
      score,
      percent,
      grade: 8,
      label: "Grade 8",
      remark: "Weak pass",
      nextGrade: 7,
      pointsToNextGrade: round1(45 - percent),
    };
  }

  return {
    score,
    percent,
    grade: 9,
    label: "Grade 9",
    remark: "Critical risk",
    nextGrade: 8,
    pointsToNextGrade: round1(40 - percent),
  };
}

export function readinessBandFromAverage(percentInput: unknown) {
  if (percentInput == null || percentInput === "") {
    return {
      code: "NO_DATA",
      label: "No data",
      tone: "NEUTRAL",
      action: "Enter mock scores before readiness can be estimated.",
    };
  }

  const percent = Number(percentInput);

  if (!Number.isFinite(percent)) {
    return {
      code: "NO_DATA",
      label: "No data",
      tone: "NEUTRAL",
      action: "Enter mock scores before readiness can be estimated.",
    };
  }

  if (percent >= 80) {
    return {
      code: "EXCELLENT",
      label: "Excellent BECE readiness",
      tone: "READY",
      action: "Protect consistency and push for Grade 1–2 stability.",
    };
  }

  if (percent >= 70) {
    return {
      code: "COMPETITIVE",
      label: "Competitive readiness",
      tone: "READY",
      action: "Focus on turning good subjects into Grade 1–2 results.",
    };
  }

  if (percent >= 60) {
    return {
      code: "MODERATE",
      label: "Moderate readiness",
      tone: "WATCH",
      action: "Target weak core subjects before the next mock.",
    };
  }

  if (percent >= 50) {
    return {
      code: "AT_RISK",
      label: "At risk",
      tone: "RISK",
      action: "Assign urgent remedial work and weekly progress checks.",
    };
  }

  return {
    code: "CRITICAL",
    label: "Critical BECE risk",
    tone: "CRITICAL",
    action: "Escalate immediately: daily core-subject intervention is needed.",
  };
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

export type MockSubjectGradeInput = {
  subject: string;
  score?: number | null;
  grade?: number | null;
};

export type MockAggregateSubject = {
  subject: string;
  canonicalSubject: string;
  grade: MockGrade;
  score: number | null;
};

export type MockAggregateResult = {
  ok: boolean;
  aggregate: number | null;
  usedSubjects: MockAggregateSubject[];
  missingSubjects: string[];
  selectedElectives: MockAggregateSubject[];
  availableElectives: MockAggregateSubject[];
  reason: string | null;
};

export const MOCK_CORE_SUBJECTS = [
  "ENGLISH",
  "MATHEMATICS",
  "SCIENCE",
  "SOCIAL",
] as const;

export const MOCK_SCHOOL_AGGREGATE_SUBJECTS = [
  "ENGLISH",
  "MATHEMATICS",
  "SCIENCE",
  "SOCIAL",
  "RME",
  "GHANAIAN_LANGUAGE",
] as const;

export const MOCK_SUBJECT_LABELS: Record<string, string> = {
  ENGLISH: "English",
  MATHEMATICS: "Mathematics",
  SCIENCE: "Science",
  SOCIAL: "Social Studies",
  RME: "RME",
  GHANAIAN_LANGUAGE: "Ghanaian Language",
  EWE: "Ewe",
  CREATIVE_ARTS: "Creative Arts",
  COMPUTING: "Computing",
  CAREER_TECH: "Career Technology",
};

export function canonicalMockSubject(raw: unknown) {
  const key = normalizeMockKey(raw);

  if (
    key === "ENGLISH" ||
    key === "ENGLISHLANGUAGE" ||
    key === "ENG"
  ) {
    return "ENGLISH";
  }

  if (
    key === "MATHEMATICS" ||
    key === "MATHS" ||
    key === "MATH"
  ) {
    return "MATHEMATICS";
  }

  if (
    key === "SCIENCE" ||
    key === "INTEGRATEDSCIENCE" ||
    key === "INTSCIENCE"
  ) {
    return "SCIENCE";
  }

  if (
    key === "SOCIAL" ||
    key === "SOCIALSTUDIES" ||
    key === "SOCIALSTUDY"
  ) {
    return "SOCIAL";
  }

  if (
    key === "RME" ||
    key === "RELIGIOUSANDMORALEDUCATION" ||
    key === "RELIGIOUSMORALEDUCATION"
  ) {
    return "RME";
  }

  if (
    key === "EWE" ||
    key === "GHANAIANLANGUAGE" ||
    key === "GHANAIANLANG" ||
    key === "GHANALANGUAGE"
  ) {
    return "GHANAIAN_LANGUAGE";
  }

  if (
    key === "CREATIVEARTS" ||
    key === "CARTS" ||
    key === "CA"
  ) {
    return "CREATIVE_ARTS";
  }

  if (
    key === "COMPUTING" ||
    key === "COMP" ||
    key === "ICT"
  ) {
    return "COMPUTING";
  }

  if (
    key === "CAREERTECHNOLOGY" ||
    key === "CAREERTECH" ||
    key === "CTECH" ||
    key === "CATECH"
  ) {
    return "CAREER_TECH";
  }

  return key || "UNKNOWN";
}

export function mockSubjectLabel(canonicalSubject: string) {
  return MOCK_SUBJECT_LABELS[canonicalSubject] ?? canonicalSubject;
}

function gradeFromSubjectInput(input: MockSubjectGradeInput): MockGrade | null {
  const directGrade = Number(input.grade);

  if (
    Number.isInteger(directGrade) &&
    directGrade >= 1 &&
    directGrade <= 9
  ) {
    return directGrade as MockGrade;
  }

  const derived = mockGradeFromScore(input.score);
  return derived?.grade ?? null;
}

function scoredSubjects(inputs: MockSubjectGradeInput[]) {
  const byCanonical = new Map<string, MockAggregateSubject>();

  for (const input of inputs) {
    const subject = cleanMockStr(input.subject);
    if (!subject) continue;

    const canonicalSubject = canonicalMockSubject(subject);
    const grade = gradeFromSubjectInput(input);
    if (!grade) continue;

    const score =
      input.score == null || !Number.isFinite(Number(input.score))
        ? null
        : Number(input.score);

    const existing = byCanonical.get(canonicalSubject);

    // Lower grade is better. If duplicate subject evidence exists, keep the stronger valid signal.
    if (!existing || grade < existing.grade) {
      byCanonical.set(canonicalSubject, {
        subject,
        canonicalSubject,
        grade,
        score,
      });
    }
  }

  return Array.from(byCanonical.values());
}

export function isMockCoreSubject(subject: string) {
  return MOCK_CORE_SUBJECTS.includes(subject as (typeof MOCK_CORE_SUBJECTS)[number]);
}

export function calculateSchoolMockAggregate(inputs: MockSubjectGradeInput[]): MockAggregateResult {
  const scored = scoredSubjects(inputs);
  const byCanonical = new Map(scored.map((item) => [item.canonicalSubject, item]));

  const usedSubjects: MockAggregateSubject[] = [];
  const missingSubjects: string[] = [];

  for (const subject of MOCK_SCHOOL_AGGREGATE_SUBJECTS) {
    const found = byCanonical.get(subject);
    if (found) usedSubjects.push(found);
    else missingSubjects.push(mockSubjectLabel(subject));
  }

  if (missingSubjects.length > 0) {
    return {
      ok: false,
      aggregate: null,
      usedSubjects,
      missingSubjects,
      selectedElectives: [],
      availableElectives: scored.filter(
        (item) => !isMockCoreSubject(item.canonicalSubject)
      ),
      reason: "SCHOOL_AGGREGATE_INCOMPLETE",
    };
  }

  return {
    ok: true,
    aggregate: usedSubjects.reduce((sum, item) => sum + item.grade, 0),
    usedSubjects,
    missingSubjects: [],
    selectedElectives: [],
    availableElectives: scored.filter(
      (item) => !isMockCoreSubject(item.canonicalSubject)
    ),
    reason: null,
  };
}

export function calculatePlacementMockAggregate(inputs: MockSubjectGradeInput[]): MockAggregateResult {
  const scored = scoredSubjects(inputs);
  const byCanonical = new Map(scored.map((item) => [item.canonicalSubject, item]));

  const coreSubjects: MockAggregateSubject[] = [];
  const missingSubjects: string[] = [];

  for (const subject of MOCK_CORE_SUBJECTS) {
    const found = byCanonical.get(subject);
    if (found) coreSubjects.push(found);
    else missingSubjects.push(mockSubjectLabel(subject));
  }

  const availableElectives = scored
    .filter((item) => !isMockCoreSubject(item.canonicalSubject))
    .sort((a, b) => {
      if (a.grade !== b.grade) return a.grade - b.grade;
      return (b.score ?? -1) - (a.score ?? -1);
    });

  const selectedElectives = availableElectives.slice(0, 2);

  if (missingSubjects.length > 0 || selectedElectives.length < 2) {
    return {
      ok: false,
      aggregate: null,
      usedSubjects: [...coreSubjects, ...selectedElectives],
      missingSubjects: [
        ...missingSubjects,
        ...(selectedElectives.length < 2
          ? [`${2 - selectedElectives.length} more elective subject(s)`]
          : []),
      ],
      selectedElectives,
      availableElectives,
      reason: "PLACEMENT_AGGREGATE_INCOMPLETE",
    };
  }

  const usedSubjects = [...coreSubjects, ...selectedElectives];

  return {
    ok: true,
    aggregate: usedSubjects.reduce((sum, item) => sum + item.grade, 0),
    usedSubjects,
    missingSubjects: [],
    selectedElectives,
    availableElectives,
    reason: null,
  };
}

export function readinessBandFromAggregate(aggregateInput: unknown) {
  if (aggregateInput == null || aggregateInput === "") {
    return {
      code: "INCOMPLETE",
      label: "Incomplete evidence",
      tone: "NEUTRAL",
      action: "Enter all required mock subject scores before readiness can be estimated.",
    };
  }

  const aggregate = Number(aggregateInput);

  if (!Number.isFinite(aggregate)) {
    return {
      code: "INCOMPLETE",
      label: "Incomplete evidence",
      tone: "NEUTRAL",
      action: "Enter all required mock subject scores before readiness can be estimated.",
    };
  }

  if (aggregate <= 12) {
    return {
      code: "READY_STRONG",
      label: "Strong BECE readiness",
      tone: "READY",
      action: "Protect consistency and target Grade 1–2 stability.",
    };
  }

  if (aggregate <= 18) {
    return {
      code: "READY_MONITOR",
      label: "Competitive but monitor closely",
      tone: "WATCH",
      action: "Push weak subjects upward before the next mock.",
    };
  }

  if (aggregate <= 24) {
    return {
      code: "DEVELOPING",
      label: "Developing readiness",
      tone: "WATCH",
      action: "Assign focused revision for core and weakest elective subjects.",
    };
  }

  if (aggregate <= 30) {
    return {
      code: "AT_RISK",
      label: "At risk",
      tone: "RISK",
      action: "Begin urgent weekly intervention and parent follow-up.",
    };
  }

  return {
    code: "CRITICAL",
    label: "Critical BECE risk",
    tone: "CRITICAL",
    action: "Escalate immediately with daily remedial intervention.",
  };
}