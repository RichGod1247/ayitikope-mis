"use client";

import React, { useEffect, useMemo, useState } from "react";

const DEMO_TENANT_ID =
  process.env.NEXT_PUBLIC_DEMO_TENANT_ID || "cmhhnghn00008vcpgp3fl07fl";

// For now we use a demo learner ID you already have data for.
// You can later replace this with the logged-in student’s ID.
const DEMO_STUDENT_ID =
  process.env.NEXT_PUBLIC_DEMO_STUDENT_ID || "cmhq7wqjm0003vcr407xztme5";

const DEFAULT_TERM = "1st Term";
const DEFAULT_ACADEMIC_YEAR = "2025/2026";

/* -----------------------------
 * Types (aligned with parent report)
 * ----------------------------*/

type SubjectSummary = {
  subject: string;
  classScore: number | null;
  examScore: number | null;
  totalScore: number | null;
  maxScore: number | null;
  percentage: number | null;
  grade: string | null;
  remark: string | null;
  position: number | null;
};

type AttendanceSummary = {
  daysPresent: number;
  daysAbsent: number;
  daysLate: number;
  totalSchoolDays: number;
} | null;

type FeesSummary = {
  totalBilledPesewas: number;
  totalWaivedPesewas: number;
  totalPaidPesewas: number;
  outstandingPesewas: number;
  lastPaymentDate: string | null;
};

type HealthSummary = {
  totalScreenings: number;
  feverCount: number;
  symptomsCount: number;
  lastScreenedAt: string | null;
  overallFlag: string | null;
} | null;

type BehaviourSummary = {
  conduct?: string | null;
  attitude?: string | null;
  interest?: string | null;
  classTeacherRemark?: string | null;
  headTeacherRemark?: string | null;
} | null;

type TermSummary = {
  term: string;
  academicYear: string;
  overallPercentage: number | null;
  overallPosition: number | null;
  classSize: number | null;
  promotedTo: string | null;
  attendance: AttendanceSummary;
  fees: FeesSummary;
  health: HealthSummary;
  behaviour: BehaviourSummary;
  nextTermBegins: string | null;
  subjects: SubjectSummary[];
};

type ParentTermReportResponse = {
  ok: boolean;
  context: {
    tenantId: string;
    studentId: string;
    term: string;
    academicYear: string;
  };
  student: {
    id: string;
    tenantId: string;
    classroomId: string;
    firstName: string;
    lastName: string;
    sex: string | null;
    dob: string | null;
    guardianName: string;
    guardianPhone: string;
    note: string | null;
    classroom: {
      id: string;
      name: string;
      grade: string | null;
      arm: string | null;
    };
  };
  classroom: {
    id: string;
    name: string;
    grade: string | null;
    arm: string | null;
  };
  termSummary: TermSummary;
  subjects: SubjectSummary[];
  attendanceSummary: AttendanceSummary;
  feesSummary: FeesSummary;
  healthSummary: HealthSummary;
};

/* -----------------------------
 * Helpers
 * ----------------------------*/

function formatMoneyFromPesewas(value: number | null | undefined): string {
  if (value == null) return "0.00";
  return (value / 100).toFixed(2);
}

