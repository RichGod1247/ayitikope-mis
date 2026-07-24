// src/lib/governance/scope.ts
import {
  AssessmentItemStatus,
  AttendanceStatus,
  ClassroomStatus,
  GovernanceInterventionStatus,
  Prisma,
  SchoolSector,
  StudentStatus,
  TenantStatus,
} from "@prisma/client";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  requireApiUserContext,
  requireServerUserContext,
  type ServerUserContext,
} from "@/lib/serverAuth";
import { normRole } from "@/lib/roleRouting";

import {
  calculatePlacementMockAggregate,
  canonicalMockSubject,
  mockGradeFromScore,
  mockSubjectLabel,
} from "@/lib/assessments/mock";

import {
  buildGovernanceTeacherAbsenteeismOverview,
  emptyTeacherAbsenteeismOverview,
} from "@/lib/governance/teacherAbsenteeism";

export const CIRCUIT_GOVERNANCE_ROLES = [
  "SISSO",
  "CIRCUIT_SUPERVISOR",
] as const;

export const DISTRICT_GOVERNANCE_ROLES = [
  "DISTRICT_DIRECTOR",
  "HEAD_OF_SUPERVISION",
  "BASIC_SCHOOL_COORDINATOR",
  "DISTRICT_MIS_OFFICER",
  "DISTRICT_SHEP_OFFICER",
  "DISTRICT_ASSESSMENT_OFFICER",
] as const;

export const ALL_GOVERNANCE_ROLES = [
  ...CIRCUIT_GOVERNANCE_ROLES,
  ...DISTRICT_GOVERNANCE_ROLES,
  "REGIONAL_VIEWER",
] as const;

export type GovernanceRole = (typeof ALL_GOVERNANCE_ROLES)[number];

type GovernanceAssignmentView = {
  id: string;
  role: string;
  zoneId: string;
  zoneName: string;
  zoneLevel: number;
  zoneTypeName: string;
  parentZoneId: string | null;
  parentZoneName: string | null;
};

export type GovernanceScope = {
  userId: string;
  email: string;
  name: string | null;
  isSuperAdmin: boolean;
  assignments: GovernanceAssignmentView[];
  zoneIds: string[];
  tenantIds: string[];
};

type GovernanceOptions = {
  allowedRoles?: readonly string[];
  allowedZoneLevels?: readonly number[];
};

type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

type SchoolMetricSnapshot = {
  learners: number;
  teachers: number;
  classrooms: number;
  operationalClassrooms: number;

  attendanceSessionsToday: number;
  openAttendanceSessionsToday: number;
  closedAttendanceSessionsToday: number;
  certifiedAttendanceSessionsToday: number;
  closedButUncertifiedAttendanceSessionsToday: number;
  missingAttendanceSessionsToday: number;
  parentAlertsSentToday: number;
  attendanceMarksToday: number;
  presentMarksToday: number;
  absentMarksToday: number;
  lateMarksToday: number;
  excusedMarksToday: number;
  attendanceRateToday: number;
  attendanceCompletionRateToday: number;
  missingAttendanceMarksToday: number;

  healthAlertsToday: number;
  highTemperatureToday: number;
  symptomReportsToday: number;

  publishedOrLockedAssessments: number;
  assessmentScoresLast14Days: number;

  assessmentItemsTotal: number;
  assessmentItemsDraft: number;
  assessmentItemsWithScores: number;
  assessmentItemsWithoutScores: number;
  assessmentItemsWithoutLessonDelivery: number;
  assessmentItemsWithoutCurriculumUnit: number;
  assessmentCompletionRate: number;
  assessmentLinkCoverageRate: number;

  lessonDeliveriesLast14Days: number;
  lessonNotesSubmittedLast14Days: number;
  lessonNotesApprovedLast14Days: number;
  lessonNotesReturnedLast14Days: number;
  lessonNotesPendingReview: number;

  approvedLessonNotesLast14Days: number;
  deliveredApprovedLessonNotesLast14Days: number;
  orphanedLessonNotesLast14Days: number;
  lessonDeliveriesLinkedToApprovedNotesLast14Days: number;
  orphanedDeliveriesLast14Days: number;
  lessonDeliveryComplianceRate: number;

  riskScore: number;
  riskLevel: RiskLevel;
  riskReasons: string[];
  recommendedActions: string[];
};

type MappedSchool = {
  id: string;
  name: string;
  schoolCode: string | null;
  status: string;
  schoolSector: SchoolSector;
  circuit: {
    id: string;
    name: string;
    type: string;
    level: number;
  } | null;
  district: {
    id: string;
    name: string;
  } | null;
  metrics: SchoolMetricSnapshot;
};

