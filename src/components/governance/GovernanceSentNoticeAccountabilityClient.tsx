// src/components/governance/GovernanceSentNoticeAccountabilityClient.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type DeliverySummary = Record<
  string,
  {
    total: number;
    sent: number;
    failed: number;
    skipped: number;
    pending: number;
  }
>;

type SentNotice = {
  id: string;
  caseId: string | null;
  tenantId: string | null;
  zoneId: string | null;
  title: string;
  body: string;
  priority: string;
  status: string;
  channels: unknown;
  audienceSummary: string | null;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
  case: {
    id: string;
    title: string;
    status: string;
    tenantId: string | null;
    zoneId: string | null;
  } | null;
  tenant: { id: string; name: string; schoolCode: string | null } | null;
  zone: {
    id: string;
    name: string;
    zoneType: { name: string; level: number } | null;
  } | null;
  recipients: Array<{
    id: string;
    recipientUserId: string | null;
    recipientType: string;
    displayName: string | null;
    roleLabel: string | null;
    phone: string | null;
    email: string | null;
    inAppVisible: boolean;
    readAt: string | null;
    acknowledgedAt: string | null;
    acknowledgeNote: string | null;
    createdAt: string;
  }>;
  accountability: {
    totalRecipients: number;
    readRecipients: number;
    unreadRecipients: number;
    acknowledgedRecipients: number;
    unacknowledgedRecipients: number;
    acknowledgementRate: number | null;
    deliverySummary: DeliverySummary;
  };
};

type SentResponse =
  | { ok: true; items: SentNotice[]; count: number }
  | { ok: false; error: string };

