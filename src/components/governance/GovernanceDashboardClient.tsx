// src/components/governance/GovernanceDashboardClient.tsx
"use client";

import { signOut } from "next-auth/react";
import { useEffect, useMemo, useRef, useState } from "react";

type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

type SchoolMetrics = {
  learners?: number;
  teachers?: number;
  classrooms?: number;

  attendanceSessionsToday?: number;
  attendanceMarksToday?: number;
  presentMarksToday?: number;
  absentMarksToday?: number;
  lateMarksToday?: number;
  excusedMarksToday?: number;
  attendanceRateToday?: number;
  attendanceCompletionRateToday?: number;
  missingAttendanceMarksToday?: number;

  healthAlertsToday?: number;
  highTemperatureToday?: number;
  symptomReportsToday?: number;

  publishedOrLockedAssessments?: number;
  assessmentScoresLast14Days?: number;
  assessmentItemsTotal?: number;
  assessmentItemsDraft?: number;
  assessmentItemsWithScores?: number;
  assessmentItemsWithoutScores?: number;
  assessmentItemsWithoutLessonDelivery?: number;
  assessmentItemsWithoutCurriculumUnit?: number;
  assessmentCompletionRate?: number;
  assessmentLinkCoverageRate?: number;

  lessonDeliveriesLast14Days?: number;
  lessonNotesSubmittedLast14Days?: number;
  lessonNotesApprovedLast14Days?: number;
  lessonNotesReturnedLast14Days?: number;
  lessonNotesPendingReview?: number;

  approvedLessonNotesLast14Days?: number;
  deliveredApprovedLessonNotesLast14Days?: number;
  orphanedLessonNotesLast14Days?: number;
  lessonDeliveriesLinkedToApprovedNotesLast14Days?: number;
  orphanedDeliveriesLast14Days?: number;
  lessonDeliveryComplianceRate?: number;

  riskScore?: number;
  riskLevel?: RiskLevel | string;
  riskReasons?: string[];
  recommendedActions?: string[];
};

type SchoolRow = {
  id: string;
  name: string;
  schoolCode: string | null;
  status: string;
  schoolSector?: "PUBLIC" | "PRIVATE" | string;
  circuit?: {
    id: string;
    name: string;
    type?: string;
    level?: number;
  } | null;
  district?: {
    id: string;
    name: string;
  } | null;
  metrics?: SchoolMetrics;
};

type SchoolDrivingRisk = {
  schoolId: string;
  schoolName: string;
  schoolCode: string | null;
  schoolSector?: "PUBLIC" | "PRIVATE" | string;
  riskScore: number;
  riskLevel: RiskLevel | string;
  reasons: string[];
  recommendedActions: string[];
};

type CircuitBreakdownRow = {
  circuitId: string;
  circuitName: string;
  districtId: string | null;
  districtName: string | null;
  schools: number;
  publicSchools?: number;
  privateSchools?: number;
  learners: number;
  teachers: number;
  classrooms?: number;

  attendanceMarksToday: number;
  presentMarksToday: number;
  absentMarksToday?: number;
  lateMarksToday?: number;
  missingAttendanceMarksToday?: number;
  attendanceRateToday?: number;
  attendanceCompletionRateToday?: number;

  healthAlertsToday: number;

  publishedOrLockedAssessments: number;
  assessmentScoresLast14Days?: number;
  assessmentItemsTotal?: number;
  assessmentItemsDraft?: number;
  assessmentItemsWithScores?: number;
  assessmentItemsWithoutScores?: number;
  assessmentItemsWithoutLessonDelivery?: number;
  assessmentItemsWithoutCurriculumUnit?: number;
  assessmentCompletionRate?: number;
  assessmentLinkCoverageRate?: number;

  lessonDeliveriesLast14Days: number;
  lessonNotesPendingReview?: number;
  approvedLessonNotesLast14Days?: number;
  deliveredApprovedLessonNotesLast14Days?: number;
  orphanedLessonNotesLast14Days?: number;
  lessonDeliveriesLinkedToApprovedNotesLast14Days?: number;
  orphanedDeliveriesLast14Days?: number;
  lessonDeliveryComplianceRate?: number;

  highRiskSchools?: number;
  criticalRiskSchools?: number;
  highestRiskScore?: number;
  schoolsDrivingRisk?: SchoolDrivingRisk[];
  directorRecommendedActions?: string[];
};

type InterventionQueueItem = {
  schoolId: string;
  schoolName: string;
  schoolCode: string | null;
  schoolSector?: "PUBLIC" | "PRIVATE" | string;
  circuitName: string;
  districtName: string | null;
  riskScore: number;
  riskLevel: RiskLevel | string;
  reasons: string[];
  recommendedActions: string[];
  metrics?: {
    attendanceRateToday?: number;
    attendanceCompletionRateToday?: number;
    healthAlertsToday?: number;
    lessonDeliveriesLast14Days?: number;
    lessonNotesPendingReview?: number;
    publishedOrLockedAssessments?: number;

    assessmentItemsTotal?: number;
    assessmentItemsDraft?: number;
    assessmentItemsWithoutScores?: number;
    assessmentItemsWithoutLessonDelivery?: number;
    assessmentItemsWithoutCurriculumUnit?: number;
    assessmentCompletionRate?: number;
    assessmentLinkCoverageRate?: number;

    orphanedLessonNotesLast14Days?: number;
    orphanedDeliveriesLast14Days?: number;
    lessonDeliveryComplianceRate?: number;
  };
};

type GovernanceCaseStatus =
  | "OPEN"
  | "IN_PROGRESS"
  | "RESOLVED"
  | "ESCALATED"
  | "CANCELLED";

type GovernanceCasePriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

type GovernanceCase = {
  id: string;
  tenantId: string | null;
  zoneId: string | null;
  scopeType: "SCHOOL" | "CIRCUIT" | "DISTRICT";
  title: string;
  summary: string;
  priority: GovernanceCasePriority;
  status: GovernanceCaseStatus;
  riskScore: number | null;
  riskLevel: string | null;
  createdAt: string;
  updatedAt: string;
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
    metadata?: Record<string, unknown> | null;
    createdAt: string;
    actor?: {
      id: string;
      name: string | null;
      email: string;
    } | null;
  }>;
  resolutionNote?: string | null;
  dueAt?: string | null;
  notices?: Array<{
    id: string;
    title: string;
    status: string;
    priority?: string;
    sentAt: string | null;
    createdAt: string;
    idempotencyKey?: string | null;
    idempotencyScope?: string | null;
    recipients?: Array<{
      id: string;
      recipientType: string;
      displayName: string | null;
      roleLabel: string | null;
      readAt: string | null;
      acknowledgedAt: string | null;
      acknowledgeNote?: string | null;
      respondedAt: string | null;
      responseBody: string | null;
      createdAt: string;
      deliveries?: Array<{
        id: string;
        channel: string;
        status: string;
        sentAt: string | null;
        deliveredAt: string | null;
        lastError: string | null;
        createdAt: string;
      }>;
    }>;
    deliveries?: Array<{
      id: string;
      channel: string;
      status: string;
      sentAt: string | null;
      deliveredAt: string | null;
      lastError: string | null;
      createdAt: string;
    }>;
  }>;
};

type CaseListResponse =
  | { ok: true; items: GovernanceCase[]; count: number }
  | { ok: false; error: string };

type CaseWriteResponse =
  | { ok: true; item: GovernanceCase }
  | { ok: false; error: string };

type NoticeSendResponse =
  | { ok: true; item: any; reused?: boolean; duplicateSafe?: boolean }
  | { ok: false; error: string };

type SectorSummary = {
  public?: {
    schools: number;
    highRiskSchools: number;
    criticalRiskSchools: number;
    highestRiskScore: number;
  };
  private?: {
    schools: number;
    highRiskSchools: number;
    criticalRiskSchools: number;
    highestRiskScore: number;
  };
  governanceRule?: string;
};

type RiskSummary = {
  low?: number;
  medium?: number;
  high?: number;
  critical?: number;
  highestRiskScore?: number;
  highestRiskSchool?: {
    id: string;
    name: string;
    riskScore: number;
    riskLevel: RiskLevel | string;
  } | null;
};

type OverviewResponse = {
  ok: true;
  scope?: {
    isSuperAdmin?: boolean;
    zoneCount?: number;
    tenantCount?: number;
    assignments?: Array<{
      id: string;
      role: string;
      zoneId: string;
      zoneName: string;
      zoneLevel: number;
      zoneTypeName: string;
      parentZoneName?: string | null;
    }>;
  };
  overview?: {
    schools?: SchoolRow[];
    circuitBreakdown?: CircuitBreakdownRow[];
    interventionQueue?: InterventionQueueItem[];
    riskSummary?: RiskSummary;
    sectorSummary?: SectorSummary;
    totals?: Record<string, number>;
    signals?: Record<string, number>;
    emptyStates?: string[];
    generatedAt?: string;
  };
};

type ErrorResponse = {
  ok: false;
  error: string;
  role?: string;
  path?: string;
};

type Props = {
  endpoint: string;
  title: string;
  eyebrow: string;
  description: string;
  loginMode?: "governance" | "school";
};

function formatLabel(v: string) {
  return v
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}

function numberValue(v: unknown) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function percentValue(v: unknown) {
  return `${Math.round(numberValue(v))}%`;
}

function pct(numerator: number, denominator: number) {
  if (!denominator) return "0%";
  return `${Math.round((numerator / denominator) * 100)}%`;
}

function isPercentKey(key: string) {
  return (
    key === "attendanceRateToday" ||
    key === "attendanceCompletionRateToday" ||
    key === "assessmentCompletionRate" ||
    key === "assessmentLinkCoverageRate" ||
    key === "lessonDeliveryComplianceRate"
  );
}

function formatSignalValue(key: string, value: unknown) {
  if (isPercentKey(key)) return percentValue(value);
  return numberValue(value).toLocaleString();
}

function schoolSectorLabel(value?: string | null) {
  if (value === "PRIVATE") return "Private";
  if (value === "PUBLIC") return "Public";
  return "Unspecified sector";
}

function schoolSectorBadgeClass(value?: string | null) {
  if (value === "PRIVATE") {
    return "border-purple-300/25 bg-purple-400/10 text-purple-100";
  }

  if (value === "PUBLIC") {
    return "border-emerald-300/25 bg-emerald-400/10 text-emerald-100";
  }

  return "border-white/10 bg-white/5 text-slate-200";
}

function roleLabel(role: string) {
  if (role === "SISSO") return "SISSO";
  if (role === "CIRCUIT_SUPERVISOR") return "Circuit Supervisor";
  if (role === "DISTRICT_DIRECTOR") return "District Director";
  if (role === "DISTRICT_MIS_OFFICER") return "District MIS/Data Officer";
  if (role === "DISTRICT_SHEP_OFFICER") return "District SHEP/Health Officer";
  if (role === "DISTRICT_ASSESSMENT_OFFICER")
    return "District Assessment Officer";
  return role.replaceAll("_", " ");
}

function riskBadgeClass(level?: string) {
  if (level === "CRITICAL")
    return "border-red-300/30 bg-red-500/15 text-red-100";
  if (level === "HIGH")
    return "border-orange-300/30 bg-orange-500/15 text-orange-100";
  if (level === "MEDIUM")
    return "border-amber-300/30 bg-amber-400/15 text-amber-100";
  return "border-emerald-300/30 bg-emerald-400/15 text-emerald-100";
}

function riskDotClass(level?: string) {
  if (level === "CRITICAL") return "bg-red-300";
  if (level === "HIGH") return "bg-orange-300";
  if (level === "MEDIUM") return "bg-amber-300";
  return "bg-emerald-300";
}

function compactDateTime(value?: string) {
  if (!value) return null;

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;

  return d.toLocaleString(undefined, {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "short",
  });
}

function closureEvidenceForCase(item: GovernanceCase) {
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

  const recipients = evidenceNotices.flatMap((notice) =>
    (notice.recipients ?? []).map((recipient) => ({
      notice,
      recipient,
    })),
  );

  const acknowledgedRecipients = recipients.filter(({ recipient }) =>
    Boolean(recipient.acknowledgedAt),
  );

  const respondedRecipients = recipients.filter(
    ({ recipient }) =>
      Boolean(recipient.respondedAt) && Boolean(recipient.responseBody),
  );

  const latestResponse = [...respondedRecipients].sort((a, b) => {
    const bd = b.recipient.respondedAt
      ? new Date(b.recipient.respondedAt).getTime()
      : 0;
    const ad = a.recipient.respondedAt
      ? new Date(a.recipient.respondedAt).getTime()
      : 0;

    return bd - ad;
  })[0];

  const warnings: string[] = [];

  if (!evidenceNotices.length) {
    warnings.push("No official intervention notice has been sent.");
  }

  if (evidenceNotices.length && !recipients.length) {
    warnings.push("The official notice has no recipient evidence.");
  }

  if (recipients.length && !acknowledgedRecipients.length) {
    warnings.push("No recipient has acknowledged the official notice.");
  }

  if (!respondedRecipients.length) {
    warnings.push("No corrective response has been submitted yet.");
  }

  const hasOfficialNotice = evidenceNotices.length > 0;
  const hasCorrectiveResponse = respondedRecipients.length > 0;

  return {
    hasOfficialNotice,
    hasAcknowledgement: acknowledgedRecipients.length > 0,
    hasCorrectiveResponse,
    canResolve: hasOfficialNotice && hasCorrectiveResponse,
    noticeCount: evidenceNotices.length,
    recipientCount: recipients.length,
    acknowledgedRecipients: acknowledgedRecipients.length,
    respondedRecipients: respondedRecipients.length,
    latestResponseBy:
      latestResponse?.recipient.displayName ||
      latestResponse?.recipient.roleLabel ||
      null,
    latestRespondedAt: latestResponse?.recipient.respondedAt ?? null,
    latestResponseBody: latestResponse?.recipient.responseBody ?? null,
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
      ? `Responded: ${
          compactDateTime(evidence.latestRespondedAt) ??
          evidence.latestRespondedAt
        }.`
      : "",
    evidence.latestResponseBody
      ? `Corrective response: ${evidence.latestResponseBody.slice(0, 260)}`
      : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function CaseClosureEvidencePanel({ item }: { item: GovernanceCase }) {
  const evidence = closureEvidenceForCase(item);

  return (
    <div
      className={`rounded-2xl border p-3 ${
        evidence.canResolve
          ? "border-emerald-300/20 bg-emerald-400/10"
          : "border-amber-300/20 bg-amber-400/10"
      }`}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">
            Closure evidence
          </p>
          <p className="mt-1 text-sm font-semibold text-white">
            {evidence.canResolve
              ? "Ready for evidence-based closure"
              : "Not ready for closure"}
          </p>
        </div>

        <span
          className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${
            evidence.canResolve
              ? "border-emerald-300/30 bg-emerald-400/10 text-emerald-100"
              : "border-amber-300/30 bg-amber-400/10 text-amber-100"
          }`}
        >
          {evidence.canResolve ? "Evidence complete" : "Evidence missing"}
        </span>
      </div>

      <div className="mt-3 grid gap-2 text-xs sm:grid-cols-4">
        <MetricPill
          label="Notices"
          value={evidence.noticeCount}
          tone={evidence.hasOfficialNotice ? "success" : "warning"}
        />
        <MetricPill
          label="Recipients"
          value={evidence.recipientCount}
          tone={evidence.recipientCount ? "success" : "warning"}
        />
        <MetricPill
          label="Acknowledged"
          value={evidence.acknowledgedRecipients}
          tone={evidence.hasAcknowledgement ? "success" : "warning"}
        />
        <MetricPill
          label="Responses"
          value={evidence.respondedRecipients}
          tone={evidence.hasCorrectiveResponse ? "success" : "danger"}
        />
      </div>

      {evidence.latestResponseBody ? (
        <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-200">
            Latest corrective response
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {evidence.latestResponseBy || "Recipient"} ·{" "}
            {compactDateTime(evidence.latestRespondedAt ?? undefined) ??
              "Time not available"}
          </p>
          <p className="mt-2 line-clamp-4 text-sm leading-6 text-slate-100">
            {evidence.latestResponseBody}
          </p>
        </div>
      ) : null}

      {evidence.warnings.length ? (
        <ul className="mt-3 space-y-1 text-xs text-amber-100">
          {evidence.warnings.map((warning) => (
            <li key={warning}>• {warning}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function isClosedCase(item: GovernanceCase) {
  return item.status === "RESOLVED" || item.status === "CANCELLED";
}

function isOverdueIntervention(item: GovernanceCase) {
  if (!item.dueAt || isClosedCase(item)) return false;

  const due = new Date(item.dueAt);
  if (Number.isNaN(due.getTime())) return false;

  return due.getTime() < Date.now();
}

function districtCaseCommandSummary(cases: GovernanceCase[]) {
  const activeCases = cases.filter((item) => !isClosedCase(item));
  const resolvedCases = cases.filter((item) => item.status === "RESOLVED");

  const noNoticeCases = activeCases.filter(
    (item) => !closureEvidenceForCase(item).hasOfficialNotice,
  );

  const awaitingAckCases = activeCases.filter((item) => {
    const evidence = closureEvidenceForCase(item);
    return evidence.hasOfficialNotice && !evidence.hasAcknowledgement;
  });

  const awaitingResponseCases = activeCases.filter((item) => {
    const evidence = closureEvidenceForCase(item);
    return evidence.hasOfficialNotice && !evidence.hasCorrectiveResponse;
  });

  const resolvedWithEvidenceCases = resolvedCases.filter(
    (item) => closureEvidenceForCase(item).hasCorrectiveResponse,
  );

  const overdueCases = activeCases.filter(isOverdueIntervention);
  const escalatedCases = cases.filter((item) => item.status === "ESCALATED");

  const criticalCases = activeCases.filter(
    (item) => item.priority === "CRITICAL" || item.riskLevel === "CRITICAL",
  );

  const highCases = activeCases.filter(
    (item) => item.priority === "HIGH" || item.riskLevel === "HIGH",
  );

  const circuitMap = new Map<
    string,
    {
      id: string;
      name: string;
      total: number;
      active: number;
      overdue: number;
      escalated: number;
      awaitingResponse: number;
      resolvedWithEvidence: number;
      highestRiskScore: number;
      latestCaseAt: string | null;
    }
  >();

  for (const item of cases) {
    const key = item.zone?.id ?? item.tenantId ?? "unknown";
    const name =
      item.zone?.name ?? item.tenant?.name ?? "Unassigned circuit / school";

    const existing = circuitMap.get(key) ?? {
      id: key,
      name,
      total: 0,
      active: 0,
      overdue: 0,
      escalated: 0,
      awaitingResponse: 0,
      resolvedWithEvidence: 0,
      highestRiskScore: 0,
      latestCaseAt: null,
    };

    const evidence = closureEvidenceForCase(item);

    existing.total += 1;

    if (!isClosedCase(item)) existing.active += 1;
    if (isOverdueIntervention(item)) existing.overdue += 1;
    if (item.status === "ESCALATED") existing.escalated += 1;
    if (
      !isClosedCase(item) &&
      evidence.hasOfficialNotice &&
      !evidence.hasCorrectiveResponse
    ) {
      existing.awaitingResponse += 1;
    }
    if (item.status === "RESOLVED" && evidence.hasCorrectiveResponse) {
      existing.resolvedWithEvidence += 1;
    }

    existing.highestRiskScore = Math.max(
      existing.highestRiskScore,
      numberValue(item.riskScore),
    );

    if (
      !existing.latestCaseAt ||
      new Date(item.createdAt).getTime() >
        new Date(existing.latestCaseAt).getTime()
    ) {
      existing.latestCaseAt = item.createdAt;
    }

    circuitMap.set(key, existing);
  }

  const circuitRows = [...circuitMap.values()].sort((a, b) => {
    const activeDiff = b.active - a.active;
    if (activeDiff !== 0) return activeDiff;

    const overdueDiff = b.overdue - a.overdue;
    if (overdueDiff !== 0) return overdueDiff;

    return b.highestRiskScore - a.highestRiskScore;
  });

  return {
    totalCases: cases.length,
    activeCases,
    resolvedCases,
    noNoticeCases,
    awaitingAckCases,
    awaitingResponseCases,
    resolvedWithEvidenceCases,
    overdueCases,
    escalatedCases,
    criticalCases,
    highCases,
    circuitRows,
  };
}

function DistrictCaseCommandPanel({ cases }: { cases: GovernanceCase[] }) {
  const summary = districtCaseCommandSummary(cases);

  const closureRate = summary.resolvedCases.length
    ? Math.round(
        (summary.resolvedWithEvidenceCases.length /
          summary.resolvedCases.length) *
          100,
      )
    : 0;

  const topCircuit = summary.circuitRows[0] ?? null;

  return (
    <section className="rounded-3xl border border-amber-300/20 bg-amber-400/10 p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-200">
            District Case Command
          </p>
          <h2 className="mt-2 text-xl font-bold text-white">
            Intervention accountability across circuits
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-amber-100/80">
            This tells the Director whether supervision cases are only being
            opened, or whether officers are driving them to acknowledged,
            responded, evidence-based closure.
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-slate-200">
          Evidence closure rate:{" "}
          <span className="font-bold text-white">{closureRate}%</span>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricPill
          label="Total cases"
          value={summary.totalCases}
          tone={summary.totalCases ? "default" : "success"}
        />
        <MetricPill
          label="Active"
          value={summary.activeCases.length}
          tone={summary.activeCases.length ? "warning" : "success"}
        />
        <MetricPill
          label="Overdue"
          value={summary.overdueCases.length}
          tone={summary.overdueCases.length ? "danger" : "success"}
        />
        <MetricPill
          label="Escalated"
          value={summary.escalatedCases.length}
          tone={summary.escalatedCases.length ? "danger" : "success"}
        />
        <MetricPill
          label="No official notice"
          value={summary.noNoticeCases.length}
          tone={summary.noNoticeCases.length ? "danger" : "success"}
        />
        <MetricPill
          label="Awaiting ACK"
          value={summary.awaitingAckCases.length}
          tone={summary.awaitingAckCases.length ? "warning" : "success"}
        />
        <MetricPill
          label="Awaiting response"
          value={summary.awaitingResponseCases.length}
          tone={summary.awaitingResponseCases.length ? "danger" : "success"}
        />
        <MetricPill
          label="Closed with evidence"
          value={summary.resolvedWithEvidenceCases.length}
          tone={
            summary.resolvedWithEvidenceCases.length ? "success" : "default"
          }
        />
      </div>

      {topCircuit ? (
        <div className="mt-5 rounded-2xl border border-red-300/20 bg-red-500/10 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-200">
            Director’s first follow-up
          </p>
          <p className="mt-2 text-base font-bold text-white">
            {topCircuit.name}
          </p>
          <p className="mt-1 text-sm leading-6 text-red-100/80">
            {topCircuit.active} active case(s), {topCircuit.overdue} overdue,
            {topCircuit.awaitingResponse} awaiting corrective response.
          </p>
        </div>
      ) : null}

      <div className="mt-5 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">
          Circuits ranked by unresolved intervention burden
        </p>

        {summary.circuitRows.length ? (
          summary.circuitRows.slice(0, 6).map((row, idx) => (
            <div
              key={row.id}
              className="rounded-2xl border border-white/10 bg-slate-950/50 p-4"
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-200">
                      #{idx + 1}
                    </span>
                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                        row.active
                          ? "border-red-300/30 bg-red-500/10 text-red-100"
                          : "border-emerald-300/30 bg-emerald-400/10 text-emerald-100"
                      }`}
                    >
                      {row.active ? "Needs follow-up" : "Clear"}
                    </span>
                  </div>

                  <p className="mt-3 font-bold text-white">{row.name}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    Latest case:{" "}
                    {compactDateTime(row.latestCaseAt ?? undefined) ?? "—"}
                  </p>
                </div>

                <div className="grid gap-2 text-xs sm:grid-cols-3 lg:min-w-[520px]">
                  <MetricPill
                    label="Active"
                    value={row.active}
                    tone={row.active ? "warning" : "success"}
                  />
                  <MetricPill
                    label="Overdue"
                    value={row.overdue}
                    tone={row.overdue ? "danger" : "success"}
                  />
                  <MetricPill
                    label="Escalated"
                    value={row.escalated}
                    tone={row.escalated ? "danger" : "success"}
                  />
                  <MetricPill
                    label="Awaiting response"
                    value={row.awaitingResponse}
                    tone={row.awaitingResponse ? "danger" : "success"}
                  />
                  <MetricPill
                    label="Closed with evidence"
                    value={row.resolvedWithEvidence}
                    tone={row.resolvedWithEvidence ? "success" : "default"}
                  />
                  <MetricPill
                    label="Highest risk"
                    value={row.highestRiskScore}
                    tone={row.highestRiskScore >= 80 ? "danger" : "default"}
                  />
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-2xl border border-emerald-300/20 bg-emerald-400/10 p-4 text-sm text-emerald-100">
            No intervention cases found in this district scope yet.
          </div>
        )}
      </div>
    </section>
  );
}

