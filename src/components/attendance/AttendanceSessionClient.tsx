// src/components/attendance/AttendanceSessionClient.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

type AttendanceStatus = "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";
type AttendanceDisplayStatus = AttendanceStatus | "UNMARKED";

type ApiErr = { ok: false; error: string };

type SessionDTO = {
  id: string;
  tenantId: string;
  classroomId: string;
  date: string;
  dateISO?: string;
  isClosed: boolean;
  closedAt: string | null;
  certifiedAt: string | null;
  certifiedByUserId?: string | null;
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
  name?: string;
  guardianName: string | null;
  guardianPhone: string | null;
  guardianSmsOptIn: boolean;
  healthConsentAt?: string | null;
  attendance: {
    markId?: string | null;
    isMarked?: boolean;
    status: AttendanceDisplayStatus;
    note: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
  };
};

type SessionSummaryDTO = {
  students: number;
  total?: number;
  marked: number;
  unmarked: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
};

type GetOk = {
  ok: true;
  mode?: string;
  healthCaptureEnabled?: boolean;
  session: SessionDTO;
  classroom: ClassroomDTO | null;
  classLabel: string;
  summary?: SessionSummaryDTO;
  students: StudentRowDTO[];
};

type GetResponse = GetOk | ApiErr;

type SaveMarksOk = {
  ok: true;
  count: number;
  createdCount?: number;
  updatedCount?: number;
  unchangedCount?: number;
  correctionCount?: number;
};

type SaveMarksResponse = SaveMarksOk | ApiErr;

type MutateOk = { ok: true; session: SessionDTO };
type MutateResponse = MutateOk | ApiErr;

type NotifyOk = {
  ok: true;
  alreadyNotified?: boolean;
  notifiedAt?: string;
  absentCount: number;
  eligibleCount: number;
  successCount: number;
  sentCount?: number;
  skippedCount: number;
  failedCount: number;
  skippedNoOptIn: number;
  skippedNoPhone: number;
  skippedNotActive?: number;
  brand?: string;
  testMode?: boolean;
  summaryText?: string;
  note?: string;
};

type NotifyResponse = NotifyOk | ApiErr;

type QrScanOk = {
  ok: true;
  status: "ACCEPTED" | "DUPLICATE" | "REJECTED";
  duplicate?: boolean;
  studentId?: string;
  studentName?: string;
  attendanceStatus?: AttendanceStatus;
  message?: string;
};

type QrScanResponse = QrScanOk | ApiErr;

type MarkState = {
  status: AttendanceDisplayStatus;
  note: string | null;
};

const shellCard =
  "rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] shadow-[0_18px_60px_rgba(0,0,0,0.18)] backdrop-blur-xl";
const tinyFieldClass =
  "w-full rounded-lg border border-white/10 bg-[#07111F] px-3 py-2 text-sm text-[#F7F4ED] placeholder:text-[#738095] focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/20 disabled:opacity-60";
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

function fullName(s: { firstName: string; lastName: string; name?: string }) {
  return s.name || [s.firstName, s.lastName].filter(Boolean).join(" ").trim() || "Unnamed learner";
}

function isRealAttendanceStatus(status: AttendanceDisplayStatus): status is AttendanceStatus {
  return status === "PRESENT" || status === "ABSENT" || status === "LATE" || status === "EXCUSED";
}

