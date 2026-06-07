// src/app/admin/super/support/SuperadminSupportCockpitClient.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type TenantStatus = "PENDING" | "ACTIVE" | "SUSPENDED" | "ARCHIVED";
type StatusFilter = "ALL" | TenantStatus;
type SectorFilter = "ALL" | "PUBLIC" | "PRIVATE";

type ZoneSummary = {
  id: string;
  name: string;
  zoneType: { name: string; level: number };
  parentZone: { id: string; name: string } | null;
};

type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

type SupportItem = {
  id: string;
  name: string;
  schoolCode: string;
  slug: string;
  status: TenantStatus;
  schoolSector: "PUBLIC" | "PRIVATE";
  emisCode: string | null;
  contactEmail: string | null;
  contactPhoneNorm: string | null;
  region: string | null;
  district: string | null;
  circuit: string | null;
  createdAt: string;
  updatedAt: string;
  zone: ZoneSummary | null;
  allTime: {
    memberships: number;
    students: number;
    teachers: number;
    attendanceSessions: number;
    lessonNotes: number;
    lessonDeliveries: number;
    assessmentItems: number;
    feeInvoices: number;
    financeOutboxEvents: number;
    paymentProviderEvents: number;
    governanceCases: number;
  };
  period: {
    attendanceSessions: number;
    lessonNotes: number;
    lessonDeliveries: number;
    assessmentItems: number;
    auditEvents: number;
    smsLogs: number;
    feeInvoices: number;
    financeBilledPesewas: number;
    financePaidPesewas: number;
    financeBalancePesewas: number;
    financeOutbox: Record<string, number>;
    providerEvents: Record<string, number>;
    governanceCases: Record<string, number>;
  };
  latest: {
    activityAt: string | null;
    attendanceAt: string | null;
    lessonNoteAt: string | null;
    lessonDeliveryAt: string | null;
    assessmentAt: string | null;
    auditAt: string | null;
    smsAt: string | null;
    feeInvoiceAt: string | null;
  };
  risk: {
    score: number;
    level: RiskLevel;
    flags: string[];
  };
};

type SupportSummary = {
  tenants: number;
  activeTenants: number;
  schoolsWithCriticalRisk: number;
  schoolsWithHighRisk: number;
  failedOutboxEvents: number;
  failedProviderEvents: number;
};

type SupportResponse = {
  ok: boolean;
  windowDays?: number;
  generatedAt?: string;
  summary?: SupportSummary;
  items?: SupportItem[];
  error?: string;
  message?: string;
};

function dateLabel(value: string | null) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString();
}

