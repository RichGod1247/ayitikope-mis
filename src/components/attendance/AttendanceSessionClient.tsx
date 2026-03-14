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
  date: string;
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

const shellCard =
  "rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] shadow-[0_18px_60px_rgba(0,0,0,0.18)] backdrop-blur-xl";
const innerCard = "rounded-[22px] border border-white/10 bg-[#07111F]/80";
const fieldClass =
  "w-full rounded-xl border border-white/10 bg-[#07111F] px-3 py-2 text-sm text-[#F7F4ED] placeholder:text-[#738095] focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/20 disabled:opacity-60";
const tinyFieldClass =
  "w-full rounded-lg border border-white/10 bg-[#07111F] px-3 py-2 text-sm text-[#F7F4ED] placeholder:text-[#738095] focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/20 disabled:opacity-60";
const labelClass = "block text-[11px] font-medium text-[#C9CDD6]";
const subtleText = "text-[11px] text-[#AEB6C4]";
const primaryBtn =
  "inline-flex items-center justify-center rounded-xl bg-[linear-gradient(135deg,#D4AF37,#E8C96A)] px-4 py-2 text-sm font-semibold text-[#071A3D] shadow-[0_18px_50px_rgba(212,175,55,0.22)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60";
const ghostBtn =
  "inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-[#F7F4ED] transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60";

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

function Banner(props: { tone: "ok" | "error" | "info"; children: React.ReactNode }) {
  const cls =
    props.tone === "ok"
      ? "border-emerald-300/20 bg-emerald-400/12 text-emerald-100"
      : props.tone === "error"
      ? "border-rose-300/20 bg-rose-400/12 text-rose-100"
      : "border-white/10 bg-white/5 text-[#D7DCE5]";

  return <div className={`rounded-2xl border px-4 py-3 text-sm ${cls}`}>{props.children}</div>;
}

