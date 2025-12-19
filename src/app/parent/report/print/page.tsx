"use client";

import React, { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

// --- Types (copied/adapted from parent/report/page.tsx) ---

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

// --- Helpers (same behaviour as in parent/report/page.tsx) ---

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

// --- BECE Report Card (same visual as parent portal) ---

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
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm print:shadow-none">
      {/* Header */}
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

      {/* Body */}
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
          {/* Attendance + Fees + Health */}
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
                        GHS {formatMoneyFromPesewas(fees.totalBilledPesewas)}
                      </span>
                    </div>
                    <div>
                      <span className="font-semibold">Total Paid:</span>{" "}
                      <span>
                        GHS {formatMoneyFromPesewas(fees.totalPaidPesewas)}
                      </span>
                    </div>
                    <div>
                      <span className="font-semibold">Waived:</span>{" "}
                      <span>
                        GHS {formatMoneyFromPesewas(fees.totalWaivedPesewas)}
                      </span>
                    </div>
                    <div>
                      <span className="font-semibold">Outstanding:</span>{" "}
                      <span className="font-semibold text-rose-700">
                        GHS {formatMoneyFromPesewas(fees.outstandingPesewas)}
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
                      <span>{health.totalScreenings}</span>
                    </div>
                    <div>
                      <span className="font-semibold">Fever Episodes:</span>{" "}
                      <span>{health.feverCount}</span>
                    </div>
                    <div>
                      <span className="font-semibold">Symptoms Logged:</span>{" "}
                      <span>{health.symptomsCount}</span>
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

// --- Page component ---

const ParentReportPrintPage: React.FC = () => {
  const searchParams = useSearchParams();

  const [report, setReport] = useState<ParentTermReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load report from API using query params
  useEffect(() => {
    const tenantId = searchParams.get("tenantId") || "";
    const studentId = searchParams.get("studentId") || "";
    const term = searchParams.get("term") || "";
    const academicYear = searchParams.get("academicYear") || "";

    if (!tenantId || !studentId || !term || !academicYear) {
      setError("Missing report parameters. Please open this page from the parent portal.");
      setLoading(false);
      return;
    }

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          tenantId,
          studentId,
          term,
          academicYear,
        });
        const url = `/api/parent/report/term?${params.toString()}`;
        const res = await fetch(url);

        const text = await res.text();
        if (!res.ok) {
          console.error(
            "[ParentReportPrint] HTTP error:",
            res.status,
            text
          );
          setError("Failed to load term report.");
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
          setError("Failed to load term report.");
          setReport(null);
          return;
        }

        setReport(data);
      } catch (err) {
        console.error("[ParentReportPrint] error loading report", err);
        setError("Network error loading term report.");
        setReport(null);
      } finally {
        setLoading(false);
      }
    };

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Auto-print when report is ready
  useEffect(() => {
    if (!loading && report && typeof window !== "undefined") {
      const timer = setTimeout(() => {
        window.print();
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [loading, report]);

  return (
    <div className="min-h-screen bg-slate-100 py-4 print:bg-white print:py-0">
      <div className="mx-auto max-w-4xl px-3 pb-4 print:max-w-full print:px-0">
        {/* Top bar only visible on screen, not on printed paper */}
        <div className="mb-3 flex items-center justify-between gap-2 text-xs text-slate-600 print:hidden">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
              EduLife OS • Parent Report
            </div>
            <div className="text-[11px] text-slate-600">
              This view is optimised for A4 printing. Use your browser&apos;s print dialog.
            </div>
          </div>
          <button
            type="button"
            onClick={() => window.print()}
            disabled={loading || !!error || !report}
            className="rounded-full border border-slate-300 bg-white px-3 py-1 text-[11px] font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Print now
          </button>
        </div>

        {loading ? (
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-center text-[11px] text-slate-600">
            Loading report for printing…
          </div>
        ) : error ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-6 text-center text-[11px] text-rose-700">
            {error}
          </div>
        ) : !report ? (
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-center text-[11px] text-slate-600">
            No report data available to print.
          </div>
        ) : (
          <BeceReportCard report={report} />
        )}
      </div>
    </div>
  );
};

export default ParentReportPrintPage;
