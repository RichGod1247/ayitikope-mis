// src/lib/appraisals/teacherSupervisoryAssessmentQueue.ts
import { prisma } from "@/lib/prisma";
import {
  TEACHER_SUPERVISORY_ASSESSMENT_POLICY,
  canonicalTeacherSupervisoryAssessorRole,
  decideTeacherSupervisoryAssessmentAuthority,
  type TeacherSupervisoryGovernanceAssignment,
  type TeacherSupervisoryTarget,
} from "@/lib/appraisals/teacherSupervisoryAssessment";
import type { GovernanceScope } from "@/lib/governance/scope";

export const TEACHER_SUPERVISORY_QUEUE_POLICY = {
  schemaVersion: 1,
  workflow: TEACHER_SUPERVISORY_ASSESSMENT_POLICY.workflow,
  instrumentCode: TEACHER_SUPERVISORY_ASSESSMENT_POLICY.instrumentCode,
  instrumentVersion: TEACHER_SUPERVISORY_ASSESSMENT_POLICY.instrumentVersion,
  targetRole: TEACHER_SUPERVISORY_ASSESSMENT_POLICY.targetRole,
  readOnlyDiscovery: true,
  activeMembershipRequired: true,
  activeTenantRequired: true,
  activeCircuitRequired: true,
  activeDistrictRequired: true,
  authorityRecheckedPerTarget: true,
  tenantScopeRequired: true,
  stableHierarchyIdentifiersRequired: true,
  legacyTeacherAppraisalIncluded: false,
  assessmentEvidenceIncluded: false,
  contactDetailsIncluded: false,
  backgroundPollingAllowed: false,
  databaseWritesAllowed: false,
  providerCallsAllowed: false,
} as const;

export type TeacherSupervisorySelectionMode =
  | "ASSIGNED_CIRCUIT_TEACHERS"
  | "DISTRICT_CIRCUIT_SCHOOL_TEACHERS";

export type TeacherSupervisoryQueueCircuit = {
  circuitId: string;
  circuitName: string;
  districtId: string;
  districtName: string;
  schoolCount: number;
  teacherCount: number;
};

export type TeacherSupervisoryQueueItem = {
  targetUserId: string;
  targetName: string | null;
  schoolId: string;
  schoolName: string;
  circuitId: string;
  circuitName: string;
  districtId: string;
  districtName: string;
  eligible: true;
};

export type TeacherSupervisoryQueue = {
  actorRole: string;
  officeLabel: string;
  selection: {
    mode: TeacherSupervisorySelectionMode;
    requiresCircuitSelection: boolean;
    requiresSchoolSelection: true;
    assignedCircuitId: string | null;
    assignedCircuitName: string | null;
  };
  summary: {
    circuits: number;
    schools: number;
    teachers: number;
  };
  circuits: TeacherSupervisoryQueueCircuit[];
  items: TeacherSupervisoryQueueItem[];
  readOnlyDiscovery: true;
  legacyTeacherAppraisalIncluded: false;
  assessmentEvidenceIncluded: false;
  contactDetailsIncluded: false;
  noBackgroundPolling: true;
  providerCalled: false;
};

type ReadTeacherSupervisoryQueueInput = {
  actorUserId: string;
  actorRoleName: unknown;
  governanceScope: GovernanceScope;
  now?: Date;
  database?: TeacherSupervisoryQueueDatabase;
};

type ScopeAssignment = GovernanceScope["assignments"][number];

type TeacherMembershipRecord = {
  id: string;
  userId: string;
  tenantId: string;
  status: string;
  role: {
    name: string;
  };
  user: {
    id: string;
    name: string | null;
    firstName: string | null;
    lastName: string | null;
  };
  tenant: {
    id: string;
    name: string;
    status: string;
    zone: null | {
      id: string;
      name: string;
      isActive: boolean;
      parentZoneId: string | null;
      zoneType: {
        level: number;
      };
      parentZone: null | {
        id: string;
        name: string;
        isActive: boolean;
        zoneType: {
          level: number;
        };
      };
    };
  };
};

