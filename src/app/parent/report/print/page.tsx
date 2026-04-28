// src/app/parent/report/print/page.tsx
"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

type SubjectSummary = {
  subject: string;
  classScore: number | null;
  examScore: number | null;
  totalScore: number | null;
  maxScore: number | null;
  percentage: number | null;
  grade: string | null;
  remark: string | null;
  position: number | null;
};

type AttendanceSummary = {
  daysPresent: number;
  daysAbsent: number;
  daysLate: number;
  totalSchoolDays: number;
} | null;

type FeesSummary = {
  totalBilledPesewas: number;
  totalWaivedPesewas: number;
  totalPaidPesewas: number;
  outstandingPesewas: number;
  lastPaymentDate: string | null;
};

type HealthSummary = {
  totalScreenings: number;
  feverCount: number;
  symptomsCount: number;
  lastScreenedAt: string | null;
  overallFlag: string | null;
} | null;

type BehaviourSummary = {
  conduct?: string | null;
  attitude?: string | null;
  interest?: string | null;
  classTeacherRemark?: string | null;
  headTeacherRemark?: string | null;
} | null;

type TermSummary = {
  term: string;
  academicYear: string;
  overallPercentage: number | null;
  overallPosition: number | null;
  classSize: number | null;
  promotedTo: string | null;
  attendance: AttendanceSummary;
  fees: FeesSummary;
  health: HealthSummary;
  behaviour: BehaviourSummary;
  nextTermBegins: string | null;
  subjects: SubjectSummary[];
};

type ParentTermReportResponse = {
  ok: boolean;
  error?: string;
  message?: string;
  detail?: string;
  context?: {
    tenantId: string;
    studentId: string;
    term: string;
    academicYear: string;
  };
  student?: {
    firstName?: string | null;
    lastName?: string | null;
    sex?: string | null;
    guardianName?: string | null;
    guardianPhone?: string | null;
  } | null;
  classroom?: {
    name?: string | null;
    arm?: string | null;
  } | null;
  termSummary?: TermSummary;
};

function formatMoneyFromPesewas(value: number | null | undefined): string {
  if (value == null) return "0.00";
  return (value / 100).toFixed(2);
}

