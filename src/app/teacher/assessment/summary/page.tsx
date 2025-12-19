// src/app/teacher/assessment/summary/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";

type LoadState = "idle" | "loading" | "loaded" | "error";
type TermSummaryResponse = any;

const DEFAULT_TENANT_ID = "cmhhnghn00008vcpgp3fl07fl";
const DEFAULT_TERM = "1st Term";
const DEFAULT_ACADEMIC_YEAR = "2025/2026";

// We’ll reuse the exact same GES grading scale used in the parent report
type GesGradeResult = {
  grade: number;
  remark: string;
};

function gesGradeFromPercentage(
  pct: number | null | undefined
): GesGradeResult | null {
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

const TeacherAssessmentTermSummaryPage: React.FC = () => {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Prefills from URL like we did for the parent term report
  const initialTenantId =
    searchParams.get("tenantId") ?? DEFAULT_TENANT_ID;
  const initialTeacherUserId = searchParams.get("teacherUserId") ?? "";
  const initialClassroomId = searchParams.get("classroomId") ?? "";
  const initialTerm = searchParams.get("term") ?? DEFAULT_TERM;
  const initialAcademicYear =
    searchParams.get("academicYear") ?? DEFAULT_ACADEMIC_YEAR;

  const [tenantId, setTenantId] = useState<string>(initialTenantId);
  const [teacherUserId, setTeacherUserId] =
    useState<string>(initialTeacherUserId);
  const [classroomId, setClassroomId] =
    useState<string>(initialClassroomId);
  const [term, setTerm] = useState<string>(initialTerm);
  const [academicYear, setAcademicYear] =
    useState<string>(initialAcademicYear);

  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [summary, setSummary] =
    useState<TermSummaryResponse | null>(null);

  // -------------
  // Load helper
  // -------------
  async function handleLoadSummary(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setLoadError(null);

    const t = tenantId.trim();
    const u = teacherUserId.trim();
    const c = classroomId.trim();
    const tm = term.trim();
    const yr = academicYear.trim();

    if (!t || !u || !c || !tm || !yr) {
      setLoadError(
        "Please fill tenant ID, teacher user ID, classroom ID, term and academic year."
      );
      return;
    }

    try {
      setLoadState("loading");

      const params = new URLSearchParams({
        tenantId: t,
        teacherUserId: u,
        classroomId: c,
        term: tm,
        academicYear: yr,
      });

      const res = await fetch(
        `/api/teacher/assessment/term-summary?${params.toString()}`
      );
      const text = await res.text();

      let json: any;
      try {
        json = JSON.parse(text);
      } catch {
        console.error(
          "[TeacherAssessmentTermSummaryPage] Failed to parse JSON:",
          text
        );
        setLoadState("error");
        setLoadError(
          "Server returned an invalid response. Please try again."
        );
        return;
      }

      if (!res.ok || !json.ok) {
        const msg =
          (json && json.error) ||
          `Failed to load summary. HTTP ${res.status}.`;
        console.error(
          "[TeacherAssessmentTermSummaryPage] API error:",
          msg
        );
        setLoadState("error");
        setLoadError(String(msg));
        return;
      }

      setSummary(json);
      setLoadState("loaded");

      // Update URL so Jason can bookmark/share
      const newParams = new URLSearchParams({
        tenantId: t,
        teacherUserId: u,
        classroomId: c,
        term: tm,
        academicYear: yr,
      });
      router.replace(
        `/teacher/assessment/summary?${newParams.toString()}`
      );
    } catch (err) {
      console.error(
        "[TeacherAssessmentTermSummaryPage] Fetch exception:",
        err
      );
      setLoadState("error");
      setLoadError(
        "Something went wrong while loading the summary. Please try again."
      );
    }
  }

  // Auto-load if URL already has everything
  useEffect(() => {
    if (
      initialTenantId &&
      initialTeacherUserId &&
      initialClassroomId &&
      initialTerm &&
      initialAcademicYear
    ) {
      handleLoadSummary();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -------------
  // Derived data
  // -------------
  const classroom =
    summary?.classroom ??
    summary?.context?.classroom ??
    null;

  const subjects: any[] =
    summary?.summary?.subjects ??
    summary?.subjects ??
    [];

  const overallAveragePct: number | null =
    typeof summary?.summary?.overallAveragePercentage === "number"
      ? summary.summary.overallAveragePercentage
      : typeof summary?.overallAveragePercentage === "number"
      ? summary.overallAveragePercentage
      : null;

  const overallGes = gesGradeFromPercentage(
    overallAveragePct ?? undefined
  );

  const classLabel: string =
    classroom?.name ||
    classroom?.grade ||
    summary?.context?.classroomName ||
    "Class";

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:py-8">
        {/* Header */}
        <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">
              Teacher term summary – class assessments
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Subject-by-subject snapshot of continuous assessment for a
              single class and term. This helps Jason see how his
              learners are performing at a glance, before and after BECE-style
              reports go to parents.
            </p>
          </div>
          {overallGes && (
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 shadow-sm">
              <div className="text-[11px] text-slate-500">
                Overall class average
              </div>
              <div className="mt-1 text-lg font-semibold text-slate-900">
                {overallAveragePct != null
                  ? `${overallAveragePct.toFixed(1)}%`
                  : "—"}
              </div>
              <div className="mt-0.5 text-[11px] text-slate-600">
                Grade {overallGes.grade} – {overallGes.remark}
              </div>
            </div>
          )}
        </header>

        {/* Filter / Load section */}
        <section className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm text-xs sm:text-sm">
          <h2 className="text-sm font-semibold text-slate-900">
            Choose class & term
          </h2>
          <p className="mt-1 text-[11px] text-slate-500">
            In production, these values will be filled automatically
            from Jason&apos;s login and class assignment. Here you can
            override them for testing with real IDs from Prisma.
          </p>

          {loadError && (
            <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-700">
              {loadError}
            </div>
          )}

          <form
            onSubmit={handleLoadSummary}
            className="mt-3 grid gap-3 sm:grid-cols-2"
          >
            <div className="space-y-1">
              <label className="block text-[11px] font-medium text-slate-700">
                Tenant ID
              </label>
              <input
                className="w-full rounded border border-slate-300 px-2 py-1 text-xs font-mono"
                value={tenantId}
                onChange={(e) => setTenantId(e.target.value)}
                placeholder="cmhhnghn00008vcpgp3fl07fl"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-[11px] font-medium text-slate-700">
                Teacher user ID
              </label>
              <input
                className="w-full rounded border border-slate-300 px-2 py-1 text-xs font-mono"
                value={teacherUserId}
                onChange={(e) => setTeacherUserId(e.target.value)}
                placeholder="Use a valid User.id (e.g. HEAD_TEACHER_...)"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-[11px] font-medium text-slate-700">
                Classroom ID
              </label>
              <input
                className="w-full rounded border border-slate-300 px-2 py-1 text-xs font-mono"
                value={classroomId}
                onChange={(e) => setClassroomId(e.target.value)}
                placeholder="Use a valid Classroom.id"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-[11px] font-medium text-slate-700">
                Term
              </label>
              <input
                className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder="1st Term"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-[11px] font-medium text-slate-700">
                Academic year
              </label>
              <input
                className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
                value={academicYear}
                onChange={(e) =>
                  setAcademicYear(e.target.value)
                }
                placeholder="2025/2026"
              />
            </div>

            <div className="sm:col-span-2 flex items-center justify-between pt-1">
              <button
                type="submit"
                disabled={loadState === "loading"}
                className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loadState === "loading"
                  ? "Loading summary..."
                  : "Load summary"}
              </button>
              <p className="text-[11px] text-slate-500">
                Use the same tenant, teacher and classroom IDs you used
                when testing the assessment overview.
              </p>
            </div>
          </form>
        </section>

        {/* Loading text */}
        {loadState === "loading" && (
          <p className="text-xs text-slate-600">
            Loading term summary…
          </p>
        )}

        {/* No data yet */}
        {!summary && loadState === "idle" && (
          <p className="text-xs text-slate-600">
            Load a summary above to see subject-by-subject averages for
            the class.
          </p>
        )}

        {/* Summary grid */}
        {summary && (
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm text-xs sm:text-sm">
            {/* Context bar */}
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-semibold text-slate-900">
                  {classLabel}
                </div>
                <div className="text-[11px] text-slate-600">
                  Term:{" "}
                  <span className="font-medium">{term}</span> •
                  Academic year:{" "}
                  <span className="font-medium">
                    {academicYear}
                  </span>
                </div>
              </div>
              {overallGes && (
                <div className="text-[11px] text-slate-600">
                  Overall:{" "}
                  <span className="font-medium">
                    {overallAveragePct != null
                      ? `${overallAveragePct.toFixed(1)}%`
                      : "—"}
                  </span>{" "}
                  • Grade{" "}
                  <span className="font-medium">
                    {overallGes.grade}
                  </span>{" "}
                  ({overallGes.remark})
                </div>
              )}
            </div>

            {/* Subjects table */}
            <div className="rounded-lg border border-slate-200 bg-white">
              <div className="border-b border-slate-200 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-700">
                Subject averages (class level)
              </div>
              {subjects.length === 0 ? (
                <div className="px-3 py-3 text-[11px] text-slate-600">
                  No assessment summary available yet for this class and
                  term. Once teachers record scores, subject averages
                  will appear here.
                </div>
              ) : (
                <div className="overflow-auto">
                  <table className="min-w-full border-separate border-spacing-0 text-xs">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="border-b border-slate-200 px-3 py-2 text-left text-[11px] font-semibold text-slate-700">
                          Subject
                        </th>
                        <th className="border-b border-slate-200 px-3 py-2 text-center text-[11px] font-semibold text-slate-700">
                          Items
                        </th>
                        <th className="border-b border-slate-200 px-3 py-2 text-right text-[11px] font-semibold text-slate-700">
                          Avg. score
                        </th>
                        <th className="border-b border-slate-200 px-3 py-2 text-right text-[11px] font-semibold text-slate-700">
                          Avg. %
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
                      {subjects.map((subj: any, idx: number) => {
                        const itemCount =
                          subj.itemCount ??
                          subj.assessmentCount ??
                          subj.count ??
                          0;
                        const avgScore =
                          typeof subj.averageScore === "number"
                            ? subj.averageScore
                            : typeof subj.avgScore === "number"
                            ? subj.avgScore
                            : null;
                        const avgPct =
                          typeof subj.averagePercentage === "number"
                            ? subj.averagePercentage
                            : typeof subj.avgPercentage === "number"
                            ? subj.avgPercentage
                            : typeof subj.percentage === "number"
                            ? subj.percentage
                            : avgScore ?? null;
                        const ges =
                          typeof subj.grade === "number" &&
                          subj.remark
                            ? {
                                grade: subj.grade,
                                remark: subj.remark as string,
                              }
                            : gesGradeFromPercentage(avgPct);

                        const zebra =
                          idx % 2 === 1
                            ? "bg-slate-50/70"
                            : "bg-white";

                        return (
                          <tr key={idx} className={zebra}>
                            <td className="border-b border-slate-100 px-3 py-1.5 text-slate-800">
                              {subj.subject ||
                                subj.name ||
                                "—"}
                            </td>
                            <td className="border-b border-slate-100 px-3 py-1.5 text-center text-slate-800">
                              {itemCount}
                            </td>
                            <td className="border-b border-slate-100 px-3 py-1.5 text-right text-slate-800">
                              {avgScore != null
                                ? avgScore.toFixed(1)
                                : "—"}
                            </td>
                            <td className="border-b border-slate-100 px-3 py-1.5 text-right text-slate-800">
                              {avgPct != null
                                ? `${avgPct.toFixed(1)}%`
                                : "—"}
                            </td>
                            <td className="border-b border-slate-100 px-3 py-1.5 text-center font-semibold text-slate-900">
                              {ges ? ges.grade : "—"}
                            </td>
                            <td className="border-b border-slate-100 px-3 py-1.5 text-slate-700">
                              {ges ? ges.remark : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Small GES key at the bottom for Jason */}
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-700">
              <div className="font-semibold mb-1">
                GES grading scale (for quick reference)
              </div>
              <div className="grid gap-1 sm:grid-cols-3">
                <div>1: 90–100% – Excellent</div>
                <div>2: 80–89% – Very Good</div>
                <div>3: 70–79% – Good</div>
                <div>4: 60–69% – High Average</div>
                <div>5: 55–59% – Average</div>
                <div>6: 50–54% – Low Average</div>
                <div>7: 40–49% – Low Average</div>
                <div>8: 35–39% – Lower</div>
                <div>9: 0–34% – Lowest / Fail</div>
              </div>
            </div>
          </section>
        )}
      </div>
    </main>
  );
};

export default TeacherAssessmentTermSummaryPage;
