// src/components/governance/OfficialNoticeInboxClient.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import GovernanceNoticeAttachmentList, {
  type GovernanceNoticeAttachmentItem,
} from "@/components/governance/GovernanceNoticeAttachmentList";

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
    idempotencyKey?: string | null;
    idempotencyScope?: string | null;
    metadata?: Record<string, unknown> | null;
    attachments: GovernanceNoticeAttachmentItem[];
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
    actionRequirement?: {
    noticeKind: string;
    requiresAcknowledgement: boolean;
    requiresResponse: boolean;
  };
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

type RespondResponse =
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

function metadataString(
  metadata: Record<string, unknown> | null | undefined,
  key: string
) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return "";
  }

  const value = metadata[key];
  return typeof value === "string" ? value : "";
}

function metadataBoolean(
  metadata: Record<string, unknown> | null | undefined,
  key: string
) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return false;
  }

  return metadata[key] === true;
}

function officialNoticeRef(notice: NoticeInboxItem["notice"]) {
  return `GOV-${notice.id.slice(-8).toUpperCase()}`;
}

function noticeScopeLabel(notice: NoticeInboxItem["notice"]) {
  if (notice.tenant) {
    return `${notice.tenant.name}${
      notice.tenant.schoolCode ? ` · ${notice.tenant.schoolCode}` : ""
    }`;
  }

  if (notice.zone) {
    return `${notice.zone.name}${
      notice.zone.zoneType?.name ? ` · ${notice.zone.zoneType.name}` : ""
    }`;
  }

  return "General governance scope";
}

function noticeSenderLabel(notice: NoticeInboxItem["notice"]) {
  return notice.sender?.name || notice.sender?.email || "Verified system sender";
}

function noticeActionRequirement(item: NoticeInboxItem) {
  const noticeKind =
    item.actionRequirement?.noticeKind ||
    metadataString(item.notice.metadata, "noticeKind");

  const hasMetadataAck =
    item.notice.metadata &&
    typeof item.notice.metadata === "object" &&
    !Array.isArray(item.notice.metadata) &&
    Object.prototype.hasOwnProperty.call(item.notice.metadata, "requiresAcknowledgement");

  const hasMetadataResponse =
    item.notice.metadata &&
    typeof item.notice.metadata === "object" &&
    !Array.isArray(item.notice.metadata) &&
    Object.prototype.hasOwnProperty.call(item.notice.metadata, "requiresResponse");

  if (item.actionRequirement) {
    return item.actionRequirement;
  }

  if (noticeKind === "INFORMATION_ONLY") {
    return {
      noticeKind: "INFORMATION_ONLY",
      requiresAcknowledgement: false,
      requiresResponse: false,
    };
  }

  if (noticeKind === "ACKNOWLEDGEMENT_REQUIRED") {
    return {
      noticeKind: "ACKNOWLEDGEMENT_REQUIRED",
      requiresAcknowledgement: true,
      requiresResponse: false,
    };
  }

  if (noticeKind === "RESPONSE_REQUIRED" || noticeKind === "URGENT_DIRECTIVE") {
    return {
      noticeKind,
      requiresAcknowledgement: true,
      requiresResponse: true,
    };
  }

  if (hasMetadataAck || hasMetadataResponse) {
    const requiresResponse = metadataBoolean(item.notice.metadata, "requiresResponse");
    const requiresAcknowledgement =
      metadataBoolean(item.notice.metadata, "requiresAcknowledgement") ||
      requiresResponse;

    return {
      noticeKind: requiresResponse
        ? "RESPONSE_REQUIRED"
        : requiresAcknowledgement
          ? "ACKNOWLEDGEMENT_REQUIRED"
          : "INFORMATION_ONLY",
      requiresAcknowledgement,
      requiresResponse,
    };
  }

  if (
    item.notice.caseId ||
    item.notice.title.toLowerCase().includes("intervention")
  ) {
    return {
      noticeKind: "LEGACY_INTERVENTION",
      requiresAcknowledgement: true,
      requiresResponse: true,
    };
  }

  return {
    noticeKind: "INFORMATION_ONLY",
    requiresAcknowledgement: false,
    requiresResponse: false,
  };
}

function noticeKindLabel(kind: string) {
  if (kind === "INFORMATION_ONLY") return "Information only";
  if (kind === "ACKNOWLEDGEMENT_REQUIRED") return "Acknowledgement required";
  if (kind === "RESPONSE_REQUIRED") return "Response required";
  if (kind === "URGENT_DIRECTIVE") return "Urgent directive";
  if (kind === "LEGACY_INTERVENTION") return "Intervention response required";
  return kind.replaceAll("_", " ");
}

