// src/app/admin/attendance/absentees/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type Tenant = {
  id: string;
  name: string;
  slug?: string | null;
};

const btnBase =
  "inline-flex items-center justify-center h-9 px-3 rounded-xl border text-sm shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const btnPrimary = `${btnBase} bg-black text-white border-black hover:bg-zinc-800`;

function cleanStr(v: unknown) {
  return String(v ?? "").trim();
}

function normalizeTenant(x: any): Tenant | null {
  const id = cleanStr(x?.id ?? x?.tenantId);
  if (!id) return null;
  const name = cleanStr(x?.name ?? x?.tenantName) || "School";
  const slug = (x?.slug ?? x?.tenantSlug ?? null) as string | null;
  return { id, name, slug };
}

function extractTenantsFromMe(j: any): Tenant[] {
  const memberships =
    (Array.isArray(j?.memberships) && j.memberships) ||
    (Array.isArray(j?.user?.memberships) && j.user.memberships) ||
    [];

  const list: Tenant[] = [];

  for (const m of memberships) {
    const t = normalizeTenant(m?.tenant ?? m);
    if (t) list.push(t);
  }

  const direct =
    normalizeTenant(j?.activeTenant) ||
    normalizeTenant(j?.tenant) ||
    normalizeTenant(j?.user?.activeTenant) ||
    normalizeTenant(j?.user?.tenant);

  if (direct) list.unshift(direct);

  const seen = new Set<string>();
  const out: Tenant[] = [];
  for (const t of list) {
    if (!seen.has(t.id)) {
      seen.add(t.id);
      out.push(t);
    }
  }
  return out;
}

function pickActiveTenantFromMe(j: any): Tenant | null {
  const tenants = extractTenantsFromMe(j);
  if (!tenants.length) return null;

  const activeId =
    cleanStr(j?.activeTenantId) ||
    cleanStr(j?.tenantId) ||
    cleanStr(j?.user?.activeTenantId) ||
    cleanStr(j?.user?.tenantId);

  if (activeId) {
    const match = tenants.find((t) => t.id === activeId);
    if (match) return match;
  }
  return tenants[0] ?? null;
}

