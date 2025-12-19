// src/app/admin/health/alerts/page.tsx
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

type HealthAlertItem = {
  id: string;
  date: string; // ISO string
  studentId: string | null;
  studentName: string;
  classLabel: string | null;
  temperatureC: number | null;
  symptoms: string | null;
  notes: string | null;
};

const btnBase =
  "inline-flex items-center justify-center h-9 px-3 rounded-xl border text-xs md:text-sm shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const btnPrimary = `${btnBase} bg-black text-white border-black hover:bg-zinc-800`;
const btnOutline = `${btnBase} bg-white text-zinc-900 border-zinc-300 hover:bg-zinc-50`;

function formatDateShort(iso: string) {
  if (!iso) return "Unknown date";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

export default function AdminHealthAlertsPage() {
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [tenantLoading, setTenantLoading] = useState(false);
  const [tenantError, setTenantError] = useState<string | null>(null);

  const [dateFrom, setDateFrom] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [dateTo, setDateTo] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );

  const [classOptions, setClassOptions] = useState<ClassroomOption[]>([]);
  const [classLoading, setClassLoading] = useState(false);
  const [classError, setClassError] = useState<string | null>(null);
  const [classroomId, setClassroomId] = useState<string>("");

  const [items, setItems] = useState<HealthAlertItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // ---------------------------------
  // Bootstrap tenant
  // ---------------------------------
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
          "Failed to load school context. Please check your network or contact the system administrator."
        );
      } finally {
        setTenantLoading(false);
      }
    })();
  }, []);

  // ---------------------------------
  // Load classrooms for quick filter
  // ---------------------------------
  async function fetchClassOptions(tenantId: string) {
    setClassLoading(true);
    setClassError(null);
    try {
      const url = `/api/classrooms/list?tenantId=${encodeURIComponent(
        tenantId
      )}&mode=single`;
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
        setClassroomId("");
        setClassError(
          "No classrooms found. Use the standard seeding tools first if this is a new school setup."
        );
      } else {
        // Only set a default if we don't have one yet
        if (!items.find((c) => c.id === classroomId)) {
          setClassroomId("");
        }
      }
    } catch {
      setClassOptions([]);
      setClassroomId("");
      setClassError("Failed to load classrooms for filtering.");
    } finally {
      setClassLoading(false);
    }
  }

  useEffect(() => {
    if (!tenant?.id) return;
    fetchClassOptions(tenant.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant?.id]);

  // ---------------------------------
  // Load alerts
  // ---------------------------------
  async function loadAlerts() {
    if (!tenant?.id) return;

    setLoading(true);
    setError(null);
    setInfo(null);
    setItems([]);

    try {
      const params = new URLSearchParams();
      params.set("tenantId", tenant.id);
      if (dateFrom) params.set("from", dateFrom);
      if (dateTo) params.set("to", dateTo);
      if (classroomId) params.set("classroomId", classroomId);

      const r = await fetch(
        `/api/admin/health/alerts?${params.toString()}`
      );
      const j = await r.json().catch(() => ({}));

      if (!r.ok || !j?.ok) {
        setItems([]);
        setError(
          j?.error ||
            "Failed to load health alerts from the database. Please try again or contact the system administrator."
        );
        return;
      }

      const records = Array.isArray(j.items)
        ? (j.items as HealthAlertItem[])
        : ([] as HealthAlertItem[]);
      setItems(records);

      if (!records.length) {
        setInfo(
          "No fever-level health alerts were recorded for the selected period. This usually means temperatures remained normal, which is a good sign."
        );
      }
    } catch {
      setItems([]);
      setError(
        "Network or server error while loading health alerts. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  // ---------------------------------
  // Computed summary
  // ---------------------------------
  const summary = useMemo(() => {
    const total = items.length;
    const withSymptoms = items.filter(
      (i) => i.symptoms && i.symptoms.trim().length > 0
    ).length;
    return { total, withSymptoms };
  }, [items]);

  // ---------------------------------
  // UI
  // ---------------------------------
  return (
    <main className="min-h-screen p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">
          SHEP / Health – Fever Alerts
        </h1>
        <p className="text-sm text-zinc-600 max-w-3xl">
          A calm daily view of{" "}
          <span className="font-semibold">
            learners with fever-level temperature readings
          </span>{" "}
          so that SHEP, headteachers, and health partners can follow up
          early — not to punish, but to protect.
        </p>
        {tenant && (
          <p className="text-xs text-zinc-500">
            School:{" "}
            <span className="font-semibold">{tenant.name}</span>
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

      {/* Filters */}
      <section className="border rounded-xl p-4 bg-white space-y-4">
        <div className="grid md:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-semibold text-zinc-600 mb-1">
              From date
            </label>
            <input
              type="date"
              className="w-full border rounded-xl px-2 py-2 h-10 text-sm"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-600 mb-1">
              To date
            </label>
            <input
              type="date"
              className="w-full border rounded-xl px-2 py-2 h-10 text-sm"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-600 mb-1">
              Class filter (optional)
            </label>
            {classLoading ? (
              <div className="h-10 rounded-xl border bg-zinc-50 animate-pulse" />
            ) : (
              <select
                className="w-full border rounded-xl px-2 py-2 h-10 text-sm"
                value={classroomId}
                onChange={(e) =>
                  setClassroomId(e.target.value || "")
                }
              >
                <option value="">All classes</option>
                {classOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            )}
            {classError && (
              <p className="mt-1 text-[11px] text-red-700">
                {classError}
              </p>
            )}
          </div>
          <div className="flex items-end">
            <button
              className={btnPrimary + " w-full"}
              onClick={loadAlerts}
              disabled={loading || !tenant?.id}
            >
              {loading ? "Loading alerts…" : "Load health alerts"}
            </button>
          </div>
        </div>

        <p className="text-[11px] text-zinc-500 max-w-3xl">
          This view is meant to help{" "}
          <span className="font-semibold">
            coordinate care and early follow-up
          </span>
          . It should never be used as a ranking or punishment tool. A
          quick call from the school to a parent can prevent a small
          fever from becoming a big emergency.
        </p>
      </section>

      {/* Summary */}
      <section className="border rounded-xl p-4 bg-white">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="space-y-1 text-sm">
            <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
              Alerts summary
            </div>
            <div>
              Total fever alerts in view:{" "}
              <span className="font-semibold">
                {summary.total}
              </span>
            </div>
            <div>
              With symptoms recorded:{" "}
              <span className="font-semibold">
                {summary.withSymptoms}
              </span>
            </div>
          </div>
          <p className="text-xs text-zinc-500 max-w-md">
            Use this summary to{" "}
            <span className="font-semibold">
              plan follow-up calls or home visits
            </span>{" "}
            for repeated or serious cases. Health records are sensitive,
            so access to this page should be limited to trusted staff.
          </p>
        </div>
      </section>

      {/* Alerts table */}
      <section className="border rounded-xl p-4 bg-white">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h2 className="text-sm font-semibold">
            Fever-level health alerts
          </h2>
          {loading && (
            <span className="text-xs text-zinc-500">
              Loading…
            </span>
          )}
        </div>

        {error && (
          <div className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
            {error}
          </div>
        )}

        {info && !error && (
          <div className="mb-3 text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
            {info}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="min-w-full text-xs border rounded-xl overflow-hidden">
            <thead className="bg-zinc-50 text-zinc-600">
              <tr>
                <th className="px-3 py-2 text-left border-b">
                  Date
                </th>
                <th className="px-3 py-2 text-left border-b">
                  Learner
                </th>
                <th className="px-3 py-2 text-left border-b">
                  Class
                </th>
                <th className="px-3 py-2 text-left border-b">
                  Temperature
                </th>
                <th className="px-3 py-2 text-left border-b">
                  Symptoms
                </th>
                <th className="px-3 py-2 text-left border-b">
                  Notes
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => {
                const dateLabel = formatDateShort(row.date);
                const tempLabel =
                  typeof row.temperatureC === "number"
                    ? `${row.temperatureC.toFixed(1)} °C`
                    : "Not recorded";

                return (
                  <tr
                    key={row.id}
                    className="border-b last:border-b-0"
                  >
                    <td className="px-3 py-2 align-top">
                      {dateLabel}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <div className="font-semibold">
                        {row.studentName || "Unknown learner"}
                      </div>
                    </td>
                    <td className="px-3 py-2 align-top text-zinc-700">
                      {row.classLabel || "—"}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <span className="inline-flex px-2 py-0.5 rounded-full border border-red-200 bg-red-50 text-red-800">
                        {tempLabel}
                      </span>
                    </td>
                    <td className="px-3 py-2 align-top text-zinc-700 max-w-xs">
                      {row.symptoms || "—"}
                    </td>
                    <td className="px-3 py-2 align-top text-zinc-700 max-w-xs">
                      {row.notes || "—"}
                    </td>
                  </tr>
                );
              })}
              {!items.length && !loading && !error && (
                <tr>
                  <td
                    className="px-3 py-4 text-zinc-600"
                    colSpan={6}
                  >
                    No records are loaded yet. Choose a date range (or
                    keep today) and click{" "}
                    <span className="font-semibold">
                      Load health alerts
                    </span>
                    .
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="mt-3 text-[11px] text-zinc-500 max-w-3xl">
          This panel keeps your identity as a{" "}
          <span className="font-semibold">
            repairer of the breach
          </span>{" "}
          at the center: we notice patterns early, reach out in love,
          and partner with families and health workers to keep children
          safe.
        </p>
      </section>
    </main>
  );
}