export type TeacherSupervisoryQueueDatabase = {
  membership: {
    findMany(args: unknown): Promise<TeacherMembershipRecord[]>;
  };
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function normalized(value: unknown) {
  return clean(value).toUpperCase().replace(/[\s-]+/g, "_");
}

function displayName(user: TeacherMembershipRecord["user"]) {
  return (
    clean(user.name) ||
    [clean(user.firstName), clean(user.lastName)].filter(Boolean).join(" ") ||
    null
  );
}

function officeLabel(role: string) {
  switch (role) {
    case "SISSO":
      return "SISSO";
    case "HEAD_OF_SUPERVISION":
      return "Head of Supervision";
    case "BASIC_SCHOOL_COORDINATOR":
      return "Basic School Coordinator";
    case "DISTRICT_DIRECTOR":
      return "District Director";
    default:
      return clean(role)
        .toLowerCase()
        .split("_")
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
  }
}

function canonicalAssignmentRole(assignment: ScopeAssignment) {
  return canonicalTeacherSupervisoryAssessorRole(assignment.role);
}

function circuitAssignments(
  actorRole: string,
  assignments: readonly ScopeAssignment[],
) {
  if (actorRole !== "SISSO") return [];

  const unique = new Map<string, ScopeAssignment>();

  for (const assignment of assignments) {
    if (
      canonicalAssignmentRole(assignment) !== "SISSO" ||
      assignment.zoneLevel !==
        TEACHER_SUPERVISORY_ASSESSMENT_POLICY.circuitZoneLevel
    ) {
      continue;
    }

    unique.set(assignment.zoneId, assignment);
  }

  return [...unique.values()].sort((left, right) =>
    left.zoneName.localeCompare(right.zoneName),
  );
}

function selectionContract(input: {
  actorRole: string;
  assignments: readonly ScopeAssignment[];
}) {
  const assignedCircuits = circuitAssignments(
    input.actorRole,
    input.assignments,
  );
  const assignedCircuit =
    assignedCircuits.length === 1 ? assignedCircuits[0] : null;
  const circuitScoped = input.actorRole === "SISSO";

  return {
    mode: circuitScoped
      ? ("ASSIGNED_CIRCUIT_TEACHERS" as const)
      : ("DISTRICT_CIRCUIT_SCHOOL_TEACHERS" as const),
    requiresCircuitSelection:
      !circuitScoped || assignedCircuits.length !== 1,
    requiresSchoolSelection: true as const,
    assignedCircuitId: assignedCircuit?.zoneId ?? null,
    assignedCircuitName: assignedCircuit?.zoneName ?? null,
  };
}

function authorityAssignments(
  actorUserId: string,
  assignments: readonly ScopeAssignment[],
): TeacherSupervisoryGovernanceAssignment[] {
  return assignments.map((assignment) => ({
    id: assignment.id,
    userId: actorUserId,
    role: assignment.role,
    zoneId: assignment.zoneId,
    zoneName: assignment.zoneName,
    zoneLevel: assignment.zoneLevel,
    parentZoneId: assignment.parentZoneId,
    parentZoneName: assignment.parentZoneName,
    status: "ACTIVE",
    isActive: true,
  }));
}

function targetFromMembership(
  membership: TeacherMembershipRecord,
): TeacherSupervisoryTarget | null {
  const zone = membership.tenant.zone;
  const district = zone?.parentZone;

  if (
    !clean(membership.id) ||
    !clean(membership.userId) ||
    membership.user.id !== membership.userId ||
    !clean(membership.tenantId) ||
    membership.tenant.id !== membership.tenantId ||
    normalized(membership.status) !== "ACTIVE" ||
    normalized(membership.role.name) !== "TEACHER" ||
    normalized(membership.tenant.status) !== "ACTIVE" ||
    !zone ||
    zone.isActive !== true ||
    zone.zoneType.level !==
      TEACHER_SUPERVISORY_ASSESSMENT_POLICY.circuitZoneLevel ||
    !district ||
    district.isActive !== true ||
    district.zoneType.level !==
      TEACHER_SUPERVISORY_ASSESSMENT_POLICY.districtZoneLevel
  ) {
    return null;
  }

  return {
    userId: membership.userId,
    roleName: membership.role.name,
    isActive: true,
    tenantId: membership.tenantId,
    tenantStatus: membership.tenant.status,
    circuitZoneId: zone.id,
    circuitName: zone.name,
    districtZoneId: district.id,
    districtName: district.name,
  };
}

function emptyQueue(input: {
  actorRole: string;
  selection: ReturnType<typeof selectionContract>;
}): TeacherSupervisoryQueue {
  return {
    actorRole: input.actorRole,
    officeLabel: officeLabel(input.actorRole),
    selection: input.selection,
    summary: {
      circuits: 0,
      schools: 0,
      teachers: 0,
    },
    circuits: [],
    items: [],
    readOnlyDiscovery: true,
    legacyTeacherAppraisalIncluded: false,
    assessmentEvidenceIncluded: false,
    contactDetailsIncluded: false,
    noBackgroundPolling: true,
    providerCalled: false,
  };
}

function buildCircuits(
  items: readonly TeacherSupervisoryQueueItem[],
): TeacherSupervisoryQueueCircuit[] {
  const circuits = new Map<
    string,
    {
      circuitId: string;
      circuitName: string;
      districtId: string;
      districtName: string;
      schoolIds: Set<string>;
      teacherCount: number;
    }
  >();

  for (const item of items) {
    const current = circuits.get(item.circuitId) ?? {
      circuitId: item.circuitId,
      circuitName: item.circuitName,
      districtId: item.districtId,
      districtName: item.districtName,
      schoolIds: new Set<string>(),
      teacherCount: 0,
    };

    current.schoolIds.add(item.schoolId);
    current.teacherCount += 1;
    circuits.set(item.circuitId, current);
  }

  return [...circuits.values()]
    .map((circuit) => ({
      circuitId: circuit.circuitId,
      circuitName: circuit.circuitName,
      districtId: circuit.districtId,
      districtName: circuit.districtName,
      schoolCount: circuit.schoolIds.size,
      teacherCount: circuit.teacherCount,
    }))
    .sort((left, right) =>
      left.circuitName.localeCompare(right.circuitName),
    );
}

export async function readTeacherSupervisoryAssessmentQueue(
  input: ReadTeacherSupervisoryQueueInput,
): Promise<TeacherSupervisoryQueue> {
  const actorUserId = clean(input.actorUserId);
  const actorRole = canonicalTeacherSupervisoryAssessorRole(
    input.actorRoleName,
  );
  const selection = selectionContract({
    actorRole,
    assignments: input.governanceScope.assignments,
  });
  const empty = () => emptyQueue({ actorRole, selection });

  if (!actorUserId) return empty();

  const tenantIds = [
    ...new Set(input.governanceScope.tenantIds.map(clean)),
  ].filter(Boolean);
  if (!tenantIds.length) return empty();

  const now = input.now ? new Date(input.now.getTime()) : new Date();
  if (Number.isNaN(now.getTime())) return empty();

  const database =
    input.database ??
    (prisma as unknown as TeacherSupervisoryQueueDatabase);

  const memberships = await database.membership.findMany({
    where: {
      tenantId: { in: tenantIds },
      status: "ACTIVE",
      role: {
        name: {
          equals: "TEACHER",
          mode: "insensitive",
        },
      },
      tenant: {
        status: "ACTIVE",
      },
    },
    select: {
      id: true,
      userId: true,
      tenantId: true,
      status: true,
      role: {
        select: {
          name: true,
        },
      },
      user: {
        select: {
          id: true,
          name: true,
          firstName: true,
          lastName: true,
        },
      },
      tenant: {
        select: {
          id: true,
          name: true,
          status: true,
          zone: {
            select: {
              id: true,
              name: true,
              isActive: true,
              parentZoneId: true,
              zoneType: {
                select: {
                  level: true,
                },
              },
              parentZone: {
                select: {
                  id: true,
                  name: true,
                  isActive: true,
                  zoneType: {
                    select: {
                      level: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  const tenantIdSet = new Set(tenantIds);
  const scopedZoneIds = new Set(
    input.governanceScope.zoneIds.map(clean).filter(Boolean),
  );
  const assignments = authorityAssignments(
    actorUserId,
    input.governanceScope.assignments,
  );

  const candidates = memberships
    .map((membership) => ({
      membership,
      target: targetFromMembership(membership),
    }))
    .filter(
      (
        candidate,
      ): candidate is {
        membership: TeacherMembershipRecord;
        target: TeacherSupervisoryTarget;
      } => candidate.target !== null,
    )
    .sort((left, right) => {
      const leftKey = `${left.membership.tenantId}|${left.membership.userId}|${left.membership.id}`;
      const rightKey = `${right.membership.tenantId}|${right.membership.userId}|${right.membership.id}`;
      return leftKey.localeCompare(rightKey);
    });

  const seen = new Set<string>();
  const items: TeacherSupervisoryQueueItem[] = [];

  for (const candidate of candidates) {
    const { membership, target } = candidate;
    const circuitId = clean(target.circuitZoneId);
    const districtId = clean(target.districtZoneId);

    if (!tenantIdSet.has(membership.tenantId)) continue;
    if (
      !input.governanceScope.isSuperAdmin &&
      !scopedZoneIds.has(circuitId) &&
      !scopedZoneIds.has(districtId)
    ) {
      continue;
    }

    const authority = decideTeacherSupervisoryAssessmentAuthority({
      actorUserId,
      actorRoleName: actorRole,
      target,
      assignments,
      now,
    });

    if (!authority.allowed) continue;

    if (
      actorRole === "SISSO" &&
      selection.assignedCircuitId &&
      circuitId !== selection.assignedCircuitId
    ) {
      continue;
    }

    const dedupeKey = `${membership.tenantId}:${membership.userId}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    items.push({
      targetUserId: membership.userId,
      targetName: displayName(membership.user),
      schoolId: membership.tenant.id,
      schoolName: membership.tenant.name,
      circuitId,
      circuitName: clean(target.circuitName),
      districtId,
      districtName: clean(target.districtName),
      eligible: true,
    });
  }

  items.sort((left, right) => {
    const districtDifference = left.districtName.localeCompare(
      right.districtName,
    );
    if (districtDifference !== 0) return districtDifference;

    const circuitDifference = left.circuitName.localeCompare(
      right.circuitName,
    );
    if (circuitDifference !== 0) return circuitDifference;

    const schoolDifference = left.schoolName.localeCompare(right.schoolName);
    if (schoolDifference !== 0) return schoolDifference;

    const teacherDifference = (left.targetName ?? "").localeCompare(
      right.targetName ?? "",
    );
    if (teacherDifference !== 0) return teacherDifference;

    return left.targetUserId.localeCompare(right.targetUserId);
  });

  return {
    actorRole,
    officeLabel: officeLabel(actorRole),
    selection,
    summary: {
      circuits: new Set(items.map((item) => item.circuitId)).size,
      schools: new Set(items.map((item) => item.schoolId)).size,
      teachers: items.length,
    },
    circuits: buildCircuits(items),
    items,
    readOnlyDiscovery: true,
    legacyTeacherAppraisalIncluded: false,
    assessmentEvidenceIncluded: false,
    contactDetailsIncluded: false,
    noBackgroundPolling: true,
    providerCalled: false,
  };
}
