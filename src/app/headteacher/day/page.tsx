// src/app/headteacher/day/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AttendanceScanAuditPanel from "@/components/attendance/AttendanceScanAuditPanel";

type SessionState = "NO_SESSION" | "OPEN" | "CLOSED" | "CERTIFIED" | "HOLIDAY" | "HOLIDAY_REQUEST";

type DayItem = {
  classroomId: string;
  label: string;
  classLabel?: string;
  sessionId: string | null;
  status: SessionState;
  state?: SessionState;

  total: number;
  marked: number;
  unmarked: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
  completionPct: number;
  presentPct: number;

  closedAt: string | null;
  certifiedAt: string | null;
  certifiedByUserId?: string | null;
  notifiedAt?: string | null;
  notifiedByUserId?: string | null;
  takenByUserId?: string | null;
  isHoliday?: boolean;
  holidayReason?: string | null;
  holidayDeclaredAt?: string | null;
  holidayDeclaredByUserId?: string | null;
  holidayDeclaredByName?: string | null;
  holidaySource?: "TEACHER" | "HEADTEACHER" | "UNKNOWN" | null;
  holidayRequest?: {
    id: string;
    reason: string;
    requestedAt: string;
    requestedByUserId: string | null;
    requestedByName: string | null;
  } | null;
  needsAction?: boolean;
};

type DaySummary = {
  total: number;
  NO_SESSION: number;
  OPEN: number;
  CLOSED: number;
  CERTIFIED: number;
  HOLIDAY: number;
  HOLIDAY_REQUEST: number;

  learners?: number;
  marked?: number;
  unmarked?: number;
  present?: number;
  absent?: number;
  late?: number;
  excused?: number;
  needsAction?: number;
  notified?: number;

  rawClassroomCount?: number;
  hiddenEmptyClassrooms?: number;
  operationalClassrooms?: number;
  completionPct?: number;
  presentPct?: number;
};

type BulkCandidate = {
  sessionId: string;
  classroomId?: string;
  classLabel: string;
  state: "OPEN" | "CLOSED" | "CERTIFIED";
  total: number;
  marked: number;
  unmarked: number;
  present?: number;
  absent?: number;
  late?: number;
  excused?: number;
  eligible: boolean;
  skipReason:
    | null
    | "NOT_CLOSED"
    | "ALREADY_CERTIFIED"
    | "EMPTY_CLASS"
    | "INCOMPLETE_MARKS";
};

type BulkSummary = {
  sessionsFound: number;
  eligible: number;
  certified: number;
  skippedNotClosed: number;
  skippedAlreadyCertified: number;
  skippedEmptyClass: number;
  skippedIncompleteMarks: number;
};

type HolidayActionResponse = {
  ok: boolean;
  action?: "DECLARE_DAY" | "APPROVE_REQUEST" | "REJECT_REQUEST" | "REOPEN_CLASS";
  error?: string;
  declared?: number;
  alreadyHoliday?: number;
  reconciledMarks?: number;
  operationalClasses?: number;
};

type BulkResponse = {
  ok: boolean;
  tenantId?: string;
  date?: string;
  updatedCount?: number;
  eligibleCount?: number;
  skippedCount?: number;
  error?: string;
  summary?: BulkSummary;
  candidates?: BulkCandidate[];
};

const pageShell = "min-h-screen bg-[#F8FAFC] text-[#0F172A]";
const cardClass =
  "rounded-2xl border border-slate-200 bg-white text-slate-950 shadow-sm";
const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-950 shadow-sm outline-none [color-scheme:light] placeholder:text-slate-400 focus:border-slate-950 focus:ring-2 focus:ring-slate-950/10";
const btnBase =
  "inline-flex items-center justify-center rounded-lg border px-3 py-1.5 text-xs font-semibold shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50";
const btnPrimary = `${btnBase} border-slate-950 bg-slate-950 text-white hover:bg-slate-800`;
const btnOutline = `${btnBase} border-slate-300 bg-white text-slate-900 hover:bg-slate-50`;
const btnSoft = `${btnBase} border-indigo-200 bg-indigo-50 text-indigo-800 hover:bg-indigo-100`;

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function clean(v: unknown) {
  return String(v ?? "").trim();
}

