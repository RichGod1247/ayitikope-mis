//src/components/governance/GovernanceInterventionLogbookClient.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type GovernanceCaseStatus =
  | "OPEN"
  | "IN_PROGRESS"
  | "RESOLVED"
  | "ESCALATED"
  | "CANCELLED";

type GovernanceCase = {
  id: string;
  tenantId: string | null;
  zoneId: string | null;
  scopeType: "SCHOOL" | "CIRCUIT" | "DISTRICT";
  title: string;
  summary: string;
  priority: string;
  status: GovernanceCaseStatus;
  riskScore: number | null;
  riskLevel: string | null;
  createdAt: string;
  updatedAt: string;
  dueAt?: string | null;
  resolutionNote?: string | null;
  tenant?: {
    id: string;
    name: string;
    schoolCode: string | null;
  } | null;
  zone?: {
    id: string;
    name: string;
    zoneType?: { name: string; level: number } | null;
    parentZone?: { id: string; name: string } | null;
  } | null;
  createdBy?: {
    id: string;
    name: string | null;
    email: string;
  } | null;
  events?: Array<{
    id: string;
    eventType: string;
    fromStatus: GovernanceCaseStatus | null;
    toStatus: GovernanceCaseStatus | null;
    note: string | null;
    createdAt: string;
    actor?: {
      id: string;
      name: string | null;
      email: string;
    } | null;
  }>;
  notices?: Array<{
    id: string;
    title: string;
    status: string;
    priority?: string;
    sentAt: string | null;
    createdAt: string;
    recipients?: Array<{
      id: string;
      displayName: string | null;
      roleLabel: string | null;
      readAt: string | null;
      acknowledgedAt: string | null;
      acknowledgeNote?: string | null;
      respondedAt: string | null;
      responseBody: string | null;
    }>;
  }>;
};

type CaseListResponse =
  | { ok: true; items: GovernanceCase[]; count: number }
  | { ok: false; error: string };

type TimelineEntry = {
  id: string;
  at: string;
  label: string;
  detail: string;
  actor: string | null;
  tone: "default" | "info" | "success" | "warning" | "danger";
};

type Props = {
  isDistrictView: boolean;
  onClose: () => void;
};

function dateLabel(value?: string | null) {
  if (!value) return "Time not available";

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

function cleanLabel(value: string) {
  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/^./, (character) => character.toUpperCase());
}

function isClosed(item: GovernanceCase) {
  return item.status === "RESOLVED" || item.status === "CANCELLED";
}

function isOverdue(item: GovernanceCase) {
  if (!item.dueAt || isClosed(item)) return false;

  const due = new Date(item.dueAt);
  return Number.isFinite(due.getTime()) && due.getTime() < Date.now();
}

function statusClass(status: GovernanceCaseStatus) {
  if (status === "RESOLVED") {
    return "border-emerald-300/25 bg-emerald-400/10 text-emerald-100";
  }

  if (status === "ESCALATED") {
    return "border-red-300/25 bg-red-500/10 text-red-100";
  }

  if (status === "IN_PROGRESS") {
    return "border-sky-300/25 bg-sky-500/10 text-sky-100";
  }

  if (status === "CANCELLED") {
    return "border-white/10 bg-white/5 text-slate-300";
  }

  return "border-amber-300/25 bg-amber-400/10 text-amber-100";
}

function timelineToneClass(tone: TimelineEntry["tone"]) {
  if (tone === "success") return "border-emerald-300/20 bg-emerald-400/10";
  if (tone === "warning") return "border-amber-300/20 bg-amber-400/10";
  if (tone === "danger") return "border-red-300/20 bg-red-500/10";
  if (tone === "info") return "border-sky-300/20 bg-sky-500/10";
  return "border-white/10 bg-white/[0.04]";
}

function eventTone(eventType: string): TimelineEntry["tone"] {
  const value = eventType.toUpperCase();

  if (value.includes("RESOLV") || value.includes("CLOSE")) return "success";
  if (value.includes("ESCALAT") || value.includes("CRITICAL")) return "danger";
  if (value.includes("RESPONSE") || value.includes("ACKNOWLEDG")) return "info";
  if (value.includes("NOTICE") || value.includes("DIRECTIVE")) return "warning";

  return "default";
}

