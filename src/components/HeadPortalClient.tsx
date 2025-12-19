// src/components/HeadPortalClient.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type HeadPortalClientProps = {
  tenantId: string;
  headUserId: string;
};

type WeeklySnapshot = {
  loaded: boolean;
  error?: string | null;
  totalClasses: number;
  totalMarks: number;
  totalPresent: number;
  totalAbsent: number;
  totalLate: number;
  totalExcused: number;
  pctOverall: number;
  bestClassLabel?: string | null;
  bestClassPct?: number | null;
  worstClassLabel?: string | null;
  worstClassPct?: number | null;
};

type CsvRow = {
  classLabel: string;
  enrolled: number;
  marks: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
  pct: number;
};

function startOfWeekMonday(d: Date): { start: string; end: string } {
  const day = d.getUTCDay();
  const diff = (day === 0 ? -6 : 1) - day;
  const mon = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  );
  mon.setUTCDate(mon.getUTCDate() + diff);
  const fri = new Date(mon);
  fri.setUTCDate(mon.getUTCDate() + 4);

  const start = mon.toISOString().slice(0, 10);
  const end = fri.toISOString().slice(0, 10);
  return { start, end };
}

function formatNumber(n: number) {
  return n.toLocaleString();
}

export default function HeadPortalClient({
  tenantId,
  headUserId,
}: HeadPortalClientProps) {
  const [snapshot, setSnapshot] = useState<WeeklySnapshot>({
    loaded: false,
    error: null,
    totalClasses: 0,
    totalMarks: 0,
    totalPresent: 0,
    totalAbsent: 0,
    totalLate: 0,
    totalExcused: 0,
    pctOverall: 0,
    bestClassLabel: null,
    bestClassPct: null,
    worstClassLabel: null,
    worstClassPct: null,
  });

  const [weekRange, setWeekRange] = useState<{ start: string; end: string }>(
    () => startOfWeekMonday(new Date())
  );

  const term = "1st Term";
  const academicYear = "2025/2026";

  const assessmentOverviewUrl = useMemo(() => {
    const u = new URL(
      "/headteacher/assessment/overview",
      "http://localhost:3000"
    );
    u.searchParams.set("tenantId", tenantId);
    u.searchParams.set("term", term);
    u.searchParams.set("academicYear", academicYear);
    return u.pathname + u.search;
  }, [tenantId, term, academicYear]);

  // -----------------------------
  // Load weekly attendance snapshot for this tenant
  // -----------------------------
  useEffect(() => {
    async function loadSnapshot() {
      try {
        const { start, end } = weekRange;
        if (!tenantId || !start || !end) return;

        const u = new URL(
          "/api/headteacher/attendance/weekly/csv",
          window.location.origin
        );
        u.searchParams.set("tenantId", tenantId);
        u.searchParams.set("start", start);
        u.searchParams.set("end", end);

        const res = await fetch(u.toString(), { cache: "no-store" });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const csv = await res.text();
        const lines = csv.trim().split("\n");
        const body = lines.slice(1); // skip header

        const rows: CsvRow[] = body
          .filter(Boolean)
          .map((line) => {
            const [
              label,
              _enrolled,
              marks,
              present,
              absent,
              late,
              excused,
              pct,
            ] = line.split(",");

            return {
              classLabel: label,
              enrolled: Number(_enrolled || 0),
              marks: Number(marks || 0),
              present: Number(present || 0),
              absent: Number(absent || 0),
              late: Number(late || 0),
              excused: Number(excused || 0),
              pct: Number(pct || 0),
            };
          });

        if (rows.length === 0) {
          setSnapshot((prev) => ({
            ...prev,
            loaded: true,
            error: null,
            totalClasses: 0,
            totalMarks: 0,
            totalPresent: 0,
            totalAbsent: 0,
            totalLate: 0,
            totalExcused: 0,
            pctOverall: 0,
            bestClassLabel: null,
            bestClassPct: null,
            worstClassLabel: null,
            worstClassPct: null,
          }));
          return;
        }

        const totals = rows.reduce(
          (acc, r) => {
            acc.totalClasses += 1;
            acc.totalMarks += r.marks;
            acc.totalPresent += r.present;
            acc.totalAbsent += r.absent;
            acc.totalLate += r.late;
            acc.totalExcused += r.excused;
            return acc;
          },
          {
            totalClasses: 0,
            totalMarks: 0,
            totalPresent: 0,
            totalAbsent: 0,
            totalLate: 0,
            totalExcused: 0,
          }
        );

        const pctOverall =
          totals.totalMarks > 0
            ? Math.round((totals.totalPresent / totals.totalMarks) * 1000) / 10
            : 0;

        const sorted = [...rows].sort((a, b) => b.pct - a.pct);
        const best = sorted[0];
        const worst = sorted[sorted.length - 1];

        setSnapshot({
          loaded: true,
          error: null,
          totalClasses: totals.totalClasses,
          totalMarks: totals.totalMarks,
          totalPresent: totals.totalPresent,
          totalAbsent: totals.totalAbsent,
          totalLate: totals.totalLate,
          totalExcused: totals.totalExcused,
          pctOverall,
          bestClassLabel: best?.classLabel ?? null,
          bestClassPct: best?.pct ?? null,
          worstClassLabel: worst?.classLabel ?? null,
          worstClassPct: worst?.pct ?? null,
        });
      } catch (err: any) {
        setSnapshot((prev) => ({
          ...prev,
          loaded: true,
          error:
            "Could not load this week’s attendance snapshot. The full weekly report is still available.",
        }));
      }
    }

    void loadSnapshot();
  }, [tenantId, weekRange]);

  const presentTone: "good" | "ok" | "warn" = useMemo(() => {
    if (snapshot.pctOverall >= 90) return "good";
    if (snapshot.pctOverall >= 80) return "ok";
    return "warn";
  }, [snapshot.pctOverall]);

  const weeklyAttendanceUrl = "/headteacher/attendance/weekly";

  return (
    <main className="min-h-screen bg-zinc-50">
      <div className="mx-auto max-w-6xl px-4 py-6 md:py-8 space-y-6">
        {/* Top hero */}
        <header className="space-y-4">
          <div className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-medium text-sky-900">
            EduLife OS · Headteacher
          </div>

          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div className="space-y-2 max-w-2xl">
              <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
                Head Portal
              </h1>
              <p className="text-xs md:text-sm text-zinc-600">
                A calm cockpit for{" "}
                <span className="font-semibold">
                  attendance, assessment and lesson supervision
                </span>{" "}
                — built so that your decisions are driven by{" "}
                <span className="font-semibold">
                  trust, transparency and truthfulness
                </span>{" "}
                not guesswork.
              </p>
            </div>

            <div className="text-[11px] text-zinc-500 md:text-right">
              <p>
                Tenant / School ID:{" "}
                <span className="font-mono">{tenantId}</span>
              </p>
              <p>
                Head user ID:{" "}
                <span className="font-mono">{headUserId}</span>
              </p>
            </div>
          </div>
        </header>

        {/* Main grid: left = school pulse, right = modules */}
        <section className="grid grid-cols-1 lg:grid-cols-[1.4fr_minmax(0,1.2fr)] gap-5">
          {/* LEFT: School pulse */}
          <div className="space-y-4">
            <div className="relative overflow-hidden rounded-3xl border border-zinc-200 bg-gradient-to-br from-sky-50 via-white to-emerald-50 px-4 py-4 md:px-6 md:py-5 shadow-sm">
              <div className="absolute -top-10 -right-10 h-40 w-40 rounded-full bg-sky-100/60" />
              <div className="absolute bottom-0 left-1/2 h-24 w-24 -translate-x-1/2 translate-y-1/2 rounded-full bg-emerald-100/40" />

              <div className="relative space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-sm md:text-base font-semibold text-zinc-900">
                      School pulse · This week
                    </h2>
                    <p className="text-[11px] md:text-xs text-zinc-600 max-w-sm">
                      At a glance, see how faithfully classes met this week.
                      Detailed AI explanations live inside the{" "}
                      <span className="font-semibold">
                        weekly attendance report
                      </span>
                      .
                    </p>
                  </div>
                  <div className="text-right text-[11px] text-zinc-500">
                    <div>Week range</div>
                    <div className="font-medium">
                      {weekRange.start} → {weekRange.end}
                    </div>
                  </div>
                </div>

                {/* Main stat */}
                <div className="grid grid-cols-1 md:grid-cols-[1.3fr_minmax(0,1fr)] gap-4 items-stretch">
                  <div className="rounded-2xl border bg-white/80 px-4 py-3 md:px-5 md:py-4 flex flex-col justify-between">
                    <div className="flex items-center justify-between gap-3">
                      <div className="space-y-1">
                        <p className="text-[11px] font-medium text-zinc-600">
                          Whole-school present rate
                        </p>
                        <p className="text-2xl md:text-3xl font-semibold tracking-tight">
                          {snapshot.loaded
                            ? `${snapshot.pctOverall.toFixed(1)}%`
                            : "--"}
                        </p>
                      </div>

                      <ToneBadge tone={presentTone} />
                    </div>

                    <p className="mt-2 text-[11px] text-zinc-500 max-w-sm">
                      Based on all marks taken in this week across all classes
                      inside EduLife OS. Use it as a{" "}
                      <span className="font-semibold">
                        conversation starter
                      </span>{" "}
                      with staff — not a punishment stick.
                    </p>
                  </div>

                  {/* Side mini-stats */}
                  <div className="grid grid-cols-2 gap-2">
                    <MiniStat
                      label="Classes in report"
                      value={
                        snapshot.loaded
                          ? formatNumber(snapshot.totalClasses)
                          : "—"
                      }
                      hint="With at least one attendance mark."
                    />
                    <MiniStat
                      label="Marks taken"
                      value={
                        snapshot.loaded
                          ? formatNumber(snapshot.totalMarks)
                          : "—"
                      }
                      hint="How many times registers were taken."
                    />
                    <MiniStat
                      label="Present marks"
                      value={
                        snapshot.loaded
                          ? formatNumber(snapshot.totalPresent)
                          : "—"
                      }
                      hint="Total present across all marks."
                    />
                    <MiniStat
                      label="Absent marks"
                      value={
                        snapshot.loaded
                          ? formatNumber(snapshot.totalAbsent)
                          : "—"
                      }
                      hint="Total absent across all marks."
                    />
                  </div>
                </div>

                {/* Best / Needs attention */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px]">
                  <div className="rounded-2xl border border-emerald-100 bg-emerald-50/80 px-3 py-2">
                    <div className="font-semibold text-emerald-900">
                      Strongest attendance
                    </div>
                    {snapshot.bestClassLabel ? (
                      <div className="flex items-baseline justify-between gap-2 text-emerald-900">
                        <span>{snapshot.bestClassLabel}</span>
                        <span className="font-mono">
                          {snapshot.bestClassPct?.toFixed(1)}%
                        </span>
                      </div>
                    ) : (
                      <p className="text-emerald-900/80 mt-0.5">
                        Will appear once at least one class has marks this week.
                      </p>
                    )}
                  </div>

                  <div className="rounded-2xl border border-amber-100 bg-amber-50/80 px-3 py-2">
                    <div className="font-semibold text-amber-900">
                      Needs attention
                    </div>
                    {snapshot.worstClassLabel ? (
                      <div className="flex items-baseline justify-between gap-2 text-amber-900">
                        <span>{snapshot.worstClassLabel}</span>
                        <span className="font-mono">
                          {snapshot.worstClassPct?.toFixed(1)}%
                        </span>
                      </div>
                    ) : (
                      <p className="text-amber-900/80 mt-0.5">
                        Once data comes in, low-attendance classes will show
                        here.
                      </p>
                    )}
                  </div>
                </div>

                {snapshot.error && (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-800">
                    {snapshot.error}
                  </div>
                )}

                <div className="flex flex-wrap gap-2 pt-1">
                  <Link
                    href={weeklyAttendanceUrl}
                    className="inline-flex items-center justify-center rounded-xl bg-zinc-900 px-4 py-2 text-xs md:text-sm font-medium text-white shadow-sm hover:bg-black"
                  >
                    Open weekly attendance pulse
                  </Link>
                  <p className="text-[11px] text-zinc-500">
                    Full AI explanation lives on that page, including a short
                    narrative you can share with staff.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT: Feature tiles */}
          <div className="space-y-4">
            {/* Assessment & results */}
            <div className="rounded-3xl border border-zinc-200 bg-white/90 px-4 py-4 md:px-5 md:py-5 shadow-sm">
              <div className="space-y-2">
                <h2 className="text-sm md:text-base font-semibold text-zinc-900">
                  Assessment & results overview
                </h2>
                <p className="text-[11px] md:text-xs text-zinc-600">
                  See how classes are performing by term, subject and teacher.
                  This connects directly to the{" "}
                  <span className="font-semibold">
                    headteacher assessment overview
                  </span>{" "}
                  we stabilised earlier.
                </p>
              </div>
              <ul className="mt-2 text-[11px] text-zinc-600 space-y-1.5">
                <li>• Whole-school class averages by subject</li>
                <li>• Quick GES grade ranges (top & bottom performers)</li>
                <li>• Bridge from raw scores to parent-friendly reporting</li>
              </ul>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  href={assessmentOverviewUrl}
                  className="inline-flex items-center justify-center rounded-xl bg-zinc-900 px-3 py-2 text-xs md:text-sm font-medium text-white shadow-sm hover:bg-black"
                >
                  Open assessment overview
                </Link>
              </div>
            </div>

            {/* Lesson notes supervision */}
            <div className="rounded-3xl border border-zinc-200 bg-white/90 px-4 py-4 md:px-5 md:py-5 shadow-sm">
              <div className="space-y-2">
                <h2 className="text-sm md:text-base font-semibold text-zinc-900">
                  Lesson notes & supervision
                </h2>
                <p className="text-[11px] md:text-xs text-zinc-600">
                  Track which teachers have{" "}
                  <span className="font-semibold">
                    submitted NaCCA-aligned lesson notes
                  </span>{" "}
                  and which notes are waiting for review or have been returned
                  for improvement.
                </p>
              </div>
              <ul className="mt-2 text-[11px] text-zinc-600 space-y-1.5">
                <li>• At-a-glance queue of SUBMITTED / APPROVED / REJECTED</li>
                <li>• Simple comments back to teachers inside EduLife OS</li>
                <li>• Aligned with the Lesson Design Studio teachers use</li>
              </ul>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled
                  className="inline-flex items-center justify-center rounded-xl border border-zinc-300 bg-white px-3 py-2 text-xs md:text-sm font-medium text-zinc-700 shadow-sm disabled:opacity-60"
                  title="Coming soon"
                >
                  Open lesson note review (coming soon)
                </button>
              </div>
            </div>

            {/* Communication & fees */}
            <div className="rounded-3xl border border-zinc-200 bg-white/90 px-4 py-4 md:px-5 md:py-5 shadow-sm">
              <div className="space-y-2">
                <h2 className="text-sm md:text-base font-semibold text-zinc-900">
                  Communication, fees & SMS nudges
                </h2>
                <p className="text-[11px] md:text-xs text-zinc-600">
                  This is where attendance, assessment and finances eventually
                  meet:
                  <span className="font-semibold">
                    {" "}
                    gentle SMS nudges, fee reminders and term summaries
                  </span>{" "}
                  that honour parents instead of harassing them.
                </p>
              </div>
              <ul className="mt-2 text-[11px] text-zinc-600 space-y-1.5">
                <li>• Smart fee reminders (integrated with Hubtel/Paystack)</li>
                <li>• Term summaries tailored for parents and supervisors</li>
                <li>• Built to reflect EduLife OS character & integrity</li>
              </ul>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled
                  className="inline-flex items-center justify-center rounded-xl border border-zinc-300 bg-white px-3 py-2 text-xs md:text-sm font-medium text-zinc-700 shadow-sm disabled:opacity-60"
                  title="Coming soon"
                >
                  Open fees & SMS centre (coming soon)
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

// -----------------------------
// Small UI helpers
// -----------------------------

function ToneBadge({ tone }: { tone: "good" | "ok" | "warn" }) {
  if (tone === "good") {
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-100 text-emerald-900 px-2.5 py-1 text-[10px] font-medium border border-emerald-200">
        Healthy zone
      </span>
    );
  }
  if (tone === "ok") {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-900 px-2.5 py-1 text-[10px] font-medium border border-amber-200">
        Watch but not alarming
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-red-100 text-red-900 px-2.5 py-1 text-[10px] font-medium border border-red-200">
      Needs attention
    </span>
  );
}

function MiniStat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white/80 px-3 py-2">
      <div className="text-[10px] font-medium text-zinc-600">{label}</div>
      <div className="text-sm font-semibold text-zinc-900 mt-0.5">
        {value}
      </div>
      {hint && (
        <p className="text-[10px] text-zinc-500 mt-0.5 leading-snug">
          {hint}
        </p>
      )}
    </div>
  );
}