function isIsoDate(v: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function fmt(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString() : "0";
}

function percent(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? `${Math.round(n)}%` : "0%";
}

function stateOf(item: DayItem): SessionState {
  return item.state ?? item.status;
}

function statusBadge(state: SessionState) {
  const base =
    "inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold";

  if (state === "HOLIDAY") {
    return `${base} border-sky-200 bg-sky-50 text-sky-700`;
  }

  if (state === "HOLIDAY_REQUEST") {
    return `${base} border-violet-200 bg-violet-50 text-violet-700`;
  }

  if (state === "CERTIFIED") {
    return `${base} border-indigo-200 bg-indigo-50 text-indigo-700`;
  }

  if (state === "CLOSED") {
    return `${base} border-emerald-200 bg-emerald-50 text-emerald-700`;
  }

  if (state === "OPEN") {
    return `${base} border-amber-200 bg-amber-50 text-amber-700`;
  }

  return `${base} border-slate-200 bg-slate-50 text-slate-600`;
}

function actionMeaning(item: DayItem) {
  const state = stateOf(item);

  if (state === "HOLIDAY") {
    return item.holidaySource === "TEACHER"
      ? "Teacher declared Holiday. Reopen only if the day should be marked."
      : "Holiday / school closed. No learner attendance required.";
  }

  if (state === "HOLIDAY_REQUEST") {
    return "Teacher requested Holiday after attendance evidence existed. Headteacher decision required.";
  }

  if (state === "CERTIFIED") {
    return "Certified evidence. No further action needed.";
  }

  if (state === "NO_SESSION") {
    return "Teacher has not opened attendance for this class.";
  }

  if (state === "OPEN") {
    return "Teacher must complete, save, and close the register.";
  }

  if (state === "CLOSED" && item.total <= 0) {
    return "Closed session has no active learners. Do not certify.";
  }

  if (state === "CLOSED" && item.unmarked > 0) {
    return "Closed but incomplete. Reopen or correct before certification.";
  }

  if (state === "CLOSED") {
    return "Ready for headteacher certification.";
  }

  return "Review required.";
}

function actionTone(item: DayItem) {
  const state = stateOf(item);

  if (state === "HOLIDAY") {
    return "border-sky-200 bg-sky-50 text-sky-800";
  }

  if (state === "HOLIDAY_REQUEST") {
    return "border-violet-200 bg-violet-50 text-violet-800";
  }

  if (state === "CERTIFIED") {
    return "border-indigo-200 bg-indigo-50 text-indigo-800";
  }

  if (state === "CLOSED" && item.total > 0 && item.unmarked === 0) {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }

  if (state === "OPEN") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }

  return "border-rose-200 bg-rose-50 text-rose-800";
}

function bulkMessage(data: BulkResponse) {
  const s = data.summary;

  if (!s) {
    return `Certified ${Number(data.updatedCount ?? 0)} session(s).`;
  }

  return [
    `Certified ${s.certified} session(s).`,
    `Eligible: ${s.eligible}.`,
    `Skipped open/not closed: ${s.skippedNotClosed}.`,
    `Skipped already certified: ${s.skippedAlreadyCertified}.`,
    `Skipped empty: ${s.skippedEmptyClass}.`,
    `Skipped incomplete: ${s.skippedIncompleteMarks}.`,
  ].join(" ");
}

