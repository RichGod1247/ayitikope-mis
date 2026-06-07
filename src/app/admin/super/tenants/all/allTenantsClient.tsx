// src/app/admin/super/tenants/all/allTenantsClient.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type TenantStatus = "PENDING" | "ACTIVE" | "SUSPENDED" | "ARCHIVED";
type StatusFilter = "ALL" | TenantStatus;
type SectorFilter = "ALL" | "PUBLIC" | "PRIVATE";

type Person = {
  id: string;
  email: string;
  name: string | null;
};

type ZoneSummary = {
  id: string;
  name: string;
  zoneType: { name: string; level: number };
  parentZone: { id: string; name: string } | null;
};

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
  zone: ZoneSummary | null;
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
  updatedAt?: string | null;
  metadata?: Record<string, unknown> | null;
  zone: ZoneSummary;
  createdBy?: Person | null;
  acceptedBy?: Person | null;
  revokedBy?: Person | null;
};

type GovernanceAssignment = {
  id: string;
  role: string;
  title: string | null;
  phone: string | null;
  status: string;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
  updatedAt: string;
  revokedAt: string | null;
  revokeReason: string | null;
  metadata?: Record<string, unknown> | null;
  user: Person;
  zone: ZoneSummary;
  createdBy?: Person | null;
  revokedBy?: Person | null;
};

type GovernanceState = {
  invites: GovernanceInvite[];
  assignments: GovernanceAssignment[];
};

type GovernanceLifecycleAction =
  | "REVOKE_INVITE"
  | "SUSPEND_ASSIGNMENT"
  | "REVOKE_ASSIGNMENT"
  | "REACTIVATE_ASSIGNMENT";

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

function governanceStatusBadgeClass(status: string) {
  if (status === "ACTIVE" || status === "ACCEPTED") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (status === "PENDING") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  if (status === "SUSPENDED") {
    return "border-orange-200 bg-orange-50 text-orange-700";
  }

  if (status === "REVOKED" || status === "EXPIRED") {
    return "border-red-200 bg-red-50 text-red-700";
  }

  return "border-slate-300 bg-slate-100 text-slate-700";
}

function actionLabel(action: string) {
  return action.replaceAll("_", " ").toLowerCase();
}

function personLabel(person?: Person | null) {
  if (!person) return "—";
  return person.name || person.email;
}

function dateLabel(value?: string | null) {
  if (!value) return "—";

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;

  return d.toLocaleString();
}

function zoneLabel(zone: ZoneSummary) {
  return `${zone.name} (${zone.zoneType.name})`;
}