function dateLabel(value: string | null) {
  if (!value) return "Not yet";

  try {
    return new Intl.DateTimeFormat("en-GH", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Africa/Accra",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function priorityClass(priority: string) {
  const p = priority.toUpperCase();

  if (p === "CRITICAL") return "border-red-300/30 bg-red-500/10 text-red-100";
  if (p === "HIGH") return "border-orange-300/30 bg-orange-500/10 text-orange-100";
  if (p === "LOW") return "border-emerald-300/25 bg-emerald-400/10 text-emerald-100";

  return "border-amber-300/25 bg-amber-400/10 text-amber-100";
}

function statusClass(value: string) {
  const s = value.toUpperCase();

  if (s === "SENT") return "border-emerald-300/25 bg-emerald-400/10 text-emerald-100";
  if (s === "PARTIALLY_FAILED") return "border-amber-300/25 bg-amber-400/10 text-amber-100";
  if (s === "FAILED") return "border-red-300/25 bg-red-500/10 text-red-100";

  return "border-white/10 bg-white/5 text-slate-200";
}

export default function GovernanceSentNoticeAccountabilityClient() {
  const [items, setItems] = useState<SentNotice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/governance/notices/sent?take=10", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: { Accept: "application/json" },
      });

      const json = (await res.json().catch(() => null)) as SentResponse | null;

      if (!res.ok || !json?.ok) {
        setItems([]);
        setError(json && !json.ok ? json.error : `Failed to load sent notices (${res.status})`);
        return;
      }

      setItems(json.items ?? []);
    } catch {
      setItems([]);
      setError("Network/server error while loading sent notice accountability.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const totals = useMemo(() => {
    return items.reduce(
      (acc, item) => {
        acc.sent += 1;
        acc.recipients += item.accountability.totalRecipients;
        acc.unacknowledged += item.accountability.unacknowledgedRecipients;
        acc.acknowledged += item.accountability.acknowledgedRecipients;
        return acc;
      },
      { sent: 0, recipients: 0, acknowledged: 0, unacknowledged: 0 }
    );
  }, [items]);

  return (
    <section className="rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.03))] p-5 shadow-[0_20px_70px_rgba(0,0,0,0.20)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#E8C96A]">
            Notice Accountability
          </p>
          <h2 className="mt-2 text-xl font-bold text-white">
            Sent official notices
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
            Track who received official notices, who acknowledged, and which cases still need follow-up.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-slate-200">
            Sent: <b className="text-white">{totals.sent}</b>
          </span>
          <span className="rounded-full border border-emerald-300/25 bg-emerald-400/10 px-3 py-1 text-emerald-100">
            Acknowledged: <b>{totals.acknowledged}</b>
          </span>
          <span className="rounded-full border border-red-300/25 bg-red-500/10 px-3 py-1 text-red-100">
            Unacknowledged: <b>{totals.unacknowledged}</b>
          </span>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-full border border-white/10 bg-white/5 px-3 py-1 font-semibold text-slate-100 hover:bg-white/10"
          >
            Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-300">
          Loading sent notice accountability...
        </div>
      ) : null}

      {error ? (
        <div className="mt-5 rounded-2xl border border-red-300/25 bg-red-500/10 p-4 text-sm text-red-100">
          {error}
        </div>
      ) : null}

      {!loading && !items.length && !error ? (
        <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-300">
          No official notices sent yet.
        </div>
      ) : null}

      <div className="mt-5 space-y-4">
        {items.map((item) => {
          const unack = item.accountability.unacknowledgedRecipients;
          const ackRate = item.accountability.acknowledgementRate ?? 0;

          return (
            <article
              key={item.id}
              className="rounded-[24px] border border-white/10 bg-[#070B14] p-4"
            >
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div>
                  <div className="flex flex-wrap gap-2">
                    <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${priorityClass(item.priority)}`}>
                      {item.priority}
                    </span>
                    <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${statusClass(item.status)}`}>
                      {item.status.replaceAll("_", " ")}
                    </span>
                    {unack > 0 ? (
                      <span className="rounded-full border border-red-300/25 bg-red-500/10 px-3 py-1 text-[11px] font-semibold text-red-100">
                        Follow-up needed
                      </span>
                    ) : (
                      <span className="rounded-full border border-emerald-300/25 bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold text-emerald-100">
                        Fully acknowledged
                      </span>
                    )}
                  </div>

                  <h3 className="mt-3 text-lg font-semibold text-white">{item.title}</h3>
                  <p className="mt-1 text-xs text-slate-400">
                    Sent {dateLabel(item.sentAt ?? item.createdAt)}
                    {item.tenant?.name ? ` · ${item.tenant.name}` : ""}
                    {item.case?.title ? ` · Case: ${item.case.title}` : ""}
                  </p>
                </div>

                <div className="grid min-w-[260px] grid-cols-2 gap-2 text-xs">
                  <span className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-slate-300">
                    Recipients<br />
                    <b className="text-lg text-white">{item.accountability.totalRecipients}</b>
                  </span>
                  <span className="rounded-2xl border border-emerald-300/20 bg-emerald-400/10 p-3 text-emerald-100">
                    Ack rate<br />
                    <b className="text-lg">{ackRate}%</b>
                  </span>
                  <span className="rounded-2xl border border-emerald-300/20 bg-emerald-400/10 p-3 text-emerald-100">
                    Acknowledged<br />
                    <b className="text-lg">{item.accountability.acknowledgedRecipients}</b>
                  </span>
                  <span className="rounded-2xl border border-red-300/20 bg-red-500/10 p-3 text-red-100">
                    Pending<br />
                    <b className="text-lg">{unack}</b>
                  </span>
                </div>
              </div>

              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                {item.recipients.map((recipient) => (
                  <div
                    key={recipient.id}
                    className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-semibold text-white">
                          {recipient.displayName ?? recipient.email ?? recipient.phone ?? "Recipient"}
                        </p>
                        <p className="mt-1 text-slate-400">
                          {recipient.roleLabel ?? recipient.recipientType}
                        </p>
                      </div>

                      {recipient.acknowledgedAt ? (
                        <span className="rounded-full border border-emerald-300/25 bg-emerald-400/10 px-3 py-1 font-semibold text-emerald-100">
                          Acknowledged
                        </span>
                      ) : (
                        <span className="rounded-full border border-red-300/25 bg-red-500/10 px-3 py-1 font-semibold text-red-100">
                          Pending
                        </span>
                      )}
                    </div>

                    <p className="mt-3 text-slate-400">
                      Read: <span className="text-slate-200">{dateLabel(recipient.readAt)}</span>
                    </p>
                    <p className="mt-1 text-slate-400">
                      Acknowledged:{" "}
                      <span className="text-slate-200">{dateLabel(recipient.acknowledgedAt)}</span>
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex flex-wrap gap-2 text-xs">
                {Object.entries(item.accountability.deliverySummary).map(([channel, v]) => (
                  <span
                    key={channel}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-slate-200"
                  >
                    {channel}: {v.sent}/{v.total} sent
                    {v.skipped ? ` · ${v.skipped} skipped` : ""}
                    {v.failed ? ` · ${v.failed} failed` : ""}
                  </span>
                ))}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}