function formatDate(iso: string | undefined) {
  if (!iso) return "Unknown date";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

// Keep items as any[] for tolerance to API shape changes.
export default function AdminAbsenteesPage() {
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [tenantLoading, setTenantLoading] = useState(false);
  const [tenantError, setTenantError] = useState<string | null>(null);

  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0, 10));

  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Bootstrap tenant from /api/me (AUTH)
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setTenantLoading(true);
      setTenantError(null);

      try {
        const r = await fetch("/api/me", { cache: "no-store" });
        if (r.status === 401) {
          if (!cancelled) setTenantError("You must be signed in to view this report.");
          return;
        }
        const j = await r.json().catch(() => ({}));
        const t = pickActiveTenantFromMe(j);

        if (!t?.id) {
          if (!cancelled) setTenantError("No tenant/school context found for your account.");
          return;
        }

        if (!cancelled) {
          setTenant({ id: t.id, name: t.name || "School", slug: t.slug ?? null });
        }
      } catch {
        if (!cancelled) {
          setTenantError(
            "Failed to load school context. Please check your connection or contact the system administrator."
          );
        }
      } finally {
        if (!cancelled) setTenantLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function loadReport() {
    if (!tenant?.id || !date) return;

    setLoading(true);
    setError(null);
    setItems([]);

    try {
      const params = new URLSearchParams();
      params.set("tenantId", tenant.id);
      params.set("date", date);

      const r = await fetch(`/api/admin/attendance/absentees?${params.toString()}`, {
        cache: "no-store",
      });
      const j = await r.json().catch(() => ({}));

      if (!r.ok || !j?.ok) {
        setItems([]);
        setError(
          j?.error ||
            "Failed to load absentees & fever report. Please try again or contact the system administrator."
        );
        return;
      }

      const arr = Array.isArray(j.items) ? j.items : [];
      setItems(arr);
    } catch {
      setItems([]);
      setError("Network or server error while loading absentees & fever report.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (tenant?.id && date) loadReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant?.id, date]);

  const summary = useMemo(() => {
    if (!items.length) {
      return { total: 0, absentCount: 0, feverCount: 0, uniqueStudents: 0 };
    }

    const absentCount = items.filter((r) => r.status === "ABSENT").length;

    const feverCount = items.filter((r) => r.isFever === true && r.status !== "ABSENT").length;

    const studentIds = new Set(
      items.map((r) => r.studentId as string | undefined).filter(Boolean) as string[]
    );

    return {
      total: items.length,
      absentCount,
      feverCount,
      uniqueStudents: studentIds.size,
    };
  }, [items]);

  return (
    <main className="min-h-screen p-6 max-w-6xl mx-auto space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">Absentees & Fever Alerts (Admin)</h1>
        <p className="text-sm text-zinc-600 max-w-3xl wrap-break-word">
          A calm snapshot of{" "}
          <span className="font-semibold">which learners were absent or had fever</span> on a
          particular day — for early follow-up, not punishment.
        </p>
        {tenant && (
          <p className="text-xs text-zinc-500">
            School: <span className="font-semibold">{tenant.name}</span>
          </p>
        )}
        {tenantLoading && <p className="text-xs text-zinc-500">Loading school information…</p>}
        {tenantError && (
          <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
            {tenantError}
          </p>
        )}
      </header>

      <section className="border rounded-xl p-4 bg-white space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="space-y-2">
            <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Day filter</div>
            <div className="flex items-center gap-2 text-sm">
              <label className="text-xs font-medium text-zinc-600">Date</label>
              <input
                type="date"
                className="border rounded-xl px-2 py-1.5 h-9 text-sm"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <p className="text-[11px] text-zinc-500 max-w-md wrap-break-word">
              Choose a date to see learners recorded as <span className="font-semibold">ABSENT</span>{" "}
              or with fever-level temperature.
            </p>
          </div>

          <div className="space-y-2 text-sm">
            <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Actions</div>
            <div className="flex flex-wrap gap-2">
              <button
                className={btnPrimary}
                onClick={loadReport}
                disabled={loading || !tenant?.id || !date}
              >
                {loading ? "Refreshing…" : "Refresh report"}
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="border rounded-xl p-4 bg-white">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="space-y-1 text-sm">
            <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Daily summary</div>
            <div>
              Total entries (absent or fever): <span className="font-semibold">{summary.total}</span>
            </div>
            <div>
              Unique learners affected: <span className="font-semibold">{summary.uniqueStudents}</span>
            </div>
            <div>
              Pure absentees (no fever data): <span className="font-semibold">{summary.absentCount}</span>
            </div>
            <div>
              Fever-only (present/late but high temperature):{" "}
              <span className="font-semibold">{summary.feverCount}</span>
            </div>
          </div>
          <p className="text-[11px] text-zinc-500 max-w-md wrap-break-word">
            Use this as a care radar — for early calls and support, not shame.
          </p>
        </div>
      </section>

      <section className="border rounded-xl p-4 bg-white">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold">Learner-level list for {date || "—"}</h2>
          {loading && <span className="text-xs text-zinc-500">Loading…</span>}
        </div>

        {error && (
          <div className="mb-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
            {error}
          </div>
        )}

        {!error && !loading && !items.length && (
          <p className="text-sm text-zinc-600">
            No absentees or fever-level temperature records found for this day.
          </p>
        )}

        {!!items.length && (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm border rounded-xl overflow-hidden">
              <thead className="bg-zinc-50 text-xs text-zinc-600">
                <tr>
                  <th className="px-3 py-2 text-left border-b">Learner</th>
                  <th className="px-3 py-2 text-left border-b">Class</th>
                  <th className="px-3 py-2 text-left border-b">Date</th>
                  <th className="px-3 py-2 text-left border-b">Attendance</th>
                  <th className="px-3 py-2 text-left border-b">Temperature</th>
                  <th className="px-3 py-2 text-left border-b">Symptoms</th>
                  <th className="px-3 py-2 text-left border-b">Guardian contact</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row, idx) => {
                  const key = row.id || `${row.studentId || "student"}-${idx}`;

                  const studentName: string =
                    row.studentName ||
                    [row.firstName, row.lastName].filter(Boolean).join(" ").trim() ||
                    "Unknown learner";

                  const classLabel: string =
                    row.classLabel ||
                    row.className ||
                    [row.classroomName, row.classroomGrade, row.classroomArm]
                      .filter(Boolean)
                      .join(" ")
                      .trim() ||
                    "—";

                  const dateValue: string = row.date || row.sessionDate || row.sessionDateIso || row.createdAt;

                  const attendanceStatus: string = row.status || row.attendanceStatus || "UNKNOWN";

                  const isFever: boolean = !!row.isFever;
                  const temp: number | null =
                    typeof row.temperatureC === "number"
                      ? row.temperatureC
                      : row.temperatureC == null
                      ? null
                      : Number(row.temperatureC);

                  const symptoms: string | undefined = row.symptoms || row.symptomsText || row.healthNotes;

                  const guardianName: string | undefined = row.guardianName || row.parentName;
                  const guardianPhone: string | undefined = row.guardianPhone || row.parentPhone;

                  let attendBadge = "inline-flex px-2 py-0.5 rounded-full border text-[11px]";
                  let attendText = attendanceStatus;

                  if (attendanceStatus === "ABSENT") {
                    attendBadge += " bg-red-50 border-red-200 text-red-800";
                    attendText = "Absent";
                  } else if (attendanceStatus === "PRESENT") {
                    attendBadge += " bg-emerald-50 border-emerald-200 text-emerald-800";
                    attendText = "Present";
                  } else if (attendanceStatus === "LATE") {
                    attendBadge += " bg-amber-50 border-amber-200 text-amber-800";
                    attendText = "Late";
                  } else if (attendanceStatus === "EXCUSED") {
                    attendBadge += " bg-blue-50 border-blue-200 text-blue-800";
                    attendText = "Excused";
                  } else {
                    attendBadge += " bg-zinc-50 border-zinc-200 text-zinc-700";
                  }

                  let tempBadge = "inline-flex px-2 py-0.5 rounded-full border text-[11px]";
                  let tempText = "No record";
                  if (temp !== null && !Number.isNaN(temp)) {
                    tempText = `${temp.toFixed(1)} °C`;
                    tempBadge += isFever
                      ? " bg-red-50 border-red-200 text-red-800"
                      : " bg-emerald-50 border-emerald-200 text-emerald-800";
                  } else {
                    tempBadge += " bg-zinc-50 border-zinc-200 text-zinc-700";
                  }

                  return (
                    <tr key={key} className="border-b last:border-b-0">
                      <td className="px-3 py-2 align-top">
                        <div className="font-semibold">{studentName}</div>
                      </td>
                      <td className="px-3 py-2 align-top text-xs text-zinc-700">{classLabel}</td>
                      <td className="px-3 py-2 align-top text-xs text-zinc-700">{formatDate(dateValue)}</td>
                      <td className="px-3 py-2 align-top text-xs">
                        <span className={attendBadge}>{attendText}</span>
                      </td>
                      <td className="px-3 py-2 align-top text-xs">
                        <span className={tempBadge}>{tempText}</span>
                      </td>
                      <td className="px-3 py-2 align-top text-xs text-zinc-700 max-w-xs wrap-break-word">
                        {symptoms || "—"}
                      </td>
                      <td className="px-3 py-2 align-top text-xs text-zinc-700 max-w-xs wrap-break-word">
                        {guardianPhone ? (
                          <div className="space-y-0.5">
                            {guardianName && <div className="font-medium">{guardianName}</div>}
                            <a href={`tel:${guardianPhone}`} className="underline underline-offset-2">
                              {guardianPhone}
                            </a>
                          </div>
                        ) : (
                          <span className="text-zinc-400">No phone on file</span>
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
          Read-only by design. Follow-up happens through your normal welfare/SHEP structures.
        </p>
      </section>
    </main>
  );
}