function AuthenticityBanner({
  notice,
}: {
  notice: NoticeInboxItem["notice"];
}) {
  const targetLabel =
    metadataString(notice.metadata, "targetLabel") ||
    noticeScopeLabel(notice);

  return (
    <div className="mt-3 rounded-2xl border border-emerald-300/20 bg-emerald-400/[0.06] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden="true"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-emerald-300/25 bg-emerald-400/15 text-sm font-bold text-emerald-100"
          >
            ✓
          </span>

          <div className="min-w-0">
            <p className="text-sm font-bold text-emerald-100">
              Verified official notice
            </p>
            <p className="text-[11px] leading-4 text-emerald-100/70">
              EduLife OS is the source of truth.
            </p>
          </div>
        </div>

        <span className="rounded-full border border-emerald-300/25 bg-emerald-400/15 px-3 py-1 text-xs font-bold text-emerald-100">
          {officialNoticeRef(notice)}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-xl border border-white/10 bg-slate-950/35 px-3 py-2">
          <p className="text-[11px] text-slate-400">
            Verified sender
          </p>
          <p className="mt-1 break-words font-semibold text-white">
            {noticeSenderLabel(notice)}
          </p>
        </div>

        <div className="rounded-xl border border-white/10 bg-slate-950/35 px-3 py-2">
          <p className="text-[11px] text-slate-400">
            Issued
          </p>
          <p className="mt-1 font-semibold text-white">
            {cleanDate(notice.sentAt ?? notice.createdAt)}
          </p>
        </div>

        <div className="col-span-2 rounded-xl border border-white/10 bg-slate-950/35 px-3 py-2">
          <p className="text-[11px] text-slate-400">
            Notice applies to
          </p>
          <p className="mt-1 break-words font-semibold text-white">
            {targetLabel}
          </p>
        </div>
      </div>
    </div>
  );
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
  const [responseDrafts, setResponseDrafts] = useState<Record<string, string>>({});

  const unreadCount = useMemo(
    () => items.filter((item) => !item.readAt).length,
    [items]
  );

  const unacknowledgedCount = useMemo(
    () =>
      items.filter((item) => {
        const requirement = noticeActionRequirement(item);
        return requirement.requiresAcknowledgement && !item.acknowledgedAt;
      }).length,
    [items]
  );

  const unrespondedCount = useMemo(
    () =>
      items.filter((item) => {
        const requirement = noticeActionRequirement(item);
        return requirement.requiresResponse && !item.respondedAt;
      }).length,
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
    const key = `ack:${item.id}`;
    setBusyId(key);
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

      setAction(
        noticeActionRequirement(item).requiresAcknowledgement
          ? "Notice acknowledged successfully."
          : "Notice marked as read."
      );
      await loadInbox();
    } catch {
      setError("Network/server error while acknowledging notice.");
    } finally {
      setBusyId(null);
    }
  }

  async function submitResponse(item: NoticeInboxItem) {
    const key = `respond:${item.id}`;
    const responseBody = String(responseDrafts[item.id] ?? "").trim();

    if (responseBody.length < 20) {
      setError("Response must be at least 20 characters.");
      return;
    }

    setBusyId(key);
    setError(null);
    setAction(null);

    try {
      const res = await fetch("/api/governance/notices/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          recipientId: item.id,
          responseBody,
          metadata: {
            source: "official-notice-inbox-ui",
            portalLabel,
          },
        }),
      });

      const json = (await res.json().catch(() => null)) as RespondResponse | null;

      if (!res.ok || !json?.ok) {
        setError(json && !json.ok ? json.error : `Failed to submit response (${res.status})`);
        return;
      }

      setResponseDrafts((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });

      setAction("Response submitted successfully.");
      await loadInbox();
    } catch {
      setError("Network/server error while submitting corrective response.");
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
            <span className="rounded-full border border-blue-300/25 bg-blue-400/10 px-3 py-1 text-blue-100">
              Awaiting response: <b>{unrespondedCount}</b>
            </span>
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-4 md:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">Notice Inbox</h2>
            <p className="mt-1 text-sm text-slate-400">
              Review official instructions, acknowledge receipt, and submit corrective action evidence.
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
            const requirement = noticeActionRequirement(item);
            const requiresAcknowledgement = requirement.requiresAcknowledgement;
            const requiresResponse = requirement.requiresResponse;
            const informationOnly =
              !requiresAcknowledgement && !requiresResponse;
            const acknowledged = Boolean(item.acknowledgedAt);
            const read = Boolean(item.readAt);
            const responded = Boolean(item.respondedAt);
            const ackKey = `ack:${item.id}`;
            const respondKey = `respond:${item.id}`;
            const responseDraft = responseDrafts[item.id] ?? "";
            const responseReady = responseDraft.trim().length >= 20;

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
                      <span className="rounded-full border border-sky-300/25 bg-sky-500/10 px-3 py-1 text-[11px] font-semibold text-sky-100">
                        {noticeKindLabel(requirement.noticeKind)}
                      </span>

                      {informationOnly ? (
                        <span className="rounded-full border border-slate-300/20 bg-white/5 px-3 py-1 text-[11px] font-semibold text-slate-200">
                          {read ? "READ" : "UNREAD"}
                        </span>
                      ) : requiresAcknowledgement ? (
                        acknowledged ? (
                          <span className="rounded-full border border-emerald-300/25 bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold text-emerald-100">
                            ACKNOWLEDGED
                          </span>
                        ) : (
                          <span className="rounded-full border border-red-300/25 bg-red-500/10 px-3 py-1 text-[11px] font-semibold text-red-100">
                            ACKNOWLEDGEMENT NEEDED
                          </span>
                        )
                      ) : null}

                      {requiresResponse ? (
                        responded ? (
                          <span className="rounded-full border border-blue-300/25 bg-blue-400/10 px-3 py-1 text-[11px] font-semibold text-blue-100">
                            RESPONDED
                          </span>
                        ) : (
                          <span className="rounded-full border border-amber-300/25 bg-amber-400/10 px-3 py-1 text-[11px] font-semibold text-amber-100">
                            RESPONSE PENDING
                          </span>
                        )
                      ) : null}
                    </div>

                    <div className="mt-3 overflow-hidden rounded-2xl border border-emerald-300/25 bg-[linear-gradient(135deg,rgba(16,185,129,0.20),rgba(6,78,59,0.15),rgba(15,23,42,0.92))] p-4 shadow-[0_16px_50px_rgba(5,150,105,0.10)] sm:p-5">
  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-200">
    Official message
  </p>

  <h3 className="mt-2 break-words text-xl font-bold leading-snug text-white sm:text-2xl">
    {item.notice.title}
  </h3>

  <div className="mt-4 border-l-4 border-emerald-300/45 pl-4">
    <p className="whitespace-pre-wrap text-base leading-8 text-emerald-50 sm:text-lg sm:leading-9">
      {item.notice.body}
    </p>
  </div>
</div>

<AuthenticityBanner notice={item.notice} />

<GovernanceNoticeAttachmentList
  attachments={item.notice.attachments}
/>

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
                      {requiresAcknowledgement ? (
                        <p className="mt-2">
                          <span className="text-slate-500">Acknowledged:</span>{" "}
                          {cleanDate(item.acknowledgedAt)}
                        </p>
                      ) : null}

                      {requiresResponse ? (
                        <p className="mt-2">
                          <span className="text-slate-500">Responded:</span>{" "}
                          {cleanDate(item.respondedAt)}
                        </p>
                      ) : null}
                    </div>

                    {requiresAcknowledgement ? (
                      <button
                        type="button"
                        onClick={() => void acknowledgeNotice(item)}
                        disabled={acknowledged || busyId === ackKey}
                        className="mt-3 w-full rounded-full border border-emerald-300/25 bg-emerald-400/10 px-4 py-2 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-400/15 disabled:cursor-not-allowed disabled:opacity-55"
                      >
                        {acknowledged
                          ? "Already acknowledged"
                          : busyId === ackKey
                            ? "Acknowledging..."
                            : "Acknowledge notice"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void acknowledgeNotice(item)}
                        disabled={read || busyId === ackKey}
                        className="mt-3 w-full rounded-full border border-slate-300/20 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-55"
                      >
                        {read
                          ? "Already read"
                          : busyId === ackKey
                            ? "Marking read..."
                            : "Mark as read"}
                      </button>
                    )}
                  </div>
                </div>
                {requiresResponse ? (
                <div className="mt-5 rounded-2xl border border-blue-300/15 bg-blue-400/[0.055] p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-100">
                        Required Response
                      </p>
                      <p className="mt-1 text-xs leading-5 text-slate-300">
                        Submit the action or feedback required by this official notice. For intervention notices, this becomes part of the governance evidence chain.
                      </p>
                    </div>

                    {responded ? (
                      <span className="rounded-full border border-emerald-300/25 bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold text-emerald-100">
                        Submitted
                      </span>
                    ) : (
                      <span className="rounded-full border border-amber-300/25 bg-amber-400/10 px-3 py-1 text-[11px] font-semibold text-amber-100">
                        Required
                      </span>
                    )}
                  </div>

                  {responded ? (
                    <div className="mt-3 rounded-2xl border border-white/10 bg-[#05070B] p-3">
                      <p className="text-xs text-slate-500">
                        Submitted:{" "}
                        <span className="text-slate-200">{cleanDate(item.respondedAt)}</span>
                      </p>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-200">
                        {item.responseBody}
                      </p>
                    </div>
                  ) : (
                    <div className="mt-3 space-y-3">
                      <textarea
                        value={responseDraft}
                        onChange={(e) =>
                          setResponseDrafts((prev) => ({
                            ...prev,
                            [item.id]: e.target.value,
                          }))
                        }
                        rows={4}
                        placeholder="Example: Corrective action taken: attendance capture has been reviewed, lesson delivery evidence has been updated, and assessment scoring will be monitored daily..."
                        className="w-full rounded-2xl border border-white/10 bg-[#05070B] px-3 py-3 text-sm leading-6 text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-blue-300/40"
                      />

                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-xs text-slate-400">
                          Minimum 20 characters. Current: {responseDraft.trim().length}
                        </p>

                        <button
                          type="button"
                          onClick={() => void submitResponse(item)}
                          disabled={!responseReady || busyId === respondKey}
                          className="rounded-full border border-blue-300/25 bg-blue-400/10 px-4 py-2 text-xs font-semibold text-blue-100 transition hover:bg-blue-400/15 disabled:cursor-not-allowed disabled:opacity-55"
                        >
                          {busyId === respondKey ? "Submitting..." : "Submit response"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                ) : informationOnly ? (
                  <div className="mt-5 rounded-2xl border border-slate-300/15 bg-white/[0.035] p-4 text-sm leading-6 text-slate-300">
                    This is an information-only official notice. No acknowledgement
                    or response is required. Use “Mark as read” after reviewing it.
                  </div>
                ) : (
                  <div className="mt-5 rounded-2xl border border-emerald-300/15 bg-emerald-400/[0.06] p-4 text-sm leading-6 text-emerald-100">
                    This notice only requires acknowledgement. No written response is required.
                  </div>
                )}
                <details className="group mt-4 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025]">
  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
    <div className="min-w-0">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">
        Delivery evidence
      </p>
      <p className="mt-0.5 text-[11px] text-slate-500">
        {item.deliveries.length}{" "}
        {item.deliveries.length === 1
          ? "channel recorded"
          : "channels recorded"}
      </p>
    </div>

    <div className="flex shrink-0 items-center gap-2">
      <div className="hidden flex-wrap justify-end gap-1 sm:flex">
        {item.deliveries.map((delivery) => (
          <span
            key={delivery.id}
            className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${statusClass(
              delivery.status,
            )}`}
          >
            {delivery.channel}:{" "}
            {delivery.status.replaceAll("_", " ")}
          </span>
        ))}
      </div>

      <span className="inline-flex min-h-8 items-center rounded-full border border-white/10 bg-white/5 px-3 text-xs font-semibold text-slate-200 group-open:hidden">
        Show details
      </span>

      <span className="hidden min-h-8 items-center rounded-full border border-white/10 bg-white/5 px-3 text-xs font-semibold text-slate-200 group-open:inline-flex">
        Hide details
      </span>
    </div>
  </summary>

  <div className="border-t border-white/10 px-3 py-2.5">
    <div className="space-y-2">
      {item.deliveries.map((delivery) => (
        <div
          key={delivery.id}
          className="grid gap-2 rounded-xl border border-white/10 bg-[#05070B] px-3 py-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
        >
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span
              className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${channelClass(
                delivery.channel,
              )}`}
            >
              {delivery.channel}
            </span>

            <span
              className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${statusClass(
                delivery.status,
              )}`}
            >
              {delivery.status.replaceAll("_", " ")}
            </span>

            <span className="min-w-0 text-xs text-slate-300">
              {deliveryStatusLabel(delivery)}
            </span>
          </div>

          <p className="text-[11px] text-slate-500 sm:text-right">
            {delivery.sentAt
              ? cleanDate(delivery.sentAt)
              : "Not sent yet"}
          </p>

          {delivery.lastError ? (
            <p className="text-xs text-red-200 sm:col-span-2">
              Delivery issue: {delivery.lastError}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  </div>
</details>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}