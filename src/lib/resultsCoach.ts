// src/lib/resultsCoach.ts

export type SubjectSummaryForCoach = {
  subjectName: string;
  totalScore: number; // learner's total marks for the term in this subject
  maxScore: number;   // maximum possible marks for the term in this subject
};

export type StudentResultsCoachInput = {
  learnerName?: string;
  term: string;
  academicYear: string;
  overallPercentage: number; // 0–100
  subjects: SubjectSummaryForCoach[];
};

export type StudentResultsCoachOutput = {
  band: string;
  bandLabel: string;
  headline: string;
  encouragement: string;
  strengths: string[];
  focusAreas: string[];
  nextSteps: string[];
};

/**
 * Simple helper to avoid divide-by-zero and NaN.
 */
function safePercent(obtained: number, max: number): number {
  if (!max || max <= 0) return 0;
  const raw = (obtained / max) * 100;
  if (!Number.isFinite(raw)) return 0;
  return Math.max(0, Math.min(100, raw));
}

/**
 * Map an overall percentage to a BECE-style band + simple label.
 * You can tweak these ranges later if you want to match GES exactly.
 */
function mapPercentageToBand(percentage: number): {
  band: string;
  label: string;
} {
  if (percentage >= 80) return { band: "1", label: "Excellent" };
  if (percentage >= 70) return { band: "2", label: "Very good" };
  if (percentage >= 60) return { band: "3", label: "Good" };
  if (percentage >= 50) return { band: "4", label: "Credit" };
  if (percentage >= 40) return { band: "5", label: "Pass (needs support)" };
  if (percentage >= 30) return { band: "6", label: "Weak" };
  if (percentage >= 20) return { band: "7", label: "Very weak" };
  if (percentage >= 10) return { band: "8", label: "Serious concern" };
  return { band: "9", label: "Critical concern" };
}

/**
 * Build a simple, warm "coach message" for a learner's term performance.
 */
export function buildStudentResultsCoach(
  input: StudentResultsCoachInput
): StudentResultsCoachOutput {
  const {
    learnerName,
    term,
    academicYear,
    overallPercentage,
    subjects,
  } = input;

  const { band, label } = mapPercentageToBand(overallPercentage);

  // Compute per-subject percentages
  const subjectsWithPerc = subjects.map((s) => {
    const pct = safePercent(s.totalScore, s.maxScore);
    return { ...s, percentage: pct };
  });

  // Sort by performance
  const sorted = [...subjectsWithPerc].sort(
    (a, b) => b.percentage - a.percentage
  );

  const strongest = sorted.slice(0, 2).filter((s) => s.percentage > 0);
  const weakest = sorted
    .slice(-2)
    .filter((s) => s.percentage > 0 && s.percentage < 80);

  const strengths = strongest.map(
    (s) => `${s.subjectName} (${s.percentage.toFixed(1)}%)`
  );

  const focusAreas = weakest.map(
    (s) => `${s.subjectName} (${s.percentage.toFixed(1)}%)`
  );

  // Build headline + encouragement based on band
  let headline: string;
  let encouragement: string;
  const namePart = learnerName ? `${learnerName}'s` : "Your";

  if (overallPercentage >= 80) {
    headline = `${namePart} performance this term is excellent.`;
    encouragement =
      "Keep nurturing this level of focus and consistency. The goal now is steady, humble improvement, not pressure.";
  } else if (overallPercentage >= 70) {
    headline = `${namePart} performance this term is very good.`;
    encouragement =
      "There is strong understanding in most subjects. A little extra attention in weaker areas can push this into excellence.";
  } else if (overallPercentage >= 60) {
    headline = `${namePart} performance this term is good.`;
    encouragement =
      "The foundation is solid. With more deliberate practice and better routines, this can grow into very strong performance.";
  } else if (overallPercentage >= 50) {
    headline = `${namePart} performance this term is fair.`;
    encouragement =
      "There is clear potential, but some gaps need gentle, consistent work. Small daily improvements will compound over time.";
  } else if (overallPercentage >= 40) {
    headline = `${namePart} performance this term needs support.`;
    encouragement =
      "This is not a failure; it is a signal. With the right environment, more practice, and support at home and in class, things can improve.";
  } else {
    headline = `${namePart} performance this term is below the desired level.`;
    encouragement =
      "This is a starting point, not a verdict. The most important thing now is an honest conversation, a simple plan, and consistent small actions.";
  }

  // Next steps – generic but actionable
  const nextSteps: string[] = [];

  if (overallPercentage < 80) {
    nextSteps.push(
      "Choose one weak subject and create a simple weekly study plan for it (fixed days and times)."
    );
  }
  if (overallPercentage < 60) {
    nextSteps.push(
      "Talk with your teacher about the topics you find confusing and ask for 1–2 extra practice questions each week."
    );
  }
  if (overallPercentage < 50) {
    nextSteps.push(
      "Reduce distractions around homework and study time (TV, phone, noise) so learning can be calmer and more focused."
    );
  }
  if (overallPercentage >= 70) {
    nextSteps.push(
      "Maintain your current routines and help a friend who is struggling in one subject. Teaching others will deepen your own understanding."
    );
  }

  if (nextSteps.length === 0) {
    nextSteps.push(
      "Keep your current routines, stay curious in class, and continue revising your notes weekly."
    );
  }

  return {
    band,
    bandLabel: label,
    headline,
    encouragement,
    strengths,
    focusAreas,
    nextSteps,
  };
}
