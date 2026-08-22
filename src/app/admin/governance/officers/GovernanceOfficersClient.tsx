// src/app/admin/governance/officers/GovernanceOfficersClient.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Zone = {
  id: string;
  name: string;
  code: string | null;
  zoneType: {
    name: string;
    level: number;
  };
  parentZone: {
    id: string;
    name: string;
  } | null;
};

type Invite = {
  id: string;
  email: string;
  phone: string | null;
  role: string;
  status: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  zone: Zone;
  createdBy?: {
    id: string;
    email: string;
    name: string | null;
  } | null;
  acceptedBy?: {
    id: string;
    email: string;
    name: string | null;
  } | null;
};

type Assignment = {
  id: string;
  role: string;
  title: string | null;
  phone: string | null;
  status: string;
  createdAt: string;
  user: {
    id: string;
    email: string;
    name: string | null;
  };
  zone: Zone;
};

type ListResponse =
  | {
      ok: true;
      zones: Zone[];
      invites: Invite[];
      assignments: Assignment[];
    }
  | {
      ok: false;
      error: string;
    };

const ROLE_OPTIONS = [
  {
    value: "SISSO",
    label: "SISSO",
    level: 1,
    titlePrefix: "SISSO",
    help: "Circuit-level supervision officer.",
  },
  {
    value: "DISTRICT_DIRECTOR",
    label: "District Director",
    level: 2,
    titlePrefix: "District Director",
    help: "District-level command responsibility.",
  },
  {
    value: "HEAD_OF_SUPERVISION",
    label: "Head of Supervision",
    level: 2,
    titlePrefix: "Head of Supervision",
    help: "District-level supervision leadership and appraisal review.",
  },
  {
    value: "BASIC_SCHOOL_COORDINATOR",
    label: "Basic School Coordinator",
    level: 2,
    titlePrefix: "Basic School Coordinator",
    help: "District-level basic-school monitoring and appraisal work.",
  },
  {
    value: "DISTRICT_MIS_OFFICER",
    label: "District MIS/Data Officer",
    level: 2,
    titlePrefix: "District MIS Officer",
    help: "District-level data and MIS oversight.",
  },
  {
    value: "DISTRICT_SHEP_OFFICER",
    label: "District SHEP/Health Officer",
    level: 2,
    titlePrefix: "District SHEP Officer",
    help: "District-level health and SHEP monitoring.",
  },
  {
    value: "DISTRICT_ASSESSMENT_OFFICER",
    label: "District Assessment Officer",
    level: 2,
    titlePrefix: "District Assessment Officer",
    help: "District-level assessment and academic monitoring.",
  },
  {
    value: "REGIONAL_VIEWER",
    label: "Regional Viewer",
    level: 3,
    titlePrefix: "Regional Viewer",
    help: "Regional read-only oversight.",
  },
] as const;

const CONTROL_CLASS =
  "mt-1 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-950 shadow-sm outline-none placeholder:text-slate-400 focus:border-amber-600 focus:ring-2 focus:ring-amber-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-500";

const SELECT_CLASS =
  "mt-1 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-950 shadow-sm outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-500";

const controlStyle = {
  backgroundColor: "#ffffff",
  color: "#020617",
};

function clean(v: unknown) {
  return String(v ?? "").trim();
}

function formatDate(v: string | null | undefined) {
  if (!v) return "—";

  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(v));
  } catch {
    return v;
  }
}

function roleLabel(role: string) {
  const normalizedRole = role === "CIRCUIT_SUPERVISOR" ? "SISSO" : role;
  const found = ROLE_OPTIONS.find((r) => r.value === normalizedRole);
  return found?.label ?? normalizedRole.replaceAll("_", " ");
}

function displayedTitle(role: string, title: string | null) {
  const value = clean(title);
  if (!value) return "No title";

  if (role === "SISSO" || role === "CIRCUIT_SUPERVISOR") {
    return value
      .replace(/^Circuit Supervisor\b/i, "SISSO")
      .replace(/^SISO\b/i, "SISSO");
  }

  return value;
}

function expectedLevelForRole(role: string) {
  return ROLE_OPTIONS.find((r) => r.value === role)?.level ?? null;
}

function defaultTitleFor(role: string, zoneName: string) {
  const found = ROLE_OPTIONS.find((r) => r.value === role);
  const prefix = found?.titlePrefix ?? roleLabel(role);
  return `${prefix} ${zoneName}`.trim();
}

