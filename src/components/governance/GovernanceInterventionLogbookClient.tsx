//src/components/governance/GovernanceInterventionLogbookClient.tsx
"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type GovernanceCaseStatus =
  | "OPEN"
  | "IN_PROGRESS"
  | "RESOLVED"
  | "ESCALATED"
  | "CANCELLED";

type GovernanceEvent = {
  id: string;
  eventType: string;
  fromStatus: GovernanceCaseStatus | null;
  toStatus: GovernanceCaseStatus | null;
  note: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  actor?: {
    id: string;
    name: string | null;
    email: string;
  } | null;
};

type GovernanceNoticeRecipient = {
  id: string;
  displayName: string | null;
  roleLabel: string | null;
  readAt: string | null;
  acknowledgedAt: string | null;
  acknowledgeNote?: string | null;
  respondedAt: string | null;
  responseBody: string | null;
};

type GovernanceNotice = {
  id: string;
  title: string;
  status: string;
  priority?: string;
  sentAt: string | null;
  createdAt: string;
  idempotencyKey?: string | null;
  idempotencyScope?: string | null;
  recipients?: GovernanceNoticeRecipient[];
};

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
  events?: GovernanceEvent[];
  notices?: GovernanceNotice[];
};

type CaseListResponse =
  | { ok: true; items: GovernanceCase[]; count: number }
  | { ok: false; error: string };

type CaseWriteResponse =
  | { ok: true; item: GovernanceCase }
  | { ok: false; error: string };

type NoticeSendResponse =
  | {
      ok: true;
      item?: { reused?: boolean };
      reused?: boolean;
      duplicateSafe?: boolean;
    }
  | { ok: false; error: string };

type TimelineEntry = {
  id: string;
  at: string;
  label: string;
  detail: string;
  actor: string | null;
  tone: "default" | "info" | "success" | "warning" | "danger";
};

type ClosureEvidence = {
  hasOfficialNotice: boolean;
  hasAcknowledgement: boolean;
  hasCorrectiveResponse: boolean;
  canResolve: boolean;
  noticeCount: number;
  recipientCount: number;
  acknowledgedRecipients: number;
  respondedRecipients: number;
  latestResponseBy: string | null;
  latestRespondedAt: string | null;
  latestResponseBody: string | null;
  warnings: string[];
};

type Props = {
  isDistrictView: boolean;
  onClose: () => void;
};

type DialogMode = "ESCALATE" | "DIRECTIVE" | "DIRECTIVE_RESPONSE" | null;

const ESCALATION_LOGBOOK_MARKER = "ESCALATION LOGBOOK ENTRY";
const DIRECTOR_DIRECTIVE_MARKER = "DIRECTOR REVIEW DIRECTIVE";
const SISSO_IMPLEMENTATION_RESPONSE_MARKER =
  "SISSO DIRECTIVE IMPLEMENTATION RESPONSE";

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

function eventNote(event?: GovernanceEvent | null) {
  return event?.note?.replace(/^\uFEFF/, "").trimStart() ?? "";
}

function eventHasMarker(
  event: GovernanceEvent | null | undefined,
  marker: string,
) {
  return eventNote(event).includes(marker);
}

function eventTime(event?: GovernanceEvent | null) {
  if (!event?.createdAt) return 0;
  const value = new Date(event.createdAt).getTime();
  return Number.isFinite(value) ? value : 0;
}

function latestEventWithMarker(item: GovernanceCase, marker: string) {
  return [...(item.events ?? [])]
    .filter((event) => eventHasMarker(event, marker))
    .sort((a, b) => eventTime(b) - eventTime(a))[0] ?? null;
}

function latestDirectorDirective(item: GovernanceCase) {
  return latestEventWithMarker(item, DIRECTOR_DIRECTIVE_MARKER);
}

function latestEscalation(item: GovernanceCase) {
  return latestEventWithMarker(item, ESCALATION_LOGBOOK_MARKER);
}

function latestDirectiveResponseAfter(
  item: GovernanceCase,
  directive: GovernanceEvent,
) {
  return [...(item.events ?? [])]
    .filter(
      (event) =>
        eventHasMarker(event, SISSO_IMPLEMENTATION_RESPONSE_MARKER) &&
        eventTime(event) >= eventTime(directive),
    )
    .sort((a, b) => eventTime(b) - eventTime(a))[0] ?? null;
}

