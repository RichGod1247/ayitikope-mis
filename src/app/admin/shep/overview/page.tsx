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

type MeResponse =
  | { ok: true; tenantId: string; tenant?: { name?: string | null; slug?: string | null } | null }
  | { ok: false; error?: string };

const btnBase =
  "inline-flex items-center justify-center h-9 px-3 rounded-xl border text-sm shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const btnPrimary = `${btnBase} bg-black text-white border-black hover:bg-zinc-800`;
const btnOutline = `${btnBase} bg-white text-zinc-900 border-zinc-300 hover:bg-zinc-50`;

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

async function safeJson(r: Response) {
  return (await r.json().catch(() => ({}))) as any;
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

  // Bootstrap tenant from /api/me
  useEffect(() => {
    let alive = true;

    (async () => {
      setTenantLoading(true);
      setTenantError(null);
      try {
        const r = await fetch("/api/me", { cache: "no-store" });
        const j = (await r.json().catch(() => ({}))) as MeResponse;

        if (!alive) return;

        if (!r.ok || !j || (j as any).ok !== true) {
          setTenantError("Failed to load school context. Please sign in again.");
          return;
        }

        const ok = j as Extract<MeResponse, { ok: true }>;
        setTenant({
          id: ok.tenantId,
          name: ok.tenant?.name || "School",
          slug: ok.tenant?.slug ?? null,
        });
      } catch {
        if (!alive) return;
        setTenantError("Failed to load school context. Please check your connection or contact the school.");
      } finally {
        if (alive) setTenantLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  // Load SHEP snapshot (prefer server-derived tenant, fallback to tenantId)
  async function loadSnapshot() {
    if (!tenant?.id) return;

    setLoading(true);
    setErrorMsg(null);
    setSnapshot(null);

    try {
      const paramsNoTenant = new URLSearchParams();
      paramsNoTenant.set("from", from);
      paramsNoTenant.set("to", to);

      const paramsWithTenant = new URLSearchParams(paramsNoTenant);
      paramsWithTenant.set("tenantId", tenant.id);

      const tryFetch = async (path: string) => {
        // 1) prefer without tenantId
        let r = await fetch(`${path}?${paramsNoTenant.toString()}`, { cache: "no-store" });
        let j = await safeJson(r);

        // 2) fallback with tenantId
        if ((!r.ok || !j?.ok || !Array.isArray(j.items)) && tenant.id) {
          r = await fetch(`${path}?${paramsWithTenant.toString()}`, { cache: "no-store" });
          j = await safeJson(r);
        }

        return { r, j };
      };

      const [absRes, healthRes] = await Promise.allSettled([
        tryFetch("/api/admin/attendance/absentees"),
        tryFetch("/api/admin/health/alerts"),
      ]);

      let absenteeCount = 0;
      let healthAlertCount = 0;
      const errs: string[] = [];

      if (absRes.status === "fulfilled") {
        const { r, j } = absRes.value;
        if (r.ok && j?.ok && Array.isArray(j.items)) absenteeCount = j.items.length;
        else errs.push(j?.error || "Failed to load absentee data.");
      } else {
        errs.push("Network error while loading absentee data.");
      }

      if (healthRes.status === "fulfilled") {
        const { r, j } = healthRes.value;
        if (r.ok && j?.ok && Array.isArray(j.items)) healthAlertCount = j.items.length;
        else errs.push(j?.error || "Failed to load health data.");
      } else {
        errs.push("Network error while loading health alerts.");
      }

      setSnapshot({ absenteeCount, healthAlertCount, from, to });

      if (errs.length) {
        setErrorMsg(errs.join(" ") || "Failed to fully load the SHEP snapshot. Please try again.");
      }
    } catch {
      setErrorMsg("Network or server error while loading SHEP snapshot. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen p-6 max-w-6xl mx-auto space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">SHEP & Welfare Overview</h1>
        <p className="text-sm text-zinc-600 max-w-3xl">
          A calm daily overview for <span className="font-semibold">SHEP, heads, and welfare teams</span> to see which learners may need a gentle follow-up.
        </p>
        {tenant && (
          <p className="text-xs text-zinc-500">
            School: <span className="font-semibold">{tenant.name}</span>
          </p>
        )}
        {tenantLoading && <p className="text-xs text-zinc-500">Loading school information…</p>}
        {tenantError && (
          <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{tenantError}</p>
        )}
      </header>

      <section className="border rounded-xl p-4 bg-white space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-md">
            <div>
              <label className="block text-xs font-semibold text-zinc-600 mb-1">From (date)</label>
              <input type="date" className="w-full border rounded-xl px-2 py-2 text-sm" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-600 mb-1">To (date)</label>
              <input type="date" className="w-full border rounded-xl px-2 py-2 text-sm" value={to} onChange={(e) => setTo(e.target.value)} />
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
            <button className={btnPrimary} type="button" onClick={loadSnapshot} disabled={!tenant?.id || loading}>
              {loading ? "Loading overview…" : "Load SHEP overview"}
            </button>
          </div>
        </div>

        {errorMsg && (
          <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{errorMsg}</div>
        )}

        {snapshot && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
            <div className="border rounded-xl p-3 bg-amber-50 border-amber-200">
              <div className="text-xs font-semibold text-amber-900 uppercase tracking-wide mb-1">Attendance follow-ups</div>
              <div className="text-2xl font-bold text-amber-900">{snapshot.absenteeCount}</div>
              <p className="text-xs text-amber-900 mt-1">
                Learner{snapshot.absenteeCount === 1 ? "" : "s"} marked <span className="font-semibold">ABSENT</span> in this period.
              </p>
            </div>

            <div className="border rounded-xl p-3 bg-red-50 border-red-200">
              <div className="text-xs font-semibold text-red-900 uppercase tracking-wide mb-1">Fever & health alerts</div>
              <div className="text-2xl font-bold text-red-900">{snapshot.healthAlertCount}</div>
              <p className="text-xs text-red-900 mt-1">
                Health record{snapshot.healthAlertCount === 1 ? "" : "s"} where <span className="font-semibold">fever / concern</span> was detected for follow-up.
              </p>
            </div>
          </div>
        )}

        {!snapshot && !errorMsg && (
          <p className="text-xs text-zinc-500">
            Choose a date (or small range) and click <span className="font-semibold">Load SHEP overview</span>.
          </p>
        )}
      </section>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <a href="/admin/attendance/absentees" className="border rounded-xl p-4 bg-white hover:bg-zinc-50 transition-colors shadow-sm flex flex-col justify-between">
          <div>
            <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1">Admin • Attendance</div>
            <h2 className="text-sm font-semibold mb-1">Absentees & latecomers board</h2>
            <p className="text-xs text-zinc-600">See which learners have been absent or late in a given period, so you can plan home visits or calls with care.</p>
          </div>
          <div className="mt-3 text-xs font-semibold text-zinc-800">Open absentee board →</div>
        </a>

        <a href="/admin/health/alerts" className="border rounded-xl p-4 bg-white hover:bg-zinc-50 transition-colors shadow-sm flex flex-col justify-between">
          <div>
            <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1">Admin • Health</div>
            <h2 className="text-sm font-semibold mb-1">Fever & health alerts</h2>
            <p className="text-xs text-zinc-600">Review learners with repeated fever or symptoms, coordinate with SHEP and nearby clinics early.</p>
          </div>
          <div className="mt-3 text-xs font-semibold text-zinc-800">Open health alerts →</div>
        </a>

        <a href="/students/contacts" className="border rounded-xl p-4 bg-white hover:bg-zinc-50 transition-colors shadow-sm flex flex-col justify-between">
          <div>
            <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1">Staff • Directory</div>
            <h2 className="text-sm font-semibold mb-1">Student & guardian contacts</h2>
            <p className="text-xs text-zinc-600">Quickly look up phone contacts for families when planning welfare calls or visits.</p>
          </div>
          <div className="mt-3 text-xs font-semibold text-zinc-800">Open contacts directory →</div>
        </a>
      </section>

      <section className="text-[11px] text-zinc-500 max-w-3xl">
        This overview is designed to keep <span className="font-semibold">care at the center</span> of data: notice patterns early, coordinate with parents, and act quickly.
      </section>
    </main>
  );
}
