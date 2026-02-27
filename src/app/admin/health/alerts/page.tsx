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

  // Bootstrap tenant from /api/me (AUTH)
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setTenantLoading(true);
      setTenantError(null);

      try {
        const r = await fetch("/api/me", { cache: "no-store" });
        if (r.status === 401) {
          if (!cancelled) setTenantError("You must be signed in to view health alerts.");
          return;
        }
        const j = await r.json().catch(() => ({}));
        const t = pickActiveTenantFromMe(j);

        if (!t?.id) {
          if (!cancelled) {
            setTenantError("No tenant/school context found for your account.");
          }
          return;
        }

        if (!cancelled) {
          setTenant({ id: t.id, name: t.name || "School", slug: t.slug ?? null });
        }
      } catch {
        if (!cancelled) {
          setTenantError(
            "Failed to load school context. Please check your network or contact the system administrator."
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

  async function fetchClassOptions(tenantId: string) {
    setClassLoading(true);
    setClassError(null);
    try {
      const url = `/api/classrooms/list?tenantId=${encodeURIComponent(
        tenantId
      )}&mode=single`;
      const r = await fetch(url, { cache: "no-store" });
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

      const r = await fetch(`/api/admin/health/alerts?${params.toString()}`, {
        cache: "no-store",
      });
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
      setError("Network or server error while loading health alerts. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const summary = useMemo(() => {
    const total = items.length;
    const withSymptoms = items.filter((i) => i.symptoms && i.symptoms.trim().length > 0).length;
    return { total, withSymptoms };
  }, [items]);

  return (
    <main className="min-h-screen p-6 max-w-6xl mx-auto space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">SHEP / Health – Fever Alerts</h1>
        <p className="text-sm text-zinc-600 max-w-3xl">
          A calm daily view of{" "}
          <span className="font-semibold">learners with fever-level temperature readings</span>{" "}
          so that SHEP, headteachers, and health partners can follow up early — not to punish,
          but to protect.
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
        <div className="grid md:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-semibold text-zinc-600 mb-1">From date</label>
            <input
              type="date"
              className="w-full border rounded-xl px-2 py-2 h-10 text-sm"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-600 mb-1">To date</label>
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
                onChange={(e) => setClassroomId(e.target.value || "")}
              >
                <option value="">All classes</option>
                {classOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            )}
            {classError && <p className="mt-1 text-[11px] text-red-700">{classError}</p>}
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
          This view is meant to help <span className="font-semibold">coordinate care and early follow-up</span>.
          It should never be used as a ranking or punishment tool.
        </p>
      </section>

      <section className="border rounded-xl p-4 bg-white">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="space-y-1 text-sm">
            <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
              Alerts summary
            </div>
            <div>
              Total fever alerts in view: <span className="font-semibold">{summary.total}</span>
            </div>
            <div>
              With symptoms recorded: <span className="font-semibold">{summary.withSymptoms}</span>
            </div>
          </div>
          <p className="text-xs text-zinc-500 max-w-md">
            Use this summary to <span className="font-semibold">plan follow-up calls or home visits</span>.
            Health records are sensitive; access should be limited to trusted staff.
          </p>
        </div>
      </section>

      <section className="border rounded-xl p-4 bg-white">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h2 className="text-sm font-semibold">Fever-level health alerts</h2>
          {loading && <span className="text-xs text-zinc-500">Loading…</span>}
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
                <th className="px-3 py-2 text-left border-b">Date</th>
                <th className="px-3 py-2 text-left border-b">Learner</th>
                <th className="px-3 py-2 text-left border-b">Class</th>
                <th className="px-3 py-2 text-left border-b">Temperature</th>
                <th className="px-3 py-2 text-left border-b">Symptoms</th>
                <th className="px-3 py-2 text-left border-b">Notes</th>
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
                  <tr key={row.id} className="border-b last:border-b-0">
                    <td className="px-3 py-2 align-top">{dateLabel}</td>
                    <td className="px-3 py-2 align-top">
                      <div className="font-semibold">{row.studentName || "Unknown learner"}</div>
                    </td>
                    <td className="px-3 py-2 align-top text-zinc-700">{row.classLabel || "—"}</td>
                    <td className="px-3 py-2 align-top">
                      <span className="inline-flex px-2 py-0.5 rounded-full border border-red-200 bg-red-50 text-red-800">
                        {tempLabel}
                      </span>
                    </td>
                    <td className="px-3 py-2 align-top text-zinc-700 max-w-xs">
                      {row.symptoms || "—"}
                    </td>
                    <td className="px-3 py-2 align-top text-zinc-700 max-w-xs">{row.notes || "—"}</td>
                  </tr>
                );
              })}

              {!items.length && !loading && !error && (
                <tr>
                  <td className="px-3 py-4 text-zinc-600" colSpan={6}>
                    No records are loaded yet. Choose a date range (or keep today) and click{" "}
                    <span className="font-semibold">Load health alerts</span>.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="mt-3 text-[11px] text-zinc-500 max-w-3xl">
          We notice patterns early, reach out in love, and partner with families to keep children safe.
        </p>
      </section>
    </main>
  );
}