function districtCaseActionScore(item: GovernanceCase) {
  const evidence = closureEvidenceForCase(item);
  const riskScore = numberValue(item.riskScore);

  if (isOverdueIntervention(item)) return 1000 + riskScore;
  if (item.status === "ESCALATED") return 900 + riskScore;
  if (!evidence.hasOfficialNotice) return 800 + riskScore;
  if (evidence.hasOfficialNotice && !evidence.hasAcknowledgement) {
    return 700 + riskScore;
  }
  if (evidence.hasOfficialNotice && !evidence.hasCorrectiveResponse) {
    return 600 + riskScore;
  }
  if (item.status === "IN_PROGRESS") return 500 + riskScore;
  if (item.status === "OPEN") return 400 + riskScore;

  return riskScore;
}

function districtCaseActionReason(item: GovernanceCase) {
  const evidence = closureEvidenceForCase(item);

  if (isOverdueIntervention(item)) {
    return "Overdue case — Director should demand immediate SISSO follow-up.";
  }

  if (item.status === "ESCALATED") {
    return "Escalated case — requires higher-level governance attention.";
  }

  if (!evidence.hasOfficialNotice) {
    return "No official notice sent — SISSO must formally notify the school.";
  }

  if (evidence.hasOfficialNotice && !evidence.hasAcknowledgement) {
    return "Official notice sent but not acknowledged.";
  }

  if (evidence.hasOfficialNotice && !evidence.hasCorrectiveResponse) {
    return "Notice acknowledged or delivered, but corrective response is still missing.";
  }

  if (item.status === "IN_PROGRESS") {
    return "Follow-up started — Director should check whether response evidence is coming.";
  }

  return "Monitor case until evidence-based closure is complete.";
}

function districtCaseActionTone(item: GovernanceCase) {
  const evidence = closureEvidenceForCase(item);

  if (isOverdueIntervention(item)) return "danger";
  if (item.status === "ESCALATED") return "danger";
  if (!evidence.hasOfficialNotice) return "danger";
  if (!evidence.hasCorrectiveResponse) return "warning";

  return "default";
}

function cleanEscalationValue(value: string | null) {
  if (!value) return null;

  return value.trim().replace(/\s+/g, " ").replace(/\.$/, "").trim();
}

function extractEscalationField(
  note: string,
  label: string,
  nextLabels: string[],
) {
  const startToken = `${label}:`;
  const start = note.indexOf(startToken);

  if (start < 0) return null;

  const contentStart = start + startToken.length;
  let end = note.length;

  for (const nextLabel of nextLabels) {
    const nextIndex = note.indexOf(`${nextLabel}:`, contentStart);
    if (nextIndex >= 0 && nextIndex < end) {
      end = nextIndex;
    }
  }

  return cleanEscalationValue(note.slice(contentStart, end));
}

function parseEscalationLogbookNote(note?: string | null) {
  if (!note) return null;

  const labels = [
    "School",
    "School code",
    "Circuit",
    "Case",
    "Current status",
    "Priority",
    "Risk level",
    "Risk score",
    "Due date",
    "Official notice sent",
    "Acknowledgements",
    "Corrective responses",
    "Escalation reason",
  ];

  const field = (label: string) =>
    extractEscalationField(
      note,
      label,
      labels.filter((item) => item !== label),
    );

  return {
    raw: note,
    school: field("School"),
    schoolCode: field("School code"),
    circuit: field("Circuit"),
    caseTitle: field("Case"),
    currentStatus: field("Current status"),
    priority: field("Priority"),
    riskLevel: field("Risk level"),
    riskScore: field("Risk score"),
    dueDate: field("Due date"),
    officialNoticeSent: field("Official notice sent"),
    acknowledgements: field("Acknowledgements"),
    correctiveResponses: field("Corrective responses"),
    reason: field("Escalation reason"),
  };
}

