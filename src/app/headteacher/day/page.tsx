// src/app/headteacher/day/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AttendanceScanAuditPanel from "@/components/attendance/AttendanceScanAuditPanel";

type SessionState = "NO_SESSION" | "OPEN" | "CLOSED" | "CERTIFIED";

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
  needsAction?: boolean;
};

type DaySummary = {
  total: number;
  NO_SESSION: number;
  OPEN: number;
  CLOSED: number;
  CERTIFIED: number;

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
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-950 shadow-sm outline-none [color-scheme:light] placeholder:text-slate-400 focus:border-slate-950 focus:ring-2 focus:ring-slate-950/10";
const btnBase =
  "inline-flex items-center justify-center rounded-xl border px-4 py-2 text-sm font-semibold shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50";
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

function countChip(
  label: string,
  value: number | undefined,
  tone: "plain" | "good" | "warn" | "bad" = "plain",
) {
  const cls =
    tone === "good"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : tone === "warn"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : tone === "bad"
          ? "border-rose-200 bg-rose-50 text-rose-700"
          : "border-slate-200 bg-white text-slate-700";

  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs ${cls}`}
    >
      {label}: <b className="ml-1">{fmt(value ?? 0)}</b>
    </span>
  );
}

function actionMeaning(item: DayItem) {
  const state = stateOf(item);

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

function formatDateTime(value?: string | null) {
  if (!value) return "—";

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";

  return d.toLocaleString();
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
        return state === "NO_SESSION" || state === "OPEN" || item.unmarked > 0;
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
      <div className="mx-auto max-w-7xl px-4 py-8 md:px-6">
        <section className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="inline-flex rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700">
              EduLife OS • Headteacher Attendance Command
            </div>

            <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-950">
              Attendance command — {safeDate}
            </h1>

            <p className="mt-1 max-w-3xl text-sm text-slate-700">
              See which classes have not opened attendance, which are still
              open, which are ready for certification, and which are already
              certified. Unmarked learners are never counted as present.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <a className={btnOutline} href="/headteacher/attendance/weekly">
              Weekly attendance
            </a>
            <a className={btnOutline} href="/headteacher/dashboard">
              Dashboard
            </a>
          </div>
        </section>

        <section className={`mt-6 p-4 ${cardClass}`}>
          <div className="grid gap-3 md:grid-cols-[220px_auto_auto_auto] md:items-end">
            <div>
              <label className="block text-xs font-semibold text-slate-700">
                Date
              </label>
              <input
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                className={inputClass}
              />
            </div>

            <button
              type="button"
              onClick={() => void refresh()}
              disabled={loading || bulkLoading}
              className={btnPrimary}
            >
              {loading ? "Loading…" : "Refresh"}
            </button>

            <button
              type="button"
              onClick={() => setDate(todayISO())}
              disabled={loading || bulkLoading}
              className={btnOutline}
            >
              Today
            </button>

            <button
              type="button"
              onClick={() => void bulkCertify()}
              disabled={loading || bulkLoading}
              className={readyToCertify.length > 0 ? btnPrimary : btnSoft}
              title="Only CLOSED, complete, non-empty sessions are certified. Open, incomplete, empty, and already-certified sessions are skipped."
            >
              {bulkLoading
                ? "Certifying…"
                : `Safe Bulk Certify (${readyToCertify.length} ready)`}
            </button>
          </div>

          <div className="mt-3 text-xs text-slate-600">
            Certification rule: only closed, complete, non-empty sessions can be
            certified. Open, incomplete, empty, and already-certified sessions
            are safely skipped.
          </div>
        </section>

        {message ? (
          <section className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
            {message}
          </section>
        ) : null}

        {error ? (
          <section className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">
            {error}
          </section>
        ) : null}

        {summary ? (
          <section className="mt-5 flex flex-wrap gap-2">
            {countChip(
              "Operational classes",
              summary.operationalClassrooms ?? summary.total,
            )}
            {countChip(
              "Needs action",
              summary.needsAction ?? needsTeacherAction.length,
              (summary.needsAction ?? needsTeacherAction.length)
                ? "warn"
                : "good",
            )}
            {countChip(
              "No session",
              summary.NO_SESSION,
              summary.NO_SESSION ? "warn" : "plain",
            )}
            {countChip("Open", summary.OPEN, summary.OPEN ? "warn" : "plain")}
            {countChip(
              "Ready closed",
              summary.CLOSED,
              summary.CLOSED ? "good" : "plain",
            )}
            {countChip("Certified", summary.CERTIFIED, "good")}
            {countChip("Learners", summary.learners ?? 0)}
            {countChip("Marked", summary.marked ?? 0)}
            {countChip(
              "Unmarked",
              summary.unmarked ?? 0,
              (summary.unmarked ?? 0) ? "warn" : "good",
            )}
            {countChip("Present", summary.present ?? 0, "good")}
            {countChip(
              "Absent",
              summary.absent ?? 0,
              (summary.absent ?? 0) ? "bad" : "plain",
            )}
            {countChip(
              "Late",
              summary.late ?? 0,
              (summary.late ?? 0) ? "warn" : "plain",
            )}
            {countChip("Parent alerts", summary.notified ?? 0)}
            {typeof summary.hiddenEmptyClassrooms === "number" &&
            summary.hiddenEmptyClassrooms > 0
              ? countChip(
                  "Hidden empty shells",
                  summary.hiddenEmptyClassrooms,
                  "warn",
                )
              : null}
          </section>
        ) : null}

        <section className="mt-6 grid gap-4 lg:grid-cols-4">
          <div className={`p-4 ${cardClass}`}>
            <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">
              Open / missing
            </div>
            <div className="mt-1 text-3xl font-bold text-slate-950">
              {fmt(openOrMissing.length)}
            </div>
            <p className="mt-1 text-xs text-slate-600">
              Classes needing teacher capture or closure.
            </p>
          </div>

          <div className={`p-4 ${cardClass}`}>
            <div className="text-xs font-semibold uppercase tracking-wide text-rose-700">
              Needs action
            </div>
            <div className="mt-1 text-3xl font-bold text-slate-950">
              {fmt(needsTeacherAction.length)}
            </div>
            <p className="mt-1 text-xs text-slate-600">
              Missing, open, or incomplete evidence.
            </p>
          </div>

          <div className={`p-4 ${cardClass}`}>
            <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
              Ready to certify
            </div>
            <div className="mt-1 text-3xl font-bold text-slate-950">
              {fmt(readyToCertify.length)}
            </div>
            <p className="mt-1 text-xs text-slate-600">
              Closed, complete, non-empty registers.
            </p>
          </div>

          <div className={`p-4 ${cardClass}`}>
            <div className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
              Certified
            </div>
            <div className="mt-1 text-3xl font-bold text-slate-950">
              {fmt(certified.length)}
            </div>
            <p className="mt-1 text-xs text-slate-600">
              Accepted as reviewed attendance evidence.
            </p>
          </div>
        </section>

        <div className="mt-6">
          <AttendanceScanAuditPanel
            date={safeDate}
            endpoint="/api/headteacher/attendance/scan-audit/list"
            title="Daily QR scan evidence"
            description="Headteacher evidence view for today’s QR attendance activity across active classes. This is attendance-only evidence and does not expose QR secrets, token hashes, parent contact data, health data, or location data."
            showClassroom
          />
        </div>

        <section className={`mt-6 overflow-hidden ${cardClass}`}>
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-950">
              Class command list
            </h2>
            <p className="text-xs text-slate-600">
              The headteacher’s work here is to push teachers to finish open or
              missing registers, then certify only complete evidence.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[1250px] w-full text-sm">
              <thead className="bg-slate-100 text-xs text-slate-800">
                <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:text-left [&>th]:font-semibold">
                  <th>Class</th>
                  <th>Status</th>
                  <th className="text-right">Total</th>
                  <th className="text-right">Marked</th>
                  <th className="text-right">Unmarked</th>
                  <th className="text-right">Present</th>
                  <th className="text-right">Absent</th>
                  <th className="text-right">Late</th>
                  <th className="text-right">Excused</th>
                  <th className="text-right">Completion</th>
                  <th>Parent alerts</th>
                  <th>Evidence timing</th>
                  <th>Leadership action</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td
                      colSpan={13}
                      className="px-4 py-8 text-center text-sm text-slate-500"
                    >
                      Loading attendance command view…
                    </td>
                  </tr>
                ) : null}

                {!loading && items.length === 0 ? (
                  <tr>
                    <td
                      colSpan={13}
                      className="px-4 py-8 text-center text-sm text-slate-500"
                    >
                      No operational attendance classes found for this date.
                    </td>
                  </tr>
                ) : null}

                {!loading
                  ? items.map((item) => {
                      const state = stateOf(item);
                      const className =
                        item.label || item.classLabel || "Class";

                      return (
                        <tr
                          key={`${item.classroomId}-${item.sessionId ?? "none"}`}
                          className="[&>td]:px-3 [&>td]:py-2 [&>td]:align-top"
                        >
                          <td className="font-semibold text-slate-950">
                            {className}
                          </td>

                          <td>
                            <span className={statusBadge(state)}>{state}</span>
                          </td>

                          <td className="text-right tabular-nums text-slate-900">
                            {fmt(item.total)}
                          </td>

                          <td className="text-right tabular-nums text-slate-900">
                            {fmt(item.marked)}
                          </td>

                          <td
                            className={`text-right tabular-nums ${
                              item.unmarked
                                ? "font-semibold text-amber-700"
                                : "text-slate-900"
                            }`}
                          >
                            {fmt(item.unmarked)}
                          </td>

                          <td className="text-right tabular-nums text-slate-900">
                            {fmt(item.present)}
                          </td>

                          <td
                            className={`text-right tabular-nums ${
                              item.absent
                                ? "font-semibold text-rose-700"
                                : "text-slate-900"
                            }`}
                          >
                            {fmt(item.absent)}
                          </td>

                          <td
                            className={`text-right tabular-nums ${
                              item.late
                                ? "font-semibold text-amber-700"
                                : "text-slate-900"
                            }`}
                          >
                            {fmt(item.late)}
                          </td>

                          <td className="text-right tabular-nums text-slate-900">
                            {fmt(item.excused)}
                          </td>

                          <td className="text-right tabular-nums text-slate-900">
                            {percent(item.completionPct)}
                          </td>

                          <td className="text-xs text-slate-700">
                            {item.notifiedAt
                              ? `Notified ${formatDateTime(item.notifiedAt)}`
                              : "Not yet notified"}
                          </td>

                          <td className="text-xs text-slate-700">
                            <div>Closed: {formatDateTime(item.closedAt)}</div>
                            <div>
                              Certified: {formatDateTime(item.certifiedAt)}
                            </div>
                          </td>

                          <td>
                            <span
                              className={`inline-flex rounded-xl border px-2.5 py-1 text-xs font-medium ${actionTone(
                                item,
                              )}`}
                            >
                              {actionMeaning(item)}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
