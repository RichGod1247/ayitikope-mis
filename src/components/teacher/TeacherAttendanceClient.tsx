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
  sessionId?: string;
  dateISO: string; // YYYY-MM-DD
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

export default function TeacherAttendanceClient({
  tenantId,
  teacherUserId,
}: {
  tenantId: string;
  teacherUserId?: string;
}) {
  const router = useRouter();

  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [classroomId, setClassroomId] = useState<string>("");
  const [dateISO, setDateISO] = useState<string>(todayISO());

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [summary, setSummary] = useState<Summary | null>(null);
  const [summaryErr, setSummaryErr] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  const [opening, setOpening] = useState(false);
  const [openErr, setOpenErr] = useState<string | null>(null);

  const classLabel = useMemo(() => {
    const c = classrooms.find((x) => x.id === classroomId);
    if (!c) return "";
    const bits = [c.name, c.grade || "", c.arm || ""].filter(Boolean);
    return bits.join(" • ");
  }, [classrooms, classroomId]);

  async function loadClassrooms() {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch(
        `/api/teacher/classrooms/list?tenantId=${encodeURIComponent(tenantId)}`,
        { cache: "no-store" }
      );
      const j: ListClassroomsResponse = await r.json().catch(() => ({
        ok: false,
        error: "Failed to parse classrooms response.",
      }));
      if (!r.ok || !j.ok) throw new Error(j.ok ? `HTTP ${r.status}` : j.error);

      setClassrooms(j.classrooms || []);
      if (!classroomId && j.classrooms?.[0]?.id) setClassroomId(j.classrooms[0].id);
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
      if (!tenantId) throw new Error("Missing tenant.");
      if (!classroomId) throw new Error("Select a classroom.");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) throw new Error("Invalid date.");

      const r = await fetch(
        `/api/teacher/attendance/sessions/summary?tenantId=${encodeURIComponent(
          tenantId
        )}&classroomId=${encodeURIComponent(classroomId)}&dateISO=${encodeURIComponent(dateISO)}`,
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

  async function openOrGo() {
    setOpening(true);
    setOpenErr(null);
    try {
      if (summary?.sessionId) {
        router.push(`/teacher/attendance/${encodeURIComponent(summary.sessionId)}`);
        return;
      }

      const r = await fetch(`/api/teacher/attendance/sessions/open`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenantId, classroomId, dateISO }),
      });
      const j: OpenResponse = await r.json().catch(() => ({
        ok: false,
        error: "Failed to parse open response.",
      }));
      if (!r.ok || !j.ok) throw new Error(j.ok ? `HTTP ${r.status}` : j.error);

      router.push(`/teacher/attendance/${encodeURIComponent(j.sessionId)}`);
    } catch (e: any) {
      setOpenErr(safeText(e?.message) || "Failed to open session.");
    } finally {
      setOpening(false);
    }
  }

  useEffect(() => {
    void loadClassrooms();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId || !classroomId || !dateISO) return;
    void loadSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, classroomId, dateISO]);

  function statePill(state: SummaryState) {
    const base = "inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold";
    if (state === "CERTIFIED") return `${base} border-indigo-200 bg-indigo-50 text-indigo-800`;
    if (state === "CLOSED") return `${base} border-rose-200 bg-rose-50 text-rose-800`;
    if (state === "OPEN") return `${base} border-amber-200 bg-amber-50 text-amber-800`;
    return `${base} border-slate-200 bg-slate-50 text-slate-700`;
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto w-full max-w-6xl px-4 py-6 md:py-8 space-y-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Attendance</h1>
              <p className="mt-1 text-sm text-slate-600">
                Select a class and date. Open or resume the session to mark learners.
              </p>
              {teacherUserId ? (
                <p className="mt-1 text-[11px] text-slate-500 font-mono">
                  Teacher: {teacherUserId.slice(0, 8)}… • Tenant: {tenantId.slice(0, 8)}…
                </p>
              ) : null}
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void loadClassrooms()}
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-[11px] hover:bg-slate-50"
                disabled={loading}
              >
                Refresh
              </button>
              <Link
                href="/teacher-portal"
                className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-[11px] text-sky-800 hover:bg-sky-100"
              >
                Back
              </Link>
            </div>
          </div>
        </section>

        {err ? (
          <section className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            {err}
          </section>
        ) : null}

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1">
              <label className="block text-[11px] font-medium text-slate-700">Date</label>
              <input
                type="date"
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                value={dateISO}
                onChange={(e) => setDateISO(e.target.value)}
                disabled={loading}
              />
            </div>

            <div className="space-y-1">
              <label className="block text-[11px] font-medium text-slate-700">Classroom</label>
              <select
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                value={classroomId}
                onChange={(e) => setClassroomId(e.target.value)}
                disabled={loading || classrooms.length === 0}
              >
                {classrooms.length === 0 ? (
                  <option value="">No assigned classrooms</option>
                ) : (
                  classrooms.map((c) => (
                    <option key={c.id} value={c.id}>
                      {[c.name, c.grade, c.arm].filter(Boolean).join(" • ")}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div className="flex items-end">
              <button
                type="button"
                onClick={() => void openOrGo()}
                disabled={opening || summaryLoading || !classroomId}
                className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {opening ? "Working…" : summary?.sessionId ? "Go to session" : "Open session"}
              </button>
            </div>
          </div>

          {openErr ? (
            <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
              {openErr}
            </div>
          ) : null}

          <div className="rounded-lg border border-slate-100 p-4">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div className="text-sm">
                <div className="text-slate-900 font-semibold">{classLabel || "—"}</div>
                <div className="text-[11px] text-slate-600">{dateISO}</div>
              </div>

              {summaryLoading ? (
                <div className="text-sm text-slate-600">Loading summary…</div>
              ) : summaryErr ? (
                <div className="text-sm text-rose-800">{summaryErr}</div>
              ) : summary ? (
                <div className="flex flex-wrap items-center gap-2 text-[11px]">
                  <span className={statePill(summary.state)}>{summary.state}</span>
                  <span className="rounded-full border bg-white px-3 py-1 text-slate-700">
                    Total: <b>{summary.totals.students}</b>
                  </span>
                  <span className="rounded-full border bg-emerald-50 px-3 py-1 text-emerald-800">
                    Present: <b>{summary.totals.present}</b>
                  </span>
                  <span className="rounded-full border bg-amber-50 px-3 py-1 text-amber-800">
                    Late: <b>{summary.totals.late}</b>
                  </span>
                  <span className="rounded-full border bg-rose-50 px-3 py-1 text-rose-800">
                    Absent: <b>{summary.totals.absent}</b>
                  </span>
                  <span className="rounded-full border bg-slate-50 px-3 py-1 text-slate-700">
                    Excused: <b>{summary.totals.excused}</b>
                  </span>
                </div>
              ) : (
                <div className="text-sm text-slate-600">—</div>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
