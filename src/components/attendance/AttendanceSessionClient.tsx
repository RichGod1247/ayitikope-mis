// src/components/attendance/AttendanceSessionClient.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

type AttendanceStatus = "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";

type ApiErr = { ok: false; error: string };

type SessionDTO = {
  id: string;
  tenantId: string;
  classroomId: string;
  date: string; // YYYY-MM-DD
  isClosed: boolean;
  closedAt: string | null;
  certifiedAt: string | null;
  takenByUserId: string | null;
};

type ClassroomDTO = {
  id: string;
  name: string;
  grade: string | null;
  arm: string | null;
};

type StudentRowDTO = {
  id: string;
  firstName: string;
  lastName: string;
  guardianName: string | null;
  guardianPhone: string | null;
  guardianSmsOptIn: boolean;
  healthConsentAt: string | null;
  attendance: { status: AttendanceStatus; note: string | null };
  health: {
    temperatureC: number | null;
    symptoms: string | null;
    notes: string | null;
    sentToParentAt: string | null;
  };
};

type GetOk = {
  ok: true;
  session: SessionDTO;
  classroom: ClassroomDTO | null;
  classLabel: string;
  students: StudentRowDTO[];
};

type GetResponse = GetOk | ApiErr;

type SaveMarksOk = { ok: true; count: number };
type SaveMarksResponse = SaveMarksOk | ApiErr;

type SaveHealthOk = { ok: true; count: number; blockedStudentIds: string[]; note?: string };
type SaveHealthResponse = SaveHealthOk | ApiErr;

type MutateOk = { ok: true; session: SessionDTO };
type MutateResponse = MutateOk | ApiErr;

type NotifyOk = { ok: true; total: number; successCount: number; brand?: string; testMode?: boolean; note?: string };
type NotifyResponse = NotifyOk | ApiErr;

const FEVER_THRESHOLD = 37.8;

function safeText(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function trimOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t : null;
}

function fullName(s: { firstName: string; lastName: string }) {
  return [s.firstName, s.lastName].filter(Boolean).join(" ").trim();
}

type MarkState = { status: AttendanceStatus; note: string | null };
type HealthState = { temperatureC: number | null; symptoms: string | null; notes: string | null };

