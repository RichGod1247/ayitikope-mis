// src/app/api/governance/schemes/route.ts
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { SchemeStatus as PrismaSchemeStatus, TenantStatus } from "@prisma/client";
import {
  CIRCUIT_GOVERNANCE_ROLES,
  DISTRICT_GOVERNANCE_ROLES,
  assertTenantInGovernanceScope,
  requireGovernanceApiContext,
  type GovernanceScope,
} from "@/lib/governance/scope";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SchemeStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "RETURNED";
type SchemeStatusFilter = SchemeStatus | "ALL";
type Mode = "overview" | "circuit" | "school" | "teacher";

const GOVERNANCE_SCHEME_ROLES = [
  ...CIRCUIT_GOVERNANCE_ROLES,
  ...DISTRICT_GOVERNANCE_ROLES,
] as const;

const VALID_STATUSES = new Set<SchemeStatus>([
  "DRAFT",
  "SUBMITTED",
  "APPROVED",
  "RETURNED",
]);

type ZoneNode = {
  id: string;
  name: string;
  zoneType?: { level: number; name: string } | null;
  parentZone?: ZoneNode | null;
};

type TenantZone = ZoneNode | null;

type SchoolIdentity = {
  tenantId: string;
  schoolName: string;
  schoolCode: string | null;
  schoolSector: string;
  circuitId: string | null;
  circuitName: string | null;
  districtId: string | null;
  districtName: string | null;
};

type StatusCounts = Record<SchemeStatus, number>;

type SummaryBucket = {
  schools: number;
  teachers: number;
  schemes: number;
  schemeItems: number;
  teachersWithAnyScheme: Set<string>;
  teachersWithApprovedScheme: Set<string>;
  statusCounts: StatusCounts;
  latestSubmittedAt: string | null;
  latestApprovedAt: string | null;
  schoolsNeedingFollowUp: number;
  teachersMissingAnyScheme: number;
  teachersMissingApprovedScheme: number;
};

type SchemeRow = {
  id: string;
  tenantId: string;
  teacherUserId: string;
  classroomId: string | null;
  subject: string;
  subjectSlug: string | null;
  level: string | null;
  term: string;
  academicYear: string;
  title: string | null;
  status: SchemeStatus;
  itemCount: number;
  submittedAt: string | null;
  approvedAt: string | null;
  returnedAt: string | null;
  reviewedAt: string | null;
  headteacherComment: string | null;
  classroomName: string | null;
};

type TeacherCoverageRow = {
  tenantId: string;
  teacherUserId: string;
  teacherName: string;
  teacherEmail: string | null;
  school: SchoolIdentity;
  assignmentCount: number;
  assignments: Array<{
    kind: string;
    subject: string | null;
    classroomName: string | null;
    phase: string | null;
    level: string | null;
  }>;
  schemeCount: number;
  itemCount: number;
  statusCounts: StatusCounts;
  hasAnyScheme: boolean;
  hasApprovedScheme: boolean;
  needsFollowUp: boolean;
  followUpReason: string;
  latestSubmittedAt: string | null;
  latestApprovedAt: string | null;
  schemes: SchemeRow[];
};

type SchoolCoverageRow = {
  tenantId: string;
  schoolName: string;
  schoolCode: string | null;
  schoolSector: string;
  circuitId: string | null;
  circuitName: string | null;
  districtId: string | null;
  districtName: string | null;
  currentTerm: string | null;
  currentAcademicYear: string | null;
  teachers: number;
  schemes: number;
  schemeItems: number;
  teachersWithAnyScheme: number;
  teachersWithApprovedScheme: number;
  teachersMissingAnyScheme: number;
  teachersMissingApprovedScheme: number;
  statusCounts: StatusCounts;
  coveragePct: number;
  approvedCoveragePct: number;
  latestSubmittedAt: string | null;
  latestApprovedAt: string | null;
  needsFollowUp: boolean;
  followUpReason: string;
};

