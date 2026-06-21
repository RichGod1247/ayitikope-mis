// src/app/student/report/term/page.tsx
"use client";

import React, { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

function formatCedis(pesewas: number | null | undefined): string {
  const safe = typeof pesewas === "number" ? pesewas : 0;
  return `GH₵${(safe / 100).toFixed(2)}`;
}

function clean(v: unknown) {
  return String(v ?? "").trim();
}

function clampPercent(v: number | null | undefined): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  return Math.max(0, Math.min(100, v));
}

type ClassroomInfo = {
  id?: string;
  name?: string | null;
  grade?: string | null;
  arm?: string | null;
};

type StudentInfo = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
  sex?: string | null;
  dob?: string | null;
  guardianName?: string | null;
  guardianPhone?: string | null;
  note?: string | null;
  classroom?: ClassroomInfo | null;
};

type SubjectRow = {
  subject: string;
  totalScore?: number | null;
  maxScore?: number | null;
  rawTotal?: number | null;
  rawMaxTotal?: number | null;
  percentage?: number | null;
  totalPercent?: number | null;
  grade?: string | number | null;
  gradeLabel?: string | null;
  remark?: string | null;
  complete?: boolean | null;
  readiness?: {
    status?: string | null;
    blockedReasons?: string[] | null;
  } | null;
};

type SubjectDisplayRow = SubjectRow & {
  trustedPercentage: number | null;
  gradeDisplay: string | null;
  remarkDisplay: string;
};

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
};

type TermSummary = {
  term?: string;
  academicYear?: string;
  overallPercentage?: number | null;
  grade?: string | number | null;
  gradeLabel?: string | null;
  remark?: string | null;
  overallPosition?: number | null;
  classSize?: number | null;
  promotedTo?: string | null;
  attendance?: unknown;
  fees?: FeesSummary | null;
  health?: HealthSummary | null;
  behaviour?: unknown;
  nextTermBegins?: string | null;
  subjects?: SubjectRow[];
};

type TermReportResponse = {
  ok: boolean;
  context?: {
    tenantId?: string;
    studentId?: string;
    term?: string;
    academicYear?: string;
  };
  term?: string;
  academicYear?: string;
  student?: StudentInfo;
  classroom?: ClassroomInfo | null;
  termSummary?: TermSummary;
  subjects?: SubjectRow[];
  attendanceSummary?: unknown;
  feesSummary?: FeesSummary | null;
  healthSummary?: HealthSummary | null;
  classReadiness?: {
    status?: string | null;
    blockedReasons?: string[] | null;
  } | null;
  error?: string;
};

type Mode = "demo" | "live";

function readTrustedPercentage(row: SubjectRow): number | null {
  if (typeof row.percentage === "number") {
    return clampPercent(row.percentage);
  }

  if (typeof row.totalPercent === "number") {
    return clampPercent(row.totalPercent);
  }

  return null;
}

function formatScore(v: number | null | undefined) {
  return typeof v === "number" && Number.isFinite(v) ? v.toFixed(1) : "–";
}

function formatGrade(row: SubjectRow): string | null {
  if (row.grade == null || !clean(row.grade)) return null;
  return String(row.grade);
}

function formatRemark(row: SubjectRow): string {
  if (clean(row.remark)) return clean(row.remark);
  if (clean(row.gradeLabel)) return clean(row.gradeLabel);
  if (row.complete === false) return "Incomplete assessment evidence";
  return "No policy remark yet";
}

function formatOverallBadge(args: {
  grade?: string | number | null;
  gradeLabel?: string | null;
  remark?: string | null;
}) {
  const parts: string[] = [];

  if (args.grade != null && clean(args.grade)) {
    parts.push(`Grade ${clean(args.grade)}`);
  }

  if (clean(args.gradeLabel)) parts.push(clean(args.gradeLabel));
  if (clean(args.remark)) parts.push(clean(args.remark));

  return Array.from(new Set(parts)).join(" · ") || null;
}

/**
 * Suspense fallback (simple skeleton)
 */