function lifecycleButtonClass(tone: "warning" | "danger" | "success") {
  if (tone === "danger") {
    return "h-8 rounded-xl border border-red-200 bg-red-50 px-3 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60";
  }

  if (tone === "success") {
    return "h-8 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-60";
  }

  return "h-8 rounded-xl border border-orange-200 bg-orange-50 px-3 text-xs font-semibold text-orange-700 hover:bg-orange-100 disabled:opacity-60";
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

  const assignmentCounts = useMemo(() => {
    return governance.assignments.reduce(
      (acc, item) => {
        const key = item.status.toUpperCase();
        acc[key] = (acc[key] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );
  }, [governance.assignments]);

  const inviteCounts = useMemo(() => {
    return governance.invites.reduce(
      (acc, item) => {
        const key = item.status.toUpperCase();
        acc[key] = (acc[key] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );
  }, [governance.invites]);

  async function loadTenants() {
    setLoading(true);
    setMsg(null);

    try {
      const url =
        `/api/admin/super/tenants/all/list?status=${encodeURIComponent(status)}` +
        `&sector=${encodeURIComponent(sector)}` +
        `&q=${encodeURIComponent(q.trim())}`;

      const r = await fetch(url, {
        cache: "no-store",
        credentials: "include",
      });
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
        credentials: "include",
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
        `Reason for ${actionLabel(action)}:\n\nThis will be written into the audit log.`
      );

      if (entered === null) return;

      reason = entered.trim();

      if (reason.length < 10) {
        setMsg("Provide a clear reason of at least 10 characters.");
        return;
      }
    }

    const ok = window.confirm(
      `Confirm ${actionLabel(action)} for ${tenant.name} (${tenant.schoolCode})?`
    );

    if (!ok) return;

    setBusyId(tenant.id);
    setMsg(null);

    try {
      const r = await fetch("/api/admin/super/tenants/status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
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

  async function updateGovernanceLifecycle(args: {
    action: GovernanceLifecycleAction;
    assignment?: GovernanceAssignment;
    invite?: GovernanceInvite;
  }) {
    const targetLabel = args.assignment
      ? `${args.assignment.user.name || args.assignment.user.email} · ${args.assignment.role} · ${args.assignment.zone.name}`
      : args.invite
        ? `${args.invite.email} · ${args.invite.role} · ${args.invite.zone.name}`
        : "governance officer";

    const entered = window.prompt(
      `Reason for ${actionLabel(args.action)}:\n\nThis reason will be written into the governance audit log.`
    );

    if (entered === null) return;

    const reason = entered.trim();

    if (reason.length < 10) {
      setGovMsg("Provide a clear governance lifecycle reason of at least 10 characters.");
      return;
    }

    const ok = window.confirm(`Confirm ${actionLabel(args.action)} for ${targetLabel}?`);
    if (!ok) return;

    const id = args.assignment?.id || args.invite?.id || "";
    setBusyId(`gov:${args.action}:${id}`);
    setGovMsg(null);

    try {
      const r = await fetch("/api/admin/governance/officers/lifecycle", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: args.action,
          assignmentId: args.assignment?.id,
          inviteId: args.invite?.id,
          reason,
        }),
      });

      const j = await r.json().catch(() => ({} as any));

      if (!r.ok || !j?.ok) {
        setGovMsg(j?.message || j?.error || `Governance lifecycle action failed (${r.status})`);
        return;
      }

      setGovMsg(`Governance lifecycle action completed: ${actionLabel(args.action)}.`);
      await loadGovernance();
    } catch {
      setGovMsg("Network/server error updating governance lifecycle.");
    } finally {
      setBusyId(null);
    }
  }

  useEffect(() => {
    void loadAll();
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
            onClick={() => void loadTenants()}
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
            These are school workspaces. Governance officers are shown separately below
            so tenant onboarding and governance onboarding are not mixed.
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
                        Created: {dateLabel(t.createdAt)} • slug:{" "}
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
                          onClick={() => void updateTenantStatus(t, "ACTIVATE")}
                          className="h-9 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-sm text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
                        >
                          Activate
                        </button>
                      ) : null}

                      {t.status !== "SUSPENDED" && t.status !== "ARCHIVED" ? (
                        <button
                          disabled={busy}
                          onClick={() => void updateTenantStatus(t, "SUSPEND")}
                          className="h-9 rounded-xl border border-orange-200 bg-orange-50 px-3 text-sm text-orange-700 hover:bg-orange-100 disabled:opacity-60"
                        >
                          Suspend
                        </button>
                      ) : null}

                      {t.status !== "ARCHIVED" ? (
                        <button
                          disabled={busy}
                          onClick={() => void updateTenantStatus(t, "ARCHIVE")}
                          className="h-9 rounded-xl border border-slate-300 bg-slate-50 px-3 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-60"
                        >
                          Archive
                        </button>
                      ) : (
                        <button
                          disabled={busy}
                          onClick={() => void updateTenantStatus(t, "RESTORE_TO_PENDING")}
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
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-sm font-semibold text-zinc-950">
              Governance officer lifecycle registry
            </div>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-zinc-600">
              Governance officers are not school tenants. They are jurisdiction officers
              assigned to circuits, districts, regions, or national zones. This registry
              shows current authority and historical authority so suspended or revoked
              officers do not disappear.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void loadGovernance()}
            disabled={govLoading}
            className="h-9 rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
          >
            {govLoading ? "Reloading…" : "Reload governance"}
          </button>
        </div>

        <div className="grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-6">
          <GovStat label="Assignments" value={governance.assignments.length} />
          <GovStat label="Active" value={assignmentCounts.ACTIVE ?? 0} tone="success" />
          <GovStat label="Suspended" value={assignmentCounts.SUSPENDED ?? 0} tone="warning" />
          <GovStat label="Revoked" value={assignmentCounts.REVOKED ?? 0} tone="danger" />
          <GovStat label="Pending invites" value={inviteCounts.PENDING ?? 0} tone="warning" />
          <GovStat label="Accepted invites" value={inviteCounts.ACCEPTED ?? 0} tone="success" />
        </div>

        {govMsg ? (
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
            {govMsg}
          </div>
        ) : null}

        {govLoading ? (
          <div className="text-sm text-zinc-600">Loading governance onboarding…</div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            <div className="rounded-xl border p-4">
              <div className="text-sm font-semibold text-zinc-900">
                Governance assignments
              </div>
              <div className="mt-1 text-xs text-zinc-500">
                {governance.assignments.length} recent assignment record(s)
              </div>

              <div className="mt-3 space-y-2">
                {governance.assignments.length === 0 ? (
                  <div className="text-xs text-zinc-500">No governance assignments.</div>
                ) : (
                  governance.assignments.slice(0, 30).map((a) => {
                    const busy =
                      busyId === `gov:SUSPEND_ASSIGNMENT:${a.id}` ||
                      busyId === `gov:REVOKE_ASSIGNMENT:${a.id}` ||
                      busyId === `gov:REACTIVATE_ASSIGNMENT:${a.id}`;

                    return (
                      <div key={a.id} className="rounded-lg border bg-zinc-50 p-3 text-xs">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-semibold text-zinc-900">
                                {a.user.name || a.user.email}
                              </span>
                              <span
                                className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold ${governanceStatusBadgeClass(
                                  a.status
                                )}`}
                              >
                                {a.status}
                              </span>
                            </div>

                            <div className="text-zinc-600">
                              {a.role} • {zoneLabel(a.zone)}
                              {a.zone.parentZone ? ` • ${a.zone.parentZone.name}` : ""}
                            </div>

                            {a.title ? (
                              <div className="text-zinc-600">Title: {a.title}</div>
                            ) : null}

                            <div className="text-zinc-500">
                              Created: {dateLabel(a.createdAt)} • Updated:{" "}
                              {dateLabel(a.updatedAt)}
                            </div>

                            <div className="text-zinc-500">
                              Starts: {dateLabel(a.startsAt)} • Ends: {dateLabel(a.endsAt)}
                            </div>

                            <div className="text-zinc-500">
                              Created by: {personLabel(a.createdBy)} • Revoked by:{" "}
                              {personLabel(a.revokedBy)}
                            </div>

                            {a.revokedAt ? (
                              <div className="text-red-700">
                                Revoked: {dateLabel(a.revokedAt)}
                              </div>
                            ) : null}

                            {a.revokeReason ? (
                              <div className="rounded-lg border border-orange-100 bg-orange-50 px-2 py-1 text-orange-800">
                                Reason: {a.revokeReason}
                              </div>
                            ) : null}
                          </div>

                          <div className="flex flex-wrap gap-2">
                            {a.status === "ACTIVE" ? (
                              <>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() =>
                                    void updateGovernanceLifecycle({
                                      action: "SUSPEND_ASSIGNMENT",
                                      assignment: a,
                                    })
                                  }
                                  className={lifecycleButtonClass("warning")}
                                >
                                  Suspend
                                </button>

                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() =>
                                    void updateGovernanceLifecycle({
                                      action: "REVOKE_ASSIGNMENT",
                                      assignment: a,
                                    })
                                  }
                                  className={lifecycleButtonClass("danger")}
                                >
                                  Revoke
                                </button>
                              </>
                            ) : null}

                            {a.status === "SUSPENDED" ? (
                              <>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() =>
                                    void updateGovernanceLifecycle({
                                      action: "REACTIVATE_ASSIGNMENT",
                                      assignment: a,
                                    })
                                  }
                                  className={lifecycleButtonClass("success")}
                                >
                                  Reactivate
                                </button>

                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() =>
                                    void updateGovernanceLifecycle({
                                      action: "REVOKE_ASSIGNMENT",
                                      assignment: a,
                                    })
                                  }
                                  className={lifecycleButtonClass("danger")}
                                >
                                  Revoke
                                </button>
                              </>
                            ) : null}

                            {a.status === "REVOKED" ? (
                              <span className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-[11px] font-semibold text-zinc-500">
                                Historical record
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="rounded-xl border p-4">
              <div className="text-sm font-semibold text-zinc-900">
                Governance invites
              </div>
              <div className="mt-1 text-xs text-zinc-500">
                {governance.invites.length} recent invite record(s)
              </div>

              <div className="mt-3 space-y-2">
                {governance.invites.length === 0 ? (
                  <div className="text-xs text-zinc-500">No governance invites.</div>
                ) : (
                  governance.invites.slice(0, 30).map((i) => {
                    const busy = busyId === `gov:REVOKE_INVITE:${i.id}`;
                    const canRevoke =
                      i.status === "PENDING" && !i.acceptedAt && !i.revokedAt;

                    return (
                      <div key={i.id} className="rounded-lg border bg-zinc-50 p-3 text-xs">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-semibold text-zinc-900">{i.email}</span>
                              <span
                                className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold ${governanceStatusBadgeClass(
                                  i.status
                                )}`}
                              >
                                {i.status}
                              </span>
                            </div>

                            <div className="text-zinc-600">
                              {i.role} • {zoneLabel(i.zone)}
                              {i.zone.parentZone ? ` • ${i.zone.parentZone.name}` : ""}
                            </div>

                            <div className="text-zinc-500">
                              Created: {dateLabel(i.createdAt)} • Expires:{" "}
                              {dateLabel(i.expiresAt)}
                            </div>

                            <div className="text-zinc-500">
                              Accepted: {dateLabel(i.acceptedAt)} • Revoked:{" "}
                              {dateLabel(i.revokedAt)}
                            </div>

                            <div className="text-zinc-500">
                              Created by: {personLabel(i.createdBy)} • Accepted by:{" "}
                              {personLabel(i.acceptedBy)} • Revoked by:{" "}
                              {personLabel(i.revokedBy)}
                            </div>

                            {i.phone ? (
                              <div className="text-zinc-500">Phone: {i.phone}</div>
                            ) : null}
                          </div>

                          <div className="flex flex-wrap gap-2">
                            {canRevoke ? (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() =>
                                  void updateGovernanceLifecycle({
                                    action: "REVOKE_INVITE",
                                    invite: i,
                                  })
                                }
                                className={lifecycleButtonClass("danger")}
                              >
                                Revoke invite
                              </button>
                            ) : (
                              <span className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-[11px] font-semibold text-zinc-500">
                                No pending action
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
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

function GovStat(props: {
  label: string;
  value: number;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  const toneClass =
    props.tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : props.tone === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : props.tone === "danger"
          ? "border-red-200 bg-red-50 text-red-700"
          : "border-zinc-200 bg-zinc-50 text-zinc-700";

  return (
    <div className={`rounded-lg border px-3 py-2 ${toneClass}`}>
      <div className="font-semibold">{props.value}</div>
      <div className="text-[10px] uppercase tracking-wide">{props.label}</div>
    </div>
  );
}