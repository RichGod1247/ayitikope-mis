// src/app/headteacher/teacher-attendance/ui.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Status = "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";

type TeacherAttendanceSession = {
  id: string;
  tenantId: string;
  date: string;
  openedAt: string;
  openedByUserId: string;
  openedByName: string;
  isClosed: boolean;
  closedAt: string | null;
  closedByUserId: string | null;
  closedByName: string | null;
  certifiedAt: string | null;
  certifiedByUserId: string | null;
  certifiedByName: string | null;
  certifiedNote: string | null;
};

type TeacherAttendanceItem = {
  teacherUserId: string;
  staffId: string | null;
  name: string;
  email: string | null;
  phone?: string | null;
  phase?: string | null;
  classLevel?: string | null;
  classLabel?: string | null;
  record: null | {
    id: string;
    date: string;
    status: Status;
    note: string;
    markedAt: string;
    markedByUserId: string;
    markedByName: string;
    updatedAt: string;
  };
};

type TeacherAttendanceCounts = {
  totalTeachers: number;
  marked: number;
  unmarked: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
};

function emptyCounts(): TeacherAttendanceCounts {
  return {
    totalTeachers: 0,
    marked: 0,
    unmarked: 0,
    present: 0,
    absent: 0,
    late: 0,
    excused: 0,
  };
}

type LoadResp =
  | {
      ok: true;
      date: string;
      session: TeacherAttendanceSession | null;
      counts: TeacherAttendanceCounts;
      items: TeacherAttendanceItem[];
    }
  | { ok: false; error: string };

type ActionResp =
  | { ok: true; sessionId?: string; item?: unknown; record?: unknown }
  | { ok: false; error: string };