function EscalationLogbookCard({
  note,
  receiptState,
}: {
  note: string;
  receiptState?: WorkflowReceiptState;
}) {
  const parsed = parseEscalationLogbookNote(note);

  if (!parsed?.reason) {
    return (
      <div className="mt-4 rounded-xl border border-red-300/15 bg-red-500/10 p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-red-200">
            Escalation reason
          </p>
          {receiptState ? <WorkflowTicks state={receiptState} /> : null}
        </div>
        <p className="mt-2 whitespace-pre-line text-sm leading-6 text-red-100/90">
          {note}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-xl border border-red-300/15 bg-red-500/10 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-red-200">
          Escalation logbook entry
        </p>
        {receiptState ? <WorkflowTicks state={receiptState} /> : null}
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
            School details
          </p>
          <dl className="mt-2 space-y-1 text-sm text-slate-200">
            <div>
              <dt className="text-xs text-slate-500">School</dt>
              <dd>{parsed.school ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">School code</dt>
              <dd>{parsed.schoolCode ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Circuit</dt>
              <dd>{parsed.circuit ?? "—"}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
            Case evidence
          </p>
          <dl className="mt-2 grid grid-cols-2 gap-2 text-sm text-slate-200">
            <div>
              <dt className="text-xs text-slate-500">Status</dt>
              <dd>{parsed.currentStatus ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Priority</dt>
              <dd>{parsed.priority ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Risk</dt>
              <dd>
                {parsed.riskLevel ?? "—"}
                {parsed.riskScore ? ` · ${parsed.riskScore}` : ""}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Notice sent</dt>
              <dd>{parsed.officialNoticeSent ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Acknowledgements</dt>
              <dd>{parsed.acknowledgements ?? "0"}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Responses</dt>
              <dd>{parsed.correctiveResponses ?? "0"}</dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-red-300/15 bg-red-500/10 p-3">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-red-200">
          Reason for escalation
        </p>
        <p className="mt-2 whitespace-pre-line text-sm leading-6 text-red-100">
          {parsed.reason}
        </p>
      </div>
    </div>
  );
}

function DistrictCaseActionQueue({
  cases,
  onOpenDirectorDirective,
}: {
  cases: GovernanceCase[];
  onOpenDirectorDirective: (item: GovernanceCase) => void;
}) {
  const actionCases = [...cases]
    .filter((item) => !isClosedCase(item))
    .sort((a, b) => districtCaseActionScore(b) - districtCaseActionScore(a))
    .slice(0, 8);

  return (
    <section className="rounded-3xl border border-red-300/20 bg-red-500/10 p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-200">
            District Action Queue
          </p>
          <h2 className="mt-2 text-xl font-bold text-white">
            Cases requiring the Director’s next follow-up
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-red-100/80">
            This converts intervention data into a practical leadership queue:
            overdue cases first, escalated cases next, then cases missing
            notices, acknowledgements, or corrective responses.
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-slate-200">
          Active queue:{" "}
          <span className="font-bold text-white">{actionCases.length}</span>
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {actionCases.length ? (
          actionCases.map((item, idx) => {
            const evidence = closureEvidenceForCase(item);
            const tone = districtCaseActionTone(item);

            return (
              <div
                key={item.id}
                className="rounded-2xl border border-white/10 bg-slate-950/55 p-4"
              >
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-200">
                        #{idx + 1}
                      </span>

                      <span
                        className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                          tone === "danger"
                            ? "border-red-300/30 bg-red-500/15 text-red-100"
                            : tone === "warning"
                              ? "border-amber-300/30 bg-amber-400/15 text-amber-100"
                              : "border-white/10 bg-white/5 text-slate-200"
                        }`}
                      >
                        {item.status.replaceAll("_", " ")}
                      </span>

                      <span
                        className={`rounded-full border px-3 py-1 text-xs font-semibold ${riskBadgeClass(item.riskLevel ?? item.priority)}`}
                      >
                        {item.riskLevel ?? item.priority} ·{" "}
                        {numberValue(item.riskScore)}
                      </span>
                    </div>

                    <p className="mt-3 text-base font-bold text-white">
                      {item.tenant?.name ?? item.title}
                    </p>

                    <p className="mt-1 text-xs text-slate-400">
                      {item.tenant?.schoolCode || "No school code"} ·{" "}
                      {item.zone?.name || "No circuit assigned"} · Created{" "}
                      {compactDateTime(item.createdAt) ?? item.createdAt}
                    </p>

                    <p className="mt-3 text-sm leading-6 text-red-100/90">
                      {districtCaseActionReason(item)}
                    </p>
                    {item.status === "ESCALATED" ? (
                      <button
                        type="button"
                        onClick={() => onOpenDirectorDirective(item)}
                        className="mt-4 rounded-full border border-sky-300/25 bg-sky-500/10 px-4 py-2 text-xs font-semibold text-sky-100 hover:bg-sky-500/20"
                      >
                        Issue Director directive
                      </button>
                    ) : null}
                  </div>

                  <div className="grid gap-2 text-xs sm:grid-cols-2 xl:min-w-[520px]">
                    <MetricPill
                      label="Official notice"
                      value={evidence.hasOfficialNotice ? "Yes" : "No"}
                      tone={evidence.hasOfficialNotice ? "success" : "danger"}
                    />
                    <MetricPill
                      label="Acknowledged"
                      value={evidence.acknowledgedRecipients}
                      tone={evidence.hasAcknowledgement ? "success" : "warning"}
                    />
                    <MetricPill
                      label="Responses"
                      value={evidence.respondedRecipients}
                      tone={
                        evidence.hasCorrectiveResponse ? "success" : "danger"
                      }
                    />
                    <MetricPill
                      label="Overdue"
                      value={isOverdueIntervention(item) ? "Yes" : "No"}
                      tone={isOverdueIntervention(item) ? "danger" : "success"}
                    />
                  </div>
                </div>

                {evidence.latestResponseBody ? (
                  <div className="mt-4 rounded-xl border border-emerald-300/15 bg-emerald-400/10 p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-200">
                      Latest response evidence
                    </p>
                    <p className="mt-1 text-xs text-emerald-100/80">
                      {evidence.latestResponseBy || "Recipient"} ·{" "}
                      {compactDateTime(
                        evidence.latestRespondedAt ?? undefined,
                      ) ?? "Time not available"}
                    </p>
                    <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-100">
                      {evidence.latestResponseBody}
                    </p>
                  </div>
                ) : null}

                {(() => {
                  const latestEvent = latestMeaningfulEvent(item);

                  if (!latestEvent) return null;

                  const note = eventNote(latestEvent);

                  if (
                    eventNoteHasMarker(
                      latestEvent,
                      SISSO_IMPLEMENTATION_RESPONSE_MARKER,
                    )
                  ) {
                    return <DirectiveImplementationResponseCard note={note} />;
                  }

                  if (
                    eventNoteHasMarker(latestEvent, DIRECTOR_DIRECTIVE_MARKER)
                  ) {
                    return (
                      <DirectorDirectiveCard
                        note={note}
                        receiptState={directiveReceiptState(item, latestEvent)}
                      />
                    );
                  }

                  if (
                    eventNoteHasMarker(latestEvent, ESCALATION_LOGBOOK_MARKER)
                  ) {
                    return (
                      <EscalationLogbookCard
                        note={note}
                        receiptState={escalationReceiptState(item, latestEvent)}
                      />
                    );
                  }

                  return (
                    <p className="mt-3 text-xs leading-5 text-slate-400">
                      Latest event: {latestEvent.eventType.replaceAll("_", " ")}
                      {latestEvent.note ? ` — ${latestEvent.note}` : ""}
                    </p>
                  );
                })()}
                <GovernanceCaseAuditLogbookCard item={item} />
              </div>
            );
          })
        ) : (
          <div className="rounded-2xl border border-emerald-300/20 bg-emerald-400/10 p-4 text-sm text-emerald-100">
            No active district intervention cases require follow-up right now.
          </div>
        )}
      </div>
    </section>
  );
}

function cleanDirectiveValue(value: string | null) {
  if (!value) return null;

  return value.trim().replace(/\s+/g, " ").replace(/\.$/, "").trim();
}

function parseDirectiveLineMap(section: string) {
  const map = new Map<string, string>();

  for (const rawLine of section.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const colonIndex = line.indexOf(":");
    if (colonIndex < 0) continue;

    const label = line.slice(0, colonIndex).trim();
    const value = line.slice(colonIndex + 1).trim();

    if (!label || !value) continue;
    if (!map.has(label)) {
      map.set(label, cleanDirectiveValue(value) ?? value);
    }
  }

  return map;
}

function parseDirectorDirectiveNote(note?: string | null) {
  if (!note) return null;

  const instructionMarker = "DIRECTOR INSTRUCTION";
  const instructionIndex = note.indexOf(instructionMarker);

  const evidenceSection =
    instructionIndex >= 0 ? note.slice(0, instructionIndex) : note;

  const instruction =
    instructionIndex >= 0
      ? note.slice(instructionIndex + instructionMarker.length).trim()
      : null;

  const fields = parseDirectiveLineMap(evidenceSection);

  return {
    raw: note,
    school: fields.get("School") ?? null,
    schoolCode: fields.get("School code") ?? null,
    circuit: fields.get("Circuit") ?? null,
    caseTitle: fields.get("Case") ?? null,
    currentStatus: fields.get("Current status") ?? null,
    priority: fields.get("Priority") ?? null,
    riskLevel: fields.get("Risk level") ?? null,
    riskScore: fields.get("Risk score") ?? null,
    officialNoticeSent: fields.get("Official notice sent") ?? null,
    acknowledgements: fields.get("Acknowledgements") ?? null,
    correctiveResponses: fields.get("Corrective responses") ?? null,
    instruction: cleanDirectiveValue(instruction),
  };
}

function DirectorDirectiveCard({
  note,
  receiptState,
}: {
  note: string;
  receiptState?: WorkflowReceiptState;
}) {
  const parsed = parseDirectorDirectiveNote(note);

  if (!parsed?.instruction) {
    return (
      <div className="mt-4 rounded-xl border border-sky-300/15 bg-sky-500/10 p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-200">
            Director directive
          </p>
          {receiptState ? <WorkflowTicks state={receiptState} /> : null}
        </div>
        <p className="mt-3 whitespace-pre-line text-sm leading-6 text-sky-100">
          {note}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-xl border border-sky-300/15 bg-sky-500/10 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-200">
          Director directive
        </p>
        {receiptState ? <WorkflowTicks state={receiptState} /> : null}
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
            School details
          </p>
          <dl className="mt-2 space-y-1 text-sm text-slate-200">
            <div>
              <dt className="text-xs text-slate-500">School</dt>
              <dd>{parsed.school ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">School code</dt>
              <dd>{parsed.schoolCode ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Circuit</dt>
              <dd>{parsed.circuit ?? "—"}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
            Case evidence
          </p>
          <dl className="mt-2 grid grid-cols-2 gap-2 text-sm text-slate-200">
            <div>
              <dt className="text-xs text-slate-500">
                Status before directive
              </dt>
              <dd>{parsed.currentStatus ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Priority</dt>
              <dd>{parsed.priority ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Risk</dt>
              <dd>
                {parsed.riskLevel ?? "—"}
                {parsed.riskScore ? ` · ${parsed.riskScore}` : ""}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Notice sent</dt>
              <dd>{parsed.officialNoticeSent ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Acknowledgements</dt>
              <dd>{parsed.acknowledgements ?? "0"}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Responses</dt>
              <dd>{parsed.correctiveResponses ?? "0"}</dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-sky-300/15 bg-sky-500/10 p-3">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-sky-200">
          Director instruction
        </p>
        <p className="mt-2 whitespace-pre-line text-sm leading-6 text-sky-100">
          {parsed.instruction}
        </p>
      </div>
    </div>
  );
}

function parseSectionAfterMarker(
  note: string,
  marker: string,
  nextMarkers: string[],
) {
  const start = note.indexOf(marker);
  if (start < 0) return null;

  const contentStart = start + marker.length;
  let end = note.length;

  for (const next of nextMarkers) {
    const idx = note.indexOf(next, contentStart);
    if (idx >= 0 && idx < end) end = idx;
  }

  return note.slice(contentStart, end).trim() || null;
}

function parseDirectiveImplementationResponse(note?: string | null) {
  if (!note) return null;

  const raw = note.replace(/^\uFEFF/, "").trimStart();
  const markerIndex = raw.indexOf(SISSO_IMPLEMENTATION_RESPONSE_MARKER);

  if (markerIndex < 0) return null;

  const body = raw.slice(markerIndex);
  const fields = parseDirectiveLineMap(body);

  const actionTaken = parseSectionAfterMarker(body, "ACTION TAKEN", [
    "EVIDENCE / NEXT ACTION",
  ]);

  const evidenceOrNextAction = parseSectionAfterMarker(
    body,
    "EVIDENCE / NEXT ACTION",
    [],
  );

  return {
    raw: body,
    school: fields.get("School") ?? null,
    schoolCode: fields.get("School code") ?? null,
    circuit: fields.get("Circuit") ?? null,
    directiveEventId: fields.get("Director directive event") ?? null,
    actionTaken: cleanDirectiveValue(actionTaken),
    evidenceOrNextAction: cleanDirectiveValue(evidenceOrNextAction),
  };
}

function DirectiveImplementationResponseCard({ note }: { note: string }) {
  const parsed = parseDirectiveImplementationResponse(note);

  if (!parsed?.actionTaken) {
    return (
      <div className="mt-4 rounded-xl border border-emerald-300/15 bg-emerald-400/10 p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-200">
            SISSO directive response
          </p>
          <WorkflowTicks state="RESPONDED" />
        </div>
        <p className="mt-3 whitespace-pre-line text-sm leading-6 text-emerald-100">
          {note}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-xl border border-emerald-300/15 bg-emerald-400/10 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-200">
          SISSO directive implementation response
        </p>
        <WorkflowTicks state="RESPONDED" label="SISSO responded" />
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
            School details
          </p>
          <dl className="mt-2 space-y-1 text-sm text-slate-200">
            <div>
              <dt className="text-xs text-slate-500">School</dt>
              <dd>{parsed.school ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">School code</dt>
              <dd>{parsed.schoolCode ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Circuit</dt>
              <dd>{parsed.circuit ?? "—"}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
            Directive reference
          </p>
          <p className="mt-2 break-all text-sm text-slate-200">
            {parsed.directiveEventId ?? "—"}
          </p>
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-emerald-300/15 bg-emerald-400/10 p-3">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-200">
          Action taken
        </p>
        <p className="mt-2 whitespace-pre-line text-sm leading-6 text-emerald-100">
          {parsed.actionTaken}
        </p>
      </div>

      {parsed.evidenceOrNextAction ? (
        <div className="mt-3 rounded-xl border border-white/10 bg-slate-950/40 p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
            Evidence / next action
          </p>
          <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-200">
            {parsed.evidenceOrNextAction}
          </p>
        </div>
      ) : null}
    </div>
  );
}

type WorkflowReceiptState = "SENT" | "SEEN" | "RESPONDED";

type GovernanceEvent = NonNullable<GovernanceCase["events"]>[number];

const ESCALATION_LOGBOOK_MARKER = "ESCALATION LOGBOOK ENTRY";
const DIRECTOR_DIRECTIVE_MARKER = "DIRECTOR REVIEW DIRECTIVE";
const SISSO_IMPLEMENTATION_RESPONSE_MARKER =
  "SISSO DIRECTIVE IMPLEMENTATION RESPONSE";

function eventNote(event?: GovernanceEvent | null) {
  return event?.note?.replace(/^\uFEFF/, "").trimStart() ?? "";
}

function eventNoteHasMarker(
  event: GovernanceEvent | null | undefined,
  marker: string,
) {
  return eventNote(event).includes(marker);
}

function eventTimeMs(event?: GovernanceEvent | null) {
  if (!event?.createdAt) return 0;

  const t = new Date(event.createdAt).getTime();
  return Number.isFinite(t) ? t : 0;
}

function eventMetadataString(
  event: GovernanceEvent | null | undefined,
  key: string,
) {
  const metadata = event?.metadata;

  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return "";
  }

  const value = metadata[key];
  return typeof value === "string" ? value : "";
}

function isReadReceiptEvent(event: GovernanceEvent | null | undefined) {
  return eventMetadataString(event, "kind") === "READ_RECEIPT";
}

function meaningfulEvents(item: GovernanceCase) {
  return (item.events ?? []).filter((event) => !isReadReceiptEvent(event));
}

function latestMeaningfulEvent(item: GovernanceCase) {
  return meaningfulEvents(item)[0] ?? null;
}

function latestEscalationMessageEvent(item: GovernanceCase) {
  return meaningfulEvents(item).find((event) =>
    eventNoteHasMarker(event, ESCALATION_LOGBOOK_MARKER),
  );
}

function latestDirectorDirectiveMessageEvent(item: GovernanceCase) {
  return meaningfulEvents(item).find((event) =>
    eventNoteHasMarker(event, DIRECTOR_DIRECTIVE_MARKER),
  );
}

function hasReadReceipt(
  item: GovernanceCase,
  receiptKind: string,
  messageEventId: string,
) {
  return (item.events ?? []).some((event) => {
    return (
      isReadReceiptEvent(event) &&
      eventMetadataString(event, "receiptKind") === receiptKind &&
      eventMetadataString(event, "messageEventId") === messageEventId
    );
  });
}

function hasDirectorDirectiveAfterEscalation(
  item: GovernanceCase,
  escalationEvent: GovernanceEvent,
) {
  const escalationTime = eventTimeMs(escalationEvent);

  return meaningfulEvents(item).some((event) => {
    return (
      eventTimeMs(event) > escalationTime &&
      eventNoteHasMarker(event, DIRECTOR_DIRECTIVE_MARKER)
    );
  });
}

function hasSissoActionAfterDirectorDirective(
  item: GovernanceCase,
  directiveEvent: GovernanceEvent,
) {
  const directiveTime = eventTimeMs(directiveEvent);

  return meaningfulEvents(item).some((event) => {
    if (event.id === directiveEvent.id) return false;
    if (eventTimeMs(event) <= directiveTime) return false;

    return eventNoteHasMarker(event, SISSO_IMPLEMENTATION_RESPONSE_MARKER);
  });
}

function latestSissoDirectiveResponseEvent(
  item: GovernanceCase,
  directiveEvent?: GovernanceEvent | null,
) {
  const directiveTime = eventTimeMs(directiveEvent);

  return meaningfulEvents(item).find((event) => {
    if (!eventNoteHasMarker(event, SISSO_IMPLEMENTATION_RESPONSE_MARKER)) {
      return false;
    }

    if (!directiveEvent) return true;

    return eventTimeMs(event) > directiveTime;
  });
}

function escalationReceiptState(
  item: GovernanceCase,
  escalationEvent: GovernanceEvent,
): WorkflowReceiptState {
  if (hasDirectorDirectiveAfterEscalation(item, escalationEvent)) {
    return "RESPONDED";
  }

  if (
    hasReadReceipt(
      item,
      "SISSO_ESCALATION_SEEN_BY_DIRECTOR",
      escalationEvent.id,
    )
  ) {
    return "SEEN";
  }

  return "SENT";
}

function directiveReceiptState(
  item: GovernanceCase,
  directiveEvent: GovernanceEvent,
): WorkflowReceiptState {
  if (hasSissoActionAfterDirectorDirective(item, directiveEvent)) {
    return "RESPONDED";
  }

  if (
    hasReadReceipt(item, "DIRECTOR_DIRECTIVE_SEEN_BY_SISSO", directiveEvent.id)
  ) {
    return "SEEN";
  }

  return "SENT";
}

function WorkflowTicks({
  state,
  label,
}: {
  state: WorkflowReceiptState;
  label?: string;
}) {
  const isResponded = state === "RESPONDED";
  const isSeen = state === "SEEN";

  const text =
    state === "RESPONDED"
      ? "Seen and responded"
      : state === "SEEN"
        ? "Seen"
        : "Sent";

  return (
    <span
      title={text}
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold ${
        isResponded
          ? "border-emerald-300/30 bg-emerald-400/10 text-emerald-100"
          : isSeen
            ? "border-sky-300/30 bg-sky-500/10 text-sky-100"
            : "border-slate-300/20 bg-white/5 text-slate-300"
      }`}
    >
      <span className="text-sm leading-none">
        {state === "SENT" ? "✓" : "✓✓"}
      </span>
      <span>{label ?? text}</span>
    </span>
  );
}

type AuditLogbookTone = "default" | "info" | "warning" | "danger" | "success";

type AuditLogbookEntry = {
  id: string;
  at: string | null;
  title: string;
  actor: string;
  description: string;
  status?: string | null;
  tone: AuditLogbookTone;
};

function auditActorLabel(
  actor?: { name: string | null; email: string } | null,
) {
  return actor?.name || actor?.email || "System / unknown actor";
}

function eventActorLabel(event: GovernanceEvent) {
  return auditActorLabel(event.actor);
}

function shortAuditText(value?: string | null, max = 280) {
  const text = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();

  if (!text) return "No note recorded.";
  if (text.length <= max) return text;

  return `${text.slice(0, max).trim()}…`;
}

function auditToneClass(tone: AuditLogbookTone) {
  if (tone === "danger") return "border-red-300/25 bg-red-500/10 text-red-100";
  if (tone === "warning") {
    return "border-amber-300/25 bg-amber-400/10 text-amber-100";
  }
  if (tone === "success") {
    return "border-emerald-300/25 bg-emerald-400/10 text-emerald-100";
  }
  if (tone === "info") return "border-sky-300/25 bg-sky-500/10 text-sky-100";

  return "border-white/10 bg-white/5 text-slate-200";
}

function auditDotClass(tone: AuditLogbookTone) {
  if (tone === "danger") return "bg-red-300";
  if (tone === "warning") return "bg-amber-300";
  if (tone === "success") return "bg-emerald-300";
  if (tone === "info") return "bg-sky-300";

  return "bg-slate-300";
}

function auditEventTitle(event: GovernanceEvent) {
  const note = eventNote(event);

  if (eventNoteHasMarker(event, ESCALATION_LOGBOOK_MARKER)) {
    return "Escalated with logbook reason";
  }

  if (eventNoteHasMarker(event, DIRECTOR_DIRECTIVE_MARKER)) {
    return "Director issued directive";
  }

  if (eventNoteHasMarker(event, SISSO_IMPLEMENTATION_RESPONSE_MARKER)) {
    return "SISSO submitted implementation response";
  }

  if (isReadReceiptEvent(event)) {
    const receiptKind = eventMetadataString(event, "receiptKind");

    if (receiptKind === "SISSO_ESCALATION_SEEN_BY_DIRECTOR") {
      return "Director saw SISSO escalation";
    }

    if (receiptKind === "DIRECTOR_DIRECTIVE_SEEN_BY_SISSO") {
      return "SISSO saw Director directive";
    }

    return "Read receipt recorded";
  }

  if (event.eventType === "CREATED") return "Case opened";
  if (event.eventType === "ASSIGNED") return "Case assigned";
  if (event.eventType === "NOTICE_SENT") return "Official notice event";
  if (event.eventType === "RESOLVED") return "Case resolved";
  if (event.eventType === "ESCALATED") return "Case escalated";
  if (event.eventType === "CANCELLED") return "Case cancelled";
  if (event.eventType === "REOPENED") return "Case reopened";

  if (event.eventType === "STATUS_CHANGED") {
    const from = event.fromStatus ?? "UNKNOWN";
    const to = event.toStatus ?? "UNKNOWN";
    return `Status changed: ${from.replaceAll("_", " ")} → ${to.replaceAll("_", " ")}`;
  }

  if (event.eventType === "COMMENT") return "Case comment / evidence";

  return event.eventType.replaceAll("_", " ");
}

function auditEventTone(event: GovernanceEvent): AuditLogbookTone {
  const note = eventNote(event);

  if (eventNoteHasMarker(event, ESCALATION_LOGBOOK_MARKER)) return "danger";
  if (eventNoteHasMarker(event, DIRECTOR_DIRECTIVE_MARKER)) return "info";
  if (eventNoteHasMarker(event, SISSO_IMPLEMENTATION_RESPONSE_MARKER)) {
    return "success";
  }

  if (isReadReceiptEvent(event)) return "info";

  if (event.toStatus === "RESOLVED" || event.eventType === "RESOLVED") {
    return "success";
  }

  if (event.toStatus === "ESCALATED" || event.eventType === "ESCALATED") {
    return "danger";
  }

  if (event.toStatus === "CANCELLED" || event.eventType === "CANCELLED") {
    return "warning";
  }

  if (event.eventType === "NOTICE_SENT") return "info";
  if (event.eventType === "COMMENT") return "default";

  return "default";
}

function auditEventDescription(event: GovernanceEvent) {
  const note = eventNote(event);

  if (isReadReceiptEvent(event)) {
    const receiptKind = eventMetadataString(event, "receiptKind");
    const seenAt = eventMetadataString(event, "seenAt");

    if (receiptKind === "SISSO_ESCALATION_SEEN_BY_DIRECTOR") {
      return seenAt
        ? `Director opened the escalation evidence at ${compactDateTime(seenAt) ?? seenAt}.`
        : "Director opened the escalation evidence.";
    }

    if (receiptKind === "DIRECTOR_DIRECTIVE_SEEN_BY_SISSO") {
      return seenAt
        ? `SISSO opened the Director’s directive at ${compactDateTime(seenAt) ?? seenAt}.`
        : "SISSO opened the Director’s directive.";
    }

    return "Read receipt was recorded.";
  }

  if (eventNoteHasMarker(event, ESCALATION_LOGBOOK_MARKER)) {
    const parsed = parseEscalationLogbookNote(note);
    return parsed?.reason
      ? shortAuditText(parsed.reason)
      : shortAuditText(note);
  }

  if (eventNoteHasMarker(event, DIRECTOR_DIRECTIVE_MARKER)) {
    const parsed = parseDirectorDirectiveNote(note);
    return parsed?.instruction
      ? shortAuditText(parsed.instruction)
      : shortAuditText(note);
  }

  if (eventNoteHasMarker(event, SISSO_IMPLEMENTATION_RESPONSE_MARKER)) {
    const parsed = parseDirectiveImplementationResponse(note);
    const action = parsed?.actionTaken ?? "";
    const evidence = parsed?.evidenceOrNextAction ?? "";

    return shortAuditText(
      [action, evidence ? `Evidence / next action: ${evidence}` : ""]
        .filter(Boolean)
        .join(" "),
    );
  }

  return shortAuditText(note);
}

function noticeDeliveryStatusSummary(
  deliveries?: Array<{
    channel: string;
    status: string;
    sentAt: string | null;
    deliveredAt: string | null;
    lastError: string | null;
  }>,
) {
  const rows = deliveries ?? [];

  if (!rows.length) return "No delivery records.";

  return rows
    .map((delivery) => {
      const time =
        compactDateTime(delivery.deliveredAt ?? delivery.sentAt ?? undefined) ??
        "";
      const error = delivery.lastError ? ` Error: ${delivery.lastError}` : "";

      return `${delivery.channel}: ${delivery.status}${time ? ` at ${time}` : ""}.${error}`;
    })
    .join(" ");
}

function buildNoticeAuditEntries(item: GovernanceCase): AuditLogbookEntry[] {
  const entries: AuditLogbookEntry[] = [];

  for (const notice of item.notices ?? []) {
    const noticeTime = notice.sentAt ?? notice.createdAt;

    entries.push({
      id: `notice:${notice.id}`,
      at: noticeTime,
      title: "Official notice created / sent",
      actor: "Governance notice system",
      status: notice.status,
      tone:
        notice.status === "SENT"
          ? "info"
          : notice.status === "FAILED" || notice.status === "PARTIALLY_FAILED"
            ? "danger"
            : "warning",
      description: [
        notice.title,
        notice.priority ? `Priority: ${notice.priority}.` : "",
        notice.recipients?.length
          ? `Recipients: ${notice.recipients.length}.`
          : "No recipients recorded.",
        noticeDeliveryStatusSummary(notice.deliveries),
      ]
        .filter(Boolean)
        .join(" "),
    });

    for (const recipient of notice.recipients ?? []) {
      if (recipient.readAt) {
        entries.push({
          id: `notice-read:${recipient.id}`,
          at: recipient.readAt,
          title: "Notice read in portal",
          actor:
            recipient.displayName ||
            recipient.roleLabel ||
            recipient.recipientType,
          status: "READ",
          tone: "info",
          description: `Recipient opened the notice: ${notice.title}.`,
        });
      }

      if (recipient.acknowledgedAt) {
        entries.push({
          id: `notice-ack:${recipient.id}`,
          at: recipient.acknowledgedAt,
          title: "Notice acknowledged",
          actor:
            recipient.displayName ||
            recipient.roleLabel ||
            recipient.recipientType,
          status: "ACKNOWLEDGED",
          tone: "success",
          description:
            recipient.acknowledgeNote ||
            `Recipient acknowledged the official notice: ${notice.title}.`,
        });
      }

      if (recipient.respondedAt && recipient.responseBody) {
        entries.push({
          id: `notice-response:${recipient.id}`,
          at: recipient.respondedAt,
          title: "Corrective response submitted",
          actor:
            recipient.displayName ||
            recipient.roleLabel ||
            recipient.recipientType,
          status: "RESPONDED",
          tone: "success",
          description: shortAuditText(recipient.responseBody, 420),
        });
      }

      for (const delivery of recipient.deliveries ?? []) {
        entries.push({
          id: `notice-delivery:${recipient.id}:${delivery.id}`,
          at: delivery.deliveredAt ?? delivery.sentAt ?? delivery.createdAt,
          title: `${delivery.channel} delivery ${delivery.status.toLowerCase()}`,
          actor:
            recipient.displayName ||
            recipient.roleLabel ||
            recipient.recipientType,
          status: delivery.status,
          tone:
            delivery.status === "SENT"
              ? "success"
              : delivery.status === "FAILED"
                ? "danger"
                : "warning",
          description:
            delivery.lastError ||
            `${delivery.channel} delivery status for official notice: ${delivery.status}.`,
        });
      }
    }
  }

  return entries;
}

function buildCaseAuditLogbookEntries(item: GovernanceCase) {
  const entries: AuditLogbookEntry[] = [
    {
      id: `case-created:${item.id}`,
      at: item.createdAt,
      title: "Intervention case opened",
      actor: auditActorLabel(item.createdBy),
      status: item.status,
      tone:
        item.priority === "CRITICAL" || item.riskLevel === "CRITICAL"
          ? "danger"
          : item.priority === "HIGH" || item.riskLevel === "HIGH"
            ? "warning"
            : "default",
      description: [
        item.summary,
        item.riskLevel ? `Risk: ${item.riskLevel}` : "",
        item.riskScore !== null && item.riskScore !== undefined
          ? `Score: ${item.riskScore}`
          : "",
      ]
        .filter(Boolean)
        .join(" · "),
    },
  ];

  for (const event of item.events ?? []) {
    entries.push({
      id: `event:${event.id}`,
      at: event.createdAt,
      title: auditEventTitle(event),
      actor: eventActorLabel(event),
      status: event.toStatus ?? event.eventType,
      tone: auditEventTone(event),
      description: auditEventDescription(event),
    });
  }

  entries.push(...buildNoticeAuditEntries(item));

  if (item.resolutionNote) {
    entries.push({
      id: `resolution-note:${item.id}`,
      at: item.updatedAt,
      title: "Resolution note recorded",
      actor: "Governance closure evidence",
      status: "RESOLUTION_NOTE",
      tone: item.status === "RESOLVED" ? "success" : "default",
      description: shortAuditText(item.resolutionNote, 420),
    });
  }

  const seen = new Set<string>();

  return entries
    .filter((entry) => {
      if (seen.has(entry.id)) return false;
      seen.add(entry.id);
      return true;
    })
    .sort((a, b) => {
      const ad = a.at ? new Date(a.at).getTime() : 0;
      const bd = b.at ? new Date(b.at).getTime() : 0;
      return ad - bd;
    });
}

function latestCaseAuditAt(item: GovernanceCase) {
  const latestEventAt = (item.events ?? [])
    .map((event) => new Date(event.createdAt).getTime())
    .filter(Number.isFinite)
    .sort((a, b) => b - a)[0];

  const latestNoticeAt = (item.notices ?? [])
    .flatMap((notice) => [
      notice.sentAt,
      notice.createdAt,
      ...(notice.recipients ?? []).flatMap((recipient) => [
        recipient.readAt,
        recipient.acknowledgedAt,
        recipient.respondedAt,
        ...(recipient.deliveries ?? []).flatMap((delivery) => [
          delivery.deliveredAt,
          delivery.sentAt,
          delivery.createdAt,
        ]),
      ]),
      ...(notice.deliveries ?? []).flatMap((delivery) => [
        delivery.deliveredAt,
        delivery.sentAt,
        delivery.createdAt,
      ]),
    ])
    .map((value) => (value ? new Date(value).getTime() : 0))
    .filter(Number.isFinite)
    .sort((a, b) => b - a)[0];

  return Math.max(
    new Date(item.updatedAt ?? item.createdAt).getTime(),
    latestEventAt ?? 0,
    latestNoticeAt ?? 0,
  );
}

function GovernanceCaseAuditLogbookCard({ item }: { item: GovernanceCase }) {
  const entries = buildCaseAuditLogbookEntries(item);
  const latest = entries[entries.length - 1] ?? null;

  return (
    <details className="mt-4 rounded-2xl border border-white/10 bg-slate-950/45 p-4">
      <summary className="cursor-pointer list-none">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">
              Governance audit logbook
            </p>
            <p className="mt-1 text-sm font-bold text-white">
              {entries.length} evidence event(s) recorded
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-400">
              Latest: {latest?.title ?? "No evidence yet"}
              {latest?.at
                ? ` · ${compactDateTime(latest.at) ?? latest.at}`
                : ""}
            </p>
          </div>

          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold text-slate-200">
            Open logbook
          </span>
        </div>
      </summary>

      <div className="mt-4 space-y-3">
        {entries.map((entry, idx) => (
          <div
            key={entry.id}
            className={`rounded-2xl border p-3 ${auditToneClass(entry.tone)}`}
          >
            <div className="flex gap-3">
              <div className="flex flex-col items-center">
                <span
                  className={`mt-1 h-3 w-3 rounded-full ${auditDotClass(entry.tone)}`}
                />
                {idx < entries.length - 1 ? (
                  <span className="mt-2 h-full min-h-8 w-px bg-white/10" />
                ) : null}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-bold text-white">
                      {entry.title}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      {entry.at
                        ? (compactDateTime(entry.at) ?? entry.at)
                        : "Time not recorded"}{" "}
                      · {entry.actor}
                    </p>
                  </div>

                  {entry.status ? (
                    <span className="w-fit rounded-full border border-white/10 bg-black/20 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-200">
                      {String(entry.status).replaceAll("_", " ")}
                    </span>
                  ) : null}
                </div>

                <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-100">
                  {entry.description}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </details>
  );
}

function GovernanceAuditLogbookPanel({
  cases,
  title,
  description,
}: {
  cases: GovernanceCase[];
  title: string;
  description: string;
}) {
  const auditCases = [...cases]
    .sort((a, b) => latestCaseAuditAt(b) - latestCaseAuditAt(a))
    .slice(0, 10);

  return (
    <section className="rounded-3xl border border-sky-300/20 bg-sky-500/10 p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-200">
            Governance Logbook
          </p>
          <h2 className="mt-2 text-xl font-bold text-white">{title}</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-sky-100/80">
            {description}
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-slate-200">
          Cases tracked:{" "}
          <span className="font-bold text-white">{cases.length}</span>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        {auditCases.length ? (
          auditCases.map((item) => (
            <div
              key={item.id}
              className="rounded-2xl border border-white/10 bg-slate-950/50 p-4"
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-sm font-bold text-white">
                    {item.tenant?.name ?? item.title}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    {item.tenant?.schoolCode || "No school code"} ·{" "}
                    {item.zone?.name || "No circuit"} · Case{" "}
                    {item.id.slice(0, 10)}…
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <span
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${riskBadgeClass(item.riskLevel ?? item.priority)}`}
                  >
                    {item.riskLevel ?? item.priority} ·{" "}
                    {numberValue(item.riskScore)}
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-200">
                    {item.status.replaceAll("_", " ")}
                  </span>
                </div>
              </div>

              <GovernanceCaseAuditLogbookCard item={item} />
            </div>
          ))
        ) : (
          <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4 text-sm text-slate-300">
            No intervention cases are available for the current governance
            scope.
          </div>
        )}
      </div>
    </section>
  );
}

function MetricPill({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string | number;
  tone?: "default" | "danger" | "warning" | "success";
}) {
  const toneClass =
    tone === "danger"
      ? "border-red-300/20 bg-red-500/10 text-red-100"
      : tone === "warning"
        ? "border-amber-300/20 bg-amber-400/10 text-amber-100"
        : tone === "success"
          ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-100"
          : "border-white/10 bg-white/5 text-slate-300";

  return (
    <span className={`rounded-xl border px-3 py-2 text-xs ${toneClass}`}>
      {label}: <b className="text-white">{value}</b>
    </span>
  );
}

function SectionHeading({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div>
      <h2 className="text-lg font-bold text-white">{title}</h2>
      <p className="mt-1 text-sm leading-6 text-slate-300">{description}</p>
    </div>
  );
}

function AssessmentIntegrityGrid({
  metrics,
}: {
  metrics?: SchoolMetrics | InterventionQueueItem["metrics"];
}) {
  return (
    <div className="grid grid-cols-2 gap-2 text-xs text-slate-300 md:grid-cols-4">
      <MetricPill
        label="Items"
        value={numberValue(metrics?.assessmentItemsTotal)}
      />
      <MetricPill
        label="Draft"
        value={numberValue(metrics?.assessmentItemsDraft)}
        tone={
          numberValue(metrics?.assessmentItemsDraft) ? "warning" : "success"
        }
      />
      <MetricPill
        label="No scores"
        value={numberValue(metrics?.assessmentItemsWithoutScores)}
        tone={
          numberValue(metrics?.assessmentItemsWithoutScores)
            ? "danger"
            : "success"
        }
      />
      <MetricPill
        label="No delivery link"
        value={numberValue(metrics?.assessmentItemsWithoutLessonDelivery)}
        tone={
          numberValue(metrics?.assessmentItemsWithoutLessonDelivery)
            ? "warning"
            : "success"
        }
      />
      <MetricPill
        label="No curriculum link"
        value={numberValue(metrics?.assessmentItemsWithoutCurriculumUnit)}
        tone={
          numberValue(metrics?.assessmentItemsWithoutCurriculumUnit)
            ? "warning"
            : "success"
        }
      />
      <MetricPill
        label="Scoring"
        value={percentValue(metrics?.assessmentCompletionRate)}
        tone={
          numberValue(metrics?.assessmentCompletionRate) < 60
            ? "danger"
            : "success"
        }
      />
      <MetricPill
        label="Link coverage"
        value={percentValue(metrics?.assessmentLinkCoverageRate)}
        tone={
          numberValue(metrics?.assessmentLinkCoverageRate) < 70
            ? "warning"
            : "success"
        }
      />
      <MetricPill
        label="Orphan notes"
        value={numberValue(metrics?.orphanedLessonNotesLast14Days)}
        tone={
          numberValue(metrics?.orphanedLessonNotesLast14Days)
            ? "danger"
            : "success"
        }
      />
    </div>
  );
}

type OfficialNoticeTargetRole = "SISSO" | "HEADTEACHER" | "TEACHER";
type OfficialNoticePriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
type OfficialNoticeScopeMode = "ZONE" | "SCHOOL";
type OfficialNoticeSectorTarget = "PUBLIC" | "PRIVATE" | "ALL_AUTHORIZED";
type OfficialNoticeKind =
  | "INFORMATION_ONLY"
  | "ACKNOWLEDGEMENT_REQUIRED"
  | "RESPONSE_REQUIRED"
  | "URGENT_DIRECTIVE";

type GovernanceAssignmentSummary = NonNullable<
  NonNullable<OverviewResponse["scope"]>["assignments"]
>[number];

function makeOfficialNoticeDraftKey() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function officialNoticeTargetLabel(role: OfficialNoticeTargetRole) {
  if (role === "SISSO") return "SISSOs / Circuit Supervisors";
  if (role === "HEADTEACHER") return "Headteachers";
  return "Teachers";
}

function officialNoticeKindLabel(kind: OfficialNoticeKind) {
  if (kind === "INFORMATION_ONLY") return "Information only";
  if (kind === "ACKNOWLEDGEMENT_REQUIRED") return "Acknowledgement required";
  if (kind === "RESPONSE_REQUIRED") return "Response required";
  return "Urgent directive";
}

function officialNoticeKindNeedsResponse(kind: OfficialNoticeKind) {
  return kind === "RESPONSE_REQUIRED" || kind === "URGENT_DIRECTIVE";
}

function officialNoticeKindNeedsAck(kind: OfficialNoticeKind) {
  return kind !== "INFORMATION_ONLY";
}

function officialNoticeSectorTargetLabel(target: OfficialNoticeSectorTarget) {
  if (target === "PUBLIC") return "Public schools only";
  if (target === "PRIVATE") return "Private schools only";
  return "All authorized schools";
}

function OfficialGovernanceNoticeComposer({
  isDistrictView,
  isCircuitView,
  assignments,
  schools,
}: {
  isDistrictView: boolean;
  isCircuitView: boolean;
  assignments: GovernanceAssignmentSummary[];
  schools: SchoolRow[];
}) {
  const targetRoles = useMemo<OfficialNoticeTargetRole[]>(
    () =>
      isDistrictView
        ? ["SISSO", "HEADTEACHER", "TEACHER"]
        : ["HEADTEACHER", "TEACHER"],
    [isDistrictView],
  );

  const [targetRole, setTargetRole] = useState<OfficialNoticeTargetRole>(
    isDistrictView ? "SISSO" : "HEADTEACHER",
  );
  const [scopeMode, setScopeMode] = useState<OfficialNoticeScopeMode>("ZONE");
  const [sectorTarget, setSectorTarget] =
    useState<OfficialNoticeSectorTarget>("PUBLIC");
  const [targetZoneId, setTargetZoneId] = useState("");
  const [selectedSchoolId, setSelectedSchoolId] = useState("");
  const [priority, setPriority] = useState<OfficialNoticePriority>("MEDIUM");
  const [noticeKind, setNoticeKind] = useState<OfficialNoticeKind>(
    "ACKNOWLEDGEMENT_REQUIRED",
  );
  const [deadlineAt, setDeadlineAt] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [draftKey, setDraftKey] = useState(makeOfficialNoticeDraftKey);
  const [busy, setBusy] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendSuccess, setSendSuccess] = useState<string | null>(null);

  const assignmentOptions = assignments.filter((assignment) =>
    Boolean(assignment.zoneId),
  );

  const selectedAssignment =
    assignmentOptions.find(
      (assignment) => assignment.zoneId === targetZoneId,
    ) ??
    assignmentOptions[0] ??
    null;

  const schoolOptions = schools
    .filter((school) => school.status !== "ARCHIVED")
    .filter((school) => {
      if (sectorTarget === "ALL_AUTHORIZED") return true;
      return school.schoolSector === sectorTarget;
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const selectedSchool =
    schoolOptions.find((school) => school.id === selectedSchoolId) ?? null;

  const canTargetSchool = targetRole !== "SISSO" && schoolOptions.length > 0;
  const requiresAcknowledgement = officialNoticeKindNeedsAck(noticeKind);
  const requiresResponse = officialNoticeKindNeedsResponse(noticeKind);

  useEffect(() => {
    if (!targetRoles.includes(targetRole)) {
      setTargetRole(targetRoles[0] ?? "HEADTEACHER");
    }
  }, [targetRole, targetRoles]);

  useEffect(() => {
    if (!targetZoneId && assignmentOptions[0]?.zoneId) {
      setTargetZoneId(assignmentOptions[0].zoneId);
    }
  }, [assignmentOptions, targetZoneId]);

  useEffect(() => {
    if (targetRole === "SISSO") {
      setScopeMode("ZONE");
      setSelectedSchoolId("");
    }
  }, [targetRole]);

  useEffect(() => {
    if (!selectedSchoolId) return;

    const stillAllowed = schoolOptions.some(
      (school) => school.id === selectedSchoolId,
    );
    if (!stillAllowed) setSelectedSchoolId("");
  }, [schoolOptions, selectedSchoolId]);

  const targetSummary =
    scopeMode === "SCHOOL" && selectedSchool
      ? `${selectedSchool.name} (${selectedSchool.schoolCode ?? "no code"})`
      : selectedAssignment
        ? `${selectedAssignment.zoneName} ${selectedAssignment.zoneTypeName}`
        : "your authorized scope";

  async function sendOfficialGovernanceNotice() {
    setSendError(null);
    setSendSuccess(null);

    const cleanTitle = title.trim();
    const cleanBody = body.trim();

    if (!cleanTitle || cleanTitle.length < 6) {
      setSendError("Write a clear notice title of at least 6 characters.");
      return;
    }

    if (!cleanBody || cleanBody.length < 20) {
      setSendError(
        "Write a fuller official notice body of at least 20 characters.",
      );
      return;
    }

    if (scopeMode === "ZONE" && !targetZoneId) {
      setSendError(
        "No authorized governance zone is available for this notice.",
      );
      return;
    }

    if (scopeMode === "SCHOOL" && !selectedSchoolId) {
      setSendError(
        "Select the school that should receive this official notice.",
      );
      return;
    }

    setBusy(true);

    try {
      const scopeLabel = isDistrictView
        ? "DISTRICT"
        : isCircuitView
          ? "CIRCUIT"
          : "GOVERNANCE";

      const targetId =
        scopeMode === "SCHOOL"
          ? selectedSchoolId
          : targetZoneId || selectedAssignment?.zoneId || "scope";

      const idempotencyKey =
        `b7-official:${scopeLabel}:${targetRole}:${scopeMode}:${sectorTarget}:${targetId}:${draftKey}`.slice(
          0,
          220,
        );

      const payload = {
        tenantId: scopeMode === "SCHOOL" ? selectedSchoolId : undefined,
        zoneId: scopeMode === "ZONE" ? targetZoneId : undefined,
        title: cleanTitle,
        body: cleanBody,
        priority,
        channels: ["IN_APP", "SMS", "EMAIL"],
        targetRoles: [targetRole],
        idempotencyKey,
        idempotencyScope: "B7_OFFICIAL_COMMUNICATION",
        metadata: {
          source: "B7-official-governance-communication",
          noticeIntent: "OFFICIAL_COMMUNICATION",
          composer: "B7C-governance-dashboard-composer",
          scopeLabel,
          scopeMode,
          targetAudience: targetRole,
          targetLabel: targetSummary,
          governanceSectorTarget: sectorTarget,
          schoolSectorTarget: sectorTarget,
          sectorTarget,
          sectorRule:
            "Public/private targeting is enforced server-side before recipients are created.",
          noticeKind,
          requiresAcknowledgement,
          requiresResponse,
          deadlineAt: deadlineAt || null,
          securityRule:
            "EduLife OS portal is the source of truth. SMS and email are alerts/copies. WhatsApp is not authoritative without matching EduLife OS notice reference.",
        },
      };

      const res = await fetch("/api/governance/notices/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      const json = (await res
        .json()
        .catch(() => null)) as NoticeSendResponse | null;

      if (!res.ok || !json?.ok) {
        setSendError(
          json && !json.ok
            ? json.error
            : `Failed to send official notice (${res.status})`,
        );
        return;
      }

      const reused = Boolean(json.reused || json.item?.reused);
      const recipientCount = Array.isArray(json.item?.recipients)
        ? json.item.recipients.length
        : null;

      setSendSuccess(
        reused
          ? "This official notice was already sent; duplicate SMS/email was safely suppressed."
          : `Official notice sent to ${officialNoticeTargetLabel(targetRole)}${
              recipientCount !== null ? ` (${recipientCount} recipient(s))` : ""
            }.`,
      );

      setTitle("");
      setBody("");
      setDeadlineAt("");
      setDraftKey(makeOfficialNoticeDraftKey());
    } catch {
      setSendError("Network/server error while sending official notice.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-3xl border border-indigo-300/20 bg-indigo-500/10 p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-200">
            Official Communication Spine
          </p>
          <h2 className="mt-2 text-xl font-bold text-white">
            Send verified EduLife OS official notice
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-indigo-100/80">
            Use this for Director/SISSO official instructions. SMS and email are
            alerts; EduLife OS remains the source of truth. WhatsApp copies are
            not authoritative.
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-xs leading-5 text-slate-200">
          <b className="text-white">Scope:</b> {targetSummary}
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-4">
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-300">
            Target recipients
          </span>
          <select
            value={targetRole}
            onChange={(event) =>
              setTargetRole(event.target.value as OfficialNoticeTargetRole)
            }
            className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-white outline-none focus:border-indigo-300/50"
          >
            {targetRoles.map((role) => (
              <option key={role} value={role}>
                {officialNoticeTargetLabel(role)}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-300">
            Scope
          </span>
          <select
            value={scopeMode}
            onChange={(event) =>
              setScopeMode(event.target.value as OfficialNoticeScopeMode)
            }
            disabled={targetRole === "SISSO"}
            className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-white outline-none focus:border-indigo-300/50 disabled:opacity-60"
          >
            <option value="ZONE">
              {isDistrictView
                ? "Authorized district scope"
                : "Authorized circuit scope"}
            </option>
            {canTargetSchool ? (
              <option value="SCHOOL">Selected school only</option>
            ) : null}
          </select>
        </label>

        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-300">
            School sector target
          </span>
          <select
            value={sectorTarget}
            onChange={(event) =>
              setSectorTarget(event.target.value as OfficialNoticeSectorTarget)
            }
            disabled={targetRole === "SISSO"}
            className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-white outline-none focus:border-indigo-300/50 disabled:opacity-60"
          >
            <option value="PUBLIC">Public schools only</option>
            <option value="PRIVATE">Private schools only</option>
            <option value="ALL_AUTHORIZED">All authorized schools</option>
          </select>
          <p className="mt-1 text-[11px] leading-4 text-slate-500">
            {targetRole === "SISSO"
              ? "Sector filtering applies to school recipients, not SISSO recipients."
              : officialNoticeSectorTargetLabel(sectorTarget)}
          </p>
        </label>

        {scopeMode === "ZONE" ? (
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-300">
              Authorized zone
            </span>
            <select
              value={targetZoneId}
              onChange={(event) => setTargetZoneId(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-white outline-none focus:border-indigo-300/50"
            >
              {assignmentOptions.length ? (
                assignmentOptions.map((assignment) => (
                  <option key={assignment.zoneId} value={assignment.zoneId}>
                    {assignment.zoneName} · {roleLabel(assignment.role)}
                  </option>
                ))
              ) : (
                <option value="">No governance assignment found</option>
              )}
            </select>
          </label>
        ) : (
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-300">
              School
            </span>
            <select
              value={selectedSchoolId}
              onChange={(event) => setSelectedSchoolId(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-white outline-none focus:border-indigo-300/50"
            >
              <option value="">Select school</option>
              {schoolOptions.map((school) => (
                <option key={school.id} value={school.id}>
                  {school.name} · {school.schoolCode ?? "no code"} ·{" "}
                  {schoolSectorLabel(school.schoolSector)}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-300">
            Notice type
          </span>
          <select
            value={noticeKind}
            onChange={(event) =>
              setNoticeKind(event.target.value as OfficialNoticeKind)
            }
            className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-white outline-none focus:border-indigo-300/50"
          >
            {(
              [
                "INFORMATION_ONLY",
                "ACKNOWLEDGEMENT_REQUIRED",
                "RESPONSE_REQUIRED",
                "URGENT_DIRECTIVE",
              ] as OfficialNoticeKind[]
            ).map((kind) => (
              <option key={kind} value={kind}>
                {officialNoticeKindLabel(kind)}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-300">
            Priority
          </span>
          <select
            value={priority}
            onChange={(event) =>
              setPriority(event.target.value as OfficialNoticePriority)
            }
            className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-white outline-none focus:border-indigo-300/50"
          >
            {(
              ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as OfficialNoticePriority[]
            ).map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-300">
            Deadline / expected action date
          </span>
          <input
            type="date"
            value={deadlineAt}
            onChange={(event) => setDeadlineAt(event.target.value)}
            className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-white outline-none focus:border-indigo-300/50"
          />
        </label>
      </div>

      <label className="mt-4 block">
        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-300">
          Official notice title
        </span>
        <input
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
            setSendError(null);
            setSendSuccess(null);
          }}
          placeholder="Example: Urgent directive on attendance punctuality"
          className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-indigo-300/50"
        />
      </label>

      <label className="mt-4 block">
        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-300">
          Official notice body
        </span>
        <textarea
          value={body}
          onChange={(event) => {
            setBody(event.target.value);
            setSendError(null);
            setSendSuccess(null);
          }}
          rows={6}
          placeholder="Write the official instruction clearly. Avoid vague language. State what must be done, by whom, and by when."
          className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-slate-500 focus:border-indigo-300/50"
        />
      </label>

      <div className="mt-4 grid gap-3 text-xs sm:grid-cols-3">
        <MetricPill label="In-app" value="Source of truth" tone="success" />
        <MetricPill label="SMS" value="Alert only" tone="warning" />
        <MetricPill label="Email" value="Copy / alert" tone="warning" />
      </div>

      {sendError ? (
        <div className="mt-4 rounded-2xl border border-red-300/20 bg-red-500/10 p-3 text-sm text-red-100">
          {sendError}
        </div>
      ) : null}

      {sendSuccess ? (
        <div className="mt-4 rounded-2xl border border-emerald-300/20 bg-emerald-400/10 p-3 text-sm text-emerald-100">
          {sendSuccess}
        </div>
      ) : null}

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-5 text-slate-400">
          No manual phone, email, or custom recipient is allowed here.
          Recipients are resolved from verified EduLife OS roles inside your
          authorized scope.
        </p>

        <button
          type="button"
          onClick={() => void sendOfficialGovernanceNotice()}
          disabled={busy}
          className="rounded-full border border-indigo-300/25 bg-indigo-500/20 px-5 py-2 text-sm font-semibold text-indigo-100 hover:bg-indigo-500/30 disabled:opacity-50"
        >
          {busy ? "Sending official notice..." : "Send official notice"}
        </button>
      </div>
    </section>
  );
}

export default function GovernanceDashboardClient({
  endpoint,
  title,
  eyebrow,
  description,
  loginMode = "governance",
}: Props) {
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [cases, setCases] = useState<GovernanceCase[]>([]);
  const [casesLoading, setCasesLoading] = useState(false);
  const [caseAction, setCaseAction] = useState<string | null>(null);
  const [caseError, setCaseError] = useState<string | null>(null);
  const [busyCaseKey, setBusyCaseKey] = useState<string | null>(null);
  const [isGovernanceLogbookOpen, setIsGovernanceLogbookOpen] = useState(false);
  const receiptKeysRef = useRef<Set<string>>(new Set());

  const [escalationCase, setEscalationCase] = useState<GovernanceCase | null>(
    null,
  );
  const [escalationReason, setEscalationReason] = useState("");
  const [escalationError, setEscalationError] = useState<string | null>(null);

  const [directorDirectiveCase, setDirectorDirectiveCase] =
    useState<GovernanceCase | null>(null);
  const [directorDirective, setDirectorDirective] = useState("");
  const [directorDirectiveError, setDirectorDirectiveError] = useState<
    string | null
  >(null);

  const [directiveResponseCase, setDirectiveResponseCase] =
    useState<GovernanceCase | null>(null);
  const [directiveResponseEvent, setDirectiveResponseEvent] =
    useState<GovernanceEvent | null>(null);
  const [directiveResponseBody, setDirectiveResponseBody] = useState("");
  const [directiveResponseEvidence, setDirectiveResponseEvidence] =
    useState("");
  const [directiveResponseError, setDirectiveResponseError] = useState<
    string | null
  >(null);

  const isDistrictView = endpoint.includes("/district/");
  const isCircuitView = endpoint.includes("/circuit/");

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(endpoint, {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });

      const json = (await res.json().catch(() => null)) as
        | OverviewResponse
        | ErrorResponse
        | null;

      if (!res.ok || !json?.ok) {
        const e =
          json && !json.ok
            ? json.error
            : `Failed to load dashboard (${res.status})`;
        setData(null);
        setError(e);
        return;
      }

      setData(json);
    } catch {
      setData(null);
      setError("Network/server error while loading dashboard.");
    } finally {
      setLoading(false);
    }
  }

  async function loadCases() {
    setCasesLoading(true);
    setCaseError(null);

    try {
      const caseLimit = isDistrictView ? 100 : 25;

      const res = await fetch(
        `/api/governance/interventions/list?take=${caseLimit}`,
        {
          cache: "no-store",
          credentials: "include",
          headers: { Accept: "application/json" },
        },
      );

      const json = (await res
        .json()
        .catch(() => null)) as CaseListResponse | null;

      if (!res.ok || !json?.ok) {
        setCases([]);
        setCaseError(
          json && !json.ok
            ? json.error
            : `Failed to load cases (${res.status})`,
        );
        return;
      }

      setCases(json.items ?? []);
    } catch {
      setCases([]);
      setCaseError("Network/server error while loading intervention cases.");
    } finally {
      setCasesLoading(false);
    }
  }

  async function markWorkflowMessageSeen(args: {
    caseId: string;
    messageEventId: string;
    receiptKind:
      | "SISSO_ESCALATION_SEEN_BY_DIRECTOR"
      | "DIRECTOR_DIRECTIVE_SEEN_BY_SISSO";
  }) {
    const receiptKey = `${args.caseId}:${args.messageEventId}:${args.receiptKind}`;

    if (receiptKeysRef.current.has(receiptKey)) return;
    receiptKeysRef.current.add(receiptKey);

    try {
      const res = await fetch("/api/governance/interventions/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          caseId: args.caseId,
          action: "RECEIPT",
          receiptKind: args.receiptKind,
          messageEventId: args.messageEventId,
          metadata: {
            source: "B6E-dashboard-read-receipt",
          },
        }),
      });

      const json = (await res
        .json()
        .catch(() => null)) as CaseWriteResponse | null;

      if (!res.ok || !json?.ok) {
        receiptKeysRef.current.delete(receiptKey);
        setCaseError(
          json && !json.ok
            ? `Read receipt failed: ${json.error}`
            : `Read receipt failed (${res.status})`,
        );
        return;
      }

      await loadCases();
    } catch {
      receiptKeysRef.current.delete(receiptKey);
      setCaseError(
        "Network/server error while saving governance read receipt.",
      );
    }
  }

  function activeCaseForSchool(schoolId: string) {
    return cases.find(
      (c) =>
        c.tenantId === schoolId &&
        c.scopeType === "SCHOOL" &&
        c.status !== "RESOLVED" &&
        c.status !== "CANCELLED",
    );
  }

  async function openCaseFromQueue(item: InterventionQueueItem) {
    const existing = activeCaseForSchool(item.schoolId);

    if (existing) {
      setCaseAction(`Existing open case found for ${item.schoolName}.`);
      setCaseError(null);
      return;
    }

    setBusyCaseKey(`open:${item.schoolId}`);
    setCaseAction(null);
    setCaseError(null);

    try {
      const res = await fetch("/api/governance/interventions/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          scopeType: "SCHOOL",
          tenantId: item.schoolId,
          title: `${item.schoolName} intervention`,
          summary:
            item.reasons?.[0] ??
            "School is showing supervision risk from current governance dashboard signals.",
          priority:
            item.riskLevel === "CRITICAL"
              ? "CRITICAL"
              : item.riskLevel === "HIGH"
                ? "HIGH"
                : "MEDIUM",
          riskScore: item.riskScore,
          riskLevel: item.riskLevel,
          riskSnapshot: {
            source: "governance-dashboard-ui",
            riskScore: item.riskScore,
            riskLevel: item.riskLevel,
            metrics: item.metrics ?? {},
          },
          recommendedActions: item.recommendedActions ?? [],
          metadata: {
            source: "B5A-governance-dashboard",
            schoolName: item.schoolName,
            schoolCode: item.schoolCode,
            circuitName: item.circuitName,
            districtName: item.districtName,
          },
        }),
      });

      const json = (await res
        .json()
        .catch(() => null)) as CaseWriteResponse | null;

      if (!res.ok || !json?.ok) {
        setCaseError(
          json && !json.ok ? json.error : `Failed to open case (${res.status})`,
        );
        return;
      }

      setCaseAction(`Opened intervention case for ${item.schoolName}.`);
      await loadCases();
    } catch {
      setCaseError("Network/server error while opening intervention case.");
    } finally {
      setBusyCaseKey(null);
    }
  }

  async function updateCaseStatus(
    item: GovernanceCase,
    status: Exclude<GovernanceCaseStatus, "OPEN" | "CANCELLED">,
    note: string,
  ) {
    const closureEvidence =
      status === "RESOLVED" ? closureEvidenceForCase(item) : null;

    if (
      status === "RESOLVED" &&
      closureEvidence &&
      !closureEvidence.canResolve
    ) {
      setCaseAction(null);
      setCaseError(`Cannot resolve yet: ${closureEvidence.warnings.join(" ")}`);
      return;
    }

    const finalNote = status === "RESOLVED" ? buildResolutionNote(item) : note;

    setBusyCaseKey(`status:${item.id}:${status}`);
    setCaseAction(null);
    setCaseError(null);

    try {
      const res = await fetch("/api/governance/interventions/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          caseId: item.id,
          action: "STATUS",
          status,
          note: finalNote,
          metadata: {
            source: "B5E-evidence-based-case-closure",
            closureEvidence,
          },
        }),
      });

      const json = (await res
        .json()
        .catch(() => null)) as CaseWriteResponse | null;

      if (!res.ok || !json?.ok) {
        setCaseError(
          json && !json.ok
            ? json.error
            : `Failed to update case (${res.status})`,
        );
        return;
      }

      setCaseAction(`Case updated to ${status.replaceAll("_", " ")}.`);
      await loadCases();
    } catch {
      setCaseError("Network/server error while updating intervention case.");
    } finally {
      setBusyCaseKey(null);
    }
  }

  function openEscalationDialog(item: GovernanceCase) {
    setEscalationCase(item);
    setEscalationReason("");
    setEscalationError(null);
    setCaseAction(null);
    setCaseError(null);
  }

  function closeEscalationDialog() {
    if (busyCaseKey?.startsWith("escalate:")) return;

    setEscalationCase(null);
    setEscalationReason("");
    setEscalationError(null);
  }

  function buildEscalationLogbookNote(item: GovernanceCase, reason: string) {
    const evidence = closureEvidenceForCase(item);

    const schoolDetails = [
      item.tenant?.name ? `School: ${item.tenant.name}` : "",
      item.tenant?.schoolCode ? `School code: ${item.tenant.schoolCode}` : "",
      item.zone?.name ? `Circuit: ${item.zone.name}` : "",
    ].filter(Boolean);

    const caseEvidence = [
      `Case: ${item.title}`,
      `Current status: ${item.status}`,
      `Priority: ${item.priority}`,
      item.riskLevel ? `Risk level: ${item.riskLevel}` : "",
      item.riskScore !== null && item.riskScore !== undefined
        ? `Risk score: ${item.riskScore}`
        : "",
      item.dueAt
        ? `Due date: ${compactDateTime(item.dueAt) ?? item.dueAt}`
        : "",
      `Official notice sent: ${evidence.hasOfficialNotice ? "Yes" : "No"}`,
      `Acknowledgements: ${evidence.acknowledgedRecipients}`,
      `Corrective responses: ${evidence.respondedRecipients}`,
    ].filter(Boolean);

    return [
      "ESCALATION LOGBOOK ENTRY",
      "",
      "SCHOOL DETAILS",
      ...schoolDetails,
      "",
      "CASE EVIDENCE",
      ...caseEvidence,
      "",
      "ESCALATION REASON",
      `Escalation reason: ${reason.trim()}`,
    ].join("\n");
  }

  async function submitEscalationReason() {
    const item = escalationCase;
    const reason = escalationReason.trim();

    if (!item) return;

    if (reason.length < 40) {
      setEscalationError(
        "Write a fuller escalation reason. Minimum 40 characters. This should read like a supervision logbook entry.",
      );
      return;
    }

    setBusyCaseKey(`escalate:${item.id}`);
    setEscalationError(null);
    setCaseAction(null);
    setCaseError(null);

    try {
      const note = buildEscalationLogbookNote(item, reason);
      const evidence = closureEvidenceForCase(item);

      const res = await fetch("/api/governance/interventions/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          caseId: item.id,
          action: "STATUS",
          status: "ESCALATED",
          note,
          metadata: {
            source: "B6C-escalation-logbook-entry",
            escalationReason: reason,
            closureEvidence: evidence,
          },
        }),
      });

      const json = (await res
        .json()
        .catch(() => null)) as CaseWriteResponse | null;

      if (!res.ok || !json?.ok) {
        setEscalationError(
          json && !json.ok
            ? json.error
            : `Failed to escalate case (${res.status})`,
        );
        return;
      }

      setCaseAction("Case escalated with detailed logbook reason.");
      setEscalationCase(null);
      setEscalationReason("");
      await loadCases();
    } catch {
      setEscalationError("Network/server error while escalating case.");
    } finally {
      setBusyCaseKey(null);
    }
  }

  function openDirectorDirectiveDialog(item: GovernanceCase) {
    setDirectorDirectiveCase(item);
    setDirectorDirective("");
    setDirectorDirectiveError(null);
    setCaseAction(null);
    setCaseError(null);
  }

  function closeDirectorDirectiveDialog() {
    if (busyCaseKey?.startsWith("director-directive:")) return;

    setDirectorDirectiveCase(null);
    setDirectorDirective("");
    setDirectorDirectiveError(null);
  }

  function buildDirectorDirectiveNote(item: GovernanceCase, directive: string) {
    const evidence = closureEvidenceForCase(item);

    return [
      "DIRECTOR REVIEW DIRECTIVE",
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
      item.riskScore !== null && item.riskScore !== undefined
        ? `Risk score: ${item.riskScore}`
        : "",
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

  async function submitDirectorDirective() {
    const item = directorDirectiveCase;
    const directive = directorDirective.trim();

    if (!item) return;

    if (directive.length < 40) {
      setDirectorDirectiveError(
        "Write a fuller Director directive. Minimum 40 characters. This should tell the SISSO what to do next.",
      );
      return;
    }

    setBusyCaseKey(`director-directive:${item.id}`);
    setDirectorDirectiveError(null);
    setCaseAction(null);
    setCaseError(null);

    try {
      const note = buildDirectorDirectiveNote(item, directive);
      const evidence = closureEvidenceForCase(item);

      const res = await fetch("/api/governance/interventions/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          caseId: item.id,
          action: "STATUS",
          status: "IN_PROGRESS",
          note,
          metadata: {
            source: "B6D-director-escalation-directive",
            directorDirective: directive,
            closureEvidence: evidence,
          },
        }),
      });

      const json = (await res
        .json()
        .catch(() => null)) as CaseWriteResponse | null;

      if (!res.ok || !json?.ok) {
        setDirectorDirectiveError(
          json && !json.ok
            ? json.error
            : `Failed to save Director directive (${res.status})`,
        );
        return;
      }

      setCaseAction(
        "Director directive saved. Case returned to in-progress follow-up.",
      );
      setDirectorDirectiveCase(null);
      setDirectorDirective("");
      await loadCases();
    } catch {
      setDirectorDirectiveError(
        "Network/server error while saving Director directive.",
      );
    } finally {
      setBusyCaseKey(null);
    }
  }

  function openDirectiveResponseDialog(item: GovernanceCase) {
    const directiveEvent = latestDirectorDirectiveMessageEvent(item);

    if (!directiveEvent) {
      setCaseError("No Director directive found for this case yet.");
      return;
    }

    setDirectiveResponseCase(item);
    setDirectiveResponseEvent(directiveEvent);
    setDirectiveResponseBody("");
    setDirectiveResponseEvidence("");
    setDirectiveResponseError(null);
    setCaseAction(null);
    setCaseError(null);
  }

  function closeDirectiveResponseDialog() {
    if (busyCaseKey?.startsWith("directive-response:")) return;

    setDirectiveResponseCase(null);
    setDirectiveResponseEvent(null);
    setDirectiveResponseBody("");
    setDirectiveResponseEvidence("");
    setDirectiveResponseError(null);
  }

  function buildDirectiveImplementationResponseNote(args: {
    item: GovernanceCase;
    directiveEvent: GovernanceEvent;
    response: string;
    evidence: string;
  }) {
    const { item, directiveEvent, response, evidence } = args;

    return [
      "SISSO DIRECTIVE IMPLEMENTATION RESPONSE",
      "",
      "SCHOOL DETAILS",
      item.tenant?.name ? `School: ${item.tenant.name}` : "",
      item.tenant?.schoolCode ? `School code: ${item.tenant.schoolCode}` : "",
      item.zone?.name ? `Circuit: ${item.zone.name}` : "",
      "",
      "DIRECTOR DIRECTIVE",
      `Director directive event: ${directiveEvent.id}`,
      directiveEvent.createdAt
        ? `Directive issued: ${compactDateTime(directiveEvent.createdAt) ?? directiveEvent.createdAt}`
        : "",
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

  async function submitDirectiveImplementationResponse() {
    const item = directiveResponseCase;
    const directiveEvent = directiveResponseEvent;
    const response = directiveResponseBody.trim();
    const evidence = directiveResponseEvidence.trim();

    if (!item || !directiveEvent) return;

    if (response.length < 40) {
      setDirectiveResponseError(
        "Write a fuller implementation response. Minimum 40 characters. State what you actually did after receiving the Director’s directive.",
      );
      return;
    }

    setBusyCaseKey(`directive-response:${item.id}`);
    setDirectiveResponseError(null);
    setCaseAction(null);
    setCaseError(null);

    try {
      const note = buildDirectiveImplementationResponseNote({
        item,
        directiveEvent,
        response,
        evidence,
      });

      const res = await fetch("/api/governance/interventions/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          caseId: item.id,
          action: "COMMENT",
          note,
          metadata: {
            source: "B6E2-sisso-directive-implementation-response",
            directiveEventId: directiveEvent.id,
            response,
            evidence,
            closureEvidence: closureEvidenceForCase(item),
          },
        }),
      });

      const json = (await res
        .json()
        .catch(() => null)) as CaseWriteResponse | null;

      if (!res.ok || !json?.ok) {
        setDirectiveResponseError(
          json && !json.ok
            ? json.error
            : `Failed to save SISSO response (${res.status})`,
        );
        return;
      }

      setCaseAction("SISSO implementation response saved.");
      setDirectiveResponseCase(null);
      setDirectiveResponseEvent(null);
      setDirectiveResponseBody("");
      setDirectiveResponseEvidence("");
      await loadCases();
    } catch {
      setDirectiveResponseError(
        "Network/server error while saving SISSO directive response.",
      );
    } finally {
      setBusyCaseKey(null);
    }
  }

  async function sendHeadteacherNotice(item: GovernanceCase) {
    setBusyCaseKey(`notice:${item.id}`);
    setCaseAction(null);
    setCaseError(null);

    try {
      const schoolLabel =
        item.tenant?.name ?? item.title ?? "the selected school";

      const res = await fetch("/api/governance/notices/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          caseId: item.id,
          idempotencyKey: `governance-notice:case:${item.id}:official-intervention:HEADTEACHER:v1`,
          title: `Official intervention notice: ${schoolLabel}`,
          body: "EduLife OS has flagged this school for immediate supervision follow-up. Kindly review attendance capture, lesson delivery evidence, and assessment scoring evidence, then respond to the SISSO with corrective action taken.",
          priority: item.priority,
          channels: ["IN_APP", "SMS", "EMAIL"],
          targetRoles: ["HEADTEACHER"],
          metadata: {
            source: "B5A-governance-dashboard",
            caseId: item.id,
            noticeIntent: "official-intervention",
            targetAudience: "HEADTEACHER",
            idempotencyKey: `governance-notice:case:${item.id}:official-intervention:HEADTEACHER:v1`,
          },
        }),
      });

      const json = (await res
        .json()
        .catch(() => null)) as NoticeSendResponse | null;

      if (!res.ok || !json?.ok) {
        setCaseError(
          json && !json.ok
            ? json.error
            : `Failed to send notice (${res.status})`,
        );
        return;
      }

      const reused = Boolean(json.reused || json.item?.reused);

      setCaseAction(
        reused
          ? `Official notice already exists for ${schoolLabel}; no duplicate SMS/email sent.`
          : `Official notice sent for ${schoolLabel}.`,
      );

      await loadCases();
    } catch {
      setCaseError("Network/server error while sending official notice.");
    } finally {
      setBusyCaseKey(null);
    }
  }

  useEffect(() => {
    void load();
    void loadCases();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint]);

  useEffect(() => {
    if (!cases.length) return;

    for (const item of cases) {
      if (isDistrictView) {
        const escalationEvent = latestEscalationMessageEvent(item);

        if (
          escalationEvent &&
          !hasReadReceipt(
            item,
            "SISSO_ESCALATION_SEEN_BY_DIRECTOR",
            escalationEvent.id,
          )
        ) {
          void markWorkflowMessageSeen({
            caseId: item.id,
            messageEventId: escalationEvent.id,
            receiptKind: "SISSO_ESCALATION_SEEN_BY_DIRECTOR",
          });
        }
      }

      if (isCircuitView) {
        const directiveEvent = latestDirectorDirectiveMessageEvent(item);

        if (
          directiveEvent &&
          !hasReadReceipt(
            item,
            "DIRECTOR_DIRECTIVE_SEEN_BY_SISSO",
            directiveEvent.id,
          )
        ) {
          void markWorkflowMessageSeen({
            caseId: item.id,
            messageEventId: directiveEvent.id,
            receiptKind: "DIRECTOR_DIRECTIVE_SEEN_BY_SISSO",
          });
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cases, isDistrictView, isCircuitView]);

  const assignments = useMemo(() => data?.scope?.assignments ?? [], [data]);
  const schools = useMemo(() => data?.overview?.schools ?? [], [data]);
  const circuitBreakdown = useMemo(
    () => data?.overview?.circuitBreakdown ?? [],
    [data],
  );
  const interventionQueue = useMemo(
    () => data?.overview?.interventionQueue ?? [],
    [data],
  );
  const riskSummary = useMemo(() => data?.overview?.riskSummary ?? {}, [data]);
  const sectorSummary = useMemo(
    () => data?.overview?.sectorSummary ?? {},
    [data],
  );
  const totals = useMemo(() => data?.overview?.totals ?? {}, [data]);
  const signals = useMemo(() => data?.overview?.signals ?? {}, [data]);
  const emptyStates = useMemo(() => data?.overview?.emptyStates ?? [], [data]);
  const generatedAt = compactDateTime(data?.overview?.generatedAt);

  const primaryAssignment = assignments[0] ?? null;
  const activeCaseCount = cases.filter(
    (c) => c.status !== "RESOLVED" && c.status !== "CANCELLED",
  ).length;

  const totalCards = useMemo(() => {
    const preferred = isDistrictView
      ? [
          "districts",
          "circuits",
          "schools",
          "learners",
          "teachers",
          "classrooms",
        ]
      : ["circuits", "schools", "learners", "teachers", "classrooms"];

    return preferred
      .filter((key) => Object.prototype.hasOwnProperty.call(totals, key))
      .map((key) => ({
        key,
        label: formatLabel(key),
        value: numberValue(totals[key]),
      }));
  }, [totals, isDistrictView]);

  const signalCards = useMemo(() => {
    const preferred = [
      "attendanceRateToday",
      "attendanceCompletionRateToday",
      "attendanceSessionsToday",
      "attendanceMarksToday",
      "missingAttendanceMarksToday",
      "absentMarksToday",
      "lateMarksToday",
      "healthAlertsToday",
      "lessonNotesPendingReview",
      "orphanedLessonNotesLast14Days",
      "orphanedDeliveriesLast14Days",
      "lessonDeliveryComplianceRate",
      "assessmentItemsTotal",
      "assessmentItemsDraft",
      "assessmentItemsWithoutScores",
      "assessmentItemsWithoutLessonDelivery",
      "assessmentItemsWithoutCurriculumUnit",
      "assessmentCompletionRate",
      "assessmentLinkCoverageRate",
      "criticalRiskSchools",
      "highRiskSchools",
    ];

    return preferred
      .filter((key) => Object.prototype.hasOwnProperty.call(signals, key))
      .map((key) => ({
        key,
        label: formatLabel(key),
        value: formatSignalValue(key, signals[key]),
      }));
  }, [signals]);

  const topRiskSchools = useMemo(() => {
    return [...schools]
      .sort(
        (a, b) =>
          numberValue(b.metrics?.riskScore) - numberValue(a.metrics?.riskScore),
      )
      .slice(0, 5);
  }, [schools]);

  const highestRiskCircuits = useMemo(() => {
    return [...circuitBreakdown]
      .sort((a, b) => {
        const criticalDiff =
          numberValue(b.criticalRiskSchools) -
          numberValue(a.criticalRiskSchools);
        if (criticalDiff !== 0) return criticalDiff;

        const highDiff =
          numberValue(b.highRiskSchools) - numberValue(a.highRiskSchools);
        if (highDiff !== 0) return highDiff;

        return (
          numberValue(b.highestRiskScore) - numberValue(a.highestRiskScore)
        );
      })
      .slice(0, 6);
  }, [circuitBreakdown]);

  const assessmentSummary = useMemo(() => {
    return [
      {
        key: "assessmentItemsTotal",
        label: "Assessment Items",
        value: numberValue(signals.assessmentItemsTotal),
      },
      {
        key: "assessmentItemsWithoutScores",
        label: "Items Without Scores",
        value: numberValue(signals.assessmentItemsWithoutScores),
      },
      {
        key: "assessmentItemsWithoutLessonDelivery",
        label: "Items Without Delivery Link",
        value: numberValue(signals.assessmentItemsWithoutLessonDelivery),
      },
      {
        key: "orphanedLessonNotesLast14Days",
        label: "Orphaned Approved Notes",
        value: numberValue(signals.orphanedLessonNotesLast14Days),
      },
      {
        key: "assessmentCompletionRate",
        label: "Assessment Completion",
        value: percentValue(signals.assessmentCompletionRate),
      },
      {
        key: "lessonDeliveryComplianceRate",
        label: "Delivery Compliance",
        value: percentValue(signals.lessonDeliveryComplianceRate),
      },
    ];
  }, [signals]);

  function logout() {
    signOut({
      callbackUrl:
        loginMode === "governance"
          ? "/auth/signin?mode=governance"
          : "/auth/signin",
    });
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/30">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-300">
                {eyebrow}
              </p>

              <h1 className="mt-3 text-3xl font-bold tracking-tight text-white">
                {title}
              </h1>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
                {description}
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                {primaryAssignment ? (
                  <div className="inline-flex rounded-2xl border border-amber-300/25 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
                    {roleLabel(primaryAssignment.role)} ·{" "}
                    {primaryAssignment.zoneName}
                    {primaryAssignment.parentZoneName
                      ? ` · ${primaryAssignment.parentZoneName}`
                      : ""}
                  </div>
                ) : null}

                {generatedAt ? (
                  <div className="inline-flex rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">
                    Updated: {generatedAt}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  void load();
                  void loadCases();
                }}
                disabled={loading || casesLoading}
                className="h-10 rounded-xl border border-white/15 bg-white/5 px-4 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-60"
              >
                {loading || casesLoading ? "Loading..." : "Reload"}
              </button>

              <button
                type="button"
                onClick={logout}
                className="h-10 rounded-xl border border-red-300/30 bg-red-500/10 px-4 text-sm font-semibold text-red-100 hover:bg-red-500/20"
              >
                Logout
              </button>
            </div>
          </div>
        </section>

        {error ? (
          <section className="rounded-3xl border border-red-300/20 bg-red-500/10 p-5 text-sm text-red-100">
            {error}
          </section>
        ) : null}

        {escalationCase ? (
          <section className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6">
            <div className="w-full max-w-2xl rounded-3xl border border-red-300/25 bg-slate-950 p-5 shadow-2xl shadow-black/60">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-200">
                    Escalation Logbook Entry
                  </p>
                  <h2 className="mt-2 text-xl font-bold text-white">
                    Explain why this case must go to the Director
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-slate-300">
                    This reason becomes part of the official intervention event
                    history. Write it like a supervision logbook entry, not a
                    casual note.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={closeEscalationDialog}
                  disabled={busyCaseKey === `escalate:${escalationCase.id}`}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/10 disabled:opacity-50"
                >
                  Close
                </button>
              </div>

              <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-sm font-semibold text-white">
                  {escalationCase.tenant?.name ?? escalationCase.title}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  {escalationCase.tenant?.schoolCode || "No school code"} ·{" "}
                  {escalationCase.zone?.name || "No circuit"} ·{" "}
                  {escalationCase.priority} priority
                </p>
              </div>

              <label className="mt-4 block">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">
                  Reason for escalation
                </span>
                <textarea
                  value={escalationReason}
                  onChange={(event) => {
                    setEscalationReason(event.target.value);
                    setEscalationError(null);
                  }}
                  rows={7}
                  placeholder="Example: I contacted the headteacher twice and sent an official notice, but the school has still not submitted corrective evidence. Attendance capture remains incomplete and assessment records are still missing. I am escalating because the situation may affect circuit performance if not addressed immediately."
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-slate-500 focus:border-red-300/50"
                />
              </label>

              <div className="mt-2 flex items-center justify-between gap-3 text-xs text-slate-400">
                <span>{escalationReason.trim().length} characters</span>
                <span>Minimum: 40 characters</span>
              </div>

              {escalationError ? (
                <div className="mt-3 rounded-2xl border border-red-300/20 bg-red-500/10 p-3 text-sm text-red-100">
                  {escalationError}
                </div>
              ) : null}

              <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeEscalationDialog}
                  disabled={busyCaseKey === `escalate:${escalationCase.id}`}
                  className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-white/10 disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={() => void submitEscalationReason()}
                  disabled={busyCaseKey === `escalate:${escalationCase.id}`}
                  className="rounded-full border border-red-300/25 bg-red-500/15 px-4 py-2 text-sm font-semibold text-red-100 hover:bg-red-500/25 disabled:opacity-50"
                >
                  {busyCaseKey === `escalate:${escalationCase.id}`
                    ? "Escalating..."
                    : "Escalate to Director"}
                </button>
              </div>
            </div>
          </section>
        ) : null}
        {directorDirectiveCase ? (
          <section className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6">
            <div className="w-full max-w-2xl rounded-3xl border border-sky-300/25 bg-slate-950 p-5 shadow-2xl shadow-black/60">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-200">
                    Director Review Directive
                  </p>
                  <h2 className="mt-2 text-xl font-bold text-white">
                    Give official instruction for this escalated case
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-slate-300">
                    This directive will become part of the intervention evidence
                    chain and return the case to in-progress follow-up.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={closeDirectorDirectiveDialog}
                  disabled={
                    busyCaseKey ===
                    `director-directive:${directorDirectiveCase.id}`
                  }
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/10 disabled:opacity-50"
                >
                  Close
                </button>
              </div>

              <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-sm font-semibold text-white">
                  {directorDirectiveCase.tenant?.name ??
                    directorDirectiveCase.title}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  {directorDirectiveCase.tenant?.schoolCode || "No school code"}{" "}
                  · {directorDirectiveCase.zone?.name || "No circuit"} ·{" "}
                  {directorDirectiveCase.priority} priority
                </p>
              </div>

              <label className="mt-4 block">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">
                  Director directive
                </span>
                <textarea
                  value={directorDirective}
                  onChange={(event) => {
                    setDirectorDirective(event.target.value);
                    setDirectorDirectiveError(null);
                  }}
                  rows={7}
                  placeholder="Example: SISSO should visit the school within 48 hours, meet the headteacher, verify lesson note preparation and attendance punctuality records, then submit follow-up evidence by Friday noon. If no improvement is seen, prepare a formal district-level meeting with the headteacher."
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-slate-500 focus:border-sky-300/50"
                />
              </label>

              <div className="mt-2 flex items-center justify-between gap-3 text-xs text-slate-400">
                <span>{directorDirective.trim().length} characters</span>
                <span>Minimum: 40 characters</span>
              </div>

              {directorDirectiveError ? (
                <div className="mt-3 rounded-2xl border border-red-300/20 bg-red-500/10 p-3 text-sm text-red-100">
                  {directorDirectiveError}
                </div>
              ) : null}

              <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeDirectorDirectiveDialog}
                  disabled={
                    busyCaseKey ===
                    `director-directive:${directorDirectiveCase.id}`
                  }
                  className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-white/10 disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={() => void submitDirectorDirective()}
                  disabled={
                    busyCaseKey ===
                    `director-directive:${directorDirectiveCase.id}`
                  }
                  className="rounded-full border border-sky-300/25 bg-sky-500/15 px-4 py-2 text-sm font-semibold text-sky-100 hover:bg-sky-500/25 disabled:opacity-50"
                >
                  {busyCaseKey ===
                  `director-directive:${directorDirectiveCase.id}`
                    ? "Saving directive..."
                    : "Save Director directive"}
                </button>
              </div>
            </div>
          </section>
        ) : null}
        {directiveResponseCase && directiveResponseEvent ? (
          <section className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6">
            <div className="w-full max-w-2xl rounded-3xl border border-emerald-300/25 bg-slate-950 p-5 shadow-2xl shadow-black/60">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-200">
                    SISSO Implementation Response
                  </p>
                  <h2 className="mt-2 text-xl font-bold text-white">
                    Record action taken on the Director’s directive
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-slate-300">
                    This becomes part of the official case evidence chain. Write
                    what you actually did, not a vague acknowledgement.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={closeDirectiveResponseDialog}
                  disabled={
                    busyCaseKey ===
                    `directive-response:${directiveResponseCase.id}`
                  }
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/10 disabled:opacity-50"
                >
                  Close
                </button>
              </div>

              <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-sm font-semibold text-white">
                  {directiveResponseCase.tenant?.name ??
                    directiveResponseCase.title}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  {directiveResponseCase.tenant?.schoolCode || "No school code"}{" "}
                  · {directiveResponseCase.zone?.name || "No circuit"} ·
                  Directive {directiveResponseEvent.id.slice(0, 10)}…
                </p>
              </div>

              <label className="mt-4 block">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">
                  Action taken
                </span>
                <textarea
                  value={directiveResponseBody}
                  onChange={(event) => {
                    setDirectiveResponseBody(event.target.value);
                    setDirectiveResponseError(null);
                  }}
                  rows={6}
                  placeholder="Example: I visited the school on Thursday morning, met the headteacher and staff, reviewed the lesson note book, checked attendance punctuality records, and instructed the headteacher to submit corrective evidence by Friday noon."
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-slate-500 focus:border-emerald-300/50"
                />
              </label>

              <div className="mt-2 flex items-center justify-between gap-3 text-xs text-slate-400">
                <span>{directiveResponseBody.trim().length} characters</span>
                <span>Minimum: 40 characters</span>
              </div>

              <label className="mt-4 block">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">
                  Evidence / next action
                </span>
                <textarea
                  value={directiveResponseEvidence}
                  onChange={(event) =>
                    setDirectiveResponseEvidence(event.target.value)
                  }
                  rows={4}
                  placeholder="Example: Lesson note register checked. Attendance record for the week reviewed. I will revisit in two weeks if performance does not improve."
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-slate-500 focus:border-emerald-300/50"
                />
              </label>

              {directiveResponseError ? (
                <div className="mt-3 rounded-2xl border border-red-300/20 bg-red-500/10 p-3 text-sm text-red-100">
                  {directiveResponseError}
                </div>
              ) : null}

              <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeDirectiveResponseDialog}
                  disabled={
                    busyCaseKey ===
                    `directive-response:${directiveResponseCase.id}`
                  }
                  className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-white/10 disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={() => void submitDirectiveImplementationResponse()}
                  disabled={
                    busyCaseKey ===
                    `directive-response:${directiveResponseCase.id}`
                  }
                  className="rounded-full border border-emerald-300/25 bg-emerald-400/15 px-4 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-400/25 disabled:opacity-50"
                >
                  {busyCaseKey ===
                  `directive-response:${directiveResponseCase.id}`
                    ? "Saving response..."
                    : "Save implementation response"}
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {isGovernanceLogbookOpen ? (
          <section className="fixed inset-0 z-50 overflow-y-auto bg-black/75 px-4 py-6">
            <div className="mx-auto w-full max-w-7xl rounded-3xl border border-sky-300/25 bg-slate-950 p-5 shadow-2xl shadow-black/70">
              <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-200">
                    Governance Logbook
                  </p>
                  <h2 className="mt-2 text-2xl font-bold text-white">
                    {isDistrictView
                      ? "District intervention evidence timeline"
                      : "Circuit intervention evidence timeline"}
                  </h2>
                  <p className="mt-1 max-w-4xl text-sm leading-6 text-sky-100/80">
                    {isDistrictView
                      ? "Role-aware district view: this logbook uses only the intervention cases already returned for your authorized district scope. It does not expose cases outside the Director’s assigned district."
                      : "Role-aware circuit view: this logbook uses only the intervention cases already returned for your authorized circuit scope. It does not expose another SISSO’s circuit cases."}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setIsGovernanceLogbookOpen(false)}
                  className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-white/10"
                >
                  Close logbook
                </button>
              </div>

              <GovernanceAuditLogbookPanel
                cases={cases}
                title={
                  isDistrictView
                    ? "District intervention evidence timeline"
                    : "Circuit intervention evidence timeline"
                }
                description={
                  isDistrictView
                    ? "A referenceable record of cases, notices, acknowledgements, responses, escalations, Director directives, SISSO responses, and closure evidence across your authorized district scope."
                    : "A referenceable supervision record for cases, official notices, acknowledgements, corrective responses, escalations, Director directives, SISSO responses, and closure evidence inside your authorized circuit scope."
                }
              />
            </div>
          </section>
        ) : null}

        <OfficialGovernanceNoticeComposer
          isDistrictView={isDistrictView}
          isCircuitView={isCircuitView}
          assignments={assignments}
          schools={schools}
        />

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          {totalCards.length ? (
            totalCards.map((c) => (
              <div
                key={c.key}
                className="rounded-2xl border border-white/10 bg-white/[0.04] p-5"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                  {c.label}
                </p>
                <p className="mt-2 text-3xl font-bold text-white">{c.value}</p>
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 text-sm text-slate-300">
              {loading ? "Loading totals..." : "No totals available yet."}
            </div>
          )}
        </section>

        <section className="rounded-3xl border border-purple-300/20 bg-purple-500/10 p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-purple-200">
                Sector-aware governance boundary
              </p>
              <h2 className="mt-2 text-xl font-bold text-white">
                Public and private schools are separated
              </h2>
              <p className="mt-1 max-w-4xl text-sm leading-6 text-purple-100/80">
                {sectorSummary.governanceRule ||
                  "Public schools are normal governance targets. Private schools must be distinguished and included only where authorized."}
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-xs leading-5 text-slate-200">
              Default command posture:{" "}
              <span className="font-bold text-white">Public schools first</span>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricPill
              label="Public schools"
              value={numberValue(sectorSummary.public?.schools)}
              tone="success"
            />
            <MetricPill
              label="Public critical"
              value={numberValue(sectorSummary.public?.criticalRiskSchools)}
              tone={
                numberValue(sectorSummary.public?.criticalRiskSchools)
                  ? "danger"
                  : "success"
              }
            />
            <MetricPill
              label="Private schools"
              value={numberValue(sectorSummary.private?.schools)}
              tone="warning"
            />
            <MetricPill
              label="Private critical"
              value={numberValue(sectorSummary.private?.criticalRiskSchools)}
              tone={
                numberValue(sectorSummary.private?.criticalRiskSchools)
                  ? "danger"
                  : "success"
              }
            />
          </div>
        </section>

        {isDistrictView ? <DistrictCaseCommandPanel cases={cases} /> : null}
        {isDistrictView ? (
          <DistrictCaseActionQueue
            cases={cases}
            onOpenDirectorDirective={openDirectorDirectiveDialog}
          />
        ) : null}
        {cases.length ? (
          <section className="rounded-3xl border border-sky-300/20 bg-sky-500/10 p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-200">
                  Governance Logbook
                </p>
                <h2 className="mt-2 text-xl font-bold text-white">
                  {isDistrictView
                    ? "District intervention logbook"
                    : "Circuit intervention logbook"}
                </h2>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-sky-100/80">
                  {isDistrictView
                    ? "Open only when you need the full reference record of cases, notices, acknowledgements, responses, escalations, Director directives, SISSO responses, and closure evidence across your authorized district."
                    : "Open only when you need the full reference record of cases, notices, acknowledgements, responses, escalations, Director directives, SISSO responses, and closure evidence inside your authorized circuit."}
                </p>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <span className="rounded-full border border-white/10 bg-slate-950/40 px-4 py-2 text-xs font-semibold text-slate-200">
                  {cases.length} scoped case(s)
                </span>

                <button
                  type="button"
                  onClick={() => setIsGovernanceLogbookOpen(true)}
                  className="rounded-full border border-sky-300/25 bg-sky-500/15 px-5 py-2 text-sm font-semibold text-sky-100 hover:bg-sky-500/25"
                >
                  Open logbook
                </button>
              </div>
            </div>
          </section>
        ) : null}
        {isDistrictView ? (
          <section className="rounded-3xl border border-red-300/20 bg-red-500/10 p-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-200">
                  District Command View
                </p>
                <h2 className="mt-2 text-xl font-bold text-white">
                  Highest-risk circuits first
                </h2>
                <p className="mt-1 text-sm leading-6 text-red-100/80">
                  Director-level action should flow through the SISSO or Circuit
                  Supervisor, then down to schools.
                </p>
              </div>
              <p className="text-xs text-red-100/70">
                {highestRiskCircuits.length} circuit(s) in scope
              </p>
            </div>

            <div className="mt-5 space-y-4">
              {loading ? (
                <div className="text-sm text-red-100">
                  Loading circuit priorities...
                </div>
              ) : highestRiskCircuits.length ? (
                highestRiskCircuits.map((circuit, idx) => (
                  <div
                    key={circuit.circuitId}
                    className="rounded-2xl border border-white/10 bg-slate-950/50 p-4"
                  >
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-200">
                            #{idx + 1}
                          </span>
                          <span className="rounded-full border border-red-300/30 bg-red-500/15 px-3 py-1 text-xs font-semibold text-red-100">
                            Highest risk {numberValue(circuit.highestRiskScore)}
                          </span>
                          <span className="rounded-full border border-orange-300/30 bg-orange-500/10 px-3 py-1 text-xs font-semibold text-orange-100">
                            Critical {numberValue(circuit.criticalRiskSchools)}{" "}
                            · High {numberValue(circuit.highRiskSchools)}
                          </span>
                        </div>

                        <p className="mt-3 text-lg font-bold text-white">
                          {circuit.circuitName}
                        </p>
                        <p className="mt-1 text-sm text-slate-300">
                          {circuit.schools} school(s) · Public{" "}
                          {numberValue(circuit.publicSchools)} · Private{" "}
                          {numberValue(circuit.privateSchools)} ·{" "}
                          {circuit.learners} learners · {circuit.teachers}{" "}
                          teachers
                        </p>
                      </div>

                      <div className="grid gap-2 text-xs sm:grid-cols-2 xl:min-w-[520px]">
                        <MetricPill
                          label="Attendance completion"
                          value={percentValue(
                            circuit.attendanceCompletionRateToday,
                          )}
                          tone={
                            numberValue(circuit.attendanceCompletionRateToday) <
                            75
                              ? "danger"
                              : "success"
                          }
                        />
                        <MetricPill
                          label="Lesson compliance"
                          value={percentValue(
                            circuit.lessonDeliveryComplianceRate,
                          )}
                          tone={
                            numberValue(circuit.lessonDeliveryComplianceRate) <
                            70
                              ? "danger"
                              : "success"
                          }
                        />
                        <MetricPill
                          label="Assessment scoring"
                          value={percentValue(circuit.assessmentCompletionRate)}
                          tone={
                            numberValue(circuit.assessmentCompletionRate) < 60
                              ? "danger"
                              : "success"
                          }
                        />
                        <MetricPill
                          label="Assessment link coverage"
                          value={percentValue(
                            circuit.assessmentLinkCoverageRate,
                          )}
                          tone={
                            numberValue(circuit.assessmentLinkCoverageRate) < 70
                              ? "warning"
                              : "success"
                          }
                        />
                        <MetricPill
                          label="Orphan notes"
                          value={numberValue(
                            circuit.orphanedLessonNotesLast14Days,
                          )}
                          tone={
                            numberValue(circuit.orphanedLessonNotesLast14Days)
                              ? "danger"
                              : "success"
                          }
                        />
                        <MetricPill
                          label="No-score items"
                          value={numberValue(
                            circuit.assessmentItemsWithoutScores,
                          )}
                          tone={
                            numberValue(circuit.assessmentItemsWithoutScores)
                              ? "danger"
                              : "success"
                          }
                        />
                      </div>
                    </div>

                    <div className="mt-4 grid gap-4 lg:grid-cols-2">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                          Director action
                        </p>
                        <ul className="mt-2 space-y-2 text-sm text-slate-200">
                          {(circuit.directorRecommendedActions ?? [])
                            .slice(0, 3)
                            .map((action) => (
                              <li key={action} className="flex gap-2">
                                <span className="mt-2 h-2 w-2 rounded-full bg-emerald-300" />
                                <span>{action}</span>
                              </li>
                            ))}
                        </ul>
                      </div>

                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                          Schools driving this circuit risk
                        </p>
                        <div className="mt-2 space-y-2">
                          {(circuit.schoolsDrivingRisk ?? [])
                            .slice(0, 3)
                            .map((school) => (
                              <div
                                key={school.schoolId}
                                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <p className="text-sm font-semibold text-white">
                                    {school.schoolName}
                                  </p>
                                  <span
                                    className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${riskBadgeClass(school.riskLevel)}`}
                                  >
                                    {school.riskLevel} · {school.riskScore}
                                  </span>
                                </div>
                                <p className="mt-1 text-xs text-slate-300">
                                  {school.reasons[0] ?? "No reason provided."}
                                </p>
                              </div>
                            ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-emerald-300/20 bg-emerald-400/10 p-4 text-sm text-emerald-100">
                  No high-risk circuit detected from current signals.
                </div>
              )}
            </div>
          </section>
        ) : null}

        {!isDistrictView ? (
          <section className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
            <div className="rounded-3xl border border-red-300/20 bg-red-500/10 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-200">
                Intervention Command Centre
              </p>
              <h2 className="mt-2 text-xl font-bold text-white">
                Schools needing attention first
              </h2>
              <p className="mt-1 text-sm leading-6 text-red-100/80">
                This is the SISSO supervision queue. It turns raw school data
                into action priorities.
              </p>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <MetricPill
                  label="Critical schools"
                  value={numberValue(riskSummary.critical)}
                  tone="danger"
                />
                <MetricPill
                  label="High risk schools"
                  value={numberValue(riskSummary.high)}
                  tone="warning"
                />
                <MetricPill
                  label="Medium risk"
                  value={numberValue(riskSummary.medium)}
                  tone="warning"
                />
                <MetricPill
                  label="Highest score"
                  value={numberValue(riskSummary.highestRiskScore)}
                />
              </div>

              {riskSummary.highestRiskSchool ? (
                <div className="mt-4 rounded-2xl border border-red-300/20 bg-red-500/10 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-200">
                    Highest Risk School
                  </p>
                  <p className="mt-2 font-bold text-white">
                    {riskSummary.highestRiskSchool.name}
                  </p>
                  <p className="mt-1 text-sm text-red-100">
                    {riskSummary.highestRiskSchool.riskLevel} · Score{" "}
                    {riskSummary.highestRiskSchool.riskScore}
                  </p>
                </div>
              ) : null}
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
              <SectionHeading
                title="Intervention Queue"
                description="The first schools the SISSO should call, visit, or follow up."
              />

              <div className="mt-5 space-y-3">
                {loading ? (
                  <div className="text-sm text-slate-300">
                    Loading intervention queue...
                  </div>
                ) : interventionQueue.length ? (
                  interventionQueue.slice(0, 5).map((item, idx) => (
                    <div
                      key={`${item.schoolId}-${idx}`}
                      className="rounded-2xl border border-white/10 bg-slate-950/50 p-4"
                    >
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-200">
                              #{idx + 1}
                            </span>
                            <span
                              className={`rounded-full border px-3 py-1 text-xs font-semibold ${riskBadgeClass(item.riskLevel)}`}
                            >
                              {item.riskLevel} · {item.riskScore}
                            </span>
                          </div>

                          <p className="mt-3 font-bold text-white">
                            {item.schoolName}
                          </p>
                          <p className="mt-1 text-xs text-slate-400">
                            {item.schoolCode || "No school code"} ·{" "}
                            {schoolSectorLabel(item.schoolSector)} ·{" "}
                            {item.circuitName}
                            {item.districtName ? ` · ${item.districtName}` : ""}
                          </p>
                        </div>

                        <div className="grid gap-2 text-xs text-slate-300 sm:grid-cols-3">
                          <MetricPill
                            label="Attendance"
                            value={percentValue(
                              item.metrics?.attendanceCompletionRateToday,
                            )}
                            tone={
                              numberValue(
                                item.metrics?.attendanceCompletionRateToday,
                              ) < 75
                                ? "danger"
                                : "success"
                            }
                          />
                          <MetricPill
                            label="Assessment"
                            value={percentValue(
                              item.metrics?.assessmentCompletionRate,
                            )}
                            tone={
                              numberValue(
                                item.metrics?.assessmentCompletionRate,
                              ) < 60
                                ? "danger"
                                : "success"
                            }
                          />
                          <MetricPill
                            label="Orphan notes"
                            value={numberValue(
                              item.metrics?.orphanedLessonNotesLast14Days,
                            )}
                            tone={
                              numberValue(
                                item.metrics?.orphanedLessonNotesLast14Days,
                              )
                                ? "danger"
                                : "success"
                            }
                          />
                        </div>
                      </div>

                      <div className="mt-4 grid gap-3 lg:grid-cols-2">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                            Why flagged
                          </p>
                          <ul className="mt-2 space-y-2 text-sm text-slate-200">
                            {item.reasons.slice(0, 5).map((reason) => (
                              <li key={reason} className="flex gap-2">
                                <span
                                  className={`mt-2 h-2 w-2 rounded-full ${riskDotClass(item.riskLevel)}`}
                                />
                                <span>{reason}</span>
                              </li>
                            ))}
                          </ul>
                        </div>

                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                            SISSO recommended action
                          </p>
                          <ul className="mt-2 space-y-2 text-sm text-slate-200">
                            {item.recommendedActions
                              .slice(0, 5)
                              .map((action) => (
                                <li key={action} className="flex gap-2">
                                  <span className="mt-2 h-2 w-2 rounded-full bg-emerald-300" />
                                  <span>{action}</span>
                                </li>
                              ))}
                          </ul>
                        </div>
                      </div>

                      <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                        {(() => {
                          const existingCase = activeCaseForSchool(
                            item.schoolId,
                          );

                          return existingCase ? (
                            <div className="space-y-3">
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-200">
                                    Active intervention case
                                  </p>
                                  <p className="mt-1 text-sm font-semibold text-white">
                                    {existingCase.status.replaceAll("_", " ")} ·{" "}
                                    {existingCase.priority}
                                  </p>
                                  <p className="mt-1 text-xs text-slate-400">
                                    Case ID: {existingCase.id.slice(0, 10)}… ·
                                    Notices: {existingCase.notices?.length ?? 0}
                                  </p>
                                </div>

                                <button
                                  type="button"
                                  onClick={() =>
                                    void sendHeadteacherNotice(existingCase)
                                  }
                                  disabled={
                                    busyCaseKey === `notice:${existingCase.id}`
                                  }
                                  className="rounded-full border border-amber-300/30 bg-amber-400/10 px-4 py-2 text-xs font-semibold text-amber-100 hover:bg-amber-400/15 disabled:opacity-60"
                                >
                                  {busyCaseKey === `notice:${existingCase.id}`
                                    ? "Sending..."
                                    : "Send official notice"}
                                </button>
                              </div>
                              <CaseClosureEvidencePanel item={existingCase} />

                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() =>
                                    void updateCaseStatus(
                                      existingCase,
                                      "IN_PROGRESS",
                                      "SISSO has started follow-up from the governance dashboard.",
                                    )
                                  }
                                  disabled={
                                    existingCase.status === "IN_PROGRESS" ||
                                    busyCaseKey ===
                                      `status:${existingCase.id}:IN_PROGRESS`
                                  }
                                  className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-[11px] font-semibold text-slate-100 hover:bg-white/10 disabled:opacity-50"
                                >
                                  Mark in progress
                                </button>

                                <button
                                  type="button"
                                  onClick={() =>
                                    openEscalationDialog(existingCase)
                                  }
                                  disabled={
                                    busyCaseKey ===
                                      `status:${existingCase.id}:ESCALATED` ||
                                    busyCaseKey ===
                                      `escalate:${existingCase.id}`
                                  }
                                  className="rounded-full border border-red-300/25 bg-red-500/10 px-3 py-2 text-[11px] font-semibold text-red-100 hover:bg-red-500/15 disabled:opacity-50"
                                >
                                  Escalate with reason
                                </button>

                                <button
                                  type="button"
                                  onClick={() =>
                                    void updateCaseStatus(
                                      existingCase,
                                      "RESOLVED",
                                      "Case marked resolved from the governance dashboard after follow-up.",
                                    )
                                  }
                                  disabled={
                                    !closureEvidenceForCase(existingCase)
                                      .canResolve ||
                                    busyCaseKey ===
                                      `status:${existingCase.id}:RESOLVED`
                                  }
                                  className="rounded-full border border-emerald-300/25 bg-emerald-400/10 px-3 py-2 text-[11px] font-semibold text-emerald-100 hover:bg-emerald-400/15 disabled:opacity-50"
                                >
                                  {closureEvidenceForCase(existingCase)
                                    .canResolve
                                    ? "Resolve with evidence"
                                    : "Awaiting response"}
                                </button>
                              </div>

                              {(() => {
                                const latestEvent =
                                  latestMeaningfulEvent(existingCase);

                                if (!latestEvent) return null;

                                const note = eventNote(latestEvent);

                                if (
                                  eventNoteHasMarker(
                                    latestEvent,
                                    SISSO_IMPLEMENTATION_RESPONSE_MARKER,
                                  )
                                ) {
                                  return (
                                    <DirectiveImplementationResponseCard
                                      note={note}
                                    />
                                  );
                                }

                                if (
                                  eventNoteHasMarker(
                                    latestEvent,
                                    DIRECTOR_DIRECTIVE_MARKER,
                                  )
                                ) {
                                  const alreadyResponded =
                                    latestSissoDirectiveResponseEvent(
                                      existingCase,
                                      latestEvent,
                                    );

                                  return (
                                    <div className="space-y-3">
                                      <DirectorDirectiveCard
                                        note={note}
                                        receiptState={directiveReceiptState(
                                          existingCase,
                                          latestEvent,
                                        )}
                                      />

                                      {!alreadyResponded ? (
                                        <div className="rounded-xl border border-emerald-300/15 bg-emerald-400/10 p-3">
                                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                            <div>
                                              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-200">
                                                Director follow-up required
                                              </p>
                                              <p className="mt-1 text-xs leading-5 text-emerald-100/80">
                                                Record what you did after
                                                receiving this directive.
                                              </p>
                                            </div>

                                            <button
                                              type="button"
                                              onClick={() =>
                                                openDirectiveResponseDialog(
                                                  existingCase,
                                                )
                                              }
                                              disabled={
                                                busyCaseKey ===
                                                `directive-response:${existingCase.id}`
                                              }
                                              className="rounded-full border border-emerald-300/25 bg-emerald-400/15 px-4 py-2 text-xs font-semibold text-emerald-100 hover:bg-emerald-400/25 disabled:opacity-50"
                                            >
                                              Respond to Director directive
                                            </button>
                                          </div>
                                        </div>
                                      ) : null}
                                    </div>
                                  );
                                }

                                if (
                                  eventNoteHasMarker(
                                    latestEvent,
                                    ESCALATION_LOGBOOK_MARKER,
                                  )
                                ) {
                                  return (
                                    <EscalationLogbookCard
                                      note={note}
                                      receiptState={escalationReceiptState(
                                        existingCase,
                                        latestEvent,
                                      )}
                                    />
                                  );
                                }

                                return (
                                  <p className="text-xs leading-5 text-slate-400">
                                    Latest evidence:{" "}
                                    {latestEvent.eventType.replaceAll("_", " ")}
                                    {latestEvent.note
                                      ? ` — ${latestEvent.note}`
                                      : ""}
                                  </p>
                                );
                              })()}
                              <GovernanceCaseAuditLogbookCard
                                item={existingCase}
                              />
                            </div>
                          ) : (
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                                  No active case yet
                                </p>
                                <p className="mt-1 text-sm text-slate-300">
                                  Open a formal intervention case before sending
                                  official notices.
                                </p>
                              </div>

                              <button
                                type="button"
                                onClick={() => void openCaseFromQueue(item)}
                                disabled={
                                  busyCaseKey === `open:${item.schoolId}`
                                }
                                className="rounded-full border border-emerald-300/25 bg-emerald-400/10 px-4 py-2 text-xs font-semibold text-emerald-100 hover:bg-emerald-400/15 disabled:opacity-60"
                              >
                                {busyCaseKey === `open:${item.schoolId}`
                                  ? "Opening..."
                                  : "Open case"}
                              </button>
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-emerald-300/20 bg-emerald-400/10 p-4 text-sm text-emerald-100">
                    No urgent intervention item detected from current signals.
                  </div>
                )}
              </div>
            </div>
          </section>
        ) : null}

        <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
            <SectionHeading
              title={
                isDistrictView
                  ? "Circuit Risk Breakdown"
                  : "Schools in This Circuit"
              }
              description={
                isDistrictView
                  ? "Circuits are sorted by risk so the Director knows which SISSO/Circuit Supervisor to follow up first."
                  : "Only schools inside this officer’s authorized circuit should appear here."
              }
            />

            <div className="mt-5 space-y-3">
              {loading ? (
                <div className="text-sm text-slate-300">Loading...</div>
              ) : isDistrictView && circuitBreakdown.length ? (
                circuitBreakdown.map((row) => (
                  <div
                    key={row.circuitId}
                    className="rounded-2xl border border-white/10 bg-slate-950/50 p-4"
                  >
                    <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                      <div>
                        <p className="font-semibold text-white">
                          {row.circuitName}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">
                          {row.schools} school(s) · {row.learners} learners ·{" "}
                          {row.teachers} teachers
                        </p>
                        <p className="mt-2 text-xs text-slate-300">
                          Present today: {row.presentMarksToday}/
                          {row.attendanceMarksToday} (
                          {pct(row.presentMarksToday, row.attendanceMarksToday)}
                          )
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs text-slate-300 md:grid-cols-4">
                        <MetricPill
                          label="Critical"
                          value={numberValue(row.criticalRiskSchools)}
                          tone="danger"
                        />
                        <MetricPill
                          label="High"
                          value={numberValue(row.highRiskSchools)}
                          tone="warning"
                        />
                        <MetricPill
                          label="Completion"
                          value={percentValue(
                            row.attendanceCompletionRateToday,
                          )}
                        />
                        <MetricPill
                          label="Highest risk"
                          value={numberValue(row.highestRiskScore)}
                        />
                        <MetricPill
                          label="No-score items"
                          value={numberValue(row.assessmentItemsWithoutScores)}
                          tone={
                            numberValue(row.assessmentItemsWithoutScores)
                              ? "danger"
                              : "success"
                          }
                        />
                        <MetricPill
                          label="No delivery link"
                          value={numberValue(
                            row.assessmentItemsWithoutLessonDelivery,
                          )}
                          tone={
                            numberValue(
                              row.assessmentItemsWithoutLessonDelivery,
                            )
                              ? "warning"
                              : "success"
                          }
                        />
                        <MetricPill
                          label="Orphan notes"
                          value={numberValue(row.orphanedLessonNotesLast14Days)}
                          tone={
                            numberValue(row.orphanedLessonNotesLast14Days)
                              ? "danger"
                              : "success"
                          }
                        />
                        <MetricPill
                          label="Delivery compliance"
                          value={percentValue(row.lessonDeliveryComplianceRate)}
                          tone={
                            numberValue(row.lessonDeliveryComplianceRate) < 70
                              ? "danger"
                              : "success"
                          }
                        />
                      </div>
                    </div>
                  </div>
                ))
              ) : schools.length ? (
                schools.map((school) => {
                  const m = school.metrics ?? {};
                  const riskLevel = String(m.riskLevel ?? "LOW");
                  return (
                    <div
                      key={school.id}
                      className="rounded-2xl border border-white/10 bg-slate-950/50 p-4"
                    >
                      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold text-white">
                              {school.name}
                            </p>
                            <span
                              className={`rounded-full border px-3 py-1 text-xs font-semibold ${riskBadgeClass(riskLevel)}`}
                            >
                              {riskLevel} · {numberValue(m.riskScore)}
                            </span>
                          </div>

                          <p className="mt-1 text-xs text-slate-400">
                            {school.schoolCode || "No school code"} ·{" "}
                            {school.status} ·{" "}
                            {schoolSectorLabel(school.schoolSector)}
                          </p>
                          <p className="mt-2 text-xs text-slate-300">
                            Circuit: {school.circuit?.name || "—"} · District:{" "}
                            {school.district?.name || "—"}
                          </p>

                          {m.riskReasons?.length ? (
                            <p className="mt-3 text-sm text-slate-200">
                              <span className="font-semibold text-amber-200">
                                Main reason:
                              </span>{" "}
                              {m.riskReasons[0]}
                            </p>
                          ) : null}
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-xs text-slate-300 md:grid-cols-4">
                          <MetricPill
                            label="Learners"
                            value={numberValue(m.learners)}
                          />
                          <MetricPill
                            label="Teachers"
                            value={numberValue(m.teachers)}
                          />
                          <MetricPill
                            label="Attendance"
                            value={percentValue(m.attendanceRateToday)}
                          />
                          <MetricPill
                            label="Completion"
                            value={percentValue(
                              m.attendanceCompletionRateToday,
                            )}
                          />
                          <MetricPill
                            label="Missing"
                            value={numberValue(m.missingAttendanceMarksToday)}
                            tone={
                              numberValue(m.missingAttendanceMarksToday)
                                ? "warning"
                                : "success"
                            }
                          />
                          <MetricPill
                            label="Alerts"
                            value={numberValue(m.healthAlertsToday)}
                            tone={
                              numberValue(m.healthAlertsToday)
                                ? "danger"
                                : "success"
                            }
                          />
                          <MetricPill
                            label="Pending notes"
                            value={numberValue(m.lessonNotesPendingReview)}
                            tone={
                              numberValue(m.lessonNotesPendingReview)
                                ? "warning"
                                : "success"
                            }
                          />
                          <MetricPill
                            label="Assessments"
                            value={numberValue(m.assessmentItemsTotal)}
                          />
                        </div>
                      </div>

                      <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                          Assessment & lesson-delivery integrity
                        </p>
                        <AssessmentIntegrityGrid metrics={m} />
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4 text-sm text-slate-300">
                  No schools found in this jurisdiction.
                </div>
              )}
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
              <SectionHeading
                title="Assessment & Lesson Integrity"
                description="Shows whether teachers are connecting curriculum, approved lesson notes, lesson delivery, assessments, and scores."
              />

              <div className="mt-5 grid gap-3">
                {assessmentSummary.map((item) => (
                  <div
                    key={item.key}
                    className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3"
                  >
                    <span className="text-sm text-slate-300">{item.label}</span>
                    <span className="text-lg font-bold text-white">
                      {item.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
              <SectionHeading
                title="Live Signals"
                description="Early oversight signals from attendance, health, assessment, lesson delivery, and risk scoring."
              />

              <div className="mt-5 grid gap-3">
                {loading ? (
                  <div className="text-sm text-slate-300">
                    Loading signals...
                  </div>
                ) : signalCards.length ? (
                  signalCards.map((s) => (
                    <div
                      key={s.key}
                      className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3"
                    >
                      <span className="text-sm text-slate-300">{s.label}</span>
                      <span className="text-lg font-bold text-white">
                        {s.value}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4 text-sm text-slate-300">
                    No signals available yet.
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
              <SectionHeading
                title="Top Risk Schools"
                description="Quick ranking for supervision planning."
              />

              <div className="mt-5 space-y-3">
                {topRiskSchools.length ? (
                  topRiskSchools.map((school, idx) => {
                    const m = school.metrics ?? {};
                    const riskLevel = String(m.riskLevel ?? "LOW");

                    return (
                      <div
                        key={school.id}
                        className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3"
                      >
                        <div>
                          <p className="text-sm font-semibold text-white">
                            {idx + 1}. {school.name}
                          </p>
                          <p className="mt-1 text-xs text-slate-400">
                            {school.circuit?.name || "No circuit"} ·{" "}
                            {school.schoolCode || "No code"}
                          </p>
                        </div>
                        <span
                          className={`rounded-full border px-3 py-1 text-xs font-semibold ${riskBadgeClass(riskLevel)}`}
                        >
                          {numberValue(m.riskScore)}
                        </span>
                      </div>
                    );
                  })
                ) : (
                  <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4 text-sm text-slate-300">
                    No schools available for ranking.
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
              <SectionHeading
                title="Launch-Safe Notes"
                description="These notes explain zero values without making the system look broken."
              />

              <div className="mt-5 space-y-3">
                {loading ? (
                  <div className="text-sm text-slate-300">Loading notes...</div>
                ) : emptyStates.length ? (
                  emptyStates.map((note) => (
                    <div
                      key={note}
                      className="rounded-2xl border border-amber-300/15 bg-amber-300/10 px-4 py-3 text-sm text-amber-100"
                    >
                      {note}
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-emerald-300/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
                    All primary oversight signals have data.
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {isDistrictView ? (
          <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
            <SectionHeading
              title="Schools in District Scope"
              description="School-level evidence is visible to the Director, but Director action should be routed through the responsible SISSO/Circuit Supervisor."
            />

            <div className="mt-5 grid gap-3 lg:grid-cols-2">
              {schools.length ? (
                schools.map((school) => {
                  const m = school.metrics ?? {};
                  const riskLevel = String(m.riskLevel ?? "LOW");

                  return (
                    <div
                      key={school.id}
                      className="rounded-2xl border border-white/10 bg-slate-950/50 p-4"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-white">
                          {school.name}
                        </p>
                        <span
                          className={`rounded-full border px-3 py-1 text-xs font-semibold ${schoolSectorBadgeClass(school.schoolSector)}`}
                        >
                          {schoolSectorLabel(school.schoolSector)}
                        </span>
                        <span
                          className={`rounded-full border px-3 py-1 text-xs font-semibold ${riskBadgeClass(riskLevel)}`}
                        >
                          {riskLevel} · {numberValue(m.riskScore)}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-400">
                        {school.schoolCode || "No school code"} ·{" "}
                        {school.circuit?.name || "No circuit"}
                      </p>
                      {m.riskReasons?.[0] ? (
                        <p className="mt-3 text-sm text-slate-200">
                          <span className="font-semibold text-amber-200">
                            Evidence:
                          </span>{" "}
                          {m.riskReasons[0]}
                        </p>
                      ) : null}
                    </div>
                  );
                })
              ) : (
                <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4 text-sm text-slate-300">
                  No schools found.
                </div>
              )}
            </div>
          </section>
        ) : null}

        {isCircuitView ? (
          <section className="rounded-3xl border border-emerald-300/20 bg-emerald-400/10 p-5 text-sm text-emerald-100">
            This is a read-only supervision dashboard. Officers can see risk and
            evidence, but they cannot edit school records from this view.
          </section>
        ) : null}
      </div>
    </main>
  );
}
