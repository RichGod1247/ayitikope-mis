// src/app/admin/super/applications/SuperadminApplicationsClient.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type ApplicationTypeFilter = "ALL" | "SCHOOL" | "GOVERNANCE_OFFICER";
type ApplicationStatusFilter =
  | "ALL"
  | "PENDING"
  | "UNDER_REVIEW"
  | "REJECTED"
  | "CONVERTED"
  | "ARCHIVED";

type ZoneSummary = {
  id: string;
  name: string;
  zoneType: { name: string; level: number };
  parentZone: { id: string; name: string } | null;
};

type ApplicationItem = {
  id: string;
  type: "SCHOOL" | "GOVERNANCE_OFFICER";
  status: "PENDING" | "UNDER_REVIEW" | "REJECTED" | "CONVERTED" | "ARCHIVED";

  applicantName: string | null;
  applicantTitle: string | null;

  email: string;
  phone: string | null;

  schoolName: string | null;
  schoolSector: "PUBLIC" | "PRIVATE" | null;
  officialId: string | null;
  gpsAddress: string | null;
  region: string | null;
  district: string | null;
  circuit: string | null;

  governanceRole: string | null;
  zoneId: string | null;
  zone: ZoneSummary | null;
  title: string | null;

  notes: string | null;
  source: string;

  reviewedAt: string | null;
  reviewReason: string | null;

  convertedAt: string | null;
  convertedTenantBootstrapInviteId: string | null;
  convertedGovernanceOfficerInviteId: string | null;

  createdAt: string;
  updatedAt: string;
};

type ListResponse = {
  ok: boolean;
  items?: ApplicationItem[];
  error?: string;
  message?: string;
};

type ActionResponse = {
  ok: boolean;
  type?: "SCHOOL" | "GOVERNANCE_OFFICER";
  invite?: unknown;
  inviteUrl?: string;
  item?: unknown;
  error?: string;
  message?: string;
};

function dateLabel(value: string | null | undefined) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString();
}

function soft(value: string | null | undefined) {
  return value && value.trim() ? value : "—";
}

function statusBadgeClass(status: string) {
  if (status === "CONVERTED") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (status === "PENDING") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  if (status === "UNDER_REVIEW") {
    return "border-indigo-200 bg-indigo-50 text-indigo-700";
  }

  if (status === "REJECTED") {
    return "border-red-200 bg-red-50 text-red-700";
  }

  return "border-zinc-200 bg-zinc-50 text-zinc-700";
}

function typeLabel(type: string) {
  return type === "GOVERNANCE_OFFICER" ? "Governance officer" : "School";
}

function zoneLabel(zone: ZoneSummary | null) {
  if (!zone) return "—";
  const parent = zone.parentZone ? ` • ${zone.parentZone.name}` : "";
  return `${zone.name} (${zone.zoneType.name})${parent}`;
}

function actionLabel(action: string) {
  return action.replaceAll("_", " ").toLowerCase();
}

function viewButtonClass(active: boolean) {
  return active
    ? "rounded-2xl border border-black bg-black px-4 py-2 text-sm font-semibold text-white"
    : "rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50";
}