function formatDateNice(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function percentageDisplay(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `${value.toFixed(1)}%`;
}

function safeAttendance(
  term: TermSummary | null,
  topLevel: AttendanceSummary
): AttendanceSummary {
  return term?.attendance ?? topLevel ?? null;
}

function safeFees(
  term: TermSummary | null,
  topLevel: FeesSummary | undefined
): FeesSummary {
  if (term?.fees) return term.fees;
  if (topLevel) return topLevel;
  return {
    totalBilledPesewas: 0,
    totalWaivedPesewas: 0,
    totalPaidPesewas: 0,
    outstandingPesewas: 0,
    lastPaymentDate: null,
  };
}

function safeHealth(
  term: TermSummary | null,
  topLevel: HealthSummary
): HealthSummary {
  return term?.health ?? topLevel ?? null;
}

/* -----------------------------
 * Student Results Coach Logic
 * ----------------------------*/

type CoachInsights = {
  strengths: string[];
  focusAreas: string[];
  habits: string[];
  encouragement: string;
};

function buildCoachInsights(
  report: ParentTermReportResponse | null
): CoachInsights | null {
  if (!report) return null;

  const { termSummary, subjects, attendanceSummary, feesSummary, healthSummary } =
    report;

  const overallPercent = termSummary.overallPercentage ?? null;

  const strongSubjects: string[] = [];
  const midSubjects: string[] = [];
  const weakSubjects: string[] = [];

  for (const subj of subjects) {
    const pct = subj.percentage;
    if (pct == null) continue;

    if (pct >= 80) {
      strongSubjects.push(subj.subject);
    } else if (pct >= 60) {
      midSubjects.push(subj.subject);
    } else {
      weakSubjects.push(subj.subject);
    }
  }

  const strengths: string[] = [];
  const focusAreas: string[] = [];
  const habits: string[] = [];

  // Strengths
  if (strongSubjects.length > 0) {
    strengths.push(
      `You are performing **strongly** in: ${strongSubjects.join(", ")}. Keep using these as anchor subjects to build confidence.`
    );
  }
  if (overallPercent != null && overallPercent >= 70) {
    strengths.push(
      `Your overall performance (~${overallPercent.toFixed(
        1
      )}%) shows that you have a **solid foundation**.`
    );
  }

  // Focus areas (subjects)
  if (weakSubjects.length > 0) {
    focusAreas.push(
      `You need extra focus in: ${weakSubjects.join(
        ", "
      )}. Let’s turn these into growth zones rather than “fear zones”.`
    );
  } else if (midSubjects.length > 0) {
    focusAreas.push(
      `Most of your subjects are in the **middle band** (${midSubjects.join(
        ", "
      )}). With deliberate practice, they can shift into your strengths.`
    );
  }

  // Attendance
  const att = attendanceSummary;
  if (att) {
    const { daysPresent, totalSchoolDays, daysLate } = att;
    if (totalSchoolDays > 0) {
      const rate = (daysPresent / totalSchoolDays) * 100;
      if (rate >= 95) {
        strengths.push(
          `Your attendance is excellent (${daysPresent}/${totalSchoolDays} days). This discipline is one of your secret weapons.`
        );
      } else if (rate >= 85) {
        habits.push(
          `Your attendance (${daysPresent}/${totalSchoolDays} days) is good, but you can still push closer to **full presence** in class.`
        );
      } else {
        focusAreas.push(
          `Attendance is a serious improvement area (${daysPresent}/${totalSchoolDays} days). Every missed lesson makes the work feel harder.`
        );
      }

      if (daysLate > 0) {
        habits.push(
          `You were late ${daysLate} time(s). Aim to arrive 10–15 minutes early so your brain settles before lessons start.`
        );
      }
    }
  }

  // Fees
  if (feesSummary) {
    const outstanding = feesSummary.outstandingPesewas || 0;
    if (outstanding > 0) {
      habits.push(
        `There is some outstanding school fees (about GHS ${formatMoneyFromPesewas(
          outstanding
        )}). Be open with your parents/guardians and encourage calm planning, not worry.`
      );
    } else {
      strengths.push(
        `Fees seem to be up to date this term. That’s a quiet blessing – appreciate whoever is paying for your education.`
      );
    }
  }

  // Health
  const health = healthSummary;
  if (health) {
    if ((health.feverCount ?? 0) > 0) {
      focusAreas.push(
        `You had some health alerts (e.g. fever episodes). Protect your sleep, water intake, hygiene and nutrition so your brain can learn well.`
      );
    }
    if ((health.totalScreenings ?? 0) === 0) {
      habits.push(
        `No health screenings are recorded yet. When the school health checks are available, take them seriously—they help keep you safe.`
      );
    }
  }

  // Default messages if lists are empty
  if (strengths.length === 0) {
    strengths.push(
      "You have more potential than your current scores show. The fact that you are looking at your report is already a sign of responsibility."
    );
  }
  if (focusAreas.length === 0) {
    focusAreas.push(
      "Use this term to build consistency: a simple daily timetable, quiet reading time, and asking questions whenever you are confused."
    );
  }
  if (habits.length === 0) {
    habits.push(
      "Protect your daily habits: fixed study time, enough sleep, limited distractions, and respectful relationships with teachers and classmates."
    );
  }

  let encouragement = "";
  if (overallPercent == null) {
    encouragement =
      "You are more than any number on this sheet. Treat this report as feedback, not a final verdict. Decide who you want to become, then let your habits follow.";
  } else if (overallPercent >= 80) {
    encouragement =
      "This is a strong term. Celebrate with gratitude, then raise your standard again—quietly. Your goal is not just to pass exams, but to build a powerful mind and character.";
  } else if (overallPercent >= 60) {
    encouragement =
      "You are on a good path, but there is still room to climb. Small daily improvements in your weakest subjects can create a big shift by the next term.";
  } else {
    encouragement =
      "Do not be discouraged. Many great minds once had average or poor results. What changed them was a decision: to take responsibility, ask for help, and practice more than most people.";
  }

  return {
    strengths,
    focusAreas,
    habits,
    encouragement,
  };
}

/* -----------------------------
 * UI Components
 * ----------------------------*/

function StudentResultsCoach({
  report,
}: {
  report: ParentTermReportResponse | null;
}) {
  const insights = useMemo(() => buildCoachInsights(report), [report]);

  const [reflection, setReflection] = useState("");

  if (!report) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-4 text-xs text-slate-600">
        Once your term report is ready, this space will become your **Results
        Coach** – a friendly guide to help you understand your strengths and
        plan next steps.
      </div>
    );
  }

  if (!insights) {
    return null;
  }

  const { strengths, focusAreas, habits, encouragement } = insights;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-xs shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            EduLife OS · Student
          </div>
          <h2 className="text-sm font-semibold text-slate-900">
            My Results Coach
          </h2>
          <p className="mt-0.5 text-[11px] text-slate-600">
            A calm, honest guide helping you read your results like a{" "}
            <span className="font-semibold">leader in training</span>, not just
            a student.
          </p>
        </div>
      </div>

      <div className="h-px bg-slate-200" />

      {/* Strengths */}
      <section className="space-y-1.5">
        <h3 className="text-[11px] font-semibold text-emerald-800">
          1. What you&apos;re already doing well
        </h3>
        <ul className="space-y-1 list-disc pl-4 text-[11px] text-slate-700">
          {strengths.map((s, idx) => (
            <li key={idx}>{s}</li>
          ))}
        </ul>
      </section>

      {/* Focus areas */}
      <section className="space-y-1.5">
        <h3 className="text-[11px] font-semibold text-amber-800">
          2. Areas to improve this term
        </h3>
        <ul className="space-y-1 list-disc pl-4 text-[11px] text-slate-700">
          {focusAreas.map((f, idx) => (
            <li key={idx}>{f}</li>
          ))}
        </ul>
      </section>

      {/* Habits */}
      <section className="space-y-1.5">
        <h3 className="text-[11px] font-semibold text-sky-800">
          3. Daily habits to practice
        </h3>
        <ul className="space-y-1 list-disc pl-4 text-[11px] text-slate-700">
          {habits.map((h, idx) => (
            <li key={idx}>{h}</li>
          ))}
        </ul>
      </section>

      {/* Reflection box */}
      <section className="space-y-1.5">
        <h3 className="text-[11px] font-semibold text-slate-900">
          4. My reflection (very important)
        </h3>
        <p className="text-[11px] text-slate-600">
          In your own words, answer:{" "}
          <span className="font-semibold">
            “If I keep learning like this every term, who will I become in 5
            years?”
          </span>
        </p>
        <textarea
          className="mt-1 h-24 w-full rounded-md border border-slate-300 px-2 py-1.5 text-[11px] text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="Write your honest thoughts here. This is for you (and maybe a trusted adult or teacher) to review later."
          value={reflection}
          onChange={(e) => setReflection(e.target.value)}
        />
        <p className="text-[10px] text-slate-400">
          Tip: You can share this reflection with your parent/guardian or class
          teacher as a starting point for a powerful conversation.
        </p>
      </section>

      {/* Encouragement */}
      <section className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-800">
        <p className="font-semibold mb-0.5">Coach&apos;s note:</p>
        <p>{encouragement}</p>
      </section>
    </div>
  );
}

