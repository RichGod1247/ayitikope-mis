// src/components/HeadteacherOverviewClient.tsx
"use client";

import React, { useEffect, useState } from "react";

type ClassSummary = {
  classroomId: string;
  name: string;
  grade?: string | null;
  arm?: string | null;
  studentHealth: {
    totalRecords: number;
    highTempCount: number;
    symptomaticCount: number;
  };
  assessments: {
    totalItems: number;
    lastAssessmentDate: string | null;
  };
};

type TeacherWellbeingRow = {
  id: string;
  userId: string;
  teacherName: string | null;
  weekStart: string;
  stressLevel: number;
  workload: number;
  comments: string | null;
};

type OverviewResponse = {
  ok: boolean;
  filters: {
    tenantId: string;
    date: string;
    term: string;
    academicYear: string;
  };
  classes: ClassSummary[];
  teacherWellbeing: TeacherWellbeingRow[];
};

type HeadteacherOverviewClientProps = {
  tenantId: string;
  initialDate: string; // YYYY-MM-DD for the date input
  defaultTerm: string;
  defaultAcademicYear: string;
};

const TERMS = ["1st Term", "2nd Term", "3rd Term"];

function formatDateLabel(iso?: string | null): string {
  if (!iso) return "-";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "-";
  }
}

export default function HeadteacherOverviewClient({
  tenantId,
  initialDate,
  defaultTerm,
  defaultAcademicYear,
}: HeadteacherOverviewClientProps) {
  const [date, setDate] = useState(initialDate);
  const [term, setTerm] = useState(defaultTerm);
  const [academicYear, setAcademicYear] = useState(defaultAcademicYear);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<OverviewResponse | null>(null);

  async function loadOverview() {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({
        tenantId,
        date,
        term,
        academicYear,
      });

      const res = await fetch(
        `/api/headteacher/overview?${params.toString()}`
      );

      if (!res.ok) {
        const text = await res.text();
        console.error("[HeadteacherOverviewClient] HTTP error", res.status, text);
        setError("Failed to load overview.");
        setData(null);
        return;
      }

      const json = (await res.json()) as OverviewResponse;

      if (!json.ok) {
        console.error("[HeadteacherOverviewClient] ok:false payload", json);
        setError("Server returned an error.");
        setData(null);
        return;
      }

      setData(json);
    } catch (err) {
      console.error("[HeadteacherOverviewClient] load error", err);
      setError("Unexpected error while loading overview.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  // Initial load only
  useEffect(() => {
    loadOverview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalClasses = data?.classes.length ?? 0;
  const totalHealthRecords =
    data?.classes.reduce(
      (sum, c) => sum + c.studentHealth.totalRecords,
      0
    ) ?? 0;
  const totalHighTemp =
    data?.classes.reduce(
      (sum, c) => sum + c.studentHealth.highTempCount,
      0
    ) ?? 0;
  const totalSymptomatic =
    data?.classes.reduce(
      (sum, c) => sum + c.studentHealth.symptomaticCount,
      0
    ) ?? 0;
  const totalAssessItems =
    data?.classes.reduce(
      (sum, c) => sum + c.assessments.totalItems,
      0
    ) ?? 0;

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      {/* Filters */}
      <section className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Filters
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div className="space-y-1">
                <label className="block text-[11px] font-medium text-slate-700">
                  Date
                </label>
                <input
                  type="date"
                  className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="block text-[11px] font-medium text-slate-700">
                  Term
                </label>
                <select
                  className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
                  value={term}
                  onChange={(e) => setTerm(e.target.value)}
                >
                  {TERMS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="block text-[11px] font-medium text-slate-700">
                  Academic Year
                </label>
                <input
                  className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
                  value={academicYear}
                  onChange={(e) => setAcademicYear(e.target.value)}
                  placeholder="e.g. 2025/2026"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {error && (
              <span className="text-[11px] text-red-600">
                {error} Try refresh.
              </span>
            )}
            <button
              type="button"
              onClick={loadOverview}
              disabled={loading}
              className="inline-flex items-center rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Loading…" : "Apply filters"}
            </button>
          </div>
        </div>
      </section>

      {/* Summary cards */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-xs">
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
          <div className="text-[11px] font-medium text-slate-500">
            Classes monitored
          </div>
          <div className="mt-1 text-xl font-semibold text-slate-900">
            {totalClasses}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            Based on tenant classrooms.
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
          <div className="text-[11px] font-medium text-slate-500">
            Health checks recorded today
          </div>
          <div className="mt-1 text-xl font-semibold text-slate-900">
            {totalHealthRecords}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            Sum of all StudentDailyHealth entries.
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
          <div className="text-[11px] font-medium text-slate-500">
            High temperature learners (≥ 37.5°C)
          </div>
          <div className="mt-1 text-xl font-semibold text-amber-700">
            {totalHighTemp}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            Suggests fever / illness risk.
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
          <div className="text-[11px] font-medium text-slate-500">
            Assessment items this term
          </div>
          <div className="mt-1 text-xl font-semibold text-slate-900">
            {totalAssessItems}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            From the new assessment module.
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        {/* Left: Class-by-class health + assessment */}
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-900">
              Class health & learning snapshot
            </h2>
            <div className="text-[11px] text-slate-500">
              Per classroom — daily health + term CA activity
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white text-xs">
            <div className="max-h-[420px] overflow-auto">
              <table className="min-w-full border-separate border-spacing-0 text-xs">
                <thead className="sticky top-0 bg-slate-50">
                  <tr>
                    <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-700">
                      Class
                    </th>
                    <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-700">
                      Health checks
                    </th>
                    <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-700">
                      High temp
                    </th>
                    <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-700">
                      Symptomatic
                    </th>
                    <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-700">
                      CA items (term)
                    </th>
                    <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-700">
                      Last CA date
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data?.classes.map((c, idx) => {
                    const isRisk =
                      c.studentHealth.highTempCount > 0 ||
                      c.studentHealth.symptomaticCount > 0;
                    const isOdd = idx % 2 === 1;
                    return (
                      <tr
                        key={c.classroomId}
                        className={
                          isRisk
                            ? "bg-rose-50"
                            : isOdd
                            ? "bg-slate-50/60"
                            : "bg-white"
                        }
                      >
                        <td className="border-b border-slate-100 px-3 py-2 align-top">
                          <div className="font-medium text-slate-900">
                            {c.name}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {c.grade || ""}{" "}
                            {c.arm ? `• ${c.arm}` : ""}
                          </div>
                        </td>
                        <td className="border-b border-slate-100 px-3 py-2 align-top">
                          {c.studentHealth.totalRecords}
                        </td>
                        <td className="border-b border-slate-100 px-3 py-2 align-top">
                          {c.studentHealth.highTempCount}
                        </td>
                        <td className="border-b border-slate-100 px-3 py-2 align-top">
                          {c.studentHealth.symptomaticCount}
                        </td>
                        <td className="border-b border-slate-100 px-3 py-2 align-top">
                          {c.assessments.totalItems}
                        </td>
                        <td className="border-b border-slate-100 px-3 py-2 align-top">
                          {formatDateLabel(
                            c.assessments.lastAssessmentDate
                          )}
                        </td>
                      </tr>
                    );
                  })}

                  {data && data.classes.length === 0 && (
                    <tr>
                      <td
                        className="px-3 py-4 text-center text-xs text-slate-500"
                        colSpan={6}
                      >
                        No classrooms found for this tenant yet.
                      </td>
                    </tr>
                  )}

                  {!data && !loading && (
                    <tr>
                      <td
                        className="px-3 py-4 text-center text-xs text-slate-500"
                        colSpan={6}
                      >
                        No data loaded.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Right: Teacher wellbeing */}
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-900">
              Teacher wellbeing (this week)
            </h2>
            <div className="text-[11px] text-slate-500">
              From TeacherHealthWeekly entries
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white text-xs">
            <div className="max-h-[420px] overflow-auto">
              <table className="min-w-full border-separate border-spacing-0 text-xs">
                <thead className="sticky top-0 bg-slate-50">
                  <tr>
                    <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-700">
                      Teacher
                    </th>
                    <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-700">
                      Stress
                    </th>
                    <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-700">
                      Workload
                    </th>
                    <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-700">
                      Notes
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data?.teacherWellbeing.map((t, idx) => {
                    const isOdd = idx % 2 === 1;
                    return (
                      <tr
                        key={t.id}
                        className={
                          isOdd ? "bg-slate-50/60" : "bg-white"
                        }
                      >
                        <td className="border-b border-slate-100 px-3 py-2 align-top">
                          <div className="font-medium text-slate-900">
                            {t.teacherName || "(Unnamed teacher)"}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            Week of {formatDateLabel(t.weekStart)}
                          </div>
                        </td>
                        <td className="border-b border-slate-100 px-3 py-2 align-top">
                          {t.stressLevel}
                        </td>
                        <td className="border-b border-slate-100 px-3 py-2 align-top">
                          {t.workload}
                        </td>
                        <td className="border-b border-slate-100 px-3 py-2 align-top">
                          {t.comments || "-"}
                        </td>
                      </tr>
                    );
                  })}

                  {data && data.teacherWellbeing.length === 0 && (
                    <tr>
                      <td
                        className="px-3 py-4 text-center text-xs text-slate-500"
                        colSpan={4}
                      >
                        No wellbeing entries recorded for this week yet.
                      </td>
                    </tr>
                  )}

                  {!data && !loading && (
                    <tr>
                      <td
                        className="px-3 py-4 text-center text-xs text-slate-500"
                        colSpan={4}
                      >
                        No data loaded.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>

      {loading && (
        <div className="text-xs text-slate-500">
          Loading headteacher overview…
        </div>
      )}
    </div>
  );
}
