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