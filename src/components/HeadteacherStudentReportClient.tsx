// src/components/HeadteacherStudentReportClient.tsx
"use client";

import { useEffect, useState } from "react";

type StudentTermReportResponse = {
  ok: boolean;
  error?: string;
  tenantId?: string;
  student?: {
    id: string;
    firstName: string;
    lastName: string;
    sex: string;
    classroomId?: string | null;
  };
  term?: string;
  academicYear?: string;
  subjects?: {
    subject: string;
    totalScore: number;
    maxTotalScore: number;
    percentage: number | null;
    items: {
      id: string;
      title: string;
      maxScore: number;
      score: number;
      comment: string | null;
    }[];
  }[];
  overall?: {
    totalScore: number;
    maxTotalScore: number;
    percentage: number | null;
  };
  message?: string;
};

type Props = {
  defaultTerm: string;
  defaultAcademicYear: string;
};

type ReportState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: StudentTermReportResponse };

export function HeadteacherStudentReportClient({
  defaultTerm,
  defaultAcademicYear,
}: Props) {
  const [studentId, setStudentId] = useState<string>("");
  const [term, setTerm] = useState<string>(defaultTerm);
  const [academicYear, setAcademicYear] =
    useState<string>(defaultAcademicYear);
  const [state, setState] = useState<ReportState>({
    status: "idle",
  });

  // Read ?studentId=&term=&academicYear= from URL (if present)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);

    const fromUrlStudentId = params.get("studentId");
    const fromUrlTerm = params.get("term");
    const fromUrlYear = params.get("academicYear");

    if (fromUrlStudentId) {
      setStudentId(fromUrlStudentId);
    }
    if (fromUrlTerm) {
      setTerm(fromUrlTerm);
    }
    if (fromUrlYear) {
      setAcademicYear(fromUrlYear);
    }
  }, []);

  async function handleLoad() {
    if (!studentId.trim() || !term || !academicYear) {
      setState({
        status: "error",
        message:
          "Please enter a learner ID and choose term & academic year.",
      });
      return;
    }

    setState({ status: "loading" });

    try {
      const params = new URLSearchParams({
        studentId: studentId.trim(),
        term,
        academicYear,
      });

      const res = await fetch(
        `/api/headteacher/reports/student-term-report?${params.toString()}`,
        {
          method: "GET",
        }
      );

      const json: StudentTermReportResponse = await res
        .json()
        .catch(() => ({
          ok: false,
          error: "Invalid JSON from server",
        }));

      if (!res.ok || !json.ok) {
        setState({
          status: "error",
          message:
            json.error ||
            "Could not load learner report. Please check the learner ID and try again.",
        });
        return;
      }

      setState({
        status: "ready",
        data: json,
      });
    } catch (err) {
      setState({
        status: "error",
        message:
          "Network error while loading learner report. Please check your connection and try again.",
      });
    }
  }

  function handlePrint() {
    if (typeof window === "undefined") return;
    window.print();
  }

  const canPrint = state.status === "ready";

  return (
    <section className="space-y-4">
      {/* Controls */}
      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm print:hidden">
        <div className="grid gap-3 md:grid-cols-3 md:items-end">
          {/* Student ID */}
          <div className="space-y-1 md:col-span-2">
            <label className="block text-[11px] font-medium text-slate-700">
              Learner ID
            </label>
            <input
              type="text"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
              placeholder="Paste learner ID (e.g. from attendance/fees views)"
            />
            <p className="text-[10px] text-slate-500">
              When you come from the{" "}
              <span className="font-semibold">
                class term report grid
              </span>
              , this ID, term and academic year will be pre-filled for
              you. You can still adjust them manually.
            </p>
          </div>

          {/* Term & Year */}
          <div className="space-y-2">
            <div className="space-y-1">
              <label className="block text-[11px] font-medium text-slate-700">
                Term
              </label>
              <select
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                <option value="1st Term">1st Term</option>
                <option value="2nd Term">2nd Term</option>
                <option value="3rd Term">3rd Term</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="block text-[11px] font-medium text-slate-700">
                Academic year
              </label>
              <input
                type="text"
                value={academicYear}
                onChange={(e) => setAcademicYear(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                placeholder="e.g. 2025/2026"
              />
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleLoad}
            className="inline-flex items-center rounded-xl bg-emerald-600 px-4 py-2 text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-700"
          >
            Load term report
          </button>

          <button
            type="button"
            onClick={handlePrint}
            disabled={!canPrint}
            className="inline-flex items-center rounded-xl border border-emerald-600 px-4 py-2 text-[11px] font-semibold text-emerald-700 shadow-sm hover:bg-emerald-50 disabled:opacity-60"
          >
            Print / Save as PDF
          </button>

          <p className="text-[10px] text-slate-500">
            After loading a learner&apos;s report, use{" "}
            <span className="font-semibold">
              Print / Save as PDF
            </span>{" "}
            to generate a physical copy or PDF export from your
            browser.
          </p>
        </div>

        {state.status === "error" && (
          <p className="mt-2 text-[11px] text-red-700">
            {state.message}
          </p>
        )}
        {state.status === "loading" && (
          <p className="mt-2 text-[11px] text-emerald-800">
            Loading learner report…
          </p>
        )}
      </div>

      {/* Printable report */}
      <div className="print:bg-white print:text-black">
        <LearnerReportView state={state} />
      </div>
    </section>
  );
}

