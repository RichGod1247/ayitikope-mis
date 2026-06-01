// src/lib/governance/scope.ts
import {
  AssessmentItemStatus,
  AttendanceStatus,
  ClassroomStatus,
  Prisma,
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

export const CIRCUIT_GOVERNANCE_ROLES = ["SISSO", "CIRCUIT_SUPERVISOR"] as const;

export const DISTRICT_GOVERNANCE_ROLES = [
  "DISTRICT_DIRECTOR",
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

  attendanceSessionsToday: number;
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

    attendanceSessionsToday: 0,
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
    actions.push(
      "Verify that lesson deliveries are linked to approved lesson notes, not recorded loosely."
    );
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
    const [zoneIds, tenantIds] = await Promise.all([
      loadAllActiveZoneIds(),
      loadAllActiveTenantIds(),
    ]);

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

  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);

  return { start, end };
}

async function loadSchoolMetrics(args: {
  tenantId: string;
  todayStart: Date;
  todayEnd: Date;
  fourteenDaysAgo: Date;
}): Promise<SchoolMetricSnapshot> {
  const { tenantId, todayStart, todayEnd, fourteenDaysAgo } = args;

  const [
    learners,
    teachers,
    classrooms,
    attendanceSessionsToday,
    attendanceMarksToday,
    presentMarksToday,
    absentMarksToday,
    lateMarksToday,
    excusedMarksToday,
    highTemperatureToday,
    symptomReportsToday,
    publishedOrLockedAssessments,
    assessmentScoresLast14Days,
    assessmentItemsTotal,
    assessmentItemsDraft,
    assessmentItemsWithScores,
    assessmentItemsWithoutScores,
    assessmentItemsWithoutLessonDelivery,
    assessmentItemsWithoutCurriculumUnit,
    lessonDeliveriesLast14Days,
    lessonNotesSubmittedLast14Days,
    lessonNotesApprovedLast14Days,
    lessonNotesReturnedLast14Days,
    lessonNotesPendingReview,
    approvedLessonNotesLast14Days,
    deliveredApprovedLessonNotesLast14Days,
    lessonDeliveriesLinkedToApprovedNotesLast14Days,
    orphanedDeliveriesLast14Days,
  ] = await prisma.$transaction([
    prisma.student.count({
      where: {
        tenantId,
        status: StudentStatus.ACTIVE,
      },
    }),

    prisma.teacherProfile.count({
      where: {
        tenantId,
      },
    }),

    prisma.classroom.count({
      where: {
        tenantId,
        status: ClassroomStatus.ACTIVE,
      },
    }),

    prisma.attendanceSession.count({
      where: {
        tenantId,
        date: { gte: todayStart, lt: todayEnd },
      },
    }),

    prisma.attendanceMark.count({
      where: {
        session: {
          tenantId,
          date: { gte: todayStart, lt: todayEnd },
        },
      },
    }),

    prisma.attendanceMark.count({
      where: {
        status: AttendanceStatus.PRESENT,
        session: {
          tenantId,
          date: { gte: todayStart, lt: todayEnd },
        },
      },
    }),

    prisma.attendanceMark.count({
      where: {
        status: AttendanceStatus.ABSENT,
        session: {
          tenantId,
          date: { gte: todayStart, lt: todayEnd },
        },
      },
    }),

    prisma.attendanceMark.count({
      where: {
        status: AttendanceStatus.LATE,
        session: {
          tenantId,
          date: { gte: todayStart, lt: todayEnd },
        },
      },
    }),

    prisma.attendanceMark.count({
      where: {
        status: AttendanceStatus.EXCUSED,
        session: {
          tenantId,
          date: { gte: todayStart, lt: todayEnd },
        },
      },
    }),

    prisma.studentHealthDaily.count({
      where: {
        tenantId,
        date: { gte: todayStart, lt: todayEnd },
        temperatureC: { gte: new Prisma.Decimal("37.5") },
      },
    }),

    prisma.studentHealthDaily.count({
      where: {
        tenantId,
        date: { gte: todayStart, lt: todayEnd },
        symptoms: { not: null },
      },
    }),

    prisma.assessmentItem.count({
      where: {
        tenantId,
        status: {
          in: [AssessmentItemStatus.PUBLISHED, AssessmentItemStatus.LOCKED],
        },
      },
    }),

    prisma.assessmentScore.count({
      where: {
        item: {
          tenantId,
          updatedAt: { gte: fourteenDaysAgo },
        },
      },
    }),

    prisma.assessmentItem.count({
      where: {
        tenantId,
      },
    }),

    prisma.assessmentItem.count({
      where: {
        tenantId,
        status: AssessmentItemStatus.DRAFT,
      },
    }),

    prisma.assessmentItem.count({
      where: {
        tenantId,
        scores: {
          some: {},
        },
      },
    }),

    prisma.assessmentItem.count({
      where: {
        tenantId,
        scores: {
          none: {},
        },
      },
    }),

    prisma.assessmentItem.count({
      where: {
        tenantId,
        lessonDeliveryId: null,
      },
    }),

    prisma.assessmentItem.count({
      where: {
        tenantId,
        curriculumUnitId: null,
      },
    }),

    prisma.lessonDelivery.count({
      where: {
        tenantId,
        dateTaught: { gte: fourteenDaysAgo },
      },
    }),

    prisma.lessonNote.count({
      where: {
        tenantId,
        submittedAt: { gte: fourteenDaysAgo },
      },
    }),

    prisma.lessonNote.count({
      where: {
        tenantId,
        approvedAt: { gte: fourteenDaysAgo },
      },
    }),

    prisma.lessonNote.count({
      where: {
        tenantId,
        rejectedAt: { gte: fourteenDaysAgo },
      },
    }),

    prisma.lessonNote.count({
      where: {
        tenantId,
        status: "SUBMITTED",
      },
    }),

    prisma.lessonNote.count({
      where: {
        tenantId,
        status: "APPROVED",
        approvedAt: { gte: fourteenDaysAgo },
      },
    }),

    prisma.lessonNote.count({
      where: {
        tenantId,
        status: "APPROVED",
        approvedAt: { gte: fourteenDaysAgo },
        lessonDeliveries: {
          some: {
            dateTaught: { gte: fourteenDaysAgo },
          },
        },
      },
    }),

    prisma.lessonDelivery.count({
      where: {
        tenantId,
        dateTaught: { gte: fourteenDaysAgo },
        lessonNote: {
          is: {
            status: "APPROVED",
          },
        },
      },
    }),

    prisma.lessonDelivery.count({
      where: {
        tenantId,
        dateTaught: { gte: fourteenDaysAgo },
        OR: [
          { lessonNoteId: null },
          {
            lessonNote: {
              is: {
                status: {
                  not: "APPROVED",
                },
              },
            },
          },
        ],
      },
    }),
  ]);

  const expectedAttendanceMarks = learners;
  const attendanceRateToday = pct(presentMarksToday, attendanceMarksToday);
  const attendanceCompletionRateToday = pct(
    attendanceMarksToday,
    expectedAttendanceMarks
  );
  const missingAttendanceMarksToday = Math.max(
    0,
    expectedAttendanceMarks - attendanceMarksToday
  );
  const healthAlertsToday = highTemperatureToday + symptomReportsToday;

  const orphanedLessonNotesLast14Days = Math.max(
    0,
    approvedLessonNotesLast14Days - deliveredApprovedLessonNotesLast14Days
  );
  const lessonDeliveryComplianceRate = pct(
    deliveredApprovedLessonNotesLast14Days,
    approvedLessonNotesLast14Days
  );
  const assessmentCompletionRate = pct(assessmentItemsWithScores, assessmentItemsTotal);
  const assessmentLinkCoverageRate = pct(
    assessmentItemsTotal - assessmentItemsWithoutLessonDelivery,
    assessmentItemsTotal
  );

  const base = {
    learners,
    teachers,
    classrooms,

    attendanceSessionsToday,
    attendanceMarksToday,
    presentMarksToday,
    absentMarksToday,
    lateMarksToday,
    excusedMarksToday,
    attendanceRateToday,
    attendanceCompletionRateToday,
    missingAttendanceMarksToday,

    healthAlertsToday,
    highTemperatureToday,
    symptomReportsToday,

    publishedOrLockedAssessments,
    assessmentScoresLast14Days,

    assessmentItemsTotal,
    assessmentItemsDraft,
    assessmentItemsWithScores,
    assessmentItemsWithoutScores,
    assessmentItemsWithoutLessonDelivery,
    assessmentItemsWithoutCurriculumUnit,
    assessmentCompletionRate,
    assessmentLinkCoverageRate,

    lessonDeliveriesLast14Days,
    lessonNotesSubmittedLast14Days,
    lessonNotesApprovedLast14Days,
    lessonNotesReturnedLast14Days,
    lessonNotesPendingReview,

    approvedLessonNotesLast14Days,
    deliveredApprovedLessonNotesLast14Days,
    orphanedLessonNotesLast14Days,
    lessonDeliveriesLinkedToApprovedNotesLast14Days,
    orphanedDeliveriesLast14Days,
    lessonDeliveryComplianceRate,
  };

  return {
    ...base,
    ...computeRisk(base),
  };
}