function metadataString(event: GovernanceEvent, key: string) {
  const metadata = event.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return "";
  }

  const value = metadata[key];
  return typeof value === "string" ? value : "";
}

function hasReadReceipt(
  item: GovernanceCase,
  receiptKind:
    | "SISSO_ESCALATION_SEEN_BY_DIRECTOR"
    | "DIRECTOR_DIRECTIVE_SEEN_BY_SISSO",
  messageEventId: string,
) {
  return (item.events ?? []).some(
    (event) =>
      metadataString(event, "kind") === "READ_RECEIPT" &&
      metadataString(event, "receiptKind") === receiptKind &&
      metadataString(event, "messageEventId") === messageEventId,
  );
}

function closureEvidenceForCase(item: GovernanceCase): ClosureEvidence {
  const notices = item.notices ?? [];

  const officialNotices = notices.filter((notice) => {
    const scope = String(notice.idempotencyScope ?? "").toLowerCase();
    const key = String(notice.idempotencyKey ?? "").toLowerCase();
    const title = String(notice.title ?? "").toLowerCase();

    return (
      scope.includes("official-intervention") ||
      key.includes("official-intervention") ||
      title.includes("official intervention")
    );
  });

  const evidenceNotices = officialNotices.length ? officialNotices : notices;
  const recipients = evidenceNotices.flatMap((notice) => notice.recipients ?? []);
  const acknowledged = recipients.filter((recipient) => recipient.acknowledgedAt);
  const responded = recipients.filter(
    (recipient) => recipient.respondedAt && recipient.responseBody,
  );

  const latestResponse = [...responded].sort((a, b) => {
    const right = b.respondedAt ? new Date(b.respondedAt).getTime() : 0;
    const left = a.respondedAt ? new Date(a.respondedAt).getTime() : 0;
    return right - left;
  })[0];

  const warnings: string[] = [];

  if (!evidenceNotices.length) {
    warnings.push("No official intervention notice has been sent.");
  }

  if (evidenceNotices.length && !recipients.length) {
    warnings.push("The official notice has no recipient evidence.");
  }

  if (recipients.length && !acknowledged.length) {
    warnings.push("No recipient has acknowledged the official notice.");
  }

  if (!responded.length) {
    warnings.push("No corrective response has been submitted yet.");
  }

  const hasOfficialNotice = evidenceNotices.length > 0;
  const hasCorrectiveResponse = responded.length > 0;

  return {
    hasOfficialNotice,
    hasAcknowledgement: acknowledged.length > 0,
    hasCorrectiveResponse,
    canResolve: hasOfficialNotice && hasCorrectiveResponse,
    noticeCount: evidenceNotices.length,
    recipientCount: recipients.length,
    acknowledgedRecipients: acknowledged.length,
    respondedRecipients: responded.length,
    latestResponseBy:
      latestResponse?.displayName || latestResponse?.roleLabel || null,
    latestRespondedAt: latestResponse?.respondedAt ?? null,
    latestResponseBody: latestResponse?.responseBody ?? null,
    warnings,
  };
}

