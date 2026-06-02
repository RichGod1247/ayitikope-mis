// src/components/governance/OfficialNoticeInboxClient.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type NoticeDelivery = {
  id: string;
  channel: string;
  status: string;
  toAddress: string | null;
  provider: string | null;
  providerMessageId: string | null;
  providerStatus: number | null;
  providerStatusDescription: string | null;
  attempts: number;
  lastError: string | null;
  lastAttemptAt: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
};

type NoticeInboxItem = {
  id: string;
  tenantId: string | null;
  recipientType: string;
  displayName: string | null;
  roleLabel: string | null;
  readAt: string | null;
  acknowledgedAt: string | null;
  acknowledgeNote: string | null;
  respondedAt: string | null;
  responseBody: string | null;
  createdAt: string;
  notice: {
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
    sender: {
      id: string;
      name: string | null;
      email: string;
    } | null;
    case: {
      id: string;
      title: string;
      status: string;
    } | null;
    tenant: {
      id: string;
      name: string;
      schoolCode: string | null;
    } | null;
    zone: {
      id: string;
      name: string;
      zoneType: {
        name: string;
        level: number;
      } | null;
    } | null;
  };
  deliveries: NoticeDelivery[];
};

type InboxResponse =
  | {
      ok: true;
      items: NoticeInboxItem[];
      count: number;
    }
  | {
      ok: false;
      error: string;
    };

type AckResponse =
  | {
      ok: true;
      item: unknown;
    }
  | {
      ok: false;
      error: string;
    };

type Props = {
  portalLabel: string;
  title: string;
  description: string;
};

function cleanDate(value: string | null) {
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

function normalizeChannels(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item)).filter(Boolean);
}

function statusClass(status: string) {
  const s = status.toUpperCase();

  if (s === "SENT") {
    return "border-emerald-300/25 bg-emerald-400/10 text-emerald-100";
  }

  if (s === "PARTIALLY_FAILED") {
    return "border-amber-300/25 bg-amber-400/10 text-amber-100";
  }

  if (s === "FAILED") {
    return "border-red-300/25 bg-red-500/10 text-red-100";
  }

  if (s === "SKIPPED") {
    return "border-slate-300/20 bg-slate-400/10 text-slate-200";
  }

  return "border-white/10 bg-white/5 text-slate-200";
}

function priorityClass(priority: string) {
  const p = priority.toUpperCase();

  if (p === "CRITICAL") {
    return "border-red-300/30 bg-red-500/10 text-red-100";
  }

  if (p === "HIGH") {
    return "border-orange-300/30 bg-orange-400/10 text-orange-100";
  }

  if (p === "LOW") {
    return "border-emerald-300/25 bg-emerald-400/10 text-emerald-100";
  }

  return "border-amber-300/25 bg-amber-400/10 text-amber-100";
}

function channelClass(channel: string) {
  const c = channel.toUpperCase();

  if (c === "SMS") {
    return "border-blue-300/25 bg-blue-400/10 text-blue-100";
  }

  if (c === "EMAIL") {
    return "border-purple-300/25 bg-purple-400/10 text-purple-100";
  }

  return "border-emerald-300/25 bg-emerald-400/10 text-emerald-100";
}

function deliveryStatusLabel(delivery: NoticeDelivery) {
  const channel = delivery.channel.toUpperCase();
  const status = delivery.status.toUpperCase();

  if (status === "SENT") {
    if (channel === "IN_APP") return "Visible in EduLife OS";
    if (channel === "SMS") return "SMS sent";
    if (channel === "EMAIL") return "Email sent";
    return "Sent";
  }

  if (status === "SKIPPED") {
    if (channel === "SMS" && !delivery.toAddress) return "Skipped: no phone number";
    if (channel === "EMAIL" && !delivery.toAddress) return "Skipped: no email address";
    return "Skipped";
  }

  if (status === "FAILED") return "Failed";
  if (status === "PENDING") return "Pending";

  return status.replaceAll("_", " ");
}

