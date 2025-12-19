// src/app/parent/report/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";

const DEMO_TENANT_ID =
  process.env.NEXT_PUBLIC_DEMO_TENANT_ID || "cmhhnghn00008vcpgp3fl07fl";
const DEMO_TENANT_SLUG =
  process.env.NEXT_PUBLIC_DEMO_TENANT_SLUG || "ayitikope-basic";

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
  guardianPhone: string;
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
  guardianPhone: string;
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

type Stage = "PHONE" | "OTP" | "PORTAL";

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
  const pronoun =
    sex === "M" ? "he" : sex === "F" ? "she" : "they";
  const possessive =
    sex === "M" ? "his" : sex === "F" ? "her" : "their";

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
            and how you can support {pronoun} at home – in the spirit of EduLife
            OS: calm, honest, and focused on growth.
          </p>
        </div>
      </div>

      {/* Overall view */}
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

      {/* Strengths & growth areas */}
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

      {/* Almost there */}
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

      {/* Life factors – attendance, fees, health */}
      <div className="grid gap-2.5 md:grid-cols-3">
        {/* Attendance */}
        <div className="space-y-1 rounded-xl bg-white/80 px-3 py-2">
          <div className="text-[11px] font-semibold text-indigo-900">
            5. Attendance story
          </div>
          {attendance ? (
            <p className="text-[11px] text-indigo-900/90">
              Present:{" "}
              <span className="font-semibold">
                {attendance?.daysPresent}
              </span>{" "}
              /{" "}
              <span className="font-semibold">
                {attendance?.totalSchoolDays}
              </span>{" "}
              days.{" "}
              {attendance?.daysAbsent === 0
                ? "Excellent consistency – keep protecting school days as much as possible."
                : attendance?.daysAbsent !== undefined &&
                  attendance.daysAbsent <= 3
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

        {/* Fees */}
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

        {/* Health */}
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

      {/* Simple home support plan */}
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
 * BECE-style report card (same as before, but null-safe)
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
      {/* Header + student meta */}
      <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Ayitikope M/A Basic School
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

        {/* Student + term meta */}
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

      {/* Main body */}
      <div className="grid gap-4 px-4 py-4 lg:grid-cols-[minmax(0,2.1fr)_minmax(0,1.2fr)]">
        {/* LEFT: Subjects table */}
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
                      <tr key={subj.subject} className={rowBg}>
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

        {/* RIGHT: Attendance, fees, health, behaviour */}
        <div className="space-y-3">
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-700">
              Attendance, Fees &amp; Health Summary
            </h3>
            <div className="grid gap-2 text-[11px] lg:grid-cols-1">
              {/* Attendance */}
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
                      <span>{attendance?.daysPresent}</span>
                    </div>
                    <div>
                      <span className="font-semibold">Days Absent:</span>{" "}
                      <span>{attendance?.daysAbsent}</span>
                    </div>
                    <div>
                      <span className="font-semibold">Days Late:</span>{" "}
                      <span>{attendance?.daysLate}</span>
                    </div>
                    <div>
                      <span className="font-semibold">Total School Days:</span>{" "}
                      <span>{attendance?.totalSchoolDays}</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-[11px] text-slate-500">
                    No attendance data recorded yet for this term.
                  </div>
                )}
              </div>

              {/* Fees */}
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="font-semibold text-slate-800">Fees</span>
                </div>
                {fees ? (
                  <div className="grid grid-cols-2 gap-1 text-slate-700">
                    <div>
                      <span className="font-semibold">Total Billed:</span>{" "}
                      <span>
                        GHS{" "}
                        {formatMoneyFromPesewas(
                          fees.totalBilledPesewas ?? 0
                        )}
                      </span>
                    </div>
                    <div>
                      <span className="font-semibold">Total Paid:</span>{" "}
                      <span>
                        GHS{" "}
                        {formatMoneyFromPesewas(fees.totalPaidPesewas ?? 0)}
                      </span>
                    </div>
                    <div>
                      <span className="font-semibold">Waived:</span>{" "}
                      <span>
                        GHS{" "}
                        {formatMoneyFromPesewas(
                          fees.totalWaivedPesewas ?? 0
                        )}
                      </span>
                    </div>
                    <div>
                      <span className="font-semibold">Outstanding:</span>{" "}
                      <span className="font-semibold text-rose-700">
                        GHS{" "}
                        {formatMoneyFromPesewas(
                          fees.outstandingPesewas ?? 0
                        )}
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

              {/* Health */}
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="font-semibold text-slate-800">Health</span>
                </div>
                {health ? (
                  <div className="grid grid-cols-2 gap-1 text-slate-700">
                    <div>
                      <span className="font-semibold">Screenings:</span>{" "}
                      <span>{health?.totalScreenings ?? 0}</span>
                    </div>
                    <div>
                      <span className="font-semibold">Fever Episodes:</span>{" "}
                      <span>{health?.feverCount ?? 0}</span>
                    </div>
                    <div>
                      <span className="font-semibold">Symptoms Logged:</span>{" "}
                      <span>{health?.symptomsCount ?? 0}</span>
                    </div>
                    <div>
                      <span className="font-semibold">Last Screened:</span>{" "}
                      <span>{formatDateNice(health?.lastScreenedAt)}</span>
                    </div>
                    <div className="col-span-2">
                      <span className="font-semibold">Health Flag:</span>{" "}
                      <span>{health?.overallFlag || "—"}</span>
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

          {/* Behaviour & remarks */}
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

/**
 * MAIN PAGE
 */
const ParentReportPage: React.FC = () => {
  const [stage, setStage] = useState<Stage>("PHONE");

  const [guardianPhone, setGuardianPhone] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpToken, setOtpToken] = useState<string | null>(null);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [isRequestingOtp, setIsRequestingOtp] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);

  const [term, setTerm] = useState(DEFAULT_TERM);
  const [academicYear, setAcademicYear] = useState(DEFAULT_YEAR);

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

  // Map childId -> overview student
  const overviewByStudentId = useMemo(() => {
    const map = new Map<string, ParentOverviewStudent>();
    if (overview?.students) {
      for (const s of overview.students) {
        map.set(s.id, s);
      }
    }
    return map;
  }, [overview]);

  async function handleRequestOtp() {
    if (!guardianPhone.trim()) {
      setOtpError("Please enter the phone number registered with the school.");
      return;
    }
    setIsRequestingOtp(true);
    setOtpError(null);
    try {
      const res = await fetch("/api/parent/otp/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guardianPhone: guardianPhone.trim(),
          tenantSlug: DEMO_TENANT_SLUG,
        }),
      });

      const text = await res.text();
      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        data = null;
      }

      if (!res.ok || !data?.ok) {
        console.error(
          "[ParentOTP] Request error:",
          res.status,
          text || data?.error
        );
        setOtpError(
          data?.error ||
            "Failed to send OTP. Please check the number and try again."
        );
        return;
      }

      setOtpToken(data.token);
      setStage("OTP");
    } catch (err) {
      console.error("[ParentOTP] Network error requesting OTP", err);
      setOtpError("Network error requesting OTP. Please try again.");
    } finally {
      setIsRequestingOtp(false);
    }
  }

  async function handleVerifyOtp() {
    if (!otpToken) {
      setOtpError("Please request a code first.");
      return;
    }
    if (!otpCode.trim()) {
      setOtpError("Please enter the code you received.");
      return;
    }

    setIsVerifyingOtp(true);
    setOtpError(null);
    try {
      const res = await fetch("/api/parent/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: otpToken,
          code: otpCode.trim(),
        }),
      });

      const text = await res.text();
      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        data = null;
      }

      if (!res.ok || !data?.ok) {
        console.error(
          "[ParentOTP] Verify error:",
          res.status,
          text || data?.error
        );
        setOtpError(
          data?.error ||
            "Invalid or expired code. Please try again or request a new one."
        );
        return;
      }

      setStage("PORTAL");
      await loadChildrenAndOverview(guardianPhone.trim(), term, academicYear);
    } catch (err) {
      console.error("[ParentOTP] Network error verifying OTP", err);
      setOtpError("Network error verifying code. Please try again.");
    } finally {
      setIsVerifyingOtp(false);
    }
  }

  async function loadChildrenAndOverview(
    phone: string,
    termValue: string,
    yearValue: string
  ) {
    setChildrenLoading(true);
    setOverviewLoading(true);
    setChildrenError(null);
    setOverviewError(null);
    try {
      const childrenUrl = `/api/parent/children?tenantSlug=${encodeURIComponent(
        DEMO_TENANT_SLUG
      )}&guardianPhone=${encodeURIComponent(phone)}`;

      const overviewParams = new URLSearchParams({
        tenantId: DEMO_TENANT_ID,
        guardianPhone: phone,
        term: termValue,
        academicYear: yearValue,
      });
      const overviewUrl = `/api/parent/overview?${overviewParams.toString()}`;

      const [childrenRes, overviewRes] = await Promise.all([
        fetch(childrenUrl),
        fetch(overviewUrl),
      ]);

      const childrenText = await childrenRes.text();
      const overviewText = await overviewRes.text();

      let childrenData: ChildrenResponse | null = null;
      let overviewData: ParentOverviewResponse | null = null;

      try {
        childrenData = JSON.parse(childrenText);
      } catch {
        childrenData = null;
      }

      try {
        overviewData = JSON.parse(overviewText);
      } catch {
        overviewData = null;
      }

      if (!childrenRes.ok || !childrenData?.ok) {
        console.error(
          "[ParentChildren] error",
          childrenRes.status,
          childrenText
        );
        setChildrenError(
          childrenData?.error ||
            "Failed to load children for this phone number."
        );
      } else {
        setChildren(childrenData.students || []);
        if (!selectedChildId && childrenData.students.length > 0) {
          setSelectedChildId(childrenData.students[0].id);
        }
      }

      if (!overviewRes.ok || !overviewData?.ok) {
        console.error(
          "[ParentOverview] error",
          overviewRes.status,
          overviewText
        );
        setOverviewError(
          overviewData?.error ||
            "Failed to load overview for this term and year."
        );
      } else {
        setOverview(overviewData);
      }
    } catch (err) {
      console.error("[ParentPortal] error loading children/overview", err);
      setChildrenError("Network error loading children.");
      setOverviewError("Network error loading overview.");
    } finally {
      setChildrenLoading(false);
      setOverviewLoading(false);
    }
  }

  async function loadReportForSelection(
    studentId: string,
    termValue: string,
    yearValue: string
  ) {
    setReportLoading(true);
    setReportError(null);
    try {
      const params = new URLSearchParams({
        tenantId: DEMO_TENANT_ID,
        studentId,
        term: termValue,
        academicYear: yearValue,
      });
      const url = `/api/parent/report/term?${params.toString()}`;
      const res = await fetch(url);

      const text = await res.text();
      if (!res.ok) {
        console.error(
          "[ParentTermReportPage] HTTP error:",
          res.status,
          text
        );
        setReportError("Failed to load parent term report.");
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
        setReportError("Failed to load parent term report.");
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
  }

  // Whenever we are in PORTAL and selected child/term/year changes, load report
  useEffect(() => {
    if (stage !== "PORTAL") return;
    if (!selectedChildId) {
      setReport(null);
      return;
    }
    loadReportForSelection(selectedChildId, term, academicYear);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, selectedChildId, term, academicYear]);

  function handlePrintCurrent() {
    if (!report) return;
    const params = new URLSearchParams({
      tenantId: report.context.tenantId,
      studentId: report.context.studentId,
      term: report.context.term,
      academicYear: report.context.academicYear,
    });
    const url = `/parent/report/print?${params.toString()}`;
    window.open(url, "_blank");
  }

  // ------------- RENDER --------------

  if (stage === "PHONE") {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="container mx-auto px-4 py-10">
          <div className="mx-auto max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h1 className="text-base font-semibold text-slate-900">
              Parent Term Report &amp; SMS Portal
            </h1>
            <p className="mt-1 text-xs text-slate-600">
              Enter the phone number registered with the school to receive a
              one-time code (OTP). You&apos;ll use this to view your child&apos;s
              BECE-style report, fees, and health summaries.
            </p>

            <div className="mt-4 space-y-2 text-xs">
              <label className="block text-[11px] font-medium text-slate-700">
                Registered Phone Number
              </label>
              <input
                type="tel"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="e.g. 0267496357"
                value={guardianPhone}
                onChange={(e) => setGuardianPhone(e.target.value)}
              />
            </div>

            {otpError && (
              <p className="mt-2 text-[11px] text-rose-600">{otpError}</p>
            )}

            <div className="mt-4 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={handleRequestOtp}
                disabled={isRequestingOtp}
                className="inline-flex w-full items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-xs font-medium text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isRequestingOtp ? "Sending code..." : "Send OTP"}
              </button>
            </div>

            <p className="mt-3 text-[10px] text-slate-500">
              For demo testing, make sure you use the same phone number as in
              the seeded data (e.g.{" "}
              <span className="font-semibold">0267496357</span>{" "}
              for Evelyn Addo).
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (stage === "OTP") {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="container mx-auto px-4 py-10">
          <div className="mx-auto max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h1 className="text-base font-semibold text-slate-900">
              Enter One-Time Code
            </h1>
            <p className="mt-1 text-xs text-slate-600">
              A 6-digit code has been sent to{" "}
              <span className="font-semibold">{guardianPhone}</span>. Enter it
              below to continue.
            </p>

            <div className="mt-4 space-y-2 text-xs">
              <label className="block text-[11px] font-medium text-slate-700">
                One-Time Code
              </label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-center text-base tracking-[0.35em] focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value)}
              />
            </div>

            {otpError && (
              <p className="mt-2 text-[11px] text-rose-600">{otpError}</p>
            )}

            <div className="mt-4 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setStage("PHONE")}
                className="inline-flex items-center justify-center rounded-md border border-slate-300 px-3 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
              >
                Change phone
              </button>
              <button
                type="button"
                onClick={handleVerifyOtp}
                disabled={isVerifyingOtp}
                className="inline-flex flex-1 items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-xs font-medium text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isVerifyingOtp ? "Verifying..." : "Verify &amp; Continue"}
              </button>
            </div>

            <p className="mt-3 text-[10px] text-slate-500">
              Didn&apos;t receive a code? Go back and check that the phone
              number matches the one the school has on record.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // STAGE: PORTAL
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="container mx-auto space-y-5 px-4 py-6">
        {/* Top context bar */}
        <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Parent Portal • Ayitikope M/A Basic School
            </div>
            <div className="text-sm font-semibold text-slate-900">
              BECE-Style Term Report &amp; Health-Aware Summary
            </div>
            <div className="text-[11px] text-slate-600">
              Phone: <span className="font-medium">{guardianPhone}</span>
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
              onClick={() =>
                loadChildrenAndOverview(
                  guardianPhone.trim(),
                  term,
                  academicYear
                )
              }
              className="inline-flex items-center rounded-full border border-slate-300 px-3 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
            >
              Refresh data
            </button>
          </div>
        </div>

        {/* Main grid: children & overview + report + coach */}
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1.7fr)]">
          {/* LEFT COLUMN: Children list + quick overview */}
          <div className="space-y-3">
            <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-xs font-semibold text-slate-900">
                    Your children this term
                  </h2>
                  <p className="text-[11px] text-slate-600">
                    Select a child to view detailed BECE-style report, fees, and
                    health summary.
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
                  No children found for this phone number yet.
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
                              Class:{" "}
                              {child.classroom?.name
                                ? child.classroom.name
                                : "—"}
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

            {/* Overview status */}
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
                            Last health check:{" "}
                            {formatDateNice(s.health.lastDate)}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT COLUMN: BECE report + parent AI coach */}
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
                No report data available yet for this term. Once teachers record
                assessments and the school finalizes report cards, they will
                appear here.
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
