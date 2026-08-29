// src/components/governance/GovernanceCommandDashboardClient.tsx
"use client";

import dynamic from "next/dynamic";
import { signOut } from "next-auth/react";
import { useEffect, useMemo, useRef, useState } from "react";
import GovernanceDashboardClient from "@/components/governance/GovernanceDashboardClient";
import GovernanceSentNoticeAccountabilityClient from "@/components/governance/GovernanceSentNoticeAccountabilityClient";
import GovernanceAppraisalDrilldownPanel from "@/components/governance/GovernanceAppraisalDrilldownPanel";
import GovernanceSchemeCoveragePanel from "@/components/governance/GovernanceSchemeCoveragePanel";
import GovernanceOfficialNoticeComposer from "@/components/governance/GovernanceOfficialNoticeComposer";
import GovernanceStudentAttendancePanel from "@/components/governance/GovernanceStudentAttendancePanel";
import GovernanceTeacherAbsenteeismRiskPanel, {
  type GovernanceTeacherAbsenteeismOverview,
} from "@/components/governance/GovernanceTeacherAbsenteeismRiskPanel";

const GovernanceInterventionLogbookClient = dynamic(
  () =>
    import(
      "@/components/governance/GovernanceInterventionLogbookClient"
    ),
  {
    ssr: false,
    loading: () => (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
        <div className="rounded-2xl border border-sky-300/20 bg-slate-950 px-5 py-4 text-sm text-sky-100">
          Loading governance logbook...
        </div>
      </div>
    ),
  },
);

type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

type SchoolMetrics = {
  learners?: number;
  teachers?: number;
  classrooms?: number;
  operationalClassrooms?: number;
  attendanceSessionsToday?: number;
  openAttendanceSessionsToday?: number;
  closedAttendanceSessionsToday?: number;
  certifiedAttendanceSessionsToday?: number;
  closedButUncertifiedAttendanceSessionsToday?: number;
  missingAttendanceSessionsToday?: number;
  parentAlertsSentToday?: number;
  attendanceMarksToday?: number;
  presentMarksToday?: number;
  absentMarksToday?: number;
  lateMarksToday?: number;
  excusedMarksToday?: number;
  attendanceRateToday?: number;
  attendanceCompletionRateToday?: number;
  missingAttendanceMarksToday?: number;
  healthAlertsToday?: number;
  lessonDeliveriesLast14Days?: number;
  lessonNotesPendingReview?: number;
  publishedOrLockedAssessments?: number;
  assessmentCompletionRate?: number;
  assessmentLinkCoverageRate?: number;
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
  circuit?: { id: string; name: string; type?: string; level?: number } | null;
  district?: { id: string; name: string } | null;
  metrics?: SchoolMetrics;
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
  metrics?: SchoolMetrics;
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
  attendanceRateToday?: number;
  attendanceCompletionRateToday?: number;
  healthAlertsToday: number;
  lessonDeliveriesLast14Days: number;
  lessonNotesPendingReview?: number;
  publishedOrLockedAssessments: number;
  assessmentCompletionRate?: number;
  lessonDeliveryComplianceRate?: number;
  highRiskSchools?: number;
  criticalRiskSchools?: number;
  highestRiskScore?: number;
};

type AttendanceFollowUpSchool = {
  tenantId: string;
  schoolName: string;
  schoolCode: string | null;
  schoolSector?: "PUBLIC" | "PRIVATE" | string;
  circuitName: string | null;
  districtName: string | null;
  sessions: number;
  openSessions: number;
  closedSessions: number;
  certifiedSessions: number;
  closedUncertifiedSessions: number;
  missingSessions: number;
  learners: number;
  marked: number;
  unmarked: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
  completionPct: number;
  presentPct: number;
  parentAlertsSent: number;
  reason: string;
};

type AttendanceOverview = {
  date: string;
  schools: number;
  schoolsWithSessions: number;
  schoolsMissingSessions: number;
  openSessions: number;
  closedSessions: number;
  certifiedSessions: number;
  closedUncertifiedSessions: number;
  missingSessions: number;
  learners: number;
  marked: number;
  unmarked: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
  completionPct: number;
  presentPct: number;
  needsAction: number;
  parentAlertsSent: number;
  schoolsNeedingFollowUp: AttendanceFollowUpSchool[];
};

type TeacherAttendanceFollowUpSchool = {
  tenantId: string;
  schoolName: string;
  schoolCode: string | null;
  schoolSector?: "PUBLIC" | "PRIVATE" | string;
  circuitName: string | null;
  districtName: string | null;
  teachers: number;
  hasSession: boolean;
  isCertified: boolean;
  isClosed: boolean;
  marked: number;
  unmarked: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
  completionPct: number;
  presentPct: number;
  reason: string;
};

type TeacherAttendanceOverview = {
  date: string;
  schools: number;
  schoolsWithAnySession: number;
  schoolsCertified: number;
  schoolsUncertified: number;
  schoolsMissingSession: number;
  teachers: number;
  marked: number;
  unmarked: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
  absentOrLate: number;
  completionPct: number;
  presentPct: number;
  needsAction: number;
  schoolsNeedingFollowUp: TeacherAttendanceFollowUpSchool[];
};

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

type GovernanceMockTrendLabel =
  | "IMPROVING"
  | "DECLINING"
  | "STABLE"
  | "INCOMPLETE";

type GovernanceMockWeakSubject = {
  subject: string;
  canonicalSubject: string;
  averageScore: number | null;
  lowScoreCount: number;
  scoredCount: number;
};

type GovernanceMockAggregateRange = {
  mockLabel: string | null;
  min: number | null;
  max: number | null;
};

type GovernanceMockSchoolSignal = {
  tenantId: string;
  schoolName: string;
  schoolCode: string | null;
  schoolSector: "PUBLIC" | "PRIVATE" | string;
  circuitName: string | null;
  districtName: string | null;
  latestMockLabel: string | null;
  latestMockTitle: string | null;
  totalCandidates: number;
  placementReadyCount: number;
 averagePlacementAggregate: number | null;
previousAveragePlacementAggregate: number | null;
aggregateMovement: number | null;
latestAggregateRange: GovernanceMockAggregateRange | null;
previousAggregateRange: GovernanceMockAggregateRange | null;
  trendLabel: GovernanceMockTrendLabel;
  activeCases: number;
  resolvedCases: number;
  needsFollowUp: boolean;
  followUpReason: string;
};

type GovernanceMockReadinessOverview = {
  schools: number;
  schoolsWithReleasedMock: number;
  schoolsWithoutReleasedMock: number;
  latestReleasedMockCount: number;
  averagePlacementAggregate: number | null;
  improvingSchools: number;
  decliningSchools: number;
  stableSchools: number;
  incompleteSchools: number;
  schoolsNeedingFollowUp: number;
  activeInterventionCases: number;
  resolvedInterventionCases: number;
  weakestSubjects: GovernanceMockWeakSubject[];
  schoolSignals: GovernanceMockSchoolSignal[];
};

type CircuitMockVisitPriorityLabel =
  | "URGENT_VISIT"
  | "CALL_THIS_WEEK"
  | "REQUEST_MOCK_RELEASE"
  | "FOLLOW_UP_CASE"
  | "MONITOR"
  | "IMPROVING";

type CircuitMockVisitPriorityRow = {
  schoolId: string;
  schoolName: string;
  schoolCode: string | null;
  schoolSector: "PUBLIC" | "PRIVATE" | string | undefined;
  circuitName: string | null;
  latestMockLabel: string | null;
  priorityLabel: CircuitMockVisitPriorityLabel;
  priorityText: string;
  priorityScore: number;
  trendLabel: GovernanceMockTrendLabel | "NO_RELEASE";
  averagePlacementAggregate: number | null;
aggregateMovement: number | null;
latestAggregateRange: GovernanceMockAggregateRange | null;
previousAggregateRange: GovernanceMockAggregateRange | null;
  placementReadyCount: number;
  totalCandidates: number;
  activeCases: number;
  resolvedCases: number;
  reason: string;
  action: string;
};

type DistrictMockCircuitPriorityLabel =
  | "URGENT_SISSO_FOLLOW_UP"
  | "CALL_CIRCUIT_THIS_WEEK"
  | "REQUEST_MOCK_RELEASE_COVERAGE"
  | "IMPROVING_CIRCUIT"
  | "MONITOR";

type DistrictMockCircuitPriorityRow = {
  circuitId: string;
  circuitName: string;
  districtName: string | null;
  schools: number;
  schoolsWithReleasedMock: number;
  schoolsWithoutReleasedMock: number;
  releasedCoverage: string;
  averagePlacementAggregate: number | null;
  latestAggregateRange: GovernanceMockAggregateRange | null;
  previousAggregateRange: GovernanceMockAggregateRange | null;
  improvingSchools: number;
  decliningSchools: number;
  stableSchools: number;
  incompleteSchools: number;
  activeCases: number;
  resolvedCases: number;
  priorityLabel: DistrictMockCircuitPriorityLabel;
  priorityText: string;
  priorityScore: number;
  reason: string;
  action: string;
  schoolRows: CircuitMockVisitPriorityRow[];
};

type OverviewResponse =
  | {
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
  mockReadiness?: GovernanceMockReadinessOverview;
  totals?: Record<string, number>;
  signals?: Record<string, number>;
  attendance?: AttendanceOverview;
  teacherAttendance?: TeacherAttendanceOverview | null;
  teacherAbsenteeism?: GovernanceTeacherAbsenteeismOverview | null;
  featureAvailability?: {
    teacherAttendance?: boolean;
  };
  emptyStates?: string[];
  generatedAt?: string;
};
    }
  | {
      ok: false;
      error: string;
    };

type Props = {
  endpoint: string;
  eyebrow: string;
  title: string;
  description: string;
  accountabilityTitle: string;
  accountabilityDescription: string;
};