function StudentSubjectsTable({ report }: { report: ParentTermReportResponse | null }) {
  if (!report) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-xs text-slate-600">
        Your detailed subject scores will appear here once the school finishes
        processing this term&apos;s report card.
      </div>
    );
  }

  const subjects = report.termSummary.subjects ?? [];

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <table className="w-full text-[11px]">
        <thead className="bg-slate-50">
          <tr>
            <th className="px-2 py-1.5 text-left font-semibold text-slate-700">
              Subject
            </th>
            <th className="px-2 py-1.5 text-center font-semibold text-slate-700">
              Class Score
            </th>
            <th className="px-2 py-1.5 text-center font-semibold text-slate-700">
              Exam Score
            </th>
            <th className="px-2 py-1.5 text-center font-semibold text-slate-700">
              Total
            </th>
            <th className="px-2 py-1.5 text-center font-semibold text-slate-700">
              %
            </th>
            <th className="px-2 py-1.5 text-center font-semibold text-slate-700">
              Grade
            </th>
            <th className="px-2 py-1.5 text-center font-semibold text-slate-700">
              Position
            </th>
            <th className="px-2 py-1.5 text-left font-semibold text-slate-700">
              Remark
            </th>
          </tr>
        </thead>
        <tbody>
          {subjects.length === 0 ? (
            <tr>
              <td
                colSpan={8}
                className="px-3 py-4 text-center text-[11px] text-slate-500"
              >
                No subject scores recorded yet for this term.
              </td>
            </tr>
          ) : (
            subjects.map((subj, idx) => {
              const rowBg = idx % 2 === 1 ? "bg-slate-50/60" : "bg-white";
              const total =
                subj.totalScore != null
                  ? subj.totalScore
                  : subj.percentage != null
                  ? subj.percentage
                  : null;

              return (
                <tr key={subj.subject} className={rowBg}>
                  <td className="border-t border-slate-100 px-2 py-1.5 text-left font-medium text-slate-800">
                    {subj.subject}
                  </td>
                  <td className="border-t border-slate-100 px-2 py-1.5 text-center text-slate-700">
                    {subj.classScore != null ? subj.classScore : "—"}
                  </td>
                  <td className="border-t border-slate-100 px-2 py-1.5 text-center text-slate-700">
                    {subj.examScore != null ? subj.examScore : "—"}
                  </td>
                  <td className="border-t border-slate-100 px-2 py-1.5 text-center text-slate-700">
                    {total != null ? total : "—"}
                    {subj.maxScore != null ? (
                      <span className="text-[9px] text-slate-400">
                        {` / ${subj.maxScore}`}
                      </span>
                    ) : null}
                  </td>
                  <td className="border-t border-slate-100 px-2 py-1.5 text-center text-slate-700">
                    {percentageDisplay(subj.percentage)}
                  </td>
                  <td className="border-t border-slate-100 px-2 py-1.5 text-center text-slate-700">
                    {subj.grade || "—"}
                  </td>
                  <td className="border-t border-slate-100 px-2 py-1.5 text-center text-slate-700">
                    {subj.position != null ? subj.position : "—"}
                  </td>
                  <td className="border-t border-slate-100 px-2 py-1.5 text-left text-slate-700">
                    {subj.remark || "—"}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

/* -----------------------------
 * Page Component
 * ----------------------------*/

const StudentPortalPage: React.FC = () => {
  const [term, setTerm] = useState(DEFAULT_TERM);
  const [academicYear, setAcademicYear] = useState(DEFAULT_ACADEMIC_YEAR);

  const [report, setReport] = useState<ParentTermReportResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({
          tenantId: DEMO_TENANT_ID,
          studentId: DEMO_STUDENT_ID,
          term,
          academicYear,
        });
        const url = `/api/parent/report/term?${params.toString()}`;
        const res = await fetch(url);
        const text = await res.text();

        if (!res.ok) {
          console.error("[StudentPortal] HTTP error:", res.status, text);
          setError("Failed to load your term report.");
          setReport(null);
          return;
        }

        let data: ParentTermReportResponse | null = null;
        try {
          data = JSON.parse(text);
        } catch {
          data = null;
        }

        if (!data?.ok) {
          setError("Failed to load your term report.");
          setReport(null);
          return;
        }

        setReport(data);
      } catch (err) {
        console.error("[StudentPortal] error loading term report", err);
        setError("Network error while loading your report.");
        setReport(null);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [term, academicYear]);

  const studentName = report
    ? `${report.student.lastName} ${report.student.firstName}`.trim()
    : "Student";

  const classroomName = report?.classroom?.name ?? "—";
  const termSummary: TermSummary | null = report?.termSummary ?? null;
  const overallPercent = termSummary?.overallPercentage ?? null;
  const overallPosition = termSummary?.overallPosition ?? null;
  const classSize = termSummary?.classSize ?? null;

  const attendance = safeAttendance(termSummary, report?.attendanceSummary ?? null);
  const fees = safeFees(termSummary, report?.feesSummary);
  const health = safeHealth(termSummary, report?.healthSummary ?? null);

  const attendanceRate =
    attendance && attendance.totalSchoolDays > 0
      ? (attendance.daysPresent / attendance.totalSchoolDays) * 100
      : null;

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-6 space-y-5">
        {/* Top bar */}
        <header className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs sm:flex-row sm:items-center sm:justify-between shadow-sm">
          <div className="space-y-1">
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
              EduLife OS · Student Portal
            </div>
            <div className="text-sm font-semibold text-slate-900">
              {studentName}&apos;s Term Report &amp; Results Coach
            </div>
            <div className="text-[11px] text-slate-600">
              Class:{" "}
              <span className="font-medium">
                {classroomName} ({term}, {academicYear})
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 text-[11px] text-slate-600">
              <div className="space-y-1">
                <label className="block text-[10px] font-medium text-slate-500">
                  Term
                </label>
                <select
                  className="rounded-md border border-slate-300 px-2 py-1 text-[11px]"
                  value={term}
                  onChange={(e) => setTerm(e.target.value)}
                >
                  <option value="1st Term">1st Term</option>
                  <option value="2nd Term">2nd Term</option>
                  <option value="3rd Term">3rd Term</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="block text-[10px] font-medium text-slate-500">
                  Academic Year
                </label>
                <input
                  className="w-28 rounded-md border border-slate-300 px-2 py-1 text-[11px]"
                  value={academicYear}
                  onChange={(e) => setAcademicYear(e.target.value)}
                  placeholder="2025/2026"
                />
              </div>
            </div>
          </div>
        </header>

        {/* Status strip */}
        <section className="grid gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-[11px] text-slate-700 shadow-sm sm:grid-cols-3">
          <div className="space-y-0.5">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Overall performance
            </div>
            <div className="text-lg font-semibold text-slate-900">
              {overallPercent != null ? `${overallPercent.toFixed(1)}%` : "—"}
            </div>
            <div className="text-[11px] text-slate-600">
              {overallPosition != null && classSize != null ? (
                <>Position: {overallPosition} of {classSize}</>
              ) : (
                <>Position in class will appear once your report is finalised.</>
              )}
            </div>
          </div>
          <div className="space-y-0.5">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Attendance
            </div>
            {attendance ? (
              <>
                <div className="text-lg font-semibold text-slate-900">
                  {attendanceRate != null
                    ? `${attendanceRate.toFixed(1)}% present`
                    : "—"}
                </div>
                <div className="text-[11px] text-slate-600">
                  Present {attendance.daysPresent} /{" "}
                  {attendance.totalSchoolDays} days, Late {attendance.daysLate},
                  Absent {attendance.daysAbsent}
                </div>
              </>
            ) : (
              <div className="text-[11px] text-slate-600">
                Attendance data is not yet available for this term.
              </div>
            )}
          </div>
          <div className="space-y-0.5">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Fees &amp; Health snapshot
            </div>
            <div className="text-[11px] text-slate-700">
              <div>
                Fees outstanding:{" "}
                <span className="font-semibold text-rose-700">
                  GHS {formatMoneyFromPesewas(fees.outstandingPesewas ?? 0)}
                </span>
              </div>
              {fees.lastPaymentDate && (
                <div>
                  Last payment: {formatDateNice(fees.lastPaymentDate)}
                </div>
              )}
              {health ? (
                <div className="mt-1 text-[11px] text-slate-600">
                  Health checks: {health.totalScreenings ?? 0} captured;{" "}
                  {health.overallFlag
                    ? `Flag: ${health.overallFlag}`
                    : "No major flag recorded."}
                </div>
              ) : (
                <div className="mt-1 text-[11px] text-slate-600">
                  Health screening data not recorded yet.
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Main grid: subjects + coach */}
        <section className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1.1fr)]">
          <div className="space-y-3">
            <h2 className="text-xs font-semibold text-slate-900">
              Subject breakdown (BECE-style)
            </h2>
            {loading ? (
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-center text-[11px] text-slate-600">
                Loading your term report…
              </div>
            ) : error ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-4 text-[11px] text-rose-700">
                {error}
              </div>
            ) : (
              <StudentSubjectsTable report={report} />
            )}
          </div>

          <StudentResultsCoach report={report} />
        </section>
      </div>
    </main>
  );
};

export default StudentPortalPage;
