// src/components/governance/GovernanceDashboardClient.tsx
"use client";

import { signOut } from "next-auth/react";
import { useEffect, useMemo, useState } from "react";

type SchoolRow = {
  id: string;
  name: string;
  schoolCode: string | null;
  status: string;
  circuit?: {
    id: string;
    name: string;
    type?: string;
    level?: number;
  } | null;
  district?: {
    id: string;
    name: string;
  } | null;
};

type OverviewResponse = {
  ok: true;
  scope?: {
    isSuperAdmin?: boolean;
    zoneCount?: number;
    tenantCount?: number;
    assignments?: Array<{
      id: string;
      role: string;
      zoneId: string;
      zoneName: string;
      zoneLevel: number;
      zoneTypeName: string;
      parentZoneName?: string | null;
    }>;
  };
  overview?: {
    schools?: SchoolRow[];
    totals?: Record<string, number>;
    signals?: Record<string, number>;
  };
};

type ErrorResponse = {
  ok: false;
  error: string;
  role?: string;
  path?: string;
};

type Props = {
  endpoint: string;
  title: string;
  eyebrow: string;
  description: string;
  loginMode?: "governance" | "school";
};

function formatLabel(v: string) {
  return v
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}

function numberValue(v: unknown) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export default function GovernanceDashboardClient({
  endpoint,
  title,
  eyebrow,
  description,
  loginMode = "governance",
}: Props) {
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(endpoint, {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });

      const json = (await res.json().catch(() => null)) as OverviewResponse | ErrorResponse | null;

      if (!res.ok || !json?.ok) {
        const e = json && !json.ok ? json.error : `Failed to load dashboard (${res.status})`;
        setData(null);
        setError(e);
        return;
      }

      setData(json);
    } catch {
      setData(null);
      setError("Network/server error while loading dashboard.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint]);

  const assignments = data?.scope?.assignments ?? [];
  const schools = data?.overview?.schools ?? [];
  const totals = data?.overview?.totals ?? {};
  const signals = data?.overview?.signals ?? {};

  const primaryAssignment = assignments[0] ?? null;

  const totalCards = useMemo(() => {
    const preferred = ["schools", "learners", "teachers", "circuits", "districts"];

    return preferred
      .filter((k) => Object.prototype.hasOwnProperty.call(totals, k))
      .map((key) => ({ key, label: formatLabel(key), value: numberValue(totals[key]) }));
  }, [totals]);

  const signalCards = useMemo(() => {
    return Object.entries(signals).map(([key, value]) => ({
      key,
      label: formatLabel(key),
      value: numberValue(value),
    }));
  }, [signals]);

  function logout() {
    signOut({
      callbackUrl:
        loginMode === "governance"
          ? "/auth/signin?mode=governance"
          : "/auth/signin",
    });
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/30">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-300">
                {eyebrow}
              </p>

              <h1 className="mt-3 text-3xl font-bold tracking-tight text-white">
                {title}
              </h1>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
                {description}
              </p>

              {primaryAssignment ? (
                <div className="mt-4 inline-flex rounded-2xl border border-amber-300/25 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
                  {primaryAssignment.role.replaceAll("_", " ")} · {primaryAssignment.zoneName}
                  {primaryAssignment.parentZoneName ? ` · ${primaryAssignment.parentZoneName}` : ""}
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={load}
                disabled={loading}
                className="h-10 rounded-xl border border-white/15 bg-white/5 px-4 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-60"
              >
                {loading ? "Loading..." : "Reload"}
              </button>

              <button
                type="button"
                onClick={logout}
                className="h-10 rounded-xl border border-red-300/30 bg-red-500/10 px-4 text-sm font-semibold text-red-100 hover:bg-red-500/20"
              >
                Logout
              </button>
            </div>
          </div>
        </section>

        {error ? (
          <section className="rounded-3xl border border-red-300/20 bg-red-500/10 p-5 text-sm text-red-100">
            {error}
          </section>
        ) : null}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {totalCards.length ? (
            totalCards.map((c) => (
              <div key={c.key} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                  {c.label}
                </p>
                <p className="mt-2 text-3xl font-bold text-white">{c.value}</p>
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 text-sm text-slate-300">
              {loading ? "Loading totals..." : "No totals available yet."}
            </div>
          )}
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
            <h2 className="text-lg font-bold text-white">Schools in Scope</h2>
            <p className="mt-1 text-sm text-slate-300">
              Only schools inside this officer’s authorized jurisdiction should appear here.
            </p>

            <div className="mt-5 space-y-3">
              {loading ? (
                <div className="text-sm text-slate-300">Loading schools...</div>
              ) : schools.length ? (
                schools.map((school) => (
                  <div key={school.id} className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="font-semibold text-white">{school.name}</p>
                        <p className="mt-1 text-xs text-slate-400">
                          {school.schoolCode || "No school code"} · {school.status}
                        </p>
                        <p className="mt-2 text-xs text-slate-300">
                          Circuit: {school.circuit?.name || "—"} · District:{" "}
                          {school.district?.name || "—"}
                        </p>
                      </div>

                      <span className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-100">
                        In scope
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4 text-sm text-slate-300">
                  No schools found in this jurisdiction.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
            <h2 className="text-lg font-bold text-white">Live Signals</h2>
            <p className="mt-1 text-sm text-slate-300">
              Early oversight signals from attendance, health, assessment, and lesson delivery.
            </p>

            <div className="mt-5 grid gap-3">
              {loading ? (
                <div className="text-sm text-slate-300">Loading signals...</div>
              ) : signalCards.length ? (
                signalCards.map((s) => (
                  <div
                    key={s.key}
                    className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3"
                  >
                    <span className="text-sm text-slate-300">{s.label}</span>
                    <span className="text-lg font-bold text-white">{s.value}</span>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4 text-sm text-slate-300">
                  No signals available yet.
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}