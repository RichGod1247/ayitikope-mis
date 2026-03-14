//src/components/HeadteacherStudentReportClient.tsx
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

  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)) {
    return true;
  }

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
      <div className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] px-4 py-4 shadow-[0_18px_60px_rgba(0,0,0,0.18)] backdrop-blur-xl print:hidden">
        <div className="grid gap-3 md:grid-cols-3 md:items-end">
          <div className="space-y-1 md:col-span-2">
            <label className="block text-[11px] font-medium text-[#C9CDD6]">
              Learner ID
            </label>
            <input
              type="text"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-[#07111F] px-3 py-2 text-xs text-[#F7F4ED] placeholder:text-[#738095] focus:outline-none focus:ring-2 focus:ring-emerald-400/20"
              placeholder="Paste learner ID (e.g. from attendance/fees views)"
            />
            <p className="text-[10px] text-[#8F98A8]">
              Coming from the class grid pre-fills ID, term and year.
            </p>
          </div>

          <div className="space-y-2">
            <div className="space-y-1">
              <label className="block text-[11px] font-medium text-[#C9CDD6]">
                Term
              </label>
              <select
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-[#07111F] px-3 py-2 text-xs text-[#F7F4ED] focus:outline-none focus:ring-2 focus:ring-emerald-400/20"
              >
                <option value="1st Term">1st Term</option>
                <option value="2nd Term">2nd Term</option>
                <option value="3rd Term">3rd Term</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="block text-[11px] font-medium text-[#C9CDD6]">
                Academic year
              </label>
              <input
                type="text"
                value={academicYear}
                onChange={(e) => setAcademicYear(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-[#07111F] px-3 py-2 text-xs text-[#F7F4ED] placeholder:text-[#738095] focus:outline-none focus:ring-2 focus:ring-emerald-400/20"
                placeholder="e.g. 2025/2026"
              />
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void handleLoad()}
            className="inline-flex items-center rounded-xl bg-[linear-gradient(135deg,#D4AF37,#E8C96A)] px-4 py-2 text-[11px] font-semibold text-[#071A3D] shadow-[0_18px_50px_rgba(212,175,55,0.22)]"
          >
            Load term report
          </button>

          <button
            type="button"
            onClick={handlePrint}
            disabled={!canPrint}
            className="inline-flex items-center rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-[11px] font-semibold text-[#F7F4ED] hover:bg-white/10 disabled:opacity-60"
          >
            Print / Save as PDF
          </button>

          {state.status === "error" ? (
            <p className="text-[11px] text-rose-200">{state.message}</p>
          ) : null}
          {state.status === "loading" ? (
            <p className="text-[11px] text-emerald-100">Loading…</p>
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
      <div className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] px-4 py-3 shadow-[0_18px_60px_rgba(0,0,0,0.18)] backdrop-blur-xl">
        <p className="text-[11px] font-semibold text-[#F7F4ED]">
          No learner data
        </p>
        <p className="mt-1 text-[11px] text-[#C9CDD6]">
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
    <div className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(5,7,11,0.92),rgba(7,26,61,0.94),rgba(5,7,11,0.96))] px-4 py-4 shadow-[0_26px_90px_rgba(0,0,0,0.28)] print:rounded-none print:border print:border-slate-300 print:bg-white print:px-4 print:py-4 print:text-black print:shadow-none">
      <div className="flex flex-col gap-3 border-b border-white/10 pb-3 print:border-slate-200 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#E8C96A] print:text-slate-600">
            {tenantName}
          </p>
          <p className="mt-1 text-[11px] text-[#C9CDD6] print:text-slate-600">
            Term report · <span className="font-semibold text-[#F7F4ED] print:text-slate-900">{data.term}</span> ·{" "}
            <span className="font-semibold text-[#F7F4ED] print:text-slate-900">{data.academicYear}</span>
          </p>

          <p className="mt-2 text-lg font-semibold text-[#F7F4ED] print:text-slate-900">
            {student.firstName} {student.lastName}
          </p>

          <div className="mt-0.5 flex flex-wrap gap-3 text-[11px] text-[#C9CDD6] print:text-slate-600">
            {student.sex ? (
              <span>
                Sex: <span className="font-semibold text-[#F7F4ED] print:text-slate-900">{student.sex}</span>
              </span>
            ) : null}

            {classLabel ? (
              <span>
                Classroom:{" "}
                <span className="font-semibold text-[#F7F4ED] print:text-slate-900">{classLabel}</span>
              </span>
            ) : null}
          </div>
        </div>

        <div className="space-y-1 text-right">
          <p className="text-[11px] text-[#C9CDD6] print:text-slate-600">Overall percentage</p>
          <p className="text-xl font-semibold text-emerald-200 print:text-emerald-700">
            {overallPercentStr}
          </p>
          {overall && overall.maxTotalScore > 0 ? (
            <p className="text-[10px] text-[#8F98A8] print:text-slate-500">
              Total:{" "}
              <span className="font-semibold text-[#F7F4ED] print:text-slate-900">{overall.totalScore}</span> /{" "}
              {overall.maxTotalScore}
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="min-w-full border-collapse text-[11px]">
          <thead>
            <tr className="border-b border-white/10 bg-white/5 print:border-slate-200 print:bg-slate-50">
              <th className="px-2 py-1 text-left font-semibold text-[#E8C96A] print:text-slate-600">
                Subject
              </th>
              <th className="px-2 py-1 text-left font-semibold text-[#E8C96A] print:text-slate-600">
                Total score
              </th>
              <th className="px-2 py-1 text-left font-semibold text-[#E8C96A] print:text-slate-600">
                Max score
              </th>
              <th className="px-2 py-1 text-left font-semibold text-[#E8C96A] print:text-slate-600">
                Percentage
              </th>
            </tr>
          </thead>
          <tbody>
            {subjects.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-2 py-2 text-[11px] text-[#C9CDD6] print:text-slate-600">
                  No assessment records yet for this term/year.
                </td>
              </tr>
            ) : (
              subjects.map((subj, idx) => {
                const zebra = idx % 2 === 1 ? "bg-white/[0.03] print:bg-slate-50/60" : "bg-transparent print:bg-white";
                return (
                  <tr key={subj.subject} className={zebra}>
                    <td className="px-2 py-1 font-semibold text-[#F7F4ED] print:text-slate-900">
                      {subj.subject}
                    </td>
                    <td className="px-2 py-1 text-[#F7F4ED] print:text-slate-900">{subj.totalScore}</td>
                    <td className="px-2 py-1 text-[#C9CDD6] print:text-slate-700">{subj.maxTotalScore}</td>
                    <td className="px-2 py-1 text-[#F7F4ED] print:text-slate-900">
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
              className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 print:border-slate-100 print:bg-slate-50/70"
            >
              <p className="text-[11px] font-semibold text-[#F7F4ED] print:text-slate-800">
                {subj.subject} ·{" "}
                <span className="font-normal text-[#C9CDD6] print:text-slate-600">
                  total {subj.totalScore} / {subj.maxTotalScore}
                </span>
              </p>

              <div className="mt-1 grid gap-1 text-[10px]">
                {subj.items.length === 0 ? (
                  <p className="text-[#C9CDD6] print:text-slate-600">
                    No individual assessments recorded yet.
                  </p>
                ) : (
                  subj.items.map((it) => (
                    <div
                      key={it.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-[#07111F]/80 px-2 py-1 print:border-slate-100 print:bg-white"
                    >
                      <div className="min-w-[10rem] flex-1">
                        <p className="font-semibold text-[#F7F4ED] print:text-slate-800">
                          {it.title || "Assessment"}
                        </p>
                        {it.comment ? (
                          <p className="text-[#C9CDD6] print:text-slate-600">Comment: {it.comment}</p>
                        ) : null}
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-[#F7F4ED] print:text-slate-900">
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