type PanelKey =
  | "risk"
  | "mock-readiness"
  | "mock-priority"
  | "mock-circuit-priority"
  | "students-attendance"
  | "teacher-attendance"
  | "scheme-coverage"
  | "appraisals"
  | "teacher-appraisal"
  | "teacher-appraisal-headteacher"
  | "lesson"
  | "students-assessment"
  | "sector"
  | "notices"
  | "accountability"
  | "advanced";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function numberValue(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function percentValue(value: unknown) {
  return `${Math.round(numberValue(value))}%`;
}

function formatOptionalNumber(value: unknown) {
  if (value == null) return "—";

  const n = Number(value);
  if (!Number.isFinite(n)) return "—";

  return Number.isInteger(n) ? n.toLocaleString() : n.toFixed(1);
}

function movementDisplay(value: number | null | undefined) {
  if (value == null || !Number.isFinite(Number(value))) return "—";

  const n = Number(value);
  const text = Number.isInteger(n) ? String(n) : n.toFixed(1);

  return n > 0 ? `+${text}` : text;
}

function aggregateRangeDisplay(
  range?: GovernanceMockAggregateRange | null,
) {
  if (!range || range.min == null || range.max == null) return "—";

  const label = range.mockLabel || "Mock";
  const min = formatOptionalNumber(range.min);
  const max = formatOptionalNumber(range.max);

  return `${label}: agg. ${min}–${max}`;
}

function mockTrendLabel(label?: string | null) {
  const s = String(label ?? "").toUpperCase();

  if (s === "IMPROVING") return "Improving";
  if (s === "DECLINING") return "Declining";
  if (s === "STABLE") return "Stable";

  return "Insufficient evidence";
}

function mockTrendTone(
  label?: string | null,
): "default" | "success" | "warning" | "danger" | "info" {
  const s = String(label ?? "").toUpperCase();

  if (s === "IMPROVING") return "success";
  if (s === "DECLINING") return "danger";
  if (s === "STABLE") return "info";

  return "warning";
}

function circuitMockPriorityText(label: CircuitMockVisitPriorityLabel) {
  if (label === "URGENT_VISIT") return "Urgent visit";
  if (label === "CALL_THIS_WEEK") return "Call this week";
  if (label === "REQUEST_MOCK_RELEASE") return "Request Mock release";
  if (label === "FOLLOW_UP_CASE") return "Follow up case";
  if (label === "IMPROVING") return "Improving";
  return "Monitor";
}

function circuitMockPriorityTone(
  label: CircuitMockVisitPriorityLabel,
): "default" | "success" | "warning" | "danger" | "info" {
  if (label === "URGENT_VISIT") return "danger";
  if (label === "CALL_THIS_WEEK") return "warning";
  if (label === "REQUEST_MOCK_RELEASE") return "warning";
  if (label === "FOLLOW_UP_CASE") return "warning";
  if (label === "IMPROVING") return "success";
  return "info";
}

function buildCircuitMockVisitPriorityRows(args: {
  schools: SchoolRow[];
  mockReadiness?: GovernanceMockReadinessOverview | null;
}): CircuitMockVisitPriorityRow[] {
  const signalByTenantId = new Map(
    (args.mockReadiness?.schoolSignals ?? []).map((signal) => [
      signal.tenantId,
      signal,
    ]),
  );

  return args.schools
    .map((school): CircuitMockVisitPriorityRow => {
      const signal = signalByTenantId.get(school.id);

      if (!signal) {
        return {
          schoolId: school.id,
          schoolName: school.name,
          schoolCode: school.schoolCode,
          schoolSector: school.schoolSector,
          circuitName: school.circuit?.name ?? null,
          latestMockLabel: null,
          priorityLabel: "REQUEST_MOCK_RELEASE",
          priorityText: circuitMockPriorityText("REQUEST_MOCK_RELEASE"),
          priorityScore: 75,
          trendLabel: "NO_RELEASE",
          averagePlacementAggregate: null,
aggregateMovement: null,
latestAggregateRange: null,
previousAggregateRange: null,
placementReadyCount: 0,
          totalCandidates: 0,
          activeCases: 0,
          resolvedCases: 0,
          reason: "No released BECE Mock readiness evidence is available for this school.",
          action:
            "Call the headteacher and set a clear deadline to lock and release JHS 3 Mock readiness evidence.",
        };
      }

      const incompletePlacement =
        signal.totalCandidates > 0 &&
        signal.placementReadyCount < signal.totalCandidates;

      let priorityLabel: CircuitMockVisitPriorityLabel = "MONITOR";
      let priorityScore = 20;
      let action =
        "Keep this school under routine monitoring and review after the next released Mock.";

      if (signal.trendLabel === "IMPROVING") {
        priorityLabel = "IMPROVING";
        priorityScore = 15;
        action =
          "Document what improved and encourage the school to protect the routine before the next Mock.";
      }

      if (signal.activeCases > 0) {
        priorityLabel = "FOLLOW_UP_CASE";
        priorityScore = 70;
        action =
          "Follow up the active Mock rescue case and require evidence of correction work before the next Mock.";
      }

      if (incompletePlacement) {
        priorityLabel = "CALL_THIS_WEEK";
        priorityScore = 78;
        action =
          "Call the headteacher this week and require completion of placement-ready Mock evidence.";
      }

      if (signal.trendLabel === "DECLINING") {
        priorityLabel = "CALL_THIS_WEEK";
        priorityScore = 85;
        action =
          "Call the headteacher and request a subject correction plan before the next Mock.";
      }

      if (signal.trendLabel === "DECLINING" && signal.activeCases > 0) {
        priorityLabel = "URGENT_VISIT";
        priorityScore = 100;
        action =
          "Visit or call urgently, verify the correction plan, and check whether the active rescue case has real evidence.";
      }

      if (
        signal.averagePlacementAggregate != null &&
        signal.averagePlacementAggregate > 24
      ) {
        priorityScore += 5;
      }

      return {
        schoolId: school.id,
        schoolName: signal.schoolName || school.name,
        schoolCode: signal.schoolCode ?? school.schoolCode,
        schoolSector: signal.schoolSector ?? school.schoolSector,
        circuitName: signal.circuitName ?? school.circuit?.name ?? null,
        latestMockLabel: signal.latestMockLabel,
        priorityLabel,
        priorityText: circuitMockPriorityText(priorityLabel),
        priorityScore,
        trendLabel: signal.trendLabel,
        averagePlacementAggregate: signal.averagePlacementAggregate,
aggregateMovement: signal.aggregateMovement,
latestAggregateRange: signal.latestAggregateRange ?? null,
previousAggregateRange: signal.previousAggregateRange ?? null,
placementReadyCount: signal.placementReadyCount,
        totalCandidates: signal.totalCandidates,
        activeCases: signal.activeCases,
        resolvedCases: signal.resolvedCases,
        reason: signal.followUpReason,
        action,
      };
    })
    .sort((a, b) => {
      if (b.priorityScore !== a.priorityScore) {
        return b.priorityScore - a.priorityScore;
      }

      if (b.activeCases !== a.activeCases) return b.activeCases - a.activeCases;

      return a.schoolName.localeCompare(b.schoolName);
    });
}

function districtMockCircuitPriorityText(
  label: DistrictMockCircuitPriorityLabel,
) {
  if (label === "URGENT_SISSO_FOLLOW_UP") return "Urgent SISSO follow-up";
  if (label === "CALL_CIRCUIT_THIS_WEEK") return "Call circuit this week";
  if (label === "REQUEST_MOCK_RELEASE_COVERAGE") {
    return "Request Mock release coverage";
  }
  if (label === "IMPROVING_CIRCUIT") return "Improving circuit";
  return "Monitor";
}

function districtMockCircuitPriorityTone(
  label: DistrictMockCircuitPriorityLabel,
): "default" | "success" | "warning" | "danger" | "info" {
  if (label === "URGENT_SISSO_FOLLOW_UP") return "danger";
  if (label === "CALL_CIRCUIT_THIS_WEEK") return "warning";
  if (label === "REQUEST_MOCK_RELEASE_COVERAGE") return "warning";
  if (label === "IMPROVING_CIRCUIT") return "success";
  return "info";
}

function roundUi1(n: number) {
  return Math.round(n * 10) / 10;
}

function averageUiOrNull(values: number[]) {
  if (!values.length) return null;
  return roundUi1(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function combineAggregateRanges(
  ranges: Array<GovernanceMockAggregateRange | null | undefined>,
  fallbackLabel: string,
): GovernanceMockAggregateRange | null {
  const valid = ranges.filter(
    (range): range is GovernanceMockAggregateRange =>
      !!range && range.min != null && range.max != null,
  );

  if (!valid.length) return null;

  const labels = Array.from(
    new Set(valid.map((range) => range.mockLabel).filter(Boolean)),
  );

  return {
    mockLabel: labels.length === 1 ? labels[0] ?? fallbackLabel : fallbackLabel,
    min: roundUi1(Math.min(...valid.map((range) => Number(range.min)))),
    max: roundUi1(Math.max(...valid.map((range) => Number(range.max)))),
  };
}

function buildDistrictMockCircuitPriorityRows(args: {
  schools: SchoolRow[];
  circuits: CircuitBreakdownRow[];
  mockReadiness?: GovernanceMockReadinessOverview | null;
}): DistrictMockCircuitPriorityRow[] {
  const signalByTenantId = new Map(
    (args.mockReadiness?.schoolSignals ?? []).map((signal) => [
      signal.tenantId,
      signal,
    ]),
  );

  const onlyCircuit = args.circuits.length === 1 ? args.circuits[0] : null;

  const groups = new Map<
    string,
    {
      circuitId: string;
      circuitName: string;
      districtName: string | null;
      schoolsList: SchoolRow[];
      schools: number;
      schoolsWithReleasedMock: number;
      schoolsWithoutReleasedMock: number;
      aggregateValues: number[];
      latestRanges: Array<GovernanceMockAggregateRange | null>;
      previousRanges: Array<GovernanceMockAggregateRange | null>;
      improvingSchools: number;
      decliningSchools: number;
      stableSchools: number;
      incompleteSchools: number;
      activeCases: number;
      resolvedCases: number;
    }
  >();

  for (const circuit of args.circuits) {
    groups.set(circuit.circuitId, {
      circuitId: circuit.circuitId,
      circuitName: circuit.circuitName,
      districtName: circuit.districtName,
      schoolsList: [],
      schools: 0,
      schoolsWithReleasedMock: 0,
      schoolsWithoutReleasedMock: 0,
      aggregateValues: [],
      latestRanges: [],
      previousRanges: [],
      improvingSchools: 0,
      decliningSchools: 0,
      stableSchools: 0,
      incompleteSchools: 0,
      activeCases: 0,
      resolvedCases: 0,
    });
  }

  for (const school of args.schools) {
    const resolvedCircuitId =
      school.circuit?.id ?? onlyCircuit?.circuitId ?? null;

    if (!resolvedCircuitId) continue;

    const existing =
      groups.get(resolvedCircuitId) ??
      {
        circuitId: resolvedCircuitId,
        circuitName:
          school.circuit?.name ?? onlyCircuit?.circuitName ?? "Unassigned Circuit",
        districtName:
          school.district?.name ?? onlyCircuit?.districtName ?? null,
        schoolsList: [],
        schools: 0,
        schoolsWithReleasedMock: 0,
        schoolsWithoutReleasedMock: 0,
        aggregateValues: [],
        latestRanges: [],
        previousRanges: [],
        improvingSchools: 0,
        decliningSchools: 0,
        stableSchools: 0,
        incompleteSchools: 0,
        activeCases: 0,
        resolvedCases: 0,
      };

    existing.schoolsList.push(school);
    existing.schools += 1;

    const signal = signalByTenantId.get(school.id);

    if (!signal) {
      existing.schoolsWithoutReleasedMock += 1;
      existing.incompleteSchools += 1;
      groups.set(resolvedCircuitId, existing);
      continue;
    }

    existing.schoolsWithReleasedMock += 1;
    existing.activeCases += signal.activeCases;
    existing.resolvedCases += signal.resolvedCases;
    existing.latestRanges.push(signal.latestAggregateRange ?? null);
    existing.previousRanges.push(signal.previousAggregateRange ?? null);

    if (signal.averagePlacementAggregate != null) {
      existing.aggregateValues.push(signal.averagePlacementAggregate);
    }

    if (signal.trendLabel === "IMPROVING") existing.improvingSchools += 1;
    if (signal.trendLabel === "DECLINING") existing.decliningSchools += 1;
    if (signal.trendLabel === "STABLE") existing.stableSchools += 1;
    if (signal.trendLabel === "INCOMPLETE") existing.incompleteSchools += 1;

    groups.set(resolvedCircuitId, existing);
  }

  return Array.from(groups.values())
    .filter((group) => group.schools > 0)
    .map((group): DistrictMockCircuitPriorityRow => {
      let priorityLabel: DistrictMockCircuitPriorityLabel = "MONITOR";
      let priorityScore = 20;
      let reason =
        "Circuit Mock evidence is currently under routine monitoring.";
      let action =
        "Keep the circuit under routine review and compare again after the next released Mock.";

      if (group.schoolsWithReleasedMock === 0) {
        priorityLabel = "REQUEST_MOCK_RELEASE_COVERAGE";
        priorityScore = 80;
        reason =
          "No school in this circuit has released BECE Mock readiness evidence.";
        action =
          "Call the SISSO and require a dated Mock lock-and-release plan for all JHS 3 schools.";
      }

      if (
        group.schoolsWithoutReleasedMock > 0 &&
        group.schoolsWithReleasedMock > 0
      ) {
        priorityLabel = "REQUEST_MOCK_RELEASE_COVERAGE";
        priorityScore = 88;
        reason = `${group.schoolsWithoutReleasedMock} school(s) in this circuit still have no released BECE Mock evidence.`;
        action =
          "Ask the SISSO to collect release timelines from missing schools and confirm headteacher readiness blockers.";
      }

      if (group.decliningSchools > 0) {
        priorityLabel = "CALL_CIRCUIT_THIS_WEEK";
        priorityScore = 90;
        reason = `${group.decliningSchools} released school(s) in this circuit show declining Mock movement.`;
        action =
          "Call the SISSO this week and request a school-by-school correction plan before the next Mock.";
      }

      if (group.decliningSchools > 0 && group.activeCases > 0) {
        priorityLabel = "URGENT_SISSO_FOLLOW_UP";
        priorityScore = 100;
        reason = `${group.decliningSchools} school(s) are declining and ${group.activeCases} active Mock rescue case(s) still need supervision follow-up.`;
        action =
          "Call the SISSO urgently, require evidence update on active cases, and confirm which school will be visited first.";
      }

      if (
        group.schoolsWithReleasedMock === group.schools &&
        group.improvingSchools > 0 &&
        group.decliningSchools === 0 &&
        group.activeCases === 0
      ) {
        priorityLabel = "IMPROVING_CIRCUIT";
        priorityScore = 15;
        reason =
          "Released Mock evidence suggests this circuit is improving without active rescue pressure.";
        action =
          "Document what is working in this circuit and monitor whether the improvement holds after the next Mock.";
      }

      const schoolRows = buildCircuitMockVisitPriorityRows({
        schools: group.schoolsList,
        mockReadiness: args.mockReadiness,
      });

      return {
        circuitId: group.circuitId,
        circuitName: group.circuitName,
        districtName: group.districtName,
        schools: group.schools,
        schoolsWithReleasedMock: group.schoolsWithReleasedMock,
        schoolsWithoutReleasedMock: group.schoolsWithoutReleasedMock,
        releasedCoverage: `${group.schoolsWithReleasedMock}/${group.schools}`,
        averagePlacementAggregate: averageUiOrNull(group.aggregateValues),
        latestAggregateRange: combineAggregateRanges(
          group.latestRanges,
          "Latest released Mock",
        ),
        previousAggregateRange: combineAggregateRanges(
          group.previousRanges,
          "Previous released Mock",
        ),
        improvingSchools: group.improvingSchools,
        decliningSchools: group.decliningSchools,
        stableSchools: group.stableSchools,
        incompleteSchools: group.incompleteSchools,
        activeCases: group.activeCases,
        resolvedCases: group.resolvedCases,
        priorityLabel,
        priorityText: districtMockCircuitPriorityText(priorityLabel),
        priorityScore,
        reason,
        action,
        schoolRows,
      };
    })
    .sort((a, b) => {
      if (b.priorityScore !== a.priorityScore) {
        return b.priorityScore - a.priorityScore;
      }

      if (b.activeCases !== a.activeCases) return b.activeCases - a.activeCases;

      if (b.decliningSchools !== a.decliningSchools) {
        return b.decliningSchools - a.decliningSchools;
      }

      if (b.schoolsWithoutReleasedMock !== a.schoolsWithoutReleasedMock) {
        return b.schoolsWithoutReleasedMock - a.schoolsWithoutReleasedMock;
      }

      return a.circuitName.localeCompare(b.circuitName);
    });
}

function compactDateTime(value?: string) {
  if (!value) return "Not generated yet";

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;

  return new Intl.DateTimeFormat("en-GH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Accra",
  }).format(d);
}

function riskBadgeClass(level?: string) {
  if (level === "CRITICAL") {
    return "border-red-300/30 bg-red-500/15 text-red-100";
  }

  if (level === "HIGH") {
    return "border-orange-300/30 bg-orange-500/15 text-orange-100";
  }

  if (level === "MEDIUM") {
    return "border-amber-300/30 bg-amber-400/15 text-amber-100";
  }

  return "border-emerald-300/30 bg-emerald-400/15 text-emerald-100";
}

function sectorBadgeClass(value?: string | null) {
  if (value === "PRIVATE") {
    return "border-purple-300/25 bg-purple-400/10 text-purple-100";
  }

  if (value === "PUBLIC") {
    return "border-emerald-300/25 bg-emerald-400/10 text-emerald-100";
  }

  return "border-white/10 bg-white/5 text-slate-200";
}

function sectorLabel(value?: string | null) {
  if (value === "PRIVATE") return "Private";
  if (value === "PUBLIC") return "Public";
  return "Unspecified";
}

function toneClass(
  tone: "default" | "success" | "warning" | "danger" | "info",
) {
  if (tone === "success") return "border-emerald-300/20 bg-emerald-400/10";
  if (tone === "warning") return "border-amber-300/20 bg-amber-400/10";
  if (tone === "danger") return "border-red-300/20 bg-red-500/10";
  if (tone === "info") return "border-sky-300/20 bg-sky-500/10";
  return "border-white/10 bg-white/[0.04]";
}

function smallToneText(
  tone: "default" | "success" | "warning" | "danger" | "info",
) {
  if (tone === "success") return "text-emerald-100";
  if (tone === "warning") return "text-amber-100";
  if (tone === "danger") return "text-red-100";
  if (tone === "info") return "text-sky-100";
  return "text-slate-200";
}

function StatCard({
  label,
  value,
  helper,
  tone = "default",
  onClick,
  active = false,
}: {
  label: string;
  value: string | number;
  helper?: string;
  tone?: "default" | "success" | "warning" | "danger" | "info";
  onClick?: () => void;
  active?: boolean;
}) {
  const className = cx(
    "min-w-0 rounded-2xl border px-2 py-2 md:px-3 md:py-2.5",
    toneClass(tone),
    onClick ? "w-full text-left transition hover:-translate-y-0.5 hover:bg-white/[0.06]" : "",
    active ? "ring-2 ring-white/20" : "",
  );

  const content = (
    <>
      <p
        title={label}
        className="truncate text-[9px] font-semibold uppercase tracking-[0.06em] text-slate-400 md:text-[10px] md:tracking-[0.1em]"
      >
        {label}
      </p>

      <p
        title={String(value)}
        className="mt-0.5 truncate text-base font-bold leading-none text-white md:mt-1 md:text-xl"
      >
        {value}
      </p>

      {helper ? (
        <p
          title={helper}
          className={cx("mt-0.5 truncate text-[9px] leading-tight md:text-[11px]", smallToneText(tone))}
        >
          {helper}
        </p>
      ) : null}

      {onClick ? (
        <p className="mt-1 hidden text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400 sm:block">
          Tap to open
        </p>
      ) : null}
    </>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className}>
        {content}
      </button>
    );
  }

  return <div className={className}>{content}</div>;
}

