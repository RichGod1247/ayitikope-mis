// src/app/admin/shep/overview/page.tsx
"use client";

import { useEffect, useState } from "react";

type Tenant = {
  id: string;
  name: string;
  slug?: string | null;
};

type Snapshot = {
  absenteeCount: number;
  healthAlertCount: number;
  from: string;
  to: string;
};

const btnBase =
  "inline-flex items-center justify-center h-9 px-3 rounded-xl border text-sm shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const btnPrimary = `${btnBase} bg-black text-white border-black hover:bg-zinc-800`;
const btnOutline = `${btnBase} bg-white text-zinc-900 border-zinc-300 hover:bg-zinc-50`;

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function ShepOverviewPage() {
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [tenantLoading, setTenantLoading] = useState(false);
  const [tenantError, setTenantError] = useState<string | null>(null);

  const [from, setFrom] = useState<string>(todayISO());
  const [to, setTo] = useState<string>(todayISO());

  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // ---------------------------
  // Bootstrap tenant
  // ---------------------------
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
          "Failed to load school context. Please check your connection or contact the school."
        );
      } finally {
        setTenantLoading(false);
      }
    })();
  }, []);

  // ---------------------------
  // Load SHEP snapshot
  // ---------------------------
  async function loadSnapshot() {
    if (!tenant?.id) return;

    setLoading(true);
    setErrorMsg(null);
    setSnapshot(null);

    try {
      const baseParams = new URLSearchParams();
      baseParams.set("tenantId", tenant.id);
      baseParams.set("from", from);
      baseParams.set("to", to);

      const [absRes, healthRes] = await Promise.allSettled([
        fetch(`/api/admin/attendance/absentees?${baseParams.toString()}`),
        fetch(`/api/admin/health/alerts?${baseParams.toString()}`),
      ]);

      let absenteeCount = 0;
      let healthAlertCount = 0;
      let errs: string[] = [];

      // Attendance absentees
      if (absRes.status === "fulfilled") {
        const r = absRes.value;
        const j = await r.json().catch(() => ({}));
        if (r.ok && j?.ok && Array.isArray(j.items)) {
          absenteeCount = j.items.length;
        } else {
          errs.push(
            j?.error ||
              "Failed to load absentee data from /api/admin/attendance/absentees."
          );
        }
      } else {
        errs.push("Network error while loading absentee data.");
      }

      // Health alerts
      if (healthRes.status === "fulfilled") {
        const r = healthRes.value;
        const j = await r.json().catch(() => ({}));
        if (r.ok && j?.ok && Array.isArray(j.items)) {
          healthAlertCount = j.items.length;
        } else {
          errs.push(
            j?.error ||
              "Failed to load health data from /api/admin/health/alerts."
          );
        }
      } else {
        errs.push("Network error while loading health alerts.");
      }

      setSnapshot({
        absenteeCount,
        healthAlertCount,
        from,
        to,
      });

      if (errs.length) {
        setErrorMsg(
          errs.join(" ") ||
            "Failed to fully load the SHEP snapshot. Please try again or contact the administrator."
        );
      }
    } catch {
      setErrorMsg(
        "Network or server error while loading SHEP snapshot. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  // ---------------------------
  // UI
  // ---------------------------
  return (
    <main className="min-h-screen p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">SHEP & Welfare Overview</h1>
        <p className="text-sm text-zinc-600 max-w-3xl">
          A calm daily overview for{" "}
          <span className="font-semibold">SHEP, heads, and welfare teams</span>{" "}
          to see which learners may need a gentle follow-up —{" "}
          <span className="font-semibold">
            not for punishment, but for early care.
          </span>
        </p>
        {tenant && (
          <p className="text-xs text-zinc-500">
            School: <span className="font-semibold">{tenant.name}</span>
          </p>
        )}
        {tenantLoading && (
          <p className="text-xs text-zinc-500">Loading school information…</p>
        )}
        {tenantError && (
          <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
            {tenantError}
          </p>
        )}
      </header>

      {/* Filters + snapshot button */}
      <section className="border rounded-xl p-4 bg-white space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-md">
            <div>
              <label className="block text-xs font-semibold text-zinc-600 mb-1">
                From (date)
              </label>
              <input
                type="date"
                className="w-full border rounded-xl px-2 py-2 text-sm"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-600 mb-1">
                To (date)
              </label>
              <input
                type="date"
                className="w-full border rounded-xl px-2 py-2 text-sm"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
          </div>

          <div className="flex gap-2 justify-end">
            <button
              className={btnOutline}
              type="button"
              onClick={() => {
                const today = todayISO();
                setFrom(today);
                setTo(today);
                setSnapshot(null);
                setErrorMsg(null);
              }}
            >
              Today
            </button>
            <button
              className={btnPrimary}
              type="button"
              onClick={loadSnapshot}
              disabled={!tenant?.id || loading}
            >
              {loading ? "Loading overview…" : "Load SHEP overview"}
            </button>
          </div>
        </div>

        {errorMsg && (
          <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
            {errorMsg}
          </div>
        )}

        {snapshot && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
            <div className="border rounded-xl p-3 bg-amber-50 border-amber-200">
              <div className="text-xs font-semibold text-amber-900 uppercase tracking-wide mb-1">
                Attendance follow-ups
              </div>
              <div className="text-2xl font-bold text-amber-900">
                {snapshot.absenteeCount}
              </div>
              <p className="text-xs text-amber-900 mt-1">
                Learner
                {snapshot.absenteeCount === 1 ? "" : "s"} marked{" "}
                <span className="font-semibold">ABSENT</span> in this period.
              </p>
            </div>

            <div className="border rounded-xl p-3 bg-red-50 border-red-200">
              <div className="text-xs font-semibold text-red-900 uppercase tracking-wide mb-1">
                Fever & health alerts
              </div>
              <div className="text-2xl font-bold text-red-900">
                {snapshot.healthAlertCount}
              </div>
              <p className="text-xs text-red-900 mt-1">
                Health record
                {snapshot.healthAlertCount === 1 ? "" : "s"} where{" "}
                <span className="font-semibold">fever / concern</span> was
                detected for follow-up.
              </p>
            </div>
          </div>
        )}

        {!snapshot && !errorMsg && (
          <p className="text-xs text-zinc-500">
            Choose a date or small range (for example,{" "}
            <span className="font-semibold">today</span>) and click{" "}
            <span className="font-semibold">Load SHEP overview</span> to see how
            many learners may need gentle follow-up for attendance or health.
          </p>
        )}
      </section>

      {/* Quick navigation cards */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <a
          href="/admin/attendance/absentees"
          className="border rounded-xl p-4 bg-white hover:bg-zinc-50 transition-colors shadow-sm flex flex-col justify-between"
        >
          <div>
            <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1">
              Admin • Attendance
            </div>
            <h2 className="text-sm font-semibold mb-1">
              Absentees & latecomers board
            </h2>
            <p className="text-xs text-zinc-600">
              See which learners have been absent or late in a given period, so
              you can plan home visits or calls with care.
            </p>
          </div>
          <div className="mt-3 text-xs font-semibold text-zinc-800">
            Open absentee board →
          </div>
        </a>

        <a
          href="/admin/health/alerts"
          className="border rounded-xl p-4 bg-white hover:bg-zinc-50 transition-colors shadow-sm flex flex-col justify-between"
        >
          <div>
            <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1">
              Admin • Health
            </div>
            <h2 className="text-sm font-semibold mb-1">
              Fever & health alerts
            </h2>
            <p className="text-xs text-zinc-600">
              Review learners with repeated fever or symptoms, coordinate with
              SHEP and nearby clinics before things become emergencies.
            </p>
          </div>
          <div className="mt-3 text-xs font-semibold text-zinc-800">
            Open health alerts →
          </div>
        </a>

        <a
          href="/students/contacts"
          className="border rounded-xl p-4 bg-white hover:bg-zinc-50 transition-colors shadow-sm flex flex-col justify-between"
        >
          <div>
            <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1">
              Staff • Directory
            </div>
            <h2 className="text-sm font-semibold mb-1">
              Student & guardian contacts
            </h2>
            <p className="text-xs text-zinc-600">
              Quickly look up phone contacts for families when planning visits,
              PTA follow-ups, or gentle welfare calls.
            </p>
          </div>
          <div className="mt-3 text-xs font-semibold text-zinc-800">
            Open contacts directory →
          </div>
        </a>
      </section>

      <section className="text-[11px] text-zinc-500 max-w-3xl">
        This overview is designed to keep{" "}
        <span className="font-semibold">care at the center</span> of data: one
        calm page to notice patterns early, coordinate with parents, and act as{" "}
        a true{" "}
        <span className="font-semibold">
          repairer of the breach in learners&apos; lives
        </span>
        .
      </section>
    </main>
  );
}
