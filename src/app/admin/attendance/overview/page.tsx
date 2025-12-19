// src/app/admin/attendance/overview/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type Tenant = {
  id: string;
  name: string;
  slug?: string | null;
};

type ClassroomOption = {
  id: string;
  label: string;
};

type SessionState = "NONE" | "OPEN" | "CLOSED" | "CERTIFIED";

type ClassSummary = {
  classroomId: string;
  classLabel: string;
  state: SessionState;
  total: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
};

const btnBase =
  "inline-flex items-center justify-center h-9 px-3 rounded-xl border text-sm shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const btnPrimary = `${btnBase} bg-black text-white border-black hover:bg-zinc-800`;
const btnOutline = `${btnBase} bg-white text-zinc-900 border-zinc-300 hover:bg-zinc-50`;

function statusBadge(state: SessionState) {
  const base = "inline-flex items-center px-2 py-0.5 rounded-full border text-[11px]";
  if (state === "CERTIFIED")
    return `${base} bg-indigo-50 border-indigo-200 text-indigo-800`;
  if (state === "CLOSED")
    return `${base} bg-emerald-50 border-emerald-200 text-emerald-800`;
  if (state === "OPEN")
    return `${base} bg-amber-50 border-amber-200 text-amber-800`;
  return `${base} bg-zinc-50 border-zinc-200 text-zinc-700`;
}

