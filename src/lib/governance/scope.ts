// src/lib/governance/scope.ts
import { Prisma } from "@prisma/client";
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

type SchoolMetricSnapshot = {
  learners: number;
  teachers: number;
  attendanceSessionsToday: number;
  attendanceMarksToday: number;
  presentMarksToday: number;
  healthAlertsToday: number;
  publishedOrLockedAssessments: number;
  lessonDeliveriesLast14Days: number;
};

function jsonNoStore(payload: any, status = 200) {
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

function zeroMetrics(): SchoolMetricSnapshot {
  return {
    learners: 0,
    teachers: 0,
    attendanceSessionsToday: 0,
    attendanceMarksToday: 0,
    presentMarksToday: 0,
    healthAlertsToday: 0,
    publishedOrLockedAssessments: 0,
    lessonDeliveriesLast14Days: 0,
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
      status: "ACTIVE",
    },
    select: { id: true },
    orderBy: { name: "asc" },
  });

  return tenants.map((t) => t.id);
}

async function loadAllActiveTenantIds() {
  const tenants = await prisma.tenant.findMany({
    where: { status: "ACTIVE" },
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
    (err as any).status = 403;
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
    attendanceSessionsToday,
    attendanceMarksToday,
    presentMarksToday,
    healthAlertsToday,
    publishedOrLockedAssessments,
    lessonDeliveriesLast14Days,
  ] = await Promise.all([
    prisma.student.count({
      where: {
        tenantId,
        status: "ACTIVE",
      },
    }),

    prisma.teacherProfile.count({
      where: {
        tenantId,
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
        status: "PRESENT",
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
        OR: [
          { temperatureC: { gte: new Prisma.Decimal("37.5") } },
          { symptoms: { not: null } },
        ],
      },
    }),

    prisma.assessmentItem.count({
      where: {
        tenantId,
        status: { in: ["PUBLISHED", "LOCKED"] },
      },
    }),

    prisma.lessonDelivery.count({
      where: {
        tenantId,
        dateTaught: { gte: fourteenDaysAgo },
      },
    }),
  ]);

  return {
    learners,
    teachers,
    attendanceSessionsToday,
    attendanceMarksToday,
    presentMarksToday,
    healthAlertsToday,
    publishedOrLockedAssessments,
    lessonDeliveriesLast14Days,
  };
}

export async function buildGovernanceOverview(scope: GovernanceScope) {
  const tenantIds = scope.tenantIds;

  if (!tenantIds.length) {
    return {
      schools: [],
      circuitBreakdown: [],
      totals: {
        schools: 0,
        learners: 0,
        teachers: 0,
        circuits: 0,
        districts: 0,
      },
      signals: {
        attendanceSessionsToday: 0,
        attendanceMarksToday: 0,
        presentMarksToday: 0,
        healthAlertsToday: 0,
        publishedOrLockedAssessments: 0,
        lessonDeliveriesLast14Days: 0,
      },
      emptyStates: ["No schools are currently assigned to this governance scope."],
    };
  }

  const { start, end } = todayRangeUtcForGhana();

  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setUTCDate(fourteenDaysAgo.getUTCDate() - 14);

  const [schools, zones] = await Promise.all([
    prisma.tenant.findMany({
      where: {
        id: { in: tenantIds },
        status: "ACTIVE",
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

  const schoolMetricPairs = await Promise.all(
    schools.map(async (school) => {
      const metrics = await loadSchoolMetrics({
        tenantId: school.id,
        todayStart: start,
        todayEnd: end,
        fourteenDaysAgo,
      });

      return [school.id, metrics] as const;
    })
  );

  const metricsByTenantId = new Map<string, SchoolMetricSnapshot>(schoolMetricPairs);

  const mappedSchools = schools.map((school) => {
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
  });

  const metricTotals = mappedSchools.reduce(
    (acc, school) => {
      acc.learners += school.metrics.learners;
      acc.teachers += school.metrics.teachers;
      acc.attendanceSessionsToday += school.metrics.attendanceSessionsToday;
      acc.attendanceMarksToday += school.metrics.attendanceMarksToday;
      acc.presentMarksToday += school.metrics.presentMarksToday;
      acc.healthAlertsToday += school.metrics.healthAlertsToday;
      acc.publishedOrLockedAssessments += school.metrics.publishedOrLockedAssessments;
      acc.lessonDeliveriesLast14Days += school.metrics.lessonDeliveriesLast14Days;
      return acc;
    },
    zeroMetrics()
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
      attendanceMarksToday: number;
      presentMarksToday: number;
      healthAlertsToday: number;
      publishedOrLockedAssessments: number;
      lessonDeliveriesLast14Days: number;
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
        attendanceMarksToday: 0,
        presentMarksToday: 0,
        healthAlertsToday: 0,
        publishedOrLockedAssessments: 0,
        lessonDeliveriesLast14Days: 0,
      };

    existing.schools += 1;
    existing.learners += school.metrics.learners;
    existing.teachers += school.metrics.teachers;
    existing.attendanceMarksToday += school.metrics.attendanceMarksToday;
    existing.presentMarksToday += school.metrics.presentMarksToday;
    existing.healthAlertsToday += school.metrics.healthAlertsToday;
    existing.publishedOrLockedAssessments += school.metrics.publishedOrLockedAssessments;
    existing.lessonDeliveriesLast14Days += school.metrics.lessonDeliveriesLast14Days;

    circuitMap.set(key, existing);
  }

  const circuitBreakdown = Array.from(circuitMap.values()).sort((a, b) =>
    a.circuitName.localeCompare(b.circuitName)
  );

  const circuitCount = zones.filter((z) => Number(z.zoneType.level) === 1).length;
  const districtCount = zones.filter((z) => Number(z.zoneType.level) === 2).length;

  const emptyStates: string[] = [];

  if (metricTotals.attendanceMarksToday === 0) {
    emptyStates.push("No attendance marks have been recorded today.");
  }

  if (metricTotals.healthAlertsToday === 0) {
    emptyStates.push("No student health alerts have been recorded today.");
  }

  if (metricTotals.lessonDeliveriesLast14Days === 0) {
    emptyStates.push("No lesson delivery evidence has been recorded in the last 14 days.");
  }

  if (metricTotals.publishedOrLockedAssessments === 0) {
    emptyStates.push("No published or locked assessment items are available yet.");
  }

  return {
    schools: mappedSchools,
    circuitBreakdown,
    totals: {
      schools: mappedSchools.length,
      learners: metricTotals.learners,
      teachers: metricTotals.teachers,
      circuits: circuitCount,
      districts: districtCount,
    },
    signals: {
      attendanceSessionsToday: metricTotals.attendanceSessionsToday,
      attendanceMarksToday: metricTotals.attendanceMarksToday,
      presentMarksToday: metricTotals.presentMarksToday,
      healthAlertsToday: metricTotals.healthAlertsToday,
      publishedOrLockedAssessments: metricTotals.publishedOrLockedAssessments,
      lessonDeliveriesLast14Days: metricTotals.lessonDeliveriesLast14Days,
    },
    emptyStates,
  };
}