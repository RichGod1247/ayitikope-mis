// src/app/parent/report/page.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";

type ParentChild = {
  id: string;
  name: string;
  guardianName?: string | null;
  guardianPhone?: string | null;
  classroom: {
    id: string;
    name: string;
    grade?: string | null;
    arm?: string | null;
  } | null;
};

type ChildrenResponse = {
  ok: boolean;
  error?: string;
  message?: string;
  detail?: string;
  guardianPhone: string | null;
  students: {
    id: string;
    name: string;
    guardianName?: string | null;
    guardianPhone?: string | null;
    classroom: {
      id: string;
      name: string;
      grade?: string | null;
      arm?: string | null;
    } | null;
  }[];
  count: number;
};

type ParentOverviewStudent = {
  id: string;
  name: string;
  classroomName: string | null;
  fees: {
    term: string;
    academicYear: string;
    totalBilledPesewas: number;
    totalWaivedPesewas: number;
    totalPaidPesewas: number;
    balancePesewas: number;
    lastPaymentAmountPesewas: number | null;
    lastPaymentAt: string | null;
  };
  health: {
    lastDate: string | null;
    temperatureC: number | null;
    symptoms: string | null;
    notes: string | null;
  } | null;
};

type ParentOverviewResponse = {
  ok: boolean;
  error?: string;
  message?: string;
  detail?: string;
  guardianPhone: string | null;
  meta: {
    term: string;
    academicYear: string;
  };
  students: {
    id: string;
    name: string;
    classroomName: string | null;
    fees: {
      term: string;
      academicYear: string;
      totalBilledPesewas: number;
      totalWaivedPesewas: number;
      totalPaidPesewas: number;
      balancePesewas: number;
      lastPaymentAmountPesewas: number | null;
      lastPaymentAt: string | null;
    };
    health: {
      lastDate: string | null;
      temperatureC: number | null;
      symptoms: string | null;
      notes: string | null;
    } | null;
  }[];
};

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
  error?: string;
  message?: string;
  detail?: string;
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

const DEFAULT_TERM = "1st Term";
const DEFAULT_YEAR = "2025/2026";

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

function looksLikeErrorCode(value: string | null | undefined) {
  const s = String(value ?? "").trim();
  if (!s) return false;
  return /^[A-Z0-9_]+$/.test(s);
}

function readableApiMessage(
  payload: any,
  status: number,
  fallback: string
): string {
  const candidates = [
    payload?.message,
    payload?.errorMessage,
    payload?.detail,
    payload?.error,
  ]
    .map((v) => String(v ?? "").trim())
    .filter(Boolean);

  const firstHuman = candidates.find((v) => !looksLikeErrorCode(v));
  if (firstHuman) return firstHuman;

  if (status === 401) {
    return "Your parent session has expired. Please log in again.";
  }

  if (status === 403) {
    return "This report is not available right now.";
  }

  return fallback;
}

async function readJsonResponse<T>(res: Response): Promise<{
  data: T | null;
  text: string;
}> {
  const text = await res.text();
  try {
    return { data: JSON.parse(text) as T, text };
  } catch {
    return { data: null, text };
  }
}

/**
 * AI-style Parent Results Coach – speaks to the guardian using the same data.
 */
