// src/app/headteacher/dashboard/ui.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type WeeklyRow = {
  classroomId: string;
  classLabel: string;
  enrolled: number;
  marks: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
  pct: number;
};

type WeeklyOk = {
  ok: true;
  start: string;
  end: string;
  totals: {
    classes: number;
    enrolled: number;
    marks: number;
    present: number;
    absent: number;
    late: number;
    excused: number;
    pctOverall: number;
  };
  rows: WeeklyRow[];
};

type WeeklyResp = WeeklyOk | { ok: false; error: string };

type ExplainResp =
  | { ok: true; summary: string; suggestions?: string; meta?: unknown }
  | { ok: false; error: string };

type PendingResp =
  | {
      ok: true;
      start: string;
      end: string;
      count: number;
      items: Array<{ id: string; date: string; classroomId: string; classLabel: string }>;
    }
  | { ok: false; error: string };

type CertifyResp =
  | { ok: true; item: { id: string; certifiedAt: string; certifiedByUserId: string } }
  | { ok: false; error: string };

type PendingLessonNotesResp =
  | {
      ok: true;
      count: number;
      items: Array<{
        id: string;
        updatedAt: string;
        subject: string | null;
        term: string | null;
        academicYear: string | null;
        weekNumber: number | null;
        teacherUserId: string | null;
        teacherName: string | null;
      }>;
    }
  | { ok: false; error: string };

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function defaultRange() {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 6);
  return { start: isoDate(start), end: isoDate(end) };
}

function pctLabel(v: number) {
  if (!Number.isFinite(v)) return "0.0%";
  return `${Math.max(0, Math.min(100, v)).toFixed(1)}%`;
}

function errorOf(resp: any) {
  if (!resp) return "";
  if (resp.ok === false) return resp.error || "";
  return "";
}

function Card(props: { title: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border bg-white p-4">
      <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">{props.title}</p>
      <p className="mt-2 text-2xl font-semibold text-zinc-900">{props.value}</p>
      {props.sub ? <p className="mt-1 text-xs text-zinc-600">{props.sub}</p> : null}
    </div>
  );
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  try {
    return (await r.json()) as T;
  } catch {
    return { ok: false, error: "Invalid server response." } as unknown as T;
  }
}