function LearnerReportView({ state }: { state: ReportState }) {
  if (state.status !== "ready") {
    return null;
  }

  const data = state.data;
  const student = data.student;
  const subjects = data.subjects || [];
  const overall = data.overall;

  if (!student) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <p className="text-[11px] font-semibold text-slate-900">
          No learner data
        </p>
        <p className="mt-1 text-[11px] text-slate-600">
          The server did not return learner details. Please check the
          learner ID and try again.
        </p>
      </div>
    );
  }

  // Compute overall percentage as 0–100 string
  const overallPercentStr =
    overall && overall.percentage !== null
      ? (overall.percentage * 100).toFixed(1) + "%"
      : "—";

  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm print:shadow-none print:border print:border-slate-300 print:rounded-none">
      {/* Top header – printable look */}
      <div className="border-b border-slate-200 pb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
            Term report · {data.term} · {data.academicYear}
          </p>
          <p className="mt-1 text-lg font-semibold text-slate-900">
            {student.firstName} {student.lastName}
          </p>
          <div className="mt-0.5 text-[11px] text-slate-600 flex flex-wrap gap-3">
            {student.sex && (
              <span>
                Sex:{" "}
                <span className="font-semibold">
                  {student.sex}
                </span>
              </span>
            )}
            {student.classroomId && (
              <span>
                Classroom ID:{" "}
                <span className="font-semibold">
                  {student.classroomId}
                </span>
              </span>
            )}
          </div>
        </div>
        <div className="text-right space-y-1">
          <p className="text-[11px] text-slate-600">
            Overall percentage
          </p>
          <p className="text-xl font-semibold text-emerald-700">
            {overallPercentStr}
          </p>
          {overall && overall.maxTotalScore > 0 && (
            <p className="text-[10px] text-slate-500">
              Total:{" "}
              <span className="font-semibold">
                {overall.totalScore}
              </span>{" "}
              / {overall.maxTotalScore}
            </p>
          )}
        </div>
      </div>

      {/* Subject summary table */}
      <div className="mt-3 overflow-x-auto">
        <table className="min-w-full text-[11px] border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-2 py-1 text-left font-semibold text-slate-600">
                Subject
              </th>
              <th className="px-2 py-1 text-left font-semibold text-slate-600">
                Total score
              </th>
              <th className="px-2 py-1 text-left font-semibold text-slate-600">
                Max score
              </th>
              <th className="px-2 py-1 text-left font-semibold text-slate-600">
                Percentage
              </th>
            </tr>
          </thead>
          <tbody>
            {subjects.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="px-2 py-2 text-[11px] text-slate-600"
                >
                  No assessment records have been captured yet for this
                  learner in the selected term and academic year.
                </td>
              </tr>
            )}
            {subjects.map((subj, idx) => {
              const zebra =
                idx % 2 === 1 ? "bg-slate-50/60" : "bg-white";
              const subjPct =
                subj.percentage !== null
                  ? (subj.percentage * 100).toFixed(1) + "%"
                  : "—";

              return (
                <tr key={subj.subject} className={zebra}>
                  <td className="px-2 py-1 text-slate-900">
                    <span className="font-semibold">
                      {subj.subject}
                    </span>
                  </td>
                  <td className="px-2 py-1 text-slate-900">
                    {subj.totalScore}
                  </td>
                  <td className="px-2 py-1 text-slate-700">
                    {subj.maxTotalScore}
                  </td>
                  <td className="px-2 py-1 text-slate-900">
                    {subjPct}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Detailed items per subject */}
      {subjects.length > 0 && (
        <div className="mt-4 space-y-3">
          {subjects.map((subj) => (
            <div
              key={subj.subject}
              className="rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2"
            >
              <p className="text-[11px] font-semibold text-slate-800">
                {subj.subject} ·{" "}
                <span className="font-normal text-slate-600">
                  total {subj.totalScore} / {subj.maxTotalScore}
                </span>
              </p>
              <div className="mt-1 grid gap-1 text-[10px]">
                {subj.items.length === 0 ? (
                  <p className="text-slate-600">
                    No individual assessments recorded yet.
                  </p>
                ) : (
                  subj.items.map((it) => (
                    <div
                      key={it.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 bg-white px-2 py-1"
                    >
                      <div className="flex-1 min-w-[10rem]">
                        <p className="font-semibold text-slate-800">
                          {it.title || "Assessment"}
                        </p>
                        {it.comment && (
                          <p className="text-slate-600">
                            Comment: {it.comment}
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-slate-900">
                          {it.score} / {it.maxScore}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="mt-4 text-[10px] text-slate-500 print:hidden">
        Tip: Use your browser&apos;s{" "}
        <span className="font-semibold">Print</span> option to select a
        printer or{" "}
        <span className="font-semibold">Save as PDF</span>. In a
        future slice, we&apos;ll add branded school headers and
        signature spaces.
      </p>
    </div>
  );
}
