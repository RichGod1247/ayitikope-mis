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
    total?: number;
    marked?: number;
    unmarked?: number;
    present: number;
    absent: number;
    late: number;
    excused: number;
    completionPct?: number;
    presentPct?: number;
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
  | ApiOk<{
      absentCount: number;
      eligibleCount: number;
      successCount: number;
      sentCount?: number;
      skippedCount: number;
      failedCount: number;
      skippedNoOptIn: number;
      skippedNoPhone: number;
      brand?: string;
      testMode?: boolean;
      summaryText?: string;
      note?: string;
      alreadyNotified?: boolean;
    }>
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

function cleanStr(v: unknown) {
  return String(v ?? "").trim();
}

function normalizeLevel(raw: unknown) {
  return cleanStr(raw).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function levelToken(raw: unknown): string | null {
  const s = normalizeLevel(raw);

  let m = s.match(/^KG([12])$/);
  if (m) return `KG${m[1]}`;

  m = s.match(/^JHS([1-3])$/);
  if (m) return `JHS${m[1]}`;

  m = s.match(/^(BASIC|B|BS)([7-9])$/);
  if (m) return `JHS${Number(m[2]) - 6}`;

  m = s.match(/^(BASIC|B|PRIMARY|P)([1-6])$/);
  if (m) return `B${m[2]}`;

  return null;
}

function classroomGroupKey(c: Classroom) {
  return levelToken(c.grade) ?? levelToken(c.name) ?? `CLASS:${normalizeLevel(c.name) || c.id}`;
}

function levelOrder(c: Classroom) {
  const token = levelToken(c.grade) ?? levelToken(c.name);

  if (token === "KG1") return 1;
  if (token === "KG2") return 2;
  if (token && /^B[1-6]$/.test(token)) return 10 + Number(token.slice(1));
  if (token && /^JHS[1-3]$/.test(token)) return 30 + Number(token.slice(3));

  return 999;
}

function classroomArmRank(c: Classroom) {
  const arm = cleanStr(c.arm).toUpperCase();
  if (!arm) return 0;
  if (arm === "A") return 1;
  return 2;
}

function orderedClassrooms(list: Classroom[]) {
  return [...list].sort((a, b) => {
    return (
      levelOrder(a) - levelOrder(b) ||
      classroomArmRank(a) - classroomArmRank(b) ||
      buildClassLabel(a, true).localeCompare(buildClassLabel(b, true))
    );
  });
}

function singleStreamClassrooms(list: Classroom[]) {
  const grouped = new Map<string, Classroom[]>();

  for (const classroom of orderedClassrooms(list)) {
    const key = classroomGroupKey(classroom);
    const rows = grouped.get(key) ?? [];
    rows.push(classroom);
    grouped.set(key, rows);
  }

  return Array.from(grouped.values())
    .filter((rows) => rows.length === 1)
    .map((rows) => rows[0]);
}

function multiStreamClassroomsAvailable(list: Classroom[]) {
  const counts = new Map<string, number>();

  for (const classroom of list) {
    const key = classroomGroupKey(classroom);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return Array.from(counts.values()).some((count) => count > 1);
}

function buildClassLabel(c: Classroom | null | undefined, includeArm = true): string {
  if (!c) return "";

  const name = cleanStr(c.name);
  const grade = cleanStr(c.grade);
  const base = name || grade || "Classroom";
  const gradePart = grade && normalizeLevel(grade) !== normalizeLevel(name) ? grade : "";
  const armPart = includeArm && cleanStr(c.arm) ? `Arm ${cleanStr(c.arm)}` : "";

  return [base, gradePart, armPart].filter(Boolean).join(" • ");
}

function notifyLine(j: Extract<NotifyResponse, { ok: true }>) {
  if (j.alreadyNotified) return "Parents were already notified for this session.";

  const sent = j.sentCount ?? j.successCount;

  return (
    j.summaryText ||
    `Absent: ${j.absentCount}. SMS eligible: ${j.eligibleCount}. Sent: ${sent}. Skipped: ${j.skippedCount}. Failed: ${j.failedCount}.`
  );
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
}: {
  teacherUserId?: string;
}) {
  const router = useRouter();

  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [classroomId, setClassroomId] = useState<string>("");
  const [showClassArms, setShowClassArms] = useState(false);
  const [dateISO, setDateISO] = useState<string>(todayISO());

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

  const orderedAccessibleClassrooms = useMemo(() => orderedClassrooms(classrooms), [classrooms]);
  const singleStreamOptions = useMemo(
    () => singleStreamClassrooms(orderedAccessibleClassrooms),
    [orderedAccessibleClassrooms]
  );
  const hasMultiStream = useMemo(
    () => multiStreamClassroomsAvailable(orderedAccessibleClassrooms),
    [orderedAccessibleClassrooms]
  );
  const canChooseClassroom = classrooms.length > 1;
  const visibleClassrooms = useMemo(
    () => (showClassArms ? orderedAccessibleClassrooms : singleStreamOptions),
    [orderedAccessibleClassrooms, showClassArms, singleStreamOptions]
  );

  const selectedClassroom = useMemo(
    () => classrooms.find((x) => x.id === classroomId) ?? null,
    [classrooms, classroomId]
  );

  const classLabel = useMemo(() => buildClassLabel(selectedClassroom, true), [selectedClassroom]);

  const hasAccessibleClassrooms = classrooms.length > 0;
  const hasAssignment = hasAccessibleClassrooms && !!classroomId;
  const hasExactSelection =
    !canChooseClassroom || showClassArms || visibleClassrooms.some((classroom) => classroom.id === classroomId);
  const unmarked = summary?.totals.unmarked ?? 0;

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
      const ordered = orderedClassrooms(list);
      const singleStream = singleStreamClassrooms(ordered);

      setClassrooms(ordered);

      const currentIsAccessible = !!classroomId && ordered.some((c) => c.id === classroomId);
      const currentIsVisible =
        currentIsAccessible && (showClassArms || singleStream.some((c) => c.id === classroomId));

      if (!currentIsVisible) {
        const fallback =
          singleStream[0] ?? (ordered.length === 1 ? ordered[0] : showClassArms ? ordered[0] : null);
        setClassroomId(fallback?.id || "");
      }

      if (ordered.length <= 1) setShowClassArms(false);
    } catch (e: unknown) {
      setErr(safeText((e as { message?: unknown })?.message) || "Failed to load classrooms.");
      setClassrooms([]);
      setClassroomId("");
    } finally {
      setLoading(false);
    }
  }

  function switchClassMode(nextShowClassArms: boolean) {
    setShowClassArms(nextShowClassArms);
    setSummary(null);
    setSummaryErr(null);
    setOpenErr(null);

    if (nextShowClassArms) {
      if (!classroomId) setClassroomId(orderedAccessibleClassrooms[0]?.id || "");
      return;
    }

    if (!singleStreamOptions.some((classroom) => classroom.id === classroomId)) {
      setClassroomId(singleStreamOptions[0]?.id || "");
    }
  }

  async function loadSummary() {
    setSummaryLoading(true);
    setSummaryErr(null);
    setSummary(null);

    try {
      if (!classroomId) throw new Error("No assigned classroom.");
      if (!hasExactSelection) throw new Error("Choose Class arms to select the exact register.");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) throw new Error("Invalid date.");

      const r = await fetch(
        `/api/teacher/attendance/sessions/summary?classroomId=${encodeURIComponent(
          classroomId
        )}&dateISO=${encodeURIComponent(dateISO)}`,
        { cache: "no-store" }
      );

      const j: SummaryResponse = await r.json().catch(() => ({
        ok: false,
        error: "Failed to parse summary response.",
      }));

      if (!r.ok || !j.ok) throw new Error(j.ok ? `HTTP ${r.status}` : j.error);

      setSummary(j.summary);
    } catch (e: unknown) {
      setSummaryErr(safeText((e as { message?: unknown })?.message) || "Failed to load summary.");
    } finally {
      setSummaryLoading(false);
    }
  }

  function sessionHref(sessionId: string) {
    const qp =
      `?className=${encodeURIComponent(classLabel || "Class")}` +
      `&date=${encodeURIComponent(dateISO)}`;
    return `/teacher/attendance/${encodeURIComponent(sessionId)}${qp}`;
  }

  async function openOrGo() {
    setOpening(true);
    setOpenErr(null);

    try {
      if (!hasAssignment) throw new Error("No assigned classroom.");
      if (!hasExactSelection) throw new Error("Choose Class arms to select the exact register.");
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
    } catch (e: unknown) {
      setOpenErr(safeText((e as { message?: unknown })?.message) || "Failed to open session.");
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
        body: JSON.stringify({ sessionId }),
      });

      const j: NotifyResponse = await r.json().catch(() => ({
        ok: false,
        error: "Failed to parse notify response.",
      }));

      if (!r.ok || !j.ok) throw new Error(j.ok ? `Notify failed (HTTP ${r.status}).` : j.error);

      setNotifyOk(`${notifyLine(j)}${j.testMode ? " (TEST MODE)" : ""}`);

      await loadSummary();
    } catch (e: unknown) {
      setNotifyErr(safeText((e as { message?: unknown })?.message) || "Failed to notify parents.");
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
      if (unmarked > 0) throw new Error(`${unmarked} learner(s) are still unmarked. Open the session and mark all learners first.`);

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
        body: JSON.stringify({ sessionId }),
      });

      const j2: NotifyResponse = await r2.json().catch(() => ({
        ok: false,
        error: "Failed to parse notify response.",
      }));

      if (!r2.ok || !j2.ok) throw new Error(j2.ok ? `Notify failed (HTTP ${r2.status}).` : j2.error);

      setNotifyOk(`${notifyLine(j2)}${j2.testMode ? " (TEST MODE)" : ""}`);

      await loadSummary();
    } catch (e: unknown) {
      setCloseErr(safeText((e as { message?: unknown })?.message) || "Failed to close and notify.");
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
    !!summary?.sessionId && summary.state === "OPEN" && !closing && !notifying && unmarked === 0;

  return (
    <section className="space-y-6">
      <section className={`${shellCard} p-5 md:p-6`}>
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center rounded-full border border-[#E8C96A]/25 bg-[#D4AF37]/10 px-3 py-1 text-[11px] font-medium text-[#E8C96A]">
              EduLife OS · Teacher Attendance
            </div>

            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-[#F7F4ED]">Attendance</h1>
              <p className="mt-1 text-sm text-[#C9CDD6]">
                Open a session, mark all learners, close the register, then notify eligible parents.
              </p>
            </div>

            {teacherUserId ? (
              <p className="text-[11px] font-mono text-[#8F98A8]">Teacher: {teacherUserId.slice(0, 8)}…</p>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void loadClassrooms()} className={ghostBtn} disabled={loading}>
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
        <div className="grid gap-4 md:grid-cols-3">
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

          <div className="space-y-2" data-attendance-class-mode="single-default-v1">
            <label className={labelClass}>Class</label>

            {canChooseClassroom && hasMultiStream ? (
              <div
                className="grid grid-cols-2 gap-1 rounded-xl border border-white/10 bg-[#05070B] p-1"
                aria-label="Class stream mode"
              >
                <button
                  type="button"
                  aria-pressed={!showClassArms}
                  onClick={() => switchClassMode(false)}
                  className={`rounded-lg px-3 py-2 text-xs font-semibold ${
                    !showClassArms
                      ? "bg-[#D4AF37] text-[#071A3D]"
                      : "text-[#C9CDD6] hover:bg-white/5"
                  }`}
                >
                  Single stream
                </button>
                <button
                  type="button"
                  aria-pressed={showClassArms}
                  onClick={() => switchClassMode(true)}
                  className={`rounded-lg px-3 py-2 text-xs font-semibold ${
                    showClassArms
                      ? "bg-[#D4AF37] text-[#071A3D]"
                      : "text-[#C9CDD6] hover:bg-white/5"
                  }`}
                >
                  Class arms
                </button>
              </div>
            ) : null}

            {canChooseClassroom ? (
              <>
                <select
                  className={fieldClass}
                  value={classroomId}
                  onChange={(e) => setClassroomId(e.target.value)}
                  disabled={loading || visibleClassrooms.length === 0}
                >
                  {visibleClassrooms.length ? (
                    visibleClassrooms.map((c) => (
                      <option key={c.id} value={c.id}>
                        {buildClassLabel(c, showClassArms)}
                      </option>
                    ))
                  ) : (
                    <option value="">
                      {hasMultiStream ? "Switch to Class arms to choose the exact register" : "No classroom available"}
                    </option>
                  )}
                </select>

                {hasMultiStream && !showClassArms ? (
                  <div className={subtleText}>
                    Single-stream view hides levels that have multiple arms. Choose <b>Class arms</b> for an exact register.
                  </div>
                ) : null}
              </>
            ) : hasAssignment ? (
              <div className="rounded-xl border border-white/10 bg-[#07111F] px-3 py-2 text-sm text-[#F7F4ED]">
                <div className="font-medium">{buildClassLabel(selectedClassroom, true)}</div>
                <div className="mt-1 text-[11px] text-[#AEB6C4]">
                  Your assigned Class Teacher / Class Adviser register.
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-amber-300/20 bg-amber-400/10 px-3 py-2 text-sm text-amber-100">
                No attendance class assigned.
              </div>
            )}
          </div>

          <div className="flex items-end">
            <button
              type="button"
              onClick={() => void openOrGo()}
              disabled={opening || summaryLoading || !hasAssignment || !hasExactSelection}
              className={`${primaryBtn} w-full`}
            >
              {opening ? "Working…" : summary?.sessionId ? "Go to session" : "Open session"}
            </button>
          </div>
        </div>

        <p className="text-[11px] text-[#8F98A8]">
          Parent SMS sender is secured by EduLife OS on the server.
        </p>

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
              <div className="text-sm font-semibold text-[#F7F4ED]">{classLabel || "Unassigned"}</div>
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
                <StatChip label="Marked" value={safeNum(summary.totals.marked)} />
                <StatChip
                  label="Unmarked"
                  value={safeNum(summary.totals.unmarked)}
                  tone={safeNum(summary.totals.unmarked) ? "warn" : "good"}
                />
                <StatChip label="Present" value={summary.totals.present} tone="good" />
                <StatChip label="Late" value={summary.totals.late} tone="warn" />
                <StatChip label="Absent" value={summary.totals.absent} tone="bad" />
                <StatChip label="Excused" value={summary.totals.excused} />

                {summary.sessionId && summary.state === "OPEN" && unmarked > 0 ? (
                  <span className="rounded-full border border-amber-300/20 bg-amber-400/12 px-3 py-1 text-amber-100">
                    Mark all learners before closing
                  </span>
                ) : null}

                {summary.sessionId && summary.state === "OPEN" ? (
                  <button
                    type="button"
                    onClick={() => void closeThenNotify()}
                    disabled={!canCloseAndNotifyUi}
                    className={`${ghostBtn} h-auto px-3 py-1.5 text-[11px]`}
                    title={unmarked > 0 ? "Mark all learners before closing." : "Close and notify eligible parents"}
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
                    title="Notify eligible parents after the session has been closed or certified"
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

      {!hasAccessibleClassrooms ? (
        <section className="rounded-2xl border border-amber-300/20 bg-amber-400/12 p-4 text-sm text-amber-100">
          You don’t have an attendance class assigned. Ask the headteacher/admin to set your
          <b> Class Teacher / Class Adviser</b> responsibility in <b>Admin → Teachers</b>.
        </section>
      ) : null}
    </section>
  );
}