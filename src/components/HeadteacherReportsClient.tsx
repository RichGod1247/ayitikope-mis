// src/components/HeadteacherReportsClient.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Classroom = {
  id: string;
  name: string;
};

type Props = {
  classrooms: Classroom[];
  defaultTerm: string;
  defaultAcademicYear: string;
};

type ClassTermSummaryResponse = {
  ok: boolean;
  error?: string;
  tenantId?: string;
  classroomId?: string;
  term?: string;
  academicYear?: string;
  subjects?: string[];
  students?: {
    id: string;
    firstName: string;
    lastName: string;
    totalScore: number;
    maxTotalScore: number;
    scoresBySubject: Record<string, number>;
  }[];
  message?: string;
};

type SummaryState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: ClassTermSummaryResponse };

export function HeadteacherReportsClient({
  classrooms,
  defaultTerm,
  defaultAcademicYear,
}: Props) {
  const [selectedClassId, setSelectedClassId] = useState<string>(
    classrooms[0]?.id ?? ""
  );
  const [term, setTerm] = useState<string>(defaultTerm);
  const [academicYear, setAcademicYear] =
    useState<string>(defaultAcademicYear);

  const [state, setState] = useState<SummaryState>({
    status: "idle",
  });

  // Auto-load when classroom / term / year changes
  useEffect(() => {
    if (!selectedClassId || !term || !academicYear) {
      setState({ status: "idle" });
      return;
    }

    let cancelled = false;

    async function load() {
      setState({ status: "loading" });

      try {
        const params = new URLSearchParams({
          classroomId: selectedClassId,
          term,
          academicYear,
        });

        const res = await fetch(
          `/api/headteacher/reports/class-term-summary?${params.toString()}`,
          {
            method: "GET",
          }
        );

        const json: ClassTermSummaryResponse = await res
          .json()
          .catch(() => ({
            ok: false,
            error: "Invalid JSON from server",
          }));

        if (cancelled) return;

        if (!res.ok || !json.ok) {
          setState({
            status: "error",
            message:
              json.error ||
              "Could not load class term summary. Please try again.",
          });
          return;
        }

        setState({
          status: "ready",
          data: json,
        });
      } catch (err) {
        if (cancelled) return;
        setState({
          status: "error",
          message:
            "Network error while loading class term summary. Please check your connection and try again.",
        });
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [selectedClassId, term, academicYear]);

  return (
    <section className="space-y-4">
      {/* Controls */}
      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="grid gap-3 md:grid-cols-3 md:items-end">
          <div className="space-y-1">
            <label className="block text-[11px] font-medium text-slate-700">
              Class
            </label>
            <select
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              {classrooms.length === 0 ? (
                <option value="">No classes found</option>
              ) : (
                classrooms.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))
              )}
            </select>
            {classrooms.length === 0 && (
              <p className="mt-1 text-[10px] text-red-700">
                No classrooms found for this school. Please create
                classrooms and assign learners first.
              </p>
            )}
          </div>

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
        <p className="mt-2 text-[10px] text-slate-500">
          Tip: For your March 31st demo, pick your{" "}
          <span className="font-semibold">JHS class</span> and the
          term you&apos;ve seeded with real assessments. Click{" "}
          <span className="font-semibold">View report</span> on any
          learner to open their full term report.
        </p>
      </div>

      {/* Summary display */}
      <ClassTermSummaryView
        state={state}
        term={term}
        academicYear={academicYear}
      />
    </section>
  );
}

function ClassTermSummaryView({
  state,
  term,
  academicYear,
}: {
  state: SummaryState;
  term: string;
  academicYear: string;
}) {
  if (state.status === "idle") {
    return null;
  }

  if (state.status === "loading") {
    return (
      <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 px-4 py-3 text-[11px] text-emerald-900 shadow-sm">
        Loading class term report…
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="rounded-2xl border border-red-100 bg-red-50/70 px-4 py-3 text-[11px] text-red-900 shadow-sm">
        {state.message}
      </div>
    );
  }

  const data = state.data;
  const subjects = data.subjects || [];
  const students = data.students || [];

  if (students.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <p className="text-[11px] font-semibold text-slate-900">
          No learners or assessment data yet
        </p>
        <p className="mt-1 text-[11px] text-slate-600 max-w-xl">
          {data.message ||
            "Either this class has no learners assigned yet, or no assessment items/scores have been recorded for the selected term and year."}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm overflow-x-auto">
      <p className="text-[11px] font-semibold text-slate-900 mb-2">
        Class term report grid
      </p>
      <p className="text-[10px] text-slate-600 mb-3 max-w-xl">
        Each row is a learner. Each subject shows the{" "}
        <span className="font-semibold">
          total score across all assessments
        </span>{" "}
        for that subject in this term. You also see the overall total
        and maximum possible marks. Use{" "}
        <span className="font-semibold">View report</span> to open a
        full per-learner term report.
      </p>

      <table className="min-w-full text-[11px] border-collapse">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200">
            <th className="px-2 py-1 text-left font-semibold text-slate-600">
              Learner
            </th>
            {subjects.map((subj) => (
              <th
                key={subj}
                className="px-2 py-1 text-left font-semibold text-slate-600"
              >
                {subj}
              </th>
            ))}
            <th className="px-2 py-1 text-left font-semibold text-slate-600">
              Total
            </th>
            <th className="px-2 py-1 text-left font-semibold text-slate-600">
              Max
            </th>
            <th className="px-2 py-1 text-left font-semibold text-slate-600">
              Report
            </th>
          </tr>
        </thead>
        <tbody>
          {students.map((s, idx) => {
            const zebra =
              idx % 2 === 1 ? "bg-slate-50/60" : "bg-white";

            // Build link to the learner term report page with query params
            const href = `/headteacher/reports/student-report?studentId=${encodeURIComponent(
              s.id
            )}&term=${encodeURIComponent(
              term
            )}&academicYear=${encodeURIComponent(academicYear)}`;

            return (
              <tr key={s.id} className={zebra}>
                <td className="px-2 py-1 text-slate-900">
                  <span className="font-semibold">
                    {s.firstName} {s.lastName}
                  </span>
                </td>
                {subjects.map((subj) => {
                  const val = s.scoresBySubject[subj] ?? 0;
                  return (
                    <td
                      key={subj}
                      className="px-2 py-1 text-slate-800"
                    >
                      {val}
                    </td>
                  );
                })}
                <td className="px-2 py-1 text-slate-900 font-semibold">
                  {s.totalScore}
                </td>
                <td className="px-2 py-1 text-slate-600">
                  {s.maxTotalScore}
                </td>
                <td className="px-2 py-1 text-slate-600">
                  <Link
                    href={href}
                    className="inline-flex items-center rounded-lg border border-emerald-600 px-2 py-1 text-[10px] font-semibold text-emerald-700 hover:bg-emerald-50"
                  >
                    View report
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <p className="mt-3 text-[10px] text-slate-500">
        Next steps (future slice): enable direct print & PDF export
        from the learner term report view, plus quick teacher/head
        comments.
      </p>
    </div>
  );
}