export default function AdminAttendanceOverviewPage() {
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [tenantLoading, setTenantLoading] = useState(false);
  const [tenantError, setTenantError] = useState<string | null>(null);

  const [mode, setMode] = useState<"single" | "multi">("single");
  const [classOptions, setClassOptions] = useState<ClassroomOption[]>([]);
  const [classLoading, setClassLoading] = useState(false);
  const [classError, setClassError] = useState<string | null>(null);

  const [date, setDate] = useState<string>(() =>
    new Date().toISOString().slice(0, 10)
  );

  const [summaries, setSummaries] = useState<ClassSummary[]>([]);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  // -------------------------
  // Bootstrap tenant
  // -------------------------
  useEffect(() => {
    (async () => {
      setTenantLoading(true);
      setTenantError(null);
      try {
        const r = await fetch("/api/test/tenants");
        const j = await r.json().catch(() => ({}));
        const t = j?.tenants?.[0];

        if (t?.id) {
          setTenant({
            id: t.id,
            name: t.name || "School",
            slug: t.slug ?? null,
          });
        } else {
          setTenantError(
            "No tenant/school configured. Please contact the administrator."
          );
        }
      } catch {
        setTenantError(
          "Failed to load school context. Please check your connection or contact the system administrator."
        );
      } finally {
        setTenantLoading(false);
      }
    })();
  }, []);

  // -------------------------
  // Classrooms
  // -------------------------
  async function fetchClassOptions(tid: string, m: "single" | "multi") {
    setClassLoading(true);
    setClassError(null);
    try {
      const url = `/api/classrooms/list?tenantId=${encodeURIComponent(
        tid
      )}&mode=${m}`;
      const r = await fetch(url);
      const j = await r.json().catch(() => ({}));

      let items: ClassroomOption[] = [];
      if (r.ok && Array.isArray(j?.items)) {
        items = j.items.map((x: any) => ({
          id: x.id as string,
          label: (x.label as string) || "",
        }));
      }

      setClassOptions(items);
      if (!items.length) {
        setClassError(
          "No classrooms found. Use the seeding tools on the Classrooms page to create standard KG–JHS classes."
        );
      }
    } catch {
      setClassOptions([]);
      setClassError("Failed to load classrooms. Please try again.");
    } finally {
      setClassLoading(false);
    }
  }

  useEffect(() => {
    if (tenant?.id) {
      fetchClassOptions(tenant.id, mode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant?.id, mode]);

  // -------------------------
  // Load summaries for all classes for the selected date
  // -------------------------
  async function loadSummariesForDate() {
    if (!tenant?.id) return;
    if (!date) return;
    if (!classOptions.length) {
      setSummaries([]);
      return;
    }

    setSummaryLoading(true);
    setSummaryError(null);
    setSummaries([]);

    try {
      const requests = classOptions.map((c) => {
        const params = new URLSearchParams();
        params.set("tenantId", tenant.id);
        params.set("classroomId", c.id);
        params.set("date", date);
        const url = `/api/attendance/sessions/summary?${params.toString()}`;
        return fetch(url)
          .then((r) =>
            r
              .json()
              .catch(() => ({}))
              .then((j) => ({ ok: r.ok && j?.ok, raw: j, classroom: c }))
          )
          .catch(() => ({ ok: false, raw: null as any, classroom: c }));
      });

      const results = await Promise.all(requests);

      const next: ClassSummary[] = [];
      let anyError = false;

      for (const res of results) {
        const c = res.classroom;
        if (!res.ok || !res.raw) {
          anyError = true;
          continue;
        }
        const j = res.raw;
        const session = j.session || null;

        let state: SessionState = "NONE";
        if (!session) {
          state = "NONE";
        } else if (session.certifiedAt) {
          state = "CERTIFIED";
        } else if (session.isClosed) {
          state = "CLOSED";
        } else {
          state = "OPEN";
        }

        const total = j?.totals?.students ?? 0;
        const present = j?.breakdown?.present ?? 0;
        const absent = j?.breakdown?.absent ?? 0;
        const late = j?.breakdown?.late ?? 0;
        const excused = j?.breakdown?.excused ?? 0;

        next.push({
          classroomId: c.id,
          classLabel: c.label || "Unknown class",
          state,
          total,
          present,
          absent,
          late,
          excused,
        });
      }

      // Sort by class label for a stable view
      next.sort((a, b) => a.classLabel.localeCompare(b.classLabel));

      setSummaries(next);

      if (anyError && !next.length) {
        setSummaryError(
          "Failed to load attendance overview for one or more classes. Please try again or check your network."
        );
      }
    } catch {
      setSummaries([]);
      setSummaryError(
        "Network or server error while loading attendance overview."
      );
    } finally {
      setSummaryLoading(false);
    }
  }

  // Auto-load when tenant, classes, and date are ready
  useEffect(() => {
    if (tenant?.id && classOptions.length && date) {
      loadSummariesForDate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant?.id, classOptions.length, date]);

  const overall = useMemo(() => {
    if (!summaries.length) {
      return { total: 0, present: 0, absent: 0 };
    }
    let total = 0;
    let present = 0;
    let absent = 0;
    for (const s of summaries) {
      total += s.total || 0;
      present += s.present || 0;
      absent += s.absent || 0;
    }
    const presentPct =
      total > 0 ? Math.round((present / total) * 100) : 0;
    return { total, present, absent, presentPct };
  }, [summaries]);

  // -------------------------
  // UI
  // -------------------------
  return (
    <main className="min-h-screen p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">Daily Attendance Overview</h1>
        <p className="text-sm text-zinc-600 max-w-3xl wrap-break-word">
          A calm bird&apos;s-eye view of{" "}
          <span className="font-semibold">
            which classes have taken attendance, and how many learners are
            present or absent
          </span>{" "}
          for a selected day. Designed for heads and SHEP coordinators to spot
          patterns early — not for punishment.
        </p>
        {tenant && (
          <p className="text-xs text-zinc-500">
            School: <span className="font-semibold">{tenant.name}</span>
          </p>
        )}
        {tenantLoading && (
          <p className="text-xs text-zinc-500">
            Loading school information…
          </p>
        )}
        {tenantError && (
          <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
            {tenantError}
          </p>
        )}
      </header>

      {/* Controls */}
      <section className="border rounded-xl p-4 bg-white space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="space-y-2">
            <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
              Day & Class Mode
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <div>
                <label className="block text-xs font-medium text-zinc-600 mb-1">
                  Date
                </label>
                <input
                  type="date"
                  className="border rounded-xl px-2 py-1.5 h-9 text-sm"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>

              <div>
                <div className="text-xs font-medium text-zinc-600 mb-1">
                  Class mode
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className={`${btnOutline} h-8 px-3 ${
                      mode === "single" ? "ring-2 ring-zinc-800" : ""
                    }`}
                    onClick={() => setMode("single")}
                    disabled={classLoading}
                  >
                    Single-stream
                  </button>
                  <button
                    className={`${btnOutline} h-8 px-3 ${
                      mode === "multi" ? "ring-2 ring-zinc-800" : ""
                    }`}
                    onClick={() => setMode("multi")}
                    disabled={classLoading}
                  >
                    Multi-stream (A–D)
                  </button>
                </div>
              </div>
            </div>
            <p className="text-[11px] text-zinc-500 max-w-md wrap-break-word">
              If you change the date or mode, the overview will refresh. Make
              sure teachers are using the{" "}
              <span className="font-semibold">Teacher → Attendance + Health</span>{" "}
              page, so their records show up here.
            </p>
          </div>

          <div className="space-y-2 text-sm">
            <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
              Actions
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                className={btnPrimary}
                onClick={loadSummariesForDate}
                disabled={
                  summaryLoading ||
                  !tenant?.id ||
                  !date ||
                  !classOptions.length
                }
              >
                {summaryLoading ? "Refreshing…" : "Refresh overview"}
              </button>
              <button
                className={btnOutline}
                onClick={() => {
                  if (tenant?.id) {
                    fetchClassOptions(tenant.id, mode);
                  }
                }}
                disabled={!tenant?.id || classLoading}
              >
                Reload class list
              </button>
            </div>
            <p className="text-[11px] text-zinc-500 max-w-xs wrap-break-word">
              If some classes are missing, reload the class list or check that
              they exist under your Classrooms setup.
            </p>
          </div>
        </div>

        {classError && (
          <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
            {classError}
          </div>
        )}
      </section>

      {/* Overall summary */}
      <section className="border rounded-xl p-4 bg-white">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="space-y-1 text-sm">
            <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
              Whole-school snapshot for {date || "—"}
            </div>
            <div>
              Total learners (across listed classes):{" "}
              <span className="font-semibold">{overall.total}</span>
            </div>
            <div>
              Present:{" "}
              <span className="font-semibold">{overall.present}</span> • Absent:{" "}
              <span className="font-semibold">{overall.absent}</span>
            </div>
          </div>
          <div className="text-sm">
            <div className="text-xs text-zinc-500 mb-1">Present %</div>
            <div className="text-xl font-bold">
              {overall.total ? `${overall.presentPct}%` : "—"}
            </div>
            <p className="mt-1 text-[11px] text-zinc-500 max-w-xs wrap-break-word">
              Use this as a{" "}
              <span className="font-semibold">gentle thermometer</span> of
              attendance patterns for the day. High absence in a particular
              class may signal a{" "}
              <span className="font-semibold">family, community, or health</span>{" "}
              issue to explore, not to blame.
            </p>
          </div>
        </div>
      </section>

      {/* Class-by-class table */}
      <section className="border rounded-xl p-4 bg-white">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold">
            Class-by-class overview ({summaries.length} classes)
          </h2>
          {summaryLoading && (
            <span className="text-xs text-zinc-500">Loading…</span>
          )}
        </div>

        {summaryError && (
          <div className="mb-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
            {summaryError}
          </div>
        )}

        {!summaryLoading &&
          !summaryError &&
          !summaries.length &&
          !!classOptions.length && (
            <p className="text-sm text-zinc-600">
              No attendance sessions recorded yet for this date. Once teachers
              open and save their attendance for the day, each class will
              appear here with a status.
            </p>
          )}

        {!classOptions.length && !classLoading && (
          <p className="text-sm text-zinc-600">
            There are no classes in this mode yet. Seed your classrooms from the
            Classrooms tools or from the Attendance pages, then return here.
          </p>
        )}

        {!!summaries.length && (
          <div className="overflow-x-auto mt-2">
            <table className="min-w-full text-sm border rounded-xl overflow-hidden">
              <thead className="bg-zinc-50 text-xs text-zinc-600">
                <tr>
                  <th className="px-3 py-2 text-left border-b">Class</th>
                  <th className="px-3 py-2 text-left border-b">State</th>
                  <th className="px-3 py-2 text-left border-b">Present</th>
                  <th className="px-3 py-2 text-left border-b">Absent</th>
                  <th className="px-3 py-2 text-left border-b">Late</th>
                  <th className="px-3 py-2 text-left border-b">Excused</th>
                  <th className="px-3 py-2 text-left border-b">Total</th>
                  <th className="px-3 py-2 text-left border-b">% Present</th>
                </tr>
              </thead>
              <tbody>
                {summaries.map((s) => {
                  const pct =
                    s.total > 0
                      ? Math.round((s.present / s.total) * 100)
                      : 0;

                  let pctClass =
                    "inline-flex px-2 py-0.5 rounded-full border text-[11px]";
                  if (pct >= 90)
                    pctClass +=
                      " bg-emerald-50 border-emerald-200 text-emerald-800";
                  else if (pct >= 75)
                    pctClass +=
                      " bg-amber-50 border-amber-200 text-amber-800";
                  else
                    pctClass += " bg-red-50 border-red-200 text-red-800";

                  return (
                    <tr key={s.classroomId} className="border-b last:border-b-0">
                      <td className="px-3 py-2 align-top text-sm font-semibold">
                        {s.classLabel}
                      </td>
                      <td className="px-3 py-2 align-top">
                        <span className={statusBadge(s.state)}>
                          {s.state}
                        </span>
                      </td>
                      <td className="px-3 py-2 align-top">
                        {s.present ?? 0}
                      </td>
                      <td className="px-3 py-2 align-top">
                        {s.absent ?? 0}
                      </td>
                      <td className="px-3 py-2 align-top">{s.late ?? 0}</td>
                      <td className="px-3 py-2 align-top">
                        {s.excused ?? 0}
                      </td>
                      <td className="px-3 py-2 align-top">{s.total ?? 0}</td>
                      <td className="px-3 py-2 align-top">
                        {s.total ? (
                          <span className={pctClass}>{pct}%</span>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-3 text-[11px] text-zinc-500 max-w-3xl wrap-break-word">
          This overview is intentionally{" "}
          <span className="font-semibold">read-only</span>. Detailed edits
          happen on the Teacher pages. Use this page to{" "}
          <span className="font-semibold">notice</span> classes or days that
          may need extra support, home visits, or SHEP follow-up — staying true
          to your calling as a{" "}
          <span className="font-semibold">repairer of the breach</span>.
        </p>
      </section>
    </main>
  );
}