function caseTimeline(item: GovernanceCase): TimelineEntry[] {
  const entries: TimelineEntry[] = [
    {
      id: `${item.id}:created`,
      at: item.createdAt,
      label: "Case opened",
      detail: item.summary || item.title,
      actor: item.createdBy?.name || item.createdBy?.email || null,
      tone: "warning",
    },
  ];

  for (const event of item.events ?? []) {
    const statusChange =
      event.fromStatus || event.toStatus
        ? [event.fromStatus, event.toStatus].filter(Boolean).join(" → ")
        : "";

    entries.push({
      id: `${item.id}:event:${event.id}`,
      at: event.createdAt,
      label: cleanLabel(event.eventType),
      detail: event.note || statusChange || "Governance workflow event recorded.",
      actor: event.actor?.name || event.actor?.email || null,
      tone: eventTone(event.eventType),
    });
  }

  for (const notice of item.notices ?? []) {
    entries.push({
      id: `${item.id}:notice:${notice.id}`,
      at: notice.sentAt ?? notice.createdAt,
      label: "Official notice sent",
      detail: `${notice.title} · ${cleanLabel(notice.status)}`,
      actor: null,
      tone: "warning",
    });

    for (const recipient of notice.recipients ?? []) {
      const recipientName =
        recipient.displayName || recipient.roleLabel || "Notice recipient";

      if (recipient.readAt) {
        entries.push({
          id: `${item.id}:notice:${notice.id}:read:${recipient.id}`,
          at: recipient.readAt,
          label: "Notice read",
          detail: recipientName,
          actor: recipientName,
          tone: "info",
        });
      }

      if (recipient.acknowledgedAt) {
        entries.push({
          id: `${item.id}:notice:${notice.id}:ack:${recipient.id}`,
          at: recipient.acknowledgedAt,
          label: "Notice acknowledged",
          detail:
            recipient.acknowledgeNote ||
            `${recipientName} acknowledged the official notice.`,
          actor: recipientName,
          tone: "success",
        });
      }

      if (recipient.respondedAt) {
        entries.push({
          id: `${item.id}:notice:${notice.id}:response:${recipient.id}`,
          at: recipient.respondedAt,
          label: "Corrective response received",
          detail:
            recipient.responseBody ||
            `${recipientName} submitted a corrective response.`,
          actor: recipientName,
          tone: "success",
        });
      }
    }
  }

  if (item.status === "RESOLVED" && item.resolutionNote) {
    entries.push({
      id: `${item.id}:resolution`,
      at: item.updatedAt,
      label: "Case resolved",
      detail: item.resolutionNote,
      actor: null,
      tone: "success",
    });
  }

  return entries.sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
  );
}

function scopeLabel(item: GovernanceCase) {
  if (item.tenant) {
    return `${item.tenant.name}${
      item.tenant.schoolCode ? ` · ${item.tenant.schoolCode}` : ""
    }`;
  }

  if (item.zone) return item.zone.name;
  return cleanLabel(item.scopeType);
}

