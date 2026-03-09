"use client";

import { useEffect, useRef, useState } from "react";

type ClassroomDTO = {
  id: string;
  name: string | null;
  grade: string | null;
  arm: string | null;
};

type StudentTermReportResponse = {
  ok: boolean;
  error?: string;
  tenantId?: string;

  student?: {
    id: string;
    firstName: string;
    lastName: string;
    sex: string | null;
    classroomId?: string | null;
    classroom?: ClassroomDTO | null;
  };

  classroom?: ClassroomDTO | null;

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
  tenantName: string;
  defaultTerm: string;
  defaultAcademicYear: string;
};

type ReportState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: StudentTermReportResponse };

function pctStr(p: number | null | undefined) {
  if (p == null || Number.isNaN(p)) return "—";
  return `${p.toFixed(1)}%`;
}

function cleanStr(v: unknown) {
  return String(v ?? "").trim();
}

function looksLikeOpaqueId(value: string) {
  const s = cleanStr(value);
  if (!s) return false;

  // UUID
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)) {
    return true;
  }

  // Long generated IDs like cuid-ish / opaque DB ids
  if (/^[a-z0-9_-]{20,}$/i.test(s)) {
    return true;
  }

  return false;
}

function safeHumanText(value: unknown) {
  const s = cleanStr(value);
  if (!s) return "";
  if (looksLikeOpaqueId(s)) return "";
  return s;
}

function classLabelFrom(c: ClassroomDTO | null | undefined) {
  if (!c) return "";

  const name = safeHumanText(c.name);
  if (name) return name;

  const grade = safeHumanText(c.grade);
  const arm = safeHumanText(c.arm);

  return [grade, arm].filter(Boolean).join(" ").trim();
}

export function HeadteacherStudentReportClient({
  tenantName,
  defaultTerm,
  defaultAcademicYear,
}: Props) {
  const [studentId, setStudentId] = useState<string>("");
  const [term, setTerm] = useState<string>(defaultTerm);
  const [academicYear, setAcademicYear] = useState<string>(defaultAcademicYear);

  const [state, setState] = useState<ReportState>({ status: "idle" });

  const prefilledFromUrlRef = useRef(false);
  const autoLoadedRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const fromUrlStudentId = params.get("studentId");
    const fromUrlTerm = params.get("term");
    const fromUrlYear = params.get("academicYear");

    if (fromUrlStudentId) {
      setStudentId(fromUrlStudentId);
      prefilledFromUrlRef.current = true;
    }
    if (fromUrlTerm) setTerm(fromUrlTerm);
    if (fromUrlYear) setAcademicYear(fromUrlYear);
  }, []);

  async function handleLoad(next?: {
    studentId?: string;
    term?: string;
    academicYear?: string;
  }) {
    const sid = (next?.studentId ?? studentId).trim();
    const tm = (next?.term ?? term).trim();
    const yr = (next?.academicYear ?? academicYear).trim();

    if (!sid || !tm || !yr) {
      setState({
        status: "error",
        message: "Please enter a learner ID and choose term & academic year.",
      });
      return;
    }

    setState({ status: "loading" });

    try {
      const params = new URLSearchParams({
        studentId: sid,
        term: tm,
        academicYear: yr,
      });

      const res = await fetch(
        `/api/headteacher/reports/student-term-report?${params.toString()}`,
        { method: "GET", cache: "no-store" }
      );

      const json: StudentTermReportResponse = await res.json().catch(() => ({
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

      setState({ status: "ready", data: json });
    } catch {
      setState({
        status: "error",
        message:
          "Network error while loading learner report. Please check your connection and try again.",
      });
    }
  }

  useEffect(() => {
    if (!prefilledFromUrlRef.current) return;
    if (autoLoadedRef.current) return;

    const sid = studentId.trim();
    const tm = term.trim();
    const yr = academicYear.trim();

    if (!sid || !tm || !yr) return;

    autoLoadedRef.current = true;
    void handleLoad({ studentId: sid, term: tm, academicYear: yr });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId, term, academicYear]);

  function handlePrint() {
    if (typeof window === "undefined") return;
    window.print();
  }

  const canPrint = state.status === "ready";

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm print:hidden">
        <div className="grid gap-3 md:grid-cols-3 md:items-end">
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
              Coming from the class grid pre-fills ID, term and year.
            </p>
          </div>

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
            onClick={() => void handleLoad()}
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

          {state.status === "error" ? (
            <p className="text-[11px] text-red-700">{state.message}</p>
          ) : null}
          {state.status === "loading" ? (
            <p className="text-[11px] text-emerald-800">Loading…</p>
          ) : null}
        </div>
      </div>

      <div className="print:bg-white print:text-black">
        <LearnerReportView tenantName={tenantName} state={state} />
      </div>
    </section>
  );
}

function LearnerReportView({
  tenantName,
  state,
}: {
  tenantName: string;
  state: ReportState;
}) {
  if (state.status !== "ready") return null;

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
          The server did not return learner details. Please check the learner ID
          and try again.
        </p>
      </div>
    );
  }

  const overallPercentStr = pctStr(overall?.percentage);
  const c = student.classroom ?? data.classroom ?? null;
  const classLabel = classLabelFrom(c);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm print:shadow-none print:border print:border-slate-300 print:rounded-none">
      <div className="border-b border-slate-200 pb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
            {tenantName}
          </p>
          <p className="mt-1 text-[11px] text-slate-600">
            Term report · <span className="font-semibold">{data.term}</span> ·{" "}
            <span className="font-semibold">{data.academicYear}</span>
          </p>

          <p className="mt-2 text-lg font-semibold text-slate-900">
            {student.firstName} {student.lastName}
          </p>

          <div className="mt-0.5 text-[11px] text-slate-600 flex flex-wrap gap-3">
            {student.sex ? (
              <span>
                Sex: <span className="font-semibold">{student.sex}</span>
              </span>
            ) : null}

            {classLabel ? (
              <span>
                Classroom:{" "}
                <span className="font-semibold">{classLabel}</span>
              </span>
            ) : null}
          </div>
        </div>

        <div className="text-right space-y-1">
          <p className="text-[11px] text-slate-600">Overall percentage</p>
          <p className="text-xl font-semibold text-emerald-700">
            {overallPercentStr}
          </p>
          {overall && overall.maxTotalScore > 0 ? (
            <p className="text-[10px] text-slate-500">
              Total:{" "}
              <span className="font-semibold">{overall.totalScore}</span> /{" "}
              {overall.maxTotalScore}
            </p>
          ) : null}
        </div>
      </div>

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
            {subjects.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-2 py-2 text-[11px] text-slate-600">
                  No assessment records yet for this term/year.
                </td>
              </tr>
            ) : (
              subjects.map((subj, idx) => {
                const zebra = idx % 2 === 1 ? "bg-slate-50/60" : "bg-white";
                return (
                  <tr key={subj.subject} className={zebra}>
                    <td className="px-2 py-1 text-slate-900 font-semibold">
                      {subj.subject}
                    </td>
                    <td className="px-2 py-1 text-slate-900">{subj.totalScore}</td>
                    <td className="px-2 py-1 text-slate-700">{subj.maxTotalScore}</td>
                    <td className="px-2 py-1 text-slate-900">
                      {pctStr(subj.percentage)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {subjects.length > 0 ? (
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
                        {it.comment ? (
                          <p className="text-slate-600">Comment: {it.comment}</p>
                        ) : null}
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
      ) : null}
    </div>
  );
}