type GovernanceAttendanceFollowUpSchool = {
  tenantId: string;
  schoolName: string;
  schoolCode: string | null;
  schoolSector: SchoolSector;
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

type GovernanceAttendanceOverview = {
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
  schoolsNeedingFollowUp: GovernanceAttendanceFollowUpSchool[];
};

type GovernanceTeacherAttendanceFollowUpSchool = {
  tenantId: string;
  schoolName: string;
  schoolCode: string | null;
  schoolSector: SchoolSector;
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

type GovernanceTeacherAttendanceOverview = {
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
  schoolsNeedingFollowUp: GovernanceTeacherAttendanceFollowUpSchool[];
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
  schoolSector: SchoolSector;
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

type GovernanceOverview = any;

type OverviewCacheEntry = {
  expiresAt: number;
  value?: GovernanceOverview;
  promise?: Promise<GovernanceOverview>;
};

const OVERVIEW_CACHE_TTL_MS = 15_000;
const overviewCache = new Map<string, OverviewCacheEntry>();

function jsonNoStore(payload: unknown, status = 200) {
  return Response.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function clean(v: unknown) {
  return String(v ?? "").trim();
}

function upper(v: unknown) {
  return clean(v).toUpperCase();
}

function pct(numerator: number, denominator: number) {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 100);
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function riskLevel(score: number): RiskLevel {
  if (score >= 70) return "CRITICAL";
  if (score >= 50) return "HIGH";
  if (score >= 25) return "MEDIUM";
  return "LOW";
}

function zeroMetrics(): SchoolMetricSnapshot {
  return {
    learners: 0,
    teachers: 0,
    classrooms: 0,
    operationalClassrooms: 0,

    attendanceSessionsToday: 0,
    openAttendanceSessionsToday: 0,
    closedAttendanceSessionsToday: 0,
    certifiedAttendanceSessionsToday: 0,
    closedButUncertifiedAttendanceSessionsToday: 0,
    missingAttendanceSessionsToday: 0,
    parentAlertsSentToday: 0,
    attendanceMarksToday: 0,
    presentMarksToday: 0,
    absentMarksToday: 0,
    lateMarksToday: 0,
    excusedMarksToday: 0,
    attendanceRateToday: 0,
    attendanceCompletionRateToday: 0,
    missingAttendanceMarksToday: 0,

    healthAlertsToday: 0,
    highTemperatureToday: 0,
    symptomReportsToday: 0,

    publishedOrLockedAssessments: 0,
    assessmentScoresLast14Days: 0,

    assessmentItemsTotal: 0,
    assessmentItemsDraft: 0,
    assessmentItemsWithScores: 0,
    assessmentItemsWithoutScores: 0,
    assessmentItemsWithoutLessonDelivery: 0,
    assessmentItemsWithoutCurriculumUnit: 0,
    assessmentCompletionRate: 0,
    assessmentLinkCoverageRate: 0,

    lessonDeliveriesLast14Days: 0,
    lessonNotesSubmittedLast14Days: 0,
    lessonNotesApprovedLast14Days: 0,
    lessonNotesReturnedLast14Days: 0,
    lessonNotesPendingReview: 0,

    approvedLessonNotesLast14Days: 0,
    deliveredApprovedLessonNotesLast14Days: 0,
    orphanedLessonNotesLast14Days: 0,
    lessonDeliveriesLinkedToApprovedNotesLast14Days: 0,
    orphanedDeliveriesLast14Days: 0,
    lessonDeliveryComplianceRate: 0,

    riskScore: 0,
    riskLevel: "LOW",
    riskReasons: [],
    recommendedActions: [],
  };
}

function computeRisk(
  metrics: Omit<
    SchoolMetricSnapshot,
    "riskScore" | "riskLevel" | "riskReasons" | "recommendedActions"
  >
) {
  let score = 0;
  const reasons: string[] = [];
  const actions: string[] = [];

  if (metrics.learners > 0 && metrics.attendanceSessionsToday === 0) {
    score += 30;
    reasons.push("No attendance session opened today.");
    actions.push("Call or visit the headteacher and require same-day attendance capture.");
  }

  if (metrics.missingAttendanceSessionsToday > 0) {
    score += clamp(metrics.missingAttendanceSessionsToday * 10, 10, 30);
    reasons.push(
      `${metrics.missingAttendanceSessionsToday} operational class register(s) are missing today.`
    );
    actions.push("Require the school to open attendance for every operational class today.");
  }

  if (metrics.openAttendanceSessionsToday > 0) {
    score += clamp(metrics.openAttendanceSessionsToday * 8, 8, 24);
    reasons.push(`${metrics.openAttendanceSessionsToday} attendance session(s) are still open.`);
    actions.push("Ask the headteacher to close completed registers after teacher verification.");
  }

  if (metrics.closedButUncertifiedAttendanceSessionsToday > 0) {
    score += clamp(metrics.closedButUncertifiedAttendanceSessionsToday * 4, 4, 16);
    reasons.push(
      `${metrics.closedButUncertifiedAttendanceSessionsToday} closed attendance session(s) are awaiting certification.`
    );
    actions.push("Ask the headteacher to certify closed, complete attendance registers.");
  }

  if (metrics.learners > 0 && metrics.attendanceCompletionRateToday < 75) {
    score += 20;
    reasons.push(
      `Only ${metrics.attendanceCompletionRateToday}% of expected learner attendance marks exist today.`
    );
    actions.push("Check whether all class teachers opened and completed attendance.");
  }

  if (metrics.attendanceMarksToday > 0 && metrics.attendanceRateToday < 75) {
    score += 25;
    reasons.push(`Attendance rate is low today: ${metrics.attendanceRateToday}%.`);
    actions.push("Prioritize learner attendance follow-up and parent contact for absent learners.");
  } else if (metrics.attendanceMarksToday > 0 && metrics.attendanceRateToday < 85) {
    score += 15;
    reasons.push(`Attendance rate needs attention: ${metrics.attendanceRateToday}%.`);
    actions.push("Review absence pattern before the next school day.");
  }

  if (metrics.healthAlertsToday > 0) {
    score += clamp(metrics.healthAlertsToday * 8, 8, 24);
    reasons.push(`${metrics.healthAlertsToday} learner health alert(s) recorded today.`);
    actions.push(
      "Escalate health alerts to the headteacher/SHEP focal person and verify parent notification."
    );
  }

  if (metrics.lessonDeliveriesLast14Days === 0 && metrics.teachers > 0) {
    score += 15;
    reasons.push("No lesson delivery evidence recorded in the last 14 days.");
    actions.push("Ask the headteacher to verify lesson delivery records and teacher usage.");
  }

  if (metrics.orphanedLessonNotesLast14Days > 0) {
    score += clamp(metrics.orphanedLessonNotesLast14Days * 5, 5, 20);
    reasons.push(
      `${metrics.orphanedLessonNotesLast14Days} approved lesson note(s) have no matching delivery evidence.`
    );
    actions.push("Require reconciliation of approved lesson notes against actual lesson deliveries.");
  }

  if (metrics.orphanedDeliveriesLast14Days > 0) {
    score += clamp(metrics.orphanedDeliveriesLast14Days * 4, 4, 16);
    reasons.push(
      `${metrics.orphanedDeliveriesLast14Days} lesson delivery record(s) are not linked to approved lesson notes.`
    );
    actions.push("Verify that lesson deliveries are linked to approved lesson notes, not recorded loosely.");
  }

  if (
    metrics.approvedLessonNotesLast14Days > 0 &&
    metrics.lessonDeliveryComplianceRate < 70
  ) {
    score += 12;
    reasons.push(
      `Lesson delivery compliance is ${metrics.lessonDeliveryComplianceRate}% for approved notes in the last 14 days.`
    );
    actions.push("Require teachers to close the gap between approved notes and delivered lessons.");
  }

  if (metrics.lessonNotesPendingReview > 0) {
    score += clamp(metrics.lessonNotesPendingReview * 3, 3, 15);
    reasons.push(`${metrics.lessonNotesPendingReview} lesson note(s) awaiting headteacher review.`);
    actions.push("Require headteacher review of pending lesson notes before the end of the week.");
  }

  if (metrics.publishedOrLockedAssessments === 0 && metrics.learners > 0) {
    score += 10;
    reasons.push("No published or locked assessment evidence yet.");
    actions.push("Check assessment coverage and ensure teachers are recording scores.");
  }

  if (metrics.assessmentItemsTotal > 0 && metrics.assessmentCompletionRate < 60) {
    score += 15;
    reasons.push(`Assessment scoring completion is low: ${metrics.assessmentCompletionRate}%.`);
    actions.push("Require teachers to score assessment items already created.");
  }

  if (metrics.assessmentItemsWithoutScores > 0) {
    score += clamp(metrics.assessmentItemsWithoutScores * 3, 3, 18);
    reasons.push(`${metrics.assessmentItemsWithoutScores} assessment item(s) have no scores.`);
    actions.push("Follow up on assessment items without learner scores.");
  }

  if (metrics.assessmentItemsWithoutLessonDelivery > 0) {
    score += clamp(metrics.assessmentItemsWithoutLessonDelivery * 2, 2, 12);
    reasons.push(
      `${metrics.assessmentItemsWithoutLessonDelivery} assessment item(s) are not linked to lesson delivery evidence.`
    );
    actions.push("Ensure assessments are linked to the lessons they are assessing.");
  }

  if (metrics.assessmentItemsDraft > 0) {
    score += clamp(metrics.assessmentItemsDraft * 2, 2, 10);
    reasons.push(`${metrics.assessmentItemsDraft} assessment item(s) remain in draft state.`);
    actions.push("Ask the headteacher to publish, lock, or return draft assessments for correction.");
  }

  if (!reasons.length) {
    reasons.push("No major supervision risk detected from current data.");
    actions.push("Maintain monitoring and use the dashboard to detect early changes.");
  }

  const finalScore = clamp(score, 0, 100);

  return {
    riskScore: finalScore,
    riskLevel: riskLevel(finalScore),
    riskReasons: reasons,
    recommendedActions: actions,
  };
}

async function userHasSuperAdminRole(userId: string, sessionRoleName?: string | null) {
  if (normRole(sessionRoleName ?? "") === "SUPERADMIN") return true;

  const count = await prisma.membership.count({
    where: {
      userId,
      status: "ACTIVE",
      role: {
        name: {
          equals: "SUPERADMIN",
          mode: "insensitive",
        },
      },
    },
  });

  return count > 0;
}

async function collectDescendantZoneIds(seedZoneIds: string[]) {
  const seen = new Set(seedZoneIds.filter(Boolean));
  let frontier = Array.from(seen);

  for (let depth = 0; depth < 8 && frontier.length > 0; depth += 1) {
    const children = await prisma.adminZone.findMany({
      where: {
        parentZoneId: { in: frontier },
        isActive: true,
      },
      select: { id: true },
    });

    frontier = [];

    for (const child of children) {
      if (!seen.has(child.id)) {
        seen.add(child.id);
        frontier.push(child.id);
      }
    }
  }

  return Array.from(seen);
}

async function loadTenantIdsForZones(zoneIds: string[]) {
  if (!zoneIds.length) return [];

  const tenants = await prisma.tenant.findMany({
    where: {
      zoneId: { in: zoneIds },
      status: TenantStatus.ACTIVE,
    },
    select: { id: true },
    orderBy: { name: "asc" },
  });

  return tenants.map((t) => t.id);
}

async function loadAllActiveTenantIds() {
  const tenants = await prisma.tenant.findMany({
    where: { status: TenantStatus.ACTIVE },
    select: { id: true },
    orderBy: { name: "asc" },
  });

  return tenants.map((t) => t.id);
}

async function loadAllActiveZoneIds() {
  const zones = await prisma.adminZone.findMany({
    where: { isActive: true },
    select: { id: true },
    orderBy: { name: "asc" },
  });

  return zones.map((z) => z.id);
}

async function loadAssignmentsForUser(userId: string, opts?: GovernanceOptions) {
  const now = new Date();

  const rows = await prisma.governanceOfficerAssignment.findMany({
    where: {
      userId,
      status: "ACTIVE",
      revokedAt: null,
      AND: [
        {
          OR: [{ startsAt: null }, { startsAt: { lte: now } }],
        },
        {
          OR: [{ endsAt: null }, { endsAt: { gte: now } }],
        },
      ],
    },
    select: {
      id: true,
      role: true,
      zoneId: true,
      zone: {
        select: {
          id: true,
          name: true,
          parentZoneId: true,
          parentZone: {
            select: { id: true, name: true },
          },
          zoneType: {
            select: { name: true, level: true },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const allowedRoles = opts?.allowedRoles?.length
    ? new Set(opts.allowedRoles.map((r) => upper(r)))
    : null;

  const allowedZoneLevels = opts?.allowedZoneLevels?.length
    ? new Set(opts.allowedZoneLevels.map((n) => Number(n)))
    : null;

  return rows
    .map((row): GovernanceAssignmentView => {
      return {
        id: row.id,
        role: String(row.role),
        zoneId: row.zoneId,
        zoneName: row.zone.name,
        zoneLevel: row.zone.zoneType.level,
        zoneTypeName: row.zone.zoneType.name,
        parentZoneId: row.zone.parentZoneId ?? null,
        parentZoneName: row.zone.parentZone?.name ?? null,
      };
    })
    .filter((row) => {
      if (allowedRoles && !allowedRoles.has(upper(row.role))) return false;
      if (allowedZoneLevels && !allowedZoneLevels.has(row.zoneLevel)) return false;
      return true;
    });
}

async function buildGovernanceScope(
  ctx: ServerUserContext,
  opts?: GovernanceOptions
): Promise<GovernanceScope | null> {
  const isSuperAdmin = await userHasSuperAdminRole(ctx.userId, ctx.roleName);

  if (isSuperAdmin) {
    // Keep these sequential. Supabase/local pool may intentionally be connection_limit=1.
    const zoneIds = await loadAllActiveZoneIds();
    const tenantIds = await loadAllActiveTenantIds();

    return {
      userId: ctx.userId,
      email: ctx.email,
      name: ctx.name,
      isSuperAdmin: true,
      assignments: [],
      zoneIds,
      tenantIds,
    };
  }

  const assignments = await loadAssignmentsForUser(ctx.userId, opts);
  if (!assignments.length) return null;

  const assignedZoneIds = assignments.map((a) => a.zoneId);
  const zoneIds = await collectDescendantZoneIds(assignedZoneIds);
  const tenantIds = await loadTenantIdsForZones(zoneIds);

  return {
    userId: ctx.userId,
    email: ctx.email,
    name: ctx.name,
    isSuperAdmin: false,
    assignments,
    zoneIds,
    tenantIds,
  };
}

/**
 * Resolves the current active governance jurisdiction for an already
 * authenticated user.
 *
 * Ordinary school users without an active governance assignment receive null.
 * This allows mixed-access resources—such as official notice attachments—to
 * authorize exact recipients first, then fall back to governance jurisdiction.
 */
export async function resolveGovernanceScopeForContext(
  ctx: ServerUserContext
): Promise<GovernanceScope | null> {
  return buildGovernanceScope(ctx, {
    allowedRoles: ALL_GOVERNANCE_ROLES,
  });
}

export async function requireGovernanceApiContext(req: Request, opts?: GovernanceOptions) {
  const auth = await requireApiUserContext(req, { requireTenant: false });

  if (!auth.ok) return auth;

  const scope = await buildGovernanceScope(auth.ctx, opts);

  if (!scope) {
    return {
      ok: false as const,
      res: jsonNoStore(
        {
          ok: false,
          error: "GOVERNANCE_FORBIDDEN",
          message: "No active governance assignment found for this user.",
        },
        403
      ),
    };
  }

  return { ok: true as const, ctx: auth.ctx, scope };
}

export async function requireGovernancePageContext(
  opts?: GovernanceOptions & { redirectTo?: string }
) {
  const ctx = await requireServerUserContext({
    requireTenant: false,
    redirectTo: opts?.redirectTo ?? "/app",
  });

  const scope = await buildGovernanceScope(ctx, opts);

  if (!scope) {
    redirect("/app?error=GOVERNANCE_FORBIDDEN");
  }

  return { ctx, scope };
}

export function assertTenantInGovernanceScope(scope: GovernanceScope, tenantId: string) {
  if (scope.isSuperAdmin) return;

  const allowed = new Set(scope.tenantIds);
  if (!allowed.has(tenantId)) {
    const err = new Error("GOVERNANCE_TENANT_FORBIDDEN");
    (err as Error & { status?: number }).status = 403;
    throw err;
  }
}

function todayRangeUtcForGhana() {
  const now = new Date();

  // Ghana is UTC. Keep this as a day range rather than exact Date equality.
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);

  return { start, end };
}

function todayDateKey(start: Date) {
  return start.toISOString().slice(0, 10);
}

function inc(map: Map<string, number>, key: string, amount = 1) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function setMetric(
  metricsByTenantId: Map<string, SchoolMetricSnapshot>,
  tenantId: string,
  field: keyof SchoolMetricSnapshot,
  value: number
) {
  const metrics = metricsByTenantId.get(tenantId);
  if (!metrics) return;
  (metrics as any)[field] = value;
}

function addMetric(
  metricsByTenantId: Map<string, SchoolMetricSnapshot>,
  tenantId: string,
  field: keyof SchoolMetricSnapshot,
  amount = 1
) {
  const metrics = metricsByTenantId.get(tenantId);
  if (!metrics) return;
  (metrics as any)[field] = Number((metrics as any)[field] ?? 0) + amount;
}

async function loadSchoolMetricsForTenants(args: {
  tenantIds: string[];
  todayStart: Date;
  todayEnd: Date;
  fourteenDaysAgo: Date;
}): Promise<Map<string, SchoolMetricSnapshot>> {
  const { tenantIds, todayStart, todayEnd, fourteenDaysAgo } = args;
  const metricsByTenantId = new Map<string, SchoolMetricSnapshot>();

  for (const tenantId of tenantIds) {
    metricsByTenantId.set(tenantId, zeroMetrics());
  }

  if (!tenantIds.length) return metricsByTenantId;

  // Keep these batched and mostly sequential. This is intentionally kinder to connection_limit=1.
  const learnerGroups = await prisma.student.groupBy({
    by: ["tenantId"],
    where: { tenantId: { in: tenantIds }, status: StudentStatus.ACTIVE },
    _count: { _all: true },
  });
  for (const row of learnerGroups) {
    setMetric(metricsByTenantId, row.tenantId, "learners", row._count._all);
  }

  const teacherGroups = await prisma.teacherProfile.groupBy({
    by: ["tenantId"],
    where: { tenantId: { in: tenantIds } },
    _count: { _all: true },
  });
  for (const row of teacherGroups) {
    setMetric(metricsByTenantId, row.tenantId, "teachers", row._count._all);
  }

  const classroomGroups = await prisma.classroom.groupBy({
    by: ["tenantId"],
    where: { tenantId: { in: tenantIds }, status: ClassroomStatus.ACTIVE },
    _count: { _all: true },
  });
  for (const row of classroomGroups) {
    setMetric(metricsByTenantId, row.tenantId, "classrooms", row._count._all);
  }

  const operationalClassrooms = await prisma.classroom.findMany({
    where: { tenantId: { in: tenantIds }, status: ClassroomStatus.ACTIVE },
    select: {
      id: true,
      tenantId: true,
      _count: {
        select: {
          students: { where: { status: StudentStatus.ACTIVE } },
        },
      },
    },
  });

  const operationalClassroomIdsByTenant = new Map<string, Set<string>>();
  for (const classroom of operationalClassrooms) {
    if (classroom._count.students <= 0) continue;
    addMetric(metricsByTenantId, classroom.tenantId, "operationalClassrooms");
    const set = operationalClassroomIdsByTenant.get(classroom.tenantId) ?? new Set<string>();
    set.add(classroom.id);
    operationalClassroomIdsByTenant.set(classroom.tenantId, set);
  }

  const attendanceSessions = await prisma.attendanceSession.findMany({
    where: {
      tenantId: { in: tenantIds },
      date: { gte: todayStart, lt: todayEnd },
    },
    select: {
      id: true,
      tenantId: true,
      classroomId: true,
      isClosed: true,
      certifiedAt: true,
      notifiedAt: true,
    },
  });

  const sessionTenantById = new Map<string, string>();
  const sessionClassroomsByTenant = new Map<string, Set<string>>();

  for (const session of attendanceSessions) {
    sessionTenantById.set(session.id, session.tenantId);
    addMetric(metricsByTenantId, session.tenantId, "attendanceSessionsToday");

    const classSet = sessionClassroomsByTenant.get(session.tenantId) ?? new Set<string>();
    classSet.add(session.classroomId);
    sessionClassroomsByTenant.set(session.tenantId, classSet);

    if (session.isClosed) {
      addMetric(metricsByTenantId, session.tenantId, "closedAttendanceSessionsToday");
      if (session.certifiedAt) {
        addMetric(metricsByTenantId, session.tenantId, "certifiedAttendanceSessionsToday");
      } else {
        addMetric(metricsByTenantId, session.tenantId, "closedButUncertifiedAttendanceSessionsToday");
      }
    } else {
      addMetric(metricsByTenantId, session.tenantId, "openAttendanceSessionsToday");
    }

    if (session.notifiedAt) {
      addMetric(metricsByTenantId, session.tenantId, "parentAlertsSentToday");
    }
  }

  const attendanceMarks = await prisma.attendanceMark.findMany({
    where: {
      session: {
        tenantId: { in: tenantIds },
        date: { gte: todayStart, lt: todayEnd },
      },
    },
    select: {
      status: true,
      sessionId: true,
    },
  });

  for (const mark of attendanceMarks) {
    const tenantId = sessionTenantById.get(mark.sessionId);
    if (!tenantId) continue;

    addMetric(metricsByTenantId, tenantId, "attendanceMarksToday");
    if (mark.status === AttendanceStatus.PRESENT) addMetric(metricsByTenantId, tenantId, "presentMarksToday");
    if (mark.status === AttendanceStatus.ABSENT) addMetric(metricsByTenantId, tenantId, "absentMarksToday");
    if (mark.status === AttendanceStatus.LATE) addMetric(metricsByTenantId, tenantId, "lateMarksToday");
    if (mark.status === AttendanceStatus.EXCUSED) addMetric(metricsByTenantId, tenantId, "excusedMarksToday");
  }

  const highTemperatureGroups = await prisma.studentHealthDaily.groupBy({
    by: ["tenantId"],
    where: {
      tenantId: { in: tenantIds },
      date: { gte: todayStart, lt: todayEnd },
      temperatureC: { gte: new Prisma.Decimal("37.5") },
    },
    _count: { _all: true },
  });
  for (const row of highTemperatureGroups) {
    setMetric(metricsByTenantId, row.tenantId, "highTemperatureToday", row._count._all);
  }

  const symptomGroups = await prisma.studentHealthDaily.groupBy({
    by: ["tenantId"],
    where: {
      tenantId: { in: tenantIds },
      date: { gte: todayStart, lt: todayEnd },
      symptoms: { not: null },
    },
    _count: { _all: true },
  });
  for (const row of symptomGroups) {
    setMetric(metricsByTenantId, row.tenantId, "symptomReportsToday", row._count._all);
  }

  const assessmentItems = await prisma.assessmentItem.findMany({
    where: { tenantId: { in: tenantIds } },
    select: {
      tenantId: true,
      status: true,
      lessonDeliveryId: true,
      curriculumUnitId: true,
      _count: { select: { scores: true } },
    },
  });

  for (const item of assessmentItems) {
    addMetric(metricsByTenantId, item.tenantId, "assessmentItemsTotal");
    if (item.status === AssessmentItemStatus.DRAFT) {
      addMetric(metricsByTenantId, item.tenantId, "assessmentItemsDraft");
    }
    if (
      item.status === AssessmentItemStatus.PUBLISHED ||
      item.status === AssessmentItemStatus.LOCKED
    ) {
      addMetric(metricsByTenantId, item.tenantId, "publishedOrLockedAssessments");
    }
    if (item._count.scores > 0) {
      addMetric(metricsByTenantId, item.tenantId, "assessmentItemsWithScores");
    } else {
      addMetric(metricsByTenantId, item.tenantId, "assessmentItemsWithoutScores");
    }
    if (!item.lessonDeliveryId) {
      addMetric(metricsByTenantId, item.tenantId, "assessmentItemsWithoutLessonDelivery");
    }
    if (!item.curriculumUnitId) {
      addMetric(metricsByTenantId, item.tenantId, "assessmentItemsWithoutCurriculumUnit");
    }
  }

  const recentAssessmentScores = await prisma.assessmentScore.findMany({
    where: {
      item: {
        tenantId: { in: tenantIds },
        updatedAt: { gte: fourteenDaysAgo },
      },
    },
    select: { item: { select: { tenantId: true } } },
  });
  for (const score of recentAssessmentScores) {
    addMetric(metricsByTenantId, score.item.tenantId, "assessmentScoresLast14Days");
  }

  const lessonDeliveries = await prisma.lessonDelivery.findMany({
    where: {
      tenantId: { in: tenantIds },
      dateTaught: { gte: fourteenDaysAgo },
    },
    select: {
      tenantId: true,
      lessonNoteId: true,
      lessonNote: { select: { status: true } },
    },
  });

  for (const delivery of lessonDeliveries) {
    addMetric(metricsByTenantId, delivery.tenantId, "lessonDeliveriesLast14Days");
    if (delivery.lessonNote?.status === "APPROVED") {
      addMetric(metricsByTenantId, delivery.tenantId, "lessonDeliveriesLinkedToApprovedNotesLast14Days");
    } else {
      addMetric(metricsByTenantId, delivery.tenantId, "orphanedDeliveriesLast14Days");
    }
  }

  const lessonNotes = await prisma.lessonNote.findMany({
    where: {
      tenantId: { in: tenantIds },
      OR: [
        { submittedAt: { gte: fourteenDaysAgo } },
        { approvedAt: { gte: fourteenDaysAgo } },
        { rejectedAt: { gte: fourteenDaysAgo } },
        { status: "SUBMITTED" },
      ],
    },
    select: {
      tenantId: true,
      status: true,
      submittedAt: true,
      approvedAt: true,
      rejectedAt: true,
      _count: {
        select: {
          lessonDeliveries: { where: { dateTaught: { gte: fourteenDaysAgo } } },
        },
      },
    },
  });

  for (const note of lessonNotes) {
    if (note.submittedAt && note.submittedAt >= fourteenDaysAgo) {
      addMetric(metricsByTenantId, note.tenantId, "lessonNotesSubmittedLast14Days");
    }
    if (note.approvedAt && note.approvedAt >= fourteenDaysAgo) {
      addMetric(metricsByTenantId, note.tenantId, "lessonNotesApprovedLast14Days");
    }
    if (note.rejectedAt && note.rejectedAt >= fourteenDaysAgo) {
      addMetric(metricsByTenantId, note.tenantId, "lessonNotesReturnedLast14Days");
    }
    if (note.status === "SUBMITTED") {
      addMetric(metricsByTenantId, note.tenantId, "lessonNotesPendingReview");
    }
    if (note.status === "APPROVED" && note.approvedAt && note.approvedAt >= fourteenDaysAgo) {
      addMetric(metricsByTenantId, note.tenantId, "approvedLessonNotesLast14Days");
      if (note._count.lessonDeliveries > 0) {
        addMetric(metricsByTenantId, note.tenantId, "deliveredApprovedLessonNotesLast14Days");
      }
    }
  }

  for (const [tenantId, metrics] of metricsByTenantId.entries()) {
    const operationalClassroomsCount = operationalClassroomIdsByTenant.get(tenantId)?.size ?? 0;
    const sessionClassroomsCount = sessionClassroomsByTenant.get(tenantId)?.size ?? 0;
    metrics.missingAttendanceSessionsToday = Math.max(
      0,
      operationalClassroomsCount - sessionClassroomsCount
    );

    metrics.missingAttendanceMarksToday = Math.max(0, metrics.learners - metrics.attendanceMarksToday);
    metrics.attendanceRateToday = pct(metrics.presentMarksToday, metrics.attendanceMarksToday);
    metrics.attendanceCompletionRateToday = pct(metrics.attendanceMarksToday, metrics.learners);
    metrics.healthAlertsToday = metrics.highTemperatureToday + metrics.symptomReportsToday;

    metrics.orphanedLessonNotesLast14Days = Math.max(
      0,
      metrics.approvedLessonNotesLast14Days - metrics.deliveredApprovedLessonNotesLast14Days
    );
    metrics.lessonDeliveryComplianceRate = pct(
      metrics.deliveredApprovedLessonNotesLast14Days,
      metrics.approvedLessonNotesLast14Days
    );
    metrics.assessmentCompletionRate = pct(metrics.assessmentItemsWithScores, metrics.assessmentItemsTotal);
    metrics.assessmentLinkCoverageRate = pct(
      metrics.assessmentItemsTotal - metrics.assessmentItemsWithoutLessonDelivery,
      metrics.assessmentItemsTotal
    );

    const risk = computeRisk(metrics);
    metrics.riskScore = risk.riskScore;
    metrics.riskLevel = risk.riskLevel;
    metrics.riskReasons = risk.riskReasons;
    metrics.recommendedActions = risk.recommendedActions;
  }

  return metricsByTenantId;
}

function emptyTeacherAttendanceOverview(
  date = todayDateKey(todayRangeUtcForGhana().start),
): GovernanceTeacherAttendanceOverview {
  return {
    date,
    schools: 0,
    schoolsWithAnySession: 0,
    schoolsCertified: 0,
    schoolsUncertified: 0,
    schoolsMissingSession: 0,
    teachers: 0,
    marked: 0,
    unmarked: 0,
    present: 0,
    absent: 0,
    late: 0,
    excused: 0,
    absentOrLate: 0,
    completionPct: 0,
    presentPct: 0,
    needsAction: 0,
    schoolsNeedingFollowUp: [],
  };
}

function emptyAttendanceOverview(date = todayDateKey(todayRangeUtcForGhana().start)): GovernanceAttendanceOverview {
  return {
    date,
    schools: 0,
    schoolsWithSessions: 0,
    schoolsMissingSessions: 0,
    openSessions: 0,
    closedSessions: 0,
    certifiedSessions: 0,
    closedUncertifiedSessions: 0,
    missingSessions: 0,
    learners: 0,
    marked: 0,
    unmarked: 0,
    present: 0,
    absent: 0,
    late: 0,
    excused: 0,
    completionPct: 0,
    presentPct: 0,
    needsAction: 0,
    parentAlertsSent: 0,
    schoolsNeedingFollowUp: [],
  };
}

function buildAttendanceOverview(mappedSchools: MappedSchool[], date: string): GovernanceAttendanceOverview {
  const attendance = mappedSchools.reduce(
    (acc, school) => {
      const m = school.metrics;
      acc.schools += 1;
      if (m.attendanceSessionsToday > 0) acc.schoolsWithSessions += 1;
      if (m.missingAttendanceSessionsToday > 0) acc.schoolsMissingSessions += 1;

      acc.openSessions += m.openAttendanceSessionsToday;
      acc.closedSessions += m.closedAttendanceSessionsToday;
      acc.certifiedSessions += m.certifiedAttendanceSessionsToday;
      acc.closedUncertifiedSessions += m.closedButUncertifiedAttendanceSessionsToday;
      acc.missingSessions += m.missingAttendanceSessionsToday;
      acc.learners += m.learners;
      acc.marked += m.attendanceMarksToday;
      acc.unmarked += m.missingAttendanceMarksToday;
      acc.present += m.presentMarksToday;
      acc.absent += m.absentMarksToday;
      acc.late += m.lateMarksToday;
      acc.excused += m.excusedMarksToday;
      acc.parentAlertsSent += m.parentAlertsSentToday;

      const reasons: string[] = [];
      if (m.missingAttendanceSessionsToday > 0) {
        reasons.push(`${m.missingAttendanceSessionsToday} operational class register(s) missing today`);
      }
      if (m.openAttendanceSessionsToday > 0) {
        reasons.push(`${m.openAttendanceSessionsToday} attendance session(s) still open`);
      }
      if (m.missingAttendanceMarksToday > 0) {
        reasons.push(`${m.missingAttendanceMarksToday} learner(s) unmarked`);
      }
      if (m.closedButUncertifiedAttendanceSessionsToday > 0) {
        reasons.push(`${m.closedButUncertifiedAttendanceSessionsToday} closed session(s) awaiting certification`);
      }
      if (m.absentMarksToday > 0) {
        reasons.push(`${m.absentMarksToday} absent learner(s)`);
      }

      if (reasons.length) {
        acc.needsAction += 1;
        acc.schoolsNeedingFollowUp.push({
          tenantId: school.id,
          schoolName: school.name,
          schoolCode: school.schoolCode,
          schoolSector: school.schoolSector,
          circuitName: school.circuit?.name ?? null,
          districtName: school.district?.name ?? null,
          sessions: m.attendanceSessionsToday,
          openSessions: m.openAttendanceSessionsToday,
          closedSessions: m.closedAttendanceSessionsToday,
          certifiedSessions: m.certifiedAttendanceSessionsToday,
          closedUncertifiedSessions: m.closedButUncertifiedAttendanceSessionsToday,
          missingSessions: m.missingAttendanceSessionsToday,
          learners: m.learners,
          marked: m.attendanceMarksToday,
          unmarked: m.missingAttendanceMarksToday,
          present: m.presentMarksToday,
          absent: m.absentMarksToday,
          late: m.lateMarksToday,
          excused: m.excusedMarksToday,
          completionPct: m.attendanceCompletionRateToday,
          presentPct: m.attendanceRateToday,
          parentAlertsSent: m.parentAlertsSentToday,
          reason: `${reasons[0]}.`,
        });
      }

      return acc;
    },
    emptyAttendanceOverview(date)
  );

  attendance.completionPct = pct(attendance.marked, attendance.learners);
  attendance.presentPct = pct(attendance.present, attendance.marked);
  attendance.schoolsNeedingFollowUp = attendance.schoolsNeedingFollowUp
    .sort((a, b) => {
      return (
        b.missingSessions - a.missingSessions ||
        b.openSessions - a.openSessions ||
        b.unmarked - a.unmarked ||
        b.closedUncertifiedSessions - a.closedUncertifiedSessions ||
        b.absent - a.absent ||
        a.schoolName.localeCompare(b.schoolName)
      );
    })
    .slice(0, 20);

  return attendance;
}

async function buildTeacherAttendanceOverview(args: {
  mappedSchools: MappedSchool[];
  tenantIds: string[];
  todayStart: Date;
  todayEnd: Date;
  dateKey: string;
}): Promise<GovernanceTeacherAttendanceOverview> {
  const { mappedSchools, tenantIds, todayStart, todayEnd, dateKey } = args;

  const overview = emptyTeacherAttendanceOverview(dateKey);
  overview.schools = mappedSchools.length;

  if (!tenantIds.length || !mappedSchools.length) return overview;

  const activeTeacherMemberships = await prisma.membership.findMany({
    where: {
      tenantId: { in: tenantIds },
      status: "ACTIVE",
      role: {
        name: {
          equals: "TEACHER",
          mode: "insensitive",
        },
      },
    },
    select: {
      tenantId: true,
      userId: true,
    },
  });

  const activeTeacherIdsByTenant = new Map<string, Set<string>>();

  for (const membership of activeTeacherMemberships) {
    const set = activeTeacherIdsByTenant.get(membership.tenantId) ?? new Set<string>();
    set.add(membership.userId);
    activeTeacherIdsByTenant.set(membership.tenantId, set);
  }

  const sessions = await prisma.teacherAttendanceSession.findMany({
    where: {
      tenantId: { in: tenantIds },
      date: { gte: todayStart, lt: todayEnd },
    },
    select: {
      id: true,
      tenantId: true,
      isClosed: true,
      certifiedAt: true,
      records: {
        select: {
          teacherUserId: true,
          status: true,
        },
      },
    },
  });

  const sessionByTenantId = new Map<string, (typeof sessions)[number]>();

  for (const session of sessions) {
    const existing = sessionByTenantId.get(session.tenantId);

    if (!existing) {
      sessionByTenantId.set(session.tenantId, session);
      continue;
    }

    // There should be one session per tenant/date. If bad historical data exists,
    // prefer the certified session because governance trusts only certified truth.
    if (!existing.certifiedAt && session.certifiedAt) {
      sessionByTenantId.set(session.tenantId, session);
    }
  }

  for (const school of mappedSchools) {
    const teacherIds = activeTeacherIdsByTenant.get(school.id) ?? new Set<string>();
    const teachers = teacherIds.size || school.metrics.teachers || 0;
    const session = sessionByTenantId.get(school.id) ?? null;

    overview.teachers += teachers;

    const reasons: string[] = [];

    let marked = 0;
    let present = 0;
    let absent = 0;
    let late = 0;
    let excused = 0;

    if (session) {
      overview.schoolsWithAnySession += 1;

      if (session.certifiedAt) {
        overview.schoolsCertified += 1;

        for (const record of session.records) {
          if (teacherIds.size && !teacherIds.has(record.teacherUserId)) continue;

          marked += 1;
          if (record.status === AttendanceStatus.PRESENT) present += 1;
          if (record.status === AttendanceStatus.ABSENT) absent += 1;
          if (record.status === AttendanceStatus.LATE) late += 1;
          if (record.status === AttendanceStatus.EXCUSED) excused += 1;
        }

        overview.marked += marked;
        overview.present += present;
        overview.absent += absent;
        overview.late += late;
        overview.excused += excused;
      } else {
        overview.schoolsUncertified += 1;

        if (session.isClosed) {
          reasons.push("Teacher attendance register is closed but not certified.");
        } else {
          reasons.push("Teacher attendance register is still open.");
        }
      }
    } else {
      overview.schoolsMissingSession += 1;
      if (teachers > 0) {
        reasons.push("No teacher attendance register has been opened today.");
      }
    }

    const unmarked = Math.max(0, teachers - marked);
    const completionPct = pct(marked, teachers);
    const presentPct = pct(present, marked);
    const isCertified = Boolean(session?.certifiedAt);

    if (!isCertified && teachers > 0) {
      if (!reasons.length) reasons.push("Teacher attendance is not certified yet.");
    }

    if (isCertified && unmarked > 0) {
      reasons.push(`${unmarked} active teacher(s) are missing from the certified register.`);
    }

    if (isCertified && (absent > 0 || late > 0)) {
      reasons.push(`${absent} absent and ${late} late teacher mark(s) need supervision attention.`);
    }

    if (reasons.length) {
      overview.schoolsNeedingFollowUp.push({
        tenantId: school.id,
        schoolName: school.name,
        schoolCode: school.schoolCode,
        schoolSector: school.schoolSector,
        circuitName: school.circuit?.name ?? null,
        districtName: school.district?.name ?? null,
        teachers,
        hasSession: Boolean(session),
        isCertified,
        isClosed: Boolean(session?.isClosed),
        marked,
        unmarked,
        present,
        absent,
        late,
        excused,
        completionPct,
        presentPct,
        reason: reasons.join(" "),
      });
    }
  }

  overview.unmarked = Math.max(0, overview.teachers - overview.marked);
  overview.absentOrLate = overview.absent + overview.late;
  overview.completionPct = pct(overview.marked, overview.teachers);
  overview.presentPct = pct(overview.present, overview.marked);
  overview.needsAction = overview.schoolsNeedingFollowUp.length;

  overview.schoolsNeedingFollowUp.sort((a, b) => {
    if (a.isCertified !== b.isCertified) return a.isCertified ? 1 : -1;
    if (b.unmarked !== a.unmarked) return b.unmarked - a.unmarked;
    if (b.absent + b.late !== a.absent + a.late) {
      return b.absent + b.late - (a.absent + a.late);
    }
    return a.schoolName.localeCompare(b.schoolName);
  });

  return overview;
}

function emptyMockReadinessOverview(
  schools = 0,
): GovernanceMockReadinessOverview {
  return {
    schools,
    schoolsWithReleasedMock: 0,
    schoolsWithoutReleasedMock: schools,
    latestReleasedMockCount: 0,
    averagePlacementAggregate: null,
    improvingSchools: 0,
    decliningSchools: 0,
    stableSchools: 0,
    incompleteSchools: schools,
    schoolsNeedingFollowUp: 0,
    activeInterventionCases: 0,
    resolvedInterventionCases: 0,
    weakestSubjects: [],
    schoolSignals: [],
  };
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

function numberOrNull(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function averageOrNull(values: number[]) {
  if (!values.length) return null;
  return round1(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function aggregateRangeOrNull(
  values: number[],
  mockLabel: string | null,
): GovernanceMockAggregateRange | null {
  if (!values.length) return null;

  return {
    mockLabel,
    min: round1(Math.min(...values)),
    max: round1(Math.max(...values)),
  };
}

function mockTrendLabelFromMovement(
  movement: number | null,
): GovernanceMockTrendLabel {
  if (movement == null) return "INCOMPLETE";
  if (movement > 0) return "IMPROVING";
  if (movement < 0) return "DECLINING";
  return "STABLE";
}

function mockCaseStatusIsActive(status: GovernanceInterventionStatus | string) {
  return (
    status === GovernanceInterventionStatus.OPEN ||
    status === GovernanceInterventionStatus.IN_PROGRESS ||
    status === GovernanceInterventionStatus.ESCALATED
  );
}

function buildMockFollowUpReason(args: {
  trendLabel: GovernanceMockTrendLabel;
  activeCases: number;
  placementReadyCount: number;
  totalCandidates: number;
  latestMockLabel: string | null;
}) {
  if (!args.latestMockLabel) return "No released Mock readiness yet.";

  if (args.placementReadyCount < args.totalCandidates) {
    return `${args.latestMockLabel} has incomplete placement-ready evidence.`;
  }

  if (args.trendLabel === "DECLINING") {
    return `${args.latestMockLabel} trend is declining; SISSO should check school rescue action.`;
  }

  if (args.activeCases > 0) {
    return `${args.activeCases} active Mock rescue case(s) still need follow-up.`;
  }

  return "Released Mock evidence is currently stable.";
}

function schoolMockReleaseKey(tenantId: string, mockNumber: number) {
  return `${tenantId}:${mockNumber}`;
}

async function buildGovernanceMockReadinessOverview(args: {
  schools: MappedSchool[];
  tenantIds: string[];
}): Promise<GovernanceMockReadinessOverview> {
  const { schools, tenantIds } = args;

  if (!tenantIds.length || !schools.length) {
    return emptyMockReadinessOverview(schools.length);
  }

  const schoolByTenantId = new Map(schools.map((school) => [school.id, school]));

  const releases = await prisma.mockResultsRelease.findMany({
    where: {
      tenantId: { in: tenantIds },
      parentVisible: true,
      readinessStatus: { in: ["READY", "OVERRIDE"] },
      releaseSnapshotHash: { not: "" },
      mockExamSession: {
        status: "LOCKED",
      },
    },
    orderBy: [
      { tenantId: "asc" },
      { mockNumber: "asc" },
      { releasedAt: "asc" },
    ],
    select: {
      id: true,
      tenantId: true,
      mockExamSessionId: true,
      classroomId: true,
      academicYear: true,
      term: true,
      mockNumber: true,
      mockLabel: true,
      title: true,
      readinessStatus: true,
      releasedAt: true,
    },
  });

  const releasesByTenant = new Map<string, typeof releases>();

  for (const release of releases) {
    const next = releasesByTenant.get(release.tenantId) ?? [];
    next.push(release);
    releasesByTenant.set(release.tenantId, next);
  }

  const latestReleases = [...releasesByTenant.values()]
    .map((rows) => rows[rows.length - 1])
    .filter(Boolean);

  const previousReleaseByLatestKey = new Map<string, (typeof releases)[number]>();

  for (const rows of releasesByTenant.values()) {
    if (rows.length < 2) continue;

    const latest = rows[rows.length - 1];
    const previous = rows[rows.length - 2];

    previousReleaseByLatestKey.set(
      schoolMockReleaseKey(latest.tenantId, latest.mockNumber),
      previous,
    );
  }

  if (!latestReleases.length) {
    return emptyMockReadinessOverview(schools.length);
  }

  const comparisonReleases = [
    ...latestReleases,
    ...Array.from(previousReleaseByLatestKey.values()),
  ];

  const comparisonSessionIds = Array.from(
    new Set(comparisonReleases.map((release) => release.mockExamSessionId)),
  );

  const latestClassroomIds = Array.from(
    new Set(latestReleases.map((release) => release.classroomId)),
  );

  const [students, items, cases] = await Promise.all([
    prisma.student.findMany({
      where: {
        tenantId: { in: tenantIds },
        classroomId: { in: latestClassroomIds },
        status: StudentStatus.ACTIVE,
      },
      select: {
        id: true,
        tenantId: true,
        classroomId: true,
      },
    }),

    prisma.assessmentItem.findMany({
      where: {
        tenantId: { in: tenantIds },
        mockExamSessionId: { in: comparisonSessionIds },
        type: "MOCK",
      },
      select: {
        id: true,
        tenantId: true,
        mockExamSessionId: true,
        subject: true,
        scores: {
          select: {
            studentId: true,
            score: true,
          },
        },
      },
    }),

    prisma.governanceInterventionCase.findMany({
      where: {
        tenantId: { in: tenantIds },
        metadata: {
          path: ["source"],
          equals: "HEADTEACHER_MOCK_TREND",
        },
      },
      select: {
        id: true,
        tenantId: true,
        status: true,
      },
    }),
  ]);

  const studentsByClassroomId = new Map<string, typeof students>();

  for (const student of students) {
    const next = studentsByClassroomId.get(student.classroomId ?? "") ?? [];
    next.push(student);
    studentsByClassroomId.set(student.classroomId ?? "", next);
  }

  const itemsBySessionId = new Map<string, typeof items>();

  for (const item of items) {
    const key = clean(item.mockExamSessionId);
    if (!key) continue;

    const next = itemsBySessionId.get(key) ?? [];
    next.push(item);
    itemsBySessionId.set(key, next);
  }

  const casesByTenantId = new Map<
    string,
    {
      activeCases: number;
      resolvedCases: number;
    }
  >();

  for (const item of cases) {
    const row = casesByTenantId.get(item.tenantId ?? "") ?? {
      activeCases: 0,
      resolvedCases: 0,
    };

    if (item.status === GovernanceInterventionStatus.RESOLVED) {
      row.resolvedCases += 1;
    }

    if (mockCaseStatusIsActive(item.status)) {
      row.activeCases += 1;
    }

    casesByTenantId.set(item.tenantId ?? "", row);
  }

  function releaseSnapshot(release: (typeof releases)[number]) {
    const releaseStudents = studentsByClassroomId.get(release.classroomId) ?? [];
    const releaseItems = itemsBySessionId.get(release.mockExamSessionId) ?? [];

    const placementAggregates: number[] = [];
    const subjectScores = new Map<
      string,
      {
        subject: string;
        canonicalSubject: string;
        totalScore: number;
        scoredCount: number;
        lowScoreCount: number;
      }
    >();

    for (const student of releaseStudents) {
      const subjectCells = releaseItems.map((item) => {
        const scoreRow =
          item.scores.find((score) => score.studentId === student.id) ?? null;

        const score = numberOrNull(scoreRow?.score);
        const grade = score == null ? null : mockGradeFromScore(score);

        if (score != null) {
          const canonicalSubject = canonicalMockSubject(item.subject);
          const existing = subjectScores.get(canonicalSubject) ?? {
            subject: item.subject || mockSubjectLabel(canonicalSubject),
            canonicalSubject,
            totalScore: 0,
            scoredCount: 0,
            lowScoreCount: 0,
          };

          existing.totalScore += score;
          existing.scoredCount += 1;

          if (score < 50) existing.lowScoreCount += 1;

          subjectScores.set(canonicalSubject, existing);
        }

        return {
          subject: item.subject,
          score,
          grade: grade?.grade ?? null,
        };
      });

      const placementAggregate = calculatePlacementMockAggregate(subjectCells);

      if (
        placementAggregate.ok &&
        typeof placementAggregate.aggregate === "number"
      ) {
        placementAggregates.push(placementAggregate.aggregate);
      }
    }

return {
  totalCandidates: releaseStudents.length,
  placementReadyCount: placementAggregates.length,
  averagePlacementAggregate: averageOrNull(placementAggregates),
  aggregateRange: aggregateRangeOrNull(
    placementAggregates,
    release.mockLabel,
  ),
  subjectRows: [...subjectScores.values()].map((row) => ({
        subject: row.subject,
        canonicalSubject: row.canonicalSubject,
        averageScore:
          row.scoredCount > 0 ? round1(row.totalScore / row.scoredCount) : null,
        lowScoreCount: row.lowScoreCount,
        scoredCount: row.scoredCount,
      })),
    };
  }

  const latestSnapshots = new Map<string, ReturnType<typeof releaseSnapshot>>();
  const previousSnapshots = new Map<string, ReturnType<typeof releaseSnapshot>>();

  for (const release of latestReleases) {
    latestSnapshots.set(release.mockExamSessionId, releaseSnapshot(release));
  }

  for (const release of previousReleaseByLatestKey.values()) {
    previousSnapshots.set(release.mockExamSessionId, releaseSnapshot(release));
  }

  const subjectRiskMap = new Map<
    string,
    {
      subject: string;
      canonicalSubject: string;
      totalAverageScore: number;
      schoolCount: number;
      lowScoreCount: number;
      scoredCount: number;
    }
  >();

  const schoolSignals: GovernanceMockSchoolSignal[] = latestReleases.map(
    (latestRelease) => {
      const school = schoolByTenantId.get(latestRelease.tenantId);
      const latestSnapshot = latestSnapshots.get(
        latestRelease.mockExamSessionId,
      );
      const previousRelease = previousReleaseByLatestKey.get(
        schoolMockReleaseKey(latestRelease.tenantId, latestRelease.mockNumber),
      );
      const previousSnapshot = previousRelease
        ? previousSnapshots.get(previousRelease.mockExamSessionId)
        : null;

      for (const subject of latestSnapshot?.subjectRows ?? []) {
        if (subject.averageScore == null) continue;

        const existing = subjectRiskMap.get(subject.canonicalSubject) ?? {
          subject: subject.subject,
          canonicalSubject: subject.canonicalSubject,
          totalAverageScore: 0,
          schoolCount: 0,
          lowScoreCount: 0,
          scoredCount: 0,
        };

        existing.totalAverageScore += subject.averageScore;
        existing.schoolCount += 1;
        existing.lowScoreCount += subject.lowScoreCount;
        existing.scoredCount += subject.scoredCount;

        subjectRiskMap.set(subject.canonicalSubject, existing);
      }

      const averagePlacementAggregate =
        latestSnapshot?.averagePlacementAggregate ?? null;
      const previousAveragePlacementAggregate =
        previousSnapshot?.averagePlacementAggregate ?? null;

      const aggregateMovement =
        averagePlacementAggregate != null &&
        previousAveragePlacementAggregate != null
          ? round1(previousAveragePlacementAggregate - averagePlacementAggregate)
          : null;

      const trendLabel = mockTrendLabelFromMovement(aggregateMovement);

      const caseCounts = casesByTenantId.get(latestRelease.tenantId) ?? {
        activeCases: 0,
        resolvedCases: 0,
      };

      const totalCandidates = latestSnapshot?.totalCandidates ?? 0;
      const placementReadyCount = latestSnapshot?.placementReadyCount ?? 0;

      const needsFollowUp =
        trendLabel === "DECLINING" ||
        caseCounts.activeCases > 0 ||
        placementReadyCount < totalCandidates;

      return {
        tenantId: latestRelease.tenantId,
        schoolName: school?.name ?? "School",
        schoolCode: school?.schoolCode ?? null,
        schoolSector: school?.schoolSector ?? SchoolSector.PUBLIC,
        circuitName: school?.circuit?.name ?? null,
        districtName: school?.district?.name ?? null,
        latestMockLabel: latestRelease.mockLabel,
        latestMockTitle: latestRelease.title,
        totalCandidates,
        placementReadyCount,
        averagePlacementAggregate,
previousAveragePlacementAggregate,
aggregateMovement,
latestAggregateRange: latestSnapshot?.aggregateRange ?? null,
previousAggregateRange: previousSnapshot?.aggregateRange ?? null,
trendLabel,
        activeCases: caseCounts.activeCases,
        resolvedCases: caseCounts.resolvedCases,
        needsFollowUp,
        followUpReason: buildMockFollowUpReason({
          trendLabel,
          activeCases: caseCounts.activeCases,
          placementReadyCount,
          totalCandidates,
          latestMockLabel: latestRelease.mockLabel,
        }),
      };
    },
  );

  const averagePlacementAggregates = schoolSignals
    .map((signal) => signal.averagePlacementAggregate)
    .filter((value): value is number => typeof value === "number");

  const weakestSubjects = [...subjectRiskMap.values()]
    .map((row) => ({
      subject: row.subject,
      canonicalSubject: row.canonicalSubject,
      averageScore:
        row.schoolCount > 0 ? round1(row.totalAverageScore / row.schoolCount) : null,
      lowScoreCount: row.lowScoreCount,
      scoredCount: row.scoredCount,
    }))
    .sort((a, b) => {
      const avgDiff =
        Number(a.averageScore ?? 999) - Number(b.averageScore ?? 999);

      if (avgDiff !== 0) return avgDiff;

      return b.lowScoreCount - a.lowScoreCount;
    })
    .slice(0, 5);

  return {
    schools: schools.length,
    schoolsWithReleasedMock: schoolSignals.length,
    schoolsWithoutReleasedMock: Math.max(0, schools.length - schoolSignals.length),
    latestReleasedMockCount: latestReleases.length,
    averagePlacementAggregate: averageOrNull(averagePlacementAggregates),
    improvingSchools: schoolSignals.filter(
      (signal) => signal.trendLabel === "IMPROVING",
    ).length,
    decliningSchools: schoolSignals.filter(
      (signal) => signal.trendLabel === "DECLINING",
    ).length,
    stableSchools: schoolSignals.filter(
      (signal) => signal.trendLabel === "STABLE",
    ).length,
    incompleteSchools:
      Math.max(0, schools.length - schoolSignals.length) +
      schoolSignals.filter((signal) => signal.trendLabel === "INCOMPLETE")
        .length,
    schoolsNeedingFollowUp: schoolSignals.filter(
      (signal) => signal.needsFollowUp,
    ).length,
    activeInterventionCases: schoolSignals.reduce(
      (sum, signal) => sum + signal.activeCases,
      0,
    ),
    resolvedInterventionCases: schoolSignals.reduce(
      (sum, signal) => sum + signal.resolvedCases,
      0,
    ),
    weakestSubjects,
    schoolSignals: schoolSignals.sort((a, b) => {
      if (Number(b.needsFollowUp) !== Number(a.needsFollowUp)) {
        return Number(b.needsFollowUp) - Number(a.needsFollowUp);
      }

      if (b.activeCases !== a.activeCases) {
        return b.activeCases - a.activeCases;
      }

      if (a.trendLabel !== b.trendLabel) {
        if (a.trendLabel === "DECLINING") return -1;
        if (b.trendLabel === "DECLINING") return 1;
      }

      return a.schoolName.localeCompare(b.schoolName);
    }),
  };
}

function emptyOverview(message = "No schools are currently assigned to this governance scope.") {
  return {
    schools: [] as MappedSchool[],
    circuitBreakdown: [],
    interventionQueue: [],
    riskSummary: {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
      highestRiskScore: 0,
      highestRiskSchool: null,
    },
    sectorSummary: {
      public: { schools: 0, highRiskSchools: 0, criticalRiskSchools: 0, highestRiskScore: 0 },
      private: { schools: 0, highRiskSchools: 0, criticalRiskSchools: 0, highestRiskScore: 0 },
      governanceRule:
        "Public schools are normal GES governance targets. Private schools must be distinguished and should only be included in official command where explicitly authorized.",
    },
    totals: {
      schools: 0,
      publicSchools: 0,
      privateSchools: 0,
      learners: 0,
      teachers: 0,
      classrooms: 0,
      operationalClassrooms: 0,
      circuits: 0,
      districts: 0,
    },
        attendance: emptyAttendanceOverview(),
    teacherAttendance: emptyTeacherAttendanceOverview(),
teacherAbsenteeism: emptyTeacherAbsenteeismOverview(),
mockReadiness: emptyMockReadinessOverview(),
    signals: {
      attendanceSessionsToday: 0,
      openAttendanceSessionsToday: 0,
      closedAttendanceSessionsToday: 0,
      certifiedAttendanceSessionsToday: 0,
      closedButUncertifiedAttendanceSessionsToday: 0,
      missingAttendanceSessionsToday: 0,
      teacherAttendanceSchoolsCertified: 0,
      teacherAttendanceSchoolsMissingSession: 0,
      teacherAttendanceSchoolsUncertified: 0,
      teacherAttendanceMarkedToday: 0,
      teacherAttendancePresentToday: 0,
      teacherAttendanceAbsentToday: 0,
      teacherAttendanceLateToday: 0,
      teacherAttendanceExcusedToday: 0,
      teacherAttendanceCompletionRateToday: 0,
      teacherAttendancePresentRateToday: 0,
      teacherAttendanceNeedsAction: 0,
      parentAlertsSentToday: 0,
      attendanceMarksToday: 0,
      presentMarksToday: 0,
      absentMarksToday: 0,
      lateMarksToday: 0,
      excusedMarksToday: 0,
      attendanceRateToday: 0,
      attendanceCompletionRateToday: 0,
      missingAttendanceMarksToday: 0,
      healthAlertsToday: 0,
      highTemperatureToday: 0,
      symptomReportsToday: 0,
      publishedOrLockedAssessments: 0,
      assessmentScoresLast14Days: 0,

      assessmentItemsTotal: 0,
      assessmentItemsDraft: 0,
      assessmentItemsWithScores: 0,
      assessmentItemsWithoutScores: 0,
      assessmentItemsWithoutLessonDelivery: 0,
      assessmentItemsWithoutCurriculumUnit: 0,
      assessmentCompletionRate: 0,
      assessmentLinkCoverageRate: 0,

      lessonDeliveriesLast14Days: 0,
      lessonNotesSubmittedLast14Days: 0,
      lessonNotesApprovedLast14Days: 0,
      lessonNotesReturnedLast14Days: 0,
      lessonNotesPendingReview: 0,

      approvedLessonNotesLast14Days: 0,
      deliveredApprovedLessonNotesLast14Days: 0,
      orphanedLessonNotesLast14Days: 0,
      lessonDeliveriesLinkedToApprovedNotesLast14Days: 0,
      orphanedDeliveriesLast14Days: 0,
      lessonDeliveryComplianceRate: 0,

      highRiskSchools: 0,
      criticalRiskSchools: 0,
      highestRiskScore: 0,
    },
    emptyStates: [message],
    generatedAt: new Date().toISOString(),
  };
}

function overviewCacheKey(scope: GovernanceScope) {
  const { start } = todayRangeUtcForGhana();
  return [
    scope.isSuperAdmin ? "SUPER" : scope.userId,
    todayDateKey(start),
    [...scope.zoneIds].sort().join(","),
    [...scope.tenantIds].sort().join(","),
  ].join("|");
}

export async function buildGovernanceOverview(scope: GovernanceScope) {
  const key = overviewCacheKey(scope);
  const now = Date.now();
  const cached = overviewCache.get(key);

  if (cached && cached.expiresAt > now) {
    if (cached.value) return cached.value;
    if (cached.promise) return cached.promise;
  }

  const promise = buildGovernanceOverviewUncached(scope)
    .then((value) => {
      overviewCache.set(key, { value, expiresAt: Date.now() + OVERVIEW_CACHE_TTL_MS });
      return value;
    })
    .catch((error) => {
      overviewCache.delete(key);
      throw error;
    });

  overviewCache.set(key, { promise, expiresAt: now + OVERVIEW_CACHE_TTL_MS });
  return promise;
}

async function buildGovernanceOverviewUncached(scope: GovernanceScope) {
  const tenantIds = scope.tenantIds;

  if (!tenantIds.length) {
    return emptyOverview();
  }

  const { start, end } = todayRangeUtcForGhana();
  const dateKey = todayDateKey(start);

  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setUTCDate(fourteenDaysAgo.getUTCDate() - 14);

  const schools = await prisma.tenant.findMany({
    where: {
      id: { in: tenantIds },
      status: TenantStatus.ACTIVE,
    },
    select: {
      id: true,
      name: true,
      schoolCode: true,
      status: true,
      schoolSector: true,
      zone: {
        select: {
          id: true,
          name: true,
          zoneType: {
            select: { name: true, level: true },
          },
          parentZone: {
            select: { id: true, name: true },
          },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  const zones = await prisma.adminZone.findMany({
    where: {
      id: { in: scope.zoneIds },
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      zoneType: {
        select: { name: true, level: true },
      },
    },
  });

  if (!schools.length) {
    return emptyOverview("This governance scope is valid, but no active schools are attached to it yet.");
  }

  const schoolIds = schools.map((school) => school.id);
  const metricsByTenantId = await loadSchoolMetricsForTenants({
    tenantIds: schoolIds,
    todayStart: start,
    todayEnd: end,
    fourteenDaysAgo,
  });

  const mappedSchools: MappedSchool[] = schools
    .map((school) => {
      const metrics = metricsByTenantId.get(school.id) ?? zeroMetrics();

      return {
        id: school.id,
        name: school.name,
        schoolCode: school.schoolCode,
        status: school.status,
        schoolSector: school.schoolSector,
        circuit: school.zone
          ? {
              id: school.zone.id,
              name: school.zone.name,
              type: school.zone.zoneType.name,
              level: school.zone.zoneType.level,
            }
          : null,
        district: school.zone?.parentZone
          ? {
              id: school.zone.parentZone.id,
              name: school.zone.parentZone.name,
            }
          : null,
        metrics,
      };
    })
    .sort((a, b) => {
      const riskDiff = b.metrics.riskScore - a.metrics.riskScore;
      if (riskDiff !== 0) return riskDiff;
      return a.name.localeCompare(b.name);
    });

  const metricTotals = mappedSchools.reduce((acc, school) => {
    acc.learners += school.metrics.learners;
    acc.teachers += school.metrics.teachers;
    acc.classrooms += school.metrics.classrooms;
    acc.operationalClassrooms += school.metrics.operationalClassrooms;

    acc.attendanceSessionsToday += school.metrics.attendanceSessionsToday;
    acc.openAttendanceSessionsToday += school.metrics.openAttendanceSessionsToday;
    acc.closedAttendanceSessionsToday += school.metrics.closedAttendanceSessionsToday;
    acc.certifiedAttendanceSessionsToday += school.metrics.certifiedAttendanceSessionsToday;
    acc.closedButUncertifiedAttendanceSessionsToday +=
      school.metrics.closedButUncertifiedAttendanceSessionsToday;
    acc.missingAttendanceSessionsToday += school.metrics.missingAttendanceSessionsToday;
    acc.parentAlertsSentToday += school.metrics.parentAlertsSentToday;
    acc.attendanceMarksToday += school.metrics.attendanceMarksToday;
    acc.presentMarksToday += school.metrics.presentMarksToday;
    acc.absentMarksToday += school.metrics.absentMarksToday;
    acc.lateMarksToday += school.metrics.lateMarksToday;
    acc.excusedMarksToday += school.metrics.excusedMarksToday;
    acc.missingAttendanceMarksToday += school.metrics.missingAttendanceMarksToday;

    acc.healthAlertsToday += school.metrics.healthAlertsToday;
    acc.highTemperatureToday += school.metrics.highTemperatureToday;
    acc.symptomReportsToday += school.metrics.symptomReportsToday;

    acc.publishedOrLockedAssessments += school.metrics.publishedOrLockedAssessments;
    acc.assessmentScoresLast14Days += school.metrics.assessmentScoresLast14Days;
    acc.assessmentItemsTotal += school.metrics.assessmentItemsTotal;
    acc.assessmentItemsDraft += school.metrics.assessmentItemsDraft;
    acc.assessmentItemsWithScores += school.metrics.assessmentItemsWithScores;
    acc.assessmentItemsWithoutScores += school.metrics.assessmentItemsWithoutScores;
    acc.assessmentItemsWithoutLessonDelivery += school.metrics.assessmentItemsWithoutLessonDelivery;
    acc.assessmentItemsWithoutCurriculumUnit += school.metrics.assessmentItemsWithoutCurriculumUnit;

    acc.lessonDeliveriesLast14Days += school.metrics.lessonDeliveriesLast14Days;
    acc.lessonNotesSubmittedLast14Days += school.metrics.lessonNotesSubmittedLast14Days;
    acc.lessonNotesApprovedLast14Days += school.metrics.lessonNotesApprovedLast14Days;
    acc.lessonNotesReturnedLast14Days += school.metrics.lessonNotesReturnedLast14Days;
    acc.lessonNotesPendingReview += school.metrics.lessonNotesPendingReview;
    acc.approvedLessonNotesLast14Days += school.metrics.approvedLessonNotesLast14Days;
    acc.deliveredApprovedLessonNotesLast14Days +=
      school.metrics.deliveredApprovedLessonNotesLast14Days;
    acc.orphanedLessonNotesLast14Days += school.metrics.orphanedLessonNotesLast14Days;
    acc.lessonDeliveriesLinkedToApprovedNotesLast14Days +=
      school.metrics.lessonDeliveriesLinkedToApprovedNotesLast14Days;
    acc.orphanedDeliveriesLast14Days += school.metrics.orphanedDeliveriesLast14Days;

    return acc;
  }, zeroMetrics());

  const riskSummary = mappedSchools.reduce(
    (acc, school) => {
      if (school.metrics.riskLevel === "LOW") acc.low += 1;
      if (school.metrics.riskLevel === "MEDIUM") acc.medium += 1;
      if (school.metrics.riskLevel === "HIGH") acc.high += 1;
      if (school.metrics.riskLevel === "CRITICAL") acc.critical += 1;

      if (school.metrics.riskScore > acc.highestRiskScore) {
        acc.highestRiskScore = school.metrics.riskScore;
        acc.highestRiskSchool = {
          id: school.id,
          name: school.name,
          riskScore: school.metrics.riskScore,
          riskLevel: school.metrics.riskLevel,
        };
      }

      return acc;
    },
    {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
      highestRiskScore: 0,
      highestRiskSchool: null as null | {
        id: string;
        name: string;
        riskScore: number;
        riskLevel: RiskLevel;
      },
    }
  );

  const publicSchools = mappedSchools.filter((school) => school.schoolSector === SchoolSector.PUBLIC);
  const privateSchools = mappedSchools.filter((school) => school.schoolSector === SchoolSector.PRIVATE);

  const sectorRiskSummary = {
    public: {
      schools: publicSchools.length,
      highRiskSchools: publicSchools.filter((school) => school.metrics.riskLevel === "HIGH").length,
      criticalRiskSchools: publicSchools.filter((school) => school.metrics.riskLevel === "CRITICAL").length,
      highestRiskScore: publicSchools.reduce((max, school) => Math.max(max, school.metrics.riskScore), 0),
    },
    private: {
      schools: privateSchools.length,
      highRiskSchools: privateSchools.filter((school) => school.metrics.riskLevel === "HIGH").length,
      criticalRiskSchools: privateSchools.filter((school) => school.metrics.riskLevel === "CRITICAL").length,
      highestRiskScore: privateSchools.reduce((max, school) => Math.max(max, school.metrics.riskScore), 0),
    },
    governanceRule:
      "Public schools are normal GES governance targets. Private schools must be distinguished and should only be included in official command where explicitly authorized.",
  };

  const circuitMap = new Map<
    string,
    {
      circuitId: string;
      circuitName: string;
      districtId: string | null;
      districtName: string | null;
      schools: number;
      publicSchools: number;
      privateSchools: number;
      learners: number;
      teachers: number;
      classrooms: number;
      operationalClassrooms: number;
      attendanceSessionsToday: number;
      openAttendanceSessionsToday: number;
      closedAttendanceSessionsToday: number;
      certifiedAttendanceSessionsToday: number;
      closedButUncertifiedAttendanceSessionsToday: number;
      missingAttendanceSessionsToday: number;
      parentAlertsSentToday: number;
      attendanceMarksToday: number;
      presentMarksToday: number;
      absentMarksToday: number;
      lateMarksToday: number;
      missingAttendanceMarksToday: number;
      attendanceRateToday: number;
      attendanceCompletionRateToday: number;
      healthAlertsToday: number;
      publishedOrLockedAssessments: number;
      assessmentScoresLast14Days: number;
      assessmentItemsTotal: number;
      assessmentItemsDraft: number;
      assessmentItemsWithScores: number;
      assessmentItemsWithoutScores: number;
      assessmentItemsWithoutLessonDelivery: number;
      assessmentItemsWithoutCurriculumUnit: number;
      assessmentCompletionRate: number;
      assessmentLinkCoverageRate: number;
      lessonDeliveriesLast14Days: number;
      lessonNotesPendingReview: number;
      approvedLessonNotesLast14Days: number;
      deliveredApprovedLessonNotesLast14Days: number;
      orphanedLessonNotesLast14Days: number;
      lessonDeliveriesLinkedToApprovedNotesLast14Days: number;
      orphanedDeliveriesLast14Days: number;
      lessonDeliveryComplianceRate: number;
      highRiskSchools: number;
      criticalRiskSchools: number;
      highestRiskScore: number;
      schoolsDrivingRisk: Array<{
        schoolId: string;
        schoolName: string;
        schoolCode: string | null;
        schoolSector: SchoolSector;
        riskScore: number;
        riskLevel: RiskLevel;
        reasons: string[];
        recommendedActions: string[];
      }>;
      directorRecommendedActions: string[];
    }
  >();

  for (const school of mappedSchools) {
    const key = school.circuit?.id ?? "NO_CIRCUIT";

    const existing =
      circuitMap.get(key) ??
      {
        circuitId: school.circuit?.id ?? "NO_CIRCUIT",
        circuitName: school.circuit?.name ?? "Unassigned Circuit",
        districtId: school.district?.id ?? null,
        districtName: school.district?.name ?? null,
        schools: 0,
        publicSchools: 0,
        privateSchools: 0,
        learners: 0,
        teachers: 0,
        classrooms: 0,
        operationalClassrooms: 0,
        attendanceSessionsToday: 0,
        openAttendanceSessionsToday: 0,
        closedAttendanceSessionsToday: 0,
        certifiedAttendanceSessionsToday: 0,
        closedButUncertifiedAttendanceSessionsToday: 0,
        missingAttendanceSessionsToday: 0,
        parentAlertsSentToday: 0,
        attendanceMarksToday: 0,
        presentMarksToday: 0,
        absentMarksToday: 0,
        lateMarksToday: 0,
        missingAttendanceMarksToday: 0,
        attendanceRateToday: 0,
        attendanceCompletionRateToday: 0,
        healthAlertsToday: 0,
        publishedOrLockedAssessments: 0,
        assessmentScoresLast14Days: 0,
        assessmentItemsTotal: 0,
        assessmentItemsDraft: 0,
        assessmentItemsWithScores: 0,
        assessmentItemsWithoutScores: 0,
        assessmentItemsWithoutLessonDelivery: 0,
        assessmentItemsWithoutCurriculumUnit: 0,
        assessmentCompletionRate: 0,
        assessmentLinkCoverageRate: 0,
        lessonDeliveriesLast14Days: 0,
        lessonNotesPendingReview: 0,
        approvedLessonNotesLast14Days: 0,
        deliveredApprovedLessonNotesLast14Days: 0,
        orphanedLessonNotesLast14Days: 0,
        lessonDeliveriesLinkedToApprovedNotesLast14Days: 0,
        orphanedDeliveriesLast14Days: 0,
        lessonDeliveryComplianceRate: 0,
        highRiskSchools: 0,
        criticalRiskSchools: 0,
        highestRiskScore: 0,
        schoolsDrivingRisk: [],
        directorRecommendedActions: [],
      };

    existing.schools += 1;
    if (school.schoolSector === SchoolSector.PUBLIC) existing.publicSchools += 1;
    if (school.schoolSector === SchoolSector.PRIVATE) existing.privateSchools += 1;
    existing.learners += school.metrics.learners;
    existing.teachers += school.metrics.teachers;
    existing.classrooms += school.metrics.classrooms;
    existing.operationalClassrooms += school.metrics.operationalClassrooms;
    existing.attendanceSessionsToday += school.metrics.attendanceSessionsToday;
    existing.openAttendanceSessionsToday += school.metrics.openAttendanceSessionsToday;
    existing.closedAttendanceSessionsToday += school.metrics.closedAttendanceSessionsToday;
    existing.certifiedAttendanceSessionsToday += school.metrics.certifiedAttendanceSessionsToday;
    existing.closedButUncertifiedAttendanceSessionsToday +=
      school.metrics.closedButUncertifiedAttendanceSessionsToday;
    existing.missingAttendanceSessionsToday += school.metrics.missingAttendanceSessionsToday;
    existing.parentAlertsSentToday += school.metrics.parentAlertsSentToday;
    existing.attendanceMarksToday += school.metrics.attendanceMarksToday;
    existing.presentMarksToday += school.metrics.presentMarksToday;
    existing.absentMarksToday += school.metrics.absentMarksToday;
    existing.lateMarksToday += school.metrics.lateMarksToday;
    existing.missingAttendanceMarksToday += school.metrics.missingAttendanceMarksToday;
    existing.healthAlertsToday += school.metrics.healthAlertsToday;
    existing.publishedOrLockedAssessments += school.metrics.publishedOrLockedAssessments;
    existing.assessmentScoresLast14Days += school.metrics.assessmentScoresLast14Days;
    existing.assessmentItemsTotal += school.metrics.assessmentItemsTotal;
    existing.assessmentItemsDraft += school.metrics.assessmentItemsDraft;
    existing.assessmentItemsWithScores += school.metrics.assessmentItemsWithScores;
    existing.assessmentItemsWithoutScores += school.metrics.assessmentItemsWithoutScores;
    existing.assessmentItemsWithoutLessonDelivery += school.metrics.assessmentItemsWithoutLessonDelivery;
    existing.assessmentItemsWithoutCurriculumUnit += school.metrics.assessmentItemsWithoutCurriculumUnit;
    existing.lessonDeliveriesLast14Days += school.metrics.lessonDeliveriesLast14Days;
    existing.lessonNotesPendingReview += school.metrics.lessonNotesPendingReview;
    existing.approvedLessonNotesLast14Days += school.metrics.approvedLessonNotesLast14Days;
    existing.deliveredApprovedLessonNotesLast14Days +=
      school.metrics.deliveredApprovedLessonNotesLast14Days;
    existing.orphanedLessonNotesLast14Days += school.metrics.orphanedLessonNotesLast14Days;
    existing.lessonDeliveriesLinkedToApprovedNotesLast14Days +=
      school.metrics.lessonDeliveriesLinkedToApprovedNotesLast14Days;
    existing.orphanedDeliveriesLast14Days += school.metrics.orphanedDeliveriesLast14Days;

    if (school.metrics.riskLevel !== "LOW") {
      existing.schoolsDrivingRisk.push({
        schoolId: school.id,
        schoolName: school.name,
        schoolCode: school.schoolCode,
        schoolSector: school.schoolSector,
        riskScore: school.metrics.riskScore,
        riskLevel: school.metrics.riskLevel,
        reasons: school.metrics.riskReasons,
        recommendedActions: school.metrics.recommendedActions,
      });
    }

    if (school.metrics.riskLevel === "HIGH") existing.highRiskSchools += 1;
    if (school.metrics.riskLevel === "CRITICAL") existing.criticalRiskSchools += 1;
    existing.highestRiskScore = Math.max(existing.highestRiskScore, school.metrics.riskScore);

    circuitMap.set(key, existing);
  }

  const circuitBreakdown = Array.from(circuitMap.values())
    .map((row) => {
      const topSchools = [...row.schoolsDrivingRisk]
        .sort((a, b) => b.riskScore - a.riskScore)
        .slice(0, 5);

      return {
        ...row,
        schoolsDrivingRisk: topSchools,
        attendanceRateToday: pct(row.presentMarksToday, row.attendanceMarksToday),
        attendanceCompletionRateToday: pct(row.attendanceMarksToday, row.learners),
        assessmentCompletionRate: pct(row.assessmentItemsWithScores, row.assessmentItemsTotal),
        assessmentLinkCoverageRate: pct(
          row.assessmentItemsTotal - row.assessmentItemsWithoutLessonDelivery,
          row.assessmentItemsTotal
        ),
        lessonDeliveryComplianceRate: pct(
          row.deliveredApprovedLessonNotesLast14Days,
          row.approvedLessonNotesLast14Days
        ),
        directorRecommendedActions: topSchools.length
          ? [
              `Call the SISSO/Circuit Supervisor for ${row.circuitName} and require same-week follow-up with ${topSchools[0].schoolName}.`,
              "Ask for a short evidence report covering attendance capture, lesson delivery compliance, and assessment scoring gaps.",
              "Track whether the named school risk score drops after the intervention.",
            ]
          : [
              `Keep ${row.circuitName} under routine monitoring; no urgent circuit-level intervention is currently detected.`,
            ],
      };
    })
    .sort((a, b) => {
      const riskDiff =
        b.criticalRiskSchools - a.criticalRiskSchools ||
        b.highRiskSchools - a.highRiskSchools ||
        b.highestRiskScore - a.highestRiskScore;

      if (riskDiff !== 0) return riskDiff;
      return a.circuitName.localeCompare(b.circuitName);
    });

  const interventionQueue = mappedSchools
    .filter((school) => school.metrics.riskLevel !== "LOW")
    .slice(0, 10)
    .map((school) => ({
      schoolId: school.id,
      schoolName: school.name,
      schoolCode: school.schoolCode,
      schoolSector: school.schoolSector,
      circuitName: school.circuit?.name ?? "Unassigned Circuit",
      districtName: school.district?.name ?? null,
      riskScore: school.metrics.riskScore,
      riskLevel: school.metrics.riskLevel,
      reasons: school.metrics.riskReasons,
      recommendedActions: school.metrics.recommendedActions,
      metrics: {
        attendanceRateToday: school.metrics.attendanceRateToday,
        attendanceCompletionRateToday: school.metrics.attendanceCompletionRateToday,
        healthAlertsToday: school.metrics.healthAlertsToday,
        lessonDeliveriesLast14Days: school.metrics.lessonDeliveriesLast14Days,
        lessonNotesPendingReview: school.metrics.lessonNotesPendingReview,
        publishedOrLockedAssessments: school.metrics.publishedOrLockedAssessments,
        assessmentItemsTotal: school.metrics.assessmentItemsTotal,
        assessmentItemsDraft: school.metrics.assessmentItemsDraft,
        assessmentItemsWithoutScores: school.metrics.assessmentItemsWithoutScores,
        assessmentItemsWithoutLessonDelivery: school.metrics.assessmentItemsWithoutLessonDelivery,
        assessmentItemsWithoutCurriculumUnit: school.metrics.assessmentItemsWithoutCurriculumUnit,
        assessmentCompletionRate: school.metrics.assessmentCompletionRate,
        assessmentLinkCoverageRate: school.metrics.assessmentLinkCoverageRate,
        orphanedLessonNotesLast14Days: school.metrics.orphanedLessonNotesLast14Days,
        orphanedDeliveriesLast14Days: school.metrics.orphanedDeliveriesLast14Days,
        lessonDeliveryComplianceRate: school.metrics.lessonDeliveryComplianceRate,
      },
    }));

  const circuitCount = new Set(mappedSchools.map((s) => s.circuit?.id).filter(Boolean)).size;
  const districtCount = new Set(mappedSchools.map((s) => s.district?.id).filter(Boolean)).size;

  const attendance = buildAttendanceOverview(mappedSchools, dateKey);

  const teacherAttendance = await buildTeacherAttendanceOverview({
  mappedSchools,
  tenantIds: schoolIds,
  todayStart: start,
  todayEnd: end,
  dateKey,
});

const teacherAbsenteeism =
  await buildGovernanceTeacherAbsenteeismOverview({
    schools: mappedSchools,
    todayStart: start,
    todayEnd: end,
  });

const mockReadiness = await buildGovernanceMockReadinessOverview({
    schools: mappedSchools,
    tenantIds: schoolIds,
  });

  const emptyStates: string[] = [];

  if (metricTotals.attendanceSessionsToday === 0) {
    emptyStates.push("No attendance session has been opened today in this jurisdiction.");
  }

  if (metricTotals.lessonDeliveriesLast14Days === 0) {
    emptyStates.push("No lesson delivery evidence has been recorded in the last 14 days.");
  }

  if (metricTotals.publishedOrLockedAssessments === 0) {
    emptyStates.push("No published or locked assessment evidence has been recorded yet.");
  }

  if (metricTotals.assessmentItemsWithoutScores > 0) {
    emptyStates.push(
      `${metricTotals.assessmentItemsWithoutScores} assessment item(s) currently have no learner scores.`
    );
  }

  if (metricTotals.assessmentItemsWithoutLessonDelivery > 0) {
    emptyStates.push(
      `${metricTotals.assessmentItemsWithoutLessonDelivery} assessment item(s) are not linked to lesson delivery evidence.`
    );
  }

  if (metricTotals.orphanedLessonNotesLast14Days > 0) {
    emptyStates.push(
      `${metricTotals.orphanedLessonNotesLast14Days} approved lesson note(s) have no matching delivery evidence in the last 14 days.`
    );
  }

  if (metricTotals.orphanedDeliveriesLast14Days > 0) {
    emptyStates.push(
      `${metricTotals.orphanedDeliveriesLast14Days} lesson delivery record(s) are not linked to approved lesson notes.`
    );
  }

  if (metricTotals.healthAlertsToday === 0) {
    emptyStates.push("No learner health alerts have been recorded today.");
  }

  if (interventionQueue.length === 0) {
    emptyStates.push("No high-priority intervention school detected from current signals.");
  }

if (mockReadiness.schoolsWithReleasedMock === 0) {
  emptyStates.push("No released BECE Mock readiness evidence is available yet in this jurisdiction.");
} else if (mockReadiness.schoolsNeedingFollowUp > 0) {
  emptyStates.push(
    `${mockReadiness.schoolsNeedingFollowUp} school(s) need BECE Mock follow-up from released readiness evidence.`
  );
}

  if (teacherAttendance.schoolsCertified === 0) {
    emptyStates.push("No certified teacher attendance register is available today in this jurisdiction.");
  } else if (teacherAttendance.needsAction > 0) {
    emptyStates.push(
      `${teacherAttendance.needsAction} school(s) need teacher attendance follow-up today.`
    );
  }

  return {
    schools: mappedSchools,
    circuitBreakdown,
    interventionQueue,
    riskSummary,
    sectorSummary: sectorRiskSummary,
    totals: {
      schools: mappedSchools.length,
      publicSchools: publicSchools.length,
      privateSchools: privateSchools.length,
      learners: metricTotals.learners,
      teachers: metricTotals.teachers,
      classrooms: metricTotals.classrooms,
      operationalClassrooms: metricTotals.operationalClassrooms,
      circuits: circuitCount || zones.filter((z) => z.zoneType.level === 1).length,
      districts: districtCount || zones.filter((z) => z.zoneType.level === 2).length,
    },
    attendance,
teacherAttendance,
teacherAbsenteeism,
mockReadiness,
    signals: {
            teacherAttendanceSchoolsCertified: teacherAttendance.schoolsCertified,
      teacherAttendanceSchoolsMissingSession: teacherAttendance.schoolsMissingSession,
      teacherAttendanceSchoolsUncertified: teacherAttendance.schoolsUncertified,
      teacherAttendanceMarkedToday: teacherAttendance.marked,
      teacherAttendancePresentToday: teacherAttendance.present,
      teacherAttendanceAbsentToday: teacherAttendance.absent,
      teacherAttendanceLateToday: teacherAttendance.late,
      teacherAttendanceExcusedToday: teacherAttendance.excused,
      teacherAttendanceCompletionRateToday: teacherAttendance.completionPct,
      teacherAttendancePresentRateToday: teacherAttendance.presentPct,
      teacherAttendanceNeedsAction: teacherAttendance.needsAction,
      attendanceSessionsToday: metricTotals.attendanceSessionsToday,
      openAttendanceSessionsToday: metricTotals.openAttendanceSessionsToday,
      closedAttendanceSessionsToday: metricTotals.closedAttendanceSessionsToday,
      certifiedAttendanceSessionsToday: metricTotals.certifiedAttendanceSessionsToday,
      closedButUncertifiedAttendanceSessionsToday:
        metricTotals.closedButUncertifiedAttendanceSessionsToday,
      missingAttendanceSessionsToday: metricTotals.missingAttendanceSessionsToday,
      parentAlertsSentToday: metricTotals.parentAlertsSentToday,
      attendanceMarksToday: metricTotals.attendanceMarksToday,
      presentMarksToday: metricTotals.presentMarksToday,
      absentMarksToday: metricTotals.absentMarksToday,
      lateMarksToday: metricTotals.lateMarksToday,
      excusedMarksToday: metricTotals.excusedMarksToday,
      attendanceRateToday: pct(metricTotals.presentMarksToday, metricTotals.attendanceMarksToday),
      attendanceCompletionRateToday: pct(metricTotals.attendanceMarksToday, metricTotals.learners),
      missingAttendanceMarksToday: metricTotals.missingAttendanceMarksToday,

      healthAlertsToday: metricTotals.healthAlertsToday,
      highTemperatureToday: metricTotals.highTemperatureToday,
      symptomReportsToday: metricTotals.symptomReportsToday,

      publishedOrLockedAssessments: metricTotals.publishedOrLockedAssessments,
      assessmentScoresLast14Days: metricTotals.assessmentScoresLast14Days,
      assessmentItemsTotal: metricTotals.assessmentItemsTotal,
      assessmentItemsDraft: metricTotals.assessmentItemsDraft,
      assessmentItemsWithScores: metricTotals.assessmentItemsWithScores,
      assessmentItemsWithoutScores: metricTotals.assessmentItemsWithoutScores,
      assessmentItemsWithoutLessonDelivery: metricTotals.assessmentItemsWithoutLessonDelivery,
      assessmentItemsWithoutCurriculumUnit: metricTotals.assessmentItemsWithoutCurriculumUnit,
      assessmentCompletionRate: pct(metricTotals.assessmentItemsWithScores, metricTotals.assessmentItemsTotal),
      assessmentLinkCoverageRate: pct(
        metricTotals.assessmentItemsTotal - metricTotals.assessmentItemsWithoutLessonDelivery,
        metricTotals.assessmentItemsTotal
      ),

      lessonDeliveriesLast14Days: metricTotals.lessonDeliveriesLast14Days,
      lessonNotesSubmittedLast14Days: metricTotals.lessonNotesSubmittedLast14Days,
      lessonNotesApprovedLast14Days: metricTotals.lessonNotesApprovedLast14Days,
      lessonNotesReturnedLast14Days: metricTotals.lessonNotesReturnedLast14Days,
      lessonNotesPendingReview: metricTotals.lessonNotesPendingReview,
      approvedLessonNotesLast14Days: metricTotals.approvedLessonNotesLast14Days,
      deliveredApprovedLessonNotesLast14Days: metricTotals.deliveredApprovedLessonNotesLast14Days,
      orphanedLessonNotesLast14Days: metricTotals.orphanedLessonNotesLast14Days,
      lessonDeliveriesLinkedToApprovedNotesLast14Days:
        metricTotals.lessonDeliveriesLinkedToApprovedNotesLast14Days,
      orphanedDeliveriesLast14Days: metricTotals.orphanedDeliveriesLast14Days,
      lessonDeliveryComplianceRate: pct(
        metricTotals.deliveredApprovedLessonNotesLast14Days,
        metricTotals.approvedLessonNotesLast14Days
      ),

      highRiskSchools: riskSummary.high,
      criticalRiskSchools: riskSummary.critical,
      highestRiskScore: riskSummary.highestRiskScore,
    },
    emptyStates,
    generatedAt: new Date().toISOString(),
  };
}
