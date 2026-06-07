// src/app/admin/super/tenants/all/allTenantsClient.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type TenantStatus = "PENDING" | "ACTIVE" | "SUSPENDED" | "ARCHIVED";
type StatusFilter = "ALL" | TenantStatus;
type SectorFilter = "ALL" | "PUBLIC" | "PRIVATE";

type TenantItem = {
  id: string;
  name: string;
  schoolCode: string;
  slug: string;
  status: TenantStatus;
  schoolSector: "PUBLIC" | "PRIVATE";
  emisCode: string | null;
  district: string | null;
  circuit: string | null;
  region: string | null;
  createdAt: string;
  updatedAt: string;
  contactEmail: string | null;
  contactPhoneNorm: string | null;
  zone: {
    id: string;
    name: string;
    zoneType: { name: string; level: number };
    parentZone: { id: string; name: string } | null;
  } | null;
  usage: {
    memberships: number;
    students: number;
    teachers: number;
    lessonNotes: number;
    feeInvoices: number;
    governanceCases: number;
  };
};

type GovernanceInvite = {
  id: string;
  email: string;
  phone: string | null;
  role: string;
  status: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  zone: {
    id: string;
    name: string;
    zoneType: { name: string; level: number };
    parentZone: { id: string; name: string } | null;
  };
};

type GovernanceAssignment = {
  id: string;
  role: string;
  title: string | null;
  phone: string | null;
  status: string;
  createdAt: string;
  user: { id: string; email: string; name: string | null };
  zone: {
    id: string;
    name: string;
    zoneType: { name: string; level: number };
    parentZone: { id: string; name: string } | null;
  };
};

type GovernanceState = {
  invites: GovernanceInvite[];
  assignments: GovernanceAssignment[];
};

function schoolSectorLabel(sector: TenantItem["schoolSector"]) {
  return sector === "PRIVATE" ? "Private School" : "Public School";
}

function officialIdentifierLabel(sector: TenantItem["schoolSector"]) {
  return sector === "PRIVATE"
    ? "EMIS / NaSIA / registration code"
    : "EMIS code";
}

function statusBadgeClass(status: TenantStatus) {
  if (status === "ACTIVE") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "PENDING") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "SUSPENDED") return "border-orange-200 bg-orange-50 text-orange-700";
  return "border-slate-300 bg-slate-100 text-slate-700";
}