export default function HeadteacherDayPage() {
  const [date, setDate] = useState(todayISO());
  const [items, setItems] = useState<DayItem[]>([]);
  const [summary, setSummary] = useState<DaySummary | null>(null);

  const [loading, setLoading] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [holidayActionLoading, setHolidayActionLoading] = useState(false);
  const [showScans, setShowScans] = useState(false);
  const [showSchoolHoliday, setShowSchoolHoliday] = useState(false);
  const [schoolHolidayReason, setSchoolHolidayReason] = useState("");

  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const safeDate = useMemo(() => {
    const d = clean(date);
    return isIsoDate(d) ? d : todayISO();
  }, [date]);

  const refresh = useCallback(
    async (opts?: { keepMessage?: boolean }) => {
      setLoading(true);
      setError(null);

      if (!opts?.keepMessage) setMessage(null);

      try {
        const res = await fetch(
          `/api/headteacher/day/overview?date=${encodeURIComponent(safeDate)}`,
          { cache: "no-store" },
        );

        const data = await res.json().catch(() => ({}));

        if (!res.ok || !data?.ok) {
          setItems([]);
          setSummary(null);
          setError(
            data?.error ||
              `Failed to load attendance command view. Status: ${res.status}`,
          );
          return;
        }

        const nextItems: DayItem[] = Array.isArray(data.items)
          ? data.items.map((item: DayItem) => ({
              ...item,
              status: item.status ?? item.state,
              state: item.state ?? item.status,
              total: Number(item.total ?? 0),
              marked: Number(item.marked ?? 0),
              unmarked: Number(item.unmarked ?? 0),
              present: Number(item.present ?? 0),
              absent: Number(item.absent ?? 0),
              late: Number(item.late ?? 0),
              excused: Number(item.excused ?? 0),
              completionPct: Number(item.completionPct ?? 0),
              presentPct: Number(item.presentPct ?? 0),
            }))
          : [];

        setItems(nextItems);
        setSummary(data.summary ?? null);
      } catch {
        setItems([]);
        setSummary(null);
        setError(
          "Failed to load attendance command view. Check your connection and try again.",
        );
      } finally {
        setLoading(false);
      }
    },
    [safeDate],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function bulkCertify() {
    setBulkLoading(true);
    setError(null);
    setMessage("Running safe bulk certification…");

    try {
      const res = await fetch("/api/headteacher/day/bulk-certify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          date: safeDate,
          note: "Headteacher reviewed attendance command dashboard.",
        }),
      });

      const data = (await res.json().catch(() => ({}))) as BulkResponse;

      if (!res.ok || !data.ok) {
        setMessage(null);
        setError(
          data.error || `Bulk certification failed. Status: ${res.status}`,
        );
        return;
      }

      setMessage(bulkMessage(data));
      await refresh({ keepMessage: true });
    } catch {
      setMessage(null);
      setError(
        "Bulk certification failed. Check your connection and try again.",
      );
    } finally {
      setBulkLoading(false);
    }
  }

  async function runHolidayAction(
    payload:
      | { action: "DECLARE_DAY"; date: string; reason: string }
      | { action: "APPROVE_REQUEST"; sessionId: string; decisionReason: string }
      | { action: "REJECT_REQUEST"; sessionId: string; decisionReason: string }
      | { action: "REOPEN_CLASS"; sessionId: string; reason: string },
  ) {
    setHolidayActionLoading(true);
    setError(null);
    setMessage(null);

    try {
      const res = await fetch("/api/headteacher/day/holiday", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await res.json().catch(() => ({}))) as HolidayActionResponse;

      if (!res.ok || !data.ok) {
        throw new Error(data.error || `Holiday action failed. Status: ${res.status}`);
      }

      if (payload.action === "DECLARE_DAY") {
        setMessage(
          `Holiday applied to ${data.declared ?? 0} class(es). ${
            data.alreadyHoliday ?? 0
          } class(es) were already Holiday.${
            data.reconciledMarks
              ? ` ${data.reconciledMarks} pre-certification mark(s) were reconciled into the audit trail.`
              : ""
          }`,
        );
        setSchoolHolidayReason("");
        setShowSchoolHoliday(false);
      } else if (payload.action === "APPROVE_REQUEST") {
        setMessage("Holiday request approved. Attendance evidence was reconciled and the class is now Holiday.");
      } else if (payload.action === "REJECT_REQUEST") {
        setMessage("Holiday request rejected. Existing attendance remains authoritative.");
      } else {
        setMessage("Teacher Holiday reversed. The class is open again for attendance marking.");
      }

      await refresh({ keepMessage: true });
      return true;
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Holiday action failed. Check your connection and try again.",
      );
      return false;
    } finally {
      setHolidayActionLoading(false);
    }
  }

  async function approveHolidayRequest(item: DayItem) {
    if (!item.sessionId) return;

    const decisionReason = window.prompt(
      `Approve Holiday for ${item.label || item.classLabel || "this class"}?\n\nTeacher reason: ${
        item.holidayRequest?.reason || "Holiday / school closed."
      }\n\nEnter approval reason:`,
      "Reviewed and approved as Holiday / school closed.",
    );

    if (!decisionReason?.trim()) return;

    await runHolidayAction({
      action: "APPROVE_REQUEST",
      sessionId: item.sessionId,
      decisionReason: decisionReason.trim(),
    });
  }

  async function rejectHolidayRequest(item: DayItem) {
    if (!item.sessionId) return;

    const decisionReason = window.prompt(
      `Keep attendance open for ${item.label || item.classLabel || "this class"}.\n\nTeacher reason: ${
        item.holidayRequest?.reason || "Holiday / school closed."
      }\n\nEnter reason for rejecting the Holiday request:`,
    );

    if (!decisionReason?.trim()) return;

    await runHolidayAction({
      action: "REJECT_REQUEST",
      sessionId: item.sessionId,
      decisionReason: decisionReason.trim(),
    });
  }

  async function reopenTeacherHoliday(item: DayItem) {
    if (!item.sessionId) return;

    const reason = window.prompt(
      `Reopen ${item.label || item.classLabel || "this class"} for attendance marking?\n\nHoliday reason: ${
        item.holidayReason || "Holiday / school closed."
      }\n\nEnter reopening reason:`,
    );

    if (!reason?.trim()) return;

    await runHolidayAction({
      action: "REOPEN_CLASS",
      sessionId: item.sessionId,
      reason: reason.trim(),
    });
  }

  const readyToCertify = useMemo(
    () =>
      items.filter(
        (item) =>
          stateOf(item) === "CLOSED" && item.total > 0 && item.unmarked === 0,
      ),
    [items],
  );

  const needsTeacherAction = useMemo(
    () =>
      items.filter((item) => {
        const state = stateOf(item);
        return (
          state === "HOLIDAY_REQUEST" ||
          state === "NO_SESSION" ||
          state === "OPEN" ||
          (state !== "HOLIDAY" && item.unmarked > 0)
        );
      }),
    [items],
  );

  const certified = useMemo(
    () => items.filter((item) => stateOf(item) === "CERTIFIED"),
    [items],
  );

  const openOrMissing = useMemo(
    () =>
      items.filter((item) => {
        const state = stateOf(item);
        return state === "NO_SESSION" || state === "OPEN";
      }),
    [items],
  );

  return (
    <main className={pageShell}>
      <div className="mx-auto max-w-7xl px-3 py-4 sm:px-4 md:px-6 md:py-5">
        <section className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight text-slate-950 md:text-2xl">
              Attendance command
            </h1>
            <p className="mt-0.5 text-xs text-slate-600">
              Focus on classes that need action. Holiday decisions and attendance evidence stay auditable.
            </p>
          </div>

          <a className={btnOutline} href="/headteacher/attendance/weekly">
            Weekly attendance
          </a>
        </section>

        <section className={`mt-3 p-2.5 ${cardClass}`}>
          <div className="flex flex-wrap items-end gap-2">
            <label className="min-w-[145px] flex-1 sm:flex-none">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Date
              </span>
              <input
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                className={inputClass}
              />
            </label>

            <button
              type="button"
              onClick={() => void refresh()}
              disabled={loading || bulkLoading || holidayActionLoading}
              className={btnPrimary}
            >
              {loading ? "Loading…" : "Refresh"}
            </button>

            <button
              type="button"
              onClick={() => setDate(todayISO())}
              disabled={loading || bulkLoading || holidayActionLoading}
              className={btnOutline}
            >
              Today
            </button>

            <button
              type="button"
              onClick={() => void bulkCertify()}
              disabled={loading || bulkLoading || holidayActionLoading}
              className={readyToCertify.length > 0 ? btnPrimary : btnSoft}
              title="Only closed, complete, non-empty, non-Holiday sessions are certified."
            >
              {bulkLoading
                ? "Certifying…"
                : `Certify ready (${readyToCertify.length})`}
            </button>

            <button
              type="button"
              onClick={() => setShowSchoolHoliday((current) => !current)}
              disabled={loading || bulkLoading || holidayActionLoading}
              className={btnOutline}
              aria-expanded={showSchoolHoliday}
            >
              School holiday {showSchoolHoliday ? "▴" : "▾"}
            </button>

            <button
              type="button"
              onClick={() => setShowScans((current) => !current)}
              className={btnOutline}
              aria-expanded={showScans}
            >
              Attendance scans {showScans ? "▴" : "▾"}
            </button>
          </div>

          {showSchoolHoliday ? (
            <div className="mt-2 rounded-xl border border-sky-200 bg-sky-50 p-2.5">
              <div className="text-xs font-semibold text-sky-900">
                Declare {safeDate} Holiday / school closed
              </div>
              <p className="mt-0.5 text-[11px] leading-4 text-sky-800">
                Already-Holiday classes stay unchanged. Remaining classes are covered. Existing attendance is reconciled under Headteacher authority with audit evidence preserved.
              </p>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <input
                  value={schoolHolidayReason}
                  onChange={(event) => setSchoolHolidayReason(event.target.value)}
                  maxLength={500}
                  placeholder="Reason, e.g. Public holiday"
                  className={`${inputClass} flex-1`}
                  aria-label="School holiday reason"
                />
                <button
                  type="button"
                  disabled={
                    holidayActionLoading ||
                    schoolHolidayReason.trim().length < 4
                  }
                  onClick={() => {
                    const reason = schoolHolidayReason.trim();
                    if (!reason) return;
                    const confirmed = window.confirm(
                      `Declare ${safeDate} Holiday / school closed for all operational classes not already Holiday?\n\nReason: ${reason}`,
                    );
                    if (!confirmed) return;
                    void runHolidayAction({
                      action: "DECLARE_DAY",
                      date: safeDate,
                      reason,
                    });
                  }}
                  className={btnPrimary}
                >
                  {holidayActionLoading ? "Applying…" : "Declare Holiday"}
                </button>
              </div>
            </div>
          ) : null}
        </section>

        {message ? (
          <section className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800">
            {message}
          </section>
        ) : null}

        {error ? (
          <section className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800">
            {error}
          </section>
        ) : null}

        <section className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className={`px-3 py-2 ${cardClass}`}>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-amber-700">
              Open / missing
            </div>
            <div className="mt-0.5 text-xl font-bold text-slate-950">
              {fmt(openOrMissing.length)}
            </div>
          </div>

          <div className={`px-3 py-2 ${cardClass}`}>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-rose-700">
              Needs action
            </div>
            <div className="mt-0.5 text-xl font-bold text-slate-950">
              {fmt(needsTeacherAction.length)}
            </div>
          </div>

          <div className={`px-3 py-2 ${cardClass}`}>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
              Ready to certify
            </div>
            <div className="mt-0.5 text-xl font-bold text-slate-950">
              {fmt(readyToCertify.length)}
            </div>
          </div>

          <div className={`px-3 py-2 ${cardClass}`}>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-indigo-700">
              Certified
            </div>
            <div className="mt-0.5 text-xl font-bold text-slate-950">
              {fmt(certified.length)}
            </div>
          </div>
        </section>

        <section className={`mt-3 overflow-hidden ${cardClass}`}>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-3 py-2.5">
            <div>
              <h2 className="text-base font-bold text-slate-950">
                Class command list
              </h2>
              <p className="text-[11px] text-slate-600">
                Main workspace · {items.length} operational class(es)
              </p>
            </div>
            {summary?.HOLIDAY_REQUEST ? (
              <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-700">
                Holiday requests: {summary.HOLIDAY_REQUEST}
              </span>
            ) : null}
          </div>

          <div className="divide-y divide-slate-100 md:hidden">
            {loading ? (
              <div className="px-3 py-8 text-center text-sm text-slate-500">
                Loading attendance command…
              </div>
            ) : null}

            {!loading && items.length === 0 ? (
              <div className="px-3 py-8 text-center text-sm text-slate-500">
                No operational attendance classes found for this date.
              </div>
            ) : null}

            {!loading
              ? items.map((item) => {
                  const state = stateOf(item);
                  const name = item.label || item.classLabel || "Class";

                  return (
                    <article
                      key={`${item.classroomId}-${item.sessionId ?? "none"}`}
                      className="p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-bold text-slate-950">{name}</div>
                          <div className="mt-1">
                            <span className={statusBadge(state)}>
                              {state === "HOLIDAY_REQUEST"
                                ? "HOLIDAY REQUEST"
                                : state}
                            </span>
                          </div>
                        </div>

                        <div className="text-right text-[11px] text-slate-600">
                          <div>
                            <b>{item.marked}</b> / {item.total} marked
                          </div>
                          <div>{item.unmarked} unmarked</div>
                        </div>
                      </div>

                      {state === "HOLIDAY" ? (
                        <div className="mt-2 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-2 text-[11px] text-sky-900">
                          <b>
                            {item.holidaySource === "TEACHER"
                              ? "Teacher declared Holiday"
                              : "Holiday / school closed"}
                          </b>
                          <div>{item.holidayReason || "School closed."}</div>
                          {item.holidayDeclaredByName ? (
                            <div className="mt-0.5 text-sky-700">
                              By {item.holidayDeclaredByName}
                            </div>
                          ) : null}
                        </div>
                      ) : null}

                      {state === "HOLIDAY_REQUEST" ? (
                        <div className="mt-2 rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-2 text-[11px] text-violet-900">
                          <b>Teacher Holiday request</b>
                          <div>{item.holidayRequest?.reason || "Holiday / school closed."}</div>
                          {item.holidayRequest?.requestedByName ? (
                            <div className="mt-0.5 text-violet-700">
                              From {item.holidayRequest.requestedByName}
                            </div>
                          ) : null}
                        </div>
                      ) : null}

                      {state !== "HOLIDAY" && state !== "HOLIDAY_REQUEST" ? (
                        <div className="mt-2 grid grid-cols-3 gap-1.5 text-center text-[11px]">
                          <div className="rounded-lg bg-emerald-50 px-2 py-1.5 text-emerald-800">
                            Present <b>{item.present}</b>
                          </div>
                          <div className="rounded-lg bg-rose-50 px-2 py-1.5 text-rose-800">
                            Absent <b>{item.absent}</b>
                          </div>
                          <div className="rounded-lg bg-slate-100 px-2 py-1.5 text-slate-700">
                            Done <b>{percent(item.completionPct)}</b>
                          </div>
                        </div>
                      ) : null}

                      <div className="mt-2 text-[11px] leading-4 text-slate-600">
                        {actionMeaning(item)}
                      </div>

                      {state === "HOLIDAY_REQUEST" && item.sessionId ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => void approveHolidayRequest(item)}
                            disabled={holidayActionLoading}
                            className={btnPrimary}
                          >
                            Approve Holiday
                          </button>
                          <button
                            type="button"
                            onClick={() => void rejectHolidayRequest(item)}
                            disabled={holidayActionLoading}
                            className={btnOutline}
                          >
                            Keep attendance
                          </button>
                        </div>
                      ) : null}

                      {state === "HOLIDAY" &&
                      item.holidaySource === "TEACHER" &&
                      item.sessionId ? (
                        <div className="mt-2">
                          <button
                            type="button"
                            onClick={() => void reopenTeacherHoliday(item)}
                            disabled={holidayActionLoading}
                            className={btnOutline}
                          >
                            Reopen for marking
                          </button>
                        </div>
                      ) : null}
                    </article>
                  );
                })
              : null}
          </div>

          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[860px] text-xs">
              <thead className="bg-slate-100 text-slate-800">
                <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:text-left [&>th]:font-semibold">
                  <th>Class</th>
                  <th>Status</th>
                  <th className="text-right">Marked</th>
                  <th className="text-right">Unmarked</th>
                  <th className="text-right">Present</th>
                  <th className="text-right">Absent</th>
                  <th className="text-right">Completion</th>
                  <th>Leadership action</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-4 py-8 text-center text-sm text-slate-500"
                    >
                      Loading attendance command view…
                    </td>
                  </tr>
                ) : null}

                {!loading && items.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-4 py-8 text-center text-sm text-slate-500"
                    >
                      No operational attendance classes found for this date.
                    </td>
                  </tr>
                ) : null}

                {!loading
                  ? items.map((item) => {
                      const state = stateOf(item);
                      const name = item.label || item.classLabel || "Class";

                      return (
                        <tr
                          key={`${item.classroomId}-${item.sessionId ?? "none"}`}
                          className="[&>td]:px-3 [&>td]:py-2 [&>td]:align-top"
                        >
                          <td>
                            <div className="font-semibold text-slate-950">{name}</div>
                            {state === "HOLIDAY" ? (
                              <div className="mt-0.5 max-w-[220px] text-[10px] leading-4 text-sky-700">
                                {item.holidayReason || "School closed."}
                              </div>
                            ) : state === "HOLIDAY_REQUEST" ? (
                              <div className="mt-0.5 max-w-[220px] text-[10px] leading-4 text-violet-700">
                                {item.holidayRequest?.reason || "Holiday / school closed."}
                              </div>
                            ) : null}
                          </td>

                          <td>
                            <span className={statusBadge(state)}>
                              {state === "HOLIDAY_REQUEST" ? "HOLIDAY REQUEST" : state}
                            </span>
                          </td>

                          <td className="text-right tabular-nums text-slate-900">
                            {fmt(item.marked)}
                          </td>

                          <td className="text-right tabular-nums text-slate-900">
                            {fmt(item.unmarked)}
                          </td>

                          <td className="text-right tabular-nums text-slate-900">
                            {fmt(item.present)}
                          </td>

                          <td className="text-right tabular-nums text-slate-900">
                            {fmt(item.absent)}
                          </td>

                          <td className="text-right tabular-nums text-slate-900">
                            {percent(item.completionPct)}
                          </td>

                          <td className="max-w-[280px]">
                            <div
                              className={`inline-flex rounded-lg border px-2 py-1 text-[10px] font-medium ${actionTone(
                                item,
                              )}`}
                            >
                              {actionMeaning(item)}
                            </div>

                            {state === "HOLIDAY_REQUEST" && item.sessionId ? (
                              <div className="mt-1.5 flex flex-wrap gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => void approveHolidayRequest(item)}
                                  disabled={holidayActionLoading}
                                  className={btnPrimary}
                                >
                                  Approve
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void rejectHolidayRequest(item)}
                                  disabled={holidayActionLoading}
                                  className={btnOutline}
                                >
                                  Reject
                                </button>
                              </div>
                            ) : null}

                            {state === "HOLIDAY" &&
                            item.holidaySource === "TEACHER" &&
                            item.sessionId ? (
                              <div className="mt-1.5">
                                <button
                                  type="button"
                                  onClick={() => void reopenTeacherHoliday(item)}
                                  disabled={holidayActionLoading}
                                  className={btnOutline}
                                >
                                  Reopen for marking
                                </button>
                              </div>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })
                  : null}
              </tbody>
            </table>
          </div>
        </section>

        {showScans ? (
          <div className="mt-3">
            <AttendanceScanAuditPanel
              date={safeDate}
              endpoint="/api/headteacher/attendance/scan-audit/list"
              title="Daily QR scan evidence"
              description="Headteacher evidence view for this date’s QR attendance activity across active classes. Attendance evidence only; QR secrets and private learner data stay protected."
              showClassroom
            />
          </div>
        ) : null}
      </div>
    </main>
  );
}
