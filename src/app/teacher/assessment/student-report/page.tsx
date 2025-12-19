// src/app/teacher/assessment/student-report/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";

type LoadState = "idle" | "loading" | "loaded" | "error";

// We’ll keep the response flexible to avoid TS fights
type ParentTermReportResponse = any;

const DEFAULT_TENANT_ID = "cmhhnghn00008vcpgp3fl07fl";
const DEFAULT_TERM = "1st Term";
const DEFAULT_ACADEMIC_YEAR = "2025/2026";

// Same GES grading scale we used for parent term report
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

const TeacherStudentTermReportPage: React.FC = () => {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Read initial values from the URL if present
  const initialTenantId =
    searchParams.get("tenantId") ?? DEFAULT_TENANT_ID;
  const initialStudentId = searchParams.get("studentId") ?? "";
  const initialTerm = searchParams.get("term") ?? DEFAULT_TERM;
  const initialAcademicYear =
    searchParams.get("academicYear") ?? DEFAULT_ACADEMIC_YEAR;

  const [tenantId, setTenantId] = useState<string>(initialTenantId);
  const [studentId, setStudentId] = useState<string>(initialStudentId);
  const [term, setTerm] = useState<string>(initialTerm);
  const [academicYear, setAcademicYear] =
    useState<string>(initialAcademicYear);

  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [report, setReport] =
    useState<ParentTermReportResponse | null>(null);

  // -------------
  // Load helper
  // -------------
  async function handleLoadReport(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setLoadError(null);

    const t = tenantId.trim();
    const s = studentId.trim();
    const tm = term.trim();
    const yr = academicYear.trim();

    if (!t || !s || !tm || !yr) {
      setLoadError(
        "Please fill tenant ID, student ID, term and academic year."
      );
      return;
    }

    try {
      setLoadState("loading");

      const params = new URLSearchParams({
        tenantId: t,
        studentId: s,
        term: tm,
        academicYear: yr,
      });

      const res = await fetch(
        `/api/parent/report/term?${params.toString()}`
      );
      const text = await res.text();

      let json: any;
      try {
        json = JSON.parse(text);
      } catch {
        console.error(
          "[TeacherStudentTermReportPage] Failed to parse JSON:",
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
          `Failed to load report. HTTP ${res.status}.`;
        console.error(
          "[TeacherStudentTermReportPage] API error:",
          msg
        );
        setLoadState("error");
        setLoadError(String(msg));
        return;
      }

      setReport(json);
      setLoadState("loaded");

      // Update URL so Jason can bookmark/share
      const newParams = new URLSearchParams({
        tenantId: t,
        studentId: s,
        term: tm,
        academicYear: yr,
      });
      router.replace(
        `/teacher/assessment/student-report?${newParams.toString()}`
      );
    } catch (err) {
      console.error(
        "[TeacherStudentTermReportPage] Fetch exception:",
        err
      );
      setLoadState("error");
      setLoadError(
        "Something went wrong while loading the report. Please try again."
      );
    }
  }

  // Auto-load if URL has everything
  useEffect(() => {
    if (initialTenantId && initialStudentId && initialTerm && initialAcademicYear) {
      handleLoadReport();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -------------
  // Derived data from report
  // -------------
  const student = report?.student ?? null;
  const classroom = report?.classroom ?? null;

  const studentName: string =
    student?.fullName ||
    (student?.firstName && student?.lastName
      ? `${student.firstName} ${student.lastName}`
      : student?.firstName ||
        student?.lastName ||
        "Learner");

  const classLabel: string =
    classroom?.name ||
    classroom?.grade ||
    report?.context?.classroomName ||
    "Class";

  const subjects: any[] =
    report?.subjects ??
    report?.termSummary?.subjects ??
    [];

  const overallPercentage: number | null =
    typeof report?.termSummary?.overallPercentage === "number"
      ? report.termSummary.overallPercentage
      : typeof report?.overallPercentage === "number"
      ? report.overallPercentage
      : null;

  const overallGes = gesGradeFromPercentage(
    overallPercentage ?? undefined
  );

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:py-8">
        {/* Header */}
        <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">
              Per-learner term summary (teacher view)
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Quick BECE-style snapshot for a single learner: subject scores,
              percentages, grades and remarks – for classroom use by Jason and
              other teachers.
            </p>
          </div>
          {overallGes && (
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 shadow-sm">
              <div className="text-[11px] text-slate-500">
                Overall average ({term}, {academicYear})
              </div>
              <div className="mt-1 text-lg font-semibold text-slate-900">
                {overallPercentage != null
                  ? `${overallPercentage.toFixed(1)}%`
                  : "—"}
              </div>
              <div className="mt-0.5 text-[11px] text-slate-600">
                Grade {overallGes.grade} – {overallGes.remark}
              </div>
            </div>
          )}
        </header>

        {/* Filter / load section */}
        <section className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm text-xs sm:text-sm">
          <h2 className="text-sm font-semibold text-slate-900">
            Choose learner & term
          </h2>
          <p className="mt-1 text-[11px] text-slate-500">
            In real use, the student list would be chosen from Jason&apos;s class
            roster. For now, you can paste a known Student.id from Prisma
            (e.g. Evelyn Addo&apos;s ID) to test.
          </p>

          {loadError && (
            <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-700">
              {loadError}
            </div>
          )}

          <form
            onSubmit={handleLoadReport}
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
                Student ID
              </label>
              <input
                className="w-full rounded border border-slate-300 px-2 py-1 text-xs font-mono"
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                placeholder="Paste a valid Student.id (e.g. Evelyn Addo)"
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
                onChange={(e) => setAcademicYear(e.target.value)}
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
                  ? "Loading report..."
                  : "Load report"}
              </button>
              <p className="text-[11px] text-slate-500">
                Use the same term and year you used for the parent report.
              </p>
            </div>
          </form>
        </section>

        {/* Loading indicator */}
        {loadState === "loading" && (
          <p className="text-xs text-slate-600">
            Loading learner&apos;s term report…
          </p>
        )}

        {/* No report yet */}
        {!report && loadState === "idle" && (
          <p className="text-xs text-slate-600">
            Load a learner report above to see BECE-style term summary for that
            child.
          </p>
        )}

        {/* Report display */}
        {report && (
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm text-xs sm:text-sm">
            {/* Learner + context bar */}
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-semibold text-slate-900">
                  {studentName}
                </div>
                <div className="text-[11px] text-slate-600">
                  {classLabel} • Term:{" "}
                  <span className="font-medium">{term}</span> • Academic year:{" "}
                  <span className="font-medium">{academicYear}</span>
                </div>
                {student?.guardianName && (
                  <div className="mt-0.5 text-[11px] text-slate-500">
                    Parent/Guardian: {student.guardianName}{" "}
                    {student.guardianPhone
                      ? `(${student.guardianPhone})`
                      : ""}
                  </div>
                )}
              </div>
              {overallGes && (
                <div className="text-[11px] text-slate-600">
                  Overall:{" "}
                  <span className="font-medium">
                    {overallPercentage != null
                      ? `${overallPercentage.toFixed(1)}%`
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
                Subject performance
              </div>
              {subjects.length === 0 ? (
                <div className="px-3 py-3 text-[11px] text-slate-600">
                  No subject scores found yet for this learner and term.
                  Once continuous assessments are recorded, they will appear
                  here.
                </div>
              ) : (
                <div className="overflow-auto">
                  <table className="min-w-full border-separate border-spacing-0 text-xs">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="border-b border-slate-200 px-3 py-2 text-left text-[11px] font-semibold text-slate-700">
                          Subject
                        </th>
                        <th className="border-b border-slate-200 px-3 py-2 text-right text-[11px] font-semibold text-slate-700">
                          Total score
                        </th>
                        <th className="border-b border-slate-200 px-3 py-2 text-right text-[11px] font-semibold text-slate-700">
                          Max score
                        </th>
                        <th className="border-b border-slate-200 px-3 py-2 text-right text-[11px] font-semibold text-slate-700">
                          Percentage
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
                        const totalScore =
                          typeof subj.totalScore === "number"
                            ? subj.totalScore
                            : typeof subj.score === "number"
                            ? subj.score
                            : null;
                        const maxScore =
                          typeof subj.maxScore === "number"
                            ? subj.maxScore
                            : null;
                        const pct =
                          typeof subj.percentage === "number"
                            ? subj.percentage
                            : typeof subj.percentageScore === "number"
                            ? subj.percentageScore
                            : null;

                        const ges =
                          typeof subj.grade === "number" &&
                          subj.remark
                            ? {
                                grade: subj.grade,
                                remark: subj.remark as string,
                              }
                            : gesGradeFromPercentage(pct);

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
                            <td className="border-b border-slate-100 px-3 py-1.5 text-right text-slate-800">
                              {totalScore != null
                                ? totalScore.toFixed(1)
                                : "—"}
                            </td>
                            <td className="border-b border-slate-100 px-3 py-1.5 text-right text-slate-800">
                              {maxScore != null
                                ? maxScore.toFixed(1)
                                : "—"}
                            </td>
                            <td className="border-b border-slate-100 px-3 py-1.5 text-right text-slate-800">
                              {pct != null
                                ? `${pct.toFixed(1)}%`
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

            {/* GES legend */}
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-700">
              <div className="font-semibold mb-1">
                GES grading scale (for teacher quick reference)
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

export default TeacherStudentTermReportPage;