export default function AllTenantsClient() {
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [sector, setSector] = useState<SectorFilter>("ALL");
  const [q, setQ] = useState("");

  const [items, setItems] = useState<TenantItem[]>([]);
  const [governance, setGovernance] = useState<GovernanceState>({
    invites: [],
    assignments: [],
  });

  const [loading, setLoading] = useState(true);
  const [govLoading, setGovLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [govMsg, setGovMsg] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const canSearch = useMemo(() => true, []);

  async function loadTenants() {
    setLoading(true);
    setMsg(null);

    try {
      const url =
        `/api/admin/super/tenants/all/list?status=${encodeURIComponent(status)}` +
        `&sector=${encodeURIComponent(sector)}` +
        `&q=${encodeURIComponent(q.trim())}`;

      const r = await fetch(url, { cache: "no-store" });
      const j = await r.json().catch(() => ({} as any));

      if (!r.ok || !j?.ok) {
        setMsg(j?.error || `Failed (${r.status})`);
        setItems([]);
        return;
      }

      setItems(j.items || []);
    } catch {
      setMsg("Network/server error.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadGovernance() {
    setGovLoading(true);
    setGovMsg(null);

    try {
      const r = await fetch("/api/admin/governance/officers/list", {
        cache: "no-store",
      });
      const j = await r.json().catch(() => ({} as any));

      if (!r.ok || !j?.ok) {
        setGovMsg(j?.error || `Governance load failed (${r.status})`);
        setGovernance({ invites: [], assignments: [] });
        return;
      }

      setGovernance({
        invites: j.invites || [],
        assignments: j.assignments || [],
      });
    } catch {
      setGovMsg("Network/server error loading governance onboarding.");
      setGovernance({ invites: [], assignments: [] });
    } finally {
      setGovLoading(false);
    }
  }

  async function loadAll() {
    await Promise.all([loadTenants(), loadGovernance()]);
  }

  async function updateTenantStatus(tenant: TenantItem, action: string) {
    let reason = "";

    if (action === "SUSPEND" || action === "ARCHIVE" || action === "RESTORE_TO_PENDING") {
      const entered = window.prompt(
        `Reason for ${action.replaceAll("_", " ").toLowerCase()}:\n\nThis will be written into the audit log.`
      );

      if (entered === null) return;

      reason = entered.trim();

      if (reason.length < 10) {
        setMsg("Provide a clear reason of at least 10 characters.");
        return;
      }
    }

    const ok = window.confirm(
      `Confirm ${action.replaceAll("_", " ").toLowerCase()} for ${tenant.name} (${tenant.schoolCode})?`
    );

    if (!ok) return;

    setBusyId(tenant.id);
    setMsg(null);

    try {
      const r = await fetch("/api/admin/super/tenants/status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId: tenant.id,
          action,
          reason: reason || undefined,
        }),
      });

      const j = await r.json().catch(() => ({} as any));

      if (!r.ok || !j?.ok) {
        setMsg(j?.message || j?.error || `Action failed (${r.status})`);
        return;
      }

      setMsg(`${tenant.name} updated successfully.`);
      await loadTenants();
    } catch {
      setMsg("Network/server error updating tenant.");
    } finally {
      setBusyId(null);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, sector]);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border bg-white p-5 shadow-sm space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <select
            className="h-10 rounded-xl border px-3 text-sm"
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusFilter)}
          >
            <option value="ALL">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="PENDING">Pending</option>
            <option value="SUSPENDED">Suspended</option>
            <option value="ARCHIVED">Archived</option>
          </select>

          <select
            className="h-10 rounded-xl border px-3 text-sm"
            value={sector}
            onChange={(e) => setSector(e.target.value as SectorFilter)}
          >
            <option value="ALL">All sectors</option>
            <option value="PUBLIC">Public schools</option>
            <option value="PRIVATE">Private schools</option>
          </select>

          <input
            className="h-10 flex-1 rounded-xl border px-3 text-sm"
            placeholder="Search by name, code, slug, official ID, email, phone…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />

          <button
            disabled={!canSearch}
            onClick={loadTenants}
            className="h-10 rounded-xl border border-black bg-black px-4 text-sm text-white hover:bg-zinc-800 disabled:opacity-60"
          >
            Search
          </button>

          {msg ? <div className="text-sm text-zinc-700">{msg}</div> : null}
        </div>

        <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-3">
          <div className="text-sm font-semibold text-indigo-950">
            School tenant registry
          </div>
          <p className="mt-1 text-xs text-indigo-900/80">
            These are school workspaces. Governance officers are shown separately
            below so tenant onboarding and governance onboarding are not mixed.
          </p>
        </div>

        {loading ? (
          <div className="text-sm text-zinc-600">Loading tenants…</div>
        ) : items.length === 0 ? (
          <div className="text-sm text-zinc-600">No tenants found.</div>
        ) : (
          <div className="space-y-3">
            {items.map((t) => {
              const busy = busyId === t.id;

              return (
                <div key={t.id} className="rounded-xl border p-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 space-y-2">
                      <div className="font-medium text-zinc-900">
                        {t.name}{" "}
                        <span className="text-xs text-zinc-500">({t.schoolCode})</span>
                        <span
                          className={`ml-2 inline-flex rounded-full border px-2 py-1 text-[10px] ${statusBadgeClass(
                            t.status
                          )}`}
                        >
                          {t.status}
                        </span>
                      </div>

                      <div className="text-xs text-zinc-600">
                        Sector:{" "}
                        <span className="font-semibold">
                          {schoolSectorLabel(t.schoolSector)}
                        </span>{" "}
                        • {officialIdentifierLabel(t.schoolSector)}:{" "}
                        <span className="font-mono font-semibold">
                          {t.emisCode || "—"}
                        </span>
                      </div>

                      <div className="text-xs text-zinc-600">
                        Created: {new Date(t.createdAt).toLocaleString()} • slug:{" "}
                        <span className="font-mono">{t.slug}</span>
                      </div>

                      <div className="text-xs text-zinc-600">
                        Contact: {t.contactEmail || "—"} • {t.contactPhoneNorm || "—"}
                      </div>

                      <div className="text-xs text-zinc-600">
                        Location: {t.region || "—"} / {t.district || "—"} /{" "}
                        {t.circuit || "—"}
                      </div>

                      <div className="grid gap-2 text-xs text-zinc-700 sm:grid-cols-3 lg:grid-cols-6">
                        <Stat label="Users" value={t.usage.memberships} />
                        <Stat label="Students" value={t.usage.students} />
                        <Stat label="Teachers" value={t.usage.teachers} />
                        <Stat label="Lesson notes" value={t.usage.lessonNotes} />
                        <Stat label="Invoices" value={t.usage.feeInvoices} />
                        <Stat label="Gov cases" value={t.usage.governanceCases} />
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {t.status !== "ACTIVE" ? (
                        <button
                          disabled={busy}
                          onClick={() => updateTenantStatus(t, "ACTIVATE")}
                          className="h-9 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-sm text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
                        >
                          Activate
                        </button>
                      ) : null}

                      {t.status !== "SUSPENDED" && t.status !== "ARCHIVED" ? (
                        <button
                          disabled={busy}
                          onClick={() => updateTenantStatus(t, "SUSPEND")}
                          className="h-9 rounded-xl border border-orange-200 bg-orange-50 px-3 text-sm text-orange-700 hover:bg-orange-100 disabled:opacity-60"
                        >
                          Suspend
                        </button>
                      ) : null}

                      {t.status !== "ARCHIVED" ? (
                        <button
                          disabled={busy}
                          onClick={() => updateTenantStatus(t, "ARCHIVE")}
                          className="h-9 rounded-xl border border-slate-300 bg-slate-50 px-3 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-60"
                        >
                          Archive
                        </button>
                      ) : (
                        <button
                          disabled={busy}
                          onClick={() => updateTenantStatus(t, "RESTORE_TO_PENDING")}
                          className="h-9 rounded-xl border border-amber-200 bg-amber-50 px-3 text-sm text-amber-700 hover:bg-amber-100 disabled:opacity-60"
                        >
                          Restore to pending
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-2xl border bg-white p-5 shadow-sm space-y-4">
        <div>
          <div className="text-sm font-semibold text-zinc-950">
            Governance onboarding registry
          </div>
          <p className="mt-1 text-xs text-zinc-600">
            Governance officers are not school tenants. They are jurisdiction
            officers assigned to circuits, districts, regions, or national zones.
          </p>
        </div>

        {govMsg ? <div className="text-sm text-zinc-700">{govMsg}</div> : null}

        {govLoading ? (
          <div className="text-sm text-zinc-600">Loading governance onboarding…</div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border p-4">
              <div className="text-sm font-semibold text-zinc-900">
                Active governance assignments
              </div>
              <div className="mt-1 text-xs text-zinc-500">
                {governance.assignments.length} active assignment(s)
              </div>

              <div className="mt-3 space-y-2">
                {governance.assignments.length === 0 ? (
                  <div className="text-xs text-zinc-500">No active assignments.</div>
                ) : (
                  governance.assignments.slice(0, 10).map((a) => (
                    <div key={a.id} className="rounded-lg border bg-zinc-50 p-3 text-xs">
                      <div className="font-semibold text-zinc-900">
                        {a.user.name || a.user.email}
                      </div>
                      <div className="text-zinc-600">
                        {a.role} • {a.zone.name} ({a.zone.zoneType.name})
                      </div>
                      <div className="text-zinc-500">
                        Created: {new Date(a.createdAt).toLocaleString()}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-xl border p-4">
              <div className="text-sm font-semibold text-zinc-900">
                Governance invites
              </div>
              <div className="mt-1 text-xs text-zinc-500">
                {governance.invites.length} recent invite(s)
              </div>

              <div className="mt-3 space-y-2">
                {governance.invites.length === 0 ? (
                  <div className="text-xs text-zinc-500">No governance invites.</div>
                ) : (
                  governance.invites.slice(0, 10).map((i) => (
                    <div key={i.id} className="rounded-lg border bg-zinc-50 p-3 text-xs">
                      <div className="font-semibold text-zinc-900">{i.email}</div>
                      <div className="text-zinc-600">
                        {i.role} • {i.zone.name} ({i.zone.zoneType.name})
                      </div>
                      <div className="text-zinc-500">
                        Status: {i.status} • Expires:{" "}
                        {new Date(i.expiresAt).toLocaleString()}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function Stat(props: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-zinc-50 px-2 py-2">
      <div className="font-semibold text-zinc-900">{props.value}</div>
      <div className="text-[10px] uppercase tracking-wide text-zinc-500">
        {props.label}
      </div>
    </div>
  );
}