export default function AttendanceSessionClient(props: {
  tenantId: string;
  teacherUserId: string;
  sessionId: string;
  initialClassName: string;
  initialDate: string;
  initialBrand: string;
}) {
  const { tenantId, teacherUserId, sessionId } = props;

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [session, setSession] = useState<SessionDTO | null>(null);
  const [classLabel, setClassLabel] = useState<string>(props.initialClassName || "Class");
  const [students, setStudents] = useState<StudentRowDTO[]>([]);

  const [brand, setBrand] = useState<string>((props.initialBrand || "EDULIFE").trim() || "EDULIFE");

  const [marks, setMarks] = useState<Record<string, MarkState>>({});
  const [health, setHealth] = useState<Record<string, HealthState>>({});

  // Baseline snapshots from last successful load (server truth)
  const baselineMarksRef = useRef<Record<string, MarkState>>({});
  const baselineHealthRef = useRef<Record<string, HealthState>>({});

  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [lastSaveAt, setLastSaveAt] = useState<string | null>(null);

  const [mutating, setMutating] = useState(false);
  const [mutMsg, setMutMsg] = useState<string | null>(null);
  const [mutErr, setMutErr] = useState<string | null>(null);

  const [notifying, setNotifying] = useState(false);
  const [notifyMsg, setNotifyMsg] = useState<string | null>(null);
  const [notifyErr, setNotifyErr] = useState<string | null>(null);

  const isCertified = !!session?.certifiedAt;
  const isClosed = !!session?.isClosed;
  const locked = isCertified || isClosed;

  async function load() {
    setLoading(true);
    setErr(null);

    try {
      const r = await fetch(
        `/api/teacher/attendance/sessions/get?sessionId=${encodeURIComponent(sessionId)}`,
        { cache: "no-store" }
      );

      const j: GetResponse = await r.json().catch(() => ({
        ok: false,
        error: "Failed to parse session response.",
      }));

      if (!r.ok || !j.ok) throw new Error(j.ok ? `HTTP ${r.status}` : j.error);

      setSession(j.session);
      setClassLabel(j.classLabel || props.initialClassName || "Class");
      setStudents(j.students || []);

      const nextMarks: Record<string, MarkState> = {};
      const nextHealth: Record<string, HealthState> = {};

      for (const s of j.students) {
        nextMarks[s.id] = {
          status: s.attendance?.status || "PRESENT",
          note: s.attendance?.note ?? null,
        };
        nextHealth[s.id] = {
          temperatureC: s.health?.temperatureC ?? null,
          symptoms: s.health?.symptoms ?? null,
          notes: s.health?.notes ?? null,
        };
      }

      setMarks(nextMarks);
      setHealth(nextHealth);

      // Update baselines (server truth snapshot)
      baselineMarksRef.current = nextMarks;
      baselineHealthRef.current = nextHealth;

      setSaveMsg(null);
      setSaveErr(null);
      setMutMsg(null);
      setMutErr(null);
      setNotifyMsg(null);
      setNotifyErr(null);
    } catch (e: unknown) {
      const msg = safeText((e as { message?: unknown })?.message) || "Failed to load session.";
      setErr(msg);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const dirty = useMemo(() => {
    const bm = baselineMarksRef.current;
    const bh = baselineHealthRef.current;

    for (const s of students) {
      const id = s.id;

      const a = marks[id] || { status: "PRESENT" as AttendanceStatus, note: null };
      const b = bm[id] || { status: "PRESENT" as AttendanceStatus, note: null };

      if (a.status !== b.status) return true;
      if ((a.note ?? "") !== (b.note ?? "")) return true;

      const ha = health[id] || { temperatureC: null, symptoms: null, notes: null };
      const hb = bh[id] || { temperatureC: null, symptoms: null, notes: null };

      // Health may be blocked by consent server-side; we still treat edits as dirty
      if ((ha.temperatureC ?? null) !== (hb.temperatureC ?? null)) return true;
      if ((ha.symptoms ?? "") !== (hb.symptoms ?? "")) return true;
      if ((ha.notes ?? "") !== (hb.notes ?? "")) return true;
    }
    return false;
  }, [students, marks, health]);

  const counts = useMemo(() => {
    const list = students.map((s) => marks[s.id]?.status || "PRESENT");
    const absent = list.filter((x) => x === "ABSENT").length;
    const late = list.filter((x) => x === "LATE").length;
    const excused = list.filter((x) => x === "EXCUSED").length;
    const present = students.length - absent - late - excused;
    return { total: students.length, present, absent, late, excused };
  }, [students, marks]);

  const alertPreview = useMemo(() => {
    // Preview is based on current UI state.
    // Server still enforces opt-in + consent; this is only a preview.
    const absentees = students.filter((s) => (marks[s.id]?.status || "PRESENT") === "ABSENT");

    const fever = students.filter((s) => {
      const t = health[s.id]?.temperatureC;
      const isFever = typeof t === "number" && t >= FEVER_THRESHOLD;
      const notAbsent = (marks[s.id]?.status || "PRESENT") !== "ABSENT";
      return isFever && notAbsent;
    });

    return { absentees, fever, total: absentees.length + fever.length };
  }, [students, marks, health]);

  const canSave = !!session && !loading && !saving && !locked && dirty;

  // Production-grade gating:
  // - If dirty or last save failed, prevent Close/Certify/Notify from becoming a trap.
  const canClose =
    !!session && !loading && !mutating && !saving && !isCertified && !isClosed && !dirty && !saveErr;

  const canCertify =
    !!session && !loading && !mutating && !saving && !isCertified && isClosed && !dirty && !saveErr;

  const canReopen =
    !!session && !loading && !mutating && !saving && !isCertified && isClosed; // reopen is allowed

  const canNotify =
    !!session &&
    !loading &&
    !notifying &&
    !mutating &&
    !saving &&
    (isClosed || isCertified) &&
    !dirty &&
    !saveErr &&
    alertPreview.total > 0;

  function notifyDisabledReason(): string | null {
    if (!session) return "Session not loaded.";
    if (loading) return "Loading session…";
    if (!(isClosed || isCertified)) return "Close or certify the session first.";
    if (dirty) return "You have unsaved changes. Save first.";
    if (saveErr) return "Last save failed. Fix save first.";
    if (alertPreview.total === 0) return "No absentees or fever cases to notify.";
    if (saving) return "Saving…";
    if (mutating) return "Processing…";
    if (notifying) return "Notifying…";
    return null;
  }

  async function saveAll() {
    if (!session) return;

    setSaving(true);
    setSaveMsg(null);
    setSaveErr(null);

    try {
      if (locked) throw new Error("Session is locked (closed/certified).");

      // Use current UI state
      const markItems = students.map((s) => ({
        studentId: s.id,
        status: (marks[s.id]?.status || "PRESENT") as AttendanceStatus,
        note: trimOrNull(marks[s.id]?.note),
      }));

      const r1 = await fetch("/api/teacher/attendance/marks/upsert", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: session.id, items: markItems }),
      });

      const j1: SaveMarksResponse = await r1.json().catch(() => ({
        ok: false,
        error: "Failed to parse marks save response.",
      }));

      if (!r1.ok || !j1.ok) throw new Error(j1.ok ? `HTTP ${r1.status}` : j1.error);

      const healthItems = students.map((s) => ({
        studentId: s.id,
        temperatureC: health[s.id]?.temperatureC ?? null,
        symptoms: trimOrNull(health[s.id]?.symptoms),
        notes: trimOrNull(health[s.id]?.notes),
      }));

      const r2 = await fetch("/api/teacher/attendance/health/upsert", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: session.id, items: healthItems }),
      });

      const j2: SaveHealthResponse = await r2.json().catch(() => ({
        ok: false,
        error: "Failed to parse health save response.",
      }));

      if (!r2.ok || !j2.ok) throw new Error(j2.ok ? `HTTP ${r2.status}` : j2.error);

      const now = new Date();
      setLastSaveAt(now.toLocaleTimeString());
      setSaveMsg(
        j2.blockedStudentIds.length
          ? `Saved. Health blocked for ${j2.blockedStudentIds.length} learner(s) missing consent.`
          : "Saved."
      );

      // Reload from server to reset baseline and remove dirty
      await load();
    } catch (e: unknown) {
      const msg = safeText((e as { message?: unknown })?.message) || "Save failed.";
      setSaveErr(msg);
      setSaveMsg(null);
    } finally {
      setSaving(false);
    }
  }

  async function mutate(action: "close" | "certify" | "reopen") {
    if (!session) return;

    setMutating(true);
    setMutMsg(null);
    setMutErr(null);

    try {
      // Guardrails: prevent "close after failed save" confusion
      if ((action === "close" || action === "certify") && dirty) {
        throw new Error("You have unsaved changes. Save before closing/certifying.");
      }
      if ((action === "close" || action === "certify") && saveErr) {
        throw new Error("Last save failed. Fix save first (do not close/certify).");
      }

      const r = await fetch(`/api/teacher/attendance/sessions/${action}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: session.id }),
      });

      const j: MutateResponse = await r.json().catch(() => ({
        ok: false,
        error: "Failed to parse session mutate response.",
      }));

      if (!r.ok || !j.ok) throw new Error(j.ok ? `HTTP ${r.status}` : j.error);

      setSession(j.session);
      setMutMsg(
        action === "close" ? "Session closed." : action === "certify" ? "Session certified." : "Session reopened."
      );

      await load();
    } catch (e: unknown) {
      setMutErr(safeText((e as { message?: unknown })?.message) || "Action failed.");
    } finally {
      setMutating(false);
    }
  }

  async function closeThenNotify() {
    // One click: Save -> Close -> Notify (with guardrails)
    if (!session) return;

    setMutErr(null);
    setNotifyErr(null);
    setNotifyMsg(null);

    // Must not be locked
    if (locked) {
      setMutErr("Session is locked (closed/certified).");
      return;
    }

    // If dirty, save first
    if (dirty) {
      await saveAll();
      // if save failed, saveErr will be set and load() not reset baseline
      if (saveErr) return;
    }
    // Close
    await mutate("close");
    // Notify
    await notifyParents();
  }

  async function notifyParents() {
    if (!session) return;

    setNotifying(true);
    setNotifyMsg(null);
    setNotifyErr(null);

    try {
      if (!isClosed && !isCertified) throw new Error("Close or certify the session before notifications.");
      if (dirty) throw new Error("You have unsaved changes. Save first.");
      if (saveErr) throw new Error("Last save failed. Fix save first.");
      if (alertPreview.total === 0) throw new Error("No absentees or fever cases to notify.");

      const sender = (brand || "EDULIFE").trim() || "EDULIFE";

      const r = await fetch("/api/teacher/attendance/notify-parents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: session.id, brand: sender }),
      });

      const j: NotifyResponse = await r.json().catch(() => ({
        ok: false,
        error: "Failed to parse notify response.",
      }));

      if (!r.ok || !j.ok) throw new Error(j.ok ? `HTTP ${r.status}` : j.error);

      setNotifyMsg(
        `Processed ${j.successCount}/${j.total}${j.testMode ? " (TEST MODE)" : ""}${j.note ? ` — ${j.note}` : ""}.`
      );

      await load();
    } catch (e: unknown) {
      setNotifyErr(safeText((e as { message?: unknown })?.message) || "Notify failed.");
    } finally {
      setNotifying(false);
    }
  }

  function statusPill() {
    const base = "inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold";
    if (isCertified) return `${base} border-indigo-200 bg-indigo-50 text-indigo-800`;
    if (isClosed) return `${base} border-rose-200 bg-rose-50 text-rose-800`;
    return `${base} border-amber-200 bg-amber-50 text-amber-800`;
  }

  const backHref = `/teacher/attendance?brand=${encodeURIComponent((brand || "EDULIFE").trim() || "EDULIFE")}`;

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto w-full max-w-6xl px-4 py-6 md:py-8 space-y-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="space-y-1">
              <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Attendance Session</h1>
              <p className="text-sm text-slate-600">
                Mark attendance & daily health. <b>Save</b> first. Then <b>Close</b> to lock. <b>Certify</b> to finalize.
              </p>

              {session ? (
                <p className="mt-2 text-sm text-slate-700">
                  <span className="font-semibold">{classLabel}</span> • {session.date}{" "}
                  <span className={statusPill()}>{isCertified ? "CERTIFIED" : isClosed ? "CLOSED" : "OPEN"}</span>
                  {dirty ? <span className="ml-2 text-[11px] text-amber-700">• Unsaved changes</span> : null}
                  {lastSaveAt ? <span className="ml-2 text-[11px] text-slate-500">• Last save: {lastSaveAt}</span> : null}
                </p>
              ) : null}

              <p className="text-[11px] text-slate-500 font-mono">
                Session: {sessionId} • Teacher: {teacherUserId.slice(0, 8)}… • Tenant: {tenantId.slice(0, 8)}…
              </p>
            </div>

            <div className="flex flex-wrap gap-2 md:justify-end">
              <Link
                href={backHref}
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-[11px] hover:bg-slate-50"
              >
                Back
              </Link>

              <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1">
                <span className="text-[11px] text-slate-600">Sender</span>
                <input
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  disabled={loading}
                  className="w-32 rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px]"
                  placeholder="EDULIFE"
                />
              </div>

              <button
                type="button"
                onClick={() => void saveAll()}
                disabled={!canSave}
                className="rounded-md bg-sky-700 px-3 py-2 text-[11px] font-semibold text-white hover:bg-sky-800 disabled:opacity-60"
                title={
                  locked
                    ? "Session is locked."
                    : !dirty
                    ? "No changes to save."
                    : saveErr
                    ? "Fix the save error and try again."
                    : "Save changes"
                }
              >
                {saving ? "Saving…" : "Save"}
              </button>

              <button
                type="button"
                onClick={() => void mutate("close")}
                disabled={!canClose}
                className="rounded-md bg-rose-600 px-3 py-2 text-[11px] font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
                title={
                  locked
                    ? "Session is locked."
                    : dirty
                    ? "Save changes first."
                    : saveErr
                    ? "Last save failed."
                    : "Close session"
                }
              >
                Close
              </button>

              <button
                type="button"
                onClick={() => void mutate("certify")}
                disabled={!canCertify}
                className="rounded-md bg-slate-900 px-3 py-2 text-[11px] font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                title={
                  isCertified
                    ? "Already certified."
                    : !isClosed
                    ? "Close first."
                    : dirty
                    ? "Save changes first."
                    : saveErr
                    ? "Last save failed."
                    : "Certify session"
                }
              >
                Certify
              </button>

              <button
                type="button"
                onClick={() => void mutate("reopen")}
                disabled={!canReopen}
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-[11px] hover:bg-slate-50 disabled:opacity-60"
                title={isCertified ? "Cannot reopen a certified session." : "Reopen session"}
              >
                Reopen
              </button>

              <button
                type="button"
                onClick={() => void closeThenNotify()}
                disabled={loading || !session || saving || mutating || notifying || isCertified || isClosed ? true : false}
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-[11px] hover:bg-slate-50 disabled:opacity-60"
                title="Save, close, and notify in one click (only works while OPEN)"
              >
                Close + Notify
              </button>
            </div>
          </div>

          {err ? (
            <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{err}</div>
          ) : null}

          {saveErr ? (
            <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
              <b>Save failed:</b> {saveErr}
              <div className="mt-1 text-[11px] text-rose-700">
                Fix this before closing/certifying — otherwise the server won’t have your marks and Notify will do nothing.
              </div>
            </div>
          ) : null}

          {saveMsg ? (
            <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              {saveMsg}
            </div>
          ) : null}

          {mutErr ? (
            <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{mutErr}</div>
          ) : null}

          {mutMsg ? (
            <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              {mutMsg}
            </div>
          ) : null}

          {notifyErr ? (
            <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
              {notifyErr}
            </div>
          ) : null}

          {notifyMsg ? (
            <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              {notifyMsg}
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2 text-[11px]">
            <span className="rounded-full border bg-white px-3 py-1 text-slate-700">
              Total: <b>{counts.total}</b>
            </span>
            <span className="rounded-full border bg-emerald-50 px-3 py-1 text-emerald-800">
              Present: <b>{counts.present}</b>
            </span>
            <span className="rounded-full border bg-amber-50 px-3 py-1 text-amber-800">
              Late: <b>{counts.late}</b>
            </span>
            <span className="rounded-full border bg-rose-50 px-3 py-1 text-rose-800">
              Absent: <b>{counts.absent}</b>
            </span>
            <span className="rounded-full border bg-slate-50 px-3 py-1 text-slate-700">
              Excused: <b>{counts.excused}</b>
            </span>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-900">Notification preview</div>
              <div className="text-[11px] text-slate-600">
                Absentees: <b>{alertPreview.absentees.length}</b> • Fever: <b>{alertPreview.fever.length}</b>
                <span className="ml-2 text-[11px] text-slate-500">• (Preview only; server enforces opt-in + consent)</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void notifyParents()}
              disabled={!canNotify}
              className="rounded-md bg-slate-900 px-4 py-2 text-[11px] font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
              title={notifyDisabledReason() ?? "Notify eligible parents"}
            >
              {notifying ? "Processing…" : "Notify parents"}
            </button>
          </div>

          {!canNotify ? (
            <div className="mt-3 text-[11px] text-slate-600">
              <span className="font-semibold">Why disabled:</span> {notifyDisabledReason() || "—"}
            </div>
          ) : null}

          <div className="mt-3 text-[11px] text-slate-600">
            Notifications require guardian phone + SMS opt-in. Health alerts also require recorded consent.
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
          {loading ? (
            <div className="p-4 text-sm text-slate-600">Loading learners…</div>
          ) : students.length === 0 ? (
            <div className="p-4 text-sm text-slate-600">No learners found for this classroom.</div>
          ) : (
            <table className="min-w-[1200px] w-full text-sm">
              <thead className="bg-slate-50">
                <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:text-left [&>th]:text-[11px] [&>th]:font-semibold text-slate-700">
                  <th>Learner</th>
                  <th>Status</th>
                  <th>Mark note</th>
                  <th>Temp (°C)</th>
                  <th>Symptoms</th>
                  <th>Health notes</th>
                </tr>
              </thead>

              <tbody className="divide-y">
                {students.map((s) => {
                  const m = marks[s.id] || { status: "PRESENT" as AttendanceStatus, note: null };
                  const h = health[s.id] || { temperatureC: null, symptoms: null, notes: null };

                  const hasConsent = !!s.healthConsentAt;
                  const fever = typeof h.temperatureC === "number" && h.temperatureC >= FEVER_THRESHOLD;

                  return (
                    <tr key={s.id} className="[&>td]:px-3 [&>td]:py-2 align-top">
                      <td>
                        <div className="font-medium text-slate-900">{fullName(s)}</div>
                        <div className="text-[11px] text-slate-500">
                          {s.guardianName || "—"} • {s.guardianPhone || "—"}
                          {s.guardianSmsOptIn ? "" : " • (no SMS opt-in)"}
                          {hasConsent ? "" : " • (no health consent)"}
                        </div>

                        {fever ? (
                          <div className="mt-1 inline-flex rounded-md border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] text-rose-800">
                            Fever ≥ {FEVER_THRESHOLD}°C
                          </div>
                        ) : null}
                      </td>

                      <td className="min-w-[360px]">
                        <div className="flex flex-wrap gap-2">
                          {(["PRESENT", "LATE", "ABSENT", "EXCUSED"] as AttendanceStatus[]).map((opt) => (
                            <button
                              key={opt}
                              type="button"
                              disabled={locked}
                              onClick={() =>
                                setMarks((prev) => ({
                                  ...prev,
                                  [s.id]: { ...m, status: opt },
                                }))
                              }
                              className={[
                                "rounded-full border px-3 py-1 text-[11px] font-semibold",
                                m.status === opt
                                  ? opt === "PRESENT"
                                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                                    : opt === "LATE"
                                    ? "border-amber-200 bg-amber-50 text-amber-800"
                                    : opt === "ABSENT"
                                    ? "border-rose-200 bg-rose-50 text-rose-800"
                                    : "border-slate-200 bg-slate-50 text-slate-700"
                                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                              ].join(" ")}
                            >
                              {opt}
                            </button>
                          ))}
                        </div>
                      </td>

                      <td className="min-w-[260px]">
                        <input
                          type="text"
                          disabled={locked}
                          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-50"
                          value={m.note ?? ""}
                          onChange={(e) =>
                            setMarks((prev) => ({
                              ...prev,
                              [s.id]: { ...m, note: e.target.value || null },
                            }))
                          }
                          placeholder={locked ? "Locked" : "Optional attendance note"}
                        />
                      </td>

                      <td>
                        <input
                          type="number"
                          disabled={locked || !hasConsent}
                          step="0.1"
                          min={34}
                          max={42}
                          className="w-28 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-50"
                          value={typeof h.temperatureC === "number" ? h.temperatureC : ""}
                          onChange={(e) => {
                            const v = e.target.value;
                            const num = v === "" ? null : Number(v);
                            setHealth((prev) => ({
                              ...prev,
                              [s.id]: {
                                ...h,
                                temperatureC: typeof num === "number" && Number.isFinite(num) ? num : null,
                              },
                            }));
                          }}
                          placeholder={locked ? "Locked" : hasConsent ? "36.7" : "No consent"}
                        />
                      </td>

                      <td className="min-w-[260px]">
                        <input
                          type="text"
                          disabled={locked || !hasConsent}
                          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-50"
                          value={h.symptoms ?? ""}
                          onChange={(e) =>
                            setHealth((prev) => ({
                              ...prev,
                              [s.id]: { ...h, symptoms: e.target.value || null },
                            }))
                          }
                          placeholder={locked ? "Locked" : hasConsent ? "e.g. cough, headache" : "No consent"}
                        />
                      </td>

                      <td className="min-w-[280px]">
                        <input
                          type="text"
                          disabled={locked || !hasConsent}
                          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-50"
                          value={h.notes ?? ""}
                          onChange={(e) =>
                            setHealth((prev) => ({
                              ...prev,
                              [s.id]: { ...h, notes: e.target.value || null },
                            }))
                          }
                          placeholder={locked ? "Locked" : hasConsent ? "Optional health notes" : "No consent"}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </main>
  );
}
