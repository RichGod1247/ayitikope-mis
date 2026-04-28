// src/app/parent/report/term/page.tsx
// Parent term report page — fetches real data from /api/parent/report/term.
// Previously used hardcoded demo data; now wired to live school data.
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
    attendance: { daysPresent: number; daysAbsent: number; daysLate: number; totalSchoolDays: number } | null;
    subjects: SubjectRow[];
  };
  headteacherSignature?: string | null;
};

function pct(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${v.toFixed(1)}%`;
}

export default function ParentTermReportPage() {
  const [studentId, setStudentId] = useState("");
  const [term, setTerm] = useState("1st Term");
  const [academicYear, setAcademicYear] = useState("2025/2026");
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-read studentId from URL if provided
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("studentId")) setStudentId(sp.get("studentId")!);
    if (sp.get("term")) setTerm(sp.get("term")!);
    if (sp.get("academicYear")) setAcademicYear(sp.get("academicYear")!);
  }, []);

  async function loadReport() {
    if (!studentId.trim()) { setError("Please enter a student ID."); return; }
    setLoading(true); setError(null);
    try {
      const res = await fetch(
        `/api/parent/report/term?studentId=${encodeURIComponent(studentId)}&term=${encodeURIComponent(term)}&academicYear=${encodeURIComponent(academicYear)}`,
        { credentials: "include", cache: "no-store" }
      );
      const json = await res.json();
      if (!res.ok || !json.ok) {
        if (res.status === 403 && json.error === "RESULTS_NOT_RELEASED") {
          setError("Results for this term have not been released yet. Please check back later.");
        } else if (res.status === 401 || json.error === "UNAUTHORIZED_PARENT") {
          setError("Your session has expired. Please log in again.");
        } else {
          setError(json.error || "Failed to load report.");
        }
        setData(null);
        return;
      }
      setData(json);
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDownloadPdf() {
    if (!studentId.trim() || !data) return;
    try {
      const res = await fetch(
        `/api/parent/report/term/pdf?studentId=${encodeURIComponent(studentId)}&term=${encodeURIComponent(term)}&academicYear=${encodeURIComponent(academicYear)}`,
        { credentials: "include", cache: "no-store" }
      );
      if (!res.ok) { setError("PDF generation failed."); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `report-card-${studentId.slice(0, 8)}-${term.replace(/\s+/g, "-")}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      setError("Network error during PDF generation.");
    }
  }

  const report = data?.termSummary;
  const student = data?.student;
  const subjects = report?.subjects ?? [];
  const attendance = report?.attendance;

  return (
    <main className="min-h-screen bg-zinc-50">
      <div className="mx-auto max-w-3xl px-4 py-6 space-y-5">
        <header>
          <div className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-medium text-emerald-800 mb-2">
            EduLife OS · Parent · Term Report
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Child Term Report</h1>
          <p className="text-xs text-zinc-600 mt-1">Enter your child's student ID to view their term report card.</p>
        </header>

        {/* Controls */}
        <section className="rounded-2xl border border-zinc-200 bg-white px-4 py-4 shadow-sm space-y-3">
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
              className="rounded-xl border border-zinc-200 px-3 py-2 text-xs w-32 focus:outline-none"
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
          {error && <p className="text-xs text-red-600">{error}</p>}
        </section>

        {data && report && student && (
          <section className="rounded-2xl border border-zinc-200 bg-white shadow-sm p-4 space-y-4">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 border-b border-zinc-100 pb-4">
              <div>
                <h2 className="text-base font-semibold text-zinc-900">
                  {student.lastName} {student.firstName}
                </h2>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {student.classroom?.name ?? student.classroom?.grade ?? "—"}{student.classroom?.arm ? ` · ${student.classroom.arm}` : ""}
                  {" · "}{report.term} · {report.academicYear}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {report.overallPercentage != null && (
                  <div className="rounded-xl border-2 border-indigo-200 bg-indigo-50 px-4 py-2 text-center">
                    <div className="text-xl font-bold text-indigo-800">{pct(report.overallPercentage)}</div>
                    <div className="text-[10px] text-indigo-600">Overall</div>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => void handleDownloadPdf()}
                  className="rounded-xl bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
                >
                  Download PDF
                </button>
              </div>
            </div>

            {/* Subjects table */}
            <div>
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 mb-2">Subject Performance</h3>
              <div className="overflow-x-auto rounded-lg border border-zinc-200">
                <table className="min-w-full text-[11px]">
                  <thead className="bg-zinc-50">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-zinc-600">Subject</th>
                      <th className="px-3 py-2 text-center font-semibold text-zinc-600">Score</th>
                      <th className="px-3 py-2 text-center font-semibold text-zinc-600">Max</th>
                      <th className="px-3 py-2 text-center font-semibold text-zinc-600">%</th>
                      <th className="px-3 py-2 text-center font-semibold text-zinc-600">Grade</th>
                      <th className="px-3 py-2 text-left font-semibold text-zinc-600">Remark</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subjects.length === 0 ? (
                      <tr><td colSpan={6} className="px-3 py-4 text-center text-zinc-400">No scores recorded yet.</td></tr>
                    ) : subjects.map((s, i) => (
                      <tr key={s.subject} className={i % 2 === 1 ? "bg-zinc-50/60" : ""}>
                        <td className="px-3 py-1.5 font-medium text-zinc-800">{s.subject}</td>
                        <td className="px-3 py-1.5 text-center text-zinc-700">{s.totalScore ?? "—"}</td>
                        <td className="px-3 py-1.5 text-center text-zinc-500">{s.maxScore ?? "—"}</td>
                        <td className="px-3 py-1.5 text-center text-zinc-700">{pct(s.percentage)}</td>
                        <td className="px-3 py-1.5 text-center">
                          <span className="inline-block rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800">{s.grade ?? "—"}</span>
                        </td>
                        <td className="px-3 py-1.5 text-zinc-600">{s.remark ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Attendance */}
            {attendance && (
              <div>
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 mb-2">Attendance</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
                  {[
                    { label: "Days Present", value: attendance.daysPresent },
                    { label: "Days Absent", value: attendance.daysAbsent },
                    { label: "Days Late", value: attendance.daysLate },
                    { label: "Total School Days", value: attendance.totalSchoolDays },
                  ].map(({ label, value }) => (
                    <div key={label} className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
                      <div className="text-zinc-500">{label}</div>
                      <div className="mt-0.5 text-base font-bold text-zinc-800">{value}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Signature */}
            {data.headteacherSignature && (
              <div className="border-t border-zinc-100 pt-3">
                <p className="text-[10px] text-zinc-500 mb-1">Headteacher's Signature</p>
                <span
                  className="inline-block max-h-12 max-w-[160px] align-middle"
                  dangerouslySetInnerHTML={{ __html: data.headteacherSignature }}
                />
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