function buildResolutionNote(item: GovernanceCase) {
  const evidence = closureEvidenceForCase(item);

  return [
    "Case resolved after official notice response evidence.",
    item.tenant?.name ? `School: ${item.tenant.name}.` : "",
    evidence.latestResponseBy
      ? `Respondent: ${evidence.latestResponseBy}.`
      : "",
    evidence.latestRespondedAt
      ? `Responded: ${dateLabel(evidence.latestRespondedAt)}.`
      : "",
    evidence.latestResponseBody
      ? `Corrective response: ${evidence.latestResponseBody.slice(0, 260)}`
      : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function buildEscalationNote(item: GovernanceCase, reason: string) {
  const evidence = closureEvidenceForCase(item);

  return [
    ESCALATION_LOGBOOK_MARKER,
    "",
    "SCHOOL DETAILS",
    item.tenant?.name ? `School: ${item.tenant.name}` : "",
    item.tenant?.schoolCode ? `School code: ${item.tenant.schoolCode}` : "",
    item.zone?.name ? `Circuit: ${item.zone.name}` : "",
    "",
    "CASE EVIDENCE",
    `Case: ${item.title}`,
    `Current status: ${item.status}`,
    `Priority: ${item.priority}`,
    item.riskLevel ? `Risk level: ${item.riskLevel}` : "",
    item.riskScore != null ? `Risk score: ${item.riskScore}` : "",
    item.dueAt ? `Due date: ${dateLabel(item.dueAt)}` : "",
    `Official notice sent: ${evidence.hasOfficialNotice ? "Yes" : "No"}`,
    `Acknowledgements: ${evidence.acknowledgedRecipients}`,
    `Corrective responses: ${evidence.respondedRecipients}`,
    "",
    "ESCALATION REASON",
    `Escalation reason: ${reason.trim()}`,
  ]
    .filter((line) => line !== "")
    .join("\n");
}

function buildDirectorDirectiveNote(item: GovernanceCase, directive: string) {
  const evidence = closureEvidenceForCase(item);

  return [
    DIRECTOR_DIRECTIVE_MARKER,
    "",
    "SCHOOL DETAILS",
    item.tenant?.name ? `School: ${item.tenant.name}` : "",
    item.tenant?.schoolCode ? `School code: ${item.tenant.schoolCode}` : "",
    item.zone?.name ? `Circuit: ${item.zone.name}` : "",
    "",
    "CASE EVIDENCE",
    `Case: ${item.title}`,
    `Current status: ${item.status}`,
    `Priority: ${item.priority}`,
    item.riskLevel ? `Risk level: ${item.riskLevel}` : "",
    item.riskScore != null ? `Risk score: ${item.riskScore}` : "",
    `Official notice sent: ${evidence.hasOfficialNotice ? "Yes" : "No"}`,
    `Acknowledgements: ${evidence.acknowledgedRecipients}`,
    `Corrective responses: ${evidence.respondedRecipients}`,
    "",
    "DIRECTOR INSTRUCTION",
    directive.trim(),
  ]
    .filter((line) => line !== "")
    .join("\n");
}

function buildDirectiveResponseNote(args: {
  item: GovernanceCase;
  directiveEvent: GovernanceEvent;
  response: string;
  evidence: string;
}) {
  const { item, directiveEvent, response, evidence } = args;

  return [
    SISSO_IMPLEMENTATION_RESPONSE_MARKER,
    "",
    "SCHOOL DETAILS",
    item.tenant?.name ? `School: ${item.tenant.name}` : "",
    item.tenant?.schoolCode ? `School code: ${item.tenant.schoolCode}` : "",
    item.zone?.name ? `Circuit: ${item.zone.name}` : "",
    "",
    "DIRECTOR DIRECTIVE",
    `Director directive event: ${directiveEvent.id}`,
    `Directive issued: ${dateLabel(directiveEvent.createdAt)}`,
    "",
    "ACTION TAKEN",
    response.trim(),
    "",
    "EVIDENCE / NEXT ACTION",
    evidence.trim() || "No additional evidence or next action recorded.",
  ]
    .filter((line) => line !== "")
    .join("\n");
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

function EvidenceSummary({ evidence }: { evidence: ClosureEvidence }) {
  return (
    <div
      className={`mt-4 rounded-2xl border p-3 ${
        evidence.canResolve
          ? "border-emerald-300/20 bg-emerald-400/10"
          : "border-amber-300/20 bg-amber-400/10"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-300">
            Closure evidence
          </p>
          <p className="mt-1 text-sm font-semibold text-white">
            {evidence.canResolve
              ? "Ready for evidence-based closure"
              : "More evidence is required"}
          </p>
        </div>
        <span
          className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
            evidence.canResolve
              ? "border-emerald-300/25 bg-emerald-400/10 text-emerald-100"
              : "border-amber-300/25 bg-amber-400/10 text-amber-100"
          }`}
        >
          {evidence.canResolve ? "Complete" : "Incomplete"}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        {[
          ["Notices", evidence.noticeCount],
          ["ACK", evidence.acknowledgedRecipients],
          ["Responses", evidence.respondedRecipients],
        ].map(([label, value]) => (
          <div
            key={String(label)}
            className="rounded-xl border border-white/10 bg-black/20 p-2"
          >
            <p className="text-[9px] uppercase tracking-[0.08em] text-slate-400">
              {label}
            </p>
            <p className="mt-1 text-base font-bold text-white">{value}</p>
          </div>
        ))}
      </div>

      {!evidence.canResolve && evidence.warnings.length ? (
        <p className="mt-3 text-xs leading-5 text-amber-100/85">
          {evidence.warnings.join(" ")}
        </p>
      ) : null}
    </div>
  );
}

export default function GovernanceInterventionLogbookClient({
  isDistrictView,
  onClose,
}: Props) {
  const [cases, setCases] = useState<GovernanceCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [openCaseId, setOpenCaseId] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [dialogCase, setDialogCase] = useState<GovernanceCase | null>(null);
  const [dialogPrimary, setDialogPrimary] = useState("");
  const [dialogEvidence, setDialogEvidence] = useState("");
  const [dialogError, setDialogError] = useState<string | null>(null);
  const receiptKeysRef = useRef<Set<string>>(new Set());

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
      setOpenCaseId((current) =>
        current && rows.some((item) => item.id === current)
          ? current
          : rows[0]?.id ?? null,
      );
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

  useEffect(() => {
    if (!cases.length) return;

    const pending: Array<{
      caseId: string;
      eventId: string;
      receiptKind:
        | "SISSO_ESCALATION_SEEN_BY_DIRECTOR"
        | "DIRECTOR_DIRECTIVE_SEEN_BY_SISSO";
    }> = [];

    for (const item of cases) {
      if (isDistrictView) {
        const event = latestEscalation(item);
        if (
          event &&
          !hasReadReceipt(
            item,
            "SISSO_ESCALATION_SEEN_BY_DIRECTOR",
            event.id,
          )
        ) {
          pending.push({
            caseId: item.id,
            eventId: event.id,
            receiptKind: "SISSO_ESCALATION_SEEN_BY_DIRECTOR",
          });
        }
      } else {
        const event = latestDirectorDirective(item);
        if (
          event &&
          !hasReadReceipt(
            item,
            "DIRECTOR_DIRECTIVE_SEEN_BY_SISSO",
            event.id,
          )
        ) {
          pending.push({
            caseId: item.id,
            eventId: event.id,
            receiptKind: "DIRECTOR_DIRECTIVE_SEEN_BY_SISSO",
          });
        }
      }
    }

    const unsent = pending.filter((item) => {
      const key = `${item.caseId}:${item.eventId}:${item.receiptKind}`;
      if (receiptKeysRef.current.has(key)) return false;
      receiptKeysRef.current.add(key);
      return true;
    });

    if (!unsent.length) return;

    let cancelled = false;

    async function saveReceipts() {
      let saved = false;

      for (const item of unsent) {
        const key = `${item.caseId}:${item.eventId}:${item.receiptKind}`;

        try {
          const response = await fetch(
            "/api/governance/interventions/update",
            {
              method: "POST",
              cache: "no-store",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                caseId: item.caseId,
                action: "RECEIPT",
                receiptKind: item.receiptKind,
                messageEventId: item.eventId,
                metadata: {
                  source: "BBC-governance-logbook-read-receipt",
                },
              }),
            },
          );

          const json = (await response
            .json()
            .catch(() => null)) as CaseWriteResponse | null;

          if (!response.ok || !json?.ok) {
            receiptKeysRef.current.delete(key);
            continue;
          }

          saved = true;
        } catch {
          receiptKeysRef.current.delete(key);
        }
      }

      if (saved && !cancelled) await load();
    }

    void saveReceipts();

    return () => {
      cancelled = true;
    };
  }, [cases, isDistrictView, load]);

  const totals = useMemo(() => {
    return {
      active: cases.filter((item) => !isClosed(item)).length,
      escalated: cases.filter((item) => item.status === "ESCALATED").length,
      overdue: cases.filter(isOverdue).length,
      resolved: cases.filter((item) => item.status === "RESOLVED").length,
    };
  }, [cases]);

  function clearMessages() {
    setError(null);
    setSuccess(null);
  }

  function openDialog(mode: Exclude<DialogMode, null>, item: GovernanceCase) {
    clearMessages();
    setDialogMode(mode);
    setDialogCase(item);
    setDialogPrimary("");
    setDialogEvidence("");
    setDialogError(null);
  }

  function closeDialog() {
    if (busyKey?.startsWith("dialog:")) return;
    setDialogMode(null);
    setDialogCase(null);
    setDialogPrimary("");
    setDialogEvidence("");
    setDialogError(null);
  }

  async function postCaseUpdate(args: {
    busy: string;
    body: Record<string, unknown>;
    successMessage: string;
  }) {
    setBusyKey(args.busy);
    clearMessages();

    try {
      const response = await fetch("/api/governance/interventions/update", {
        method: "POST",
        cache: "no-store",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args.body),
      });

      const json = (await response
        .json()
        .catch(() => null)) as CaseWriteResponse | null;

      if (!response.ok || !json?.ok) {
        setError(
          json && !json.ok
            ? json.error
            : `Governance action failed (${response.status})`,
        );
        return false;
      }

      setSuccess(args.successMessage);
      await load();
      return true;
    } catch {
      setError("Network/server error while saving the governance action.");
      return false;
    } finally {
      setBusyKey(null);
    }
  }

  async function markInProgress(item: GovernanceCase) {
    await postCaseUpdate({
      busy: `status:${item.id}:IN_PROGRESS`,
      body: {
        caseId: item.id,
        action: "STATUS",
        status: "IN_PROGRESS",
        note: "SISSO has started follow-up from the simplified governance logbook.",
        metadata: {
          source: "BBC-governance-logbook-follow-up",
        },
      },
      successMessage: "Case marked as in progress.",
    });
  }

  async function resolveCase(item: GovernanceCase) {
    const evidence = closureEvidenceForCase(item);

    if (!evidence.canResolve) {
      setError(`Cannot resolve yet: ${evidence.warnings.join(" ")}`);
      return;
    }

    await postCaseUpdate({
      busy: `status:${item.id}:RESOLVED`,
      body: {
        caseId: item.id,
        action: "STATUS",
        status: "RESOLVED",
        note: buildResolutionNote(item),
        metadata: {
          source: "BBC-governance-logbook-evidence-closure",
          closureEvidence: evidence,
        },
      },
      successMessage: "Case resolved with response evidence.",
    });
  }

  async function sendHeadteacherNotice(item: GovernanceCase) {
    setBusyKey(`notice:${item.id}`);
    clearMessages();

    try {
      const schoolLabel = item.tenant?.name ?? item.title;
      const idempotencyKey =
        `governance-notice:case:${item.id}:official-intervention:HEADTEACHER:v1`;

      const response = await fetch("/api/governance/notices/send", {
        method: "POST",
        cache: "no-store",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseId: item.id,
          idempotencyKey,
          title: `Official intervention notice: ${schoolLabel}`,
          body:
            "EduLife OS has flagged this school for immediate supervision follow-up. Kindly review attendance capture, lesson delivery evidence, and assessment scoring evidence, then respond to the SISSO with corrective action taken.",
          priority: item.priority,
          channels: ["IN_APP", "SMS", "EMAIL"],
          targetRoles: ["HEADTEACHER"],
          metadata: {
            source: "BBC-governance-logbook",
            caseId: item.id,
            noticeIntent: "official-intervention",
            targetAudience: "HEADTEACHER",
            idempotencyKey,
          },
        }),
      });

      const json = (await response
        .json()
        .catch(() => null)) as NoticeSendResponse | null;

      if (!response.ok || !json?.ok) {
        setError(
          json && !json.ok
            ? json.error
            : `Failed to send notice (${response.status})`,
        );
        return;
      }

      const reused = Boolean(json.reused || json.item?.reused);
      setSuccess(
        reused
          ? "The official notice already exists; no duplicate delivery was sent."
          : "Official notice sent to the headteacher.",
      );
      await load();
    } catch {
      setError("Network/server error while sending the official notice.");
    } finally {
      setBusyKey(null);
    }
  }

  async function submitDialog() {
    const item = dialogCase;
    const primary = dialogPrimary.trim();
    const evidenceText = dialogEvidence.trim();

    if (!item || !dialogMode) return;

    if (primary.length < 40) {
      setDialogError("Write at least 40 characters so the action is clear and auditable.");
      return;
    }

    setDialogError(null);
    setBusyKey(`dialog:${dialogMode}:${item.id}`);
    clearMessages();

    try {
      let body: Record<string, unknown>;
      let successMessage: string;

      if (dialogMode === "ESCALATE") {
        body = {
          caseId: item.id,
          action: "STATUS",
          status: "ESCALATED",
          note: buildEscalationNote(item, primary),
          metadata: {
            source: "BBC-governance-logbook-escalation",
            escalationReason: primary,
            closureEvidence: closureEvidenceForCase(item),
          },
        };
        successMessage = "Case escalated with a detailed reason.";
      } else if (dialogMode === "DIRECTIVE") {
        body = {
          caseId: item.id,
          action: "STATUS",
          status: "IN_PROGRESS",
          note: buildDirectorDirectiveNote(item, primary),
          metadata: {
            source: "BBC-governance-logbook-director-directive",
            directorDirective: primary,
            closureEvidence: closureEvidenceForCase(item),
          },
        };
        successMessage = "Director directive saved and returned for follow-up.";
      } else {
        const directive = latestDirectorDirective(item);

        if (!directive) {
          setDialogError("No Director directive is available for this case.");
          return;
        }

        body = {
          caseId: item.id,
          action: "COMMENT",
          note: buildDirectiveResponseNote({
            item,
            directiveEvent: directive,
            response: primary,
            evidence: evidenceText,
          }),
          metadata: {
            source: "BBC-governance-logbook-directive-response",
            directiveEventId: directive.id,
            response: primary,
            evidence: evidenceText,
            closureEvidence: closureEvidenceForCase(item),
          },
        };
        successMessage = "SISSO implementation response saved.";
      }

      const response = await fetch("/api/governance/interventions/update", {
        method: "POST",
        cache: "no-store",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const json = (await response
        .json()
        .catch(() => null)) as CaseWriteResponse | null;

      if (!response.ok || !json?.ok) {
        setDialogError(
          json && !json.ok
            ? json.error
            : `Governance action failed (${response.status})`,
        );
        return;
      }

      setSuccess(successMessage);
      setDialogMode(null);
      setDialogCase(null);
      setDialogPrimary("");
      setDialogEvidence("");
      setDialogError(null);
      await load();
    } catch {
      setDialogError("Network/server error while saving this governance action.");
    } finally {
      setBusyKey(null);
    }
  }

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
                ? "District intervention command log"
                : "Circuit intervention action log"}
            </h2>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-sky-100/80">
              {isDistrictView
                ? "Review authorized intervention evidence and issue a Director directive on escalated cases."
                : "Review evidence, notify the headteacher, record follow-up, escalate when necessary, and close only after corrective response evidence."}
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

        {success ? (
          <div className="mt-4 rounded-2xl border border-emerald-300/20 bg-emerald-400/10 p-4 text-sm text-emerald-100">
            {success}
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
            const evidence = closureEvidenceForCase(item);
            const directive = latestDirectorDirective(item);
            const directiveResponse = directive
              ? latestDirectiveResponseAfter(item, directive)
              : null;

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

                    <EvidenceSummary evidence={evidence} />

                    {!isClosed(item) ? (
                      <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-300">
                          Available action
                        </p>

                        {isDistrictView ? (
                          <div className="mt-3">
                            {item.status === "ESCALATED" ? (
                              <button
                                type="button"
                                onClick={() => openDialog("DIRECTIVE", item)}
                                disabled={busyKey !== null}
                                className="min-h-11 rounded-2xl border border-sky-300/25 bg-sky-500/15 px-4 py-2 text-sm font-semibold text-sky-100 disabled:opacity-50"
                              >
                                Issue Director directive
                              </button>
                            ) : (
                              <p className="text-sm leading-6 text-slate-400">
                                No Director action is required until the SISSO escalates this case.
                              </p>
                            )}
                          </div>
                        ) : (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {item.scopeType === "SCHOOL" ? (
                              <button
                                type="button"
                                onClick={() => void sendHeadteacherNotice(item)}
                                disabled={busyKey !== null}
                                className="min-h-11 rounded-2xl border border-amber-300/25 bg-amber-400/10 px-4 py-2 text-sm font-semibold text-amber-100 disabled:opacity-50"
                              >
                                {busyKey === `notice:${item.id}`
                                  ? "Sending..."
                                  : evidence.hasOfficialNotice
                                    ? "Resend safely"
                                    : "Send official notice"}
                              </button>
                            ) : null}

                            <button
                              type="button"
                              onClick={() => void markInProgress(item)}
                              disabled={
                                busyKey !== null || item.status === "IN_PROGRESS"
                              }
                              className="min-h-11 rounded-2xl border border-sky-300/20 bg-sky-500/10 px-4 py-2 text-sm font-semibold text-sky-100 disabled:opacity-50"
                            >
                              {item.status === "IN_PROGRESS"
                                ? "Follow-up started"
                                : "Mark in progress"}
                            </button>

                            <button
                              type="button"
                              onClick={() => openDialog("ESCALATE", item)}
                              disabled={busyKey !== null}
                              className="min-h-11 rounded-2xl border border-red-300/25 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-100 disabled:opacity-50"
                            >
                              Escalate with reason
                            </button>

                            {directive && !directiveResponse ? (
                              <button
                                type="button"
                                onClick={() =>
                                  openDialog("DIRECTIVE_RESPONSE", item)
                                }
                                disabled={busyKey !== null}
                                className="min-h-11 rounded-2xl border border-emerald-300/25 bg-emerald-400/10 px-4 py-2 text-sm font-semibold text-emerald-100 disabled:opacity-50"
                              >
                                Respond to Director
                              </button>
                            ) : null}

                            <button
                              type="button"
                              onClick={() => void resolveCase(item)}
                              disabled={busyKey !== null || !evidence.canResolve}
                              className="min-h-11 rounded-2xl border border-emerald-300/25 bg-emerald-400/10 px-4 py-2 text-sm font-semibold text-emerald-100 disabled:opacity-50"
                            >
                              {evidence.canResolve
                                ? "Resolve with evidence"
                                : "Awaiting response"}
                            </button>
                          </div>
                        )}
                      </div>
                    ) : null}

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

      {dialogMode && dialogCase ? (
        <div className="fixed inset-0 z-[60] overflow-y-auto bg-black/85 p-4">
          <div className="mx-auto mt-8 w-full max-w-2xl rounded-[28px] border border-white/15 bg-slate-950 p-5 shadow-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-200">
              {dialogMode === "ESCALATE"
                ? "Escalation reason"
                : dialogMode === "DIRECTIVE"
                  ? "Director directive"
                  : "SISSO implementation response"}
            </p>
            <h3 className="mt-2 text-lg font-bold text-white">
              {dialogCase.tenant?.name ?? dialogCase.title}
            </h3>
            <p className="mt-1 text-xs text-slate-400">
              {scopeLabel(dialogCase)}
            </p>

            <label className="mt-4 block">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-300">
                {dialogMode === "ESCALATE"
                  ? "Why must the Director intervene?"
                  : dialogMode === "DIRECTIVE"
                    ? "What must the SISSO do next?"
                    : "What action did you take?"}
              </span>
              <textarea
                value={dialogPrimary}
                onChange={(event) => {
                  setDialogPrimary(event.target.value);
                  setDialogError(null);
                }}
                rows={6}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm leading-6 text-white outline-none focus:border-sky-300/50"
              />
              <p className="mt-1 text-right text-[11px] text-slate-400">
                {dialogPrimary.trim().length}/40 minimum
              </p>
            </label>

            {dialogMode === "DIRECTIVE_RESPONSE" ? (
              <label className="mt-4 block">
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-300">
                  Evidence or next action
                </span>
                <textarea
                  value={dialogEvidence}
                  onChange={(event) => setDialogEvidence(event.target.value)}
                  rows={4}
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm leading-6 text-white outline-none focus:border-sky-300/50"
                />
              </label>
            ) : null}

            {dialogError ? (
              <div className="mt-4 rounded-2xl border border-red-300/20 bg-red-500/10 p-3 text-sm text-red-100">
                {dialogError}
              </div>
            ) : null}

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeDialog}
                disabled={busyKey?.startsWith("dialog:")}
                className="min-h-11 rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submitDialog()}
                disabled={busyKey?.startsWith("dialog:")}
                className="min-h-11 rounded-2xl border border-sky-300/25 bg-sky-500/20 px-5 py-2 text-sm font-semibold text-sky-100 disabled:opacity-50"
              >
                {busyKey?.startsWith("dialog:") ? "Saving..." : "Save action"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
