// src/lib/explainers.ts

/**
 * Simple rule-based "AI explainers" for EduLife OS.
 *
 * These helpers turn raw numbers into short, clear paragraphs
 * for headteachers, parents and students.
 *
 * No external AI services are used. Everything is deterministic,
 * explainable, and free to run.
 */

/**
 * ==============================
 * CLASS ATTENDANCE (TERM VIEW)
 * ==============================
 */

export type ClassAttendanceInsightInput = {
  classLabel: string; // e.g. "B4 Gold"
  term?: string; // e.g. "1st Term"
  academicYear?: string; // e.g. "2025/2026"

  // Core numbers
  attendanceRate: number; // 0–100 (overall for the term)
  last30DaysRate?: number; // 0–100 (optional)

  // Risk signals
  atRiskLearnerCount?: number; // learners with very low attendance
  totalLearners?: number; // class size

  // Optional comparison
  previousTermRate?: number; // compare with last term
};

/**
 * Generate a short, kind, but honest explanation
 * for a class's attendance profile for the headteacher.
 */
export function explainClassAttendanceForHeadteacher(
  input: ClassAttendanceInsightInput
): string {
  const {
    classLabel,
    term,
    academicYear,
    attendanceRate,
    last30DaysRate,
    atRiskLearnerCount,
    totalLearners,
    previousTermRate,
  } = input;

  const parts: string[] = [];

  const periodLabel =
    term && academicYear
      ? `${term} ${academicYear}`
      : term
      ? term
      : "this term";

  // Opening sentence
  if (attendanceRate >= 95) {
    parts.push(
      `${classLabel} has very strong attendance in ${periodLabel}, with an overall rate of about ${attendanceRate.toFixed(
        1
      )}%.`
    );
  } else if (attendanceRate >= 90) {
    parts.push(
      `${classLabel} has good attendance in ${periodLabel}, at around ${attendanceRate.toFixed(
        1
      )}%.`
    );
  } else if (attendanceRate >= 80) {
    parts.push(
      `${classLabel} has fair attendance in ${periodLabel}, at about ${attendanceRate.toFixed(
        1
      )}%.`
    );
  } else {
    parts.push(
      `${classLabel} is showing low attendance in ${periodLabel}, with an overall rate of only ${attendanceRate.toFixed(
        1
      )}%.`
    );
  }

  // Last 30 days trend
  if (typeof last30DaysRate === "number") {
    if (last30DaysRate >= attendanceRate + 3) {
      parts.push(
        `The last 30 days (about ${last30DaysRate.toFixed(
          1
        )}% attendance) are slightly stronger than the term average, which suggests recent improvement.`
      );
    } else if (last30DaysRate <= attendanceRate - 3) {
      parts.push(
        `The last 30 days (around ${last30DaysRate.toFixed(
          1
        )}% attendance) are weaker than the overall term, so attention is needed to prevent further decline.`
      );
    } else {
      parts.push(
        `Attendance for the last 30 days, at about ${last30DaysRate.toFixed(
          1
        )}%, is broadly consistent with the term average.`
      );
    }
  }

  // Compare with previous term if we have it
  if (typeof previousTermRate === "number") {
    if (attendanceRate >= previousTermRate + 3) {
      parts.push(
        `Attendance has improved compared to the previous term (about ${previousTermRate.toFixed(
          1
        )}%), which is a positive shift.`
      );
    } else if (attendanceRate <= previousTermRate - 3) {
      parts.push(
        `Attendance has dropped from roughly ${previousTermRate.toFixed(
          1
        )}% last term, which may require follow-up with teachers and parents.`
      );
    } else {
      parts.push(
        `Attendance is similar to the previous term (about ${previousTermRate.toFixed(
          1
        )}%), with no major change.`
      );
    }
  }

  // At-risk learners
  if (
    typeof atRiskLearnerCount === "number" &&
    typeof totalLearners === "number" &&
    totalLearners > 0
  ) {
    const percentAtRisk =
      (atRiskLearnerCount / totalLearners) * 100;

    if (atRiskLearnerCount === 0) {
      parts.push(
        `No learners are currently flagged as high-risk for chronic absenteeism in this class.`
      );
    } else if (percentAtRisk <= 10) {
      parts.push(
        `${atRiskLearnerCount} learner(s) (about ${percentAtRisk.toFixed(
          1
        )}% of the class) show concerning attendance patterns. Early intervention can still be very effective.`
      );
    } else {
      parts.push(
        `${atRiskLearnerCount} learner(s) (around ${percentAtRisk.toFixed(
          1
        )}% of the class) are high-risk for chronic absenteeism, which requires focused follow-up with families.`
      );
    }
  }

  // Closing tone
  if (attendanceRate >= 90) {
    parts.push(
      `Overall, ${classLabel} is on a healthy path. The goal is to maintain this consistency while supporting any learners who are struggling.`
    );
  } else if (attendanceRate >= 80) {
    parts.push(
      `Overall, attendance is workable but can be strengthened. Regular communication with families and reminders can help close the gap.`
    );
  } else {
    parts.push(
      `Overall, attendance in this class needs urgent attention. A simple action plan with the class teacher, parents and the guidance unit would be helpful.`
    );
  }

  return parts.join(" ");
}

