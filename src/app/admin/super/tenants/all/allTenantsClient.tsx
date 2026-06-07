// src/app/admin/super/tenants/all/allTenantsClient.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type TenantStatus = "PENDING" | "ACTIVE" | "SUSPENDED" | "ARCHIVED";
type StatusFilter = "ALL" | TenantStatus;
type SectorFilter = "ALL" | "PUBLIC" | "PRIVATE";
type RegistryView = "SCHOOLS" | "GOVERNANCE";
type GovernanceView = "CIRCUIT" | "DISTRICT" | "REGIONAL" | "INVITES";
type GovernanceStatusFilter = "ALL" | "ACTIVE" | "SUSPENDED" | "REVOKED" | "PENDING" | "ACCEPTED" | "EXPIRED";

type Person = {
  id: string;
  email: string;
  name: string | null;
};

type ZoneSummary = {
  id: string;
  name: string;
  code?: string | null;
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
  startsAt?: string | null;
  endsAt?: string | null;
  createdAt: string;
  updatedAt?: string | null;
  revokedAt?: string | null;
  revokeReason?: string | null;
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

type TenantsResponse = {
  ok: boolean;
  items?: TenantItem[];
  error?: string;
  message?: string;
};

type GovernanceListResponse = {
  ok: boolean;
  zones?: ZoneSummary[];
  invites?: GovernanceInvite[];
  assignments?: GovernanceAssignment[];
  error?: string;
  message?: string;
};

type ActionResponse = {
  ok: boolean;
  item?: unknown;
  oldAssignment?: unknown;
  newAssignment?: unknown;
  error?: string;
  message?: string;
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

function statusBadgeClass(status: string) {
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

function soft(value: string | null | undefined) {
  return value && value.trim() ? value : "—";
}

function dateLabel(value?: string | null) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString();
}

function actionLabel(action: string) {
  return action.replaceAll("_", " ").toLowerCase();
}

function personLabel(person?: Person | null) {
  if (!person) return "—";
  return person.name || person.email;
}

function zoneLabel(zone: ZoneSummary) {
  const parent = zone.parentZone ? ` • ${zone.parentZone.name}` : "";
  return `${zone.name} (${zone.zoneType.name})${parent}`;
}

function haystack(value: Array<string | null | undefined>) {
  return value.join(" ").toLowerCase();
}

function roleExpectedZoneLevel(role: string) {
  const r = String(role || "").toUpperCase();

  if (r === "SISSO" || r === "CIRCUIT_SUPERVISOR") return 1;

  if (
    r === "DISTRICT_DIRECTOR" ||
    r === "DISTRICT_MIS_OFFICER" ||
    r === "DISTRICT_SHEP_OFFICER" ||
    r === "DISTRICT_ASSESSMENT_OFFICER"
  ) {
    return 2;
  }

  if (r === "REGIONAL_VIEWER") return 3;

  return null;
}

function reassignZoneOptions(assignment: GovernanceAssignment, zones: ZoneSummary[]) {
  const expectedLevel = roleExpectedZoneLevel(assignment.role);

  if (!expectedLevel) return [];

  return zones
    .filter((zone) => zone.zoneType.level === expectedLevel)
    .filter((zone) => zone.id !== assignment.zone.id)
    .sort((a, b) => zoneLabel(a).localeCompare(zoneLabel(b)));
}

function lifecycleButtonClass(tone: "warning" | "danger" | "success" | "info") {
  if (tone === "danger") {
    return "h-8 rounded-xl border border-red-200 bg-red-50 px-3 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60";
  }

  if (tone === "success") {
    return "h-8 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-60";
  }

  if (tone === "info") {
    return "h-8 rounded-xl border border-indigo-200 bg-indigo-50 px-3 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-60";
  }

  return "h-8 rounded-xl border border-orange-200 bg-orange-50 px-3 text-xs font-semibold text-orange-700 hover:bg-orange-100 disabled:opacity-60";
}

function viewButtonClass(active: boolean) {
  return active
    ? "rounded-2xl border border-black bg-black px-4 py-2 text-sm font-semibold text-white"
    : "rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50";
}

export default function AllTenantsClient() {
  const [registryView, setRegistryView] = useState<RegistryView>("SCHOOLS");
  const [governanceView, setGovernanceView] = useState<GovernanceView>("CIRCUIT");

  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [sector, setSector] = useState<SectorFilter>("ALL");
  const [q, setQ] = useState("");

  const [govStatus, setGovStatus] = useState<GovernanceStatusFilter>("ALL");
  const [govQ, setGovQ] = useState("");
  const [govRole, setGovRole] = useState("ALL");

  const [items, setItems] = useState<TenantItem[]>([]);
  const [governanceZones, setGovernanceZones] = useState<ZoneSummary[]>([]);
  const [governance, setGovernance] = useState<GovernanceState>({
    invites: [],
    assignments: [],
  });

  const [loading, setLoading] = useState(true);
  const [govLoading, setGovLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [govMsg, setGovMsg] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const roles = useMemo(() => {
    const found = new Set<string>();

    for (const assignment of governance.assignments) found.add(assignment.role);
    for (const invite of governance.invites) found.add(invite.role);

    return Array.from(found).sort();
  }, [governance.assignments, governance.invites]);

  const schoolCounts = useMemo(() => {
    return items.reduce(
      (acc, item) => {
        acc.total += 1;
        acc[item.status] = (acc[item.status] ?? 0) + 1;
        acc[item.schoolSector] = (acc[item.schoolSector] ?? 0) + 1;
        return acc;
      },
      {
        total: 0,
        ACTIVE: 0,
        PENDING: 0,
        SUSPENDED: 0,
        ARCHIVED: 0,
        PUBLIC: 0,
        PRIVATE: 0,
      } as Record<string, number>
    );
  }, [items]);

  const assignmentCounts = useMemo(() => {
    return governance.assignments.reduce(
      (acc, item) => {
        const key = item.status.toUpperCase();
        acc[key] = (acc[key] ?? 0) + 1;
        acc.total += 1;
        return acc;
      },
      { total: 0 } as Record<string, number>
    );
  }, [governance.assignments]);

  const inviteCounts = useMemo(() => {
    return governance.invites.reduce(
      (acc, item) => {
        const key = item.status.toUpperCase();
        acc[key] = (acc[key] ?? 0) + 1;
        acc.total += 1;
        return acc;
      },
      { total: 0 } as Record<string, number>
    );
  }, [governance.invites]);

  const filteredSchools = useMemo(() => {
    const term = q.trim().toLowerCase();

    if (!term) return items;

    return items.filter((school) => {
      return haystack([
        school.name,
        school.schoolCode,
        school.slug,
        school.emisCode,
        school.contactEmail,
        school.contactPhoneNorm,
        school.region,
        school.district,
        school.circuit,
        school.zone?.name,
        school.zone?.parentZone?.name,
      ]).includes(term);
    });
  }, [items, q]);

  const filteredAssignments = useMemo(() => {
    const term = govQ.trim().toLowerCase();

    return governance.assignments.filter((assignment) => {
      if (governanceView === "CIRCUIT" && assignment.zone.zoneType.level !== 1) return false;
      if (governanceView === "DISTRICT" && assignment.zone.zoneType.level !== 2) return false;
      if (governanceView === "REGIONAL" && assignment.zone.zoneType.level !== 3) return false;

      if (govStatus !== "ALL" && assignment.status !== govStatus) return false;
      if (govRole !== "ALL" && assignment.role !== govRole) return false;

      if (!term) return true;

      return haystack([
        assignment.user.name,
        assignment.user.email,
        assignment.role,
        assignment.title,
        assignment.phone,
        assignment.status,
        assignment.zone.name,
        assignment.zone.zoneType.name,
        assignment.zone.parentZone?.name,
        assignment.revokeReason,
      ]).includes(term);
    });
  }, [governance.assignments, governanceView, govQ, govRole, govStatus]);

  const filteredInvites = useMemo(() => {
    const term = govQ.trim().toLowerCase();

    return governance.invites.filter((invite) => {
      if (govStatus !== "ALL" && invite.status !== govStatus) return false;
      if (govRole !== "ALL" && invite.role !== govRole) return false;

      if (!term) return true;

      return haystack([
        invite.email,
        invite.phone,
        invite.role,
        invite.status,
        invite.zone.name,
        invite.zone.zoneType.name,
        invite.zone.parentZone?.name,
        invite.createdBy?.email,
        invite.createdBy?.name,
        invite.acceptedBy?.email,
        invite.acceptedBy?.name,
        invite.revokedBy?.email,
        invite.revokedBy?.name,
      ]).includes(term);
    });
  }, [governance.invites, govQ, govRole, govStatus]);

  async function loadTenants() {
    setLoading(true);
    setMsg(null);

    try {
      const url =
        `/api/admin/super/tenants/all/list?status=${encodeURIComponent(status)}` +
        `&sector=${encodeURIComponent(sector)}` +
        `&q=${encodeURIComponent(q.trim())}`;

      const response = await fetch(url, {
        cache: "no-store",
        credentials: "include",
      });

      const data = (await response.json().catch(() => null)) as TenantsResponse | null;

      if (!response.ok || !data?.ok) {
        setMsg(data?.message || data?.error || `Failed (${response.status})`);
        setItems([]);
        return;
      }

      setItems(data.items || []);
    } catch {
      setMsg("Network/server error loading schools.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadGovernance() {
    setGovLoading(true);
    setGovMsg(null);

    try {
      const response = await fetch("/api/admin/governance/officers/list", {
        cache: "no-store",
        credentials: "include",
      });

      const data = (await response.json().catch(() => null)) as GovernanceListResponse | null;

      if (!response.ok || !data?.ok) {
        setGovMsg(data?.message || data?.error || `Governance load failed (${response.status})`);
        setGovernance({ invites: [], assignments: [] });
        setGovernanceZones([]);
        return;
      }

      setGovernance({
        invites: data.invites || [],
        assignments: data.assignments || [],
      });
      setGovernanceZones(data.zones || []);
    } catch {
      setGovMsg("Network/server error loading governance registry.");
      setGovernance({ invites: [], assignments: [] });
      setGovernanceZones([]);
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
      const response = await fetch("/api/admin/super/tenants/status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          tenantId: tenant.id,
          action,
          reason: reason || undefined,
        }),
      });

      const data = (await response.json().catch(() => null)) as ActionResponse | null;

      if (!response.ok || !data?.ok) {
        setMsg(data?.message || data?.error || `Action failed (${response.status})`);
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
      const response = await fetch("/api/admin/governance/officers/lifecycle", {
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

      const data = (await response.json().catch(() => null)) as ActionResponse | null;

      if (!response.ok || !data?.ok) {
        setGovMsg(data?.message || data?.error || `Governance lifecycle action failed (${response.status})`);
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

  async function reassignGovernanceAssignment(assignment: GovernanceAssignment) {
    if (assignment.status !== "ACTIVE" || assignment.revokedAt) {
      setGovMsg("Only active assignments can be reassigned.");
      return;
    }

    const options = reassignZoneOptions(assignment, governanceZones);

    if (!options.length) {
      setGovMsg("No eligible target zone is available for this officer role.");
      return;
    }

    const optionText = options
      .slice(0, 50)
      .map((zone, index) => `${index + 1}. ${zoneLabel(zone)}`)
      .join("\n");

    const selectedRaw = window.prompt(
      `Select new zone for ${assignment.user.name || assignment.user.email}:\n\n${optionText}\n\nEnter option number.`
    );

    if (selectedRaw === null) return;

    const selectedIndex = Number(selectedRaw.trim()) - 1;
    const selectedZone = options[selectedIndex];

    if (!selectedZone) {
      setGovMsg("Invalid reassignment zone selection.");
      return;
    }

    const enteredReason = window.prompt(
      `Reason for reassigning ${assignment.user.name || assignment.user.email} from ${assignment.zone.name} to ${selectedZone.name}:\n\nThis will be written into the audit log.`
    );

    if (enteredReason === null) return;

    const reason = enteredReason.trim();

    if (reason.length < 10) {
      setGovMsg("Provide a clear reassignment reason of at least 10 characters.");
      return;
    }

    const ok = window.confirm(
      `Confirm reassignment?\n\nOfficer: ${assignment.user.name || assignment.user.email}\nRole: ${assignment.role}\nFrom: ${assignment.zone.name}\nTo: ${selectedZone.name}`
    );

    if (!ok) return;

    setBusyId(`gov:REASSIGN_ASSIGNMENT:${assignment.id}`);
    setGovMsg(null);

    try {
      const response = await fetch("/api/admin/governance/officers/reassign", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          assignmentId: assignment.id,
          newZoneId: selectedZone.id,
          reason,
        }),
      });

      const data = (await response.json().catch(() => null)) as ActionResponse | null;

      if (!response.ok || !data?.ok) {
        setGovMsg(data?.message || data?.error || `Governance reassignment failed (${response.status})`);
        return;
      }

      setGovMsg(`Governance reassignment completed: ${assignment.zone.name} → ${selectedZone.name}.`);
      await loadGovernance();
    } catch {
      setGovMsg("Network/server error reassigning governance officer.");
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
      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
              Superadmin Control Center
            </p>
            <h2 className="mt-1 text-xl font-semibold text-zinc-950">
              Schools and governance authority
            </h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-zinc-600">
              Schools are workspaces. Governance officers are authority assignments. Keep them separate, searchable, and auditable.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setRegistryView("SCHOOLS")}
              className={viewButtonClass(registryView === "SCHOOLS")}
            >
              Schools
            </button>
            <button
              type="button"
              onClick={() => setRegistryView("GOVERNANCE")}
              className={viewButtonClass(registryView === "GOVERNANCE")}
            >
              Governance officers
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-6">
          <MiniStat label="Schools" value={schoolCounts.total} />
          <MiniStat label="Active schools" value={schoolCounts.ACTIVE} tone="success" />
          <MiniStat label="Pending schools" value={schoolCounts.PENDING} tone="warning" />
          <MiniStat label="Assignments" value={assignmentCounts.total} />
          <MiniStat label="Active officers" value={assignmentCounts.ACTIVE ?? 0} tone="success" />
          <MiniStat label="Pending invites" value={inviteCounts.PENDING ?? 0} tone="warning" />
        </div>
      </section>

      {registryView === "SCHOOLS" ? (
        <section className="rounded-2xl border bg-white p-5 shadow-sm space-y-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
            <select
              className="h-10 rounded-xl border px-3 text-sm"
              value={status}
              onChange={(event) => setStatus(event.target.value as StatusFilter)}
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
              onChange={(event) => setSector(event.target.value as SectorFilter)}
            >
              <option value="ALL">All sectors</option>
              <option value="PUBLIC">Public schools</option>
              <option value="PRIVATE">Private schools</option>
            </select>

            <input
              className="h-10 flex-1 rounded-xl border px-3 text-sm"
              placeholder="Search school, circuit, district, code, official ID, email, phone…"
              value={q}
              onChange={(event) => setQ(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void loadTenants();
              }}
            />

            <button
              type="button"
              onClick={() => void loadTenants()}
              className="h-10 rounded-xl border border-black bg-black px-4 text-sm text-white hover:bg-zinc-800 disabled:opacity-60"
            >
              Search schools
            </button>
          </div>

          {msg ? (
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
              {msg}
            </div>
          ) : null}

          {loading ? (
            <div className="text-sm text-zinc-600">Loading schools…</div>
          ) : filteredSchools.length === 0 ? (
            <div className="text-sm text-zinc-600">No schools found.</div>
          ) : (
            <div className="space-y-3">
              {filteredSchools.map((school) => {
                const busy = busyId === school.id;

                return (
                  <div key={school.id} className="rounded-xl border p-4">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div className="min-w-0 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-zinc-950">{school.name}</span>
                          <span className="text-xs text-zinc-500">({school.schoolCode})</span>
                          <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold ${statusBadgeClass(school.status)}`}>
                            {school.status}
                          </span>
                          <span className="inline-flex rounded-full border border-indigo-100 bg-indigo-50 px-2 py-1 text-[10px] font-semibold text-indigo-700">
                            {schoolSectorLabel(school.schoolSector)}
                          </span>
                        </div>

                        <div className="text-xs text-zinc-600">
                          {officialIdentifierLabel(school.schoolSector)}:{" "}
                          <span className="font-mono font-semibold">{school.emisCode || "—"}</span>
                        </div>

                        <div className="text-xs text-zinc-600">
                          Location: {soft(school.region)} / {soft(school.district)} / {soft(school.circuit)}
                        </div>

                        <div className="text-xs text-zinc-600">
                          Governance zone: {school.zone ? zoneLabel(school.zone) : "—"}
                        </div>

                        <div className="text-xs text-zinc-600">
                          Contact: {soft(school.contactEmail)} • {soft(school.contactPhoneNorm)} • slug:{" "}
                          <span className="font-mono">{school.slug}</span>
                        </div>

                        <div className="grid gap-2 text-xs text-zinc-700 sm:grid-cols-3 lg:grid-cols-6">
                          <Stat label="Users" value={school.usage.memberships} />
                          <Stat label="Students" value={school.usage.students} />
                          <Stat label="Teachers" value={school.usage.teachers} />
                          <Stat label="Lesson notes" value={school.usage.lessonNotes} />
                          <Stat label="Invoices" value={school.usage.feeInvoices} />
                          <Stat label="Gov cases" value={school.usage.governanceCases} />
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {school.status !== "ACTIVE" ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void updateTenantStatus(school, "ACTIVATE")}
                            className="h-9 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
                          >
                            Activate
                          </button>
                        ) : null}

                        {school.status !== "SUSPENDED" && school.status !== "ARCHIVED" ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void updateTenantStatus(school, "SUSPEND")}
                            className="h-9 rounded-xl border border-orange-200 bg-orange-50 px-3 text-sm font-semibold text-orange-700 hover:bg-orange-100 disabled:opacity-60"
                          >
                            Suspend
                          </button>
                        ) : null}

                        {school.status !== "ARCHIVED" ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void updateTenantStatus(school, "ARCHIVE")}
                            className="h-9 rounded-xl border border-slate-300 bg-slate-50 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-60"
                          >
                            Archive
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void updateTenantStatus(school, "RESTORE_TO_PENDING")}
                            className="h-9 rounded-xl border border-amber-200 bg-amber-50 px-3 text-sm font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-60"
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
      ) : (
        <section className="rounded-2xl border bg-white p-5 shadow-sm space-y-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setGovernanceView("CIRCUIT")}
                className={viewButtonClass(governanceView === "CIRCUIT")}
              >
                Circuit / SISSO
              </button>
              <button
                type="button"
                onClick={() => setGovernanceView("DISTRICT")}
                className={viewButtonClass(governanceView === "DISTRICT")}
              >
                District directorate
              </button>
              <button
                type="button"
                onClick={() => setGovernanceView("REGIONAL")}
                className={viewButtonClass(governanceView === "REGIONAL")}
              >
                Regional
              </button>
              <button
                type="button"
                onClick={() => setGovernanceView("INVITES")}
                className={viewButtonClass(governanceView === "INVITES")}
              >
                Invites
              </button>
            </div>

            <button
              type="button"
              onClick={() => void loadGovernance()}
              disabled={govLoading}
              className="h-10 rounded-xl border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
            >
              {govLoading ? "Reloading…" : "Reload governance"}
            </button>
          </div>

          <div className="grid gap-3 xl:grid-cols-[180px_220px_1fr]">
            <select
              className="h-10 rounded-xl border px-3 text-sm"
              value={govStatus}
              onChange={(event) => setGovStatus(event.target.value as GovernanceStatusFilter)}
            >
              <option value="ALL">All statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="SUSPENDED">Suspended</option>
              <option value="REVOKED">Revoked</option>
              <option value="PENDING">Pending</option>
              <option value="ACCEPTED">Accepted</option>
              <option value="EXPIRED">Expired</option>
            </select>

            <select
              className="h-10 rounded-xl border px-3 text-sm"
              value={govRole}
              onChange={(event) => setGovRole(event.target.value)}
            >
              <option value="ALL">All roles</option>
              {roles.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>

            <input
              className="h-10 rounded-xl border px-3 text-sm"
              placeholder="Search officer, email, role, circuit, district, reason…"
              value={govQ}
              onChange={(event) => setGovQ(event.target.value)}
            />
          </div>

          {govMsg ? (
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
              {govMsg}
            </div>
          ) : null}

          {govLoading ? (
            <div className="text-sm text-zinc-600">Loading governance registry…</div>
          ) : governanceView === "INVITES" ? (
            <div className="space-y-3">
              {filteredInvites.length === 0 ? (
                <div className="text-sm text-zinc-600">No matching governance invites.</div>
              ) : (
                filteredInvites.map((invite) => {
                  const busy = busyId === `gov:REVOKE_INVITE:${invite.id}`;
                  const canRevoke = invite.status === "PENDING" && !invite.acceptedAt && !invite.revokedAt;

                  return (
                    <div key={invite.id} className="rounded-xl border p-4">
                      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                        <div className="space-y-1 text-xs">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-zinc-950">{invite.email}</span>
                            <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold ${statusBadgeClass(invite.status)}`}>
                              {invite.status}
                            </span>
                          </div>

                          <div className="text-zinc-600">
                            {invite.role} • {zoneLabel(invite.zone)}
                          </div>

                          <div className="text-zinc-500">
                            Created: {dateLabel(invite.createdAt)} • Expires: {dateLabel(invite.expiresAt)}
                          </div>

                          <div className="text-zinc-500">
                            Accepted: {dateLabel(invite.acceptedAt)} • Revoked: {dateLabel(invite.revokedAt)}
                          </div>

                          <div className="text-zinc-500">
                            Created by: {personLabel(invite.createdBy)} • Accepted by: {personLabel(invite.acceptedBy)} • Revoked by: {personLabel(invite.revokedBy)}
                          </div>

                          {invite.phone ? <div className="text-zinc-500">Phone: {invite.phone}</div> : null}
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {canRevoke ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                void updateGovernanceLifecycle({
                                  action: "REVOKE_INVITE",
                                  invite,
                                })
                              }
                              className={lifecycleButtonClass("danger")}
                            >
                              Revoke invite
                            </button>
                          ) : (
                            <span className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-semibold text-zinc-500">
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
          ) : (
            <div className="space-y-3">
              {filteredAssignments.length === 0 ? (
                <div className="text-sm text-zinc-600">No matching governance assignments.</div>
              ) : (
                filteredAssignments.map((assignment) => {
                  const busy =
                    busyId === `gov:SUSPEND_ASSIGNMENT:${assignment.id}` ||
                    busyId === `gov:REVOKE_ASSIGNMENT:${assignment.id}` ||
                    busyId === `gov:REACTIVATE_ASSIGNMENT:${assignment.id}` ||
                    busyId === `gov:REASSIGN_ASSIGNMENT:${assignment.id}`;

                  return (
                    <div key={assignment.id} className="rounded-xl border p-4">
                      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                        <div className="space-y-1 text-xs">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-zinc-950">
                              {assignment.user.name || assignment.user.email}
                            </span>
                            <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold ${statusBadgeClass(assignment.status)}`}>
                              {assignment.status}
                            </span>
                          </div>

                          <div className="text-zinc-600">
                            {assignment.role} • {zoneLabel(assignment.zone)}
                          </div>

                          {assignment.title ? <div className="text-zinc-600">Title: {assignment.title}</div> : null}

                          <div className="text-zinc-500">
                            Email: {assignment.user.email} • Phone: {soft(assignment.phone)}
                          </div>

                          <div className="text-zinc-500">
                            Created: {dateLabel(assignment.createdAt)} • Updated: {dateLabel(assignment.updatedAt)}
                          </div>

                          <div className="text-zinc-500">
                            Starts: {dateLabel(assignment.startsAt)} • Ends: {dateLabel(assignment.endsAt)}
                          </div>

                          <div className="text-zinc-500">
                            Created by: {personLabel(assignment.createdBy)} • Revoked by: {personLabel(assignment.revokedBy)}
                          </div>

                          {assignment.revokedAt ? (
                            <div className="text-red-700">Revoked: {dateLabel(assignment.revokedAt)}</div>
                          ) : null}

                          {assignment.revokeReason ? (
                            <div className="mt-2 rounded-lg border border-orange-100 bg-orange-50 px-2 py-1 text-orange-800">
                              Reason: {assignment.revokeReason}
                            </div>
                          ) : null}
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {assignment.status === "ACTIVE" ? (
                            <>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void reassignGovernanceAssignment(assignment)}
                                className={lifecycleButtonClass("info")}
                              >
                                Reassign
                              </button>

                              <button
                                type="button"
                                disabled={busy}
                                onClick={() =>
                                  void updateGovernanceLifecycle({
                                    action: "SUSPEND_ASSIGNMENT",
                                    assignment,
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
                                    assignment,
                                  })
                                }
                                className={lifecycleButtonClass("danger")}
                              >
                                Revoke
                              </button>
                            </>
                          ) : null}

                          {assignment.status === "SUSPENDED" ? (
                            <>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() =>
                                  void updateGovernanceLifecycle({
                                    action: "REACTIVATE_ASSIGNMENT",
                                    assignment,
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
                                    assignment,
                                  })
                                }
                                className={lifecycleButtonClass("danger")}
                              >
                                Revoke
                              </button>
                            </>
                          ) : null}

                          {assignment.status === "REVOKED" ? (
                            <span className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-semibold text-zinc-500">
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
          )}
        </section>
      )}
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

function MiniStat(props: {
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
    <div className={`rounded-xl border px-3 py-2 ${toneClass}`}>
      <div className="font-semibold">{props.value}</div>
      <div className="text-[10px] uppercase tracking-wide">{props.label}</div>
    </div>
  );
}