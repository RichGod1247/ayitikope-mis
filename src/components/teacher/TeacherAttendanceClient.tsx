// src/components/teacher/TeacherAttendanceClient.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Classroom = {
  id: string;
  name: string;
  grade?: string | null;
  arm?: string | null;
};

type SummaryState = "NONE" | "OPEN" | "CLOSED" | "CERTIFIED";

type Summary = {
  state: SummaryState;
  sessionId?: string | null;
  dateISO: string;
  classroomId: string;
  totals: {
    students: number;
    present: number;
    absent: number;
    late: number;
    excused: number;
  };
};

type ApiOk<T> = { ok: true } & T;
type ApiErr = { ok: false; error: string };

type ListClassroomsResponse = ApiOk<{ classrooms: Classroom[] }> | ApiErr;
type SummaryResponse = ApiOk<{ summary: Summary }> | ApiErr;
type OpenResponse = ApiOk<{ sessionId: string }> | ApiErr;

type CloseResponse =
  | ApiOk<{
      session: {
        id: string;
        classroomId: string;
        dateISO: string;
        isClosed: boolean;
        certifiedAt: string | null;
      };
    }>
  | ApiErr;

type NotifyResponse =
  | ApiOk<{ total: number; successCount: number; brand?: string; testMode?: boolean; note?: string }>
  | ApiErr;

const shellCard =
  "rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] shadow-[0_18px_60px_rgba(0,0,0,0.18)] backdrop-blur-xl";
const innerCard = "rounded-[22px] border border-white/10 bg-[#07111F]/80";
const fieldClass =
  "w-full rounded-xl border border-white/10 bg-[#07111F] px-3 py-2 text-sm text-[#F7F4ED] placeholder:text-[#738095] focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/20";
const labelClass = "block text-[11px] font-medium text-[#C9CDD6]";
const subtleText = "text-[11px] text-[#AEB6C4]";
const primaryBtn =
  "inline-flex items-center justify-center rounded-xl bg-[linear-gradient(135deg,#D4AF37,#E8C96A)] px-4 py-2 text-sm font-semibold text-[#071A3D] shadow-[0_18px_50px_rgba(212,175,55,0.22)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60";
const ghostBtn =
  "inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-[#F7F4ED] transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60";

