// src/components/governance/GovernanceDashboardClient.tsx
"use client";

import { signOut } from "next-auth/react";
import { useEffect, useMemo, useState } from "react";

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

function roleLabel(role: string) {
  if (role === "SISSO") return "SISSO";
  if (role === "CIRCUIT_SUPERVISOR") return "Circuit Supervisor";
  if (role === "DISTRICT_DIRECTOR") return "District Director";
  if (role === "DISTRICT_MIS_OFFICER") return "District MIS/Data Officer";
  if (role === "DISTRICT_SHEP_OFFICER") return "District SHEP/Health Officer";
  if (role === "DISTRICT_ASSESSMENT_OFFICER") return "District Assessment Officer";
  return role.replaceAll("_", " ");
}

function riskBadgeClass(level?: string) {
  if (level === "CRITICAL") return "border-red-300/30 bg-red-500/15 text-red-100";
  if (level === "HIGH") return "border-orange-300/30 bg-orange-500/15 text-orange-100";
  if (level === "MEDIUM") return "border-amber-300/30 bg-amber-400/15 text-amber-100";
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
    }))
  );

  const acknowledgedRecipients = recipients.filter(({ recipient }) =>
    Boolean(recipient.acknowledgedAt)
  );

  const respondedRecipients = recipients.filter(
    ({ recipient }) =>
      Boolean(recipient.respondedAt) && Boolean(recipient.responseBody)
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
    evidence.latestResponseBy ? `Respondent: ${evidence.latestResponseBy}.` : "",
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
    (item) => !closureEvidenceForCase(item).hasOfficialNotice
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
    (item) => closureEvidenceForCase(item).hasCorrectiveResponse
  );

  const overdueCases = activeCases.filter(isOverdueIntervention);
  const escalatedCases = cases.filter((item) => item.status === "ESCALATED");

  const criticalCases = activeCases.filter(
    (item) => item.priority === "CRITICAL" || item.riskLevel === "CRITICAL"
  );

  const highCases = activeCases.filter(
    (item) => item.priority === "HIGH" || item.riskLevel === "HIGH"
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
      item.zone?.name ??
      item.tenant?.name ??
      "Unassigned circuit / school";

    const existing =
      circuitMap.get(key) ??
      {
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
    if (!isClosedCase(item) && evidence.hasOfficialNotice && !evidence.hasCorrectiveResponse) {
      existing.awaitingResponse += 1;
    }
    if (item.status === "RESOLVED" && evidence.hasCorrectiveResponse) {
      existing.resolvedWithEvidence += 1;
    }

    existing.highestRiskScore = Math.max(
      existing.highestRiskScore,
      numberValue(item.riskScore)
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
          100
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
            This tells the Director whether supervision cases are only being opened,
            or whether officers are driving them to acknowledged, responded, evidence-based closure.
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
          tone={summary.resolvedWithEvidenceCases.length ? "success" : "default"}
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
                    Latest case: {compactDateTime(row.latestCaseAt ?? undefined) ?? "—"}
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

function DistrictCaseActionQueue({ cases }: { cases: GovernanceCase[] }) {
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
            overdue cases first, escalated cases next, then cases missing notices,
            acknowledgements, or corrective responses.
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

                      <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${riskBadgeClass(item.riskLevel ?? item.priority)}`}>
                        {item.riskLevel ?? item.priority} · {numberValue(item.riskScore)}
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
                      tone={evidence.hasCorrectiveResponse ? "success" : "danger"}
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
                      {compactDateTime(evidence.latestRespondedAt ?? undefined) ??
                        "Time not available"}
                    </p>
                    <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-100">
                      {evidence.latestResponseBody}
                    </p>
                  </div>
                ) : null}

                {item.events?.[0] ? (
                  <p className="mt-3 text-xs leading-5 text-slate-400">
                    Latest event: {item.events[0].eventType.replaceAll("_", " ")}
                    {item.events[0].note ? ` — ${item.events[0].note}` : ""}
                  </p>
                ) : null}
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

function AssessmentIntegrityGrid({ metrics }: { metrics?: SchoolMetrics | InterventionQueueItem["metrics"] }) {
  return (
    <div className="grid grid-cols-2 gap-2 text-xs text-slate-300 md:grid-cols-4">
      <MetricPill label="Items" value={numberValue(metrics?.assessmentItemsTotal)} />
      <MetricPill label="Draft" value={numberValue(metrics?.assessmentItemsDraft)} tone={numberValue(metrics?.assessmentItemsDraft) ? "warning" : "success"} />
      <MetricPill label="No scores" value={numberValue(metrics?.assessmentItemsWithoutScores)} tone={numberValue(metrics?.assessmentItemsWithoutScores) ? "danger" : "success"} />
      <MetricPill label="No delivery link" value={numberValue(metrics?.assessmentItemsWithoutLessonDelivery)} tone={numberValue(metrics?.assessmentItemsWithoutLessonDelivery) ? "warning" : "success"} />
      <MetricPill label="No curriculum link" value={numberValue(metrics?.assessmentItemsWithoutCurriculumUnit)} tone={numberValue(metrics?.assessmentItemsWithoutCurriculumUnit) ? "warning" : "success"} />
      <MetricPill label="Scoring" value={percentValue(metrics?.assessmentCompletionRate)} tone={numberValue(metrics?.assessmentCompletionRate) < 60 ? "danger" : "success"} />
      <MetricPill label="Link coverage" value={percentValue(metrics?.assessmentLinkCoverageRate)} tone={numberValue(metrics?.assessmentLinkCoverageRate) < 70 ? "warning" : "success"} />
      <MetricPill label="Orphan notes" value={numberValue(metrics?.orphanedLessonNotesLast14Days)} tone={numberValue(metrics?.orphanedLessonNotesLast14Days) ? "danger" : "success"} />
    </div>
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
          json && !json.ok ? json.error : `Failed to load dashboard (${res.status})`;
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

const res = await fetch(`/api/governance/interventions/list?take=${caseLimit}`, {
        cache: "no-store",
        credentials: "include",
        headers: { Accept: "application/json" },
      });

      const json = (await res.json().catch(() => null)) as CaseListResponse | null;

      if (!res.ok || !json?.ok) {
        setCases([]);
        setCaseError(
          json && !json.ok ? json.error : `Failed to load cases (${res.status})`
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

  function activeCaseForSchool(schoolId: string) {
    return cases.find(
      (c) =>
        c.tenantId === schoolId &&
        c.scopeType === "SCHOOL" &&
        c.status !== "RESOLVED" &&
        c.status !== "CANCELLED"
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

      const json = (await res.json().catch(() => null)) as CaseWriteResponse | null;

      if (!res.ok || !json?.ok) {
        setCaseError(
          json && !json.ok ? json.error : `Failed to open case (${res.status})`
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
    note: string
  ) {
    const closureEvidence =
      status === "RESOLVED" ? closureEvidenceForCase(item) : null;

    if (
      status === "RESOLVED" &&
      closureEvidence &&
      !closureEvidence.canResolve
    ) {
      setCaseAction(null);
      setCaseError(
        `Cannot resolve yet: ${closureEvidence.warnings.join(" ")}`
      );
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

      const json = (await res.json().catch(() => null)) as CaseWriteResponse | null;

      if (!res.ok || !json?.ok) {
        setCaseError(
          json && !json.ok ? json.error : `Failed to update case (${res.status})`
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

  async function sendHeadteacherNotice(item: GovernanceCase) {
    setBusyCaseKey(`notice:${item.id}`);
    setCaseAction(null);
    setCaseError(null);

    try {
      const schoolLabel = item.tenant?.name ?? item.title ?? "the selected school";

      const res = await fetch("/api/governance/notices/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
  caseId: item.id,
  idempotencyKey: `governance-notice:case:${item.id}:official-intervention:HEADTEACHER:v1`,
  title: `Official intervention notice: ${schoolLabel}`,
          body:
            "EduLife OS has flagged this school for immediate supervision follow-up. Kindly review attendance capture, lesson delivery evidence, and assessment scoring evidence, then respond to the SISSO with corrective action taken.",
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

      const json = (await res.json().catch(() => null)) as NoticeSendResponse | null;

      if (!res.ok || !json?.ok) {
        setCaseError(
          json && !json.ok ? json.error : `Failed to send notice (${res.status})`
        );
        return;
      }

      const reused = Boolean(json.reused || json.item?.reused);

setCaseAction(
  reused
    ? `Official notice already exists for ${schoolLabel}; no duplicate SMS/email sent.`
    : `Official notice sent for ${schoolLabel}.`
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

  const assignments = useMemo(() => data?.scope?.assignments ?? [], [data]);
  const schools = useMemo(() => data?.overview?.schools ?? [], [data]);
  const circuitBreakdown = useMemo(
    () => data?.overview?.circuitBreakdown ?? [],
    [data]
  );
  const interventionQueue = useMemo(
    () => data?.overview?.interventionQueue ?? [],
    [data]
  );
  const riskSummary = useMemo(() => data?.overview?.riskSummary ?? {}, [data]);
  const totals = useMemo(() => data?.overview?.totals ?? {}, [data]);
  const signals = useMemo(() => data?.overview?.signals ?? {}, [data]);
  const emptyStates = useMemo(() => data?.overview?.emptyStates ?? [], [data]);
  const generatedAt = compactDateTime(data?.overview?.generatedAt);

  const primaryAssignment = assignments[0] ?? null;
  const activeCaseCount = cases.filter(
    (c) => c.status !== "RESOLVED" && c.status !== "CANCELLED"
  ).length;

  const totalCards = useMemo(() => {
    const preferred = isDistrictView
      ? ["districts", "circuits", "schools", "learners", "teachers", "classrooms"]
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
      .sort((a, b) => numberValue(b.metrics?.riskScore) - numberValue(a.metrics?.riskScore))
      .slice(0, 5);
  }, [schools]);

  const highestRiskCircuits = useMemo(() => {
    return [...circuitBreakdown]
      .sort((a, b) => {
        const criticalDiff = numberValue(b.criticalRiskSchools) - numberValue(a.criticalRiskSchools);
        if (criticalDiff !== 0) return criticalDiff;

        const highDiff = numberValue(b.highRiskSchools) - numberValue(a.highRiskSchools);
        if (highDiff !== 0) return highDiff;

        return numberValue(b.highestRiskScore) - numberValue(a.highestRiskScore);
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
                    {roleLabel(primaryAssignment.role)} · {primaryAssignment.zoneName}
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
        {isDistrictView ? (
          <DistrictCaseCommandPanel cases={cases} />
        ) : null}
        {isDistrictView ? (
          <DistrictCaseActionQueue cases={cases} />
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
                  Director-level action should flow through the SISSO or Circuit Supervisor, then down to schools.
                </p>
              </div>
              <p className="text-xs text-red-100/70">
                {highestRiskCircuits.length} circuit(s) in scope
              </p>
            </div>

            <div className="mt-5 space-y-4">
              {loading ? (
                <div className="text-sm text-red-100">Loading circuit priorities...</div>
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
                            Critical {numberValue(circuit.criticalRiskSchools)} · High{" "}
                            {numberValue(circuit.highRiskSchools)}
                          </span>
                        </div>

                        <p className="mt-3 text-lg font-bold text-white">
                          {circuit.circuitName}
                        </p>
                        <p className="mt-1 text-sm text-slate-300">
                          {circuit.schools} school(s) · {circuit.learners} learners ·{" "}
                          {circuit.teachers} teachers
                        </p>
                      </div>

                      <div className="grid gap-2 text-xs sm:grid-cols-2 xl:min-w-[520px]">
                        <MetricPill label="Attendance completion" value={percentValue(circuit.attendanceCompletionRateToday)} tone={numberValue(circuit.attendanceCompletionRateToday) < 75 ? "danger" : "success"} />
                        <MetricPill label="Lesson compliance" value={percentValue(circuit.lessonDeliveryComplianceRate)} tone={numberValue(circuit.lessonDeliveryComplianceRate) < 70 ? "danger" : "success"} />
                        <MetricPill label="Assessment scoring" value={percentValue(circuit.assessmentCompletionRate)} tone={numberValue(circuit.assessmentCompletionRate) < 60 ? "danger" : "success"} />
                        <MetricPill label="Assessment link coverage" value={percentValue(circuit.assessmentLinkCoverageRate)} tone={numberValue(circuit.assessmentLinkCoverageRate) < 70 ? "warning" : "success"} />
                        <MetricPill label="Orphan notes" value={numberValue(circuit.orphanedLessonNotesLast14Days)} tone={numberValue(circuit.orphanedLessonNotesLast14Days) ? "danger" : "success"} />
                        <MetricPill label="No-score items" value={numberValue(circuit.assessmentItemsWithoutScores)} tone={numberValue(circuit.assessmentItemsWithoutScores) ? "danger" : "success"} />
                      </div>
                    </div>

                    <div className="mt-4 grid gap-4 lg:grid-cols-2">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                          Director action
                        </p>
                        <ul className="mt-2 space-y-2 text-sm text-slate-200">
                          {(circuit.directorRecommendedActions ?? []).slice(0, 3).map((action) => (
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
                          {(circuit.schoolsDrivingRisk ?? []).slice(0, 3).map((school) => (
                            <div
                              key={school.schoolId}
                              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-sm font-semibold text-white">
                                  {school.schoolName}
                                </p>
                                <span className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${riskBadgeClass(school.riskLevel)}`}>
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
                This is the SISSO supervision queue. It turns raw school data into action priorities.
              </p>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <MetricPill label="Critical schools" value={numberValue(riskSummary.critical)} tone="danger" />
                <MetricPill label="High risk schools" value={numberValue(riskSummary.high)} tone="warning" />
                <MetricPill label="Medium risk" value={numberValue(riskSummary.medium)} tone="warning" />
                <MetricPill label="Highest score" value={numberValue(riskSummary.highestRiskScore)} />
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
                  <div className="text-sm text-slate-300">Loading intervention queue...</div>
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
                            <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${riskBadgeClass(item.riskLevel)}`}>
                              {item.riskLevel} · {item.riskScore}
                            </span>
                          </div>

                          <p className="mt-3 font-bold text-white">{item.schoolName}</p>
                          <p className="mt-1 text-xs text-slate-400">
                            {item.schoolCode || "No school code"} · {item.circuitName}
                            {item.districtName ? ` · ${item.districtName}` : ""}
                          </p>
                        </div>

                        <div className="grid gap-2 text-xs text-slate-300 sm:grid-cols-3">
                          <MetricPill label="Attendance" value={percentValue(item.metrics?.attendanceCompletionRateToday)} tone={numberValue(item.metrics?.attendanceCompletionRateToday) < 75 ? "danger" : "success"} />
                          <MetricPill label="Assessment" value={percentValue(item.metrics?.assessmentCompletionRate)} tone={numberValue(item.metrics?.assessmentCompletionRate) < 60 ? "danger" : "success"} />
                          <MetricPill label="Orphan notes" value={numberValue(item.metrics?.orphanedLessonNotesLast14Days)} tone={numberValue(item.metrics?.orphanedLessonNotesLast14Days) ? "danger" : "success"} />
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
                                <span className={`mt-2 h-2 w-2 rounded-full ${riskDotClass(item.riskLevel)}`} />
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
                            {item.recommendedActions.slice(0, 5).map((action) => (
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
                          const existingCase = activeCaseForSchool(item.schoolId);

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
                                    Case ID: {existingCase.id.slice(0, 10)}… · Notices:{" "}
                                    {existingCase.notices?.length ?? 0}
                                  </p>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => void sendHeadteacherNotice(existingCase)}
                                  disabled={busyCaseKey === `notice:${existingCase.id}`}
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
                                      "SISSO has started follow-up from the governance dashboard."
                                    )
                                  }
                                  disabled={
                                    existingCase.status === "IN_PROGRESS" ||
                                    busyCaseKey === `status:${existingCase.id}:IN_PROGRESS`
                                  }
                                  className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-[11px] font-semibold text-slate-100 hover:bg-white/10 disabled:opacity-50"
                                >
                                  Mark in progress
                                </button>

                                <button
                                  type="button"
                                  onClick={() =>
                                    void updateCaseStatus(
                                      existingCase,
                                      "ESCALATED",
                                      "Case escalated from the governance dashboard for higher-level follow-up."
                                    )
                                  }
                                  disabled={
                                    busyCaseKey === `status:${existingCase.id}:ESCALATED`
                                  }
                                  className="rounded-full border border-red-300/25 bg-red-500/10 px-3 py-2 text-[11px] font-semibold text-red-100 hover:bg-red-500/15 disabled:opacity-50"
                                >
                                  Escalate
                                </button>

                                                                <button
                                  type="button"
                                  onClick={() =>
                                    void updateCaseStatus(
                                      existingCase,
                                      "RESOLVED",
                                      "Case marked resolved from the governance dashboard after follow-up."
                                    )
                                  }
                                  disabled={
                                    !closureEvidenceForCase(existingCase).canResolve ||
                                    busyCaseKey === `status:${existingCase.id}:RESOLVED`
                                  }
                                  className="rounded-full border border-emerald-300/25 bg-emerald-400/10 px-3 py-2 text-[11px] font-semibold text-emerald-100 hover:bg-emerald-400/15 disabled:opacity-50"
                                >
                                  {closureEvidenceForCase(existingCase).canResolve
                                    ? "Resolve with evidence"
                                    : "Awaiting response"}
                                </button>
                              </div>

                              {existingCase.events?.[0] ? (
                                <p className="text-xs leading-5 text-slate-400">
                                  Latest evidence:{" "}
                                  {existingCase.events[0].eventType.replaceAll("_", " ")}
                                  {existingCase.events[0].note
                                    ? ` — ${existingCase.events[0].note}`
                                    : ""}
                                </p>
                              ) : null}
                            </div>
                          ) : (
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                                  No active case yet
                                </p>
                                <p className="mt-1 text-sm text-slate-300">
                                  Open a formal intervention case before sending official
                                  notices.
                                </p>
                              </div>

                              <button
                                type="button"
                                onClick={() => void openCaseFromQueue(item)}
                                disabled={busyCaseKey === `open:${item.schoolId}`}
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
              title={isDistrictView ? "Circuit Risk Breakdown" : "Schools in This Circuit"}
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
                        <p className="font-semibold text-white">{row.circuitName}</p>
                        <p className="mt-1 text-xs text-slate-400">
                          {row.schools} school(s) · {row.learners} learners · {row.teachers} teachers
                        </p>
                        <p className="mt-2 text-xs text-slate-300">
                          Present today: {row.presentMarksToday}/{row.attendanceMarksToday} (
                          {pct(row.presentMarksToday, row.attendanceMarksToday)})
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs text-slate-300 md:grid-cols-4">
                        <MetricPill label="Critical" value={numberValue(row.criticalRiskSchools)} tone="danger" />
                        <MetricPill label="High" value={numberValue(row.highRiskSchools)} tone="warning" />
                        <MetricPill label="Completion" value={percentValue(row.attendanceCompletionRateToday)} />
                        <MetricPill label="Highest risk" value={numberValue(row.highestRiskScore)} />
                        <MetricPill label="No-score items" value={numberValue(row.assessmentItemsWithoutScores)} tone={numberValue(row.assessmentItemsWithoutScores) ? "danger" : "success"} />
                        <MetricPill label="No delivery link" value={numberValue(row.assessmentItemsWithoutLessonDelivery)} tone={numberValue(row.assessmentItemsWithoutLessonDelivery) ? "warning" : "success"} />
                        <MetricPill label="Orphan notes" value={numberValue(row.orphanedLessonNotesLast14Days)} tone={numberValue(row.orphanedLessonNotesLast14Days) ? "danger" : "success"} />
                        <MetricPill label="Delivery compliance" value={percentValue(row.lessonDeliveryComplianceRate)} tone={numberValue(row.lessonDeliveryComplianceRate) < 70 ? "danger" : "success"} />
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
                            <p className="font-semibold text-white">{school.name}</p>
                            <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${riskBadgeClass(riskLevel)}`}>
                              {riskLevel} · {numberValue(m.riskScore)}
                            </span>
                          </div>

                          <p className="mt-1 text-xs text-slate-400">
                            {school.schoolCode || "No school code"} · {school.status}
                          </p>
                          <p className="mt-2 text-xs text-slate-300">
                            Circuit: {school.circuit?.name || "—"} · District:{" "}
                            {school.district?.name || "—"}
                          </p>

                          {m.riskReasons?.length ? (
                            <p className="mt-3 text-sm text-slate-200">
                              <span className="font-semibold text-amber-200">Main reason:</span>{" "}
                              {m.riskReasons[0]}
                            </p>
                          ) : null}
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-xs text-slate-300 md:grid-cols-4">
                          <MetricPill label="Learners" value={numberValue(m.learners)} />
                          <MetricPill label="Teachers" value={numberValue(m.teachers)} />
                          <MetricPill label="Attendance" value={percentValue(m.attendanceRateToday)} />
                          <MetricPill label="Completion" value={percentValue(m.attendanceCompletionRateToday)} />
                          <MetricPill label="Missing" value={numberValue(m.missingAttendanceMarksToday)} tone={numberValue(m.missingAttendanceMarksToday) ? "warning" : "success"} />
                          <MetricPill label="Alerts" value={numberValue(m.healthAlertsToday)} tone={numberValue(m.healthAlertsToday) ? "danger" : "success"} />
                          <MetricPill label="Pending notes" value={numberValue(m.lessonNotesPendingReview)} tone={numberValue(m.lessonNotesPendingReview) ? "warning" : "success"} />
                          <MetricPill label="Assessments" value={numberValue(m.assessmentItemsTotal)} />
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
                    <span className="text-lg font-bold text-white">{item.value}</span>
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
                  <div className="text-sm text-slate-300">Loading signals...</div>
                ) : signalCards.length ? (
                  signalCards.map((s) => (
                    <div
                      key={s.key}
                      className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3"
                    >
                      <span className="text-sm text-slate-300">{s.label}</span>
                      <span className="text-lg font-bold text-white">{s.value}</span>
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
                            {school.circuit?.name || "No circuit"} · {school.schoolCode || "No code"}
                          </p>
                        </div>
                        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${riskBadgeClass(riskLevel)}`}>
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
                        <p className="font-semibold text-white">{school.name}</p>
                        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${riskBadgeClass(riskLevel)}`}>
                          {riskLevel} · {numberValue(m.riskScore)}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-400">
                        {school.schoolCode || "No school code"} · {school.circuit?.name || "No circuit"}
                      </p>
                      {m.riskReasons?.[0] ? (
                        <p className="mt-3 text-sm text-slate-200">
                          <span className="font-semibold text-amber-200">Evidence:</span>{" "}
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
            This is a read-only supervision dashboard. Officers can see risk and evidence, but they cannot edit school records from this view.
          </section>
        ) : null}
      </div>
    </main>
  );
}