function emptyOverview(message = "No schools are currently assigned to this governance scope.") {
  return {
    schools: [],
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
    totals: {
      schools: 0,
      learners: 0,
      teachers: 0,
      classrooms: 0,
      circuits: 0,
      districts: 0,
    },
    signals: {
      attendanceSessionsToday: 0,
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

export async function buildGovernanceOverview(scope: GovernanceScope) {
  const tenantIds = scope.tenantIds;

  if (!tenantIds.length) {
    return emptyOverview();
  }

  const { start, end } = todayRangeUtcForGhana();

  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setUTCDate(fourteenDaysAgo.getUTCDate() - 14);

  const [schools, zones] = await Promise.all([
    prisma.tenant.findMany({
      where: {
        id: { in: tenantIds },
        status: TenantStatus.ACTIVE,
      },
      select: {
        id: true,
        name: true,
        schoolCode: true,
        status: true,
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
    }),

    prisma.adminZone.findMany({
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
    }),
  ]);

  if (!schools.length) {
    return emptyOverview("This governance scope is valid, but no active schools are attached to it yet.");
  }

 const schoolMetricPairs: Array<readonly [string, SchoolMetricSnapshot]> = [];

for (const school of schools) {
  const metrics = await loadSchoolMetrics({
    tenantId: school.id,
    todayStart: start,
    todayEnd: end,
    fourteenDaysAgo,
  });

  schoolMetricPairs.push([school.id, metrics] as const);
}

const metricsByTenantId = new Map<string, SchoolMetricSnapshot>(schoolMetricPairs);

  const mappedSchools: MappedSchool[] = schools
    .map((school) => {
      const metrics = metricsByTenantId.get(school.id) ?? zeroMetrics();

      return {
        id: school.id,
        name: school.name,
        schoolCode: school.schoolCode,
        status: school.status,
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

  const metricTotals = mappedSchools.reduce(
    (acc, school) => {
      acc.learners += school.metrics.learners;
      acc.teachers += school.metrics.teachers;
      acc.classrooms += school.metrics.classrooms;

      acc.attendanceSessionsToday += school.metrics.attendanceSessionsToday;
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
      acc.assessmentItemsWithoutLessonDelivery +=
        school.metrics.assessmentItemsWithoutLessonDelivery;
      acc.assessmentItemsWithoutCurriculumUnit +=
        school.metrics.assessmentItemsWithoutCurriculumUnit;

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
    },
    zeroMetrics()
  );

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

  const circuitMap = new Map<
    string,
    {
      circuitId: string;
      circuitName: string;
      districtId: string | null;
      districtName: string | null;
      schools: number;
      learners: number;
      teachers: number;
      classrooms: number;
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
        learners: 0,
        teachers: 0,
        classrooms: 0,
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
    existing.learners += school.metrics.learners;
    existing.teachers += school.metrics.teachers;
    existing.classrooms += school.metrics.classrooms;
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
    existing.assessmentItemsWithoutLessonDelivery +=
      school.metrics.assessmentItemsWithoutLessonDelivery;
    existing.assessmentItemsWithoutCurriculumUnit +=
      school.metrics.assessmentItemsWithoutCurriculumUnit;
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
        assessmentItemsWithoutLessonDelivery:
          school.metrics.assessmentItemsWithoutLessonDelivery,
        assessmentItemsWithoutCurriculumUnit:
          school.metrics.assessmentItemsWithoutCurriculumUnit,
        assessmentCompletionRate: school.metrics.assessmentCompletionRate,
        assessmentLinkCoverageRate: school.metrics.assessmentLinkCoverageRate,
        orphanedLessonNotesLast14Days: school.metrics.orphanedLessonNotesLast14Days,
        orphanedDeliveriesLast14Days: school.metrics.orphanedDeliveriesLast14Days,
        lessonDeliveryComplianceRate: school.metrics.lessonDeliveryComplianceRate,
      },
    }));

  const circuitCount = new Set(mappedSchools.map((s) => s.circuit?.id).filter(Boolean)).size;
  const districtCount = new Set(mappedSchools.map((s) => s.district?.id).filter(Boolean)).size;

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

  return {
    schools: mappedSchools,
    circuitBreakdown,
    interventionQueue,
    riskSummary,
    totals: {
      schools: mappedSchools.length,
      learners: metricTotals.learners,
      teachers: metricTotals.teachers,
      classrooms: metricTotals.classrooms,
      circuits: circuitCount || zones.filter((z) => z.zoneType.level === 1).length,
      districts: districtCount || zones.filter((z) => z.zoneType.level === 2).length,
    },
    signals: {
      attendanceSessionsToday: metricTotals.attendanceSessionsToday,
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
      assessmentItemsWithoutLessonDelivery:
        metricTotals.assessmentItemsWithoutLessonDelivery,
      assessmentItemsWithoutCurriculumUnit:
        metricTotals.assessmentItemsWithoutCurriculumUnit,
      assessmentCompletionRate: pct(
        metricTotals.assessmentItemsWithScores,
        metricTotals.assessmentItemsTotal
      ),
      assessmentLinkCoverageRate: pct(
        metricTotals.assessmentItemsTotal -
          metricTotals.assessmentItemsWithoutLessonDelivery,
        metricTotals.assessmentItemsTotal
      ),

      lessonDeliveriesLast14Days: metricTotals.lessonDeliveriesLast14Days,
      lessonNotesSubmittedLast14Days: metricTotals.lessonNotesSubmittedLast14Days,
      lessonNotesApprovedLast14Days: metricTotals.lessonNotesApprovedLast14Days,
      lessonNotesReturnedLast14Days: metricTotals.lessonNotesReturnedLast14Days,
      lessonNotesPendingReview: metricTotals.lessonNotesPendingReview,
      approvedLessonNotesLast14Days: metricTotals.approvedLessonNotesLast14Days,
      deliveredApprovedLessonNotesLast14Days:
        metricTotals.deliveredApprovedLessonNotesLast14Days,
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