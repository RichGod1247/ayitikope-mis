// src/components/governance/GovernanceSentNoticeAccountabilityClient.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import GovernanceNoticeAttachmentList, {
  type GovernanceNoticeAttachmentItem,
} from "@/components/governance/GovernanceNoticeAttachmentList";

type AccountabilityMode = "mine" | "jurisdiction";

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
  senderUserId: string;
  title: string;
  body: string;
  priority: string;
  status: string;
  channels: unknown;
    audienceSummary: string | null;
  idempotencyKey?: string | null;
  idempotencyScope?: string | null;
  metadata?: Record<string, unknown> | null;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
  sender: {
    id: string;
    name: string | null;
    email: string;
  } | null;
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
  attachments: GovernanceNoticeAttachmentItem[];
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
    respondedAt: string | null;
    responseBody: string | null;
    createdAt: string;
  }>;
  accountability: {
    mode?: AccountabilityMode;
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
  | { ok: true; items: SentNotice[]; count: number; mode?: AccountabilityMode }
  | { ok: false; error: string };

type Props = {
  mode?: AccountabilityMode;
  title?: string;
  description?: string;
};

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

function responseStatusLabel(
  recipient: SentNotice["recipients"][number],
  requirement: ReturnType<typeof sentNoticeActionRequirement>,
) {
  if (!requirement.requiresAcknowledgement) {
    return recipient.readAt ? "Read" : "Unread";
  }

  if (requirement.requiresResponse) {
    if (recipient.respondedAt) return "Responded";
    if (recipient.acknowledgedAt) {
      return "Acknowledged · awaiting response";
    }
    if (recipient.readAt) {
      return "Read · awaiting acknowledgement";
    }

    return "Response required";
  }

  if (recipient.acknowledgedAt) return "Acknowledged";
  if (recipient.readAt) {
    return "Read · awaiting acknowledgement";
  }

  return "Acknowledgement required";
}

function responseStatusClass(
  recipient: SentNotice["recipients"][number],
  requirement: ReturnType<typeof sentNoticeActionRequirement>,
) {
  if (!requirement.requiresAcknowledgement) {
    return recipient.readAt
      ? "border-emerald-300/25 bg-emerald-400/10 text-emerald-100"
      : "border-slate-300/20 bg-white/5 text-slate-200";
  }

  if (requirement.requiresResponse && recipient.respondedAt) {
    return "border-blue-300/25 bg-blue-400/10 text-blue-100";
  }

  if (recipient.acknowledgedAt) {
    return requirement.requiresResponse
      ? "border-amber-300/25 bg-amber-400/10 text-amber-100"
      : "border-emerald-300/25 bg-emerald-400/10 text-emerald-100";
  }

  return "border-red-300/25 bg-red-500/10 text-red-100";
}

function sentMetadataString(
  metadata: Record<string, unknown> | null | undefined,
  key: string
) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return "";
  }

  const value = metadata[key];
  return typeof value === "string" ? value : "";
}

function sentMetadataBoolean(
  metadata: Record<string, unknown> | null | undefined,
  key: string
) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return false;
  }

  return metadata[key] === true;
}