function CommandTile({
  icon,
  title,
  description,
  value,
  tone = "default",
  active,
  onClick,
}: {
  icon: string;
  title: string;
  description: string;
  value?: string | number;
  tone?: "default" | "success" | "warning" | "danger" | "info";
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "group rounded-[24px] border p-4 text-left transition hover:-translate-y-0.5",
        toneClass(tone),
        active ? "ring-2 ring-white/20" : "",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-xl">{icon}</span>
        {value !== undefined ? (
          <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[11px] font-bold text-white">
            {value}
          </span>
        ) : null}
      </div>

      <p className="mt-3 text-sm font-bold text-white">{title}</p>
      <p className="mt-1 text-xs leading-5 text-slate-300">{description}</p>
      <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400 group-hover:text-white">
        Open
      </p>
    </button>
  );
}


function LockedCommandTile({
  icon,
  title,
  description,
  badge = "Locked",
}: {
  icon: string;
  title: string;
  description: string;
  badge?: string;
}) {
  return (
    <div
      aria-disabled="true"
      className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4 text-left opacity-75"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-xl">{icon}</span>
        <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[11px] font-bold text-slate-300">
          {badge}
        </span>
      </div>

      <p className="mt-3 text-sm font-bold text-white">{title}</p>
      <p className="mt-1 text-xs leading-5 text-slate-300">{description}</p>
      <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
        Not yet active
      </p>
    </div>
  );
}

