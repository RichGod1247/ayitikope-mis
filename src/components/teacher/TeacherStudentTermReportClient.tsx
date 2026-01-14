// src/components/teacher/TeacherStudentTermReportClient.tsx
"use client";

import React, { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";

type LoadState = "idle" | "loading" | "loaded" | "error";
type ReportResponse = any;

type GesGradeResult = { grade: number; remark: string };

function gesGradeFromPercentage(pct: number | null | undefined): GesGradeResult | null {
  if (pct == null || isNaN(pct)) return null;

  if (pct >= 90 && pct <= 100) return { grade: 1, remark: "Excellent" };
  if (pct >= 80 && pct <= 89) return { grade: 2, remark: "Very Good" };
  if (pct >= 70 && pct <= 79) return { grade: 3, remark: "Good" };
  if (pct >= 60 && pct <= 69) return { grade: 4, remark: "High Average" };
  if (pct >= 55 && pct <= 59) return { grade: 5, remark: "Average" };
  if (pct >= 50 && pct <= 54) return { grade: 6, remark: "Low Average" };
  if (pct >= 40 && pct <= 49) return { grade: 7, remark: "Low Average" };
  if (pct >= 35 && pct <= 39) return { grade: 8, remark: "Lower" };
  if (pct >= 0 && pct <= 34) return { grade: 9, remark: "Lowest / Fail" };
  if (pct > 100) return { grade: 1, remark: "Excellent (scaled)" };
  return { grade: 9, remark: "Lowest / Fail" };
}

export default function TeacherStudentTermReportClient() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const initialStudentId = searchParams.get("studentId") ?? "";
  const initialTerm = searchParams.get("term") ?? "1st Term";
  const initialAcademicYear = searchParams.get("academicYear") ?? "2025/2026";

  const [studentId, setStudentId] = useState<string>(initialStudentId);
  const [term, setTerm] = useState<string>(initialTerm);
  const [academicYear, setAcademicYear] = useState<string>(initialAcademicYear);

  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [report, setReport] = useState<ReportResponse | null>(null);

  async function handleLoadReport(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setLoadError(null);

    const s = studentId.trim();
    const tm = term.trim();
    const yr = academicYear.trim();

    if (!s || !tm || !yr) {
      setLoadError("Please fill student ID, term and academic year.");
      return;
    }

    try {
      setLoadState("loading");

      const params = new URLSearchParams({ studentId: s, term: tm, academicYear: yr });

      const res = await fetch(`/api/teachers/assessment/student-term-report?${params.toString()}`);
      const text = await res.text();

      let json: any;
      try {
        json = JSON.parse(text);
      } catch {
        setLoadState("error");
        setLoadError("Server returned an invalid response. Please try again.");
        return;
      }

      if (!res.ok || !json.ok) {
        const msg = (json && json.error) || `Failed to load report. HTTP ${res.status}.`;
        setLoadState("error");
        setLoadError(String(msg));
        return;
      }

      setReport(json);
      setLoadState("loaded");

      // Bookmarkable (NO tenantId/teacherUserId)
      const newParams = new URLSearchParams({ studentId: s, term: tm, academicYear: yr });
      router.replace(`/teacher/assessment/student-report?${newParams.toString()}`);
    } catch {
      setLoadState("error");
      setLoadError("Something went wrong while loading the report. Please try again.");
    }
  }

  useEffect(() => {
    if (initialStudentId && initialTerm && initialAcademicYear) handleLoadReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const student = report?.student ?? null;
  const classroom = report?.classroom ?? null;

  const studentName: string =
    student?.fullName ||
    (student?.firstName && student?.lastName ? `${student.firstName} ${student.lastName}` : "Learner");

  const classLabel: string = classroom?.name || classroom?.grade || "Class";

  const subjects: any[] = report?.subjects ?? [];
  const overallPercentage: number | null =
    typeof report?.termSummary?.overallPercentage === "number" ? report.termSummary.overallPercentage : null;

  const overallGes = gesGradeFromPercentage(overallPercentage ?? undefined);

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:py-8">
        <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">Per-learner term summary (teacher)</h1>
            <p className="mt-1 text-sm text-slate-600">
              Session-protected teacher report. No tenant/user IDs in URLs.
            </p>
          </div>

          {overallGes && (
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 shadow-sm">
              <div className="text-[11px] text-slate-500">
                Overall average ({term}, {academicYear})
              </div>
              <div className="mt-1 text-lg font-semibold text-slate-900">
                {overallPercentage != null ? `${overallPercentage.toFixed(1)}%` : "—"}
              </div>
              <div className="mt-0.5 text-[11px] text-slate-600">
                Grade {overallGes.grade} – {overallGes.remark}
              </div>
            </div>
          )}
        </header>

        <section className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm text-xs sm:text-sm">
          <h2 className="text-sm font-semibold text-slate-900">Choose learner & term</h2>

          {loadError && (
            <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-700">
              {loadError}
            </div>
          )}

          <form onSubmit={handleLoadReport} className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <label className="block text-[11px] font-medium text-slate-700">Student ID</label>
              <input
                className="w-full rounded border border-slate-300 px-2 py-1 text-xs font-mono"
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                placeholder="Paste a valid Student.id"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-[11px] font-medium text-slate-700">Term</label>
              <input
                className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder="1st Term"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-[11px] font-medium text-slate-700">Academic year</label>
              <input
                className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
                value={academicYear}
                onChange={(e) => setAcademicYear(e.target.value)}
                placeholder="2025/2026"
              />
            </div>

            <div className="sm:col-span-2 flex items-center justify-between pt-1">
              <button
                type="submit"
                disabled={loadState === "loading"}
                className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-60"
              >
                {loadState === "loading" ? "Loading..." : "Load report"}
              </button>
              <p className="text-[11px] text-slate-500">Teacher session is used for tenant scoping.</p>
            </div>
          </form>
        </section>

        {report && (
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm text-xs sm:text-sm">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-semibold text-slate-900">{studentName}</div>
                <div className="text-[11px] text-slate-600">
                  {classLabel} • Term: <span className="font-medium">{term}</span> • Year:{" "}
                  <span className="font-medium">{academicYear}</span>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white overflow-auto">
              <table className="min-w-full border-separate border-spacing-0 text-xs">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="border-b border-slate-200 px-3 py-2 text-left text-[11px] font-semibold text-slate-700">
                      Subject
                    </th>
                    <th className="border-b border-slate-200 px-3 py-2 text-right text-[11px] font-semibold text-slate-700">
                      Total
                    </th>
                    <th className="border-b border-slate-200 px-3 py-2 text-right text-[11px] font-semibold text-slate-700">
                      Max
                    </th>
                    <th className="border-b border-slate-200 px-3 py-2 text-right text-[11px] font-semibold text-slate-700">
                      %
                    </th>
                    <th className="border-b border-slate-200 px-3 py-2 text-center text-[11px] font-semibold text-slate-700">
                      Grade
                    </th>
                    <th className="border-b border-slate-200 px-3 py-2 text-left text-[11px] font-semibold text-slate-700">
                      Remark
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {subjects.map((s: any, idx: number) => {
                    const zebra = idx % 2 ? "bg-slate-50/70" : "bg-white";
                    return (
                      <tr key={`${s.subject}-${idx}`} className={zebra}>
                        <td className="border-b border-slate-100 px-3 py-1.5 text-slate-800">
                          {s.subject ?? "—"}
                        </td>
                        <td className="border-b border-slate-100 px-3 py-1.5 text-right text-slate-800">
                          {typeof s.totalScore === "number" ? s.totalScore.toFixed(1) : "—"}
                        </td>
                        <td className="border-b border-slate-100 px-3 py-1.5 text-right text-slate-800">
                          {typeof s.maxScore === "number" ? s.maxScore.toFixed(1) : "—"}
                        </td>
                        <td className="border-b border-slate-100 px-3 py-1.5 text-right text-slate-800">
                          {typeof s.percentage === "number" ? `${s.percentage.toFixed(1)}%` : "—"}
                        </td>
                        <td className="border-b border-slate-100 px-3 py-1.5 text-center font-semibold text-slate-900">
                          {s.grade ?? "—"}
                        </td>
                        <td className="border-b border-slate-100 px-3 py-1.5 text-slate-700">
                          {s.remark ?? "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
