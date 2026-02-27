// src/components/teacher/AttendanceSessionClient.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type ApiErr = { ok: false; error: string; detail?: string };

type Classroom = {
  id: string;
  name: string;
  grade?: string | null;
  arm?: string | null;
};

type ListClassroomsResponse = ({ ok: true; classrooms: Classroom[] } & Record<string, unknown>) | ApiErr;

type OpenResponse =
  | ({ ok: true; sessionId: string } & Record<string, unknown>)
  | ({ sessionId: string } & Record<string, unknown>)
  | ApiErr;

type TenantLite = {
  id: string;
  name: string;
  slug: string | null;
  schoolCode: string | null;
  status: string | null;
};

type MeOk = {
  ok: true;
  userId: string;
  email: string | null;
  name: string | null;
  tenantId: string;
  activeTenantId: string;
  tenant: TenantLite | null;
  activeTenant: TenantLite | null;
  roleName: string | null;
  effectiveRole: string | null;
  staffId: string | null;
};

type MeResp = MeOk | ApiErr;

type ClassItem = { id: string; label: string };

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function safeText(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function buildClassLabel(c: Classroom): string {
  return [c.name, c.grade, c.arm].filter(Boolean).join(" • ") || c.name || "Class";
}

function useMe() {
  const [data, setData] = useState<MeResp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const r = await fetch("/api/me", { cache: "no-store" });
        const j = (await r.json().catch(() => ({ ok: false, error: "BAD_JSON" }))) as MeResp;
        if (alive) setData(j);
      } catch {
        if (alive) setData({ ok: false, error: "NETWORK_ERROR" });
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  return { data, loading };
}

export default function AttendanceSessionClient(props: {
  // legacy props (keep so callers don’t break)
  tenantId?: string;
  teacherUserId?: string;
  initialBrand?: string;
}) {
  const router = useRouter();
  const { data: me, loading: meLoading } = useMe();

  const [dateISO, setDateISO] = useState<string>(isoToday());
  const [brand, setBrand] = useState<string>((props.initialBrand || "EDULIFE").trim() || "EDULIFE");

  const [classOptions, setClassOptions] = useState<ClassItem[]>([]);
  const [classroomId, setClassroomId] = useState<string>("");

  const [loadingClasses, setLoadingClasses] = useState(false);
  const [openLoading, setOpenLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const tenantName = me && me.ok ? (me.tenant?.name ?? null) : null;
  const userShort = me && me.ok ? `${me.userId.slice(0, 8)}…` : "";

  async function loadClasses() {
    setLoadingClasses(true);
    setMsg(null);

    try {
      // ✅ Auth-only. Server derives tenant from session.
      const r = await fetch("/api/teacher/classrooms/list", { cache: "no-store" });
      const j = (await r.json().catch(() => ({
        ok: false,
        error: "Failed to parse classrooms response.",
      }))) as ListClassroomsResponse;

      if (!r.ok || !("ok" in j) || (j as any).ok !== true) {
        const err = (j as any)?.error ? String((j as any).error) : `HTTP ${r.status}`;
        throw new Error(err);
      }

      const rooms = Array.isArray((j as any).classrooms) ? ((j as any).classrooms as Classroom[]) : [];
      const items: ClassItem[] = rooms
        .map((c) => ({ id: safeText(c.id), label: buildClassLabel(c) }))
        .filter((x) => x.id && x.label);

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
    if (meLoading) return;
    if (!me || !me.ok) return;
    void loadClasses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meLoading, me && me.ok ? me.tenantId : ""]);

  const classroomLabel = useMemo(() => {
    return classOptions.find((c) => c.id === classroomId)?.label || "Class";
  }, [classOptions, classroomId]);

  async function openSession() {
    if (!classroomId) {
      setMsg("Select a classroom.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) {
      setMsg("Invalid date. Use YYYY-MM-DD.");
      return;
    }

    setOpenLoading(true);
    setMsg(null);

    try {
      const r = await fetch("/api/teacher/attendance/sessions/open", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ classroomId, dateISO, date: dateISO }),
      });

      const raw = (await r.json().catch(() => ({}))) as OpenResponse;

      const sessionId =
        typeof (raw as any)?.sessionId === "string"
          ? String((raw as any).sessionId)
          : (raw as any)?.ok === true && typeof (raw as any)?.sessionId === "string"
          ? String((raw as any).sessionId)
          : "";

      if (!r.ok || !sessionId) {
        const err = (raw as any)?.error ? String((raw as any).error) : `HTTP ${r.status}`;
        throw new Error(err);
      }

      const href =
        `/teacher/attendance/${encodeURIComponent(sessionId)}` +
        `?className=${encodeURIComponent(classroomLabel)}` +
        `&date=${encodeURIComponent(dateISO)}` +
        `&brand=${encodeURIComponent(brand || "EDULIFE")}`;

      router.push(href);
    } catch (e: unknown) {
      setMsg(safeText((e as { message?: unknown })?.message) || "Failed to open session.");
    } finally {
      setOpenLoading(false);
    }
  }

  if (meLoading) {
    return (
      <main className="min-h-screen bg-slate-50">
        <div className="mx-auto w-full max-w-3xl px-4 py-10">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm text-slate-600">Loading your session…</p>
          </section>
        </div>
      </main>
    );
  }

  if (!me || !me.ok) {
    const err = (me as any)?.error ?? "UNKNOWN";
    return (
      <main className="min-h-screen bg-slate-50">
        <div className="mx-auto w-full max-w-3xl px-4 py-10 space-y-4">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-2">
            <h1 className="text-xl font-extrabold text-slate-900">Attendance</h1>
            <p className="text-sm text-slate-700">
              Can’t load your session context ({String(err)}). Go to the gateway or sign in again.
            </p>
            <div className="flex flex-wrap gap-2 pt-2">
              <a
                href="/app"
                className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-2 text-[12px] font-semibold text-sky-900 hover:bg-sky-100"
              >
                Go to /app
              </a>
              <a
                href="/auth/signin"
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-[12px] font-semibold text-slate-900 hover:bg-slate-50"
              >
                Sign in
              </a>
              <button
                type="button"
                onClick={() => location.reload()}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-[12px] hover:bg-slate-50"
              >
                Refresh
              </button>
            </div>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto w-full max-w-3xl px-4 py-6 md:py-10 space-y-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Attendance</h1>
            <p className="mt-1 text-sm text-slate-600">Open today’s session for a class, then mark attendance and health.</p>

            <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-600">
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                User: <span className="font-mono">{userShort}</span>
              </span>
              {tenantName ? (
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                  School: <span className="font-medium">{tenantName}</span>
                </span>
              ) : null}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">Date</label>
              <input
                type="date"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                value={dateISO}
                onChange={(e) => setDateISO(e.target.value)}
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
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{msg}</div>
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