function CountChip(props: { label: string; value: number; tone?: "neutral" | "good" | "warn" | "bad" }) {
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

  const canClose =
    !!session && !loading && !mutating && !saving && !isCertified && !isClosed && !dirty && !saveErr;

  const canCertify =
    !!session && !loading && !mutating && !saving && !isCertified && isClosed && !dirty && !saveErr;

  const canReopen =
    !!session && !loading && !mutating && !saving && !isCertified && isClosed;

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

  async function saveAll(): Promise<boolean> {
    if (!session) return false;

    setSaving(true);
    setSaveMsg(null);
    setSaveErr(null);

    try {
      if (locked) throw new Error("Session is locked (closed/certified).");

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

      await load();
      return true;
    } catch (e: unknown) {
      const msg = safeText((e as { message?: unknown })?.message) || "Save failed.";
      setSaveErr(msg);
      setSaveMsg(null);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function mutate(action: "close" | "certify" | "reopen"): Promise<boolean> {
    if (!session) return false;

    setMutating(true);
    setMutMsg(null);
    setMutErr(null);

    try {
      if ((action === "close" || action === "certify") && dirty) {
        throw new Error("You have unsaved changes. Save before closing/certifying.");
      }
      if ((action === "close" || action === "certify") && saveErr) {
        throw new Error("Last save failed. Fix save first.");
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
      return true;
    } catch (e: unknown) {
      setMutErr(safeText((e as { message?: unknown })?.message) || "Action failed.");
      return false;
    } finally {
      setMutating(false);
    }
  }

  async function notifyParents(): Promise<boolean> {
    if (!session) return false;

    setNotifying(true);
    setNotifyMsg(null);
    setNotifyErr(null);

    try {
      if (!session.isClosed && !session.certifiedAt) {
        throw new Error("Close or certify the session before notifications.");
      }
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
      return true;
    } catch (e: unknown) {
      setNotifyErr(safeText((e as { message?: unknown })?.message) || "Notify failed.");
      return false;
    } finally {
      setNotifying(false);
    }
  }

  async function closeThenNotify() {
    if (!session) return;

    setMutErr(null);
    setNotifyErr(null);
    setNotifyMsg(null);
    setSaveErr(null);

    if (locked) {
      setMutErr("Session is locked (closed/certified).");
      return;
    }

    let ok = true;

    if (dirty) {
      ok = await saveAll();
    }

    if (!ok) return;

    ok = await mutate("close");
    if (!ok) return;

    await notifyParents();
  }

  function statusPill() {
    const base = "inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold";
    if (isCertified) return `${base} border-indigo-300/20 bg-indigo-400/12 text-indigo-100`;
    if (isClosed) return `${base} border-rose-300/20 bg-rose-400/12 text-rose-100`;
    return `${base} border-amber-300/20 bg-amber-400/12 text-amber-100`;
  }

  const backHref = `/teacher/attendance?brand=${encodeURIComponent((brand || "EDULIFE").trim() || "EDULIFE")}`;

  return (
    <section className="space-y-6">
      <section className={`${shellCard} p-5 md:p-6`}>
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center rounded-full border border-[#E8C96A]/25 bg-[#D4AF37]/10 px-3 py-1 text-[11px] font-medium text-[#E8C96A]">
              EduLife OS · Attendance Session
            </div>

            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-[#F7F4ED]">
                Attendance Session
              </h1>
              <p className="mt-1 text-sm text-[#C9CDD6]">
                Mark attendance and daily health. Save first. Then close to lock. Certify only when final.
              </p>
            </div>

            {session ? (
              <p className="text-sm text-[#D7DCE5]">
                <span className="font-semibold text-[#F7F4ED]">{classLabel}</span> • {session.date}{" "}
                <span className={statusPill()}>{isCertified ? "CERTIFIED" : isClosed ? "CLOSED" : "OPEN"}</span>
                {dirty ? <span className="ml-2 text-[11px] text-amber-200">• Unsaved changes</span> : null}
                {lastSaveAt ? <span className="ml-2 text-[11px] text-[#8F98A8]">• Last save: {lastSaveAt}</span> : null}
              </p>
            ) : null}

            <p className="text-[11px] font-mono text-[#8F98A8]">
              Session: {sessionId} • Teacher: {teacherUserId.slice(0, 8)}… • Tenant: {tenantId.slice(0, 8)}…
            </p>
          </div>

          <div className="flex flex-wrap gap-2 md:justify-end">
            <Link href={backHref} className={ghostBtn}>
              Back
            </Link>

            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-2 py-1">
              <span className="text-[11px] text-[#C9CDD6]">Sender</span>
              <input
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                disabled={loading}
                className="w-32 rounded-lg border border-white/10 bg-[#07111F] px-2 py-1 text-[11px] text-[#F7F4ED]"
                placeholder="EDULIFE"
              />
            </div>

            <button
              type="button"
              onClick={() => void saveAll()}
              disabled={!canSave}
              className={primaryBtn}
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
              className={ghostBtn}
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
              className={ghostBtn}
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
              className={ghostBtn}
              title={isCertified ? "Cannot reopen a certified session." : "Reopen session"}
            >
              Reopen
            </button>

            <button
              type="button"
              onClick={() => void closeThenNotify()}
              disabled={loading || !session || saving || mutating || notifying || isCertified || isClosed}
              className={ghostBtn}
              title="Save, close, and notify in one click while session is OPEN"
            >
              Close + Notify
            </button>
          </div>
        </div>
      </section>

      {err ? <Banner tone="error">{err}</Banner> : null}

      {saveErr ? (
        <Banner tone="error">
          <b>Save failed:</b> {saveErr}
          <div className="mt-1 text-[11px] text-rose-200">
            Fix this before closing or certifying. Otherwise the server will not have your latest marks and health data.
          </div>
        </Banner>
      ) : null}

      {saveMsg ? <Banner tone="ok">{saveMsg}</Banner> : null}
      {mutErr ? <Banner tone="error">{mutErr}</Banner> : null}
      {mutMsg ? <Banner tone="info">{mutMsg}</Banner> : null}
      {notifyErr ? <Banner tone="error">{notifyErr}</Banner> : null}
      {notifyMsg ? <Banner tone="info">{notifyMsg}</Banner> : null}

      <section className={`${shellCard} p-5 md:p-6`}>
        <div className="flex flex-wrap gap-2 text-[11px]">
          <CountChip label="Total" value={counts.total} />
          <CountChip label="Present" value={counts.present} tone="good" />
          <CountChip label="Late" value={counts.late} tone="warn" />
          <CountChip label="Absent" value={counts.absent} tone="bad" />
          <CountChip label="Excused" value={counts.excused} />
        </div>
      </section>

      <section className={`${shellCard} p-5 md:p-6`}>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-sm font-semibold text-[#F7F4ED]">Notification preview</div>
            <div className="text-[11px] text-[#C9CDD6]">
              Absentees: <b>{alertPreview.absentees.length}</b> • Fever: <b>{alertPreview.fever.length}</b>
              <span className="ml-2 text-[#8F98A8]">• Preview only; server still enforces opt-in and consent.</span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void notifyParents()}
            disabled={!canNotify}
            className={primaryBtn}
            title={notifyDisabledReason() ?? "Notify eligible parents"}
          >
            {notifying ? "Processing…" : "Notify parents"}
          </button>
        </div>

        {!canNotify ? (
          <div className="mt-3 text-[11px] text-[#AEB6C4]">
            <span className="font-semibold text-[#F7F4ED]">Why disabled:</span> {notifyDisabledReason() || "—"}
          </div>
        ) : null}

        <div className="mt-3 text-[11px] text-[#AEB6C4]">
          Notifications require guardian phone and SMS opt-in. Health alerts also require recorded consent.
        </div>
      </section>

      <section className={`${shellCard} overflow-hidden`}>
        {loading ? (
          <div className="p-4 text-sm text-[#C9CDD6]">Loading learners…</div>
        ) : students.length === 0 ? (
          <div className="p-4 text-sm text-[#C9CDD6]">No learners found for this classroom.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[1200px] w-full text-sm">
              <thead className="bg-white/5">
                <tr className="[&>th]:px-3 [&>th]:py-3 [&>th]:text-left [&>th]:text-[11px] [&>th]:font-semibold text-[#C9CDD6]">
                  <th>Learner</th>
                  <th>Status</th>
                  <th>Mark note</th>
                  <th>Temp (°C)</th>
                  <th>Symptoms</th>
                  <th>Health notes</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-white/10">
                {students.map((s) => {
                  const m = marks[s.id] || { status: "PRESENT" as AttendanceStatus, note: null };
                  const h = health[s.id] || { temperatureC: null, symptoms: null, notes: null };

                  const hasConsent = !!s.healthConsentAt;
                  const fever = typeof h.temperatureC === "number" && h.temperatureC >= FEVER_THRESHOLD;

                  return (
                    <tr key={s.id} className="[&>td]:px-3 [&>td]:py-3 align-top odd:bg-transparent even:bg-white/[0.02]">
                      <td>
                        <div className="font-medium text-[#F7F4ED]">{fullName(s)}</div>
                        <div className="text-[11px] text-[#8F98A8]">
                          {s.guardianName || "—"} • {s.guardianPhone || "—"}
                          {s.guardianSmsOptIn ? "" : " • (no SMS opt-in)"}
                          {hasConsent ? "" : " • (no health consent)"}
                        </div>

                        {fever ? (
                          <div className="mt-1 inline-flex rounded-lg border border-rose-300/20 bg-rose-400/12 px-2 py-0.5 text-[11px] text-rose-100">
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
                                "rounded-full border px-3 py-1 text-[11px] font-semibold transition disabled:opacity-60",
                                m.status === opt
                                  ? opt === "PRESENT"
                                    ? "border-emerald-300/20 bg-emerald-400/12 text-emerald-100"
                                    : opt === "LATE"
                                    ? "border-amber-300/20 bg-amber-400/12 text-amber-100"
                                    : opt === "ABSENT"
                                    ? "border-rose-300/20 bg-rose-400/12 text-rose-100"
                                    : "border-white/10 bg-white/10 text-[#F7F4ED]"
                                  : "border-white/10 bg-white/5 text-[#D7DCE5] hover:bg-white/10",
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
                          className={tinyFieldClass}
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
                          className="w-28 rounded-lg border border-white/10 bg-[#07111F] px-3 py-2 text-sm text-[#F7F4ED] disabled:opacity-60"
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
                          className={tinyFieldClass}
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
                          className={tinyFieldClass}
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
          </div>
        )}
      </section>
    </section>
  );
}