function money(pesewas: number) {
  return `GH₵${(pesewas / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function badgeClass(value: string) {
  if (value === "ACTIVE" || value === "LOW") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (value === "PENDING" || value === "MEDIUM") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  if (value === "SUSPENDED" || value === "HIGH") {
    return "border-orange-200 bg-orange-50 text-orange-700";
  }

  if (value === "ARCHIVED" || value === "CRITICAL") {
    return "border-red-200 bg-red-50 text-red-700";
  }

  return "border-zinc-200 bg-zinc-50 text-zinc-700";
}

function soft(value: string | null | undefined) {
  return value && value.trim() ? value : "—";
}

function zoneLabel(zone: ZoneSummary | null) {
  if (!zone) return "—";
  const parent = zone.parentZone ? ` • ${zone.parentZone.name}` : "";
  return `${zone.name} (${zone.zoneType.name})${parent}`;
}

function statusCount(source: Record<string, number>, key: string) {
  return source[key] ?? 0;
}

export default function SuperadminSupportCockpitClient() {
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [sector, setSector] = useState<SectorFilter>("ALL");
  const [windowDays, setWindowDays] = useState("30");
  const [q, setQ] = useState("");

  const [items, setItems] = useState<SupportItem[]>([]);

  const [summaryData, setSummaryData] = useState<{
    tenants: number;
    activeTenants: number;
    schoolsWithCriticalRisk: number;
    schoolsWithHighRisk: number;
    failedOutboxEvents: number;
    failedProviderEvents: number;
  } | null>(null);

  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  const visibleItems = useMemo(() => {
    return items;
  }, [items]);

  async function load() {
    setLoading(true);
    setMsg(null);

    try {
      const url =
        `/api/admin/super/support/usage?status=${encodeURIComponent(status)}` +
        `&sector=${encodeURIComponent(sector)}` +
        `&windowDays=${encodeURIComponent(windowDays)}` +
        `&q=${encodeURIComponent(q.trim())}`;

      const response = await fetch(url, {
        cache: "no-store",
        credentials: "include",
      });

      const data = (await response.json().catch(() => null)) as SupportResponse | null;

      if (!response.ok || !data?.ok) {
        setItems([]);
        setSummaryData(null);
        setGeneratedAt(null);
        setMsg(data?.message || data?.error || `Failed to load support cockpit (${response.status})`);
        return;
      }

      setItems(data.items || []);
setSummaryData(data.summary ?? null);
setGeneratedAt(data.generatedAt ?? null);
    } catch {
      setItems([]);
      setSummaryData(null);
      setGeneratedAt(null);
      setMsg("Network/server error loading support cockpit.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, sector, windowDays]);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
              Superadmin Usage / Support Cockpit
            </p>
            <h1 className="mt-1 text-2xl font-semibold text-zinc-950">
              Tenant health, usage, and failure signals
            </h1>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-zinc-600">
              See which schools are using EduLife OS, which ones are silent, and where support is needed before users complain.
            </p>
            {generatedAt ? (
              <p className="mt-2 text-xs text-zinc-500">Generated: {dateLabel(generatedAt)}</p>
            ) : null}
          </div>

          <a
            href="/admin/super/tenants/all"
            className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
          >
            Back to registry
          </a>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <SummaryCard label="Schools" value={summaryData?.tenants ?? 0} />
          <SummaryCard label="Active schools" value={summaryData?.activeTenants ?? 0} tone="success" />
          <SummaryCard label="Critical risk" value={summaryData?.schoolsWithCriticalRisk ?? 0} tone="danger" />
          <SummaryCard label="High risk" value={summaryData?.schoolsWithHighRisk ?? 0} tone="warning" />
          <SummaryCard label="Outbox failures" value={summaryData?.failedOutboxEvents ?? 0} tone="danger" />
          <SummaryCard label="Provider failures" value={summaryData?.failedProviderEvents ?? 0} tone="danger" />
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-5 shadow-sm space-y-4">
        <div className="grid gap-3 xl:grid-cols-[180px_180px_180px_1fr_auto]">
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

          <select
            className="h-10 rounded-xl border px-3 text-sm"
            value={windowDays}
            onChange={(event) => setWindowDays(event.target.value)}
          >
            <option value="7">Last 7 days</option>
            <option value="14">Last 14 days</option>
            <option value="30">Last 30 days</option>
            <option value="60">Last 60 days</option>
            <option value="90">Last 90 days</option>
            <option value="180">Last 180 days</option>
          </select>

          <input
            className="h-10 rounded-xl border px-3 text-sm"
            placeholder="Search school, circuit, district, code, email, phone…"
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
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>

        {msg ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {msg}
          </div>
        ) : null}

        {loading ? (
          <div className="text-sm text-zinc-600">Loading support cockpit…</div>
        ) : visibleItems.length === 0 ? (
          <div className="text-sm text-zinc-600">No schools found.</div>
        ) : (
          <div className="space-y-4">
            {visibleItems.map((item) => (
              <article key={item.id} className="rounded-2xl border p-4">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold text-zinc-950">{item.name}</h2>
                      <span className="text-xs text-zinc-500">({item.schoolCode})</span>
                      <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${badgeClass(item.status)}`}>
                        {item.status}
                      </span>
                      <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${badgeClass(item.risk.level)}`}>
                        {item.risk.level} · {item.risk.score}
                      </span>
                    </div>

                    <div className="mt-2 text-xs text-zinc-600">
                      {item.schoolSector} • EMIS: {soft(item.emisCode)} • {soft(item.region)} / {soft(item.district)} / {soft(item.circuit)}
                    </div>

                    <div className="mt-1 text-xs text-zinc-600">
                      Zone: {zoneLabel(item.zone)} • Contact: {soft(item.contactEmail)} / {soft(item.contactPhoneNorm)}
                    </div>

                    <div className="mt-1 text-xs text-zinc-500">
                      Last activity: {dateLabel(item.latest.activityAt)}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 text-xs">
                    <a
                      href={`/admin/super/tenants/all?q=${encodeURIComponent(item.schoolCode)}`}
                      className="rounded-xl border border-zinc-300 px-3 py-2 font-semibold text-zinc-700 hover:bg-zinc-50"
                    >
                      Open in registry
                    </a>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
                  <Metric label="Users" value={item.allTime.memberships} />
                  <Metric label="Students" value={item.allTime.students} />
                  <Metric label="Teachers" value={item.allTime.teachers} />
                  <Metric label="Attendance" value={item.period.attendanceSessions} />
                  <Metric label="Lesson notes" value={item.period.lessonNotes} />
                  <Metric label="Assessments" value={item.period.assessmentItems} />
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
                  <Metric label="Deliveries" value={item.period.lessonDeliveries} />
                  <Metric label="SMS logs" value={item.period.smsLogs} />
                  <Metric label="Audit events" value={item.period.auditEvents} />
                  <Metric label="Invoices" value={item.period.feeInvoices} />
                  <Metric label="Paid" value={money(item.period.financePaidPesewas)} />
                  <Metric label="Balance" value={money(item.period.financeBalancePesewas)} />
                </div>

                <div className="mt-4 grid gap-3 xl:grid-cols-3">
                  <div className="rounded-xl border bg-zinc-50 p-3 text-xs">
                    <div className="font-semibold text-zinc-900">Latest evidence</div>
                    <div className="mt-2 space-y-1 text-zinc-600">
                      <div>Attendance: {dateLabel(item.latest.attendanceAt)}</div>
                      <div>Lesson note: {dateLabel(item.latest.lessonNoteAt)}</div>
                      <div>Lesson delivery: {dateLabel(item.latest.lessonDeliveryAt)}</div>
                      <div>Assessment: {dateLabel(item.latest.assessmentAt)}</div>
                    </div>
                  </div>

                  <div className="rounded-xl border bg-zinc-50 p-3 text-xs">
                    <div className="font-semibold text-zinc-900">System health</div>
                    <div className="mt-2 space-y-1 text-zinc-600">
                      <div>Outbox failed: {statusCount(item.period.financeOutbox, "FAILED")}</div>
                      <div>Outbox dead: {statusCount(item.period.financeOutbox, "DEAD")}</div>
                      <div>Provider failed: {statusCount(item.period.providerEvents, "FAILED")}</div>
                      <div>Governance open: {statusCount(item.period.governanceCases, "OPEN")}</div>
                    </div>
                  </div>

                  <div className="rounded-xl border bg-zinc-50 p-3 text-xs">
                    <div className="font-semibold text-zinc-900">Risk flags</div>
                    {item.risk.flags.length ? (
                      <ul className="mt-2 list-disc space-y-1 pl-4 text-zinc-600">
                        {item.risk.flags.slice(0, 5).map((flag) => (
                          <li key={flag}>{flag}</li>
                        ))}
                      </ul>
                    ) : (
                      <div className="mt-2 text-zinc-600">No major risk flags.</div>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function SummaryCard(props: {
  label: string;
  value: number;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  return (
    <div className={`rounded-xl border px-3 py-3 ${badgeClass(props.tone === "success" ? "LOW" : props.tone === "warning" ? "MEDIUM" : props.tone === "danger" ? "CRITICAL" : "")}`}>
      <div className="text-xl font-semibold">{props.value}</div>
      <div className="text-[10px] uppercase tracking-wide">{props.label}</div>
    </div>
  );
}

function Metric(props: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border bg-zinc-50 px-3 py-2">
      <div className="font-semibold text-zinc-900">{props.value}</div>
      <div className="text-[10px] uppercase tracking-wide text-zinc-500">{props.label}</div>
    </div>
  );
}