function GovernanceMockReadinessPanel({
  mockReadiness,
  isDistrictView,
}: {
  mockReadiness?: GovernanceMockReadinessOverview | null;
  isDistrictView: boolean;
}) {
  if (!mockReadiness) return null;

  const topSignal = mockReadiness.schoolSignals[0] ?? null;
  const weakestSubjects = mockReadiness.weakestSubjects.slice(0, 3);
  const releasedCoverage = `${mockReadiness.schoolsWithReleasedMock}/${mockReadiness.schools}`;

  return (
    <section className="rounded-[28px] border border-amber-300/20 bg-amber-400/10 p-4 md:p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-200">
            BECE Mock Readiness
          </p>
          <h2 className="mt-1 text-lg font-bold text-white">
            {isDistrictView
              ? "District Mock risk signal"
              : "Circuit Mock risk signal"}
          </h2>
          <p className="mt-1 max-w-4xl text-sm leading-6 text-amber-100/80">
            {isDistrictView
              ? "Director view of released Mock evidence, school/circuit risk, weak subjects, and active rescue work."
              : "SISSO view of released Mock evidence, school risk, weak subjects, and active rescue work."}
          </p>
        </div>

        <span className="w-fit rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-semibold text-white">
          Released {releasedCoverage}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <StatCard
          label="Released"
          value={releasedCoverage}
          tone={mockReadiness.schoolsWithReleasedMock ? "success" : "warning"}
        />
        <StatCard
          label="No Mock release"
          value={mockReadiness.schoolsWithoutReleasedMock}
          tone={mockReadiness.schoolsWithoutReleasedMock ? "warning" : "success"}
        />
        <StatCard
          label="Avg aggregate"
          value={formatOptionalNumber(mockReadiness.averagePlacementAggregate)}
          tone={
            mockReadiness.averagePlacementAggregate == null
              ? "warning"
              : mockReadiness.averagePlacementAggregate > 24
                ? "danger"
                : "success"
          }
        />
        <StatCard
          label="Need follow-up"
          value={mockReadiness.schoolsNeedingFollowUp}
          tone={mockReadiness.schoolsNeedingFollowUp ? "danger" : "success"}
        />
        <StatCard
          label="Active rescue"
          value={mockReadiness.activeInterventionCases}
          tone={mockReadiness.activeInterventionCases ? "warning" : "success"}
        />
        <StatCard
          label="Resolved"
          value={mockReadiness.resolvedInterventionCases}
          tone={mockReadiness.resolvedInterventionCases ? "success" : "default"}
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-bold text-white">
                First follow-up signal
              </p>
              <p className="mt-1 text-xs leading-5 text-amber-100/75">
                {isDistrictView
                  ? "The Director should use this to know which SISSO/circuit needs attention first."
                  : "The SISSO should use this to know which school needs attention first."}
              </p>
            </div>

            {topSignal ? (
              <span
                className={cx(
                  "w-fit rounded-full border px-3 py-1 text-xs font-semibold",
                  riskBadgeClass(
                    topSignal.trendLabel === "DECLINING"
                      ? "CRITICAL"
                      : topSignal.trendLabel === "INCOMPLETE"
                        ? "MEDIUM"
                        : "LOW",
                  ),
                )}
              >
                {mockTrendLabel(topSignal.trendLabel)}
              </span>
            ) : null}
          </div>

          {topSignal ? (
            <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="font-bold text-white">{topSignal.schoolName}</p>
              <p className="mt-1 text-xs text-slate-400">
                {topSignal.schoolCode || "No school code"} ·{" "}
                {topSignal.circuitName || "No circuit"} ·{" "}
                {topSignal.latestMockLabel || "No released Mock"}
              </p>

              <p className="mt-3 text-sm leading-6 text-amber-100/90">
                {topSignal.followUpReason}
              </p>

              <div className="mt-3 grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
                <StatCard
                  label="Ready"
                  value={`${topSignal.placementReadyCount}/${topSignal.totalCandidates}`}
                  tone={
                    topSignal.placementReadyCount < topSignal.totalCandidates
                      ? "warning"
                      : "success"
                  }
                />
                <StatCard
                  label="Aggregate"
                  value={formatOptionalNumber(topSignal.averagePlacementAggregate)}
                  tone={
                    topSignal.averagePlacementAggregate == null
                      ? "warning"
                      : topSignal.averagePlacementAggregate > 24
                        ? "danger"
                        : "success"
                  }
                />
                <StatCard
                  label="Movement"
                  value={movementDisplay(topSignal.aggregateMovement)}
                  tone={mockTrendTone(topSignal.trendLabel)}
                />
                <StatCard
                  label="Cases"
                  value={`${topSignal.activeCases} active`}
                  tone={topSignal.activeCases ? "warning" : "success"}
                />
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm leading-6 text-slate-300">
              No released BECE Mock readiness evidence is available yet in this
              governance scope.
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
          <p className="text-sm font-bold text-white">Weakest Mock subjects</p>
          <p className="mt-1 text-xs leading-5 text-amber-100/75">
            Ranked from released Mock evidence in this governance scope.
          </p>

          <div className="mt-3 space-y-2">
            {weakestSubjects.length ? (
              weakestSubjects.map((subject, index) => (
                <div
                  key={subject.canonicalSubject}
                  className="rounded-xl border border-white/10 bg-black/20 px-3 py-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white">
                        {index + 1}. {subject.subject}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        Low scores: {subject.lowScoreCount}/{subject.scoredCount}
                      </p>
                    </div>

                    <span className="rounded-full border border-red-300/25 bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-100">
                      Avg {formatOptionalNumber(subject.averageScore)}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm text-slate-300">
                No subject risk signal yet.
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function CircuitMockVisitPriorityPanel({
  schools,
  mockReadiness,
}: {
  schools: SchoolRow[];
  mockReadiness?: GovernanceMockReadinessOverview | null;
}) {
  const rows = buildCircuitMockVisitPriorityRows({ schools, mockReadiness });

  if (!rows.length) return null;

  const urgentCount = rows.filter(
    (row) => row.priorityLabel === "URGENT_VISIT",
  ).length;
  const missingReleaseCount = rows.filter(
    (row) => row.priorityLabel === "REQUEST_MOCK_RELEASE",
  ).length;
  const activeCaseCount = rows.reduce((sum, row) => sum + row.activeCases, 0);
  const firstSchool = rows[0] ?? null;

  return (
    <section className="rounded-[28px] border border-red-300/20 bg-red-500/10 p-4 md:p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-200">
            Circuit Mock Visit Priority
          </p>
          <h2 className="mt-1 text-lg font-bold text-white">
            Schools ranked by BECE Mock follow-up urgency
          </h2>
          <p className="mt-1 max-w-4xl text-sm leading-6 text-red-100/80">
            This turns released Mock evidence into a practical SISSO visit queue:
            where to act first, why, and what to do next.
          </p>
        </div>

        {firstSchool ? (
          <span className="w-fit rounded-full border border-red-300/25 bg-black/20 px-3 py-1 text-xs font-semibold text-red-100">
            First: {firstSchool.schoolName}
          </span>
        ) : null}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label="Schools ranked"
          value={rows.length}
          tone={rows.length ? "info" : "default"}
        />
        <StatCard
          label="Urgent visit"
          value={urgentCount}
          tone={urgentCount ? "danger" : "success"}
        />
        <StatCard
          label="No Mock release"
          value={missingReleaseCount}
          tone={missingReleaseCount ? "warning" : "success"}
        />
        <StatCard
          label="Active cases"
          value={activeCaseCount}
          tone={activeCaseCount ? "warning" : "success"}
        />
      </div>

      <div className="mt-4 space-y-3">
        {rows.slice(0, 8).map((row, index) => (
          <div
            key={row.schoolId}
            className="rounded-2xl border border-white/10 bg-slate-950/50 p-4"
          >
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-200">
                    #{index + 1}
                  </span>

                  <span
                    className={cx(
                      "rounded-full border px-3 py-1 text-xs font-semibold",
                      toneClass(circuitMockPriorityTone(row.priorityLabel)),
                      smallToneText(circuitMockPriorityTone(row.priorityLabel)),
                    )}
                  >
                    {row.priorityText}
                  </span>

                  <span
                    className={cx(
                      "rounded-full border px-3 py-1 text-xs font-semibold",
                      riskBadgeClass(
                        row.trendLabel === "DECLINING"
                          ? "CRITICAL"
                          : row.trendLabel === "NO_RELEASE"
                            ? "MEDIUM"
                            : row.trendLabel === "IMPROVING"
                              ? "LOW"
                              : "MEDIUM",
                      ),
                    )}
                  >
                    {row.trendLabel === "NO_RELEASE"
                      ? "No Mock evidence"
                      : mockTrendLabel(row.trendLabel)}
                  </span>
                </div>

                <p className="mt-3 font-bold text-white">{row.schoolName}</p>
                <p className="mt-1 text-xs text-slate-400">
                  {row.schoolCode || "No school code"} ·{" "}
                  {sectorLabel(row.schoolSector)} ·{" "}
                  {row.circuitName || "No circuit"} ·{" "}
                  {row.latestMockLabel || "No released Mock"}
                </p>

                <p className="mt-3 text-sm leading-6 text-red-100/90">
                  <span className="font-semibold text-white">Why: </span>
                  {row.reason}
                </p>

                <p className="mt-2 text-sm leading-6 text-emerald-100/90">
                  <span className="font-semibold text-white">Action: </span>
                  {row.action}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4 xl:min-w-[560px]">
             <StatCard
  label="Aggregate range"
  value={aggregateRangeDisplay(row.latestAggregateRange)}
  helper={
    row.previousAggregateRange
      ? aggregateRangeDisplay(row.previousAggregateRange)
      : "No previous released Mock"
  }
  tone={
    row.averagePlacementAggregate == null
      ? "warning"
      : row.averagePlacementAggregate > 24
        ? "danger"
        : "success"
  }
/>
                <StatCard
                  label="Movement"
                  value={movementDisplay(row.aggregateMovement)}
                  tone={mockTrendTone(row.trendLabel)}
                />
                <StatCard
                  label="Ready"
                  value={
                    row.totalCandidates
                      ? `${row.placementReadyCount}/${row.totalCandidates}`
                      : "—"
                  }
                  tone={
                    row.totalCandidates &&
                    row.placementReadyCount < row.totalCandidates
                      ? "warning"
                      : "success"
                  }
                />
                <StatCard
                  label="Cases"
                  value={`${row.activeCases} active`}
                  tone={row.activeCases ? "warning" : "success"}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function DistrictMockCircuitPriorityPanel({
  schools,
  circuits,
  mockReadiness,
}: {
  schools: SchoolRow[];
  circuits: CircuitBreakdownRow[];
  mockReadiness?: GovernanceMockReadinessOverview | null;
}) {
  const rows = buildDistrictMockCircuitPriorityRows({
    schools,
    circuits,
    mockReadiness,
  });

  const [selectedCircuitId, setSelectedCircuitId] = useState<string | null>(
    null,
  );

  if (!rows.length) return null;

  const selectedCircuit =
    rows.find((row) => row.circuitId === selectedCircuitId) ?? rows[0];

  const urgentCount = rows.filter(
    (row) => row.priorityLabel === "URGENT_SISSO_FOLLOW_UP",
  ).length;
  const coverageCount = rows.filter(
    (row) => row.priorityLabel === "REQUEST_MOCK_RELEASE_COVERAGE",
  ).length;
  const activeCaseCount = rows.reduce((sum, row) => sum + row.activeCases, 0);

  return (
    <section className="rounded-[28px] border border-fuchsia-300/20 bg-fuchsia-500/10 p-4 md:p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-fuchsia-200">
            District Mock Circuit Priority
          </p>
          <h2 className="mt-1 text-lg font-bold text-white">
            Circuits ranked by BECE Mock supervision urgency
          </h2>
          <p className="mt-1 max-w-4xl text-sm leading-6 text-fuchsia-100/80">
            Director view: circuits first. Select a circuit to see schools
            under it ranked by Mock severity.
          </p>
        </div>

        <span className="w-fit rounded-full border border-fuchsia-300/25 bg-black/20 px-3 py-1 text-xs font-semibold text-fuchsia-100">
          First: {rows[0]?.circuitName ?? "No circuit"}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label="Circuits ranked"
          value={rows.length}
          tone={rows.length ? "info" : "default"}
        />
        <StatCard
          label="Urgent SISSO"
          value={urgentCount}
          tone={urgentCount ? "danger" : "success"}
        />
        <StatCard
          label="Coverage gaps"
          value={coverageCount}
          tone={coverageCount ? "warning" : "success"}
        />
        <StatCard
          label="Active cases"
          value={activeCaseCount}
          tone={activeCaseCount ? "warning" : "success"}
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
          <p className="text-sm font-bold text-white">
            Circuit severity ranking
          </p>
          <p className="mt-1 text-xs leading-5 text-fuchsia-100/75">
            Click a circuit to inspect its schools.
          </p>

          <div className="mt-3 space-y-2">
            {rows.map((row, index) => {
              const isSelected = row.circuitId === selectedCircuit.circuitId;

              return (
                <button
                  key={row.circuitId}
                  type="button"
                  onClick={() => setSelectedCircuitId(row.circuitId)}
                  className={cx(
                    "w-full rounded-2xl border p-3 text-left transition hover:-translate-y-0.5",
                    isSelected
                      ? "border-fuchsia-200/40 bg-fuchsia-500/20"
                      : "border-white/10 bg-black/20",
                  )}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-200">
                      #{index + 1}
                    </span>

                    <span
                      className={cx(
                        "rounded-full border px-3 py-1 text-xs font-semibold",
                        toneClass(
                          districtMockCircuitPriorityTone(row.priorityLabel),
                        ),
                        smallToneText(
                          districtMockCircuitPriorityTone(row.priorityLabel),
                        ),
                      )}
                    >
                      {row.priorityText}
                    </span>

                    <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-semibold text-white">
                      Score {row.priorityScore}
                    </span>
                  </div>

                  <p className="mt-3 font-bold text-white">
                    {row.circuitName}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-slate-400">
                    {row.schools} school(s) · {row.schoolsWithReleasedMock} with
                    released Mock · {row.schoolsWithoutReleasedMock} missing
                    release
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-bold text-white">
                {selectedCircuit.circuitName}
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-400">
                {selectedCircuit.districtName || "No district"} ·{" "}
                {selectedCircuit.schools} school(s)
              </p>
            </div>

            <span
              className={cx(
                "w-fit rounded-full border px-3 py-1 text-xs font-semibold",
                toneClass(
                  districtMockCircuitPriorityTone(
                    selectedCircuit.priorityLabel,
                  ),
                ),
                smallToneText(
                  districtMockCircuitPriorityTone(
                    selectedCircuit.priorityLabel,
                  ),
                ),
              )}
            >
              {selectedCircuit.priorityText}
            </span>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
            <StatCard
              label="Schools"
              value={selectedCircuit.schools}
              helper={`${selectedCircuit.schoolsWithReleasedMock} released · ${selectedCircuit.schoolsWithoutReleasedMock} missing`}
              tone={selectedCircuit.schoolsWithoutReleasedMock ? "warning" : "success"}
            />
            <StatCard
              label="Avg aggregate"
              value={formatOptionalNumber(
                selectedCircuit.averagePlacementAggregate,
              )}
              tone={
                selectedCircuit.averagePlacementAggregate == null
                  ? "warning"
                  : selectedCircuit.averagePlacementAggregate > 24
                    ? "danger"
                    : "success"
              }
            />
            <StatCard
              label="Aggregate range"
              value={aggregateRangeDisplay(selectedCircuit.latestAggregateRange)}
              helper={
                selectedCircuit.previousAggregateRange
                  ? aggregateRangeDisplay(selectedCircuit.previousAggregateRange)
                  : "No previous released Mock"
              }
              tone={
                selectedCircuit.averagePlacementAggregate == null
                  ? "warning"
                  : selectedCircuit.averagePlacementAggregate > 24
                    ? "danger"
                    : "success"
              }
            />
            <StatCard
              label="Cases"
              value={`${selectedCircuit.activeCases} active`}
              helper={`${selectedCircuit.resolvedCases} resolved`}
              tone={selectedCircuit.activeCases ? "warning" : "success"}
            />
          </div>

          <p className="mt-4 text-sm leading-6 text-fuchsia-100/90">
            <span className="font-semibold text-white">Why: </span>
            {selectedCircuit.reason}
          </p>

          <p className="mt-2 text-sm leading-6 text-emerald-100/90">
            <span className="font-semibold text-white">Director action: </span>
            {selectedCircuit.action}
          </p>

          <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
              Schools under this circuit
            </p>

            <div className="mt-3 space-y-2">
              {selectedCircuit.schoolRows.length ? (
                selectedCircuit.schoolRows.map((school, index) => (
                  <article
                    key={school.schoolId}
                    className="rounded-xl border border-white/10 bg-white/[0.04] p-3"
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[11px] font-semibold text-slate-200">
                            #{index + 1}
                          </span>
                          <span
                            className={cx(
                              "rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                              toneClass(
                                circuitMockPriorityTone(
                                  school.priorityLabel,
                                ),
                              ),
                              smallToneText(
                                circuitMockPriorityTone(
                                  school.priorityLabel,
                                ),
                              ),
                            )}
                          >
                            {school.priorityText}
                          </span>
                        </div>

                        <p className="mt-2 text-sm font-bold text-white">
                          {school.schoolName}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">
                          {school.schoolCode || "No school code"} ·{" "}
                          {school.latestMockLabel || "No released Mock"}
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4 lg:min-w-[520px]">
                        <StatCard
                          label="Aggregate range"
                          value={aggregateRangeDisplay(
                            school.latestAggregateRange,
                          )}
                          helper={
                            school.previousAggregateRange
                              ? aggregateRangeDisplay(
                                  school.previousAggregateRange,
                                )
                              : "No previous released Mock"
                          }
                          tone={
                            school.averagePlacementAggregate == null
                              ? "warning"
                              : school.averagePlacementAggregate > 24
                                ? "danger"
                                : "success"
                          }
                        />
                        <StatCard
                          label="Movement"
                          value={movementDisplay(school.aggregateMovement)}
                          tone={mockTrendTone(school.trendLabel)}
                        />
                        <StatCard
                          label="Ready"
                          value={
                            school.totalCandidates
                              ? `${school.placementReadyCount}/${school.totalCandidates}`
                              : "—"
                          }
                          tone={
                            school.totalCandidates &&
                            school.placementReadyCount < school.totalCandidates
                              ? "warning"
                              : "success"
                          }
                        />
                        <StatCard
                          label="Cases"
                          value={`${school.activeCases} active`}
                          tone={school.activeCases ? "warning" : "success"}
                        />
                      </div>
                    </div>
                  </article>
                ))
              ) : (
                <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3 text-sm text-slate-300">
                  No school rows are available for this circuit.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function GovernanceCommandDashboardClient({
  endpoint,
  eyebrow,
  title,
  description,
  accountabilityTitle,
  accountabilityDescription,
}: Props) {
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<PanelKey>("risk");
  const [isGovernanceLogbookOpen, setIsGovernanceLogbookOpen] =
    useState(false);
  const panelContentRef = useRef<HTMLDivElement | null>(null);

  function openPanel(panel: PanelKey) {
    setActivePanel(panel);

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const prefersReducedMotion = window.matchMedia(
          "(prefers-reduced-motion: reduce)",
        ).matches;

        panelContentRef.current?.scrollIntoView({
          behavior: prefersReducedMotion ? "auto" : "smooth",
          block: "start",
        });
      });
    });
  }

  const isDistrictView = endpoint.includes("/district/");
  const isCircuitView = endpoint.includes("/circuit/");

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(endpoint, {
        cache: "no-store",
        credentials: "include",
        headers: { Accept: "application/json" },
      });

      const json = (await res
        .json()
        .catch(() => null)) as OverviewResponse | null;

      if (!res.ok || !json?.ok) {
        setData(null);
        setError(
          json && !json.ok
            ? json.error
            : `Failed to load governance summary (${res.status})`,
        );
        return;
      }

      setData(json);
    } catch {
      setData(null);
      setError("Network/server error while loading governance summary.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint]);

  const overview = data?.ok ? data.overview : null;
  const scope = data?.ok ? data.scope : null;

  const canRequestDirectorFeedback =
    isDistrictView &&
    Boolean(
      scope?.assignments?.some(
        (assignment) =>
          String(assignment.role ?? "")
            .trim()
            .toUpperCase() === "DISTRICT_DIRECTOR",
      ),
    );

  const schools = useMemo(() => overview?.schools ?? [], [overview]);
  const circuits = useMemo(() => overview?.circuitBreakdown ?? [], [overview]);
  const totals = overview?.totals ?? {};
  const signals = overview?.signals ?? {};
  const teacherAttendance = overview?.teacherAttendance ?? null;
  const teacherAbsenteeism = overview?.teacherAbsenteeism ?? null;
  const sectorSummary = overview?.sectorSummary ?? {};

  const teacherAttendanceEnabled =
    overview?.featureAvailability?.teacherAttendance === true;

  const absenteeTeacherCount = numberValue(
    teacherAbsenteeism?.flaggedTeachers,
  );
  const absenteeSchoolCount = numberValue(
    teacherAbsenteeism?.schoolsWithCases,
  );
  const absenteeCircuitCount = numberValue(
    teacherAbsenteeism?.circuitsWithCases,
  );
  const absenteeRiskTone: "danger" | "success" =
    absenteeTeacherCount > 0 ? "danger" : "success";
  const mockReadiness = overview?.mockReadiness ?? null;

  const publicSchools =
    numberValue(totals.publicSchools) ||
    numberValue(sectorSummary.public?.schools) ||
    schools.filter((school) => school.schoolSector === "PUBLIC").length;

  const privateSchools =
    numberValue(totals.privateSchools) ||
    numberValue(sectorSummary.private?.schools) ||
    schools.filter((school) => school.schoolSector === "PRIVATE").length;

  const schoolCount =
    numberValue(totals.schools) || schools.length || scope?.tenantCount || 0;

const circuitCount =
  numberValue(totals.circuits) || circuits.length || 0;

  const teacherAttendanceNeedsAction = numberValue(teacherAttendance?.needsAction);
  const teacherAttendanceCertifiedSchools = numberValue(teacherAttendance?.schoolsCertified);
  const teacherAttendanceMissingSchools = numberValue(teacherAttendance?.schoolsMissingSession);
  const teacherAttendanceUncertifiedSchools = numberValue(teacherAttendance?.schoolsUncertified);
  const teacherAttendancePresent = numberValue(teacherAttendance?.present);
  const teacherAttendanceAbsent = numberValue(teacherAttendance?.absent);
  const teacherAttendanceLate = numberValue(teacherAttendance?.late);
  const teacherAttendanceMarked = numberValue(teacherAttendance?.marked);
  const teacherAttendanceTeachers = numberValue(teacherAttendance?.teachers);
  const teacherAttendanceCompletion = numberValue(teacherAttendance?.completionPct);
  const teacherAttendancePresentRate = numberValue(teacherAttendance?.presentPct);
  const teacherAttendanceFollowUpSchools = teacherAttendance?.schoolsNeedingFollowUp ?? [];

  const lessonCompliance =
    numberValue(signals.lessonDeliveryComplianceRate) ||
    numberValue(totals.lessonDeliveryComplianceRate);

  const assessmentCompletion =
    numberValue(signals.assessmentCompletionRate) ||
    numberValue(totals.assessmentCompletionRate);

const generatedAt = compactDateTime(overview?.generatedAt);

const mockReleasedCoverage = mockReadiness
  ? `${mockReadiness.schoolsWithReleasedMock}/${mockReadiness.schools}`
  : "—";

const mockPriorityRows = useMemo(
  () =>
    isCircuitView
      ? buildCircuitMockVisitPriorityRows({ schools, mockReadiness })
      : [],
  [isCircuitView, schools, mockReadiness],
);

const mockUrgentVisits = mockPriorityRows.filter(
  (row) => row.priorityLabel === "URGENT_VISIT",
).length;

const mockCircuitPriorityRows = useMemo(
  () =>
    isDistrictView
      ? buildDistrictMockCircuitPriorityRows({
          schools,
          circuits,
          mockReadiness,
        })
      : [],
  [isDistrictView, schools, circuits, mockReadiness],
);

const mockUrgentCircuits = mockCircuitPriorityRows.filter(
  (row) => row.priorityLabel === "URGENT_SISSO_FOLLOW_UP",
).length;

const mockCoverageGapCircuits = mockCircuitPriorityRows.filter(
  (row) => row.priorityLabel === "REQUEST_MOCK_RELEASE_COVERAGE",
).length;

const mockMissingReleases = mockPriorityRows.filter(
  (row) => row.priorityLabel === "REQUEST_MOCK_RELEASE",
).length;

const mockQueuePanelKey: PanelKey = isDistrictView
  ? "mock-circuit-priority"
  : "mock-priority";

const mockQueueTitle = isDistrictView ? "Circuit queue" : "School queue";

const mockQueueValue = isDistrictView
  ? mockUrgentCircuits
    ? `${mockUrgentCircuits} urgent`
    : mockCoverageGapCircuits
      ? `${mockCoverageGapCircuits} coverage`
      : "Ready"
  : mockUrgentVisits
    ? `${mockUrgentVisits} urgent`
    : mockMissingReleases
      ? `${mockMissingReleases} missing`
      : "Ready";

const mockQueueTone: "success" | "warning" | "danger" =
  isDistrictView
    ? mockUrgentCircuits
      ? "danger"
      : mockCoverageGapCircuits
        ? "warning"
        : "success"
    : mockUrgentVisits
      ? "danger"
      : mockMissingReleases
        ? "warning"
        : "success";

const mockPanelActive =
  activePanel === "mock-readiness" ||
  activePanel === "mock-priority" ||
  activePanel === "mock-circuit-priority";

const mockCommandTile = (
  <div
    className={cx(
      "rounded-[24px] border p-3 transition",
      toneClass(
        mockReadiness?.schoolsNeedingFollowUp || mockQueueTone !== "success"
          ? mockQueueTone
          : mockReadiness?.schoolsWithReleasedMock
            ? "success"
            : "default",
      ),
      mockPanelActive ? "ring-2 ring-white/20" : "",
    )}
  >
    <div className="flex items-start justify-between gap-3">
      <span className="text-xl">🎯</span>
      <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[11px] font-bold text-white">
        Mock
      </span>
    </div>

    <p className="mt-3 text-sm font-bold text-white">BECE Mock Command</p>
    <p className="mt-1 text-xs leading-5 text-slate-300">
      Readiness and follow-up queue in one place.
    </p>

    <div className="mt-3 grid grid-cols-2 gap-2">
      <button
        type="button"
        onClick={() => openPanel("mock-readiness")}
        className={cx(
          "rounded-2xl border px-3 py-2 text-left transition hover:bg-white/[0.08]",
          activePanel === "mock-readiness"
            ? "border-amber-200/40 bg-amber-400/15"
            : "border-white/10 bg-black/20",
        )}
      >
        <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">
          Readiness
        </p>
        <p className="mt-0.5 truncate text-sm font-bold text-white">
          {mockReleasedCoverage}
        </p>
      </button>

      <button
        type="button"
        onClick={() => openPanel(mockQueuePanelKey)}
        className={cx(
          "rounded-2xl border px-3 py-2 text-left transition hover:bg-white/[0.08]",
          activePanel === mockQueuePanelKey
            ? "border-red-200/40 bg-red-500/15"
            : "border-white/10 bg-black/20",
        )}
      >
        <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">
          {mockQueueTitle}
        </p>
        <p className="mt-0.5 truncate text-sm font-bold text-white">
          {mockQueueValue}
        </p>
      </button>
    </div>
  </div>
);

  return (
    <main className="space-y-5">
      <section className="relative overflow-hidden rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(5,7,11,0.94),rgba(7,26,61,0.94),rgba(5,7,11,0.97))] p-5 shadow-[0_26px_90px_rgba(0,0,0,0.28)] md:p-6">
        <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:64px_64px]" />
        <div className="absolute -left-16 top-0 h-48 w-48 rounded-full bg-[#1B66D1]/20 blur-3xl" />
        <div className="absolute right-0 top-0 h-44 w-44 rounded-full bg-[#D4AF37]/14 blur-3xl" />

        <div className="relative">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-[#E8C96A]">
                {eyebrow}
              </p>

              <h1 className="mt-2 text-2xl font-semibold text-[#F7F4ED] md:text-3xl">
                {title}
              </h1>

              <p className="mt-2 max-w-3xl text-sm leading-7 text-[#C9CDD6]">
                {description}
              </p>

              <p className="mt-3 text-xs text-slate-400">
                Last generated: {generatedAt}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
  <button
    type="button"
    onClick={() => void signOut({ callbackUrl: "/auth/signin" })}
    className="w-fit rounded-full border border-red-300/20 bg-red-500/10 px-4 py-2 text-xs font-semibold text-red-100 hover:bg-red-500/20"
  >
    Logout
  </button>

  <button
    type="button"
    onClick={() => void load()}
    disabled={loading}
    className="w-fit rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-white hover:bg-white/10 disabled:opacity-50"
  >
    {loading ? "Refreshing..." : "Refresh"}
  </button>
</div>
          </div>

          {error ? (
            <div className="mt-5 rounded-2xl border border-red-300/20 bg-red-500/10 p-4 text-sm text-red-100">
              {error}
            </div>
          ) : null}

<div className="mt-4 grid grid-cols-4 gap-1.5 sm:gap-2 lg:gap-3">
  <StatCard
    label="Schools"
    value={schoolCount}
    helper={`${publicSchools} public · ${privateSchools} private`}
    tone="info"
  />

  {isDistrictView ? (
    <StatCard
      label="Circuits"
      value={circuitCount}
      helper={`${schoolCount} school(s) under district command`}
      tone="info"
    />
  ) : (
    <StatCard
      label="Learner attendance"
      value={`${schoolCount} school(s)`}
      helper="Population · present · absent"
      tone="info"
      onClick={() => openPanel("students-attendance")}
      active={activePanel === "students-attendance"}
    />
  )}

  {teacherAttendanceEnabled ? (
    <>
      <StatCard
        label="Absent teachers"
        value={absenteeTeacherCount}
        helper={
          absenteeTeacherCount
            ? "3+ certified absent days"
            : "No teacher reached 3 days"
        }
        tone={absenteeRiskTone}
        onClick={() => openPanel("risk")}
        active={activePanel === "risk"}
      />

      <StatCard
        label="Affected schools"
        value={absenteeSchoolCount}
        helper={
          isDistrictView
            ? `${absenteeCircuitCount} circuit(s)`
            : "Tap to see teachers"
        }
        tone={absenteeRiskTone}
        onClick={() => openPanel("risk")}
        active={activePanel === "risk"}
      />
    </>
  ) : (
    <>
      <StatCard
        label="Teacher attendance"
        value="Off"
        helper="Disabled by Superadmin safety policy"
        tone="default"
      />
      <StatCard
        label="Teacher risk"
        value="Off"
        helper="No absenteeism ranking while attendance is off"
        tone="default"
      />
    </>
  )}
</div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-5">
  {isDistrictView ? (
    <>
      {teacherAttendanceEnabled ? (
        <CommandTile
          icon="🔥"
          title="Risk Board"
          description="Teachers absent for 3 certified days or more."
          value={absenteeTeacherCount}
          tone={absenteeRiskTone}
          active={activePanel === "risk"}
          onClick={() => openPanel("risk")}
        />
      ) : (
        <LockedCommandTile
          icon="🔥"
          title="Risk Board"
          description="Teacher absenteeism ranking is unavailable while Teacher Attendance is deactivated."
          badge="Temporarily off"
        />
      )}

      <CommandTile
        icon="🧒"
        title="Students Attendance"
        description={
          isCircuitView
            ? "School population, official attendance, term trend and follow-up."
            : "Circuit population, official attendance and follow-up."
        }
        value={isCircuitView ? `${schoolCount} schools` : `${circuitCount} circuits`}
        tone="info"
        active={activePanel === "students-attendance"}
        onClick={() => openPanel("students-attendance")}
      />

      {teacherAttendanceEnabled ? (
        <CommandTile
          icon="👨‍🏫"
          title="Teacher Attendance"
          description="Certified staff presence by school."
          value={
            teacherAttendanceNeedsAction
              ? `${teacherAttendanceNeedsAction} follow-up`
              : teacherAttendanceCertifiedSchools
                ? `${teacherAttendanceCertifiedSchools} certified`
                : "0 certified"
          }
          tone={
            teacherAttendanceNeedsAction
              ? "warning"
              : teacherAttendanceCertifiedSchools
                ? "success"
                : "info"
          }
          active={activePanel === "teacher-attendance"}
          onClick={() => openPanel("teacher-attendance")}
        />
      ) : (
        <LockedCommandTile
          icon="👨‍🏫"
          title="Teacher Attendance"
          description="Temporarily unavailable until the platform safety control is activated."
          badge="Temporarily off"
        />
      )}

      <CommandTile
        icon="📚"
        title="Scheme Coverage"
        description="Prepared, submitted, approved, and missing schemes."
        value="Prep"
        tone="info"
        active={activePanel === "scheme-coverage"}
        onClick={() => openPanel("scheme-coverage")}
      />

      <CommandTile
        icon="📘"
        title="Lesson Delivery"
        description="Teaching evidence health."
        value={lessonCompliance ? percentValue(lessonCompliance) : "—"}
        tone={
          lessonCompliance && lessonCompliance < 70 ? "warning" : "info"
        }
        active={activePanel === "lesson"}
        onClick={() => openPanel("lesson")}
      />

      <CommandTile
        icon="📊"
        title="Students Assessment"
        description="Learner scoring and assessment proof."
        value={
          assessmentCompletion ? percentValue(assessmentCompletion) : "—"
        }
        tone={
          assessmentCompletion && assessmentCompletion < 60
            ? "warning"
            : "info"
        }
        active={activePanel === "students-assessment"}
        onClick={() => openPanel("students-assessment")}
      />

      <CommandTile
        icon="🧭"
        title="Appraisals"
        description="Assess, review reports, and view governance feedback."
        value="Hub"
        tone="info"
        active={
          activePanel === "appraisals" ||
          activePanel === "teacher-appraisal" ||
          activePanel === "teacher-appraisal-headteacher"
        }
        onClick={() => openPanel("appraisals")}
      />

      {mockCommandTile}

      <LockedCommandTile
        icon="📈"
        title="BECE Results Analysis"
        description="Official BECE result trends and school comparisons will appear here after the results-analysis workflow is verified."
        badge="Planned"
      />

      <CommandTile
        icon="📨"
        title="Official Notices"
        description="Send official notices and check follow-up evidence."
        tone="info"
        active={activePanel === "notices"}
        onClick={() => openPanel("notices")}
      />
    </>
  ) : (
    <>
      {teacherAttendanceEnabled ? (
        <CommandTile
          icon="🔥"
          title="Risk Board"
          description="Teachers absent for 3 certified days or more."
          value={absenteeTeacherCount}
          tone={absenteeRiskTone}
          active={activePanel === "risk"}
          onClick={() => openPanel("risk")}
        />
      ) : (
        <LockedCommandTile
          icon="🔥"
          title="Risk Board"
          description="Teacher absenteeism ranking is unavailable while Teacher Attendance is deactivated."
          badge="Temporarily off"
        />
      )}

      <CommandTile
        icon="🧒"
        title="Students Attendance"
        description={
          isCircuitView
            ? "School population, official attendance, term trend and follow-up."
            : "Circuit population, official attendance and follow-up."
        }
        value={isCircuitView ? `${schoolCount} schools` : `${circuitCount} circuits`}
        tone="info"
        active={activePanel === "students-attendance"}
        onClick={() => openPanel("students-attendance")}
      />

      {teacherAttendanceEnabled ? (
        <CommandTile
          icon="👨‍🏫"
          title="Teacher Attendance"
          description="Certified staff presence by school."
          value={
            teacherAttendanceNeedsAction
              ? `${teacherAttendanceNeedsAction} follow-up`
              : teacherAttendanceCertifiedSchools
                ? `${teacherAttendanceCertifiedSchools} certified`
                : "0 certified"
          }
          tone={
            teacherAttendanceNeedsAction
              ? "warning"
              : teacherAttendanceCertifiedSchools
                ? "success"
                : "info"
          }
          active={activePanel === "teacher-attendance"}
          onClick={() => openPanel("teacher-attendance")}
        />
      ) : (
        <LockedCommandTile
          icon="👨‍🏫"
          title="Teacher Attendance"
          description="Temporarily unavailable until the platform safety control is activated."
          badge="Temporarily off"
        />
      )}

      <CommandTile
        icon="📚"
        title="Scheme Coverage"
        description="Prepared, submitted, approved, and missing schemes."
        value="Prep"
        tone="info"
        active={activePanel === "scheme-coverage"}
        onClick={() => openPanel("scheme-coverage")}
      />

      <CommandTile
        icon="📘"
        title="Lesson Delivery"
        description="Teaching evidence health."
        value={lessonCompliance ? percentValue(lessonCompliance) : "—"}
        tone={
          lessonCompliance && lessonCompliance < 70 ? "warning" : "info"
        }
        active={activePanel === "lesson"}
        onClick={() => openPanel("lesson")}
      />

      <CommandTile
        icon="📊"
        title="Students Assessment"
        description="Learner scoring and assessment proof."
        value={
          assessmentCompletion ? percentValue(assessmentCompletion) : "—"
        }
        tone={
          assessmentCompletion && assessmentCompletion < 60
            ? "warning"
            : "info"
        }
        active={activePanel === "students-assessment"}
        onClick={() => openPanel("students-assessment")}
      />

      <CommandTile
        icon="🧭"
        title="Appraisals"
        description="Assess, review reports, and view governance feedback."
        value="Hub"
        tone="info"
        active={
          activePanel === "appraisals" ||
          activePanel === "teacher-appraisal" ||
          activePanel === "teacher-appraisal-headteacher"
        }
        onClick={() => openPanel("appraisals")}
      />

      {mockCommandTile}

      <LockedCommandTile
        icon="📈"
        title="BECE Results Analysis"
        description="Circuit-level BECE result trends and school comparisons will appear here after the results-analysis workflow is verified."
        badge="Planned"
      />

      <CommandTile
        icon="📨"
        title="Official Notices"
        description="Send official notices and check follow-up evidence."
        tone="info"
        active={activePanel === "notices"}
        onClick={() => openPanel("notices")}
      />
    </>
  )}
</section>

      <div
        ref={panelContentRef}
        className="scroll-mt-4"
        aria-hidden="true"
      />

      {activePanel === "mock-readiness" ? (
        <GovernanceMockReadinessPanel
          mockReadiness={mockReadiness}
          isDistrictView={isDistrictView}
        />
      ) : null}

      {activePanel === "mock-priority" && isCircuitView ? (
        <CircuitMockVisitPriorityPanel
          schools={schools}
          mockReadiness={mockReadiness}
        />
      ) : null}

      {activePanel === "mock-circuit-priority" && isDistrictView ? (
        <DistrictMockCircuitPriorityPanel
  schools={schools}
  circuits={circuits}
  mockReadiness={mockReadiness}
/>
      ) : null}

      {activePanel === "risk" && teacherAttendanceEnabled ? (
        <GovernanceTeacherAbsenteeismRiskPanel
          data={teacherAbsenteeism}
          isDistrictView={isDistrictView}
        />
      ) : null}

      {activePanel === "risk" && !teacherAttendanceEnabled ? (
        <section className="rounded-[28px] border border-amber-300/20 bg-amber-400/10 p-4 md:p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-200">
            Teacher accountability safety control
          </p>
          <h2 className="mt-2 text-lg font-bold text-white">
            Teacher Attendance and absenteeism risk are temporarily off
          </h2>
          <p className="mt-2 text-sm leading-6 text-amber-100/80">
            The Superadmin has deactivated Teacher Attendance while fair-use
            safeguards are being finalized. Historical records remain preserved,
            but this governance dashboard does not query or rank Teacher
            Attendance while the feature is off.
          </p>
        </section>
      ) : null}

      {activePanel === "students-attendance" ? (
        <GovernanceStudentAttendancePanel
          endpoint={
            isCircuitView
              ? "/api/circuit/student-attendance"
              : "/api/district/student-attendance"
          }
          view={isCircuitView ? "SCHOOL" : "CIRCUIT"}
        />
      ) : null}

{activePanel === "teacher-attendance" && teacherAttendanceEnabled ? (
  <section className="rounded-[28px] border border-sky-300/20 bg-sky-500/10 p-4 md:p-5">
    <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-200">
          Teacher Attendance command signal
        </p>
        <h2 className="mt-1 text-lg font-bold text-white">
          Certified staff attendance truth
        </h2>
        <p className="mt-1 text-sm leading-6 text-sky-100/80">
          This panel counts only certified teacher attendance registers as
          governance truth. Open, closed-but-uncertified, or missing registers
          remain follow-up signals.
        </p>
      </div>

      <span className="w-fit rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-semibold text-white">
        {teacherAttendance?.date ?? "Today"}
      </span>
    </div>

    <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
      <StatCard
        label="Schools certified"
        value={teacherAttendanceCertifiedSchools}
        helper={`${teacherAttendance?.schools ?? schoolCount} school(s) in scope`}
        tone={teacherAttendanceCertifiedSchools ? "success" : "warning"}
      />
      <StatCard
        label="Missing register"
        value={teacherAttendanceMissingSchools}
        tone={teacherAttendanceMissingSchools ? "warning" : "success"}
      />
      <StatCard
        label="Uncertified"
        value={teacherAttendanceUncertifiedSchools}
        helper="Open or closed but not certified"
        tone={teacherAttendanceUncertifiedSchools ? "warning" : "success"}
      />
      <StatCard
        label="Completion"
        value={percentValue(teacherAttendanceCompletion)}
        helper={`${teacherAttendanceMarked}/${teacherAttendanceTeachers} teacher marks`}
        tone={teacherAttendanceCompletion < 100 ? "warning" : "success"}
      />
      <StatCard
        label="Present"
        value={teacherAttendancePresent}
        helper={`${percentValue(teacherAttendancePresentRate)} of marked`}
        tone="success"
      />
      <StatCard
        label="Absent"
        value={teacherAttendanceAbsent}
        tone={teacherAttendanceAbsent ? "warning" : "success"}
      />
      <StatCard
        label="Late"
        value={teacherAttendanceLate}
        tone={teacherAttendanceLate ? "warning" : "success"}
      />
      <StatCard
        label="Follow-up"
        value={teacherAttendanceNeedsAction}
        tone={teacherAttendanceNeedsAction ? "warning" : "success"}
      />
    </div>

    <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/45 p-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-bold text-white">
            Schools needing teacher-attendance follow-up
          </p>
          <p className="text-xs leading-5 text-sky-100/75">
            Missing registers, open registers, uncertified registers, and
            certified registers with absent/late teacher marks appear here.
          </p>
        </div>
        <span className="w-fit rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-white">
          {teacherAttendanceFollowUpSchools.length} shown
        </span>
      </div>

      <div className="mt-3 space-y-3">
        {teacherAttendanceFollowUpSchools.length ? (
          teacherAttendanceFollowUpSchools.map((school) => (
            <article
              key={school.tenantId}
              className="rounded-2xl border border-white/10 bg-black/20 p-3"
            >
              <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={cx(
                        "rounded-full border px-3 py-1 text-[11px] font-semibold",
                        sectorBadgeClass(school.schoolSector),
                      )}
                    >
                      {sectorLabel(school.schoolSector)}
                    </span>
                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold text-slate-200">
                      {school.circuitName ?? "No circuit"}
                    </span>
                    <span
                      className={cx(
                        "rounded-full border px-3 py-1 text-[11px] font-semibold",
                        school.isCertified
                          ? "border-emerald-300/25 bg-emerald-400/10 text-emerald-100"
                          : "border-amber-300/25 bg-amber-400/10 text-amber-100",
                      )}
                    >
                      {school.isCertified ? "Certified" : school.hasSession ? "Not certified" : "No register"}
                    </span>
                  </div>

                  <h3 className="mt-2 text-sm font-bold text-white">
                    {school.schoolName}
                  </h3>
                  <p className="mt-1 text-xs leading-5 text-sky-100/80">
                    {school.schoolCode || "No school code"} · {school.reason}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4 xl:min-w-[560px]">
                  <StatCard
                    label="Teachers"
                    value={school.teachers}
                    tone="default"
                  />
                  <StatCard
                    label="Marked"
                    value={`${school.marked}/${school.teachers}`}
                    helper={`${school.completionPct}% complete`}
                    tone={school.completionPct < 100 ? "warning" : "success"}
                  />
                  <StatCard
                    label="Present"
                    value={school.present}
                    helper={`${school.presentPct}% of marked`}
                    tone="success"
                  />
                  <StatCard
                    label="Absent / Late"
                    value={school.absent + school.late}
                    helper={`${school.absent} absent · ${school.late} late`}
                    tone={school.absent + school.late ? "warning" : "success"}
                  />
                </div>
              </div>
            </article>
          ))
        ) : (
          <div className="rounded-2xl border border-emerald-300/20 bg-emerald-400/10 p-4 text-sm text-emerald-100">
            No teacher-attendance follow-up school detected from certified
            staff attendance truth.
          </div>
        )}
      </div>
    </div>
  </section>
) : null}

      {activePanel === "teacher-attendance" && !teacherAttendanceEnabled ? (
        <section className="rounded-[28px] border border-amber-300/20 bg-amber-400/10 p-4 md:p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-200">
            Teacher Attendance safety control
          </p>
          <h2 className="mt-2 text-lg font-bold text-white">
            Teacher Attendance is temporarily unavailable
          </h2>
          <p className="mt-2 text-sm leading-6 text-amber-100/80">
            No Teacher Attendance register or absenteeism-risk data is exposed
            to governance while the global safety switch is off. Student
            Attendance remains active.
          </p>
        </section>
      ) : null}

{activePanel === "scheme-coverage" ? (
  <GovernanceSchemeCoveragePanel
    isDistrictView={isDistrictView}
    isCircuitView={isCircuitView}
  />
) : null}

{activePanel === "appraisals" && (isDistrictView || isCircuitView) ? (
  <section className="rounded-[28px] border border-fuchsia-300/20 bg-fuchsia-500/10 p-4 md:p-5">
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-fuchsia-200">
        {isDistrictView ? "District Appraisals" : "Circuit Appraisals"}
      </p>
      <h2 className="mt-1 text-lg font-bold text-white">
        One place for assessment, review, and governance feedback
      </h2>
      <p className="mt-1 max-w-4xl text-sm leading-6 text-fuchsia-100/80">
        Teacher appraisal reports and Headteacher appraisal workflows are available within each officer’s authorized scope.
      </p>
    </div>

    <div className="mt-4 grid gap-3 md:grid-cols-3">
      <article className="rounded-2xl border border-emerald-300/25 bg-emerald-400/10 p-4">
        <div className="flex items-start justify-between gap-3">
          <span className="text-xl">📝</span>
          <span className="rounded-full border border-emerald-300/25 bg-black/20 px-2.5 py-1 text-[11px] font-bold text-emerald-100">
            Assessment active
          </span>
        </div>

        <p className="mt-3 text-sm font-bold text-white">
          Teacher Appraisal
        </p>
        <p className="mt-1 text-xs leading-5 text-emerald-100/80">
          Assess authorized Teachers with the official six-section,
          34-indicator observation form, or review finalized reports within{" "}
          {isDistrictView ? "district" : "circuit"} scope.
        </p>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <a
            href="/governance/appraisals/teacher-supervisory"
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[linear-gradient(135deg,#D4AF37,#E8C96A)] px-4 py-2 text-center text-xs font-bold text-[#071A3D] transition hover:brightness-105"
          >
            Assess Teacher
          </a>

          <button
            type="button"
            onClick={() => openPanel("teacher-appraisal")}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-emerald-300/30 bg-emerald-400/10 px-4 py-2 text-center text-xs font-bold text-emerald-50 transition hover:bg-emerald-400/20"
          >
            Open reports
          </button>
        </div>
      </article>

      <article className="rounded-2xl border border-indigo-300/25 bg-indigo-400/10 p-4 text-left">
        <div className="flex items-start justify-between gap-3">
          <span className="text-xl">🏫</span>
          <span className="rounded-full border border-indigo-300/25 bg-black/20 px-2.5 py-1 text-[11px] font-bold text-indigo-100">
            Available
          </span>
        </div>

        <p className="mt-3 text-sm font-bold text-white">
          Headteacher Appraisal
        </p>
        <p className="mt-1 text-xs leading-5 text-indigo-100/80">
          {isDistrictView
            ? "Assess authorized Headteachers or review Headteacher appraisal requests and completed review work."
            : "Complete authorized Headteacher supervisory assessments within your circuit."}
        </p>

        {isDistrictView ? (
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <a
              href="/governance/appraisals/headteacher-supervisory"
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[linear-gradient(135deg,#D4AF37,#E8C96A)] px-4 py-2 text-center text-xs font-bold text-[#071A3D] transition hover:brightness-105"
            >
              Assess Headteacher
            </a>

            <a
              href="/district/headteacher-appraisals/review"
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-indigo-300/30 bg-indigo-400/10 px-4 py-2 text-center text-xs font-bold text-indigo-50 transition hover:bg-indigo-400/20"
            >
              Review Headteacher requests
            </a>
          </div>
        ) : (
          <a
            href="/governance/appraisals/headteacher-supervisory"
            className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-[linear-gradient(135deg,#D4AF37,#E8C96A)] px-4 py-2 text-center text-xs font-bold text-[#071A3D] transition hover:brightness-105"
          >
            Assess Headteacher
          </a>
        )}
      </article>

      {canRequestDirectorFeedback ? (
        <div className="rounded-2xl border border-cyan-300/25 bg-cyan-400/10 p-4">
          <div className="flex items-start justify-between gap-3">
            <span className="text-xl">🧭</span>
            <span className="rounded-full border border-cyan-300/25 bg-black/20 px-2.5 py-1 text-[11px] font-bold text-cyan-100">
              Available
            </span>
          </div>

          <p className="mt-3 text-sm font-bold text-white">
            My Appraisal
          </p>

          <p className="mt-1 text-xs leading-5 text-cyan-100/80">
            Request confidential headteacher feedback on your leadership.
          </p>

         <div className="mt-4 flex flex-col gap-2 sm:flex-row">
  <a
    href="/district/director-feedback"
    className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[linear-gradient(135deg,#D4AF37,#E8C96A)] px-4 py-2 text-center text-xs font-bold text-[#071A3D]"
  >
    Request for Appraisal
  </a>

  <a
    href="/district/director-feedback/review"
    className="inline-flex min-h-11 items-center justify-center rounded-xl border border-cyan-300/30 bg-cyan-400/10 px-4 py-2 text-center text-xs font-bold text-cyan-50 transition hover:bg-cyan-400/20"
  >
    Review Appraisal
  </a>
</div>
        </div>
      ) : (
        <div
          aria-disabled="true"
          className="rounded-2xl border border-white/10 bg-black/20 p-4 opacity-75"
        >
          <div className="flex items-start justify-between gap-3">
            <span className="text-xl">🧭</span>
            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-bold text-slate-300">
              Locked
            </span>
          </div>

          <p className="mt-3 text-sm font-bold text-white">
            My Appraisal
          </p>

          <p className="mt-1 text-xs leading-5 text-slate-300">
            Confidential headteacher feedback about the{" "}
            {isDistrictView ? "governance officer" : "SISSO"} will appear here
            after the governance-appraisal workflow is verified.
          </p>
        </div>
      )}
    </div>

    <div className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-400/10 p-4 text-sm leading-6 text-amber-100">
      Confidential appraisal identities and reports must remain restricted to
      authorized officers and auditable review paths.
    </div>
  </section>
) : null}

{activePanel === "teacher-appraisal" ? (
  isDistrictView ? (
    <section className="rounded-[28px] border border-emerald-300/20 bg-emerald-400/10 p-4 md:p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-200">
        Teacher Appraisal Reports
      </p>
      <h2 className="mt-1 text-lg font-bold text-white">
        Choose the report source
      </h2>
      <p className="mt-1 max-w-3xl text-sm leading-6 text-emerald-100/80">
        Headteacher appraisals and governance Teacher appraisals remain separate. Choose the one you want to inspect.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => openPanel("teacher-appraisal-headteacher")}
          className="min-h-20 rounded-2xl border border-white/10 bg-black/20 px-4 py-4 text-left transition hover:bg-black/30"
        >
          <span className="block text-base font-black text-white">
            Headteacher → Teacher reports
          </span>
          <span className="mt-1 block text-xs leading-5 text-slate-300">
            Teacher appraisal reports completed by Headteachers.
          </span>
        </button>

        <a
          href="/governance/appraisals/teacher-supervisory/review"
          className="min-h-20 rounded-2xl border border-emerald-300/25 bg-emerald-400/10 px-4 py-4 text-left transition hover:bg-emerald-400/15"
        >
          <span className="block text-base font-black text-white">
            Governance Teacher reports
          </span>
          <span className="mt-1 block text-xs leading-5 text-emerald-100/80">
            Reports from SISSO, BSC, HOS and District Director governance assessments.
          </span>
        </a>
      </div>
    </section>
  ) : (
    <GovernanceAppraisalDrilldownPanel
      isDistrictView={isDistrictView}
      isCircuitView={isCircuitView}
    />
  )
) : null}

{activePanel === "teacher-appraisal-headteacher" && isDistrictView ? (
  <div className="space-y-3">
    <button
      type="button"
      onClick={() => openPanel("teacher-appraisal")}
      className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] px-4 py-2 text-sm font-bold text-white transition hover:bg-white/[0.09]"
    >
      ← Report sources
    </button>

    <GovernanceAppraisalDrilldownPanel
      isDistrictView={isDistrictView}
      isCircuitView={isCircuitView}
    />
  </div>
) : null}

      {activePanel === "lesson" ? (
        <section className="rounded-[28px] border border-sky-300/20 bg-sky-500/10 p-4 md:p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-200">
            Lesson delivery command signal
          </p>
          <h2 className="mt-1 text-lg font-bold text-white">
            Teaching evidence health
          </h2>

          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard
              label="Compliance"
              value={lessonCompliance ? percentValue(lessonCompliance) : "—"}
              tone={lessonCompliance < 70 ? "warning" : "success"}
            />
            <StatCard
              label="Deliveries"
              value={
                numberValue(signals.lessonDeliveriesLast14Days) ||
                numberValue(totals.lessonDeliveriesLast14Days)
              }
              tone="info"
            />
            <StatCard
              label="Pending notes"
              value={
                numberValue(signals.lessonNotesPendingReview) ||
                numberValue(totals.lessonNotesPendingReview)
              }
              tone={
                numberValue(signals.lessonNotesPendingReview) ||
                numberValue(totals.lessonNotesPendingReview)
                  ? "warning"
                  : "success"
              }
            />
            <StatCard label="Schools" value={schoolCount} tone="default" />
          </div>
        </section>
      ) : null}

      {activePanel === "students-assessment" ? (
        <section className="rounded-[28px] border border-indigo-300/20 bg-indigo-500/10 p-4 md:p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-200">
            Students Assessment command signal
          </p>
          <h2 className="mt-1 text-lg font-bold text-white">
            Students Assessment proof and scoring health
          </h2>

          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard
              label="Scoring"
              value={
                assessmentCompletion ? percentValue(assessmentCompletion) : "—"
              }
              tone={assessmentCompletion < 60 ? "warning" : "success"}
            />
            <StatCard
              label="Published/locked"
              value={
                numberValue(signals.publishedOrLockedAssessments) ||
                numberValue(totals.publishedOrLockedAssessments)
              }
              tone="info"
            />
            <StatCard
              label="Link coverage"
              value={
                signals.assessmentLinkCoverageRate !== undefined ||
                totals.assessmentLinkCoverageRate !== undefined
                  ? percentValue(
                      signals.assessmentLinkCoverageRate ??
                        totals.assessmentLinkCoverageRate,
                    )
                  : "—"
              }
              tone="default"
            />
            <StatCard label="Schools" value={schoolCount} tone="default" />
          </div>
        </section>
      ) : null}

      {activePanel === "notices" ? (
        <section className="space-y-4">
          <GovernanceOfficialNoticeComposer
            isDistrictView={isDistrictView}
            isCircuitView={isCircuitView}
            assignments={scope?.assignments ?? []}
            schools={schools}
          />

          <section className="rounded-[28px] border border-sky-300/20 bg-sky-500/10 p-4 md:p-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-200">
                Notice follow-up
              </p>
              <h2 className="mt-1 text-lg font-bold text-white">
                Check delivery and intervention evidence
              </h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-sky-100/80">
                Open only the record you need. Detailed accountability and the
                intervention logbook stay out of the main dashboard cards.
              </p>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => openPanel("accountability")}
                className="min-h-14 rounded-2xl border border-indigo-300/25 bg-indigo-500/15 px-4 py-3 text-left hover:bg-indigo-500/25"
              >
                <p className="text-sm font-bold text-white">
                  Notice accountability
                </p>
                <p className="mt-1 text-xs leading-5 text-indigo-100/80">
                  See sent, read, acknowledged, and response records.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setIsGovernanceLogbookOpen(true)}
                className="min-h-14 rounded-2xl border border-sky-300/25 bg-sky-500/20 px-4 py-3 text-left hover:bg-sky-500/30"
              >
                <p className="text-sm font-bold text-white">
                  Governance logbook
                </p>
                <p className="mt-1 text-xs leading-5 text-sky-100/80">
                  Review cases, notices, directives, responses, and closure evidence.
                </p>
              </button>
            </div>
          </section>
        </section>
      ) : null}

      {isGovernanceLogbookOpen ? (
        <GovernanceInterventionLogbookClient
          isDistrictView={isDistrictView}
          onClose={() => setIsGovernanceLogbookOpen(false)}
        />
      ) : null}

      {activePanel === "accountability" ? (
  <section className="space-y-4">
    <div className="flex justify-end">
      <button
        type="button"
        onClick={() => openPanel("notices")}
        className="min-h-11 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-white/[0.08] hover:text-white"
      >
        Hide accountability
      </button>
    </div>

    <GovernanceSentNoticeAccountabilityClient
      mode="jurisdiction"
      title={accountabilityTitle}
      description={accountabilityDescription}
    />
  </section>
) : null}

      {activePanel === "advanced" ? (
        <section className="space-y-4 rounded-[28px] border border-white/10 bg-white/[0.03] p-3 md:p-4">
          <div className="rounded-2xl border border-amber-300/20 bg-amber-400/10 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-200">
              Advanced governance workbench
            </p>
            <p className="mt-1 text-sm leading-6 text-amber-100/85">
              This opens the full legacy governance dashboard with intervention
              actions, official notice composer, logbook, escalation, and
              director/SISSO workflow tools.
            </p>
          </div>

          <GovernanceDashboardClient
            endpoint={endpoint}
            eyebrow={eyebrow}
            title={`${title} · Advanced workbench`}
            description={description}
          />
        </section>
      ) : null}

      {activePanel !== "advanced" ? (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => openPanel("advanced")}
            className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold text-slate-400 hover:bg-white/[0.07] hover:text-white"
          >
            Expert tools
          </button>
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-slate-300">
          Loading governance command dashboard...
        </div>
      ) : null}

      {isCircuitView ? (
        <section className="rounded-3xl border border-emerald-300/20 bg-emerald-400/10 p-4 text-sm leading-6 text-emerald-100">
          This is a supervision dashboard. Officers can see risk and evidence,
          but they cannot edit school records from this view.
        </section>
      ) : null}
    </main>
  );
}