function ParentResultsCoach({ report }: { report: ParentTermReportResponse }) {
  const { student, termSummary } = report;
  const subjects = termSummary.subjects || [];

  const {
    strengths,
    growthAreas,
    almostThere,
    overallPercent,
    attendance,
    fees,
    health,
  } = useMemo(() => {
    const withPercent = subjects
      .filter((s) => s.percentage != null)
      .map((s) => s as SubjectSummary & { percentage: number });

    const overallPercent = termSummary.overallPercentage ?? null;

    const strengths = withPercent
      .filter((s) => s.percentage >= 80)
      .sort((a, b) => b.percentage - a.percentage)
      .slice(0, 3);

    const growthAreas = withPercent
      .filter((s) => s.percentage <= 65)
      .sort((a, b) => a.percentage - b.percentage)
      .slice(0, 3);

    const almostThere = withPercent
      .filter((s) => s.percentage > 65 && s.percentage < 80)
      .sort((a, b) => b.percentage - a.percentage)
      .slice(0, 3);

    return {
      strengths,
      growthAreas,
      almostThere,
      overallPercent,
      attendance: termSummary.attendance,
      fees: termSummary.fees,
      health: termSummary.health,
    };
  }, [subjects, termSummary]);

  const fullName = `${student.firstName} ${student.lastName}`.trim();
  const childName = fullName || "your child";
  const sex = student.sex?.toUpperCase() ?? null;
  const pronoun = sex === "M" ? "he" : sex === "F" ? "she" : "they";
  const possessive = sex === "M" ? "his" : sex === "F" ? "her" : "their";

  const renderSubjectTags = (list: SubjectSummary[]) => {
    if (!list.length) {
      return (
        <span className="text-[11px] text-slate-500">
          No clear pattern yet – this will update as more scores are recorded.
        </span>
      );
    }
    return (
      <div className="flex flex-wrap gap-1.5">
        {list.map((s) => (
          <span
            key={s.subject}
            className="inline-flex items-center gap-1 rounded-full bg-white/80 px-2 py-0.5 text-[11px] text-slate-800"
          >
            <span className="font-medium">{s.subject}</span>
            {s.percentage != null && (
              <span className="text-[10px] text-slate-500">
                {s.percentage.toFixed(0)}%
              </span>
            )}
          </span>
        ))}
      </div>
    );
  };

  return (
    <section className="space-y-3 rounded-2xl border border-indigo-200 bg-indigo-50/80 p-3 text-xs text-indigo-900">
      <div className="flex items-start gap-2">
        <div className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-[11px] font-semibold text-white">
          AI
        </div>
        <div className="space-y-1">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-indigo-700">
            Parent Results Coach
          </div>
          <p className="text-[11px] leading-relaxed">
            Here is a simple, human explanation of{" "}
            <span className="font-semibold">
              what this report is saying about {childName}
            </span>{" "}
            and how you can support {pronoun} at home – in the spirit of
            EduLife OS: calm, honest, and focused on growth.
          </p>
        </div>
      </div>

      <div className="space-y-1.5 rounded-xl bg-white/80 px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-semibold text-indigo-900">
            1. Overall performance snapshot
          </span>
          {overallPercent != null && (
            <span className="inline-flex items-center rounded-full bg-indigo-600/10 px-2 py-0.5 text-[10px] font-semibold text-indigo-900">
              Overall: {overallPercent.toFixed(1)}%
            </span>
          )}
        </div>
        <p className="text-[11px] text-indigo-900/90">
          This term, {childName} is{" "}
          {overallPercent == null
            ? "building a learning foundation. Not all subjects have scores yet."
            : overallPercent >= 85
            ? "performing at a very strong level. The key now is consistency and emotional balance – not pressure."
            : overallPercent >= 70
            ? "doing well, with clear room to move from ‘good’ to ‘excellent’ in a few subjects."
            : overallPercent >= 55
            ? "in a normal growth phase. There are gaps to close, but this is a workable starting point."
            : "still forming a basic foundation. The report is not a verdict, it is a map – we are seeing where to strengthen next."}
        </p>
      </div>

      <div className="grid gap-2.5 md:grid-cols-2">
        <div className="space-y-1.5 rounded-xl bg-white/80 px-3 py-2.5">
          <div className="text-[11px] font-semibold text-indigo-900">
            2. Subjects where {pronoun} is strong
          </div>
          <p className="text-[11px] text-indigo-900/90">
            These subjects show how {childName} naturally learns best. Protect
            these strengths – they are confidence anchors.
          </p>
          {renderSubjectTags(strengths)}
        </div>

        <div className="space-y-1.5 rounded-xl bg-white/80 px-3 py-2.5">
          <div className="text-[11px] font-semibold text-indigo-900">
            3. Subjects that need careful support
          </div>
          <p className="text-[11px] text-indigo-900/90">
            These are the areas quietly asking for more{" "}
            <span className="font-semibold">time, patience and strategy</span>,
            not shouting for anger or shame.
          </p>
          {renderSubjectTags(growthAreas)}
        </div>
      </div>

      <div className="space-y-1.5 rounded-xl bg-white/80 px-3 py-2.5">
        <div className="text-[11px] font-semibold text-indigo-900">
          4. “Almost there” subjects
        </div>
        <p className="text-[11px] text-indigo-900/90">
          These subjects are very close to becoming strengths. Small, consistent
          practice can push them into the 80%+ zone.
        </p>
        {renderSubjectTags(almostThere)}
      </div>

      <div className="grid gap-2.5 md:grid-cols-3">
        <div className="space-y-1 rounded-xl bg-white/80 px-3 py-2">
          <div className="text-[11px] font-semibold text-indigo-900">
            5. Attendance story
          </div>
          {attendance ? (
            <p className="text-[11px] text-indigo-900/90">
              Present:{" "}
              <span className="font-semibold">{attendance.daysPresent}</span> /{" "}
              <span className="font-semibold">
                {attendance.totalSchoolDays}
              </span>{" "}
              days.{" "}
              {attendance.daysAbsent === 0
                ? "Excellent consistency – keep protecting school days as much as possible."
                : attendance.daysAbsent <= 3
                ? "Absences are low. Continue monitoring reasons (sickness, family duties) so they don’t quietly increase."
                : "There were several absences. It may help to quietly explore with your child what made those days difficult."}
            </p>
          ) : (
            <p className="text-[11px] text-indigo-600/80">
              Once daily attendance is fully updated in EduLife OS, a clearer
              picture of {possessive} presence and punctuality will appear here.
            </p>
          )}
        </div>

        <div className="space-y-1 rounded-xl bg-white/80 px-3 py-2">
          <div className="text-[11px] font-semibold text-indigo-900">
            6. Fees pressure (or peace)
          </div>
          {fees ? (
            <p className="text-[11px] text-indigo-900/90">
              Total billed:{" "}
              <span className="font-semibold">
                GHS {formatMoneyFromPesewas(fees.totalBilledPesewas)}
              </span>
              . Outstanding:{" "}
              <span className="font-semibold text-indigo-900">
                GHS {formatMoneyFromPesewas(fees.outstandingPesewas)}
              </span>
              .{" "}
              {fees.outstandingPesewas > 0
                ? "If possible, discuss a simple plan with the school so that money worries do not disturb your child’s focus."
                : "With fees up to date, your child can learn without silent financial tension."}
            </p>
          ) : (
            <p className="text-[11px] text-indigo-600/80">
              When the term&apos;s fee structures and payments are finalized in
              EduLife OS, a short summary will appear here.
            </p>
          )}
        </div>

        <div className="space-y-1 rounded-xl bg-white/80 px-3 py-2">
          <div className="text-[11px] font-semibold text-indigo-900">
            7. Health & energy
          </div>
          {health ? (
            <p className="text-[11px] text-indigo-900/90">
              {health.overallFlag
                ? health.overallFlag
                : "The school is tracking temperature and symptoms to protect your child."}{" "}
              Please remember: sleep, food, water, and emotional peace{" "}
              <span className="font-semibold">directly affect results</span>,
              not just textbooks.
            </p>
          ) : (
            <p className="text-[11px] text-indigo-600/80">
              As the school&apos;s health screening data grows, you will see a
              simple summary of {possessive} wellness pattern here.
            </p>
          )}
        </div>
      </div>

      <div className="space-y-1.5 rounded-xl border border-indigo-200 bg-indigo-900 px-3 py-2.5 text-[11px] text-indigo-50">
        <div className="font-semibold">
          8. A gentle 3-step support plan at home
        </div>
        <ol className="list-decimal space-y-1 pl-4">
          <li>
            <span className="font-semibold">Protect the strong areas:</span> let{" "}
            {childName} keep practising the subjects {pronoun} loves – they
            build confidence for the harder ones.
          </li>
          <li>
            <span className="font-semibold">Choose one “project subject”:</span>{" "}
            pick just one weaker subject this term and agree on a small daily
            routine (e.g. 20 minutes of questions after supper).
          </li>
          <li>
            <span className="font-semibold">
              Keep conversations calm and curious:
            </span>{" "}
            instead of asking “Why did you fail?”, try “Which parts confuse you,
            and how can we or your teacher help?” EduLife OS is built to turn
            fear into honest conversation.
          </li>
        </ol>
      </div>
    </section>
  );
}