/**
 * ==============================
 * CLASS ASSESSMENT (TERM VIEW)
 * ==============================
 */

export type ClassAssessmentInsightInput = {
  classLabel: string;
  term: string;
  academicYear: string;

  // subject averages: e.g. [{ subject: "Maths", average: 62 }, ...]
  subjectAverages: { subject: string; average: number }[];

  // optional comparison with previous term
  previousTermOverallAverage?: number;
};

/**
 * Generate a short explainer about class performance
 * for the headteacher dashboard.
 */
export function explainClassAssessmentForHeadteacher(
  input: ClassAssessmentInsightInput
): string {
  const {
    classLabel,
    term,
    academicYear,
    subjectAverages,
    previousTermOverallAverage,
  } = input;

  if (!subjectAverages || subjectAverages.length === 0) {
    return `${classLabel} has no recorded continuous assessment data for ${term} ${academicYear} yet. Once teachers begin entering scores, this space will summarise how the class is performing across subjects.`;
  }

  // Overall average
  let total = 0;
  for (const s of subjectAverages) {
    total += s.average;
  }
  const overallAverage = total / subjectAverages.length;

  // Find strongest + weakest subjects
  let strongest = subjectAverages[0];
  let weakest = subjectAverages[0];

  for (const s of subjectAverages) {
    if (s.average > strongest.average) strongest = s;
    if (s.average < weakest.average) weakest = s;
  }

  const parts: string[] = [];

  // Opening: overall level
  if (overallAverage >= 80) {
    parts.push(
      `${classLabel} is performing strongly in ${term} ${academicYear}, with an overall average of about ${overallAverage.toFixed(
        1
      )}%.`
    );
  } else if (overallAverage >= 60) {
    parts.push(
      `${classLabel} has a moderate performance level in ${term} ${academicYear}, with an overall average of roughly ${overallAverage.toFixed(
        1
      )}%.`
    );
  } else {
    parts.push(
      `${classLabel} is performing below the desired level in ${term} ${academicYear}, with an overall average of only ${overallAverage.toFixed(
        1
      )}%.`
    );
  }

  // Strongest + weakest subjects
  parts.push(
    `The strongest subject at the moment is ${strongest.subject} (about ${strongest.average.toFixed(
      1
    )}%), while the weakest is ${weakest.subject} (around ${weakest.average.toFixed(
      1
    )}%).`
  );

  // Comment on spread between subjects
  const spread = strongest.average - weakest.average;
  if (spread >= 20) {
    parts.push(
      `There is a noticeable gap between the strongest and weakest subjects, which suggests targeted support is needed in ${weakest.subject}.`
    );
  } else if (spread >= 10) {
    parts.push(
      `There is a moderate gap between subjects; closing the gap in ${weakest.subject} could lift the class average meaningfully.`
    );
  } else {
    parts.push(
      `The spread between subjects is relatively small, which suggests performance is fairly balanced across the curriculum.`
    );
  }

  // Compare with previous term, if available
  if (typeof previousTermOverallAverage === "number") {
    if (overallAverage >= previousTermOverallAverage + 3) {
      parts.push(
        `Compared with the previous term (about ${previousTermOverallAverage.toFixed(
          1
        )}%), the class has improved, which is encouraging.`
      );
    } else if (overallAverage <= previousTermOverallAverage - 3) {
      parts.push(
        `Compared with the previous term (about ${previousTermOverallAverage.toFixed(
          1
        )}%), the class average has declined and may require review of teaching strategies and learner support.`
      );
    } else {
      parts.push(
        `The overall level is similar to the previous term, indicating stable performance for now.`
      );
    }
  }

  // Closing idea
  if (overallAverage >= 70) {
    parts.push(
      `Overall, ${classLabel} is on a healthy academic path. Continued practice, feedback and enrichment activities can help sustain this level.`
    );
  } else if (overallAverage >= 50) {
    parts.push(
      `Overall, ${classLabel} is at a workable level but still has room to grow. Focused support in weaker subjects and regular formative assessment will help.`
    );
  } else {
    parts.push(
      `Overall, ${classLabel} needs deliberate academic intervention. A simple improvement plan with subject teachers and follow-up with families would be beneficial.`
    );
  }

  return parts.join(" ");
}

/**
 * ==============================
 * TEACHER WELLBEING (WEEK VIEW)
 * ==============================
 */

export type TeacherWellbeingInsightInput = {
  weekStart: Date;
  teacherCountReporting: number;
  avgStressLevel: number | null; // 1–10
  avgWorkload: number | null; // 1–10
};

/**
 * Explain what the teacher wellbeing numbers mean for the head.
 */