function formatDateShort(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

export default function HeadteacherDashboardClient() {
  const router = useRouter();

  const initial = useMemo(() => defaultRange(), []);
  const [start, setStart] = useState(initial.start);
  const [end, setEnd] = useState(initial.end);

  const [weekly, setWeekly] = useState<WeeklyResp | null>(null);
  const [pending, setPending] = useState<PendingResp | null>(null);
  const [explain, setExplain] = useState<ExplainResp | null>(null);

  const [pendingNotes, setPendingNotes] = useState<PendingLessonNotesResp | null>(null);

  const [loading, setLoading] = useState(false);
  const [busyCertifyId, setBusyCertifyId] = useState<string | null>(null);
  const [noteBySessionId, setNoteBySessionId] = useState<Record<string, string>>({});

  const reqSeq = useRef(0);

  async function loadAll() {
    const mySeq = ++reqSeq.current;

    if (start && end && start > end) {
      setWeekly({ ok: false, error: "Start date cannot be after end date." });
      setPending({ ok: false, error: "Start date cannot be after end date." });
      setExplain({ ok: false, error: "Start date cannot be after end date." });
      setPendingNotes({ ok: false, error: "Start date cannot be after end date." });
      return;
    }

    setLoading(true);
    try {
      const qs = `start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`;

      const [w, p, pn] = await Promise.all([
        fetchJson<WeeklyResp>(`/api/headteacher/attendance/weekly/summary?${qs}`, { cache: "no-store" }),
        fetchJson<PendingResp>(`/api/headteacher/attendance/sessions/pending?${qs}`, { cache: "no-store" }),
        fetchJson<PendingLessonNotesResp>(`/api/headteacher/lesson-notes/pending?limit=5`, { cache: "no-store" }),
      ]);

      if (mySeq !== reqSeq.current) return;

      setWeekly(w);
      setPending(p);
      setPendingNotes(pn);

      const e = await fetchJson<ExplainResp>(`/api/headteacher/attendance/explain`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ start, end }),
      });

      if (mySeq !== reqSeq.current) return;
      setExplain(e);
    } catch {
      if (mySeq !== reqSeq.current) return;
      setWeekly({ ok: false, error: "Failed to load dashboard data." });
      setPending({ ok: false, error: "Failed to load dashboard data." });
      setExplain({ ok: false, error: "Failed to load dashboard data." });
      setPendingNotes({ ok: false, error: "Failed to load dashboard data." });
    } finally {
      if (mySeq === reqSeq.current) setLoading(false);
    }
  }

  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function certify(sessionId: string) {
    setBusyCertifyId(sessionId);
    try {
      const note = (noteBySessionId[sessionId] ?? "").trim() || null;

      const res = await fetchJson<CertifyResp>(`/api/headteacher/attendance/certify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId, note }),
      });

      if (!res.ok) {
        window.alert(res.error || "Failed to certify.");
        return;
      }

      setNoteBySessionId((m) => {
        const next = { ...m };
        delete next[sessionId];
        return next;
      });

      await loadAll();
    } catch {
      window.alert("Server error certifying attendance.");
    } finally {
      setBusyCertifyId(null);
    }
  }

  const csvHref = useMemo(() => {
    const qs = `start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`;
    return `/api/headteacher/attendance/weekly/csv?${qs}`;
  }, [start, end]);

  const weeklyOk = weekly && (weekly as any).ok === true;
  const pendingOk = pending && (pending as any).ok === true;
  const explainOk = explain && (explain as any).ok === true;

  const pendingNotesOk = pendingNotes && (pendingNotes as any).ok === true;

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="rounded-2xl border bg-white p-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-zinc-900">Weekly Range</p>
          <p className="text-xs text-zinc-600">Choose a week window to analyze.</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
          <div className="flex gap-3">
            <div className="flex flex-col">
              <label className="text-xs text-zinc-600">Start</label>
              <input
                className="rounded-xl border px-3 py-2 text-sm"
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </div>
            <div className="flex flex-col">
              <label className="text-xs text-zinc-600">End</label>
              <input
                className="rounded-xl border px-3 py-2 text-sm"
                type="date"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </div>
          </div>

          <div className="flex gap-2">
            <button
              className="rounded-xl border px-4 py-2 text-sm hover:bg-zinc-50 disabled:opacity-60"
              onClick={() => void loadAll()}
              disabled={loading}
            >
              {loading ? "Refreshing..." : "Refresh"}
            </button>

            <a className="rounded-xl border px-4 py-2 text-sm hover:bg-zinc-50" href={csvHref}>
              Download CSV
            </a>
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card
          title="Overall Attendance"
          value={weeklyOk ? pctLabel((weekly as WeeklyOk).totals.pctOverall) : "—"}
          sub={weeklyOk ? `${(weekly as WeeklyOk).totals.marks.toLocaleString()} marks` : errorOf(weekly)}
        />
        <Card
          title="Classes Covered"
          value={weeklyOk ? String((weekly as WeeklyOk).totals.classes) : "—"}
          sub={weeklyOk ? `${(weekly as WeeklyOk).totals.enrolled.toLocaleString()} enrolled total` : ""}
        />
        <Card
          title="Present / Absent"
          value={
            weeklyOk
              ? `${(weekly as WeeklyOk).totals.present.toLocaleString()} / ${(weekly as WeeklyOk).totals.absent.toLocaleString()}`
              : "—"
          }
          sub={weeklyOk ? "This range" : ""}
        />
        <Card
          title="Late / Excused"
          value={
            weeklyOk
              ? `${(weekly as WeeklyOk).totals.late.toLocaleString()} / ${(weekly as WeeklyOk).totals.excused.toLocaleString()}`
              : "—"
          }
          sub={weeklyOk ? "This range" : ""}
        />
      </div>

      {/* Pending lesson notes (Phase 5 wiring) */}
      <div className="rounded-2xl border bg-white p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-zinc-900">Pending Lesson Notes</p>
            <p className="text-xs text-zinc-600">Submitted lesson notes awaiting your review.</p>
          </div>

          <button
            className="rounded-xl border px-4 py-2 text-sm hover:bg-zinc-50"
            onClick={() => router.push("/headteacher/lesson-notes")}
          >
            Open Inbox
          </button>
        </div>

        {!pendingNotes ? (
          <p className="text-sm text-zinc-600">Loading…</p>
        ) : pendingNotesOk ? (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <Card title="Pending" value={String((pendingNotes as any).count)} sub="SUBMITTED" />
              <Card title="Review SLA" value="Today" sub="Aim: same-day feedback" />
              <Card title="System" value="Tenant scoped" sub="No spoofing" />
            </div>

            {(pendingNotes as any).items.length ? (
              <div className="space-y-2">
                {(pendingNotes as any).items.map((it: any) => {
                  const teacherLabel = (it.teacherName ?? it.teacherUserId ?? "Teacher —") as string;

                  return (
                    <button
                      key={it.id}
                      type="button"
                      onClick={() => router.push(`/headteacher/lesson-notes/${encodeURIComponent(it.id)}`)}
                      className="w-full text-left rounded-2xl border px-3 py-3 hover:bg-zinc-50"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-zinc-900 truncate">
                            {(it.subject ?? "Subject —")} • {(it.term ?? "Term —")} • {(it.academicYear ?? "Year —")}
                          </p>
                          <p className="text-[11px] text-zinc-600">
                            {it.weekNumber != null ? `Week ${it.weekNumber}` : "Week —"} • Updated:{" "}
                            {formatDateShort(it.updatedAt)}
                          </p>
                          <p className="text-[11px] text-zinc-500">
                            Teacher: <span className="font-medium">{teacherLabel}</span>
                          </p>
                        </div>
                        <span className="text-[11px] text-zinc-500 font-mono">{String(it.id).slice(0, 8)}…</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-zinc-700">No submitted lesson notes right now.</p>
            )}
          </>
        ) : (
          <p className="text-sm text-red-600">{(pendingNotes as any).error || "Failed to load pending lesson notes."}</p>
        )}
      </div>

      {/* Explainer */}
      <div className="rounded-2xl border bg-white p-4">
        <div>
          <p className="text-sm font-semibold text-zinc-900">Weekly Explanation</p>
          <p className="text-xs text-zinc-600">Rule-based “AI-like” summary for fast decisions.</p>
        </div>

        <div className="mt-3 space-y-3">
          {!explain ? (
            <p className="text-sm text-zinc-600">Loading…</p>
          ) : explainOk ? (
            <>
              <pre className="whitespace-pre-wrap text-sm text-zinc-800 leading-6">{(explain as any).summary}</pre>
              {(explain as any).suggestions ? (
                <pre className="whitespace-pre-wrap text-sm text-zinc-800 leading-6 border-t pt-3">
                  {(explain as any).suggestions}
                </pre>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-red-600">{(explain as any).error || "Failed to load explanation."}</p>
          )}
        </div>
      </div>

      {/* Per-class table */}
      <div className="rounded-2xl border bg-white overflow-hidden">
        <div className="p-4 border-b">
          <p className="text-sm font-semibold text-zinc-900">Per-Class Weekly Totals</p>
          <p className="text-xs text-zinc-600">Spot weak classes fast. Certify only after sessions are closed.</p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-zinc-50 text-zinc-700">
              <tr>
                <th className="text-left font-medium px-4 py-3">Class</th>
                <th className="text-right font-medium px-4 py-3">Enrolled</th>
                <th className="text-right font-medium px-4 py-3">Marks</th>
                <th className="text-right font-medium px-4 py-3">Present</th>
                <th className="text-right font-medium px-4 py-3">Absent</th>
                <th className="text-right font-medium px-4 py-3">Late</th>
                <th className="text-right font-medium px-4 py-3">Excused</th>
                <th className="text-right font-medium px-4 py-3">Present %</th>
              </tr>
            </thead>

            <tbody>
              {!weekly ? (
                <tr>
                  <td className="px-4 py-4 text-zinc-600" colSpan={8}>
                    Loading…
                  </td>
                </tr>
              ) : weeklyOk ? (
                (weekly as WeeklyOk).rows.length ? (
                  (weekly as WeeklyOk).rows.map((r) => (
                    <tr key={r.classroomId} className="border-t">
                      <td className="px-4 py-3 text-zinc-900">{r.classLabel}</td>
                      <td className="px-4 py-3 text-right">{r.enrolled}</td>
                      <td className="px-4 py-3 text-right">{r.marks}</td>
                      <td className="px-4 py-3 text-right">{r.present}</td>
                      <td className="px-4 py-3 text-right">{r.absent}</td>
                      <td className="px-4 py-3 text-right">{r.late}</td>
                      <td className="px-4 py-3 text-right">{r.excused}</td>
                      <td className="px-4 py-3 text-right font-medium">{pctLabel(r.pct)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-4 py-4 text-zinc-600" colSpan={8}>
                      No class rows found for this range.
                    </td>
                  </tr>
                )
              ) : (
                <tr>
                  <td className="px-4 py-4 text-red-600" colSpan={8}>
                    {(weekly as any).error || "Failed to load weekly totals."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pending certifications */}
      <div className="rounded-2xl border bg-white">
        <div className="p-4 border-b">
          <p className="text-sm font-semibold text-zinc-900">Pending Certifications</p>
          <p className="text-xs text-zinc-600">Closed sessions not yet certified (within selected range).</p>
        </div>

        <div className="p-4">
          {!pending ? (
            <p className="text-sm text-zinc-600">Loading…</p>
          ) : pendingOk ? (
            (pending as any).items.length ? (
              <div className="space-y-3">
                {(pending as any).items.map((it: any) => (
                  <div
                    key={it.id}
                    className="rounded-2xl border p-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-zinc-900 truncate">
                        {it.classLabel} <span className="text-zinc-500 font-normal">· {it.date}</span>
                      </p>
                      <div className="mt-2">
                        <input
                          className="w-full sm:w-[420px] rounded-xl border px-3 py-2 text-sm"
                          placeholder='Optional certification note (e.g., "Verified with class teacher").'
                          value={noteBySessionId[it.id] ?? ""}
                          onChange={(e) => setNoteBySessionId((m) => ({ ...m, [it.id]: e.target.value }))}
                        />
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        className="rounded-xl border px-4 py-2 text-sm hover:bg-zinc-50 disabled:opacity-60"
                        onClick={() => void certify(it.id)}
                        disabled={busyCertifyId === it.id}
                      >
                        {busyCertifyId === it.id ? "Certifying…" : "Certify"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-zinc-700">No pending certifications for this range.</p>
            )
          ) : (
            <p className="text-sm text-red-600">{(pending as any).error || "Failed to load pending sessions."}</p>
          )}
        </div>
      </div>
    </div>
  );
}