function todayISO(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function safeText(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function safeNum(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function buildClassLabel(c: Classroom | null | undefined): string {
  if (!c) return "";
  return [c.name, c.grade, c.arm].filter(Boolean).join(" • ");
}

function StatChip(props: { label: string; value: number; tone?: "neutral" | "good" | "warn" | "bad" }) {
  let cls = "border-white/10 bg-white/5 text-[#D7DCE5]";
  if (props.tone === "good") cls = "border-emerald-300/20 bg-emerald-400/12 text-emerald-100";
  if (props.tone === "warn") cls = "border-amber-300/20 bg-amber-400/12 text-amber-100";
  if (props.tone === "bad") cls = "border-rose-300/20 bg-rose-400/12 text-rose-100";

  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[11px] ${cls}`}>
      <span>{props.label}:</span>
      <span className="font-semibold">{props.value}</span>
    </span>
  );
}

export default function TeacherAttendanceClient({
  teacherUserId,
  initialBrand,
}: {
  teacherUserId?: string;
  initialBrand?: string;
}) {
  const router = useRouter();

  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [classroomId, setClassroomId] = useState<string>("");
  const [dateISO, setDateISO] = useState<string>(todayISO());
  const [brand, setBrand] = useState<string>((initialBrand || "EDULIFE").trim() || "EDULIFE");

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [summary, setSummary] = useState<Summary | null>(null);
  const [summaryErr, setSummaryErr] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  const [opening, setOpening] = useState(false);
  const [openErr, setOpenErr] = useState<string | null>(null);

  const [closing, setClosing] = useState(false);
  const [closeErr, setCloseErr] = useState<string | null>(null);
  const [closeOk, setCloseOk] = useState<string | null>(null);

  const [notifying, setNotifying] = useState(false);
  const [notifyErr, setNotifyErr] = useState<string | null>(null);
  const [notifyOk, setNotifyOk] = useState<string | null>(null);

  const selectedClassroom = useMemo(
    () => classrooms.find((x) => x.id === classroomId) ?? null,
    [classrooms, classroomId]
  );

  const classLabel = useMemo(() => buildClassLabel(selectedClassroom), [selectedClassroom]);

  const hasAssignment = classrooms.length > 0 && !!classroomId;
  const canChooseClassroom = classrooms.length > 1;

  async function loadClassrooms() {
    setLoading(true);
    setErr(null);

    try {
      const r = await fetch("/api/teacher/classrooms/list", { cache: "no-store" });
      const j: ListClassroomsResponse = await r.json().catch(() => ({
        ok: false,
        error: "Failed to parse classrooms response.",
      }));

      if (!r.ok || !j.ok) throw new Error(j.ok ? `HTTP ${r.status}` : j.error);

      const list = Array.isArray(j.classrooms) ? j.classrooms : [];
      setClassrooms(list);

      const stillValid = classroomId && list.some((c) => c.id === classroomId);
      if (!stillValid) setClassroomId(list[0]?.id || "");
    } catch (e: any) {
      setErr(safeText(e?.message) || "Failed to load classrooms.");
      setClassrooms([]);
      setClassroomId("");
    } finally {
      setLoading(false);
    }
  }

  async function loadSummary() {
    setSummaryLoading(true);
    setSummaryErr(null);
    setSummary(null);

    try {
      if (!classroomId) throw new Error("No assigned classroom.");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) throw new Error("Invalid date.");

      const r = await fetch(
        `/api/teacher/attendance/sessions/summary?classroomId=${encodeURIComponent(classroomId)}&dateISO=${encodeURIComponent(
          dateISO
        )}`,
        { cache: "no-store" }
      );

      const j: SummaryResponse = await r.json().catch(() => ({
        ok: false,
        error: "Failed to parse summary response.",
      }));

      if (!r.ok || !j.ok) throw new Error(j.ok ? `HTTP ${r.status}` : j.error);

      setSummary(j.summary);
    } catch (e: any) {
      setSummaryErr(safeText(e?.message) || "Failed to load summary.");
    } finally {
      setSummaryLoading(false);
    }
  }

  function sessionHref(sessionId: string) {
    const qp =
      `?className=${encodeURIComponent(classLabel || "Class")}` +
      `&date=${encodeURIComponent(dateISO)}` +
      `&brand=${encodeURIComponent(brand || "EDULIFE")}`;
    return `/teacher/attendance/${encodeURIComponent(sessionId)}${qp}`;
  }

  async function openOrGo() {
    setOpening(true);
    setOpenErr(null);

    try {
      if (!hasAssignment) throw new Error("No assigned classroom.");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) throw new Error("Invalid date.");

      if (summary?.sessionId) {
        router.push(sessionHref(String(summary.sessionId)));
        return;
      }

      const r = await fetch("/api/teacher/attendance/sessions/open", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ classroomId, dateISO }),
      });

      const j: OpenResponse = await r.json().catch(() => ({
        ok: false,
        error: "Failed to parse open response.",
      }));

      if (!r.ok || !j.ok) throw new Error(j.ok ? `HTTP ${r.status}` : j.error);

      router.push(sessionHref(j.sessionId));
    } catch (e: any) {
      setOpenErr(safeText(e?.message) || "Failed to open session.");
    } finally {
      setOpening(false);
    }
  }

  async function notifyOnly() {
    setNotifyErr(null);
    setNotifyOk(null);
    setNotifying(true);

    try {
      const sessionId = summary?.sessionId ? String(summary.sessionId) : "";
      if (!sessionId) throw new Error("No session to notify.");

      const r = await fetch("/api/teacher/attendance/notify-parents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId, brand }),
      });

      const j: NotifyResponse = await r.json().catch(() => ({
        ok: false,
        error: "Failed to parse notify response.",
      }));

      if (!r.ok || !j.ok) {
        throw new Error(j.ok ? `Notify failed (HTTP ${r.status}).` : j.error);
      }

      setNotifyOk(
        `Notifications: ${safeNum(j.successCount)}/${safeNum(j.total)}${j.testMode ? " (TEST MODE)" : ""}${
          j.note ? ` — ${j.note}` : ""
        }`
      );

      await loadSummary();
    } catch (e: any) {
      setNotifyErr(safeText(e?.message) || "Failed to notify parents.");
      await loadSummary().catch(() => null);
    } finally {
      setNotifying(false);
    }
  }

  async function closeThenNotify() {
    setCloseErr(null);
    setCloseOk(null);
    setNotifyErr(null);
    setNotifyOk(null);
    setClosing(true);

    try {
      const sessionId = summary?.sessionId ? String(summary.sessionId) : "";
      if (!sessionId) throw new Error("No session to close.");

      const r1 = await fetch("/api/teacher/attendance/sessions/close", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });

      const j1: CloseResponse = await r1.json().catch(() => ({
        ok: false,
        error: "Failed to parse close response.",
      }));

      if (!r1.ok || !j1.ok) throw new Error(j1.ok ? `HTTP ${r1.status}` : j1.error);

      setCloseOk("Closed.");

      const r2 = await fetch("/api/teacher/attendance/notify-parents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId, brand }),
      });

      const j2: NotifyResponse = await r2.json().catch(() => ({
        ok: false,
        error: "Failed to parse notify response.",
      }));

      if (!r2.ok || !j2.ok) {
        throw new Error(j2.ok ? `Notify failed (HTTP ${r2.status}).` : j2.error);
      }

      setNotifyOk(
        `Notifications: ${safeNum(j2.successCount)}/${safeNum(j2.total)}${j2.testMode ? " (TEST MODE)" : ""}${
          j2.note ? ` — ${j2.note}` : ""
        }`
      );

      await loadSummary();
    } catch (e: any) {
      setCloseErr(safeText(e?.message) || "Failed to close and notify.");
      await loadSummary().catch(() => null);
    } finally {
      setClosing(false);
      setNotifying(false);
    }
  }

  useEffect(() => {
    void loadClassrooms();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!classroomId || !dateISO) return;
    void loadSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classroomId, dateISO]);

  function statePill(state: SummaryState) {
    const base = "inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold";
    if (state === "CERTIFIED") return `${base} border-indigo-300/20 bg-indigo-400/12 text-indigo-100`;
    if (state === "CLOSED") return `${base} border-rose-300/20 bg-rose-400/12 text-rose-100`;
    if (state === "OPEN") return `${base} border-amber-300/20 bg-amber-400/12 text-amber-100`;
    return `${base} border-white/10 bg-white/5 text-[#D7DCE5]`;
  }

  const canNotifyUi =
    !!summary?.sessionId && (summary.state === "CLOSED" || summary.state === "CERTIFIED") && !closing && !notifying;

  const canCloseAndNotifyUi =
    !!summary?.sessionId && summary.state === "OPEN" && !closing && !notifying;

  return (
    <section className="space-y-6">
      <section className={`${shellCard} p-5 md:p-6`}>
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center rounded-full border border-[#E8C96A]/25 bg-[#D4AF37]/10 px-3 py-1 text-[11px] font-medium text-[#E8C96A]">
              EduLife OS · Teacher Attendance
            </div>

            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-[#F7F4ED]">
                Attendance
              </h1>
              <p className="mt-1 text-sm text-[#C9CDD6]">
                Open a session, mark attendance and health, close or certify it, then notify parents.
              </p>
            </div>

            {teacherUserId ? (
              <p className="text-[11px] font-mono text-[#8F98A8]">
                Teacher: {teacherUserId.slice(0, 8)}…
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void loadClassrooms()}
              className={ghostBtn}
              disabled={loading}
            >
              Refresh
            </button>

            <Link href="/teacher/dashboard" className={ghostBtn}>
              Back
            </Link>
          </div>
        </div>
      </section>

      {err ? (
        <section className="rounded-2xl border border-rose-300/20 bg-rose-400/12 p-4 text-sm text-rose-100">
          {err}
        </section>
      ) : null}

      <section className={`${shellCard} p-5 md:p-6 space-y-5`}>
        <div className="grid gap-4 md:grid-cols-4">
          <div className="space-y-1">
            <label className={labelClass}>Date</label>
            <input
              type="date"
              className={fieldClass}
              value={dateISO}
              onChange={(e) => setDateISO(e.target.value)}
              disabled={loading || !hasAssignment}
            />
          </div>

          <div className="space-y-1">
            <label className={labelClass}>Classroom</label>
            <select
              className={fieldClass}
              value={classroomId}
              onChange={(e) => setClassroomId(e.target.value)}
              disabled={loading || !hasAssignment || !canChooseClassroom}
            >
              {hasAssignment ? (
                classrooms.map((c) => (
                  <option key={c.id} value={c.id}>
                    {[c.name, c.grade, c.arm].filter(Boolean).join(" • ")}
                  </option>
                ))
              ) : (
                <option value="">No assigned classroom</option>
              )}
            </select>

            {!canChooseClassroom && hasAssignment ? (
              <div className={subtleText}>Assigned classroom locked because only one class is available.</div>
            ) : null}
          </div>

          <div className="space-y-1">
            <label className={labelClass}>Brand (Sender ID)</label>
            <input
              type="text"
              className={fieldClass}
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              placeholder="EDULIFE"
              disabled={loading}
            />
          </div>

          <div className="flex items-end">
            <button
              type="button"
              onClick={() => void openOrGo()}
              disabled={opening || summaryLoading || !hasAssignment}
              className={`${primaryBtn} w-full`}
            >
              {opening ? "Working…" : summary?.sessionId ? "Go to session" : "Open session"}
            </button>
          </div>
        </div>

        {openErr ? (
          <div className="rounded-2xl border border-rose-300/20 bg-rose-400/12 px-4 py-3 text-sm text-rose-100">
            {openErr}
          </div>
        ) : null}

        {closeErr ? (
          <div className="rounded-2xl border border-rose-300/20 bg-rose-400/12 px-4 py-3 text-sm text-rose-100">
            {closeErr}
          </div>
        ) : null}

        {notifyErr ? (
          <div className="rounded-2xl border border-rose-300/20 bg-rose-400/12 px-4 py-3 text-sm text-rose-100">
            {notifyErr}
          </div>
        ) : null}

        {closeOk ? (
          <div className="rounded-2xl border border-emerald-300/20 bg-emerald-400/12 px-4 py-3 text-sm text-emerald-100">
            {closeOk}
          </div>
        ) : null}

        {notifyOk ? (
          <div className="rounded-2xl border border-emerald-300/20 bg-emerald-400/12 px-4 py-3 text-sm text-emerald-100">
            {notifyOk}
          </div>
        ) : null}

        <div className={`${innerCard} p-4`}>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-sm font-semibold text-[#F7F4ED]">
                {classLabel || "Unassigned"}
              </div>
              <div className="text-[11px] text-[#AEB6C4]">{dateISO}</div>
            </div>

            {summaryLoading ? (
              <div className="text-sm text-[#C9CDD6]">Loading summary…</div>
            ) : summaryErr ? (
              <div className="text-sm text-rose-200">{summaryErr}</div>
            ) : summary ? (
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                <span className={statePill(summary.state)}>{summary.state}</span>

                <StatChip label="Total" value={summary.totals.students} />
                <StatChip label="Present" value={summary.totals.present} tone="good" />
                <StatChip label="Late" value={summary.totals.late} tone="warn" />
                <StatChip label="Absent" value={summary.totals.absent} tone="bad" />
                <StatChip label="Excused" value={summary.totals.excused} />

                {canCloseAndNotifyUi ? (
                  <button
                    type="button"
                    onClick={() => void closeThenNotify()}
                    disabled={!canCloseAndNotifyUi}
                    className={`${ghostBtn} h-auto px-3 py-1.5 text-[11px]`}
                  >
                    {closing ? "Closing…" : "Close + Notify parents"}
                  </button>
                ) : null}

                {summary.sessionId && (summary.state === "CLOSED" || summary.state === "CERTIFIED") ? (
                  <button
                    type="button"
                    onClick={() => void notifyOnly()}
                    disabled={!canNotifyUi}
                    className={`${ghostBtn} h-auto px-3 py-1.5 text-[11px]`}
                    title="Notify parents after the session has been closed or certified"
                  >
                    {notifying ? "Notifying…" : "Notify parents"}
                  </button>
                ) : null}
              </div>
            ) : (
              <div className="text-sm text-[#C9CDD6]">—</div>
            )}
          </div>
        </div>
      </section>

      {!hasAssignment ? (
        <section className="rounded-2xl border border-amber-300/20 bg-amber-400/12 p-4 text-sm text-amber-100">
          You don’t have a class assigned. Ask the admin to assign you in <b>Admin → Teachers</b>.
        </section>
      ) : null}
    </section>
  );
}