const statusOptions: Array<{ status: Status; label: string; baseClass: string; activeClass: string }> = [
  {
    status: "PRESENT",
    label: "Present",
    baseClass: "border-emerald-300/30 bg-emerald-400/12 text-emerald-100 hover:bg-emerald-400/18",
    activeClass: "border-emerald-200 bg-emerald-400/30 text-emerald-50 ring-2 ring-emerald-200/35",
  },
  {
    status: "ABSENT",
    label: "Absent",
    baseClass: "border-rose-300/30 bg-rose-400/12 text-rose-100 hover:bg-rose-400/18",
    activeClass: "border-rose-200 bg-rose-400/30 text-rose-50 ring-2 ring-rose-200/35",
  },
  {
    status: "LATE",
    label: "Late",
    baseClass: "border-amber-300/30 bg-amber-400/12 text-amber-100 hover:bg-amber-400/18",
    activeClass: "border-amber-200 bg-amber-400/30 text-amber-50 ring-2 ring-amber-200/35",
  },
  {
    status: "EXCUSED",
    label: "Excused",
    baseClass: "border-sky-300/30 bg-sky-400/12 text-sky-100 hover:bg-sky-400/18",
    activeClass: "border-sky-200 bg-sky-400/30 text-sky-50 ring-2 ring-sky-200/35",
  },
];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Not set";
  try {
    return new Intl.DateTimeFormat("en-GH", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Africa/Accra",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function statusPillClass(status: Status | null | undefined) {
  if (status === "PRESENT") return "border-emerald-300/25 bg-emerald-400/12 text-emerald-100";
  if (status === "ABSENT") return "border-rose-300/25 bg-rose-400/12 text-rose-100";
  if (status === "LATE") return "border-amber-300/25 bg-amber-400/12 text-amber-100";
  if (status === "EXCUSED") return "border-sky-300/25 bg-sky-400/12 text-sky-100";
  return "border-white/10 bg-white/5 text-[#C9CDD6]";
}

function statusLabel(status: Status | null | undefined) {
  if (!status) return "Unmarked";
  return status.charAt(0) + status.slice(1).toLowerCase();
}

function sessionState(session: TeacherAttendanceSession | null) {
  if (!session) return { label: "Not opened", className: "border-amber-300/25 bg-amber-400/12 text-amber-100" };
  if (session.certifiedAt) return { label: "Certified", className: "border-emerald-300/25 bg-emerald-400/12 text-emerald-100" };
  if (session.isClosed) return { label: "Closed", className: "border-sky-300/25 bg-sky-400/12 text-sky-100" };
  return { label: "Open", className: "border-lime-300/25 bg-lime-400/12 text-lime-100" };
}

function StatCard(props: { label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-white/[0.05] p-4 shadow-[0_12px_40px_rgba(0,0,0,0.16)]">
      <div className="text-xs uppercase tracking-[0.16em] text-[#8F98A8]">{props.label}</div>
      <div className="mt-2 text-2xl font-bold text-[#F7F4ED]">{props.value}</div>
      {props.hint ? <div className="mt-1 text-xs text-[#C9CDD6]">{props.hint}</div> : null}
    </div>
  );
}

function safeError(json: ActionResp | LoadResp | null, fallback: string) {
  return json && !json.ok ? json.error : fallback;
}

export default function TeacherAttendanceClient() {
  const [date, setDate] = useState(todayISO());
  const [session, setSession] = useState<TeacherAttendanceSession | null>(null);
  const [items, setItems] = useState<TeacherAttendanceItem[]>([]);
  const [counts, setCounts] = useState<TeacherAttendanceCounts>(() => emptyCounts());
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reopenReason, setReopenReason] = useState("");
  const [certifyNote, setCertifyNote] = useState("");
  const [highlightMissing, setHighlightMissing] = useState(false);

  const locked = !session || session.isClosed || !!session.certifiedAt;
  const canOpen = !session;
  const canClose = !!session && !session.isClosed && !session.certifiedAt;
  const canReopen = !!session && session.isClosed && !session.certifiedAt;
  const canCertify = !!session && session.isClosed && !session.certifiedAt;
  const canMarkAllPresent = !!session && !session.isClosed && !session.certifiedAt && items.length > 0;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/headteacher/teacher-attendance?date=${encodeURIComponent(date)}`, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: { Accept: "application/json" },
      });

      const json = (await res.json().catch(() => null)) as LoadResp | null;

      if (!res.ok || !json?.ok) {
        setSession(null);
        setItems([]);
        setCounts(emptyCounts());
        setNotes({});
        setError(safeError(json, `Failed to load register (${res.status}).`));
        return;
      }

      setSession(json.session ?? null);
      const nextItems = Array.isArray(json.items) ? json.items : [];
      setItems(nextItems);
      const nextCounts = json.counts ?? emptyCounts();
      setCounts(nextCounts);
      if (nextCounts.unmarked === 0) setHighlightMissing(false);

      const nextNotes: Record<string, string> = {};
      for (const item of nextItems) {
        nextNotes[item.teacherUserId] = item.record?.note ?? "";
      }
      setNotes(nextNotes);
    } catch {
      setSession(null);
      setItems([]);
      setCounts(emptyCounts());
      setNotes({});
      setError("Network/server error while loading teacher attendance.");
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    void load();
  }, [load]);

  const completion = useMemo(() => {
    if (!counts.totalTeachers) return 0;
    return Math.round((counts.marked / counts.totalTeachers) * 100);
  }, [counts.marked, counts.totalTeachers]);

  async function postAction(path: string, body: Record<string, unknown>, busyLabel: string) {
    setActionBusy(busyLabel);
    setError(null);

    try {
      const res = await fetch(path, {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
      });

      const json = (await res.json().catch(() => null)) as ActionResp | null;

      if (!res.ok || !json?.ok) {
        setError(safeError(json, `Action failed (${res.status}).`));
        return false;
      }

      await load();
      return true;
    } catch {
      setError("Network/server error while saving teacher attendance.");
      return false;
    } finally {
      setActionBusy(null);
    }
  }

  async function openSession() {
    await postAction("/api/headteacher/teacher-attendance/open", { date }, "open");
  }

  async function closeSession() {
    if (!session) return;

    if (counts.totalTeachers < 1) {
      setHighlightMissing(false);
      setError("Cannot close this register because there are no active teacher accounts.");
      return;
    }

    if (counts.unmarked > 0) {
      setHighlightMissing(true);
      setError(
        `Cannot close yet. ${counts.unmarked} teacher${counts.unmarked === 1 ? " is" : "s are"} still unmarked. Complete the highlighted cards first.`
      );
      return;
    }

    await postAction("/api/headteacher/teacher-attendance/close", { sessionId: session.id }, "close");
  }

  async function markAllPresent() {
    if (!session || locked || items.length === 0) return;

    const targets = items.filter((item) => item.record?.status !== "PRESENT");
    if (targets.length === 0) {
      setHighlightMissing(false);
      setError(null);
      return;
    }

    const confirmed = window.confirm(
      `Mark all ${items.length} active teacher${items.length === 1 ? "" : "s"} PRESENT for ${date}?`
    );
    if (!confirmed) return;

    setActionBusy("markAllPresent");
    setSavingId("__ALL__");
    setError(null);

    try {
      for (const item of targets) {
        const res = await fetch("/api/headteacher/teacher-attendance/upsert", {
          method: "POST",
          credentials: "include",
          cache: "no-store",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            sessionId: session.id,
            teacherUserId: item.teacherUserId,
            status: "PRESENT",
            note: notes[item.teacherUserId] ?? "",
          }),
        });

        const json = (await res.json().catch(() => null)) as ActionResp | null;
        if (!res.ok || !json?.ok) {
          setError(safeError(json, `Failed to mark all present (${res.status}).`));
          return;
        }
      }

      setHighlightMissing(false);
      await load();
    } catch {
      setError("Network/server error while marking all teachers present.");
    } finally {
      setSavingId(null);
      setActionBusy(null);
    }
  }

  async function reopenSession() {
    if (!session) return;
    const ok = await postAction(
      "/api/headteacher/teacher-attendance/reopen",
      { sessionId: session.id, reason: reopenReason },
      "reopen"
    );
    if (ok) setReopenReason("");
  }

  async function certifySession() {
    if (!session) return;
    const ok = await postAction(
      "/api/headteacher/teacher-attendance/certify",
      { sessionId: session.id, note: certifyNote },
      "certify"
    );
    if (ok) setCertifyNote("");
  }

  async function saveStatus(teacherUserId: string, status: Status) {
    if (!session || locked) return;

    setSavingId(teacherUserId);
    setError(null);

    try {
      const res = await fetch("/api/headteacher/teacher-attendance/upsert", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          sessionId: session.id,
          teacherUserId,
          status,
          note: notes[teacherUserId] ?? "",
        }),
      });

      const json = (await res.json().catch(() => null)) as ActionResp | null;

      if (!res.ok || !json?.ok) {
        setError(safeError(json, `Failed to save (${res.status}).`));
        return;
      }

      await load();
    } catch {
      setError("Network/server error while saving teacher attendance.");
    } finally {
      setSavingId(null);
    }
  }

  const state = sessionState(session);

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(5,7,11,0.92),rgba(7,26,61,0.94),rgba(5,7,11,0.96))] p-5 shadow-[0_26px_90px_rgba(0,0,0,0.28)] md:p-6">
        <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:64px_64px]" />
        <div className="absolute -left-16 top-0 h-48 w-48 rounded-full bg-[#1B66D1]/20 blur-3xl" />
        <div className="absolute right-0 top-0 h-44 w-44 rounded-full bg-[#D4AF37]/14 blur-3xl" />

        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-[#E8C96A]">
              EduLife OS · Headteacher
            </p>
            <h1 className="mt-2 text-2xl font-semibold text-[#F7F4ED] md:text-3xl">
              Teacher Attendance
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-[#C9CDD6]">
              Open the day’s staff register, mark teachers, close it, then certify it before governance uses it.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <span className={`rounded-full border px-4 py-2 text-sm font-semibold ${state.className}`}>
              {state.label}
            </span>
            <Link
              href="/headteacher/dashboard"
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-[#F7F4ED] hover:bg-white/10"
            >
              Dashboard
            </Link>
            <Link
              href="/headteacher/day"
              className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-4 py-2 text-sm font-semibold text-cyan-100 hover:bg-cyan-400/15"
            >
              Student attendance
            </Link>
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-white/10 bg-white/[0.05] p-4 shadow-[0_18px_60px_rgba(0,0,0,0.18)]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8F98A8]">
              Register date
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              disabled={loading || actionBusy !== null}
              className="mt-2 min-h-12 rounded-2xl border border-white/10 bg-[#0C1730] px-4 py-2 text-sm text-[#F7F4ED] outline-none focus:border-[#E8C96A]/40 disabled:opacity-60"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading || actionBusy !== null}
              className="min-h-12 rounded-2xl border border-white/10 bg-white/5 px-5 py-2 text-sm font-semibold text-[#F7F4ED] hover:bg-white/10 disabled:opacity-60"
            >
              {loading ? "Refreshing..." : "Refresh"}
            </button>

            {canOpen ? (
              <button
                type="button"
                onClick={() => void openSession()}
                disabled={actionBusy !== null}
                className="min-h-12 rounded-2xl border border-lime-300/25 bg-lime-400/12 px-5 py-2 text-sm font-semibold text-lime-100 hover:bg-lime-400/18 disabled:opacity-60"
              >
                {actionBusy === "open" ? "Opening..." : "Open today's register"}
              </button>
            ) : null}

            {canMarkAllPresent ? (
              <button
                type="button"
                onClick={() => void markAllPresent()}
                disabled={actionBusy !== null || loading}
                className="min-h-12 rounded-2xl border border-emerald-300/25 bg-emerald-400/12 px-5 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-400/18 disabled:opacity-60"
              >
                {actionBusy === "markAllPresent" ? "Marking all..." : "Mark all present"}
              </button>
            ) : null}

            {canClose ? (
              <button
                type="button"
                onClick={() => void closeSession()}
                disabled={actionBusy !== null}
                className={`min-h-12 rounded-2xl border px-5 py-2 text-sm font-semibold disabled:opacity-60 ${
                  counts.unmarked > 0
                    ? "border-amber-300/25 bg-amber-400/12 text-amber-100 hover:bg-amber-400/18"
                    : "border-sky-300/25 bg-sky-400/12 text-sky-100 hover:bg-sky-400/18"
                }`}
              >
                {actionBusy === "close" ? "Closing..." : counts.unmarked > 0 ? `Complete ${counts.unmarked} missing mark${counts.unmarked === 1 ? "" : "s"}` : "Close register"}
              </button>
            ) : null}
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-white/10 bg-[#081120]/70 p-4 text-sm text-[#C9CDD6]">
          {!session ? (
            <p>This date has no teacher attendance session yet. Open the register before marking teachers.</p>
          ) : (
            <div className="space-y-1">
              <p>
                Opened by <span className="font-semibold text-[#F7F4ED]">{session.openedByName}</span> · {formatDateTime(session.openedAt)}
              </p>
              {session.closedAt ? (
                <p>
                  Closed by <span className="font-semibold text-[#F7F4ED]">{session.closedByName ?? "Headteacher"}</span> · {formatDateTime(session.closedAt)}
                </p>
              ) : null}
              {session.certifiedAt ? (
                <p>
                  Certified by <span className="font-semibold text-[#F7F4ED]">{session.certifiedByName ?? "Headteacher"}</span> · {formatDateTime(session.certifiedAt)}
                </p>
              ) : null}
            </div>
          )}
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Teachers" value={counts.totalTeachers} hint="Active teacher accounts" />
        <StatCard label="Marked" value={counts.marked} hint={`${completion}% complete`} />
        <StatCard label="Present" value={counts.present} />
        <StatCard label="Absent / Late" value={counts.absent + counts.late} />
        <StatCard label="Unmarked" value={counts.unmarked} />
      </section>

      {canReopen || canCertify ? (
        <section className="grid gap-3 lg:grid-cols-2">
          {canReopen ? (
            <div className="rounded-[28px] border border-amber-300/20 bg-amber-400/10 p-4">
              <h2 className="text-sm font-semibold text-amber-100">Reopen closed register</h2>
              <p className="mt-1 text-xs text-amber-100/80">Use only when a correction is needed before certification.</p>
              <input
                type="text"
                value={reopenReason}
                onChange={(e) => setReopenReason(e.target.value)}
                maxLength={500}
                placeholder="Reason, e.g. missed late arrival correction"
                className="mt-3 min-h-11 w-full rounded-2xl border border-amber-300/20 bg-[#0C1730] px-4 py-2 text-sm text-[#F7F4ED] outline-none placeholder:text-[#687386] focus:border-amber-300/40"
              />
              <button
                type="button"
                onClick={() => void reopenSession()}
                disabled={actionBusy !== null || reopenReason.trim().length < 8}
                className="mt-3 min-h-11 rounded-2xl border border-amber-300/25 bg-amber-400/12 px-5 py-2 text-sm font-semibold text-amber-100 hover:bg-amber-400/18 disabled:opacity-60"
              >
                {actionBusy === "reopen" ? "Reopening..." : "Reopen register"}
              </button>
            </div>
          ) : null}

          {canCertify ? (
            <div className="rounded-[28px] border border-emerald-300/20 bg-emerald-400/10 p-4">
              <h2 className="text-sm font-semibold text-emerald-100">Certify for governance</h2>
              <p className="mt-1 text-xs text-emerald-100/80">Certified teacher attendance becomes locked and governance-visible.</p>
              <input
                type="text"
                value={certifyNote}
                onChange={(e) => setCertifyNote(e.target.value)}
                maxLength={500}
                placeholder="Optional certification note"
                className="mt-3 min-h-11 w-full rounded-2xl border border-emerald-300/20 bg-[#0C1730] px-4 py-2 text-sm text-[#F7F4ED] outline-none placeholder:text-[#687386] focus:border-emerald-300/40"
              />
              <button
                type="button"
                onClick={() => void certifySession()}
                disabled={actionBusy !== null}
                className="mt-3 min-h-11 rounded-2xl border border-emerald-300/25 bg-emerald-400/12 px-5 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-400/18 disabled:opacity-60"
              >
                {actionBusy === "certify" ? "Certifying..." : "Certify register"}
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      {error ? (
        <div className="rounded-[24px] border border-rose-300/25 bg-rose-400/12 px-4 py-3 text-sm text-rose-100">
          {error}
        </div>
      ) : null}

      {highlightMissing && counts.unmarked > 0 ? (
        <div className="rounded-[24px] border border-amber-300/25 bg-amber-400/12 px-4 py-3 text-sm text-amber-100">
          {counts.unmarked} teacher{counts.unmarked === 1 ? " is" : "s are"} still unmarked. The missing cards are highlighted below.
        </div>
      ) : null}

      <section className="space-y-3">
        {loading ? (
          <div className="rounded-[28px] border border-white/10 bg-white/[0.05] p-5 text-sm text-[#C9CDD6]">
            Loading teacher register...
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-[28px] border border-white/10 bg-white/[0.05] p-5 text-sm text-[#C9CDD6]">
            No active teachers found for this school. Add teacher memberships first.
          </div>
        ) : (
          items.map((item) => {
            const current = item.record?.status ?? null;
            const isSaving = savingId === item.teacherUserId || savingId === "__ALL__";
            const missingMark = !item.record;

            return (
              <article
                key={item.teacherUserId}
                className={`rounded-[28px] border bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.035))] p-4 shadow-[0_14px_48px_rgba(0,0,0,0.18)] ${
                  highlightMissing && missingMark
                    ? "border-amber-300/50 ring-2 ring-amber-300/20"
                    : "border-white/10"
                }`}
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${statusPillClass(current)}`}>
                        {statusLabel(current)}
                      </span>
                      {item.staffId ? (
                        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-[#C9CDD6]">
                          Staff ID: {item.staffId}
                        </span>
                      ) : null}
                      {item.classLabel ? (
                        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-[#C9CDD6]">
                          {item.classLabel}
                        </span>
                      ) : null}
                    </div>

                    <h2 className="mt-2 text-lg font-semibold text-[#F7F4ED]">{item.name}</h2>
                    {item.email ? <p className="mt-1 truncate text-xs text-[#8F98A8]">{item.email}</p> : null}

                    {item.record ? (
                      <p className="mt-2 text-xs text-[#C9CDD6]">
                        Marked by <span className="font-semibold text-[#F7F4ED]">{item.record.markedByName}</span>{" "}
                        · {formatDateTime(item.record.markedAt)}
                      </p>
                    ) : (
                      <p className="mt-2 text-xs text-amber-100">Not marked yet.</p>
                    )}
                  </div>

                  <div className="w-full max-w-xl space-y-3">
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {statusOptions.map((opt) => {
                        const active = current === opt.status;

                        return (
                          <button
                            key={opt.status}
                            type="button"
                            disabled={locked || isSaving || actionBusy !== null}
                            onClick={() => void saveStatus(item.teacherUserId, opt.status)}
                            className={`min-h-11 rounded-2xl border px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                              active ? opt.activeClass : opt.baseClass
                            }`}
                          >
                            {isSaving ? "Saving..." : opt.label}
                          </button>
                        );
                      })}
                    </div>

                    <input
                      type="text"
                      value={notes[item.teacherUserId] ?? ""}
                      onChange={(e) => setNotes((prev) => ({ ...prev, [item.teacherUserId]: e.target.value }))}
                      disabled={locked || actionBusy !== null}
                      maxLength={500}
                      placeholder={session ? "Optional note e.g. came at 8:20am, official duty, sick leave..." : "Open the register before adding notes"}
                      className="min-h-11 w-full rounded-2xl border border-white/10 bg-[#0C1730] px-4 py-2 text-sm text-[#F7F4ED] outline-none placeholder:text-[#687386] focus:border-[#E8C96A]/40 disabled:opacity-60"
                    />
                  </div>
                </div>
              </article>
            );
          })
        )}
      </section>
    </div>
  );
}
