// src/app/parent/report/term/page.tsx
// Parent term report page — fetches real data from /api/parent/report/term.
"use client";

import { useEffect, useState } from "react";

type SubjectRow = {
  subject: string;
  totalScore: number | null;
  maxScore: number | null;
  percentage: number | null;
  grade: string | null;
  remark: string | null;
};

type ReportData = {
  student: {
    firstName: string;
    lastName: string;
    sex: string | null;
    guardianName: string;
    classroom: { name: string; grade: string | null; arm: string | null } | null;
  };
  termSummary: {
    term: string;
    academicYear: string;
    overallPercentage: number | null;
    attendance: {
      daysPresent: number;
      daysAbsent: number;
      daysLate: number;
      totalSchoolDays: number;
    } | null;
    subjects: SubjectRow[];
  };
  headteacherSignature?: string | null;
};

type ReportApiResponse = Partial<ReportData> & {
  ok?: boolean;
  error?: string;
};

function pct(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${value.toFixed(1)}%`;
}

function scoreText(value: number | null | undefined): string {
  if (value == null) return "—";
  return String(value);
}

function friendlyReportError(status: number, code?: string) {
  if (status === 403 && code === "RESULTS_NOT_RELEASED") {
    return "Results for this term have not been released yet. Please check back later.";
  }

  if (status === 401 || code === "UNAUTHORIZED_PARENT") {
    return "Your session has expired. Please log in again.";
  }

  if (code === "FORBIDDEN_STUDENT") {
    return "This learner is not linked to your parent account.";
  }

  if (code === "STUDENT_ID_REQUIRED") {
    return "Please enter a student ID.";
  }

  return code || "Failed to load report.";
}

export default function ParentTermReportPage() {
  const [studentId, setStudentId] = useState("");
  const [term, setTerm] = useState("1st Term");
  const [academicYear, setAcademicYear] = useState("2025/2026");
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const sp = new URLSearchParams(window.location.search);
    const nextStudentId = sp.get("studentId")?.trim();
    const nextTerm = sp.get("term")?.trim();
    const nextAcademicYear = sp.get("academicYear")?.trim();

    if (nextStudentId) setStudentId(nextStudentId);
    if (nextTerm) setTerm(nextTerm);
    if (nextAcademicYear) setAcademicYear(nextAcademicYear);
  }, []);

  async function loadReport() {
    const safeStudentId = studentId.trim();
    const safeTerm = term.trim();
    const safeAcademicYear = academicYear.trim();

    if (!safeStudentId) {
      setError("Please enter a student ID.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const url = new URL("/api/parent/report/term", window.location.origin);
      url.searchParams.set("studentId", safeStudentId);
      url.searchParams.set("term", safeTerm);
      url.searchParams.set("academicYear", safeAcademicYear);

      const res = await fetch(url.toString(), {
        credentials: "include",
        cache: "no-store",
      });

      const json = (await res.json().catch(() => ({}))) as ReportApiResponse;

      if (!res.ok || json.ok === false) {
        setData(null);
        setError(friendlyReportError(res.status, json.error));
        return;
      }

      if (!json.student || !json.termSummary) {
        setData(null);
        setError("The report response was incomplete. Please contact the school.");
        return;
      }

      setData({
        student: json.student,
        termSummary: json.termSummary,
        headteacherSignature: json.headteacherSignature ?? null,
      });
    } catch {
      setData(null);
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDownloadPdf() {
    const safeStudentId = studentId.trim();
    const safeTerm = term.trim();
    const safeAcademicYear = academicYear.trim();

    if (!safeStudentId || !data) return;

    setDownloading(true);
    setError(null);

    try {
      const url = new URL("/api/parent/report/term/pdf", window.location.origin);
      url.searchParams.set("studentId", safeStudentId);
      url.searchParams.set("term", safeTerm);
      url.searchParams.set("academicYear", safeAcademicYear);

      const res = await fetch(url.toString(), {
        credentials: "include",
        cache: "no-store",
      });

      if (!res.ok) {
        setError("PDF generation failed.");
        return;
      }

      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");

      a.href = objectUrl;
      a.download = `report-card-${safeStudentId.slice(0, 8)}-${safeTerm.replace(
        /\s+/g,
        "-"
      )}.pdf`;

      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
    } catch {
      setError("Network error during PDF generation.");
    } finally {
      setDownloading(false);
    }
  }

  const report = data?.termSummary;
  const student = data?.student;
  const subjects = report?.subjects ?? [];
  const attendance = report?.attendance;

  return (
    <main className="min-h-screen bg-zinc-50">
      <div className="mx-auto max-w-3xl space-y-5 px-4 py-6">
        <header>
          <div className="mb-2 inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-medium text-emerald-800">
            EduLife OS · Parent · Term Report
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
            Child Term Report
          </h1>
          <p className="mt-1 text-xs text-zinc-600">
            Enter your child&apos;s student ID to view the term report card.
          </p>
        </header>

        <section className="space-y-3 rounded-2xl border border-zinc-200 bg-white px-4 py-4 shadow-sm">
          <div className="grid gap-3 md:grid-cols-[1fr_auto_auto_auto]">
            <input
              type="text"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              placeholder="Student ID"
              className="rounded-xl border border-zinc-200 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />

            <select
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              className="rounded-xl border border-zinc-200 px-3 py-2 text-xs focus:outline-none"
            >
              <option value="1st Term">1st Term</option>
              <option value="2nd Term">2nd Term</option>
              <option value="3rd Term">3rd Term</option>
            </select>

            <input
              type="text"
              value={academicYear}
              onChange={(e) => setAcademicYear(e.target.value)}
              placeholder="e.g. 2025/2026"
              className="w-32 rounded-xl border border-zinc-200 px-3 py-2 text-xs focus:outline-none"
            />

            <button
              type="button"
              onClick={() => void loadReport()}
              disabled={loading}
              className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {loading ? "Loading…" : "Load Report"}
            </button>
          </div>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          )}
        </section>

        {data && report && student && (
          <section className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 border-b border-zinc-100 pb-4 md:flex-row md:items-start md:justify-between">
              <div>
                <h2 className="text-base font-semibold text-zinc-900">
                  {student.lastName} {student.firstName}
                </h2>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {student.classroom?.name ?? student.classroom?.grade ?? "—"}
                  {student.classroom?.arm ? ` · ${student.classroom.arm}` : ""}
                  {" · "}
                  {report.term} · {report.academicYear}
                </p>
              </div>

              <div className="flex items-center gap-3">
                {report.overallPercentage != null && (
                  <div className="rounded-xl border-2 border-indigo-200 bg-indigo-50 px-4 py-2 text-center">
                    <div className="text-xl font-bold text-indigo-800">
                      {pct(report.overallPercentage)}
                    </div>
                    <div className="text-[10px] text-indigo-600">Overall</div>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => void handleDownloadPdf()}
                  disabled={downloading}
                  className="rounded-xl bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
                >
                  {downloading ? "Preparing…" : "Download PDF"}
                </button>
              </div>
            </div>

            <div>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                Subject Performance
              </h3>

              <div className="overflow-x-auto rounded-lg border border-zinc-200">
                <table className="min-w-full text-[11px]">
                  <thead className="bg-zinc-50">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-zinc-600">
                        Subject
                      </th>
                      <th className="px-3 py-2 text-center font-semibold text-zinc-600">
                        Score
                      </th>
                      <th className="px-3 py-2 text-center font-semibold text-zinc-600">
                        Max
                      </th>
                      <th className="px-3 py-2 text-center font-semibold text-zinc-600">
                        %
                      </th>
                      <th className="px-3 py-2 text-center font-semibold text-zinc-600">
                        Grade
                      </th>
                      <th className="px-3 py-2 text-left font-semibold text-zinc-600">
                        Remark
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {subjects.length === 0 ? (
                      <tr>
                        <td
                          colSpan={6}
                          className="px-3 py-5 text-center text-zinc-500"
                        >
                          No subject scores are available for this term.
                        </td>
                      </tr>
                    ) : (
                      subjects.map((row) => (
                        <tr key={row.subject}>
                          <td className="px-3 py-2 font-medium text-zinc-900">
                            {row.subject}
                          </td>
                          <td className="px-3 py-2 text-center text-zinc-700">
                            {scoreText(row.totalScore)}
                          </td>
                          <td className="px-3 py-2 text-center text-zinc-700">
                            {scoreText(row.maxScore)}
                          </td>
                          <td className="px-3 py-2 text-center font-semibold text-zinc-900">
                            {pct(row.percentage)}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <span className="rounded-full bg-indigo-50 px-2 py-1 font-semibold text-indigo-700">
                              {row.grade ?? "—"}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-zinc-600">
                            {row.remark ?? "—"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                  Attendance
                </h3>

                {attendance ? (
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <p className="text-zinc-500">Present</p>
                      <p className="font-semibold text-emerald-700">
                        {attendance.daysPresent}
                      </p>
                    </div>
                    <div>
                      <p className="text-zinc-500">Absent</p>
                      <p className="font-semibold text-red-700">
                        {attendance.daysAbsent}
                      </p>
                    </div>
                    <div>
                      <p className="text-zinc-500">Late</p>
                      <p className="font-semibold text-amber-700">
                        {attendance.daysLate}
                      </p>
                    </div>
                    <div>
                      <p className="text-zinc-500">School days</p>
                      <p className="font-semibold text-zinc-900">
                        {attendance.totalSchoolDays}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-zinc-500">
                    Attendance summary is not available yet.
                  </p>
                )}
              </div>

              <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                  Headteacher Signature
                </h3>

                {data.headteacherSignature ? (
                  <div
                    className="mt-2 max-h-20 overflow-hidden"
                    dangerouslySetInnerHTML={{
                      __html: data.headteacherSignature,
                    }}
                  />
                ) : (
                  <p className="mt-2 text-xs text-zinc-500">
                    Signature has not been added yet.
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs text-amber-900">
              This report is shown only when the school has released results for
              the selected learner, term, and academic year.
            </div>
          </section>
        )}
      </div>
    </main>
  );
}