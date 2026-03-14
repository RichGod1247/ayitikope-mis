//src/app/headteacher/attendance/weekly/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type KPI = {
  classLabel: string;
  enrolled: number;
  marks: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
  pct: number;
};

type AiExplainResponse = {
  ok: boolean;
  summary?: string;
  suggestions?: string;
  error?: string;
};

function startOfWeekMonday(d: Date): Date {
  const day = d.getUTCDay();
  const diff = (day === 0 ? -6 : 1) - day;
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  x.setUTCDate(x.getUTCDate() + diff);
  return x;
}

function fmt(n: number) {
  return n.toLocaleString();
}

export default function WeeklyAttendancePage() {
  const [start, setStart] = useState<string>("");
  const [end, setEnd] = useState<string>("");

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<KPI[]>([]);
  const [error, setError] = useState<string>("");

  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiSuggestions, setAiSuggestions] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const today = new Date();
    const mon = startOfWeekMonday(today);
    const fri = new Date(mon);
    fri.setUTCDate(mon.getUTCDate() + 4);
    setStart(mon.toISOString().slice(0, 10));
    setEnd(fri.toISOString().slice(0, 10));
  }, []);

  const canQuery = useMemo(() => Boolean(start && end), [start, end]);

  async function loadNow() {
    if (!canQuery) return;
    setLoading(true);
    setError("");
    setRows([]);
    setAiSummary(null);
    setAiSuggestions(null);
    setAiError(null);

    if (abortRef.current) abortRef.current.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const u = new URL("/api/headteacher/attendance/weekly/csv", window.location.origin);
      u.searchParams.set("start", start);
      u.searchParams.set("end", end);

      const res = await fetch(u.toString(), { cache: "no-store", signal: ac.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const csv = await res.text();
      const lines = csv.trim().split("\n");
      const body = lines.slice(1);

      const parsed: KPI[] = body
        .filter(Boolean)
        .map((line) => {
          const [label, enrolled, marks, present, absent, late, excused, pct] = line.split(",");
          return {
            classLabel: label?.replace(/^"|"$/g, "").replace(/""/g, '"') || "Class",
            enrolled: Number(enrolled || 0),
            marks: Number(marks || 0),
            present: Number(present || 0),
            absent: Number(absent || 0),
            late: Number(late || 0),
            excused: Number(excused || 0),
            pct: Number(pct || 0),
          };
        });

      setRows(parsed);
    } catch (e: any) {
      if (e?.name !== "AbortError") setError("Failed to load weekly report.");
    } finally {
      if (abortRef.current === ac) abortRef.current = null;
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!canQuery) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void loadNow();
    }, 350);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start, end]);

  function downloadCSV() {
    if (!canQuery) return;
    const u = new URL("/api/headteacher/attendance/weekly/csv", window.location.origin);
    u.searchParams.set("start", start);
    u.searchParams.set("end", end);
    window.location.href = u.toString();
  }

  const totals = rows.reduce(
    (acc, r) => {
      acc.enrolled += r.enrolled;
      acc.marks += r.marks;
      acc.present += r.present;
      acc.absent += r.absent;
      acc.late += r.late;
      acc.excused += r.excused;
      return acc;
    },
    { enrolled: 0, marks: 0, present: 0, absent: 0, late: 0, excused: 0 }
  );

  const pctOverall =
    totals.marks > 0 ? Math.round((totals.present / totals.marks) * 1000) / 10 : 0;

  const sortedByPct = [...rows].sort((a, b) => b.pct - a.pct);
  const bestClass = sortedByPct[0];
  const worstClass = sortedByPct[sortedByPct.length - 1];

  async function handleAskAi() {
    if (!canQuery) return;

    setAiLoading(true);
    setAiError(null);
    setAiSummary(null);
    setAiSuggestions(null);

    try {
      const res = await fetch("/api/headteacher/attendance/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start, end }),
      });

      const j = (await res.json().catch(() => ({}))) as AiExplainResponse;

      if (!res.ok || !j.ok) {
        setAiError(j.error || "AI could not summarise this week. Please try again later.");
        return;
      }

      setAiSummary(j.summary ?? null);
      setAiSuggestions(j.suggestions ?? null);
    } catch {
      setAiError("Network or server error while loading the attendance explanation.");
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(5,7,11,0.92),rgba(7,26,61,0.94),rgba(5,7,11,0.96))] p-5 shadow-[0_26px_90px_rgba(0,0,0,0.28)] md:p-6">
        <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:64px_64px]" />
        <div className="absolute -left-16 top-0 h-48 w-48 rounded-full bg-[#1B66D1]/20 blur-3xl" />
        <div className="absolute right-0 top-0 h-44 w-44 rounded-full bg-[#D4AF37]/14 blur-3xl" />

        <div className="relative space-y-3">
          <div className="inline-flex items-center rounded-full border border-emerald-300/20 bg-emerald-400/12 px-3 py-1 text-[11px] font-medium text-emerald-100">
            EduLife OS · Head · Attendance
          </div>

          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold tracking-tight text-[#F7F4ED] md:text-3xl">
                Weekly attendance pulse
              </h1>
              <p className="max-w-2xl text-xs text-[#C9CDD6] md:text-sm">
                One-glance view of how faithfully classes met this week, with a
                server-trusted explainer for decision-making.
              </p>
            </div>
            <div className="text-xs text-[#AEB6C4] md:text-right">
              <p>
                Week: <span className="font-semibold text-[#F7F4ED]">{start || "—"} → {end || "—"}</span>
              </p>
              <p>
                Scope: <span className="font-semibold text-[#F7F4ED]">Current signed-in school</span>
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] px-4 py-4 shadow-[0_18px_60px_rgba(0,0,0,0.18)] backdrop-blur-xl md:px-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="flex w-full flex-col gap-3 md:flex-row md:items-end">
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-[#C9CDD6]">Start (Mon)</label>
              <input
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="rounded-xl border border-white/10 bg-[#07111F] px-3 py-2 text-xs text-[#F7F4ED] focus:outline-none focus:ring-2 focus:ring-emerald-400/20 md:text-sm"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-medium text-[#C9CDD6]">End (Fri)</label>
              <input
                type="date"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className="rounded-xl border border-white/10 bg-[#07111F] px-3 py-2 text-xs text-[#F7F4ED] focus:outline-none focus:ring-2 focus:ring-emerald-400/20 md:text-sm"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={loadNow}
              disabled={loading || !canQuery}
              className="inline-flex items-center justify-center rounded-xl bg-[linear-gradient(135deg,#D4AF37,#E8C96A)] px-4 py-2 text-xs font-semibold text-[#071A3D] shadow-[0_18px_50px_rgba(212,175,55,0.22)] disabled:opacity-50 md:text-sm"
            >
              {loading ? "Loading…" : "Refresh"}
            </button>

            <button
              onClick={() => {
                const today = new Date();
                const mon = startOfWeekMonday(today);
                const fri = new Date(mon);
                fri.setUTCDate(mon.getUTCDate() + 4);
                setStart(mon.toISOString().slice(0, 10));
                setEnd(fri.toISOString().slice(0, 10));
              }}
              disabled={loading}
              className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-[#F7F4ED] transition hover:bg-white/10 md:text-sm"
            >
              This week (Mon–Fri)
            </button>

            <button
              onClick={downloadCSV}
              disabled={!canQuery}
              className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-[#F7F4ED] transition hover:bg-white/10 md:text-sm"
            >
              Download CSV
            </button>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 md:gap-5 lg:grid-cols-[1.5fr_minmax(0,1.3fr)]">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiCard label="Classes in report" value={fmt(rows.length)} hint="Distinct classes with marks in this range." />
          <KpiCard label="Marks taken" value={fmt(totals.marks)} hint="Every time a register was taken." />
          <KpiCard label="Present marks" value={fmt(totals.present)} hint="Total present across all marks." />
          <KpiCard
            label="Overall present %"
            value={`${pctOverall.toFixed(1)}%`}
            tone={pctOverall >= 90 ? "good" : pctOverall >= 80 ? "ok" : "warn"}
            hint="Whole-school attendance rate for the week."
          />
        </div>

        <div className="rounded-[28px] border border-emerald-300/20 bg-emerald-400/12 px-4 py-4 shadow-[0_18px_60px_rgba(0,0,0,0.18)] backdrop-blur-xl md:px-5 md:py-5">
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-emerald-100 md:text-base">Attendance explainer</h2>
                <p className="text-[11px] text-emerald-100/90 md:text-xs">
                  Converts the real weekly figures into a clear leadership summary.
                </p>
              </div>
              <span className="inline-flex items-center rounded-full bg-emerald-950 px-3 py-1 text-[10px] font-medium text-white">
                Head only
              </span>
            </div>

            <button
              type="button"
              disabled={aiLoading || !canQuery}
              onClick={handleAskAi}
              className="inline-flex items-center justify-center rounded-xl bg-emerald-950 px-3 py-2 text-xs font-medium text-white shadow-sm hover:bg-emerald-900 disabled:opacity-50 md:text-sm"
            >
              {aiLoading ? "Explaining…" : "Explain this week for me"}
            </button>

            {aiError && (
              <div className="rounded-xl border border-rose-300/20 bg-rose-400/12 px-3 py-2 text-[11px] text-rose-100">
                {aiError}
              </div>
            )}

            {aiSummary && (
              <div className="space-y-2">
                <div className="whitespace-pre-line rounded-xl border border-emerald-300/20 bg-[#08111F]/80 px-3 py-2 text-[11px] text-emerald-50">
                  {aiSummary}
                </div>
                {aiSuggestions && (
                  <div className="whitespace-pre-line rounded-xl border border-emerald-300/15 bg-emerald-400/10 px-3 py-2 text-[11px] text-emerald-100">
                    {aiSuggestions}
                  </div>
                )}
              </div>
            )}

            {rows.length > 0 && (
              <div className="mt-2 grid grid-cols-1 gap-2 border-t border-emerald-300/15 pt-2 text-[11px] text-emerald-100 sm:grid-cols-2">
                {bestClass && (
                  <div className="rounded-xl border border-emerald-300/20 bg-[#08111F]/75 px-3 py-2">
                    <div className="font-semibold">Strongest attendance</div>
                    <div className="flex items-baseline justify-between gap-2">
                      <span>{bestClass.classLabel}</span>
                      <span className="font-mono">{bestClass.pct.toFixed(1)}%</span>
                    </div>
                  </div>
                )}
                {worstClass && (
                  <div className="rounded-xl border border-amber-300/20 bg-amber-400/10 px-3 py-2">
                    <div className="font-semibold">Needs attention</div>
                    <div className="flex items-baseline justify-between gap-2">
                      <span>{worstClass.classLabel}</span>
                      <span className="font-mono">{worstClass.pct.toFixed(1)}%</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] shadow-[0_18px_60px_rgba(0,0,0,0.18)] backdrop-blur-xl">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <h2 className="text-sm font-semibold text-[#F7F4ED]">By class (Mon–Fri)</h2>
          <p className="text-[11px] text-[#AEB6C4]">Each row is a class rolled up across the selected dates.</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs md:text-sm">
            <thead className="border-b border-white/10 bg-white/5">
              <tr>
                <Th label="Class" align="left" />
                <Th label="Enrolled" />
                <Th label="Marks" />
                <Th label="Present" />
                <Th label="Absent" />
                <Th label="Late" />
                <Th label="Excused" />
                <Th label="Present %" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => (
                <tr key={`${r.classLabel}-${idx}`} className="border-b border-white/10 hover:bg-white/[0.03]">
                  <td className="whitespace-nowrap px-3 py-2 text-left text-[#F7F4ED]">{r.classLabel}</td>
                  <td className="px-3 py-2 text-right text-[#DCE1EA]">{fmt(r.enrolled)}</td>
                  <td className="px-3 py-2 text-right text-[#DCE1EA]">{fmt(r.marks)}</td>
                  <td className="px-3 py-2 text-right text-[#DCE1EA]">{fmt(r.present)}</td>
                  <td className="px-3 py-2 text-right text-[#DCE1EA]">{fmt(r.absent)}</td>
                  <td className="px-3 py-2 text-right text-[#DCE1EA]">{fmt(r.late)}</td>
                  <td className="px-3 py-2 text-right text-[#DCE1EA]">{fmt(r.excused)}</td>
                  <td className="px-3 py-2 text-right font-mono text-[#F7F4ED]">{r.pct.toFixed(1)}%</td>
                </tr>
              ))}

              {rows.length === 0 && !loading && (
                <tr>
                  <td className="px-4 py-6 text-center text-xs text-[#AEB6C4]" colSpan={8}>
                    No data in this range yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {error && (
          <div className="border-t border-rose-300/20 bg-rose-400/12 px-4 py-3 text-xs text-rose-100">
            {error}
          </div>
        )}
      </section>
    </div>
  );
}

function KpiCard({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "good" | "ok" | "warn";
}) {
  let ringClass = "border-white/10 bg-[#0C1730]/78 text-[#F7F4ED] shadow-[0_12px_36px_rgba(0,0,0,0.16)]";
  if (tone === "good") ringClass = "border-emerald-300/20 bg-emerald-400/12 text-emerald-100 shadow-[0_12px_36px_rgba(0,0,0,0.16)]";
  else if (tone === "ok") ringClass = "border-amber-300/20 bg-amber-400/12 text-amber-100 shadow-[0_12px_36px_rgba(0,0,0,0.16)]";
  else if (tone === "warn") ringClass = "border-rose-300/20 bg-rose-400/12 text-rose-100 shadow-[0_12px_36px_rgba(0,0,0,0.16)]";

  return (
    <div className={`rounded-2xl border px-3 py-3 md:px-4 md:py-4 ${ringClass}`}>
      <div className="text-[11px] font-medium text-[#AEB6C4] md:text-xs">{label}</div>
      <div className="mt-1 text-lg font-semibold md:text-2xl">{value}</div>
      {hint && <p className="mt-1 max-w-xs text-[10px] text-[#8F98A8]">{hint}</p>}
    </div>
  );
}

function Th({ label, align = "right" }: { label: string; align?: "left" | "right" }) {
  return (
    <th
      className={`px-3 py-2 text-[11px] font-semibold text-[#E8C96A] ${
        align === "left" ? "text-left" : "text-right"
      }`}
    >
      {label}
    </th>
  );
}