function statusBadgeClass(status: string) {
  const s = status.toUpperCase();

  if (s === "ACTIVE" || s === "ACCEPTED") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (s === "PENDING") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  if (s === "REVOKED" || s === "EXPIRED" || s === "SUSPENDED") {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }

  return "border-slate-200 bg-slate-50 text-slate-700";
}

function zoneLabel(zone: Zone) {
  const parent = zone.parentZone?.name ? ` · ${zone.parentZone.name}` : "";
  const code = zone.code ? ` · ${zone.code}` : "";
  return `${zone.name}${parent}${code}`;
}

function sortZones(a: Zone, b: Zone) {
  if (a.zoneType.level !== b.zoneType.level) return b.zoneType.level - a.zoneType.level;
  return a.name.localeCompare(b.name);
}

function normalizePhone(v: string) {
  const raw = clean(v).replace(/\s+/g, "");
  let p = raw.replace(/[^\d+]/g, "");

  if (!p) return "";
  if (p.startsWith("0") && p.length === 10) p = `+233${p.slice(1)}`;
  if (p.startsWith("233") && !p.startsWith("+233")) p = `+${p}`;

  return p;
}

export default function GovernanceOfficersClient() {
  const [zones, setZones] = useState<Zone[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("SISSO");
  const [zoneId, setZoneId] = useState("");
  const [title, setTitle] = useState("");
  const [expiresInDays, setExpiresInDays] = useState(7);

  const [creating, setCreating] = useState(false);
  const [createdInviteUrl, setCreatedInviteUrl] = useState("");
  const [copyMsg, setCopyMsg] = useState("");
  const [publicApplicationUrl, setPublicApplicationUrl] = useState("");
  const [applicationShareMsg, setApplicationShareMsg] = useState("");

  const expectedLevel = expectedLevelForRole(role);

  const filteredZones = useMemo(() => {
    return zones
      .filter((z) => !expectedLevel || z.zoneType.level === expectedLevel)
      .slice()
      .sort(sortZones);
  }, [zones, expectedLevel]);

  const selectedZone = useMemo(() => {
    return zones.find((z) => z.id === zoneId) ?? null;
  }, [zones, zoneId]);

  const pendingInvites = useMemo(() => {
    return invites.filter((i) => i.status === "PENDING");
  }, [invites]);

  const acceptedInvites = useMemo(() => {
    return invites.filter((i) => i.status === "ACCEPTED");
  }, [invites]);

  const revokedOrExpiredInvites = useMemo(() => {
    return invites.filter((i) => i.status === "REVOKED" || i.status === "EXPIRED");
  }, [invites]);

  async function load() {
    setLoading(true);
    setError(null);
    setMsg(null);

    try {
      const res = await fetch("/api/admin/governance/officers/list", {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });

      const data = (await res.json().catch(() => null)) as ListResponse | null;

      if (!res.ok || !data?.ok) {
        setZones([]);
        setInvites([]);
        setAssignments([]);
        setError(data && !data.ok ? data.error : `Failed to load (${res.status})`);
        return;
      }

      const nextZones = data.zones ?? [];
      const nextInvites = data.invites ?? [];
      const nextAssignments = data.assignments ?? [];

      setZones(nextZones);
      setInvites(nextInvites);
      setAssignments(nextAssignments);

      const validZones = nextZones
        .filter((z) => z.zoneType.level === expectedLevelForRole(role))
        .sort(sortZones);

      if (!zoneId && validZones[0]) {
        setZoneId(validZones[0].id);
        setTitle(defaultTitleFor(role, validZones[0].name));
      }
    } catch {
      setZones([]);
      setInvites([]);
      setAssignments([]);
      setError("Network/server error while loading governance officers.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setPublicApplicationUrl(`${window.location.origin}/apply/governance`);
  }, []);

  useEffect(() => {
    if (!filteredZones.length) {
      setZoneId("");
      setTitle("");
      return;
    }

    const currentStillValid = filteredZones.some((z) => z.id === zoneId);
    const nextZone = currentStillValid
      ? filteredZones.find((z) => z.id === zoneId) ?? filteredZones[0]
      : filteredZones[0];

    if (!currentStillValid) {
      setZoneId(nextZone.id);
    }

    setTitle((current) => {
      const trimmed = clean(current);

      if (!trimmed) return defaultTitleFor(role, nextZone.name);

      const allPrefixes = ROLE_OPTIONS.map((r) => r.titlePrefix);
      const looksAutoGenerated = allPrefixes.some((prefix) => trimmed.startsWith(`${prefix} `));

      if (looksAutoGenerated) return defaultTitleFor(role, nextZone.name);

      return current;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, filteredZones.map((z) => z.id).join("|")]);

  async function copyText(text: string) {
    setCopyMsg("");

    try {
      await navigator.clipboard.writeText(text);
      setCopyMsg("Copied.");
    } catch {
      setCopyMsg("Copy failed. Select and copy the link manually.");
    }
  }

  async function copyApplicationLink() {
    const link =
      publicApplicationUrl || `${window.location.origin}/apply/governance`;

    setApplicationShareMsg("");

    try {
      await navigator.clipboard.writeText(link);
      setApplicationShareMsg("Governance application link copied.");
    } catch {
      setApplicationShareMsg(
        "Copy failed. Open the public application link and share it manually.",
      );
    }
  }

  async function shareApplicationLink() {
    const link =
      publicApplicationUrl || `${window.location.origin}/apply/governance`;

    setApplicationShareMsg("");

    if (typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: "EduLife OS governance officer application",
          text: "Please submit your EduLife OS governance officer onboarding application using this link.",
          url: link,
        });
        setApplicationShareMsg("Governance application link shared.");
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
      }
    }

    await copyApplicationLink();
  }

  async function createInvite() {
    setError(null);
    setMsg(null);
    setCreatedInviteUrl("");
    setCopyMsg("");

    const emailClean = clean(email).toLowerCase();
    const phoneClean = normalizePhone(phone);
    const titleClean = clean(title);
    const zone = selectedZone;

    if (!emailClean) {
      setError("Enter the officer’s official email.");
      return;
    }

    if (!zone) {
      setError("Select a valid governance zone.");
      return;
    }

    if (expectedLevel && zone.zoneType.level !== expectedLevel) {
      setError("Selected zone does not match the selected officer role.");
      return;
    }

    setCreating(true);

    try {
      const res = await fetch("/api/admin/governance/officers/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          email: emailClean,
          phone: phoneClean || undefined,
          role,
          zoneId: zone.id,
          title: titleClean || defaultTitleFor(role, zone.name),
          expiresInDays,
        }),
      });

      const data = (await res.json().catch(() => null)) as
        | {
            ok: true;
            inviteUrl: string;
            invite: {
              id: string;
              email: string;
              role: string;
              zoneId: string;
              zoneName: string;
              zoneType: string;
              expiresAt: string;
              createdAt: string;
            };
          }
        | { ok: false; error: string; expectedZoneLevel?: number; actualZoneLevel?: number }
        | null;

      if (!res.ok || !data?.ok) {
        setError(data && !data.ok ? data.error : `Failed to create invite (${res.status})`);
        return;
      }

      setCreatedInviteUrl(data.inviteUrl);
      setMsg(`Invite created for ${data.invite.email} as ${roleLabel(data.invite.role)}.`);
      await load();
    } catch {
      setError("Network/server error while creating invite.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-800">
              Officer onboarding
            </p>
            <h2 className="mt-1 text-lg font-bold text-slate-950">
              Share first. Invite after verification.
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-700">
              Send the public application link to new officers. Review submitted
              applications, verify identity and jurisdiction, then issue the
              secure officer invite below.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void shareApplicationLink()}
              className="h-10 rounded-xl bg-black px-4 text-sm font-semibold text-white shadow-sm hover:bg-zinc-800"
            >
              Share application link
            </button>

            <button
              type="button"
              onClick={() => void copyApplicationLink()}
              className="h-10 rounded-xl border border-amber-700 bg-white px-4 text-sm font-semibold text-amber-900 hover:bg-amber-100"
            >
              Copy link
            </button>

            <Link
              href="/admin/super/applications"
              className="inline-flex h-10 items-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
            >
              Review applications
            </Link>
          </div>
        </div>

        {applicationShareMsg ? (
          <p className="mt-3 text-xs font-medium text-slate-700">
            {applicationShareMsg}
          </p>
        ) : null}
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <SummaryCard
          label="Active Zones"
          value={zones.length}
          note="Regions, districts, and circuits available."
        />
        <SummaryCard
          label="Pending Invites"
          value={pendingInvites.length}
          note="Awaiting officer acceptance."
        />
        <SummaryCard
          label="Accepted Invites"
          value={acceptedInvites.length}
          note="Completed onboarding links."
        />
        <SummaryCard
          label="Active Assignments"
          value={assignments.length}
          note="Live governance authority records."
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-950">Invite verified officer</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Use this after the officer is verified. Select the role and jurisdiction;
                the system blocks wrong pairings such as assigning a SISSO to a district
                or a District Director to a circuit.
              </p>
            </div>

            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="h-10 rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-60"
            >
              {loading ? "Loading…" : "Reload"}
            </button>
          </div>

          <div className="mt-5 grid gap-4">
            <label className="block">
              <span className="text-sm font-medium text-slate-800">Officer email</span>
              <input
                className={CONTROL_CLASS}
                style={controlStyle}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="officer@district.ges.gov.gh"
                autoComplete="email"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-800">Phone</span>
              <input
                className={CONTROL_CLASS}
                style={controlStyle}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="024..."
                autoComplete="tel"
              />
              <span className="mt-1 block text-xs text-slate-600">
                Ghana numbers are normalized to +233 where possible.
              </span>
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-800">Officer role</span>
              <select
                className={SELECT_CLASS}
                style={controlStyle}
                value={role}
                onChange={(e) => setRole(e.target.value)}
              >
                {ROLE_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value} className="bg-white text-slate-950">
                    {r.label} — {r.help}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-800">Jurisdiction zone</span>
              <select
                className={SELECT_CLASS}
                style={controlStyle}
                value={zoneId}
                onChange={(e) => {
                  const nextId = e.target.value;
                  const nextZone = zones.find((z) => z.id === nextId);
                  setZoneId(nextId);
                  if (nextZone) setTitle(defaultTitleFor(role, nextZone.name));
                }}
                disabled={!filteredZones.length}
              >
                {filteredZones.length ? (
                  filteredZones.map((z) => (
                    <option key={z.id} value={z.id} className="bg-white text-slate-950">
                      {zoneLabel(z)}
                    </option>
                  ))
                ) : (
                  <option value="" className="bg-white text-slate-950">
                    No valid zones for this role
                  </option>
                )}
              </select>
              <span className="mt-1 block text-xs text-slate-600">
                Selected role expects{" "}
                {expectedLevel === 1
                  ? "a circuit"
                  : expectedLevel === 2
                    ? "a district"
                    : expectedLevel === 3
                      ? "a region"
                      : "a matching zone"}
                .
              </span>
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-800">Title</span>
              <input
                className={CONTROL_CLASS}
                style={controlStyle}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={selectedZone ? defaultTitleFor(role, selectedZone.name) : "Officer title"}
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-800">Invite expiry</span>
              <select
                className={SELECT_CLASS}
                style={controlStyle}
                value={expiresInDays}
                onChange={(e) => setExpiresInDays(Number(e.target.value))}
              >
                <option value={1} className="bg-white text-slate-950">
                  1 day
                </option>
                <option value={3} className="bg-white text-slate-950">
                  3 days
                </option>
                <option value={7} className="bg-white text-slate-950">
                  7 days
                </option>
                <option value={14} className="bg-white text-slate-950">
                  14 days
                </option>
                <option value={30} className="bg-white text-slate-950">
                  30 days
                </option>
              </select>
            </label>

            {error ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                {error}
              </div>
            ) : null}

            {msg ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                {msg}
              </div>
            ) : null}

            <button
              type="button"
              onClick={createInvite}
              disabled={creating || loading || !filteredZones.length}
              className="h-11 rounded-xl bg-black px-4 text-sm font-semibold text-white shadow-sm hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {creating ? "Creating invite…" : "Create verified-officer invite"}
            </button>

            {createdInviteUrl ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm font-semibold text-slate-950">Invite link created</p>
                <p className="mt-1 text-xs leading-5 text-slate-600">
                  Copy this link now. For security, raw invite tokens are not stored and cannot be
                  recovered later from the list.
                </p>

                <div className="mt-3 flex flex-col gap-2 md:flex-row">
                  <input
                    readOnly
                    className="h-10 flex-1 rounded-xl border border-amber-300 bg-white px-3 text-xs font-mono text-slate-950 outline-none focus:border-amber-700 focus:ring-2 focus:ring-amber-100"
                    style={controlStyle}
                    value={createdInviteUrl}
                    onFocus={(e) => e.currentTarget.select()}
                  />

                  <button
                    type="button"
                    onClick={() => copyText(createdInviteUrl)}
                    className="h-10 rounded-xl border border-amber-700 bg-white px-4 text-sm font-semibold text-amber-800 hover:bg-amber-100"
                  >
                    Copy
                  </button>
                </div>

                {copyMsg ? <p className="mt-2 text-xs text-slate-600">{copyMsg}</p> : null}
              </div>
            ) : null}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-slate-950">Active Officer Assignments</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            These are the current jurisdiction powers officers hold. This list is the authority
            truth behind circuit and district dashboards.
          </p>

          <div className="mt-5 space-y-3">
            {loading ? (
              <div className="text-sm text-slate-600">Loading assignments…</div>
            ) : assignments.length ? (
              assignments.map((a) => (
                <div key={a.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-slate-950">
                          {a.user.name || a.user.email}
                        </p>
                        <span
                          className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${statusBadgeClass(
                            a.status
                          )}`}
                        >
                          {a.status}
                        </span>
                      </div>

                      <p className="mt-1 text-sm text-slate-700">
                        {roleLabel(a.role)} · {displayedTitle(a.role, a.title)}
                      </p>

                      <p className="mt-1 text-xs text-slate-500">
                        {a.user.email} · {a.phone || "No phone"}
                      </p>

                      <p className="mt-2 text-xs text-slate-600">
                        Zone: <span className="font-medium">{a.zone.name}</span> ·{" "}
                        {a.zone.zoneType.name}
                        {a.zone.parentZone?.name ? ` · ${a.zone.parentZone.name}` : ""}
                      </p>
                    </div>

                    <div className="text-xs text-slate-500">
                      Created: {formatDate(a.createdAt)}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                No active governance officer assignments yet.
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-950">Recent Governance Invites</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Pending links are usable until expiry. Accepted and revoked invites remain as evidence.
            </p>
          </div>

          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="h-10 rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-60"
          >
            {loading ? "Loading…" : "Reload"}
          </button>
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-3">
          <InviteColumn title="Pending" items={pendingInvites} />
          <InviteColumn title="Accepted" items={acceptedInvites} />
          <InviteColumn title="Revoked / Expired" items={revokedOrExpiredInvites} />
        </div>
      </section>
    </div>
  );
}

function SummaryCard({ label, value, note }: { label: string; value: number; note: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-bold text-slate-950">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{note}</p>
    </div>
  );
}

function InviteColumn({ title, items }: { title: string; items: Invite[] }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold text-slate-950">{title}</h3>
        <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600">
          {items.length}
        </span>
      </div>

      <div className="mt-4 space-y-3">
        {items.length ? (
          items.map((i) => (
            <div key={i.id} className="rounded-2xl border border-slate-200 bg-white p-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium text-slate-950">{i.email}</p>
                <span
                  className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${statusBadgeClass(
                    i.status
                  )}`}
                >
                  {i.status}
                </span>
              </div>

              <p className="mt-1 text-xs text-slate-600">
                {roleLabel(i.role)} · {i.zone.name}
                {i.zone.parentZone?.name ? ` · ${i.zone.parentZone.name}` : ""}
              </p>

              <p className="mt-1 text-xs text-slate-500">
                Phone: {i.phone || "—"} · Expires: {formatDate(i.expiresAt)}
              </p>

              <p className="mt-1 text-xs text-slate-500">
                Created: {formatDate(i.createdAt)}
              </p>

              {i.acceptedAt ? (
                <p className="mt-1 text-xs text-emerald-700">
                  Accepted: {formatDate(i.acceptedAt)}
                  {i.acceptedBy?.email ? ` · ${i.acceptedBy.email}` : ""}
                </p>
              ) : null}

              {i.revokedAt ? (
                <p className="mt-1 text-xs text-rose-700">
                  Revoked: {formatDate(i.revokedAt)}
                </p>
              ) : null}
            </div>
          ))
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-500">
            No records.
          </div>
        )}
      </div>
    </div>
  );
}
