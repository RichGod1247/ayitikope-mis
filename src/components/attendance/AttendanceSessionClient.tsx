// src/components/attendance/AttendanceSessionClient.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

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

type NotifyOk = { ok: true; total: number; successCount: number; brand?: string; testMode?: boolean };
type NotifyResponse = NotifyOk | ApiErr;

const FEVER_THRESHOLD = 37.8;

function safeText(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function fullName(s: { firstName: string; lastName: string }) {
  return [s.firstName, s.lastName].filter(Boolean).join(" ").trim();
}

export default function AttendanceSessionClient(props: {
  tenantId: string;
  teacherUserId: string;
  sessionId: string;
  initialClassName: string;
  initialDate: string;
  initialBrand: string;
}) {
  const { tenantId, teacherUserId, sessionId, initialBrand } = props;

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [session, setSession] = useState<SessionDTO | null>(null);
  const [classLabel, setClassLabel] = useState<string>(props.initialClassName || "Class");
  const [students, setStudents] = useState<StudentRowDTO[]>([]);

  const [marks, setMarks] = useState<Record<string, { status: AttendanceStatus; note: string | null }>>({});
  const [health, setHealth] = useState<
    Record<string, { temperatureC: number | null; symptoms: string | null; notes: string | null }>
  >({});

  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const [mutating, setMutating] = useState(false);
  const [mutMsg, setMutMsg] = useState<string | null>(null);

  const [notifying, setNotifying] = useState(false);
  const [notifyMsg, setNotifyMsg] = useState<string | null>(null);

  const locked = !!session?.certifiedAt || !!session?.isClosed;

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

      const nextMarks: Record<string, { status: AttendanceStatus; note: string | null }> = {};
      const nextHealth: Record<string, { temperatureC: number | null; symptoms: string | null; notes: string | null }> =
        {};

      for (const s of j.students) {
        nextMarks[s.id] = { status: s.attendance?.status || "PRESENT", note: s.attendance?.note ?? null };
        nextHealth[s.id] = {
          temperatureC: s.health?.temperatureC ?? null,
          symptoms: s.health?.symptoms ?? null,
          notes: s.health?.notes ?? null,
        };
      }

      setMarks(nextMarks);
      setHealth(nextHealth);

      setSaveMsg(null);
      setMutMsg(null);
      setNotifyMsg(null);
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

  async function saveAll() {
    if (!session) return;

    setSaving(true);
    setSaveMsg(null);

    try {
      if (locked) throw new Error("Session is locked (closed/certified).");

      const markItems = students.map((s) => ({
        studentId: s.id,
        status: (marks[s.id]?.status || "PRESENT") as AttendanceStatus,
        note: marks[s.id]?.note ?? null,
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
        symptoms: health[s.id]?.symptoms ?? null,
        notes: health[s.id]?.notes ?? null,
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

      setSaveMsg(
        j2.blockedStudentIds.length
          ? `Saved. Health blocked for ${j2.blockedStudentIds.length} learner(s) missing consent.`
          : "Saved."
      );

      await load();
    } catch (e: unknown) {
      setSaveMsg(safeText((e as { message?: unknown })?.message) || "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function mutate(action: "close" | "certify" | "reopen") {
    if (!session) return;

    setMutating(true);
    setMutMsg(null);

    try {
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
      setMutMsg(action === "close" ? "Session closed." : action === "certify" ? "Session certified." : "Session reopened.");
      await load();
    } catch (e: unknown) {
      setMutMsg(safeText((e as { message?: unknown })?.message) || "Action failed.");
    } finally {
      setMutating(false);
    }
  }

  async function notifyParents() {
    if (!session) return;

    setNotifying(true);
    setNotifyMsg(null);

    try {
      if (!session.isClosed && !session.certifiedAt) {
        throw new Error("Close or certify the session before notifications.");
      }
      if (alertPreview.total === 0) {
        throw new Error("No absentees or fever cases to notify.");
      }

      const r = await fetch("/api/teacher/attendance/notify-parents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: session.id, brand: initialBrand }),
      });

      const j: NotifyResponse = await r.json().catch(() => ({
        ok: false,
        error: "Failed to parse notify response.",
      }));
      if (!r.ok || !j.ok) throw new Error(j.ok ? `HTTP ${r.status}` : j.error);

      setNotifyMsg(`Processed ${j.successCount}/${j.total}${j.testMode ? " (TEST MODE)" : ""}.`);
      await load();
    } catch (e: unknown) {
      setNotifyMsg(safeText((e as { message?: unknown })?.message) || "Notify failed.");
    } finally {
      setNotifying(false);
    }
  }

  function statusPill() {
    const base = "inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold";
    if (session?.certifiedAt) return `${base} border-indigo-200 bg-indigo-50 text-indigo-800`;
    if (session?.isClosed) return `${base} border-rose-200 bg-rose-50 text-rose-800`;
    return `${base} border-amber-200 bg-amber-50 text-amber-800`;
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto w-full max-w-6xl px-4 py-6 md:py-8 space-y-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Attendance Session</h1>
              <p className="mt-1 text-sm text-slate-600">Mark attendance and daily health. Close to lock. Certify to finalize.</p>

              {session ? (
                <p className="mt-2 text-sm text-slate-700">
                  <span className="font-semibold">{classLabel}</span> • {session.date}{" "}
                  <span className={statusPill()}>
                    {session.certifiedAt ? "CERTIFIED" : session.isClosed ? "CLOSED" : "OPEN"}
                  </span>
                </p>
              ) : null}

              <p className="mt-1 text-[11px] text-slate-500 font-mono">
                Session: {sessionId} • Teacher: {teacherUserId.slice(0, 8)}… • Tenant: {tenantId.slice(0, 8)}…
              </p>
            </div>

            <div className="flex flex-wrap gap-2 md:justify-end">
              <Link href="/teacher/attendance" className="rounded-md border border-slate-300 bg-white px-3 py-2 text-[11px] hover:bg-slate-50">
                Back
              </Link>

              <button
                type="button"
                onClick={() => void saveAll()}
                disabled={saving || locked || loading || !session}
                className="rounded-md bg-sky-700 px-3 py-2 text-[11px] font-semibold text-white hover:bg-sky-800 disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save"}
              </button>

              <button
                type="button"
                onClick={() => void mutate("close")}
                disabled={mutating || loading || !session || session.isClosed || !!session.certifiedAt}
                className="rounded-md bg-rose-600 px-3 py-2 text-[11px] font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
              >
                Close
              </button>

              <button
                type="button"
                onClick={() => void mutate("certify")}
                disabled={mutating || loading || !session || !session.isClosed || !!session.certifiedAt}
                className="rounded-md bg-slate-900 px-3 py-2 text-[11px] font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
              >
                Certify
              </button>

              <button
                type="button"
                onClick={() => void mutate("reopen")}
                disabled={mutating || loading || !session || !session.isClosed || !!session.certifiedAt}
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-[11px] hover:bg-slate-50 disabled:opacity-60"
              >
                Reopen
              </button>
            </div>
          </div>

          {err ? (
            <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
              {err}
            </div>
          ) : null}

          {saveMsg ? (
            <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              {saveMsg}
            </div>
          ) : null}

          {mutMsg ? (
            <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              {mutMsg}
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
              </div>
            </div>

            <button
              type="button"
              onClick={() => void notifyParents()}
              disabled={
                notifying ||
                loading ||
                !session ||
                (!session.isClosed && !session.certifiedAt) ||
                alertPreview.total === 0
              }
              className="rounded-md bg-slate-900 px-4 py-2 text-[11px] font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {notifying ? "Processing…" : "Notify parents"}
            </button>
          </div>

          <div className="mt-3 text-[11px] text-slate-600">
            Notifications require guardian phone + SMS opt-in. Health alerts require recorded consent.
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