function formatDateNice(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function percentageDisplay(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `${value.toFixed(1)}%`;
}

function looksLikeHtml(text: string) {
  const t = (text || "").trim().slice(0, 200).toLowerCase();
  return (
    t.startsWith("<!doctype") ||
    t.startsWith("<html") ||
    t.includes("<head") ||
    t.includes("<body")
  );
}

function safeJsonParse<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function looksLikeErrorCode(value: string | null | undefined) {
  const s = String(value ?? "").trim();
  if (!s) return false;
  return /^[A-Z0-9_]+$/.test(s);
}

function readableApiMessage(
  payload: any,
  status: number,
  fallback: string
): string {
  const candidates = [
    payload?.message,
    payload?.detail,
    payload?.errorMessage,
    payload?.error,
  ]
    .map((v: unknown) => String(v ?? "").trim())
    .filter(Boolean);

  const firstHuman = candidates.find((v: string) => !looksLikeErrorCode(v));
  if (firstHuman) return firstHuman;

  if (status === 401) {
    return "Parent session expired or missing. Please log in again with OTP.";
  }

  if (status === 403) {
    return "This report is not available to print right now.";
  }

  return fallback;
}

function BeceReportCard({ report }: { report: ParentTermReportResponse }) {
  const student = report.student;
  const classroom = report.classroom;
  const termSummary = report.termSummary as TermSummary;

  const subjects = termSummary.subjects ?? [];
  const overallPercent = termSummary.overallPercentage;
  const overallPosition = termSummary.overallPosition;
  const classSize = termSummary.classSize;

  const attendance = termSummary.attendance;
  const fees = termSummary.fees;
  const health = termSummary.health;
  const behaviour = termSummary.behaviour;

  const fullName = `${student?.lastName ?? ""} ${student?.firstName ?? ""}`.trim();
  const classLabel = `${classroom?.name ?? "—"}${classroom?.arm ? ` (${classroom.arm})` : ""}`;

  return (
    <div className="bg-white text-[#111] print:shadow-none" style={{ fontFamily: "’Helvetica Neue’, Arial, sans-serif" }}>

      {/* === BRANDED HEADER === */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", borderBottom: "3px solid #071A3D", paddingBottom: "10px", marginBottom: "12px", gap: "8px" }}>
        {/* Logo + title */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "7px", marginBottom: "6px" }}>
            <div style={{ width: "28px", height: "28px", background: "#071A3D", borderRadius: "5px", display: "flex", alignItems: "center", justifyContent: "center", color: "#D4AF37", fontWeight: 900, fontSize: "14pt", flexShrink: 0, lineHeight: 1 }}>E</div>
            <div>
              <div style={{ fontSize: "7.5pt", fontWeight: 700, color: "#D4AF37", textTransform: "uppercase", letterSpacing: "0.1em" }}>EduLife OS</div>
              <div style={{ fontSize: "7pt", color: "#666" }}>Ghana Basic Education</div>
            </div>
          </div>
          <div style={{ fontSize: "10pt", fontWeight: 800, color: "#071A3D", textTransform: "uppercase", letterSpacing: "0.04em" }}>School Terminal Report Card</div>
          <div style={{ fontSize: "7.5pt", color: "#555", marginTop: "2px" }}>
            NaCCA Curriculum · <span style={{ fontWeight: 600 }}>{termSummary.term}</span> · Academic Year <span style={{ fontWeight: 600 }}>{termSummary.academicYear}</span>
          </div>
        </div>

        {/* Overall score badge */}
        <div style={{ textAlign: "center", border: "2px solid #071A3D", borderRadius: "6px", padding: "6px 12px", background: "#f0f4ff", flexShrink: 0 }}>
          <div style={{ fontSize: "18pt", fontWeight: 800, color: "#071A3D", lineHeight: 1 }}>
            {overallPercent != null ? `${overallPercent.toFixed(1)}%` : "—"}
          </div>
          <div style={{ fontSize: "7pt", color: "#555", marginTop: "2px" }}>Overall Score</div>
          {overallPosition != null && classSize != null && (
            <div style={{ fontSize: "7pt", color: "#D4AF37", fontWeight: 700, marginTop: "1px" }}>
              {overallPosition} of {classSize}
            </div>
          )}
        </div>

        {/* Photo placeholder */}
        <div style={{ border: "2px solid #D4AF37", width: "72px", height: "90px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, borderRadius: "3px", background: "#faf8f0" }}>
          <div style={{ fontSize: "6pt", color: "#bbb", textAlign: "center", lineHeight: 1.6 }}>Passport<br />Photo</div>
        </div>
      </div>

      {/* === STUDENT INFO === */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginBottom: "10px" }}>
        <div style={{ border: "1px solid #ddd", borderRadius: "3px", padding: "6px 8px", fontSize: "9pt" }}>
          <InfoRow label="Name" value={fullName || "—"} />
          <InfoRow label="Sex" value={student?.sex || "—"} />
          <InfoRow label="Class" value={classLabel} />
        </div>
        <div style={{ border: "1px solid #ddd", borderRadius: "3px", padding: "6px 8px", fontSize: "9pt" }}>
          <InfoRow label="Guardian" value={student?.guardianName || "—"} />
          <InfoRow label="Phone" value={student?.guardianPhone || "—"} />
          <InfoRow label="Term" value={termSummary.term} />
        </div>
        <div style={{ border: "1px solid #ddd", borderRadius: "3px", padding: "6px 8px", fontSize: "9pt" }}>
          <InfoRow label="Acad. Year" value={termSummary.academicYear} />
          <InfoRow label="Overall %" value={percentageDisplay(overallPercent)} />
          <InfoRow label="Position" value={overallPosition != null && classSize != null ? `${overallPosition} of ${classSize}` : "—"} />
        </div>
      </div>

      {/* === SUBJECT TABLE === */}
      <div style={{ marginBottom: "10px" }}>
        <SectionLabel>Subject Performance (Class &amp; Exam Scores)</SectionLabel>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "9.5pt" }}>
            <thead>
              <tr style={{ background: "#071A3D", color: "#F7F4ED" }}>
                {["Subject", "Class Score", "Exam Score", "Total", "%", "Grade", "Position", "Remarks"].map((h) => (
                  <th key={h} style={{ padding: "4px 6px", border: "1px solid #34568b", fontWeight: 700, fontSize: "8pt", textAlign: h === "Subject" || h === "Remarks" ? "left" : "center" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {subjects.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: "12px 6px", textAlign: "center", color: "#999", border: "1px solid #ccd" }}>
                    No subject scores recorded yet for this term.
                  </td>
                </tr>
              ) : (
                subjects.map((subj, idx) => {
                  const rowBg = idx % 2 === 1 ? "#fafafa" : "#fff";
                  const total = subj.totalScore != null ? subj.totalScore : null;
                  const gradeColor = subj.grade === "7" ? "#b71c1c" : subj.grade === "6" ? "#e65100" : "#1b5e20";
                  const gradeBg = subj.grade === "7" ? "#ffebee" : subj.grade === "6" ? "#fff3e0" : "#e8f5e9";
                  return (
                    <tr key={`${subj.subject}-${idx}`} style={{ background: rowBg }}>
                      <td style={{ padding: "4px 6px", border: "1px solid #ccd", fontWeight: 600 }}>{subj.subject}</td>
                      <td style={{ padding: "4px 6px", border: "1px solid #ccd", textAlign: "center" }}>{subj.classScore != null ? subj.classScore : "—"}</td>
                      <td style={{ padding: "4px 6px", border: "1px solid #ccd", textAlign: "center" }}>{subj.examScore != null ? subj.examScore : "—"}</td>
                      <td style={{ padding: "4px 6px", border: "1px solid #ccd", textAlign: "center" }}>
                        {total != null ? total : "—"}
                        {subj.maxScore != null && <span style={{ fontSize: "8pt", color: "#999" }}>{` /${subj.maxScore}`}</span>}
                      </td>
                      <td style={{ padding: "4px 6px", border: "1px solid #ccd", textAlign: "center" }}>{percentageDisplay(subj.percentage)}</td>
                      <td style={{ padding: "4px 6px", border: "1px solid #ccd", textAlign: "center" }}>
                        {subj.grade ? <span style={{ background: gradeBg, color: gradeColor, borderRadius: "3px", padding: "1px 5px", fontWeight: 700 }}>{subj.grade}</span> : "—"}
                      </td>
                      <td style={{ padding: "4px 6px", border: "1px solid #ccd", textAlign: "center" }}>{subj.position != null ? subj.position : "—"}</td>
                      <td style={{ padding: "4px 6px", border: "1px solid #ccd" }}>{subj.remark || "—"}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* === ATTENDANCE / FEES / HEALTH === */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginBottom: "10px" }}>
        {/* Attendance */}
        <div>
          <SectionLabel>Attendance</SectionLabel>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "9pt" }}>
            <tbody>
              {attendance ? (
                <>
                  <TableRow label="Days Present" value={String(attendance.daysPresent)} />
                  <TableRow label="Days Absent" value={String(attendance.daysAbsent)} shaded />
                  <TableRow label="Days Late" value={String(attendance.daysLate)} />
                  <TableRow label="Total School Days" value={String(attendance.totalSchoolDays)} shaded />
                </>
              ) : (
                <tr><td colSpan={2} style={{ padding: "8px 6px", color: "#999", border: "1px solid #ccd", fontSize: "8.5pt" }}>No data yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Fees */}
        <div>
          <SectionLabel>Fees Summary</SectionLabel>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "9pt" }}>
            <tbody>
              {fees ? (
                <>
                  <TableRow label="Total Billed" value={`GHS ${formatMoneyFromPesewas(fees.totalBilledPesewas)}`} />
                  <TableRow label="Total Paid" value={`GHS ${formatMoneyFromPesewas(fees.totalPaidPesewas)}`} shaded />
                  <TableRow label="Waived" value={`GHS ${formatMoneyFromPesewas(fees.totalWaivedPesewas)}`} />
                  <TableRow label="Outstanding" value={`GHS ${formatMoneyFromPesewas(fees.outstandingPesewas)}`} shaded highlight={fees.outstandingPesewas > 0} />
                </>
              ) : (
                <tr><td colSpan={2} style={{ padding: "8px 6px", color: "#999", border: "1px solid #ccd", fontSize: "8.5pt" }}>No fees data.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Health */}
        <div>
          <SectionLabel>Health</SectionLabel>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "9pt" }}>
            <tbody>
              {health ? (
                <>
                  <TableRow label="Screenings" value={String(health.totalScreenings)} />
                  <TableRow label="Fever Episodes" value={String(health.feverCount)} shaded />
                  <TableRow label="Symptoms" value={String(health.symptomsCount)} />
                  <TableRow label="Last Screened" value={formatDateNice(health.lastScreenedAt)} shaded />
                </>
              ) : (
                <tr><td colSpan={2} style={{ padding: "8px 6px", color: "#999", border: "1px solid #ccd", fontSize: "8.5pt" }}>No health data.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* === REMARKS / SIGNATURES === */}
      <div style={{ marginBottom: "10px" }}>
        <SectionLabel>Conduct &amp; Remarks</SectionLabel>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
          <div style={{ border: "1px solid #ddd", borderRadius: "3px", padding: "8px", fontSize: "9pt" }}>
            <div style={{ fontWeight: 600, marginBottom: "4px" }}>Class Teacher&apos;s Remark</div>
            <div style={{ minHeight: "28px", color: "#aaa" }}>
              {behaviour?.classTeacherRemark || "................................................................"}
            </div>
            <div style={{ borderTop: "1px solid #aaa", marginTop: "6px", paddingTop: "3px", fontSize: "8pt", color: "#555" }}>
              Signature: ______________________
            </div>
          </div>
          <div style={{ border: "1px solid #ddd", borderRadius: "3px", padding: "8px", fontSize: "9pt" }}>
            <div style={{ fontWeight: 600, marginBottom: "4px" }}>Headteacher&apos;s Remark</div>
            <div style={{ minHeight: "28px", color: "#aaa" }}>
              {behaviour?.headTeacherRemark || "................................................................"}
            </div>
            <div style={{ borderTop: "1px solid #aaa", marginTop: "6px", paddingTop: "3px", fontSize: "8pt", color: "#555" }}>
              Signature &amp; Stamp: ______________________
            </div>
          </div>
        </div>
      </div>

      {/* === NEXT TERM + GUARDIAN === */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "8px" }}>
        <div style={{ border: "1px solid #ddd", borderRadius: "3px", padding: "6px 8px", fontSize: "9pt" }}>
          <InfoRow label="Guardian" value={student?.guardianName || "—"} />
          <div style={{ marginTop: "8px", fontSize: "8.5pt", color: "#555" }}>Parent / Guardian Signature: __________________</div>
        </div>
        <div style={{ border: "1px solid #ddd", borderRadius: "3px", padding: "6px 8px", fontSize: "9pt" }}>
          <div style={{ marginBottom: "4px" }}>
            <span style={{ fontWeight: 600 }}>Next Term Begins:</span>{" "}
            <span style={{ fontStyle: "italic", color: "#888" }}>
              {termSummary.nextTermBegins ? formatDateNice(termSummary.nextTermBegins) : "To be announced"}
            </span>
          </div>
          <div>
            <span style={{ fontWeight: 600 }}>Promoted to:</span>{" "}
            <span>{termSummary.promotedTo ?? "—"}</span>
          </div>
        </div>
      </div>

      {/* === FOOTER === */}
      <div style={{ borderTop: "2px solid #071A3D", paddingTop: "4px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <div style={{ width: "14px", height: "14px", background: "#071A3D", borderRadius: "2px", display: "flex", alignItems: "center", justifyContent: "center", color: "#D4AF37", fontWeight: 900, fontSize: "8pt" }}>E</div>
          <span style={{ fontSize: "7pt", fontWeight: 700, color: "#071A3D" }}>EduLife OS</span>
        </div>
        <span style={{ fontSize: "7pt", color: "#D4AF37", fontWeight: 700 }}>NaCCA Compliant · Ghana Basic Education</span>
        <span style={{ fontSize: "7pt", color: "#999" }}>Parent Report Card</span>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", gap: "4px", marginBottom: "2px" }}>
      <span style={{ fontWeight: 600, minWidth: "72px", color: "#444", flexShrink: 0 }}>{label}:</span>
      <span>{value}</span>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: "7pt", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "#071A3D", marginBottom: "4px", paddingLeft: "5px", borderLeft: "3px solid #D4AF37" }}>
      {children}
    </div>
  );
}

function TableRow({ label, value, shaded, highlight }: { label: string; value: string; shaded?: boolean; highlight?: boolean }) {
  return (
    <tr style={{ background: shaded ? "#fafafa" : "#fff" }}>
      <td style={{ padding: "3px 6px", border: "1px solid #ccd" }}>{label}</td>
      <td style={{ padding: "3px 6px", border: "1px solid #ccd", textAlign: "right", fontWeight: highlight ? 700 : undefined, color: highlight ? "#b71c1c" : undefined }}>{value}</td>
    </tr>
  );
}

function PrintShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#05070B_0%,#071A3D_55%,#05070B_100%)] py-4 text-[#F7F4ED] print:bg-white print:py-0 print:text-black">
      <div className="mx-auto max-w-5xl px-3 pb-4 print:max-w-full print:px-0">
        <div className="print:hidden">
          <div className="mb-4 overflow-hidden rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(5,7,11,0.90),rgba(7,17,31,0.94))] px-4 py-3 shadow-[0_24px_80px_rgba(0,0,0,0.24)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#E8C96A]">
                  EduLife OS • Parent Report
                </div>
                <div className="mt-1 text-[11px] text-[#C9CDD6]">
                  Print-ready BECE-style term report
                </div>
              </div>
            </div>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

function PrintFallback() {
  return (
    <PrintShell>
      <div className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] px-4 py-6 text-center text-[11px] text-[#C9CDD6] print:rounded-xl print:border-slate-200 print:bg-white print:text-slate-600">
        Loading report for printing…
      </div>
    </PrintShell>
  );
}

function ParentReportPrintClient() {
  const searchParams = useSearchParams();
  const qp = searchParams.toString();

  const [report, setReport] = useState<ParentTermReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const sp = new URLSearchParams(qp);

    const studentId = sp.get("studentId") || "";
    const term = sp.get("term") || "";
    const academicYear = sp.get("academicYear") || "";

    if (!studentId || !term || !academicYear) {
      setError(
        "Missing report parameters. Please open this page from the parent portal."
      );
      setLoading(false);
      setReport(null);
      return;
    }

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({ studentId, term, academicYear });
        const url = `/api/parent/report/term?${params.toString()}`;

        const res = await fetch(url, {
          cache: "no-store",
          credentials: "include",
          headers: { Accept: "application/json" },
        });

        const ct = (res.headers.get("content-type") || "").toLowerCase();
        const text = await res.text();
        const json = safeJsonParse<ParentTermReportResponse>(text);

        if (
          res.redirected ||
          looksLikeHtml(text) ||
          (!ct.includes("application/json") && !json)
        ) {
          setError(
            "Parent session was not accepted in this print tab. Go back to the portal and click Print again."
          );
          setReport(null);
          return;
        }

        if (!res.ok || !json?.ok) {
          setError(
            readableApiMessage(
              json,
              res.status,
              "Failed to load term report for printing."
            )
          );
          setReport(null);
          return;
        }

        setReport(json);
      } catch (err) {
        console.error("[ParentReportPrint] error loading report", err);
        setError("Network error loading term report.");
        setReport(null);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [qp]);

  useEffect(() => {
    if (!loading && report && typeof window !== "undefined") {
      const timer = setTimeout(() => window.print(), 400);
      return () => clearTimeout(timer);
    }
    return;
  }, [loading, report]);

  return (
    <PrintShell>
      <div className="mb-3 flex items-center justify-between gap-2 text-xs text-[#C9CDD6] print:hidden">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#E8C96A]">
            EduLife OS • Parent Report
          </div>
          <div className="text-[11px] text-[#C9CDD6]">
            This view is optimised for A4 printing.
          </div>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          disabled={loading || !!error || !report}
          className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium text-[#F7F4ED] shadow-sm transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Print now
        </button>
      </div>

      {loading ? (
        <div className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] px-4 py-6 text-center text-[11px] text-[#C9CDD6] print:rounded-xl print:border-slate-200 print:bg-white print:text-slate-600">
          Loading report for printing…
        </div>
      ) : error ? (
        <div className="rounded-[24px] border border-rose-300/20 bg-rose-400/12 px-4 py-6 text-center text-[11px] text-rose-100 print:rounded-xl print:border-rose-200 print:bg-rose-50 print:text-rose-700">
          {error}
        </div>
      ) : !report ? (
        <div className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] px-4 py-6 text-center text-[11px] text-[#C9CDD6] print:rounded-xl print:border-slate-200 print:bg-white print:text-slate-600">
          No report data available to print.
        </div>
      ) : (
        <BeceReportCard report={report} />
      )}
    </PrintShell>
  );
}

export default function ParentReportPrintPage() {
  return (
    <Suspense fallback={<PrintFallback />}>
      <ParentReportPrintClient />
    </Suspense>
  );
}