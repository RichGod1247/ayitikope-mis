//src/app/headteacher/attendance/weekly/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type KPI = {
  classLabel: string;
  enrolled: number;
  timesOpened: number;
  marks: number;
  boysPresent: number;
  boysAbsent: number;
  girlsPresent: number;
  girlsAbsent: number;
  unclassifiedPresent: number;
  unclassifiedAbsent: number;
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
          const [
            label,
            enrolled,
            timesOpened,
            marks,
            boysPresent,
            boysAbsent,
            girlsPresent,
            girlsAbsent,
            unclassifiedPresent,
            unclassifiedAbsent,
            present,
            absent,
            late,
            excused,
            pct,
          ] = line.split(",");
          return {
            classLabel: label?.replace(/^"|"$/g, "").replace(/""/g, '"') || "Class",
            enrolled: Number(enrolled || 0),
            timesOpened: Number(timesOpened || 0),
            marks: Number(marks || 0),
            boysPresent: Number(boysPresent || 0),
            boysAbsent: Number(boysAbsent || 0),
            girlsPresent: Number(girlsPresent || 0),
            girlsAbsent: Number(girlsAbsent || 0),
            unclassifiedPresent: Number(unclassifiedPresent || 0),
            unclassifiedAbsent: Number(unclassifiedAbsent || 0),
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
      acc.timesOpened += r.timesOpened;
      acc.marks += r.marks;
      acc.boysPresent += r.boysPresent;
      acc.boysAbsent += r.boysAbsent;
      acc.girlsPresent += r.girlsPresent;
      acc.girlsAbsent += r.girlsAbsent;
      acc.unclassifiedPresent += r.unclassifiedPresent;
      acc.unclassifiedAbsent += r.unclassifiedAbsent;
      acc.present += r.present;
      acc.absent += r.absent;
      acc.late += r.late;
      acc.excused += r.excused;
      return acc;
    },
    {
      enrolled: 0,
      timesOpened: 0,
      marks: 0,
      boysPresent: 0,
      boysAbsent: 0,
      girlsPresent: 0,
      girlsAbsent: 0,
      unclassifiedPresent: 0,
      unclassifiedAbsent: 0,
      present: 0,
      absent: 0,
      late: 0,
      excused: 0,
    }
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
    <div className="space-y-3 sm:space-y-4">
      <section className="flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-[#F7F4ED] sm:text-2xl">
            Weekly attendance
          </h1>
          <p className="mt-0.5 text-[11px] text-[#AEB6C4] sm:text-xs">
            {start || "—"} → {end || "—"}
          </p>
        </div>

        <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-medium text-[#C9CDD6]">
          Mon–Fri
        </span>
      </section>

      <section
        aria-label="Weekly attendance controls"
        className="rounded-2xl border border-white/10 bg-white/[0.04] p-2.5 shadow-[0_10px_34px_rgba(0,0,0,0.14)] sm:p-3"
      >
        <div className="flex flex-wrap items-end gap-2">
          <label className="grid gap-1">
            <span className="text-[10px] font-medium text-[#AEB6C4]">Start</span>
            <input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="h-8 rounded-lg border border-white/10 bg-[#07111F] px-2 text-[11px] text-[#F7F4ED] focus:outline-none focus:ring-2 focus:ring-emerald-400/20 sm:text-xs"
            />
          </label>

          <label className="grid gap-1">
            <span className="text-[10px] font-medium text-[#AEB6C4]">End</span>
            <input
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="h-8 rounded-lg border border-white/10 bg-[#07111F] px-2 text-[11px] text-[#F7F4ED] focus:outline-none focus:ring-2 focus:ring-emerald-400/20 sm:text-xs"
            />
          </label>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={loadNow}
              disabled={loading || !canQuery}
              className="inline-flex h-8 items-center justify-center rounded-lg bg-[linear-gradient(135deg,#D4AF37,#E8C96A)] px-3 text-[11px] font-semibold text-[#071A3D] disabled:opacity-50 sm:text-xs"
            >
              {loading ? "Loading…" : "Refresh"}
            </button>

            <button
              type="button"
              onClick={() => {
                const today = new Date();
                const mon = startOfWeekMonday(today);
                const fri = new Date(mon);
                fri.setUTCDate(mon.getUTCDate() + 4);
                setStart(mon.toISOString().slice(0, 10));
                setEnd(fri.toISOString().slice(0, 10));
              }}
              disabled={loading}
              className="inline-flex h-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 px-2.5 text-[11px] font-medium text-[#F7F4ED] transition hover:bg-white/10 disabled:opacity-50 sm:text-xs"
            >
              This week (Mon–Fri)
            </button>

            <button
              type="button"
              onClick={downloadCSV}
              disabled={!canQuery}
              className="inline-flex h-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 px-2.5 text-[11px] font-medium text-[#F7F4ED] transition hover:bg-white/10 disabled:opacity-50 sm:text-xs"
            >
              Download CSV
            </button>
          </div>
        </div>
      </section>

      <section
        aria-label="Weekly attendance summary"
        className="grid grid-cols-2 gap-2 md:grid-cols-4"
      >
        <KpiCard label="Classes" value={fmt(rows.length)} />
        <KpiCard label="Times opened" value={fmt(totals.timesOpened)} hint="Certified, non-holiday class-days only." />
        <KpiCard label="Present" value={fmt(totals.present)} />
        <KpiCard
          label="Present %"
          value={`${pctOverall.toFixed(1)}%`}
          tone={pctOverall >= 90 ? "good" : pctOverall >= 80 ? "ok" : "warn"}
        />
      </section>

      <section className="overflow-hidden rounded-2xl border border-[#D4AF37]/30 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] shadow-[0_20px_64px_rgba(0,0,0,0.22)] backdrop-blur-xl">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-3 py-2.5 sm:px-4">
          <div>
            <h2 className="text-sm font-semibold text-[#F7F4ED] sm:text-base">
              By class (Mon–Fri)
            </h2>
            <p className="mt-0.5 text-[10px] text-[#AEB6C4] sm:text-[11px]">
              Certified, non-holiday sessions only.
            </p>
          </div>

          <span className="rounded-full border border-[#D4AF37]/20 bg-[#D4AF37]/10 px-2 py-1 text-[10px] font-medium text-[#E8C96A]">
            Main view
          </span>
        </div>

        <div className="divide-y divide-white/10 md:hidden">
          {rows.map((r, idx) => (
            <article key={`${r.classLabel}-${idx}`} className="p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold text-[#F7F4ED]">
                    {r.classLabel}
                  </h3>
                  <p className="mt-0.5 text-[10px] text-[#AEB6C4]">
                    Enrolled {fmt(r.enrolled)} · Opened {fmt(r.timesOpened)} times
                  </p>
                </div>

                <span className="shrink-0 rounded-lg bg-white/5 px-2 py-1 font-mono text-xs font-semibold text-[#F7F4ED]">
                  {r.pct.toFixed(1)}%
                </span>
              </div>

              <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
                <MetricLine label="Boys present" value={r.boysPresent} />
                <MetricLine label="Boys absent" value={r.boysAbsent} />
                <MetricLine label="Girls present" value={r.girlsPresent} />
                <MetricLine label="Girls absent" value={r.girlsAbsent} />
              </div>

              <div className="mt-2 flex items-center justify-between border-t border-white/10 pt-2 text-[11px]">
                <span className="text-[#AEB6C4]">Total present</span>
                <span className="font-semibold text-[#F7F4ED]">{fmt(r.present)}</span>
              </div>
            </article>
          ))}

          {rows.length === 0 && !loading && (
            <p className="px-4 py-6 text-center text-xs text-[#AEB6C4]">
              No data in this range yet.
            </p>
          )}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-xs">
            <thead className="border-b border-white/10 bg-white/5">
              <tr>
                <Th label="Class" align="left" />
                <Th label="Enrolled" />
                <Th label="Times Opened" />
                <Th label="Boys P" />
                <Th label="Boys A" />
                <Th label="Girls P" />
                <Th label="Girls A" />
                <Th label="Total P" />
                <Th label="Present %" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => (
                <tr
                  key={`${r.classLabel}-${idx}`}
                  className="border-b border-white/10 hover:bg-white/[0.03]"
                >
                  <td className="whitespace-nowrap px-3 py-2 text-left font-medium text-[#F7F4ED]">
                    {r.classLabel}
                  </td>
                  <td className="px-3 py-2 text-right text-[#DCE1EA]">{fmt(r.enrolled)}</td>
                  <td className="px-3 py-2 text-right font-semibold text-[#F7F4ED]">
                    {fmt(r.timesOpened)}
                  </td>
                  <td className="px-3 py-2 text-right text-[#DCE1EA]">{fmt(r.boysPresent)}</td>
                  <td className="px-3 py-2 text-right text-[#DCE1EA]">{fmt(r.boysAbsent)}</td>
                  <td className="px-3 py-2 text-right text-[#DCE1EA]">{fmt(r.girlsPresent)}</td>
                  <td className="px-3 py-2 text-right text-[#DCE1EA]">{fmt(r.girlsAbsent)}</td>
                  <td className="px-3 py-2 text-right text-[#DCE1EA]">{fmt(r.present)}</td>
                  <td className="px-3 py-2 text-right font-mono font-semibold text-[#F7F4ED]">
                    {r.pct.toFixed(1)}%
                  </td>
                </tr>
              ))}

              {rows.length === 0 && !loading && (
                <tr>
                  <td className="px-4 py-6 text-center text-xs text-[#AEB6C4]" colSpan={9}>
                    No data in this range yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {error && (
          <div className="border-t border-rose-300/20 bg-rose-400/12 px-3 py-2 text-xs text-rose-100 sm:px-4">
            {error}
          </div>
        )}
      </section>

      <details className="group rounded-2xl border border-emerald-300/15 bg-emerald-400/[0.08]">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 text-xs font-semibold text-emerald-100 [&::-webkit-details-marker]:hidden sm:px-4">
          <span>Attendance explainer</span>
          <span className="rounded-lg border border-emerald-300/20 bg-emerald-950/60 px-2 py-1 text-[10px] font-medium">
            Open
          </span>
        </summary>

        <div className="space-y-3 border-t border-emerald-300/15 px-3 py-3 sm:px-4">
          <p className="text-[11px] text-emerald-100/90">
            Converts the real weekly figures into a clear leadership summary.
          </p>

          <button
            type="button"
            disabled={aiLoading || !canQuery}
            onClick={handleAskAi}
            className="inline-flex items-center justify-center rounded-lg bg-emerald-950 px-3 py-2 text-xs font-medium text-white shadow-sm hover:bg-emerald-900 disabled:opacity-50"
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
            <div className="grid grid-cols-1 gap-2 border-t border-emerald-300/15 pt-2 text-[11px] text-emerald-100 sm:grid-cols-2">
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
      </details>
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
  let ringClass = "border-white/10 bg-[#0C1730]/68 text-[#F7F4ED]";
  if (tone === "good") ringClass = "border-emerald-300/20 bg-emerald-400/10 text-emerald-100";
  else if (tone === "ok") ringClass = "border-amber-300/20 bg-amber-400/10 text-amber-100";
  else if (tone === "warn") ringClass = "border-rose-300/20 bg-rose-400/10 text-rose-100";

  return (
    <div
      className={`min-w-0 rounded-xl border px-2.5 py-2 ${ringClass}`}
      aria-label={hint ? `${label}: ${value}. ${hint}` : `${label}: ${value}`}
      title={hint}
    >
      <div className="truncate text-[10px] font-medium text-[#AEB6C4] sm:text-[11px]">
        {label}
      </div>
      <div className="mt-0.5 text-base font-semibold leading-none sm:text-lg">{value}</div>
      {hint ? <span className="sr-only">{hint}</span> : null}
    </div>
  );
}

function MetricLine({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[#AEB6C4]">{label}</span>
      <span className="font-semibold text-[#F7F4ED]">{fmt(value)}</span>
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