export default function SuperadminApplicationsClient() {
  const [type, setType] = useState<ApplicationTypeFilter>("ALL");
  const [status, setStatus] = useState<ApplicationStatusFilter>("PENDING");
  const [q, setQ] = useState("");

  const [items, setItems] = useState<ApplicationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);

  const counts = useMemo(() => {
    return items.reduce(
      (acc, item) => {
        acc.total += 1;
        acc[item.type] = (acc[item.type] ?? 0) + 1;
        acc[item.status] = (acc[item.status] ?? 0) + 1;
        return acc;
      },
      { total: 0 } as Record<string, number>
    );
  }, [items]);

  async function load() {
    setLoading(true);
    setMsg(null);

    try {
      const url =
        `/api/admin/super/applications/list?type=${encodeURIComponent(type)}` +
        `&status=${encodeURIComponent(status)}` +
        `&q=${encodeURIComponent(q.trim())}`;

      const response = await fetch(url, {
        cache: "no-store",
        credentials: "include",
      });

      const data = (await response.json().catch(() => null)) as ListResponse | null;

      if (!response.ok || !data?.ok) {
        setItems([]);
        setMsg(data?.message || data?.error || `Failed to load applications (${response.status})`);
        return;
      }

      setItems(data.items || []);
    } catch {
      setItems([]);
      setMsg("Network/server error loading applications.");
    } finally {
      setLoading(false);
    }
  }

  async function updateLifecycle(app: ApplicationItem, action: "MARK_UNDER_REVIEW" | "REJECT" | "ARCHIVE" | "REOPEN") {
    const entered = window.prompt(
      `Reason for ${actionLabel(action)}:\n\nThis will be written into the audit log.`
    );

    if (entered === null) return;

    const reason = entered.trim();

    if (reason.length < 10) {
      setMsg("Provide a clear reason of at least 10 characters.");
      return;
    }

    const ok = window.confirm(
      `Confirm ${actionLabel(action)} for ${typeLabel(app.type)} application from ${app.applicantName || app.email}?`
    );

    if (!ok) return;

    setBusyId(`${action}:${app.id}`);
    setMsg(null);
    setLastInviteUrl(null);

    try {
      const response = await fetch("/api/admin/super/applications/lifecycle", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          applicationId: app.id,
          action,
          reason,
        }),
      });

      const data = (await response.json().catch(() => null)) as ActionResponse | null;

      if (!response.ok || !data?.ok) {
        setMsg(data?.message || data?.error || `Lifecycle action failed (${response.status})`);
        return;
      }

      setMsg(`Application updated: ${actionLabel(action)}.`);
      await load();
    } catch {
      setMsg("Network/server error updating application.");
    } finally {
      setBusyId(null);
    }
  }

  async function convertApplication(app: ApplicationItem) {
    const entered = window.prompt(
      `Reason for converting this ${typeLabel(app.type).toLowerCase()} application into an invite:\n\nThis will be written into the audit log.`
    );

    if (entered === null) return;

    const reason = entered.trim();

    if (reason.length < 10) {
      setMsg("Provide a clear conversion reason of at least 10 characters.");
      return;
    }

    const ok = window.confirm(
      `Convert application?\n\nType: ${typeLabel(app.type)}\nApplicant: ${app.applicantName || app.email}\nEmail: ${app.email}`
    );

    if (!ok) return;

    setBusyId(`CONVERT:${app.id}`);
    setMsg(null);
    setLastInviteUrl(null);

    try {
      const response = await fetch("/api/admin/super/applications/convert", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          applicationId: app.id,
          expiresInDays: 7,
          reason,
        }),
      });

      const data = (await response.json().catch(() => null)) as ActionResponse | null;

      if (!response.ok || !data?.ok) {
        setMsg(data?.message || data?.error || `Conversion failed (${response.status})`);
        return;
      }

      setLastInviteUrl(data.inviteUrl ?? null);
      setMsg(`${typeLabel(app.type)} application converted into invite.`);
      await load();
    } catch {
      setMsg("Network/server error converting application.");
    } finally {
      setBusyId(null);
    }
  }

  async function copyInviteUrl() {
    if (!lastInviteUrl) return;

    try {
      await navigator.clipboard.writeText(lastInviteUrl);
      setMsg("Invite URL copied.");
    } catch {
      setMsg("Invite URL is shown below. Copy it manually.");
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, status]);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
              Superadmin · Application Pipeline
            </p>
            <h1 className="mt-1 text-2xl font-semibold text-zinc-950">
              School and governance onboarding applications
            </h1>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-zinc-600">
              Review applications once, then convert verified interest into school invites or governance officer invites without retyping.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <a
              href="/admin/super/support"
              className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
            >
              Support cockpit
            </a>
            <a
              href="/admin/super/tenants/all"
              className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
            >
              Tenant registry
            </a>
          </div>
        </div>

        <div className="mt-5 grid gap-3 text-xs sm:grid-cols-2 xl:grid-cols-6">
          <MiniStat label="Loaded" value={counts.total ?? 0} />
          <MiniStat label="Schools" value={counts.SCHOOL ?? 0} />
          <MiniStat label="Officers" value={counts.GOVERNANCE_OFFICER ?? 0} />
          <MiniStat label="Pending" value={counts.PENDING ?? 0} tone="warning" />
          <MiniStat label="Review" value={counts.UNDER_REVIEW ?? 0} tone="info" />
          <MiniStat label="Converted" value={counts.CONVERTED ?? 0} tone="success" />
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-5 shadow-sm space-y-4">
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setType("ALL")} className={viewButtonClass(type === "ALL")}>
            All
          </button>
          <button type="button" onClick={() => setType("SCHOOL")} className={viewButtonClass(type === "SCHOOL")}>
            Schools
          </button>
          <button
            type="button"
            onClick={() => setType("GOVERNANCE_OFFICER")}
            className={viewButtonClass(type === "GOVERNANCE_OFFICER")}
          >
            Governance officers
          </button>
        </div>

        <div className="grid gap-3 xl:grid-cols-[210px_1fr_auto]">
          <select
            className="h-10 rounded-xl border px-3 text-sm"
            value={status}
            onChange={(event) => setStatus(event.target.value as ApplicationStatusFilter)}
          >
            <option value="ALL">All statuses</option>
            <option value="PENDING">Pending</option>
            <option value="UNDER_REVIEW">Under review</option>
            <option value="REJECTED">Rejected</option>
            <option value="CONVERTED">Converted</option>
            <option value="ARCHIVED">Archived</option>
          </select>

          <input
            className="h-10 rounded-xl border px-3 text-sm"
            placeholder="Search name, school, email, circuit, district, official ID, role…"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void load();
            }}
          />

          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="h-10 rounded-xl border border-black bg-black px-4 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
          >
            {loading ? "Loading…" : "Search"}
          </button>
        </div>

        {msg ? (
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
            {msg}
          </div>
        ) : null}

        {lastInviteUrl ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
            <p className="text-sm font-semibold text-emerald-900">Invite URL created</p>
            <p className="mt-1 break-all font-mono text-xs text-emerald-800">{lastInviteUrl}</p>
            <button
              type="button"
              onClick={() => void copyInviteUrl()}
              className="mt-2 rounded-xl border border-emerald-300 bg-white px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
            >
              Copy invite URL
            </button>
          </div>
        ) : null}

        {loading ? (
          <div className="text-sm text-zinc-600">Loading applications…</div>
        ) : items.length === 0 ? (
          <div className="text-sm text-zinc-600">No applications found.</div>
        ) : (
          <div className="space-y-3">
            {items.map((app) => {
              const busy = busyId?.endsWith(app.id) ?? false;
              const convertible = app.status === "PENDING" || app.status === "UNDER_REVIEW";

              return (
                <article key={app.id} className="rounded-2xl border p-4">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-zinc-950">
                          {app.type === "SCHOOL"
                            ? app.schoolName || app.email
                            : app.applicantName || app.email}
                        </span>
                        <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${statusBadgeClass(app.status)}`}>
                          {app.status}
                        </span>
                        <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-1 text-[10px] font-semibold text-zinc-700">
                          {typeLabel(app.type)}
                        </span>
                      </div>

                      <div className="text-xs text-zinc-600">
                        Applicant: {soft(app.applicantName)} • Title: {soft(app.applicantTitle || app.title)}
                      </div>

                      <div className="text-xs text-zinc-600">
                        Contact: {app.email} • {soft(app.phone)}
                      </div>

                      {app.type === "SCHOOL" ? (
                        <div className="text-xs text-zinc-600">
                          Sector: {soft(app.schoolSector)} • Official ID: {soft(app.officialId)} •{" "}
                          {soft(app.region)} / {soft(app.district)} / {soft(app.circuit)}
                        </div>
                      ) : (
                        <div className="text-xs text-zinc-600">
                          Role: {soft(app.governanceRole)} • Official ID: {soft(app.officialId)} • Zone:{" "}
                          {zoneLabel(app.zone)}
                        </div>
                      )}

                      <div className="text-xs text-zinc-500">
                        Source: {app.source} • Created: {dateLabel(app.createdAt)}
                      </div>

                      {app.notes ? (
                        <div className="rounded-xl border bg-zinc-50 px-3 py-2 text-xs text-zinc-700">
                          {app.notes}
                        </div>
                      ) : null}

                      {app.reviewReason ? (
                        <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs text-indigo-800">
                          Review reason: {app.reviewReason}
                        </div>
                      ) : null}

                      {app.convertedAt ? (
                        <div className="text-xs text-emerald-700">
                          Converted: {dateLabel(app.convertedAt)} • School invite:{" "}
                          {soft(app.convertedTenantBootstrapInviteId)} • Officer invite:{" "}
                          {soft(app.convertedGovernanceOfficerInviteId)}
                        </div>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {app.status === "PENDING" ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void updateLifecycle(app, "MARK_UNDER_REVIEW")}
                          className="h-9 rounded-xl border border-indigo-200 bg-indigo-50 px-3 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-60"
                        >
                          Mark review
                        </button>
                      ) : null}

                      {convertible ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void convertApplication(app)}
                          className="h-9 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
                        >
                          Convert to invite
                        </button>
                      ) : null}

                      {convertible ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void updateLifecycle(app, "REJECT")}
                          className="h-9 rounded-xl border border-red-200 bg-red-50 px-3 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60"
                        >
                          Reject
                        </button>
                      ) : null}

                      {(app.status === "REJECTED" || app.status === "ARCHIVED") ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void updateLifecycle(app, "REOPEN")}
                          className="h-9 rounded-xl border border-amber-200 bg-amber-50 px-3 text-xs font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-60"
                        >
                          Reopen
                        </button>
                      ) : null}

                      {app.status !== "CONVERTED" && app.status !== "ARCHIVED" ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void updateLifecycle(app, "ARCHIVE")}
                          className="h-9 rounded-xl border border-zinc-300 bg-zinc-50 px-3 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 disabled:opacity-60"
                        >
                          Archive
                        </button>
                      ) : null}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function MiniStat(props: {
  label: string;
  value: number;
  tone?: "default" | "success" | "warning" | "danger" | "info";
}) {
  const toneClass =
    props.tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : props.tone === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : props.tone === "danger"
          ? "border-red-200 bg-red-50 text-red-700"
          : props.tone === "info"
            ? "border-indigo-200 bg-indigo-50 text-indigo-700"
            : "border-zinc-200 bg-zinc-50 text-zinc-700";

  return (
    <div className={`rounded-xl border px-3 py-2 ${toneClass}`}>
      <div className="font-semibold">{props.value}</div>
      <div className="text-[10px] uppercase tracking-wide">{props.label}</div>
    </div>
  );
}