export default function OfficialNoticeInboxClient({
  portalLabel,
  title,
  description,
}: Props) {
  const [items, setItems] = useState<NoticeInboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<string | null>(null);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [unacknowledgedOnly, setUnacknowledgedOnly] = useState(false);

  const unreadCount = useMemo(
    () => items.filter((item) => !item.readAt).length,
    [items]
  );

  const unacknowledgedCount = useMemo(
    () => items.filter((item) => !item.acknowledgedAt).length,
    [items]
  );

  const loadInbox = useCallback(async () => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    params.set("take", "50");
    if (unreadOnly) params.set("unreadOnly", "true");
    if (unacknowledgedOnly) params.set("unacknowledgedOnly", "true");

    try {
      const res = await fetch(`/api/governance/notices/inbox?${params.toString()}`, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: { Accept: "application/json" },
      });

      const json = (await res.json().catch(() => null)) as InboxResponse | null;

      if (!res.ok || !json?.ok) {
        setItems([]);
        setError(json && !json.ok ? json.error : `Failed to load notices (${res.status})`);
        return;
      }

      setItems(json.items ?? []);
    } catch {
      setItems([]);
      setError("Network/server error while loading official notices.");
    } finally {
      setLoading(false);
    }
  }, [unreadOnly, unacknowledgedOnly]);

  useEffect(() => {
    void loadInbox();
  }, [loadInbox]);

  async function acknowledgeNotice(item: NoticeInboxItem) {
    setBusyId(item.id);
    setError(null);
    setAction(null);

    try {
      const res = await fetch("/api/governance/notices/acknowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          recipientId: item.id,
          note: `${portalLabel} acknowledged this official notice from the EduLife OS notice inbox.`,
        }),
      });

      const json = (await res.json().catch(() => null)) as AckResponse | null;

      if (!res.ok || !json?.ok) {
        setError(json && !json.ok ? json.error : `Failed to acknowledge notice (${res.status})`);
        return;
      }

      setAction("Notice acknowledged successfully.");
      await loadInbox();
    } catch {
      setError("Network/server error while acknowledging notice.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(5,7,11,0.92),rgba(7,26,61,0.94),rgba(5,7,11,0.96))] p-5 shadow-[0_26px_90px_rgba(0,0,0,0.28)] md:p-6">
        <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:64px_64px]" />
        <div className="absolute -left-16 top-0 h-48 w-48 rounded-full bg-[#1B66D1]/20 blur-3xl" />
        <div className="absolute right-0 top-0 h-44 w-44 rounded-full bg-[#D4AF37]/14 blur-3xl" />

        <div className="relative">
          <p className="text-xs uppercase tracking-[0.18em] text-[#E8C96A]">
            EduLife OS · Official Notices
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-[#F7F4ED] md:text-3xl">
            {title}
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-[#C9CDD6]">
            {description}
          </p>

          <div className="mt-5 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-slate-200">
              Total loaded: <b className="text-white">{items.length}</b>
            </span>
            <span className="rounded-full border border-amber-300/25 bg-amber-400/10 px-3 py-1 text-amber-100">
              Unread: <b>{unreadCount}</b>
            </span>
            <span className="rounded-full border border-red-300/25 bg-red-500/10 px-3 py-1 text-red-100">
              Unacknowledged: <b>{unacknowledgedCount}</b>
            </span>
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-4 md:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">Notice Inbox</h2>
            <p className="mt-1 text-sm text-slate-400">
              Review official instructions, delivery evidence, and acknowledgement status.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setUnreadOnly((value) => !value)}
              className={`rounded-full border px-3 py-2 text-xs font-semibold transition ${
                unreadOnly
                  ? "border-amber-300/40 bg-amber-400/15 text-amber-100"
                  : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
              }`}
            >
              Unread only
            </button>

            <button
              type="button"
              onClick={() => setUnacknowledgedOnly((value) => !value)}
              className={`rounded-full border px-3 py-2 text-xs font-semibold transition ${
                unacknowledgedOnly
                  ? "border-red-300/40 bg-red-500/15 text-red-100"
                  : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
              }`}
            >
              Unacknowledged only
            </button>

            <button
              type="button"
              onClick={() => void loadInbox()}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-100 transition hover:bg-white/10"
            >
              Refresh
            </button>
          </div>
        </div>

        <div className="mt-4 space-y-2 text-xs">
          {loading ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-slate-300">
              Loading official notices...
            </div>
          ) : null}

          {action ? (
            <div className="rounded-2xl border border-emerald-300/25 bg-emerald-400/10 p-4 text-emerald-100">
              {action}
            </div>
          ) : null}

          {error ? (
            <div className="rounded-2xl border border-red-300/25 bg-red-500/10 p-4 text-red-100">
              {error}
            </div>
          ) : null}
        </div>

        {!loading && !items.length ? (
          <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-sm text-slate-300">
            No official notices found for your account.
          </div>
        ) : null}

        <div className="mt-5 space-y-4">
          {items.map((item) => {
            const channels = normalizeChannels(item.notice.channels);
            const acknowledged = Boolean(item.acknowledgedAt);

            return (
              <article
                key={item.id}
                className="rounded-[24px] border border-white/10 bg-[#070B14] p-4 shadow-[0_20px_70px_rgba(0,0,0,0.22)]"
              >
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${priorityClass(item.notice.priority)}`}>
                        {item.notice.priority}
                      </span>
                      <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${statusClass(item.notice.status)}`}>
                        {item.notice.status.replaceAll("_", " ")}
                      </span>
                      {acknowledged ? (
                        <span className="rounded-full border border-emerald-300/25 bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold text-emerald-100">
                          ACKNOWLEDGED
                        </span>
                      ) : (
                        <span className="rounded-full border border-red-300/25 bg-red-500/10 px-3 py-1 text-[11px] font-semibold text-red-100">
                          ACTION NEEDED
                        </span>
                      )}
                    </div>

                    <h3 className="mt-3 text-lg font-semibold text-white">
                      {item.notice.title}
                    </h3>

                    <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-300">
                      {item.notice.body}
                    </p>

                    <div className="mt-4 grid gap-3 text-xs text-slate-400 md:grid-cols-2">
                      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                        <p className="uppercase tracking-[0.16em] text-slate-500">Sender</p>
                        <p className="mt-1 font-semibold text-slate-100">
                          {item.notice.sender?.name ?? item.notice.sender?.email ?? "EduLife OS"}
                        </p>
                        {item.notice.sender?.email ? (
                          <p className="mt-1">{item.notice.sender.email}</p>
                        ) : null}
                      </div>

                      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                        <p className="uppercase tracking-[0.16em] text-slate-500">Context</p>
                        <p className="mt-1 font-semibold text-slate-100">
                          {item.notice.tenant?.name ??
                            item.notice.zone?.name ??
                            item.notice.case?.title ??
                            "General notice"}
                        </p>
                        {item.notice.case ? (
                          <p className="mt-1">
                            Case: {item.notice.case.title} · {item.notice.case.status}
                          </p>
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {channels.map((channel) => (
                        <span
                          key={channel}
                          className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${channelClass(channel)}`}
                        >
                          {channel}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="w-full shrink-0 xl:w-64">
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-xs text-slate-300">
                      <p>
                        <span className="text-slate-500">Sent:</span>{" "}
                        {cleanDate(item.notice.sentAt ?? item.notice.createdAt)}
                      </p>
                      <p className="mt-2">
                        <span className="text-slate-500">Read:</span>{" "}
                        {cleanDate(item.readAt)}
                      </p>
                      <p className="mt-2">
                        <span className="text-slate-500">Acknowledged:</span>{" "}
                        {cleanDate(item.acknowledgedAt)}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => void acknowledgeNotice(item)}
                      disabled={acknowledged || busyId === item.id}
                      className="mt-3 w-full rounded-full border border-emerald-300/25 bg-emerald-400/10 px-4 py-2 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-400/15 disabled:cursor-not-allowed disabled:opacity-55"
                    >
                      {acknowledged
                        ? "Already acknowledged"
                        : busyId === item.id
                          ? "Acknowledging..."
                          : "Acknowledge notice"}
                    </button>
                  </div>
                </div>

                <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.025] p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                    Delivery Evidence
                  </p>

                  <div className="mt-3 grid gap-3 lg:grid-cols-3">
                    {item.deliveries.map((delivery) => (
                      <div
                        key={delivery.id}
                        className="rounded-2xl border border-white/10 bg-[#05070B] p-3 text-xs"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${channelClass(delivery.channel)}`}>
                            {delivery.channel}
                          </span>
                          <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${statusClass(delivery.status)}`}>
                            {delivery.status}
                          </span>
                        </div>

                        <div className="mt-3 space-y-1 text-slate-400">
  <p>
    Proof:{" "}
    <span className="text-slate-200">
      {deliveryStatusLabel(delivery)}
    </span>
  </p>

  <p>
    Provider:{" "}
    <span className="text-slate-200">
      {delivery.provider ?? "EduLife OS"}
    </span>
  </p>

  <p>
    To:{" "}
    <span className="text-slate-200">
      {delivery.toAddress ?? "In-app inbox"}
    </span>
  </p>

  <p>
    Attempts:{" "}
    <span className="text-slate-200">{delivery.attempts}</span>
  </p>

  <p>
    Sent:{" "}
    <span className="text-slate-200">
      {cleanDate(delivery.sentAt)}
    </span>
  </p>

  {delivery.lastError ? (
    <p className="text-red-200">Error: {delivery.lastError}</p>
  ) : null}
</div>
                      </div>
                    ))}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}