/**
 * BECE-style report card
 */
function BeceReportCard({ report }: { report: ParentTermReportResponse }) {
  const { student, classroom, termSummary } = report;

  const subjects = termSummary.subjects ?? [];
  const overallPercent = termSummary.overallPercentage;
  const overallPosition = termSummary.overallPosition;
  const classSize = termSummary.classSize;

  const attendance = termSummary.attendance;
  const fees = termSummary.fees;
  const health = termSummary.health;
  const behaviour = termSummary.behaviour;

  const fullName = `${student.lastName} ${student.firstName}`.trim();

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              School Terminal Report
            </div>
            <div className="text-lg font-bold text-slate-900">
              BECE-Style Terminal Report
            </div>
            <div className="mt-0.5 text-[11px] text-slate-500">
              “Knowledge • Character • Service.”
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-[10px] text-slate-500">
              <span className="mb-1 text-[11px] font-semibold text-slate-600">
                Passport Photograph
              </span>
              <div className="h-20 w-16 rounded border border-slate-300 bg-slate-100" />
              <span className="mt-1">Attach here</span>
            </div>
          </div>
        </div>

        <div className="grid gap-2 rounded-md bg-slate-50 p-3 text-[11px] text-slate-700 md:grid-cols-3">
          <div className="space-y-1">
            <div>
              <span className="font-semibold">Name:</span>{" "}
              <span>{fullName || "—"}</span>
            </div>
            <div>
              <span className="font-semibold">Sex:</span>{" "}
              <span>{student.sex || "—"}</span>
            </div>
            <div>
              <span className="font-semibold">Class:</span>{" "}
              <span>
                {classroom.name}
                {classroom.arm ? ` (${classroom.arm})` : ""}
              </span>
            </div>
          </div>
          <div className="space-y-1">
            <div>
              <span className="font-semibold">Guardian:</span>{" "}
              <span>{student.guardianName || "—"}</span>
            </div>
            <div>
              <span className="font-semibold">Guardian Phone:</span>{" "}
              <span>{student.guardianPhone || "—"}</span>
            </div>
            <div>
              <span className="font-semibold">Term:</span>{" "}
              <span>{termSummary.term}</span>
            </div>
          </div>
          <div className="space-y-1">
            <div>
              <span className="font-semibold">Academic Year:</span>{" "}
              <span>{termSummary.academicYear}</span>
            </div>
            <div>
              <span className="font-semibold">Overall %:</span>{" "}
              <span>{percentageDisplay(overallPercent)}</span>
            </div>
            <div>
              <span className="font-semibold">Position in Class:</span>{" "}
              <span>
                {overallPosition != null && classSize != null
                  ? `${overallPosition} of ${classSize}`
                  : "—"}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 px-4 py-4 lg:grid-cols-[minmax(0,2.1fr)_minmax(0,1.2fr)]">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-700">
              Subject Performance (Class &amp; Exam Scores)
            </h3>
            <span className="text-[10px] text-slate-500">
              In line with BECE grading style
            </span>
          </div>

          <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
            <table className="min-w-full border-separate border-spacing-0 text-[11px]">
              <thead>
                <tr className="bg-slate-50">
                  <th className="border-b border-slate-200 px-2 py-1.5 text-left font-semibold text-slate-700">
                    Subject
                  </th>
                  <th className="border-b border-slate-200 px-2 py-1.5 text-center font-semibold text-slate-700">
                    Class Score
                    <span className="block text-[9px] font-normal text-slate-500">
                      (e.g. /40)
                    </span>
                  </th>
                  <th className="border-b border-slate-200 px-2 py-1.5 text-center font-semibold text-slate-700">
                    Exam Score
                    <span className="block text-[9px] font-normal text-slate-500">
                      (e.g. /60)
                    </span>
                  </th>
                  <th className="border-b border-slate-200 px-2 py-1.5 text-center font-semibold text-slate-700">
                    Total
                  </th>
                  <th className="border-b border-slate-200 px-2 py-1.5 text-center font-semibold text-slate-700">
                    %
                  </th>
                  <th className="border-b border-slate-200 px-2 py-1.5 text-center font-semibold text-slate-700">
                    Grade
                  </th>
                  <th className="border-b border-slate-200 px-2 py-1.5 text-center font-semibold text-slate-700">
                    Position
                  </th>
                  <th className="border-b border-slate-200 px-2 py-1.5 text-left font-semibold text-slate-700">
                    Remarks
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
                      <tr key={`${subj.subject}-${idx}`} className={rowBg}>
                        <td className="border-b border-slate-100 px-2 py-1.5 text-left font-medium text-slate-800">
                          {subj.subject}
                        </td>
                        <td className="border-b border-slate-100 px-2 py-1.5 text-center text-slate-700">
                          {subj.classScore != null ? subj.classScore : "—"}
                        </td>
                        <td className="border-b border-slate-100 px-2 py-1.5 text-center text-slate-700">
                          {subj.examScore != null ? subj.examScore : "—"}
                        </td>
                        <td className="border-b border-slate-100 px-2 py-1.5 text-center text-slate-700">
                          {total != null ? total : "—"}
                          {subj.maxScore != null ? (
                            <span className="text-[9px] text-slate-400">
                              {` / ${subj.maxScore}`}
                            </span>
                          ) : null}
                        </td>
                        <td className="border-b border-slate-100 px-2 py-1.5 text-center text-slate-700">
                          {percentageDisplay(subj.percentage)}
                        </td>
                        <td className="border-b border-slate-100 px-2 py-1.5 text-center text-slate-700">
                          {subj.grade || "—"}
                        </td>
                        <td className="border-b border-slate-100 px-2 py-1.5 text-center text-slate-700">
                          {subj.position != null ? subj.position : "—"}
                        </td>
                        <td className="border-b border-slate-100 px-2 py-1.5 text-left text-slate-700">
                          {subj.remark || "—"}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-3">
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-700">
              Attendance, Fees &amp; Health Summary
            </h3>
            <div className="grid gap-2 text-[11px] lg:grid-cols-1">
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="font-semibold text-slate-800">
                    Attendance
                  </span>
                </div>
                {attendance ? (
                  <div className="grid grid-cols-2 gap-1 text-slate-700">
                    <div>
                      <span className="font-semibold">Days Present:</span>{" "}
                      <span>{attendance.daysPresent}</span>
                    </div>
                    <div>
                      <span className="font-semibold">Days Absent:</span>{" "}
                      <span>{attendance.daysAbsent}</span>
                    </div>
                    <div>
                      <span className="font-semibold">Days Late:</span>{" "}
                      <span>{attendance.daysLate}</span>
                    </div>
                    <div>
                      <span className="font-semibold">Total School Days:</span>{" "}
                      <span>{attendance.totalSchoolDays}</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-[11px] text-slate-500">
                    No attendance data recorded yet for this term.
                  </div>
                )}
              </div>

              <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="font-semibold text-slate-800">Fees</span>
                </div>
                {fees ? (
                  <div className="grid grid-cols-2 gap-1 text-slate-700">
                    <div>
                      <span className="font-semibold">Total Billed:</span>{" "}
                      <span>
                        GHS {formatMoneyFromPesewas(fees.totalBilledPesewas ?? 0)}
                      </span>
                    </div>
                    <div>
                      <span className="font-semibold">Total Paid:</span>{" "}
                      <span>
                        GHS {formatMoneyFromPesewas(fees.totalPaidPesewas ?? 0)}
                      </span>
                    </div>
                    <div>
                      <span className="font-semibold">Waived:</span>{" "}
                      <span>
                        GHS {formatMoneyFromPesewas(fees.totalWaivedPesewas ?? 0)}
                      </span>
                    </div>
                    <div>
                      <span className="font-semibold">Outstanding:</span>{" "}
                      <span className="font-semibold text-rose-700">
                        GHS {formatMoneyFromPesewas(fees.outstandingPesewas ?? 0)}
                      </span>
                    </div>
                    <div className="col-span-2">
                      <span className="font-semibold">Last Payment:</span>{" "}
                      <span>{formatDateNice(fees.lastPaymentDate)}</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-[11px] text-slate-500">
                    No fees record yet for this term.
                  </div>
                )}
              </div>

              <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="font-semibold text-slate-800">Health</span>
                </div>
                {health ? (
                  <div className="grid grid-cols-2 gap-1 text-slate-700">
                    <div>
                      <span className="font-semibold">Screenings:</span>{" "}
                      <span>{health.totalScreenings ?? 0}</span>
                    </div>
                    <div>
                      <span className="font-semibold">Fever Episodes:</span>{" "}
                      <span>{health.feverCount ?? 0}</span>
                    </div>
                    <div>
                      <span className="font-semibold">Symptoms Logged:</span>{" "}
                      <span>{health.symptomsCount ?? 0}</span>
                    </div>
                    <div>
                      <span className="font-semibold">Last Screened:</span>{" "}
                      <span>{formatDateNice(health.lastScreenedAt)}</span>
                    </div>
                    <div className="col-span-2">
                      <span className="font-semibold">Health Flag:</span>{" "}
                      <span>{health.overallFlag || "—"}</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-[11px] text-slate-500">
                    No health screening data recorded yet for this term.
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-700">
              Behaviour &amp; Remarks
            </h3>
            <div className="space-y-2 text-[11px] text-slate-700">
              <div className="rounded-md border border-slate-200 bg-white p-2.5">
                <div className="mb-1 font-semibold text-slate-800">
                  Conduct / Attitude / Interest
                </div>
                <p className="text-[11px] text-slate-700">
                  {behaviour?.conduct ||
                    behaviour?.attitude ||
                    behaviour?.interest ||
                    "Teacher’s notes on conduct, attitude to work, and interest in school activities will appear here."}
                </p>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <div className="rounded-md border border-slate-200 bg-white p-2.5">
                  <div className="mb-1 font-semibold text-slate-800">
                    Class Teacher’s Remark
                  </div>
                  <p className="min-h-10 text-[11px] text-slate-700">
                    {behaviour?.classTeacherRemark ||
                      "…………........................................................................................................................"}
                  </p>
                  <div className="mt-1 text-[10px] text-slate-500">
                    Signature: ______________________
                  </div>
                </div>
                <div className="rounded-md border border-slate-200 bg-white p-2.5">
                  <div className="mb-1 font-semibold text-slate-800">
                    Headteacher’s Remark
                  </div>
                  <p className="min-h-10 text-[11px] text-slate-700">
                    {behaviour?.headTeacherRemark ||
                      "…………........................................................................................................................"}
                  </p>
                  <div className="mt-1 text-[10px] text-slate-500">
                    Signature &amp; Stamp: ______________________
                  </div>
                </div>
              </div>
              <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-slate-800">
                    Next Term Begins:
                  </span>
                  <span className="text-[11px] text-slate-700">
                    {termSummary.nextTermBegins
                      ? formatDateNice(termSummary.nextTermBegins)
                      : "To be announced"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const ParentReportPage: React.FC = () => {
  const [term, setTerm] = useState(DEFAULT_TERM);
  const [academicYear, setAcademicYear] = useState(DEFAULT_YEAR);

  const [guardianPhone, setGuardianPhone] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);

  const [children, setChildren] = useState<ParentChild[]>([]);
  const [childrenLoading, setChildrenLoading] = useState(false);
  const [childrenError, setChildrenError] = useState<string | null>(null);

  const [overview, setOverview] = useState<ParentOverviewResponse | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewError, setOverviewError] = useState<string | null>(null);

  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);

  const [report, setReport] = useState<ParentTermReportResponse | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  const overviewByStudentId = useMemo(() => {
    const map = new Map<string, ParentOverviewStudent>();
    if (overview?.students) {
      for (const s of overview.students) {
        map.set(s.id, s);
      }
    }
    return map;
  }, [overview]);

  const loadChildrenAndOverview = useCallback(
    async (termValue: string, yearValue: string) => {
      setChildrenLoading(true);
      setOverviewLoading(true);
      setChildrenError(null);
      setOverviewError(null);
      setSessionExpired(false);

      try {
        const [childrenRes, overviewRes] = await Promise.all([
          fetch("/api/parent/children", {
            method: "GET",
            credentials: "include",
            cache: "no-store",
            headers: { Accept: "application/json" },
          }),
          fetch(
            `/api/parent/overview?term=${encodeURIComponent(
              termValue
            )}&academicYear=${encodeURIComponent(yearValue)}`,
            {
              method: "GET",
              credentials: "include",
              cache: "no-store",
              headers: { Accept: "application/json" },
            }
          ),
        ]);

        const [{ data: childrenData }, { data: overviewData }] =
          await Promise.all([
            readJsonResponse<ChildrenResponse>(childrenRes),
            readJsonResponse<ParentOverviewResponse>(overviewRes),
          ]);

        const unauthorized =
          childrenRes.status === 401 ||
          overviewRes.status === 401 ||
          childrenData?.error === "UNAUTHORIZED_PARENT" ||
          overviewData?.error === "UNAUTHORIZED_PARENT";

        if (unauthorized) {
          setSessionExpired(true);
          setChildren([]);
          setOverview(null);
          setSelectedChildId(null);
          setGuardianPhone(null);
          return;
        }

        if (!childrenRes.ok || !childrenData?.ok) {
          setChildrenError(
            readableApiMessage(
              childrenData,
              childrenRes.status,
              "Failed to load your children."
            )
          );
          setChildren([]);
        } else {
          const nextChildren = Array.isArray(childrenData.students)
            ? childrenData.students
            : [];

          setChildren(nextChildren);
          setGuardianPhone(childrenData.guardianPhone || null);

          setSelectedChildId((prev) => {
            if (prev && nextChildren.some((child) => child.id === prev)) {
              return prev;
            }
            return nextChildren[0]?.id ?? null;
          });
        }

        if (!overviewRes.ok || !overviewData?.ok) {
          setOverviewError(
            readableApiMessage(
              overviewData,
              overviewRes.status,
              "Failed to load overview for this term and year."
            )
          );
          setOverview(null);
        } else {
          setOverview(overviewData);
          setGuardianPhone((prev) => prev || overviewData.guardianPhone || null);
        }
      } catch (err) {
        console.error("[ParentPortal] error loading children/overview", err);
        setChildrenError("Network error loading children.");
        setOverviewError("Network error loading overview.");
      } finally {
        setChildrenLoading(false);
        setOverviewLoading(false);
      }
    },
    []
  );

  const loadReportForSelection = useCallback(
    async (studentId: string, termValue: string, yearValue: string) => {
      setReportLoading(true);
      setReportError(null);

      try {
        const url = `/api/parent/report/term?studentId=${encodeURIComponent(
          studentId
        )}&term=${encodeURIComponent(termValue)}&academicYear=${encodeURIComponent(
          yearValue
        )}`;

        const res = await fetch(url, {
          method: "GET",
          credentials: "include",
          cache: "no-store",
          headers: { Accept: "application/json" },
        });

        const { data } = await readJsonResponse<ParentTermReportResponse>(res);

        const unauthorized =
          res.status === 401 || data?.error === "UNAUTHORIZED_PARENT";

        if (unauthorized) {
          setSessionExpired(true);
          setReport(null);
          return;
        }

        if (!res.ok || !data?.ok) {
          setReportError(
            readableApiMessage(
              data,
              res.status,
              "Failed to load parent term report."
            )
          );
          setReport(null);
          return;
        }

        setReport(data);
      } catch (err) {
        console.error("[ParentTermReportPage] error loading report", err);
        setReportError("Network error loading term report.");
        setReport(null);
      } finally {
        setReportLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    loadChildrenAndOverview(term, academicYear);
  }, [term, academicYear, loadChildrenAndOverview]);

  useEffect(() => {
    if (sessionExpired) return;
    if (!selectedChildId) {
      setReport(null);
      return;
    }

    loadReportForSelection(selectedChildId, term, academicYear);
  }, [
    sessionExpired,
    selectedChildId,
    term,
    academicYear,
    loadReportForSelection,
  ]);

  function handlePrintCurrent() {
    if (!report?.context) return;

    const params = new URLSearchParams({
      studentId: report.context.studentId,
      term: report.context.term,
      academicYear: report.context.academicYear,
    });

    window.open(`/parent/report/print?${params.toString()}`, "_blank");
  }

  if (sessionExpired) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="container mx-auto px-4 py-10">
          <div className="mx-auto max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h1 className="text-base font-semibold text-slate-900">
              Parent session required
            </h1>
            <p className="mt-2 text-xs text-slate-600">
              Your parent session has expired or is missing. Please log in again
              to continue.
            </p>

            <div className="mt-4">
              <a
                href="/parent/login?next=/parent/report"
                className="inline-flex w-full items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-xs font-medium text-white shadow-sm hover:bg-blue-700"
              >
                Go to parent login
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="container mx-auto space-y-5 px-4 py-6">
        <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Parent Portal
            </div>
            <div className="text-sm font-semibold text-slate-900">
              BECE-Style Term Report &amp; Health-Aware Summary
            </div>
            <div className="text-[11px] text-slate-600">
              Phone:{" "}
              <span className="font-medium">{guardianPhone || "Signed in"}</span>
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

            <button
              type="button"
              onClick={() => loadChildrenAndOverview(term, academicYear)}
              className="inline-flex items-center rounded-full border border-slate-300 px-3 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
            >
              Refresh data
            </button>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1.7fr)]">
          <div className="space-y-3">
            <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-xs font-semibold text-slate-900">
                    Your children this term
                  </h2>
                  <p className="text-[11px] text-slate-600">
                    Select a child to view detailed report, fees, and health
                    summary.
                  </p>
                </div>
                <span className="min-w-8 rounded-full bg-slate-100 px-2 py-0.5 text-center text-[10px] font-medium text-slate-700">
                  {children.length} child
                  {children.length === 1 ? "" : "ren"}
                </span>
              </div>

              {childrenLoading ? (
                <div className="py-4 text-center text-[11px] text-slate-500">
                  Loading children…
                </div>
              ) : childrenError ? (
                <div className="rounded-md bg-rose-50 px-3 py-2 text-[11px] text-rose-700">
                  {childrenError}
                </div>
              ) : children.length === 0 ? (
                <div className="py-4 text-center text-[11px] text-slate-500">
                  No children found for this parent session yet.
                </div>
              ) : (
                <ul className="space-y-1.5">
                  {children.map((child) => {
                    const isSelected = selectedChildId === child.id;
                    const overviewChild = overviewByStudentId.get(child.id);
                    const outstanding =
                      overviewChild?.fees?.balancePesewas ?? 0;
                    const healthLast = overviewChild?.health;

                    return (
                      <li key={child.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedChildId(child.id)}
                          className={[
                            "flex w-full items-start justify-between rounded-lg border px-3 py-2 text-left transition",
                            isSelected
                              ? "border-blue-500 bg-blue-50/80"
                              : "border-slate-200 bg-slate-50 hover:border-blue-300 hover:bg-blue-50/40",
                          ].join(" ")}
                        >
                          <div className="space-y-0.5">
                            <div className="text-xs font-semibold text-slate-900">
                              {child.name}
                            </div>
                            <div className="text-[11px] text-slate-600">
                              Class: {child.classroom?.name || "—"}
                            </div>
                            <div className="flex flex-wrap gap-1 text-[10px]">
                              <span className="rounded-full bg-white px-2 py-0.5 text-slate-600">
                                Fees:{" "}
                                {outstanding > 0
                                  ? `Outstanding GHS ${formatMoneyFromPesewas(
                                      outstanding
                                    )}`
                                  : "Up to date"}
                              </span>
                              {healthLast?.lastDate && (
                                <span className="rounded-full bg-white px-2 py-0.5 text-slate-600">
                                  Health: Last screened{" "}
                                  {formatDateNice(healthLast.lastDate)}
                                </span>
                              )}
                            </div>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h2 className="text-xs font-semibold text-slate-900">
                  Term overview snapshot
                </h2>
                <span className="text-[10px] text-slate-500">
                  Term: {term} • Year: {academicYear}
                </span>
              </div>
              {overviewLoading ? (
                <div className="py-3 text-center text-[11px] text-slate-500">
                  Loading overview…
                </div>
              ) : overviewError ? (
                <div className="rounded-md bg-rose-50 px-3 py-2 text-[11px] text-rose-700">
                  {overviewError}
                </div>
              ) : !overview || overview.students.length === 0 ? (
                <div className="py-3 text-[11px] text-slate-500">
                  Overview will appear here once assessment, fees and health
                  records are captured for this term.
                </div>
              ) : (
                <div className="space-y-2">
                  {overview.students.map((s) => (
                    <div
                      key={s.id}
                      className="rounded-md bg-slate-50 px-3 py-2 text-[11px]"
                    >
                      <div className="flex items-center justify-between">
                        <div className="font-semibold text-slate-900">
                          {s.name}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          Class: {s.classroomName ?? "—"}
                        </div>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1 text-[10px] text-slate-600">
                        <span className="rounded-full bg-white px-2 py-0.5">
                          Fees outstanding:{" "}
                          <span className="font-medium">
                            GHS{" "}
                            {formatMoneyFromPesewas(
                              s.fees.balancePesewas ?? 0
                            )}
                          </span>
                        </span>
                        {s.health?.lastDate && (
                          <span className="rounded-full bg-white px-2 py-0.5">
                            Last health check: {formatDateNice(s.health.lastDate)}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xs font-semibold text-slate-900">
                Detailed BECE-Style Term Report
              </h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePrintCurrent}
                  disabled={!report}
                  className="inline-flex items-center rounded-full border border-slate-300 bg-white px-3 py-1 text-[11px] font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Print this report
                </button>
              </div>
            </div>

            {!selectedChildId ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-[11px] text-slate-600">
                Please select a child from the left to view the full term
                report.
              </div>
            ) : reportLoading ? (
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-center text-[11px] text-slate-600">
                Loading term report…
              </div>
            ) : reportError ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[11px] text-rose-700">
                {reportError}
              </div>
            ) : !report ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-[11px] text-slate-600">
                No report data available yet for this term.
              </div>
            ) : (
              <>
                <BeceReportCard report={report} />
                <div className="mt-3">
                  <ParentResultsCoach report={report} />
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ParentReportPage;