export function explainTeacherWellbeingForHeadteacher(
  input: TeacherWellbeingInsightInput
): string {
  const {
    weekStart,
    teacherCountReporting,
    avgStressLevel,
    avgWorkload,
  } = input;

  const parts: string[] = [];
  const weekLabel = weekStart.toISOString().slice(0, 10);

  if (teacherCountReporting === 0) {
    return `No teachers have submitted their weekly wellbeing check for the week starting ${weekLabel} yet. Once teachers begin responding, this space will help you see how your staff are feeling at a glance.`;
  }

  parts.push(
    `${teacherCountReporting} teacher(s) shared their wellbeing for the week starting ${weekLabel}.`
  );

  if (avgStressLevel == null && avgWorkload == null) {
    parts.push(
      `The raw responses are recorded, but we could not compute average stress or workload scores yet.`
    );
    return parts.join(" ");
  }

  if (typeof avgStressLevel === "number") {
    if (avgStressLevel <= 3) {
      parts.push(
        `Average stress is low (around ${avgStressLevel.toFixed(
          1
        )} on a 1–10 scale), which is a healthy sign.`
      );
    } else if (avgStressLevel <= 6) {
      parts.push(
        `Average stress is moderate (about ${avgStressLevel.toFixed(
          1
        )}), which is normal but worth keeping an eye on.`
      );
    } else {
      parts.push(
        `Average stress is high (around ${avgStressLevel.toFixed(
          1
        )}), which suggests some teachers may need support, lighter loads, or encouragement.`
      );
    }
  }

  if (typeof avgWorkload === "number") {
    if (avgWorkload <= 3) {
      parts.push(
        `The average workload rating is low (about ${avgWorkload.toFixed(
          1
        )}), meaning teachers feel they have plenty of room in their timetable.`
      );
    } else if (avgWorkload <= 6) {
      parts.push(
        `The average workload rating is moderate (around ${avgWorkload.toFixed(
          1
        )}), which is usually manageable.`
      );
    } else {
      parts.push(
        `The average workload rating is high (around ${avgWorkload.toFixed(
          1
        )}), so timetables, duties and extra activities may need review.`
      );
    }
  }

  parts.push(
    `A short staff conversation, even 10–15 minutes, can help you understand the story behind these numbers and support teachers early, not when they are burnt out.`
  );

  return parts.join(" ");
}

/**
 * ==============================
 * FEES (TERM SUMMARY)
 * ==============================
 */

export type FeesInsightInput = {
  term: string;
  academicYear: string;

  totalBilledPesewas: number;
  totalWaivedPesewas: number;
  totalPaidPesewas: number;
  outstandingPesewas: number;
  invoicesCount: number;
};

/**
 * Simple formatter for GH₵ values.
 */
function formatCedis(pesewas: number): string {
  const cedis = pesewas / 100;
  return `GH₵${cedis.toFixed(2)}`;
}

/**
 * Explain the fees picture in simple language for the head.
 */
export function explainFeesForHeadteacher(
  input: FeesInsightInput
): string {
  const {
    term,
    academicYear,
    totalBilledPesewas,
    totalWaivedPesewas,
    totalPaidPesewas,
    outstandingPesewas,
    invoicesCount,
  } = input;

  const parts: string[] = [];

  const billedAfterWaiver =
    totalBilledPesewas - totalWaivedPesewas;

  if (invoicesCount === 0) {
    return `No invoices have been recorded yet for ${term} ${academicYear}. Once fees are set up and invoices are generated, this space will show how much has been billed, paid, and is still outstanding.`;
  }

  parts.push(
    `${invoicesCount} invoice(s) have been recorded for ${term} ${academicYear}. After applying waivers, the school expects about ${formatCedis(
      billedAfterWaiver
    )} in fees.`
  );

  parts.push(
    `So far, about ${formatCedis(
      totalPaidPesewas
    )} has been paid, leaving an outstanding balance of roughly ${formatCedis(
      Math.max(outstandingPesewas, 0)
    )}.`
  );

  if (billedAfterWaiver > 0) {
    const collectionRate =
      (totalPaidPesewas / billedAfterWaiver) * 100;
    if (collectionRate >= 85) {
      parts.push(
        `Collections are strong at about ${collectionRate.toFixed(
          1
        )}% of the expected amount. A few friendly reminders should help close the final gap.`
      );
    } else if (collectionRate >= 60) {
      parts.push(
        `Collections are moderate at around ${collectionRate.toFixed(
          1
        )}%. It may be helpful to identify classes or families who need support, reminders or flexible payment plans.`
      );
    } else {
      parts.push(
        `Collections are currently low (about ${collectionRate.toFixed(
          1
        )}% of the expected amount). A simple plan that involves class teachers, PTA and SMS reminders will be important to protect the school’s budget.`
      );
    }
  }

  parts.push(
    `Using this summary once or twice a month helps you spot fee issues early, instead of waiting until the end of term.`
  );

  return parts.join(" ");
}