function Banner(props: { tone: "ok" | "error" | "info" | "warn"; children: React.ReactNode }) {
  const cls =
    props.tone === "ok"
      ? "border-emerald-300/20 bg-emerald-400/12 text-emerald-100"
      : props.tone === "error"
        ? "border-rose-300/20 bg-rose-400/12 text-rose-100"
        : props.tone === "warn"
          ? "border-amber-300/20 bg-amber-400/12 text-amber-100"
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

function statusButtonClass(active: boolean, status: AttendanceStatus) {
  if (!active) return "border-white/10 bg-white/5 text-[#D7DCE5] hover:bg-white/10";

  if (status === "PRESENT") return "border-emerald-300/20 bg-emerald-400/12 text-emerald-100";
  if (status === "LATE") return "border-amber-300/20 bg-amber-400/12 text-amber-100";
  if (status === "ABSENT") return "border-rose-300/20 bg-rose-400/12 text-rose-100";

  return "border-white/10 bg-white/10 text-[#F7F4ED]";
}

function notifyLine(j: NotifyOk) {
  if (j.alreadyNotified) {
    return `Already notified${j.notifiedAt ? ` at ${new Date(j.notifiedAt).toLocaleString()}` : ""}.`;
  }

  const sent = j.sentCount ?? j.successCount;
  return (
    j.summaryText ||
    `Absent: ${j.absentCount}. SMS eligible: ${j.eligibleCount}. Sent: ${sent}. Skipped: ${j.skippedCount}. Failed: ${j.failedCount}.`
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
  const [brand, setBrand] = useState<string>((props.initialBrand || "EDULIFEOS").trim() || "EDULIFEOS");

  const [marks, setMarks] = useState<Record<string, MarkState>>({});
  const baselineMarksRef = useRef<Record<string, MarkState>>({});

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

  const [qrToken, setQrToken] = useState("");
  const [qrBusy, setQrBusy] = useState(false);
  const [qrMsg, setQrMsg] = useState<string | null>(null);
  const [qrErr, setQrErr] = useState<string | null>(null);

  const isCertified = !!session?.certifiedAt;
  const isClosed = !!session?.isClosed;
  const locked = isCertified || isClosed;

  async function load() {
    setLoading(true);
    setErr(null);

    try {
      const r = await fetch(`/api/teacher/attendance/sessions/get?sessionId=${encodeURIComponent(sessionId)}`, {
        cache: "no-store",
      });

      const j: GetResponse = await r.json().catch(() => ({
        ok: false,
        error: "Failed to parse session response.",
      }));

      if (!r.ok || !j.ok) throw new Error(j.ok ? `HTTP ${r.status}` : j.error);

      setSession(j.session);
      setClassLabel(j.classLabel || props.initialClassName || "Class");
      setStudents(Array.isArray(j.students) ? j.students : []);

      const nextMarks: Record<string, MarkState> = {};

      for (const student of j.students) {
        const status = student.attendance?.status ?? "UNMARKED";
        nextMarks[student.id] = {
          status,
          note: student.attendance?.note ?? null,
        };
      }

      setMarks(nextMarks);
      baselineMarksRef.current = nextMarks;

      setSaveMsg(null);
      setSaveErr(null);
      setMutMsg(null);
      setMutErr(null);
      setNotifyMsg(null);
      setNotifyErr(null);
      setQrMsg(null);
      setQrErr(null);
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
    const baseline = baselineMarksRef.current;

    for (const student of students) {
      const id = student.id;
      const current = marks[id] ?? { status: "UNMARKED", note: null };
      const old = baseline[id] ?? { status: "UNMARKED", note: null };

      if (current.status !== old.status) return true;
      if ((current.note ?? "") !== (old.note ?? "")) return true;
    }

    return false;
  }, [students, marks]);

  const counts = useMemo(() => {
    let present = 0;
    let absent = 0;
    let late = 0;
    let excused = 0;
    let unmarked = 0;

    for (const student of students) {
      const status = marks[student.id]?.status ?? "UNMARKED";

      if (status === "PRESENT") present += 1;
      else if (status === "ABSENT") absent += 1;
      else if (status === "LATE") late += 1;
      else if (status === "EXCUSED") excused += 1;
      else unmarked += 1;
    }

    const total = students.length;
    const marked = present + absent + late + excused;

    return { total, marked, unmarked, present, absent, late, excused };
  }, [students, marks]);

  function markRemainingPresent() {
    if (locked || loading || students.length === 0 || counts.unmarked === 0) return;

    setSaveErr(null);
    setSaveMsg(null);
    setMutErr(null);
    setMutMsg(null);

    setMarks((prev) => {
      const next: Record<string, MarkState> = { ...prev };

      for (const student of students) {
        const current = next[student.id] ?? { status: "UNMARKED", note: null };

        // Bank-grade safety:
        // Only UNMARKED learners are moved to PRESENT.
        // Existing ABSENT/LATE/EXCUSED marks are never overwritten.
        if (current.status === "UNMARKED") {
          next[student.id] = {
            ...current,
            status: "PRESENT",
          };
        }
      }

      return next;
    });
  }

  const alertPreview = useMemo(() => {
    const absentees = students.filter((student) => marks[student.id]?.status === "ABSENT");
    const eligible = absentees.filter(
      (student) => student.guardianSmsOptIn && !!(student.guardianPhone || "").trim()
    );
    const skippedNoOptIn = absentees.filter((student) => !student.guardianSmsOptIn).length;
    const skippedNoPhone = absentees.filter(
      (student) => student.guardianSmsOptIn && !(student.guardianPhone || "").trim()
    ).length;

    return {
      absentees,
      eligible,
      total: absentees.length,
      skippedNoOptIn,
      skippedNoPhone,
    };
  }, [students, marks]);

  const canSave = !!session && !loading && !saving && !locked && dirty;

  const canClose =
    !!session &&
    !loading &&
    !mutating &&
    !saving &&
    !isCertified &&
    !isClosed &&
    !dirty &&
    !saveErr &&
    counts.unmarked === 0;

  const canCertify =
    !!session &&
    !loading &&
    !mutating &&
    !saving &&
    !isCertified &&
    isClosed &&
    !dirty &&
    !saveErr &&
    counts.unmarked === 0;

  const canReopen = !!session && !loading && !mutating && !saving && !isCertified && isClosed;

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

  const canScanQr =
    !!session &&
    !loading &&
    !locked &&
    !dirty &&
    !saveErr &&
    !saving &&
    !mutating &&
    !qrBusy &&
    qrToken.trim().length >= 16;

  function closeDisabledReason(): string | null {
    if (!session) return "Session not loaded.";
    if (locked) return "Session is already locked.";
    if (dirty) return "Save changes first.";
    if (saveErr) return "Last save failed.";
    if (counts.unmarked > 0) return `${counts.unmarked} learner(s) are still unmarked.`;
    if (saving) return "Saving…";
    if (mutating) return "Processing…";
    return null;
  }

  function notifyDisabledReason(): string | null {
    if (!session) return "Session not loaded.";
    if (loading) return "Loading session…";
    if (!(isClosed || isCertified)) return "Close or certify the session first.";
    if (dirty) return "You have unsaved changes. Save first.";
    if (saveErr) return "Last save failed. Fix save first.";
    if (alertPreview.total === 0) return "No absent learners to notify.";
    if (saving) return "Saving…";
    if (mutating) return "Processing…";
    if (notifying) return "Notifying…";
    return null;
  }

  function qrDisabledReason(): string | null {
    if (!session) return "Session not loaded.";
    if (loading) return "Loading session…";
    if (locked) return "Closed or certified sessions cannot accept QR scans.";
    if (dirty) return "Save manual changes before scanning.";
    if (saveErr) return "Last save failed. Fix save first.";
    if (saving) return "Saving…";
    if (mutating) return "Processing…";
    if (qrBusy) return "Scanning…";
    if (qrToken.trim().length < 16) return "Scan or paste a valid badge QR payload.";
    return null;
  }

  async function saveAll(): Promise<boolean> {
    if (!session) return false;

    setSaving(true);
    setSaveMsg(null);
    setSaveErr(null);

    try {
      if (locked) throw new Error("Session is locked (closed/certified).");

      const markItems = students
        .map((student) => ({
          studentId: student.id,
          status: marks[student.id]?.status ?? "UNMARKED",
          note: trimOrNull(marks[student.id]?.note),
        }))
        .filter((item): item is { studentId: string; status: AttendanceStatus; note: string | null } =>
          isRealAttendanceStatus(item.status)
        );

      if (!markItems.length) {
        throw new Error("No learners have been marked yet. Mark at least one learner before saving.");
      }

      const r = await fetch("/api/teacher/attendance/marks/upsert", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: session.id, items: markItems }),
      });

      const j: SaveMarksResponse = await r.json().catch(() => ({
        ok: false,
        error: "Failed to parse marks save response.",
      }));

      if (!r.ok || !j.ok) throw new Error(j.ok ? `HTTP ${r.status}` : j.error);

      const now = new Date();
      setLastSaveAt(now.toLocaleTimeString());
      setSaveMsg(
        `Saved ${j.count} mark(s). Created: ${j.createdCount ?? 0}, updated: ${
          j.updatedCount ?? 0
        }, unchanged: ${j.unchangedCount ?? 0}.`
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

      if ((action === "close" || action === "certify") && counts.unmarked > 0) {
        throw new Error(`${counts.unmarked} learner(s) are still unmarked.`);
      }

      let payload: { sessionId: string; reason?: string } = { sessionId: session.id };

      if (action === "reopen") {
        const reason = window.prompt("Why are you reopening this attendance session?");
        const cleanReason = reason?.trim() ?? "";

        if (!cleanReason) {
          throw new Error("Reopen cancelled. A reason is required.");
        }

        if (cleanReason.length < 8) {
          throw new Error("A clearer reopen reason is required.");
        }

        payload = { sessionId: session.id, reason: cleanReason };
      }

      const r = await fetch(`/api/teacher/attendance/sessions/${action}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
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
      if (alertPreview.total === 0) throw new Error("No absent learners to notify.");

      const sender = (brand || "EDULIFEOS").trim() || "EDULIFEOS";

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

      setNotifyMsg(`${notifyLine(j)}${j.testMode ? " (TEST MODE)" : ""}`);

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

    if (counts.unmarked > 0) {
      setMutErr(`${counts.unmarked} learner(s) are still unmarked. Mark all learners before closing.`);
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

  async function scanQrBadge() {
    if (!session) return;

    setQrBusy(true);
    setQrMsg(null);
    setQrErr(null);

    try {
      const reason = qrDisabledReason();
      if (reason) throw new Error(reason);

      const r = await fetch("/api/teacher/attendance/qr/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: session.id, token: qrToken.trim() }),
      });

      const j: QrScanResponse = await r.json().catch(() => ({
        ok: false,
        error: "Failed to parse QR scan response.",
      }));

      if (!r.ok || !j.ok) throw new Error(j.ok ? `HTTP ${r.status}` : j.error);

      setQrMsg(j.message || `${j.studentName || "Learner"} scanned successfully.`);
      setQrToken("");
      await load();
    } catch (e: unknown) {
      setQrErr(safeText((e as { message?: unknown })?.message) || "QR scan failed.");
    } finally {
      setQrBusy(false);
    }
  }

  function statusPill() {
    const base = "inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold";
    if (isCertified) return `${base} border-indigo-300/20 bg-indigo-400/12 text-indigo-100`;
    if (isClosed) return `${base} border-rose-300/20 bg-rose-400/12 text-rose-100`;
    return `${base} border-amber-300/20 bg-amber-400/12 text-amber-100`;
  }

  const backHref = `/teacher/attendance?brand=${encodeURIComponent((brand || "EDULIFEOS").trim() || "EDULIFEOS")}`;

  return (
    <section className="space-y-6">
      <section className={`${shellCard} p-5 md:p-6`}>
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center rounded-full border border-[#E8C96A]/25 bg-[#D4AF37]/10 px-3 py-1 text-[11px] font-medium text-[#E8C96A]">
              EduLife OS · Manual Attendance
            </div>

            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-[#F7F4ED]">Attendance Session</h1>
              <p className="mt-1 text-sm text-[#C9CDD6]">
                Mark every learner. Save changes. Close only when no learner remains unmarked.
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
                placeholder="EDULIFEOS"
              />
            </div>

            <button
              type="button"
              onClick={markRemainingPresent}
              disabled={locked || loading || saving || mutating || counts.unmarked === 0}
              className={ghostBtn}
              title="Marks only UNMARKED learners as PRESENT. Existing ABSENT, LATE, and EXCUSED marks are not changed."
            >
              Mark remaining PRESENT{counts.unmarked > 0 ? ` (${counts.unmarked})` : ""}
            </button>

            <button type="button" onClick={() => void saveAll()} disabled={!canSave} className={primaryBtn}>
              {saving ? "Saving…" : "Save"}
            </button>

            <button
              type="button"
              onClick={() => void mutate("close")}
              disabled={!canClose}
              className={ghostBtn}
              title={closeDisabledReason() ?? "Close session"}
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
                    : counts.unmarked > 0
                      ? "Mark all learners first."
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
              title={isCertified ? "Cannot reopen a certified session." : "Reopen with reason"}
            >
              Reopen
            </button>

            <button
              type="button"
              onClick={() => void closeThenNotify()}
              disabled={loading || !session || saving || mutating || notifying || isCertified || isClosed}
              className={ghostBtn}
              title="Save, close, and notify eligible parents"
            >
              Close + Notify
            </button>
          </div>
        </div>
      </section>

      {err ? <Banner tone="error">{err}</Banner> : null}

      {counts.unmarked > 0 && !locked ? (
        <Banner tone="warn">
          <b>{counts.unmarked} learner(s) are still unmarked.</b> You may save partial marks, but you cannot close or
          certify until every learner is marked.
        </Banner>
      ) : null}

      {saveErr ? (
        <Banner tone="error">
          <b>Save failed:</b> {saveErr}
          <div className="mt-1 text-[11px] text-rose-200">
            Fix this before closing or certifying. Otherwise the server will not have your latest marks.
          </div>
        </Banner>
      ) : null}

      {saveMsg ? <Banner tone="ok">{saveMsg}</Banner> : null}
      {mutErr ? <Banner tone="error">{mutErr}</Banner> : null}
      {mutMsg ? <Banner tone="info">{mutMsg}</Banner> : null}
      {notifyErr ? <Banner tone="error">{notifyErr}</Banner> : null}
      {notifyMsg ? <Banner tone="info">{notifyMsg}</Banner> : null}
      {qrErr ? <Banner tone="error">{qrErr}</Banner> : null}
      {qrMsg ? <Banner tone="ok">{qrMsg}</Banner> : null}

      <section className={`${shellCard} p-5 md:p-6`}>
        <div className="flex flex-wrap gap-2 text-[11px]">
          <CountChip label="Total" value={counts.total} />
          <CountChip label="Marked" value={counts.marked} />
          <CountChip label="Unmarked" value={counts.unmarked} tone={counts.unmarked ? "warn" : "good"} />
          <CountChip label="Present" value={counts.present} tone="good" />
          <CountChip label="Late" value={counts.late} tone="warn" />
          <CountChip label="Absent" value={counts.absent} tone="bad" />
          <CountChip label="Excused" value={counts.excused} />
        </div>
      </section>

      <section className={`${shellCard} p-5 md:p-6`}>
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-[#F7F4ED]">QR badge attendance backup</div>
            <div className="mt-1 text-[11px] text-[#C9CDD6]">
              Scan or paste a learner badge payload. QR marks PRESENT only, writes to the same attendance register, and
              never captures health data. Manual edits remain available for corrections.
            </div>

            <input
              type="text"
              value={qrToken}
              onChange={(e) => setQrToken(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canScanQr) void scanQrBadge();
              }}
              disabled={locked || loading || qrBusy}
              className={`${tinyFieldClass} mt-3 font-mono`}
              placeholder="Scan badge or paste EDULIFEOS-ATT-V1:..."
              autoComplete="off"
            />
          </div>

          <button
            type="button"
            onClick={() => void scanQrBadge()}
            disabled={!canScanQr}
            className={primaryBtn}
            title={qrDisabledReason() ?? "Mark learner PRESENT by QR"}
          >
            {qrBusy ? "Scanning…" : "Scan QR"}
          </button>
        </div>

        {!canScanQr ? (
          <div className="mt-3 text-[11px] text-[#AEB6C4]">
            <span className="font-semibold text-[#F7F4ED]">Why disabled:</span> {qrDisabledReason() || "—"}
          </div>
        ) : null}
      </section>

      <section className={`${shellCard} p-5 md:p-6`}>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-sm font-semibold text-[#F7F4ED]">Notification preview</div>
            <div className="text-[11px] text-[#C9CDD6]">
              Absent: <b>{alertPreview.absentees.length}</b> • SMS eligible: <b>{alertPreview.eligible.length}</b> •
              Skipped no opt-in: <b>{alertPreview.skippedNoOptIn}</b> • Skipped no phone:{" "}
              <b>{alertPreview.skippedNoPhone}</b>
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
          Notifications require guardian phone and SMS opt-in. Learners without opt-in are skipped and reported.
        </div>
      </section>

      <section className={`${shellCard} overflow-hidden`}>
        {loading ? (
          <div className="p-4 text-sm text-[#C9CDD6]">Loading learners…</div>
        ) : students.length === 0 ? (
          <div className="p-4 text-sm text-[#C9CDD6]">No learners found for this classroom.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[920px] w-full text-sm">
              <thead className="bg-white/5">
                <tr className="[&>th]:px-3 [&>th]:py-3 [&>th]:text-left [&>th]:text-[11px] [&>th]:font-semibold text-[#C9CDD6]">
                  <th>Learner</th>
                  <th>Status</th>
                  <th>Mark note</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-white/10">
                {students.map((student) => {
                  const mark = marks[student.id] ?? { status: "UNMARKED", note: null };
                  const unmarked = mark.status === "UNMARKED";

                  return (
                    <tr key={student.id} className="[&>td]:px-3 [&>td]:py-3 align-top odd:bg-transparent even:bg-white/[0.02]">
                      <td>
                        <div className="font-medium text-[#F7F4ED]">{fullName(student)}</div>
                        <div className="text-[11px] text-[#8F98A8]">
                          {student.guardianName || "—"} • {student.guardianPhone || "—"}
                          {student.guardianSmsOptIn ? "" : " • (no SMS opt-in)"}
                        </div>

                        {unmarked ? (
                          <div className="mt-1 inline-flex rounded-lg border border-amber-300/20 bg-amber-400/12 px-2 py-0.5 text-[11px] text-amber-100">
                            UNMARKED
                          </div>
                        ) : null}
                      </td>

                      <td className="min-w-[360px]">
                        <div className="flex flex-wrap gap-2">
                          {(["PRESENT", "LATE", "ABSENT", "EXCUSED"] as AttendanceStatus[]).map((option) => (
                            <button
                              key={option}
                              type="button"
                              disabled={locked}
                              onClick={() =>
                                setMarks((prev) => ({
                                  ...prev,
                                  [student.id]: { ...mark, status: option },
                                }))
                              }
                              className={[
                                "rounded-full border px-3 py-1 text-[11px] font-semibold transition disabled:opacity-60",
                                statusButtonClass(mark.status === option, option),
                              ].join(" ")}
                            >
                              {option}
                            </button>
                          ))}
                        </div>
                      </td>

                      <td className="min-w-[260px]">
                        <input
                          type="text"
                          disabled={locked}
                          className={tinyFieldClass}
                          value={mark.note ?? ""}
                          onChange={(e) =>
                            setMarks((prev) => ({
                              ...prev,
                              [student.id]: { ...mark, note: e.target.value || null },
                            }))
                          }
                          placeholder={locked ? "Locked" : "Optional attendance note"}
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