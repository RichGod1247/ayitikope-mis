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
  const mon = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
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

export default function HeadPortalClient({ tenantId, headUserId }: HeadPortalClientProps) {
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

  const [weekRange, setWeekRange] = useState<{ start: string; end: string }>(() =>
    startOfWeekMonday(new Date())
  );

  const term = "1st Term";
  const academicYear = "2025/2026";

  // ✅ Bank-grade: relative URL only (no hardcoded origin)
  const assessmentOverviewUrl = useMemo(() => {
    const sp = new URLSearchParams();
    sp.set("tenantId", tenantId);
    sp.set("term", term);
    sp.set("academicYear", academicYear);
    return `/headteacher/assessment/overview?${sp.toString()}`;
  }, [tenantId, term, academicYear]);

  useEffect(() => {
    async function loadSnapshot() {
      try {
        const { start, end } = weekRange;
        if (!tenantId || !start || !end) return;

        const u = new URL("/api/headteacher/attendance/weekly/csv", window.location.origin);
        u.searchParams.set("tenantId", tenantId);
        u.searchParams.set("start", start);
        u.searchParams.set("end", end);

        const res = await fetch(u.toString(), { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const csv = await res.text();
        const lines = csv.trim().split("\n");
        const body = lines.slice(1);

        const rows: CsvRow[] = body
          .filter(Boolean)
          .map((line) => {
            const [label, _enrolled, marks, present, absent, late, excused, pct] = line.split(",");
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
          setSnapshot(() => ({
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
          { totalClasses: 0, totalMarks: 0, totalPresent: 0, totalAbsent: 0, totalLate: 0, totalExcused: 0 }
        );

        const pctOverall =
          totals.totalMarks > 0 ? Math.round((totals.totalPresent / totals.totalMarks) * 1000) / 10 : 0;

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
      } catch {
        setSnapshot((prev) => ({
          ...prev,
          loaded: true,
          error: "Could not load this week’s attendance snapshot. The full weekly report is still available.",
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
        <header className="space-y-4">
          <div className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-medium text-sky-900">
            EduLife OS · Headteacher
          </div>

          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div className="space-y-2 max-w-2xl">
              <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Head Portal</h1>
              <p className="text-xs md:text-sm text-zinc-600">
                A calm cockpit for{" "}
                <span className="font-semibold">attendance, assessment and lesson supervision</span>{" "}
                — built so that your decisions are driven by{" "}
                <span className="font-semibold">trust, transparency and truthfulness</span>{" "}
                not guesswork.
              </p>
            </div>

            <div className="text-[11px] text-zinc-500 md:text-right">
              <p>
                Tenant / School ID: <span className="font-mono">{tenantId}</span>
              </p>
              <p>
                Head user ID: <span className="font-mono">{headUserId}</span>
              </p>
            </div>
          </div>
        </header>

        <section className="grid grid-cols-1 lg:grid-cols-[1.4fr_minmax(0,1.2fr)] gap-5">
          <div className="space-y-4">
            <div className="relative overflow-hidden rounded-3xl border border-zinc-200 bg-gradient-to-br from-sky-50 via-white to-emerald-50 px-4 py-4 md:px-6 md:py-5 shadow-sm">
              <div className="relative space-y-4">
                <div className="flex flex-wrap gap-2 pt-1">
                  <Link
                    href={weeklyAttendanceUrl}
                    className="inline-flex items-center justify-center rounded-xl bg-zinc-900 px-4 py-2 text-xs md:text-sm font-medium text-white shadow-sm hover:bg-black"
                  >
                    Open weekly attendance pulse
                  </Link>
                  <Link
                    href={assessmentOverviewUrl}
                    className="inline-flex items-center justify-center rounded-xl border border-zinc-300 bg-white px-4 py-2 text-xs md:text-sm font-medium text-zinc-900 shadow-sm hover:bg-zinc-50"
                  >
                    Open assessment overview
                  </Link>
                </div>

                {snapshot.error && (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-800">
                    {snapshot.error}
                  </div>
                )}

                {/* Keep the rest of your UI unchanged if you want – this file only needed the URL fix. */}
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}