export default function GovernanceInterventionLogbookClient({
  isDistrictView,
  onClose,
}: Props) {
  const [cases, setCases] = useState<GovernanceCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openCaseId, setOpenCaseId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const take = isDistrictView ? 100 : 25;
      const response = await fetch(
        `/api/governance/interventions/list?take=${take}`,
        {
          cache: "no-store",
          credentials: "include",
          headers: { Accept: "application/json" },
        },
      );

      const json = (await response
        .json()
        .catch(() => null)) as CaseListResponse | null;

      if (!response.ok || !json?.ok) {
        setCases([]);
        setError(
          json && !json.ok
            ? json.error
            : `Failed to load governance logbook (${response.status})`,
        );
        return;
      }

      const rows = [...(json.items ?? [])].sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );

      setCases(rows);
      setOpenCaseId((current) => current ?? rows[0]?.id ?? null);
    } catch {
      setCases([]);
      setError("Network/server error while loading the governance logbook.");
    } finally {
      setLoading(false);
    }
  }, [isDistrictView]);

  useEffect(() => {
    void load();
  }, [load]);

  const totals = useMemo(() => {
    return {
      active: cases.filter((item) => !isClosed(item)).length,
      escalated: cases.filter((item) => item.status === "ESCALATED").length,
      overdue: cases.filter(isOverdue).length,
      resolved: cases.filter((item) => item.status === "RESOLVED").length,
    };
  }, [cases]);

  return (
    <section className="fixed inset-0 z-50 overflow-y-auto bg-black/80 px-3 py-4 md:px-5 md:py-6">
      <div className="mx-auto w-full max-w-7xl rounded-[28px] border border-sky-300/25 bg-slate-950 p-4 shadow-2xl shadow-black/70 md:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-200">
              Governance Logbook
            </p>
            <h2 className="mt-1 text-xl font-bold text-white md:text-2xl">
              {isDistrictView
                ? "District intervention evidence timeline"
                : "Circuit intervention evidence timeline"}
            </h2>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-sky-100/80">
              Read-only evidence from intervention cases already restricted to
              your authorized governance scope.
            </p>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="min-h-11 rounded-2xl border border-sky-300/20 bg-sky-500/10 px-4 py-2 text-sm font-semibold text-sky-100 disabled:opacity-50"
            >
              {loading ? "Refreshing..." : "Refresh"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="min-h-11 rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white"
            >
              Close
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-4 gap-2">
          {[
            ["Cases", cases.length],
            ["Active", totals.active],
            ["Escalated", totals.escalated],
            ["Resolved", totals.resolved],
          ].map(([label, value]) => (
            <div
              key={String(label)}
              className="rounded-2xl border border-white/10 bg-white/[0.04] p-2.5 md:p-3"
            >
              <p className="truncate text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-400 md:text-[10px]">
                {label}
              </p>
              <p className="mt-1 text-lg font-bold text-white md:text-xl">
                {value}
              </p>
            </div>
          ))}
        </div>

        {totals.overdue ? (
          <div className="mt-3 rounded-2xl border border-red-300/20 bg-red-500/10 p-3 text-sm text-red-100">
            {totals.overdue} active case(s) are past their recorded due date.
          </div>
        ) : null}

        {error ? (
          <div className="mt-4 rounded-2xl border border-red-300/20 bg-red-500/10 p-4 text-sm text-red-100">
            {error}
          </div>
        ) : null}

        {!loading && !error && !cases.length ? (
          <div className="mt-4 rounded-2xl border border-emerald-300/20 bg-emerald-400/10 p-4 text-sm text-emerald-100">
            No intervention cases are available in this governance scope.
          </div>
        ) : null}

        <div className="mt-4 space-y-3">
          {cases.map((item) => {
            const open = item.id === openCaseId;
            const timeline = open ? caseTimeline(item) : [];

            return (
              <article
                key={item.id}
                className="rounded-2xl border border-white/10 bg-white/[0.03]"
              >
                <button
                  type="button"
                  onClick={() => setOpenCaseId(open ? null : item.id)}
                  className="min-h-16 w-full p-4 text-left"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusClass(
                            item.status,
                          )}`}
                        >
                          {cleanLabel(item.status)}
                        </span>
                        <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[11px] font-semibold text-slate-300">
                          {cleanLabel(item.priority)}
                        </span>
                        {isOverdue(item) ? (
                          <span className="rounded-full border border-red-300/25 bg-red-500/10 px-2.5 py-1 text-[11px] font-semibold text-red-100">
                            Overdue
                          </span>
                        ) : null}
                      </div>

                      <h3 className="mt-2 text-sm font-bold text-white md:text-base">
                        {item.title}
                      </h3>
                      <p className="mt-1 text-xs leading-5 text-slate-400">
                        {scopeLabel(item)} · Updated {dateLabel(item.updatedAt)}
                      </p>
                    </div>

                    <span className="shrink-0 text-lg text-slate-300">
                      {open ? "−" : "+"}
                    </span>
                  </div>
                </button>

                {open ? (
                  <div className="border-t border-white/10 p-4">
                    <p className="text-sm leading-6 text-slate-200">
                      {item.summary}
                    </p>

                    <div className="mt-4 space-y-2">
                      {timeline.map((entry) => (
                        <div
                          key={entry.id}
                          className={`rounded-2xl border p-3 ${timelineToneClass(
                            entry.tone,
                          )}`}
                        >
                          <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                            <p className="text-sm font-semibold text-white">
                              {entry.label}
                            </p>
                            <p className="text-[11px] text-slate-400">
                              {dateLabel(entry.at)}
                            </p>
                          </div>
                          <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-slate-200">
                            {entry.detail}
                          </p>
                          {entry.actor ? (
                            <p className="mt-1 text-[11px] text-slate-400">
                              By {entry.actor}
                            </p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