function jsonNoStore(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
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

function isLikelyId(id: string) {
  const v = clean(id);
  return v.length >= 5 && v.length <= 128 && /^[a-zA-Z0-9_-]+$/.test(v);
}

function parseMode(raw: unknown): Mode {
  const mode = clean(raw).toLowerCase();
  if (mode === "circuit" || mode === "school" || mode === "teacher") return mode;
  return "overview";
}

function parseStatus(raw: unknown): SchemeStatusFilter | null {
  const s = upper(raw);
  if (!s) return null;
  if (s === "ALL") return "ALL";
  if (VALID_STATUSES.has(s as SchemeStatus)) return s as SchemeStatus;
  return null;
}

function toIsoOrNull(v: Date | string | null | undefined) {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function userName(u: {
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
} | null | undefined) {
  const direct = clean(u?.name);
  if (direct) return direct;

  const full = [clean(u?.firstName), clean(u?.lastName)].filter(Boolean).join(" ");
  return full || clean(u?.email) || "Unknown teacher";
}

function classLabel(c: {
  name?: string | null;
  grade?: string | null;
  arm?: string | null;
} | null | undefined) {
  const name = clean(c?.name);
  const arm = clean(c?.arm);
  const grade = clean(c?.grade);
  return [name || grade, arm].filter(Boolean).join(" ").trim() || null;
}

function emptyStatusCounts(): StatusCounts {
  return {
    DRAFT: 0,
    SUBMITTED: 0,
    APPROVED: 0,
    RETURNED: 0,
  };
}

function normalizeSchemeStatus(raw: unknown): SchemeStatus {
  const s = upper(raw);
  return VALID_STATUSES.has(s as SchemeStatus) ? (s as SchemeStatus) : "DRAFT";
}

function pct(numerator: number, denominator: number) {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 100);
}

function latest(current: string | null, next: Date | string | null | undefined) {
  const iso = toIsoOrNull(next);
  if (!iso) return current;
  if (!current) return iso;
  return new Date(iso).getTime() > new Date(current).getTime() ? iso : current;
}

function resolveSchoolIdentity(tenant: {
  id: string;
  name: string;
  schoolCode: string | null;
  schoolSector: string;
  zone: TenantZone;
}): SchoolIdentity {
  const zone = tenant.zone;
  const zoneLevel = zone?.zoneType?.level ?? null;
  const parentLevel = zone?.parentZone?.zoneType?.level ?? null;

  const circuit =
    zone && zoneLevel === 1
      ? zone
      : zone?.parentZone && parentLevel === 1
        ? zone.parentZone
        : null;

  const district =
    zone && zoneLevel === 2
      ? zone
      : zone?.parentZone && parentLevel === 2
        ? zone.parentZone
        : null;

  return {
    tenantId: tenant.id,
    schoolName: tenant.name,
    schoolCode: tenant.schoolCode ?? null,
    schoolSector: tenant.schoolSector,
    circuitId: circuit?.id ?? null,
    circuitName: circuit?.name ?? null,
    districtId: district?.id ?? null,
    districtName: district?.name ?? null,
  };
}

function schemeMatchesWindow(args: {
  scheme: { tenantId: string; term: string; academicYear: string };
  tenantWindow: Map<string, { term: string | null; academicYear: string | null }>;
  termFilter: string | null;
  academicYearFilter: string | null;
}) {
  const term = clean(args.scheme.term);
  const academicYear = clean(args.scheme.academicYear);

  if (args.termFilter && term !== args.termFilter) return false;
  if (args.academicYearFilter && academicYear !== args.academicYearFilter) return false;

  if (args.termFilter || args.academicYearFilter) return true;

  const current = args.tenantWindow.get(args.scheme.tenantId);
  const currentTerm = clean(current?.term);
  const currentYear = clean(current?.academicYear);

  // If a tenant has not completed term/year setup, do not hide historical scheme evidence.
  if (!currentTerm && !currentYear) return true;
  if (currentTerm && term !== currentTerm) return false;
  if (currentYear && academicYear !== currentYear) return false;

  return true;
}

function summarizeBucket(bucket: SummaryBucket) {
  return {
    schools: bucket.schools,
    teachers: bucket.teachers,
    schemes: bucket.schemes,
    schemeItems: bucket.schemeItems,
    teachersWithAnyScheme: bucket.teachersWithAnyScheme.size,
    teachersWithApprovedScheme: bucket.teachersWithApprovedScheme.size,
    teachersMissingAnyScheme: bucket.teachersMissingAnyScheme,
    teachersMissingApprovedScheme: bucket.teachersMissingApprovedScheme,
    statusCounts: bucket.statusCounts,
    coveragePct: pct(bucket.teachersWithAnyScheme.size, bucket.teachers),
    approvedCoveragePct: pct(bucket.teachersWithApprovedScheme.size, bucket.teachers),
    latestSubmittedAt: bucket.latestSubmittedAt,
    latestApprovedAt: bucket.latestApprovedAt,
    schoolsNeedingFollowUp: bucket.schoolsNeedingFollowUp,
  };
}

function emptySummaryBucket(): SummaryBucket {
  return {
    schools: 0,
    teachers: 0,
    schemes: 0,
    schemeItems: 0,
    teachersWithAnyScheme: new Set<string>(),
    teachersWithApprovedScheme: new Set<string>(),
    statusCounts: emptyStatusCounts(),
    latestSubmittedAt: null,
    latestApprovedAt: null,
    schoolsNeedingFollowUp: 0,
    teachersMissingAnyScheme: 0,
    teachersMissingApprovedScheme: 0,
  };
}

async function buildCoverage(args: {
  scope: GovernanceScope;
  termFilter: string | null;
  academicYearFilter: string | null;
  statusFilter: SchemeStatusFilter | null;
}) {
  const tenantIds = args.scope.tenantIds;

  const tenants = tenantIds.length
    ? await prisma.tenant.findMany({
        where: {
          id: { in: tenantIds },
          status: TenantStatus.ACTIVE,
        },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          schoolCode: true,
          schoolSector: true,
          tenantSettings: {
            select: {
              currentTerm: true,
              currentAcademicYear: true,
            },
          },
          zone: {
            select: {
              id: true,
              name: true,
              zoneType: { select: { level: true, name: true } },
              parentZone: {
                select: {
                  id: true,
                  name: true,
                  zoneType: { select: { level: true, name: true } },
                  parentZone: {
                    select: {
                      id: true,
                      name: true,
                      zoneType: { select: { level: true, name: true } },
                    },
                  },
                },
              },
            },
          },
        },
      })
    : [];

  const schoolByTenantId = new Map(tenants.map((tenant) => [tenant.id, resolveSchoolIdentity(tenant)]));
  const tenantWindow = new Map(
    tenants.map((tenant) => [
      tenant.id,
      {
        term: clean(tenant.tenantSettings?.currentTerm) || null,
        academicYear: clean(tenant.tenantSettings?.currentAcademicYear) || null,
      },
    ]),
  );

  const [teacherMemberships, assignments, schemeRows] = await Promise.all([
    tenantIds.length
      ? prisma.membership.findMany({
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
          orderBy: [{ tenantId: "asc" }, { createdAt: "asc" }],
          select: {
            tenantId: true,
            userId: true,
            user: {
              select: {
                id: true,
                name: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        })
      : Promise.resolve([]),

    tenantIds.length
      ? prisma.teacherAssessmentAssignment.findMany({
          where: {
            tenantId: { in: tenantIds },
            status: "ACTIVE",
            revokedAt: null,
          },
          select: {
            tenantId: true,
            teacherUserId: true,
            assignmentKind: true,
            subject: true,
            phase: true,
            level: true,
            classroom: { select: { name: true, grade: true, arm: true } },
          },
        })
      : Promise.resolve([]),

    tenantIds.length
      ? prisma.schemeOfWork.findMany({
          where: {
            tenantId: { in: tenantIds },
            ...(args.statusFilter && args.statusFilter !== "ALL"
              ? { status: args.statusFilter as PrismaSchemeStatus }
              : {}),
            ...(args.termFilter ? { term: args.termFilter } : {}),
            ...(args.academicYearFilter ? { academicYear: args.academicYearFilter } : {}),
          },
          orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
          take: 5000,
          select: {
            id: true,
            tenantId: true,
            teacherUserId: true,
            classroomId: true,
            subject: true,
            subjectSlug: true,
            level: true,
            term: true,
            academicYear: true,
            title: true,
            status: true,
            submittedAt: true,
            approvedAt: true,
            returnedAt: true,
            reviewedAt: true,
            headteacherComment: true,
          },
        })
      : Promise.resolve([]),
  ]);

  const schemeIdsForCounts = schemeRows.map((scheme) => scheme.id);
  const schemeClassroomIds = Array.from(
    new Set(
      schemeRows
        .map((scheme) => clean(scheme.classroomId))
        .filter(Boolean),
    ),
  );

  const [schemeItemGroups, schemeClassroomRows] = await Promise.all([
    schemeIdsForCounts.length
      ? prisma.schemeOfWorkItem.groupBy({
          by: ["schemeOfWorkId"],
          where: {
            schemeOfWorkId: { in: schemeIdsForCounts },
          },
          _count: { _all: true },
        })
      : Promise.resolve([]),

    schemeClassroomIds.length
      ? prisma.classroom.findMany({
          where: {
            id: { in: schemeClassroomIds },
            tenantId: { in: tenantIds },
          },
          select: {
            id: true,
            name: true,
            grade: true,
            arm: true,
          },
        })
      : Promise.resolve([]),
  ]);

  const itemCountBySchemeId = new Map(
    schemeItemGroups.map((row) => [row.schemeOfWorkId, row._count._all]),
  );

  const classroomById = new Map(
    schemeClassroomRows.map((classroom) => [classroom.id, classroom]),
  );

  const assignmentMap = new Map<string, typeof assignments>();
  for (const assignment of assignments) {
    const key = `${assignment.tenantId}:${assignment.teacherUserId}`;
    const arr = assignmentMap.get(key) ?? [];
    arr.push(assignment);
    assignmentMap.set(key, arr);
  }

  const schemesByTeacher = new Map<string, SchemeRow[]>();

  for (const scheme of schemeRows) {
    if (
      !schemeMatchesWindow({
        scheme,
        tenantWindow,
        termFilter: args.termFilter,
        academicYearFilter: args.academicYearFilter,
      })
    ) {
      continue;
    }

    const row: SchemeRow = {
      id: scheme.id,
      tenantId: scheme.tenantId,
      teacherUserId: scheme.teacherUserId,
      classroomId: scheme.classroomId ?? null,
      subject: scheme.subject,
      subjectSlug: scheme.subjectSlug ?? null,
      level: scheme.level ?? null,
      term: scheme.term,
      academicYear: scheme.academicYear,
      title: scheme.title ?? null,
      status: normalizeSchemeStatus(scheme.status),
      itemCount: itemCountBySchemeId.get(scheme.id) ?? 0,
      submittedAt: toIsoOrNull(scheme.submittedAt),
      approvedAt: toIsoOrNull(scheme.approvedAt),
      returnedAt: toIsoOrNull(scheme.returnedAt),
      reviewedAt: toIsoOrNull(scheme.reviewedAt),
      headteacherComment: scheme.headteacherComment ?? null,
      classroomName: classLabel(scheme.classroomId ? classroomById.get(scheme.classroomId) : null),
    };

    const key = `${row.tenantId}:${row.teacherUserId}`;
    const arr = schemesByTeacher.get(key) ?? [];
    arr.push(row);
    schemesByTeacher.set(key, arr);
  }

  const teacherRows: TeacherCoverageRow[] = teacherMemberships
    .filter((membership) => schoolByTenantId.has(membership.tenantId))
    .map((membership) => {
      const school = schoolByTenantId.get(membership.tenantId)!;
      const key = `${membership.tenantId}:${membership.userId}`;
      const schemes = schemesByTeacher.get(key) ?? [];
      const statusCounts = emptyStatusCounts();
      let itemCount = 0;
      let latestSubmittedAt: string | null = null;
      let latestApprovedAt: string | null = null;

      for (const scheme of schemes) {
        statusCounts[scheme.status] += 1;
        itemCount += scheme.itemCount;
        latestSubmittedAt = latest(latestSubmittedAt, scheme.submittedAt);
        latestApprovedAt = latest(latestApprovedAt, scheme.approvedAt);
      }

      const hasAnyScheme = schemes.length > 0;
      const hasApprovedScheme = statusCounts.APPROVED > 0;
      const needsFollowUp = !hasAnyScheme || !hasApprovedScheme || statusCounts.RETURNED > 0 || statusCounts.SUBMITTED > 0;

      const followUpReason = !hasAnyScheme
        ? "No scheme of work has been prepared for the current term/year window."
        : !hasApprovedScheme
          ? "Teacher has scheme evidence, but no approved scheme yet."
          : statusCounts.RETURNED > 0
            ? "Teacher has returned scheme evidence needing correction."
            : statusCounts.SUBMITTED > 0
              ? "Teacher has submitted scheme awaiting headteacher vetting."
              : "Scheme preparation evidence is approved.";

      const teacherAssignments = assignmentMap.get(key) ?? [];

      return {
        tenantId: membership.tenantId,
        teacherUserId: membership.userId,
        teacherName: userName(membership.user),
        teacherEmail: membership.user.email ?? null,
        school,
        assignmentCount: teacherAssignments.length,
        assignments: teacherAssignments.map((assignment) => ({
          kind: String(assignment.assignmentKind),
          subject: assignment.subject ?? null,
          classroomName: classLabel(assignment.classroom),
          phase: assignment.phase ? String(assignment.phase) : null,
          level: assignment.level ?? null,
        })),
        schemeCount: schemes.length,
        itemCount,
        statusCounts,
        hasAnyScheme,
        hasApprovedScheme,
        needsFollowUp,
        followUpReason,
        latestSubmittedAt,
        latestApprovedAt,
        schemes,
      };
    })
    .sort((a, b) => a.school.schoolName.localeCompare(b.school.schoolName) || a.teacherName.localeCompare(b.teacherName));

  const schoolRows: SchoolCoverageRow[] = tenants.map((tenant) => {
    const school = schoolByTenantId.get(tenant.id)!;
    const teachers = teacherRows.filter((teacher) => teacher.tenantId === tenant.id);
    const statusCounts = emptyStatusCounts();
    let schemes = 0;
    let schemeItems = 0;
    let latestSubmittedAt: string | null = null;
    let latestApprovedAt: string | null = null;

    for (const teacher of teachers) {
      schemes += teacher.schemeCount;
      schemeItems += teacher.itemCount;
      latestSubmittedAt = latest(latestSubmittedAt, teacher.latestSubmittedAt);
      latestApprovedAt = latest(latestApprovedAt, teacher.latestApprovedAt);

      for (const status of VALID_STATUSES) {
        statusCounts[status] += teacher.statusCounts[status];
      }
    }

    const teachersWithAnyScheme = teachers.filter((teacher) => teacher.hasAnyScheme).length;
    const teachersWithApprovedScheme = teachers.filter((teacher) => teacher.hasApprovedScheme).length;
    const teachersMissingAnyScheme = Math.max(0, teachers.length - teachersWithAnyScheme);
    const teachersMissingApprovedScheme = Math.max(0, teachers.length - teachersWithApprovedScheme);

    const needsFollowUp =
      teachers.length === 0 ||
      teachersMissingAnyScheme > 0 ||
      teachersMissingApprovedScheme > 0 ||
      statusCounts.SUBMITTED > 0 ||
      statusCounts.RETURNED > 0;

    const followUpReason = teachers.length === 0
      ? "No active teacher membership found for this school."
      : teachersMissingAnyScheme > 0
        ? `${teachersMissingAnyScheme} active teacher(s) have no scheme of work evidence.`
        : teachersMissingApprovedScheme > 0
          ? `${teachersMissingApprovedScheme} active teacher(s) have no approved scheme yet.`
          : statusCounts.RETURNED > 0
            ? `${statusCounts.RETURNED} returned scheme(s) need correction.`
            : statusCounts.SUBMITTED > 0
              ? `${statusCounts.SUBMITTED} submitted scheme(s) await headteacher vetting.`
              : "All active teachers have approved scheme evidence.";

    return {
      ...school,
      currentTerm: clean(tenant.tenantSettings?.currentTerm) || null,
      currentAcademicYear: clean(tenant.tenantSettings?.currentAcademicYear) || null,
      teachers: teachers.length,
      schemes,
      schemeItems,
      teachersWithAnyScheme,
      teachersWithApprovedScheme,
      teachersMissingAnyScheme,
      teachersMissingApprovedScheme,
      statusCounts,
      coveragePct: pct(teachersWithAnyScheme, teachers.length),
      approvedCoveragePct: pct(teachersWithApprovedScheme, teachers.length),
      latestSubmittedAt,
      latestApprovedAt,
      needsFollowUp,
      followUpReason,
    };
  });

  const overall = emptySummaryBucket();
  overall.schools = schoolRows.length;

  for (const school of schoolRows) {
    overall.teachers += school.teachers;
    overall.schemes += school.schemes;
    overall.schemeItems += school.schemeItems;
    overall.teachersMissingAnyScheme += school.teachersMissingAnyScheme;
    overall.teachersMissingApprovedScheme += school.teachersMissingApprovedScheme;
    overall.latestSubmittedAt = latest(overall.latestSubmittedAt, school.latestSubmittedAt);
    overall.latestApprovedAt = latest(overall.latestApprovedAt, school.latestApprovedAt);
    if (school.needsFollowUp) overall.schoolsNeedingFollowUp += 1;

    for (const status of VALID_STATUSES) {
      overall.statusCounts[status] += school.statusCounts[status];
    }
  }

  for (const teacher of teacherRows) {
    if (teacher.hasAnyScheme) overall.teachersWithAnyScheme.add(`${teacher.tenantId}:${teacher.teacherUserId}`);
    if (teacher.hasApprovedScheme) overall.teachersWithApprovedScheme.add(`${teacher.tenantId}:${teacher.teacherUserId}`);
  }

  const circuitBuckets = new Map<string, {
    circuitId: string | null;
    circuitName: string | null;
    districtId: string | null;
    districtName: string | null;
    bucket: SummaryBucket;
    schools: Set<string>;
  }>();

  for (const school of schoolRows) {
    const key = school.circuitId || `uncircuited:${school.districtId || "unknown"}`;
    const existing = circuitBuckets.get(key) ?? {
      circuitId: school.circuitId,
      circuitName: school.circuitName || "Unassigned Circuit",
      districtId: school.districtId,
      districtName: school.districtName,
      bucket: emptySummaryBucket(),
      schools: new Set<string>(),
    };

    existing.schools.add(school.tenantId);
    existing.bucket.schools = existing.schools.size;
    existing.bucket.teachers += school.teachers;
    existing.bucket.schemes += school.schemes;
    existing.bucket.schemeItems += school.schemeItems;
    existing.bucket.teachersMissingAnyScheme += school.teachersMissingAnyScheme;
    existing.bucket.teachersMissingApprovedScheme += school.teachersMissingApprovedScheme;
    existing.bucket.latestSubmittedAt = latest(existing.bucket.latestSubmittedAt, school.latestSubmittedAt);
    existing.bucket.latestApprovedAt = latest(existing.bucket.latestApprovedAt, school.latestApprovedAt);
    if (school.needsFollowUp) existing.bucket.schoolsNeedingFollowUp += 1;

    for (const status of VALID_STATUSES) {
      existing.bucket.statusCounts[status] += school.statusCounts[status];
    }

    const schoolTeachers = teacherRows.filter((teacher) => teacher.tenantId === school.tenantId);
    for (const teacher of schoolTeachers) {
      if (teacher.hasAnyScheme) existing.bucket.teachersWithAnyScheme.add(`${teacher.tenantId}:${teacher.teacherUserId}`);
      if (teacher.hasApprovedScheme) existing.bucket.teachersWithApprovedScheme.add(`${teacher.tenantId}:${teacher.teacherUserId}`);
    }

    circuitBuckets.set(key, existing);
  }

  const circuits = Array.from(circuitBuckets.values())
    .map((row) => ({
      circuitId: row.circuitId,
      circuitName: row.circuitName,
      districtId: row.districtId,
      districtName: row.districtName,
      ...summarizeBucket(row.bucket),
    }))
    .sort((a, b) => b.schoolsNeedingFollowUp - a.schoolsNeedingFollowUp || String(a.circuitName ?? "").localeCompare(String(b.circuitName ?? "")));

  return {
    summary: summarizeBucket(overall),
    circuits,
    schools: schoolRows.sort((a, b) => Number(b.needsFollowUp) - Number(a.needsFollowUp) || b.teachersMissingApprovedScheme - a.teachersMissingApprovedScheme || a.schoolName.localeCompare(b.schoolName)),
    teachers: teacherRows,
    filters: {
      term: args.termFilter,
      academicYear: args.academicYearFilter,
      status: args.statusFilter ?? "ALL",
      defaultWindowRule: args.termFilter || args.academicYearFilter ? "QUERY_FILTER" : "TENANT_CURRENT_TERM_YEAR_WHEN_SET",
    },
  };
}

export async function GET(req: NextRequest) {
  const reqId = randomUUID();
  const url = new URL(req.url);
  const mode = parseMode(url.searchParams.get("mode"));
  const circuitId = clean(url.searchParams.get("circuitId"));
  const tenantId = clean(url.searchParams.get("tenantId"));
  const teacherUserId = clean(url.searchParams.get("teacherUserId"));
  const termFilter = clean(url.searchParams.get("term")) || null;
  const academicYearFilter = clean(url.searchParams.get("academicYear")) || null;
  const statusFilter = parseStatus(url.searchParams.get("status"));

  if (url.searchParams.get("status") && statusFilter == null) {
    return jsonNoStore({ ok: false, reqId, error: "INVALID_STATUS" }, 400);
  }

  const auth = await requireGovernanceApiContext(req, {
    allowedRoles: GOVERNANCE_SCHEME_ROLES,
    allowedZoneLevels: [1, 2],
  });

  if (!auth.ok) return auth.res;

  try {
    const coverage = await buildCoverage({
      scope: auth.scope,
      termFilter,
      academicYearFilter,
      statusFilter,
    });

    if (mode === "circuit") {
      if (!circuitId || !isLikelyId(circuitId)) {
        return jsonNoStore({ ok: false, reqId, error: "INVALID_CIRCUIT_ID" }, 400);
      }

      const schools = coverage.schools.filter((school) => school.circuitId === circuitId);
      const tenantSet = new Set(schools.map((school) => school.tenantId));

      return jsonNoStore({
        ok: true,
        reqId,
        mode,
        circuit: coverage.circuits.find((circuit) => circuit.circuitId === circuitId) ?? null,
        schools,
        teachers: coverage.teachers.filter((teacher) => tenantSet.has(teacher.tenantId)),
        filters: coverage.filters,
      });
    }

    if (mode === "school") {
      if (!tenantId || !isLikelyId(tenantId)) {
        return jsonNoStore({ ok: false, reqId, error: "INVALID_TENANT_ID" }, 400);
      }

      assertTenantInGovernanceScope(auth.scope, tenantId);

      return jsonNoStore({
        ok: true,
        reqId,
        mode,
        school: coverage.schools.find((school) => school.tenantId === tenantId) ?? null,
        teachers: coverage.teachers.filter((teacher) => teacher.tenantId === tenantId),
        filters: coverage.filters,
      });
    }

    if (mode === "teacher") {
      if (!tenantId || !isLikelyId(tenantId)) {
        return jsonNoStore({ ok: false, reqId, error: "INVALID_TENANT_ID" }, 400);
      }

      if (!teacherUserId || !isLikelyId(teacherUserId)) {
        return jsonNoStore({ ok: false, reqId, error: "INVALID_TEACHER_ID" }, 400);
      }

      assertTenantInGovernanceScope(auth.scope, tenantId);

      return jsonNoStore({
        ok: true,
        reqId,
        mode,
        teacher:
          coverage.teachers.find(
            (teacher) => teacher.tenantId === tenantId && teacher.teacherUserId === teacherUserId,
          ) ?? null,
        filters: coverage.filters,
      });
    }

    return jsonNoStore({
      ok: true,
      reqId,
      mode: "overview",
      summary: coverage.summary,
      circuits: coverage.circuits,
      schools: coverage.schools,
      followUpSchools: coverage.schools.filter((school) => school.needsFollowUp).slice(0, 30),
      filters: coverage.filters,
    });
  } catch (error) {
    const status = typeof (error as { status?: unknown }).status === "number" ? Number((error as { status?: unknown }).status) : 500;
    return jsonNoStore(
      {
        ok: false,
        reqId,
        error: status === 403 ? "GOVERNANCE_TENANT_FORBIDDEN" : "GOVERNANCE_SCHEMES_FAILED",
      },
      status,
    );
  }
}
