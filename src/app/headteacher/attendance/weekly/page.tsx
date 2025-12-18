// src/app/headteacher/attendance/weekly/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Tenant = { id: string; name: string; slug: string };

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
  const x = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  );
  x.setUTCDate(x.getUTCDate() + diff);
  return x;
}

function fmt(n: number) {
  return n.toLocaleString();
}

export default function WeeklyAttendancePage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantId, setTenantId] = useState<string>("");

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

  // -----------------------------
  // Initial load: default week + tenants
  // -----------------------------
  useEffect(() => {
    const today = new Date();
    const mon = startOfWeekMonday(today);
    const fri = new Date(mon);
    fri.setUTCDate(mon.getUTCDate() + 4);
    setStart(mon.toISOString().slice(0, 10));
    setEnd(fri.toISOString().slice(0, 10));

    fetch("/api/test/tenants")
      .then((r) => r.json())
      .then((j) => {
        const arr = Array.isArray(j?.tenants) ? (j.tenants as Tenant[]) : [];
        setTenants(arr);
        if (arr.length && !tenantId) setTenantId(arr[0].id);
      })
      .catch(() => {
        // Silent failure: page will just say "No data"
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canQuery = useMemo(
    () => Boolean(tenantId && start && end),
    [tenantId, start, end]
  );

  // -----------------------------
  // Load CSV data for the given range
  // -----------------------------
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
      const u = new URL(
        "/api/headteacher/attendance/weekly/csv",
        window.location.origin
      );
      u.searchParams.set("tenantId", tenantId);
      u.searchParams.set("start", start);
      u.searchParams.set("end", end);

      const res = await fetch(u.toString(), {
        cache: "no-store",
        signal: ac.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const csv = await res.text();
      const lines = csv.trim().split("\n");
      const body = lines.slice(1); // skip header

      const parsed: KPI[] = body
        .filter(Boolean)
        .map((line) => {
          const [
            label,
            enrolled,
            marks,
            present,
            absent,
            late,
            excused,
            pct,
          ] = line.split(",");

          return {
            classLabel: label,
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
      if (e?.name !== "AbortError") {
        setError("Failed to load weekly report.");
      }
    } finally {
      if (abortRef.current === ac) abortRef.current = null;
      setLoading(false);
    }
  }

  // Auto reload when filters change (small debounce)
  useEffect(() => {
    if (!canQuery) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void loadNow();
    }, 400);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, start, end]);

  // -----------------------------
  // CSV download
  // -----------------------------
  function downloadCSV() {
    if (!canQuery) return;
    const u = new URL(
      "/api/headteacher/attendance/weekly/csv",
      window.location.origin
    );
    u.searchParams.set("tenantId", tenantId);
    u.searchParams.set("start", start);
    u.searchParams.set("end", end);
    window.location.href = u.toString();
  }

  // -----------------------------
  // Aggregates + AI payload
  // -----------------------------
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
    {
      enrolled: 0,
      marks: 0,
      present: 0,
      absent: 0,
      late: 0,
      excused: 0,
    }
  );

  const pctOverall =
    totals.marks > 0
      ? Math.round((totals.present / totals.marks) * 1000) / 10
      : 0;

  // Quick "top" / "bottom" classes for AI + small badges
  const sortedByPct = [...rows].sort((a, b) => b.pct - a.pct);
  const bestClass = sortedByPct[0];
  const worstClass = sortedByPct[sortedByPct.length - 1];

  // -----------------------------
  // AI Explain handler
  // -----------------------------
  async function handleAskAi() {
    if (!canQuery || rows.length === 0) return;

    setAiLoading(true);
    setAiError(null);
    setAiSummary(null);
    setAiSuggestions(null);

    try {
      // 🔁 IMPORTANT:
      // Use the existing weekly explainer route
      // and send the body shape it expects.
      const res = await fetch(
        "/api/headteacher/attendance/weekly/explain",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tenantId,
            start,
            end,
            pctOverall,
            totals: {
              enrolled: totals.enrolled,
              marks: totals.marks,
              present: totals.present,
              absent: totals.absent,
              late: totals.late,
              excused: totals.excused,
            },
            rows: rows.map((r) => ({
              classLabel: r.classLabel,
              enrolled: r.enrolled,
              marks: r.marks,
              present: r.present,
              absent: r.absent,
              late: r.late,
              excused: r.excused,
              pct: r.pct,
            })),
          }),
        }
      );

      const j = (await res.json().catch(() => ({}))) as AiExplainResponse;

      if (!res.ok || !j.ok) {
        setAiError(
          j.error ||
            "AI could not summarise this week. Please try again later."
        );
        return;
      }

      setAiSummary(j.summary ?? null);
      // weekly/explain doesn’t currently send suggestions, so this will just be null.
      setAiSuggestions(j.suggestions ?? null);
    } catch (err) {
      setAiError(
        "Network or server error while talking to the AI explainer. Please try again."
      );
    } finally {
      setAiLoading(false);
    }
  }

  // -----------------------------
  // Render
  // -----------------------------
  return (
    <main className="min-h-screen bg-zinc-50">
      <div className="mx-auto max-w-6xl px-4 py-6 md:py-8 space-y-6">
        {/* Header */}
        <header className="space-y-2">
          <div className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-medium text-emerald-800">
            EduLife OS · Head · Attendance
          </div>
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
            <div className="space-y-1">
              <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
                Weekly attendance pulse
              </h1>
              <p className="text-xs md:text-sm text-zinc-600 max-w-2xl">
                One glance view of{" "}
                <span className="font-semibold">how faithfully classes met</span>{" "}
                this week. Designed so that a headteacher can act quickly — not
                drown in spreadsheets.
              </p>
            </div>
            <div className="text-xs text-zinc-500 md:text-right">
              <p>
                Week:{" "}
                <span className="font-semibold">
                  {start || "—"} → {end || "—"}
                </span>
              </p>
              <p>
                School:{" "}
                <span className="font-semibold">
                  {tenants.find((t) => t.id === tenantId)?.name ??
                    "Select school"}
                </span>
              </p>
            </div>
          </div>
        </header>

        {/* Filters */}
        <section className="rounded-2xl border border-zinc-200 bg-white/80 px-4 py-4 md:px-5 md:py-4 shadow-sm flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div className="flex flex-col md:flex-row gap-3 md:items-end w-full">
            {/* Tenant */}
            <div className="flex-1 space-y-1">
              <label className="text-[11px] font-medium text-zinc-700">
                School (tenant)
              </label>
              <select
                value={tenantId}
                onChange={(e) => setTenantId(e.target.value)}
                className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-xs md:text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Date range */}
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-zinc-700">
                Start (Mon)
              </label>
              <input
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-xs md:text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-zinc-700">
                End (Fri)
              </label>
              <input
                type="date"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-xs md:text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          </div>

          {/* Buttons */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={loadNow}
              disabled={loading || !canQuery}
              className="inline-flex items-center justify-center rounded-xl bg-zinc-900 px-4 py-2 text-xs md:text-sm font-medium text-white shadow-sm hover:bg-black disabled:opacity-50"
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
              className="inline-flex items-center justify-center rounded-xl border border-zinc-300 bg-white px-4 py-2 text-xs md:text-sm font-medium text-zinc-800 hover:bg-zinc-50"
            >
              This week (Mon–Fri)
            </button>
            <button
              onClick={downloadCSV}
              disabled={!canQuery}
              title="Download CSV"
              className="inline-flex items-center justify-center rounded-xl border border-zinc-300 bg-white px-4 py-2 text-xs md:text-sm font-medium text-zinc-800 hover:bg-zinc-50"
            >
              Download CSV
            </button>
          </div>
        </section>

        {/* KPIs + AI explainer */}
        <section className="grid grid-cols-1 lg:grid-cols-[1.5fr_minmax(0,1.3fr)] gap-4 md:gap-5">
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard
              label="Classes in report"
              value={fmt(rows.length)}
              hint="Total distinct classes with marks in this range."
            />
            <KpiCard
              label="Marks taken"
              value={fmt(totals.marks)}
              hint="Every time a register was taken."
            />
            <KpiCard
              label="Present marks"
              value={fmt(totals.present)}
              hint="Total present across all marks."
            />
            <KpiCard
              label="Overall present %"
              value={`${pctOverall.toFixed(1)}%`}
              tone={
                pctOverall >= 90
                  ? "good"
                  : pctOverall >= 80
                  ? "ok"
                  : "warn"
              }
              hint="Simple whole-school attendance rate for the week."
            />
          </div>

          {/* AI explainer */}
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 px-4 py-4 md:px-5 md:py-5 space-y-3 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm md:text-base font-semibold text-emerald-900">
                  AI attendance explainer
                </h2>
                <p className="text-[11px] md:text-xs text-emerald-900/90">
                  Let EduLife OS turn these numbers into a short{" "}
                  <span className="font-semibold">
                    story you can share
                  </span>{" "}
                  with staff or your circuit supervisor.
                </p>
              </div>
              <span className="inline-flex items-center rounded-full bg-emerald-900 text-white text-[10px] font-medium px-3 py-1">
                Beta · Head only
              </span>
            </div>

            <button
              type="button"
              disabled={aiLoading || rows.length === 0 || !canQuery}
              onClick={handleAskAi}
              className="inline-flex items-center justify-center rounded-xl bg-emerald-900 px-3 py-2 text-xs md:text-sm font-medium text-white shadow-sm hover:bg-emerald-950 disabled:opacity-50"
            >
              {aiLoading
                ? "Thinking with you…"
                : rows.length === 0
                ? "No data to explain"
                : "Explain this week for me"}
            </button>

            {aiError && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-800">
                {aiError}
              </div>
            )}

            {aiSummary && (
              <div className="space-y-2">
                <div className="rounded-xl border border-emerald-200 bg-white px-3 py-2 text-[11px] text-emerald-950 whitespace-pre-line">
                  {aiSummary}
                </div>
                {aiSuggestions && (
                  <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-900 whitespace-pre-line">
                    {aiSuggestions}
                  </div>
                )}
              </div>
            )}

            {!aiError && !aiSummary && !aiLoading && rows.length === 0 && (
              <p className="text-[11px] text-emerald-900/90">
                Once there is at least one week of marks in this range,
                you can ask the AI explainer to summarise strengths,
                gaps and a simple follow-up action.
              </p>
            )}

            {/* Tiny badges for best/worst class */}
            {rows.length > 0 && (
              <div className="border-t border-emerald-100 pt-2 mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-emerald-900">
                {bestClass && (
                  <div className="rounded-xl bg-white/70 px-3 py-2 border border-emerald-100">
                    <div className="font-semibold">
                      Strongest attendance
                    </div>
                    <div className="flex items-baseline justify-between gap-2">
                      <span>{bestClass.classLabel}</span>
                      <span className="font-mono">
                        {bestClass.pct.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                )}
                {worstClass && (
                  <div className="rounded-xl bg-white/60 px-3 py-2 border border-amber-100">
                    <div className="font-semibold">
                      Needs attention
                    </div>
                    <div className="flex items-baseline justify-between gap-2">
                      <span>{worstClass.classLabel}</span>
                      <span className="font-mono">
                        {worstClass.pct.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Data table */}
        <section className="rounded-2xl border border-zinc-200 bg-white/80 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100">
            <h2 className="text-sm font-semibold text-zinc-900">
              By class (Mon–Fri)
            </h2>
            <p className="text-[11px] text-zinc-500">
              Each row is a class, rolled up across the selected dates.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs md:text-sm">
              <thead className="bg-zinc-50 border-b border-zinc-100">
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
                  <tr
                    key={`${r.classLabel}-${idx}`}
                    className="border-b border-zinc-100 hover:bg-zinc-50/60"
                  >
                    <td className="px-3 py-2 text-left whitespace-nowrap">
                      {r.classLabel}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {fmt(r.enrolled)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {fmt(r.marks)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {fmt(r.present)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {fmt(r.absent)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {fmt(r.late)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {fmt(r.excused)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {r.pct.toFixed(1)}%
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && !loading && (
                  <tr>
                    <td
                      className="px-4 py-6 text-center text-xs text-zinc-500"
                      colSpan={8}
                    >
                      No data in this range yet. Once teachers take
                      attendance through EduLife OS, this table will
                      light up.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {error && (
            <div className="px-4 py-3 text-xs text-red-700 bg-red-50 border-t border-red-100">
              {error}
            </div>
          )}

          <div className="px-4 py-3 text-[11px] text-zinc-500 border-t border-zinc-100">
            Tip: this weekly view pairs with the{" "}
            <span className="font-semibold">Head Portal</span> tile so
            that attendance is never a surprise — only a conversation
            starter.
          </div>
        </section>
      </div>
    </main>
  );
}

// -----------------------------
// Small sub components
// -----------------------------

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
  let ringClass =
    "ring-0 border-zinc-200 bg-white text-zinc-900 shadow-sm";
  if (tone === "good") {
    ringClass =
      "border-emerald-200 bg-emerald-50/80 text-emerald-900 shadow-sm";
  } else if (tone === "ok") {
    ringClass =
      "border-amber-200 bg-amber-50/80 text-amber-900 shadow-sm";
  } else if (tone === "warn") {
    ringClass = "border-red-200 bg-red-50/80 text-red-900 shadow-sm";
  }

  return (
    <div
      className={`rounded-2xl border px-3 py-3 md:px-4 md:py-4 ${ringClass}`}
    >
      <div className="text-[11px] md:text-xs font-medium text-zinc-600">
        {label}
      </div>
      <div className="mt-1 text-lg md:text-2xl font-semibold">
        {value}
      </div>
      {hint && (
        <p className="mt-1 text-[10px] text-zinc-500 max-w-xs">
          {hint}
        </p>
      )}
    </div>
  );
}

function Th({ label, align = "right" }: { label: string; align?: "left" | "right" }) {
  return (
    <th
      className={`px-3 py-2 text-[11px] font-semibold text-zinc-500 ${
        align === "left" ? "text-left" : "text-right"
      }`}
    >
      {label}
    </th>
  );
}