function sentNoticeActionRequirement(item: SentNotice) {
  const noticeKind = sentMetadataString(
    item.metadata,
    "noticeKind",
  );

  const hasAcknowledgementFlag =
    !!item.metadata &&
    typeof item.metadata === "object" &&
    !Array.isArray(item.metadata) &&
    Object.prototype.hasOwnProperty.call(
      item.metadata,
      "requiresAcknowledgement",
    );

  const hasResponseFlag =
    !!item.metadata &&
    typeof item.metadata === "object" &&
    !Array.isArray(item.metadata) &&
    Object.prototype.hasOwnProperty.call(
      item.metadata,
      "requiresResponse",
    );

  if (noticeKind === "INFORMATION_ONLY") {
    return {
      noticeKind,
      requiresAcknowledgement: false,
      requiresResponse: false,
    };
  }

  if (noticeKind === "ACKNOWLEDGEMENT_REQUIRED") {
    return {
      noticeKind,
      requiresAcknowledgement: true,
      requiresResponse: false,
    };
  }

  if (
    noticeKind === "RESPONSE_REQUIRED" ||
    noticeKind === "URGENT_DIRECTIVE"
  ) {
    return {
      noticeKind,
      requiresAcknowledgement: true,
      requiresResponse: true,
    };
  }

  if (hasAcknowledgementFlag || hasResponseFlag) {
    const requiresResponse = sentMetadataBoolean(
      item.metadata,
      "requiresResponse",
    );

    const requiresAcknowledgement =
      sentMetadataBoolean(
        item.metadata,
        "requiresAcknowledgement",
      ) || requiresResponse;

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
    item.caseId ||
    item.title.toLowerCase().includes("intervention")
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

function sentOfficialNoticeRef(item: SentNotice) {
  return `GOV-${item.id.slice(-8).toUpperCase()}`;
}

function sentScopeLabel(item: SentNotice) {
  if (item.tenant) {
    return `${item.tenant.name}${
      item.tenant.schoolCode ? ` · ${item.tenant.schoolCode}` : ""
    }`;
  }

  if (item.zone) {
    return `${item.zone.name}${
      item.zone.zoneType?.name ? ` · ${item.zone.zoneType.name}` : ""
    }`;
  }

  return "General governance scope";
}

function sentSenderLabel(item: SentNotice) {
  return item.sender?.name || item.sender?.email || "Verified system sender";
}

function SentAuthenticityBanner({ item }: { item: SentNotice }) {
  const targetLabel =
    sentMetadataString(
      item.metadata,
      "targetLabel",
    ) || sentScopeLabel(item);

  const noticeKind = sentMetadataString(
    item.metadata,
    "noticeKind",
  );

  const requiresAcknowledgement =
    sentMetadataBoolean(
      item.metadata,
      "requiresAcknowledgement",
    );

  const requiresResponse =
    sentMetadataBoolean(
      item.metadata,
      "requiresResponse",
    );

  const securityRule =
    sentMetadataString(
      item.metadata,
      "securityRule",
    ) ||
    "EduLife OS portal is the source of truth. SMS and email are alerts/copies. WhatsApp is not authoritative without a matching EduLife OS notice reference.";

  return (
    <div className="mt-3 rounded-2xl border border-emerald-300/20 bg-emerald-400/10 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-200">
            Verified official notice
          </p>

          <p className="mt-1 text-xs leading-5 text-emerald-100/85">
            Verified sender, audience and required action.
          </p>
        </div>

        <span className="rounded-full border border-emerald-300/25 bg-emerald-400/15 px-3 py-1 text-[11px] font-bold text-emerald-100">
          {sentOfficialNoticeRef(item)}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 xl:grid-cols-5">
        <div className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2">
          <p className="text-[11px] text-slate-400">
            Sender
          </p>
          <p className="mt-1 break-words text-xs font-semibold text-white">
            {sentSenderLabel(item)}
          </p>
        </div>

        <div className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2">
          <p className="text-[11px] text-slate-400">
            Sent
          </p>
          <p className="mt-1 text-xs font-semibold text-white">
            {dateLabel(
              item.sentAt ??
                item.createdAt,
            )}
          </p>
        </div>

        <div className="col-span-2 rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 xl:col-span-1">
          <p className="text-[11px] text-slate-400">
            Audience
          </p>
          <p className="mt-1 break-words text-xs font-semibold text-white">
            {targetLabel}
          </p>
        </div>

        <div className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2">
          <p className="text-[11px] text-slate-400">
            Notice type
          </p>
          <p className="mt-1 text-xs font-semibold text-white">
            {noticeKind
              ? noticeKind.replaceAll(
                  "_",
                  " ",
                )
              : "Not specified"}
          </p>
        </div>

        <div className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2">
          <p className="text-[11px] text-slate-400">
            Action
          </p>
          <p className="mt-1 text-xs font-semibold text-white">
            {requiresResponse
              ? "Response required"
              : requiresAcknowledgement
                ? "Acknowledge"
                : "Information only"}
          </p>
        </div>
      </div>

      <p className="mt-2 text-[11px] leading-5 text-emerald-100/75">
        {securityRule}
      </p>
    </div>
  );
}

export default function GovernanceSentNoticeAccountabilityClient({
  mode = "mine",
  title = "Sent official notices",
  description = "Track who received official notices, who acknowledged, and which cases still need follow-up.",
}: Props) {
  const [items, setItems] = useState<SentNotice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    params.set("take", "10");
    params.set("mode", mode);

    try {
      const res = await fetch(`/api/governance/notices/sent?${params.toString()}`, {
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
  }, [mode]);

  useEffect(() => {
    void load();
  }, [load]);

  const totals = useMemo(() => {
  return items.reduce(
    (acc, item) => {
      const requirement =
        sentNoticeActionRequirement(item);

      const totalRecipients =
        item.recipients.length;

      const readRecipients =
        item.recipients.filter((recipient) =>
          Boolean(recipient.readAt),
        ).length;

      const acknowledgedRecipients =
        item.recipients.filter((recipient) =>
          Boolean(recipient.acknowledgedAt),
        ).length;

      const respondedRecipients =
        item.recipients.filter((recipient) =>
          Boolean(recipient.respondedAt),
        ).length;

      const unreadRecipients = Math.max(
        0,
        totalRecipients - readRecipients,
      );

      const pendingAcknowledgements =
        requirement.requiresAcknowledgement
          ? Math.max(
              0,
              totalRecipients -
                acknowledgedRecipients,
            )
          : 0;

      const pendingResponses =
        requirement.requiresResponse
          ? Math.max(
              0,
              totalRecipients -
                respondedRecipients,
            )
          : 0;

      const needsAction =
        requirement.requiresResponse
          ? pendingResponses
          : requirement.requiresAcknowledgement
            ? pendingAcknowledgements
            : unreadRecipients;

      acc.notices += 1;
      acc.recipients += totalRecipients;
      acc.read += readRecipients;
      acc.needsAction += needsAction;

      return acc;
    },
    {
      notices: 0,
      recipients: 0,
      read: 0,
      needsAction: 0,
    },
  );
}, [items]);

  const modeLabel =
    mode === "jurisdiction" ? "Jurisdiction-wide" : "My sent notices";

  return (
    <section className="rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.03))] p-5 shadow-[0_20px_70px_rgba(0,0,0,0.20)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#E8C96A]">
            Notice Accountability · {modeLabel}
          </p>
          <h2 className="mt-2 text-xl font-bold text-white">{title}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
            {description}
          </p>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-slate-200">
    Notices: <b className="text-white">{totals.notices}</b>
  </span>

  <span className="rounded-full border border-indigo-300/25 bg-indigo-400/10 px-3 py-1 text-indigo-100">
    Recipients: <b>{totals.recipients}</b>
  </span>

  <span className="rounded-full border border-emerald-300/25 bg-emerald-400/10 px-3 py-1 text-emerald-100">
    Read: <b>{totals.read}</b>
  </span>

  <span className="rounded-full border border-amber-300/25 bg-amber-400/10 px-3 py-1 text-amber-100">
    Need follow-up: <b>{totals.needsAction}</b>
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
          Loading notice accountability...
        </div>
      ) : null}

      {error ? (
        <div className="mt-5 rounded-2xl border border-red-300/25 bg-red-500/10 p-4 text-sm text-red-100">
          {error}
        </div>
      ) : null}

      {!loading && !items.length && !error ? (
        <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-300">
          No official notices found for this view yet.
        </div>
      ) : null}

      <div className="mt-5 space-y-4">
        {items.map((item) => {
          const requirement =
  sentNoticeActionRequirement(item);

const requiresAcknowledgement =
  requirement.requiresAcknowledgement;

const requiresResponse =
  requirement.requiresResponse;

const informationOnly =
  !requiresAcknowledgement &&
  !requiresResponse;

const readCount = item.recipients.filter(
  (recipient) => Boolean(recipient.readAt),
).length;

const unreadCount = Math.max(
  0,
  item.recipients.length - readCount,
);

const acknowledgedCount =
  item.recipients.filter((recipient) =>
    Boolean(recipient.acknowledgedAt),
  ).length;

const pendingAcknowledgement =
  requiresAcknowledgement
    ? Math.max(
        0,
        item.recipients.length -
          acknowledgedCount,
      )
    : 0;

const respondedCount =
  item.recipients.filter((recipient) =>
    Boolean(recipient.respondedAt),
  ).length;

const awaitingResponse =
  requiresResponse
    ? Math.max(
        0,
        item.recipients.length -
          respondedCount,
      )
    : 0;

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
                    {informationOnly ? (
  <span
    className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${
      unreadCount
        ? "border-slate-300/20 bg-white/5 text-slate-200"
        : "border-emerald-300/25 bg-emerald-400/10 text-emerald-100"
    }`}
  >
    {unreadCount
      ? `${unreadCount} unread`
      : "Read"}
  </span>
) : requiresResponse ? (
  awaitingResponse > 0 ? (
    <span className="rounded-full border border-amber-300/25 bg-amber-400/10 px-3 py-1 text-[11px] font-semibold text-amber-100">
      Response follow-up needed
    </span>
  ) : (
    <span className="rounded-full border border-blue-300/25 bg-blue-400/10 px-3 py-1 text-[11px] font-semibold text-blue-100">
      Response received
    </span>
  )
) : pendingAcknowledgement > 0 ? (
  <span className="rounded-full border border-red-300/25 bg-red-500/10 px-3 py-1 text-[11px] font-semibold text-red-100">
    Acknowledgement pending
  </span>
) : (
  <span className="rounded-full border border-emerald-300/25 bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold text-emerald-100">
    Acknowledged
  </span>
)}
                  </div>

                  <h3 className="mt-3 text-lg font-semibold text-white">{item.title}</h3>
                  <p className="mt-1 text-xs text-slate-400">
                    Sent {dateLabel(item.sentAt ?? item.createdAt)}
                    {item.tenant?.name ? ` · ${item.tenant.name}` : ""}
                    {item.case?.title ? ` · Case: ${item.case.title}` : ""}
                  </p>

                  <p className="mt-2 text-xs text-slate-400">
                    Sent by:{" "}
                    <span className="font-semibold text-slate-200">
                      {item.sender?.name ?? item.sender?.email ?? "Unknown sender"}
                    </span>
                    {item.sender?.email ? ` · ${item.sender.email}` : ""}
                  </p>
                </div>

                <div className="grid w-full grid-cols-2 gap-2 text-[11px] sm:grid-cols-4 xl:w-auto xl:min-w-[430px]">
  <span className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-slate-300">
    <span>Recipients</span>
    <b className="ml-2 text-sm text-white">
      {item.accountability.totalRecipients}
    </b>
  </span>

  <span className="flex items-center justify-between rounded-xl border border-emerald-300/20 bg-emerald-400/10 px-3 py-2 text-emerald-100">
    <span>Read</span>
    <b className="ml-2 text-sm">
      {readCount}
    </b>
  </span>

  <span className="flex items-center justify-between rounded-xl border border-indigo-300/20 bg-indigo-400/10 px-3 py-2 text-indigo-100">
    <span>Acknowledged</span>
    <b className="ml-2 text-sm">
      {requiresAcknowledgement
        ? acknowledgedCount
        : "—"}
    </b>
  </span>

  <span className="flex items-center justify-between rounded-xl border border-blue-300/20 bg-blue-400/10 px-3 py-2 text-blue-100">
    <span>Responded</span>
    <b className="ml-2 text-sm">
      {requiresResponse
        ? respondedCount
        : "—"}
    </b>
  </span>
</div>
                            </div>

              <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Official notice body
                </p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-200">
                  {item.body}
                </p>
              </div>

              <SentAuthenticityBanner item={item} />

<GovernanceNoticeAttachmentList
  attachments={item.attachments}
  heading={
    item.attachments.length === 1
      ? "Sealed notice document"
      : "Sealed notice documents"
  }
  showVisibility
/>

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

                      <span
  className={`rounded-full border px-3 py-1 font-semibold ${responseStatusClass(
    recipient,
    requirement,
  )}`}
>
  {responseStatusLabel(
    recipient,
    requirement,
  )}
</span>
                    </div>

                    <p className="mt-3 text-slate-400">
                      Read: <span className="text-slate-200">{dateLabel(recipient.readAt)}</span>
                    </p>
                    {requiresAcknowledgement ? (
  <p className="mt-1 text-slate-400">
    Acknowledged:{" "}
    <span className="text-slate-200">
      {dateLabel(recipient.acknowledgedAt)}
    </span>
  </p>
) : null}

{requiresResponse ? (
  <p className="mt-1 text-slate-400">
    Responded:{" "}
    <span className="text-slate-200">
      {dateLabel(recipient.respondedAt)}
    </span>
  </p>
) : null}

                    {recipient.responseBody ? (
                      <div className="mt-3 rounded-2xl border border-blue-300/15 bg-blue-400/[0.06] p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-100">
                          Corrective response
                        </p>
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-200">
                          {recipient.responseBody}
                        </p>
                      </div>
                    ) : null}
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