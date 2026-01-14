// src/components/teacher/TeacherAttendanceClient.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type ApiErr = { ok: false; error: string };
type OpenOk = { ok: true; sessionId: string };
type OpenResponse = OpenOk | ApiErr;

type ClassItem = { id: string; label: string };

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function safeText(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export default function TeacherAttendanceClient(props: {
  tenantId: string;
  teacherUserId: string;
  initialBrand?: string;
}) {
  const router = useRouter();

  const [date, setDate] = useState<string>(isoToday());
  const [brand, setBrand] = useState<string>((props.initialBrand || "EDULIFE").trim() || "EDULIFE");

  const [classOptions, setClassOptions] = useState<ClassItem[]>([]);
  const [classroomId, setClassroomId] = useState<string>("");

  const [loadingClasses, setLoadingClasses] = useState(false);
  const [openLoading, setOpenLoading] = useState(false);

  const [msg, setMsg] = useState<string | null>(null);

  async function loadClasses() {
    setLoadingClasses(true);
    setMsg(null);

    try {
      // NOTE: If you later harden this endpoint to use auth-only, remove tenantId from query.
      const r = await fetch(`/api/classrooms/list?tenantId=${encodeURIComponent(props.tenantId)}&mode=single`, {
        cache: "no-store",
      });
      const j = (await r.json().catch(() => ({}))) as { items?: Array<{ id?: unknown; label?: unknown }> };

      if (!r.ok) throw new Error(`Failed to load classes (HTTP ${r.status}).`);

      const items = Array.isArray(j.items)
        ? j.items
            .map((x) => ({
              id: safeText(x.id),
              label: safeText(x.label),
            }))
            .filter((x) => x.id && x.label)
        : [];

      setClassOptions(items);
      if (!classroomId && items.length) setClassroomId(items[0].id);
      if (items.length === 0) setMsg("No classrooms available. Contact your administrator.");
    } catch (e: unknown) {
      setClassOptions([]);
      setClassroomId("");
      setMsg(safeText((e as { message?: unknown })?.message) || "Failed to load classrooms.");
    } finally {
      setLoadingClasses(false);
    }
  }

  useEffect(() => {
    void loadClasses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.tenantId]);

  const classroomLabel = useMemo(() => {
    return classOptions.find((c) => c.id === classroomId)?.label || "Class";
  }, [classOptions, classroomId]);

  async function openSession() {
    if (!classroomId) {
      setMsg("Select a classroom.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setMsg("Invalid date. Use YYYY-MM-DD.");
      return;
    }

    setOpenLoading(true);
    setMsg(null);

    try {
      const r = await fetch("/api/teacher/attendance/sessions/open", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ classroomId, date }),
      });

      const j: OpenResponse = await r.json().catch(() => ({
        ok: false,
        error: "Failed to parse open-session response.",
      }));

      if (!r.ok || !j.ok) throw new Error(j.ok ? `HTTP ${r.status}` : j.error);

      const href =
        `/teacher/attendance/${encodeURIComponent(j.sessionId)}` +
        `?className=${encodeURIComponent(classroomLabel)}` +
        `&date=${encodeURIComponent(date)}` +
        `&brand=${encodeURIComponent(brand || "EDULIFE")}`;

      router.push(href);
    } catch (e: unknown) {
      setMsg(safeText((e as { message?: unknown })?.message) || "Failed to open session.");
    } finally {
      setOpenLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto w-full max-w-3xl px-4 py-6 md:py-10 space-y-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Attendance</h1>
            <p className="mt-1 text-sm text-slate-600">Open today’s session for a class, then mark attendance and health.</p>
            <p className="mt-2 text-[11px] text-slate-500 font-mono">
              Teacher: {props.teacherUserId.slice(0, 8)}… • Tenant: {props.tenantId.slice(0, 8)}…
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">Date</label>
              <input
                type="date"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">Brand (Sender ID)</label>
              <input
                type="text"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="EDULIFE"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">Classroom</label>

              {loadingClasses ? (
                <div className="h-10 rounded-lg border border-slate-200 bg-slate-50 animate-pulse" />
              ) : classOptions.length ? (
                <select
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  value={classroomId}
                  onChange={(e) => setClassroomId(e.target.value)}
                >
                  {classOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  No classrooms available.
                </div>
              )}
            </div>
          </div>

          {msg ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
              {msg}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void openSession()}
              disabled={openLoading || loadingClasses || !classroomId}
              className="rounded-lg bg-slate-900 px-4 py-2 text-[12px] font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {openLoading ? "Opening…" : "Open session"}
            </button>

            <button
              type="button"
              onClick={() => void loadClasses()}
              disabled={loadingClasses}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-[12px] hover:bg-slate-50 disabled:opacity-60"
            >
              Reload classes
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