function PageSkeleton() {
  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-5xl px-4 py-6 md:py-8 space-y-6">
        <div className="h-7 w-72 rounded bg-slate-200 animate-pulse" />
        <div className="h-20 rounded-2xl border border-slate-200 bg-white animate-pulse" />
        <div className="grid gap-3 md:grid-cols-3">
          <div className="h-28 rounded-2xl border border-slate-200 bg-white animate-pulse" />
          <div className="h-28 rounded-2xl border border-slate-200 bg-white animate-pulse" />
          <div className="h-28 rounded-2xl border border-slate-200 bg-white animate-pulse" />
        </div>
        <div className="h-80 rounded-2xl border border-slate-200 bg-white animate-pulse" />
      </div>
    </main>
  );
}

function StudentTermReportInner() {
  const searchParams = useSearchParams();

  const queryTenantId = searchParams.get("tenantId") ?? "";
  const queryStudentId = searchParams.get("studentId") ?? "";
  const queryTerm = searchParams.get("term") ?? "1st Term";
  const queryAcademicYear = searchParams.get("academicYear") ?? "2025/2026";

  const tenantId = queryTenantId.trim() || "cmhhnghn00008vcpgp3fl07fl";
  const studentId = queryStudentId.trim();

  const [mode, setMode] = useState<Mode>(studentId ? "live" : "demo");
  const [loading, setLoading] = useState<boolean>(!!studentId);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<TermReportResponse | null>(null);

  useEffect(() => {
    if (!studentId) {
      setMode("demo");
      setLoading(false);
      setError(null);
      setReport(null);
      return;
    }

    let cancelled = false;

    async function load() {
      setMode("live");
      setLoading(true);
      setError(null);
      setReport(null);

      try {
        const url = new URL("/api/parent/report/term", window.location.origin);
        url.searchParams.set("tenantId", tenantId);
        url.searchParams.set("studentId", studentId);
        url.searchParams.set("term", queryTerm);
        url.searchParams.set("academicYear", queryAcademicYear);

        const res = await fetch(url.toString(), { cache: "no-store" });
        const data = (await res.json().catch(() => ({}))) as TermReportResponse;

        if (!res.ok || !data.ok) {
          const msg = data?.error || "Could not load term report for this learner.";
          if (!cancelled) setError(msg);
          return;
        }

        if (!cancelled) setReport(data);
      } catch {
        if (!cancelled) {
          setError("Network or server error while loading the term report.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [tenantId, studentId, queryTerm, queryAcademicYear]);

  const studentName = useMemo(() => {
    if (mode === "live" && report?.student) {
      const s = report.student;
      return (
        clean(s.fullName) ||
        [s.firstName, s.lastName].filter(Boolean).join(" ").trim() ||
        "Learner"
      );
    }

    return "Demo Learner";
  }, [mode, report]);

  const classroomLabel = useMemo(() => {
    if (mode === "live" && report?.classroom) {
      const c = report.classroom;
      return (
        clean(c.name) ||
        [c.grade, c.arm ? `(${c.arm})` : ""].filter(Boolean).join(" ").trim() ||
        "Class"
      );
    }

    return "JHS1";
  }, [mode, report]);

  const term =
    report?.context?.term ??
    report?.termSummary?.term ??
    report?.term ??
    queryTerm;

  const academicYear =
    report?.context?.academicYear ??
    report?.termSummary?.academicYear ??
    report?.academicYear ??
    queryAcademicYear;

  const subjectsWithPolicy = useMemo<SubjectDisplayRow[]>(() => {
    const rows =
      mode === "live"
        ? report?.subjects ?? report?.termSummary?.subjects ?? []
        : demoSubjects;

    return rows.map((row) => ({
      ...row,
      trustedPercentage: readTrustedPercentage(row),
      gradeDisplay: formatGrade(row),
      remarkDisplay: formatRemark(row),
    }));
  }, [mode, report]);

  const feesCard = useMemo<FeesSummary | null>(() => {
    if (mode === "live") {
      return report?.feesSummary ?? report?.termSummary?.fees ?? null;
    }

    return {
      totalBilledPesewas: 150000,
      totalWaivedPesewas: 0,
      totalPaidPesewas: 100000,
      outstandingPesewas: 50000,
      lastPaymentDate: null,
    };
  }, [mode, report]);

  const healthCard = useMemo<HealthSummary | null>(() => {
    if (mode === "live") {
      return report?.healthSummary ?? report?.termSummary?.health ?? null;
    }

    return {
      totalScreenings: 45,
      feverCount: 2,
      symptomsCount: 5,
      lastScreenedAt: null,
      overallFlag: null,
    };
  }, [mode, report]);

  const overallPercentage = useMemo(() => {
    if (mode === "live") {
      return clampPercent(report?.termSummary?.overallPercentage ?? null);
    }

    return 82.5;
  }, [mode, report]);

  const overallBadge = useMemo(() => {
    if (mode === "live") {
      return formatOverallBadge({
        grade: report?.termSummary?.grade ?? null,
        gradeLabel: report?.termSummary?.gradeLabel ?? null,
        remark: report?.termSummary?.remark ?? null,
      });
    }

    return "Grade HP · Highly Proficient";
  }, [mode, report]);

  const readinessMessage =
    report?.classReadiness?.blockedReasons?.[0] ??
    "Policy-aware report values appear once trusted assessment evidence is available.";

  const modeLabel =
    mode === "live" && studentId
      ? "Live policy-aware data"
      : "Demo mode – no specific learner selected";

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-5xl px-4 py-6 md:py-8 space-y-6">
        <header className="space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-medium text-sky-900">
            <span>EduLife OS · Student · Term report</span>
            <span className="h-1 w-1 rounded-full bg-sky-400" />
            <span>{modeLabel}</span>
          </div>

          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div className="space-y-1">
              <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-slate-900">
                End-of-term report
              </h1>
              <p className="text-xs md:text-sm text-slate-600 max-w-xl">
                A simple policy-aware view of your performance this term. Designed so learners and parents can{" "}
                <span className="font-semibold">clearly see strengths and gaps</span>{" "}
                without hidden formulas or conflicting grades.
              </p>
            </div>

            <div className="text-xs md:text-right text-slate-500 space-y-0.5">
              <p>
                Name: <span className="font-medium text-slate-800">{studentName}</span>
              </p>
              <p>
                Class: <span className="font-medium text-slate-800">{classroomLabel}</span>
              </p>
              <p>
                Term: <span className="font-medium text-slate-800">{term}</span> · Year:{" "}
                <span className="font-medium text-slate-800">{academicYear}</span>
              </p>
            </div>
          </div>
        </header>

        {loading && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
            Loading this learner&apos;s term report…
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
            {error}
          </div>
        )}

        {!loading && !error && mode === "demo" && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
            This is a <span className="font-semibold">demo report view</span>. Once a real learner is selected with a valid{" "}
            <code className="rounded bg-amber-100 px-1">studentId</code>, this page will show{" "}
            <span className="font-semibold">live policy-aware assessment data</span> from EduLife OS.
          </div>
        )}

        <section className="grid gap-3 md:grid-cols-3">
          <SummaryCard
            label="Overall term performance"
            value={overallPercentage != null ? `${overallPercentage.toFixed(1)}%` : "–"}
            badge={overallBadge ?? undefined}
            tone="neutral"
            hint={
              overallBadge
                ? "Grade and remark come from the policy-aware report payload."
                : readinessMessage
            }
          />

          <SummaryCard
            label="Fees status"
            value={feesCard ? formatCedis(feesCard.totalPaidPesewas) : "–"}
            badge={
              feesCard
                ? feesCard.outstandingPesewas > 0
                  ? `Balance: ${formatCedis(feesCard.outstandingPesewas)}`
                  : "Cleared"
                : undefined
            }
            tone={
              !feesCard ? "neutral" : feesCard.outstandingPesewas > 0 ? "warn" : "good"
            }
            hint={
              feesCard
                ? "Summary of billed, paid and outstanding fees for this term."
                : "Once invoices are created, fee status will appear here."
            }
          />

          <SummaryCard
            label="Health & screening"
            value={healthCard ? `${healthCard.totalScreenings}` : "–"}
            badge={
              healthCard
                ? `${healthCard.feverCount} high temps · ${healthCard.symptomsCount} with symptoms`
                : undefined
            }
            tone={
              !healthCard
                ? "neutral"
                : healthCard.feverCount === 0 && healthCard.symptomsCount === 0
                ? "good"
                : "ok"
            }
            hint="Based on school temperature & symptom checks recorded in EduLife OS."
          />
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-900">Subject performance</h2>
            <p className="text-[11px] text-slate-500">
              Policy-aware subject view across trusted recorded assessment items.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs md:text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <Th label="Subject" align="left" />
                  <Th label="Total score" />
                  <Th label="Max score" />
                  <Th label="Percent" />
                  <Th label="Grade" />
                  <Th label="Remark" align="left" />
                </tr>
              </thead>
              <tbody>
                {subjectsWithPolicy.map((row, idx) => {
                  const zebra = idx % 2 === 0 ? "bg-white" : "bg-slate-50/70";

                  return (
                    <tr key={`${row.subject}-${idx}`} className={zebra}>
                      <td className="px-3 py-2 text-left">{row.subject}</td>
                      <td className="px-3 py-2 text-right">
                        {formatScore(row.totalScore)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {formatScore(row.maxScore)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {row.trustedPercentage != null
                          ? `${row.trustedPercentage.toFixed(1)}%`
                          : "–"}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        {row.gradeDisplay ?? "–"}
                      </td>
                      <td className="px-3 py-2 text-left text-slate-700">
                        {row.remarkDisplay}
                      </td>
                    </tr>
                  );
                })}

                {subjectsWithPolicy.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-xs text-slate-500">
                      No policy-aware assessment subjects are ready for this learner in the selected term/year yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="border-t border-slate-100 px-4 py-3 text-[11px] text-slate-500">
            This table displays the same policy-aware report payload used by the parent and headteacher report layers.
            It does <span className="font-semibold">not</span> rebuild grades locally.
          </div>
        </section>

        <p className="text-[11px] text-slate-500 max-w-3xl">
          The student report view now displays report truth instead of calculating a second version of the result.
        </p>
      </div>
    </main>
  );
}

const demoSubjects: SubjectRow[] = [
  {
    subject: "English Language",
    totalScore: 80,
    maxScore: 100,
    percentage: 80,
    grade: "HP",
    gradeLabel: "Highly Proficient",
    remark: "Highly Proficient",
  },
  {
    subject: "Mathematics",
    totalScore: 55,
    maxScore: 100,
    percentage: 55,
    grade: "AP",
    gradeLabel: "Approaching Proficiency",
    remark: "Approaching Proficiency",
  },
  {
    subject: "Science",
    totalScore: 72,
    maxScore: 100,
    percentage: 72,
    grade: "P",
    gradeLabel: "Proficient",
    remark: "Proficient",
  },
];

function SummaryCard(props: {
  label: string;
  value: string;
  badge?: string;
  hint?: string;
  tone?: "neutral" | "good" | "ok" | "warn";
}) {
  const { label, value, badge, hint, tone = "neutral" } = props;

  let borderClass = "border-slate-200 bg-white text-slate-900 shadow-sm";

  if (tone === "good") {
    borderClass = "border-emerald-200 bg-emerald-50/80 text-emerald-900 shadow-sm";
  } else if (tone === "ok") {
    borderClass = "border-amber-200 bg-amber-50/80 text-amber-900 shadow-sm";
  } else if (tone === "warn") {
    borderClass = "border-red-200 bg-red-50/80 text-red-900 shadow-sm";
  }

  return (
    <div className={`rounded-2xl border px-3 py-3 md:px-4 md:py-4 ${borderClass}`}>
      <div className="text-[11px] md:text-xs font-medium opacity-80">{label}</div>
      <div className="mt-1 text-lg md:text-2xl font-semibold">{value}</div>
      {badge && (
        <div className="mt-1 inline-flex rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-medium">
          {badge}
        </div>
      )}
      {hint && <p className="mt-1 text-[10px] text-slate-500 max-w-xs">{hint}</p>}
    </div>
  );
}

function Th({
  label,
  align = "right",
}: {
  label: string;
  align?: "left" | "right";
}) {
  return (
    <th
      className={`px-3 py-2 text-[11px] font-semibold text-slate-500 ${
        align === "left" ? "text-left" : "text-right"
      }`}
    >
      {label}
    </th>
  );
}

/**
 * The only exported page component:
 * Suspense wraps the component that uses useSearchParams().
 */
export default function StudentTermReportPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <StudentTermReportInner />
    </Suspense>
  );
}