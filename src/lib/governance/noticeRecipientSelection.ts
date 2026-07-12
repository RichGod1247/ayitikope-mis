//src/lib/governance/noticeRecipientSelection.ts
import "server-only";

import {
  GovernanceAssignmentStatus,
  GovernanceOfficialNoticeRecipientType,
  Prisma,
  SchoolSector,
  TenantStatus,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { GovernanceScope } from "@/lib/governance/scope";

const MAX_SEARCH_RESULTS = 25;
const MAX_SELECTED_RECIPIENTS = 50;

type CommandLevel = "DISTRICT" | "CIRCUIT" | "NONE";
type SectorTarget = "PUBLIC" | "PRIVATE" | "ALL_AUTHORIZED";

type SearchInput = {
  q?: unknown;
  role?: unknown;
  tenantId?: unknown;
  sectorTarget?: unknown;
  take?: unknown;
};

type PreviewInput = {
  selectionIds?: unknown;
  sectorTarget?: unknown;
};

export type ResolvedGovernanceSelectedRecipient = {
  selectionId: string;
  recipientUserId: string;
  tenantId: string | null;
  recipientType: GovernanceOfficialNoticeRecipientType;
  displayName: string;
  roleLabel: string;
  phone: string | null;
  email: string | null;
  metadata: Prisma.InputJsonValue;
};

export class GovernanceNoticeRecipientSelectionError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function upper(value: unknown) {
  return clean(value).toUpperCase();
}

function normRole(value: unknown) {
  return upper(value).replace(/[^A-Z0-9]/g, "");
}

function intOrNull(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.trunc(number);
}

function displayName(user: {
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}) {
  const preferred = clean(user.name);
  if (preferred) return preferred;

  const combined = `${clean(user.firstName)} ${clean(user.lastName)}`.trim();
  if (combined) return combined;

  return clean(user.email) || "Recipient";
}

function jsonObject(value: Record<string, unknown>): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function commandLevel(scope: GovernanceScope): CommandLevel {
  if (scope.isSuperAdmin) return "DISTRICT";

  const hasDistrict = scope.assignments.some((assignment) => {
    const role = normRole(assignment.role);
    const level = Number(assignment.zoneLevel ?? 0);
    return role === "DISTRICTDIRECTOR" || level >= 2;
  });

  if (hasDistrict) return "DISTRICT";

  const hasCircuit = scope.assignments.some((assignment) => {
    const role = normRole(assignment.role);
    const level = Number(assignment.zoneLevel ?? 0);

    return (
      role === "SISSO" ||
      role === "CIRCUITSUPERVISOR" ||
      level === 1
    );
  });

  return hasCircuit ? "CIRCUIT" : "NONE";
}

function normalizeSectorTarget(value: unknown): SectorTarget {
  const normalized = upper(value);

  if (normalized === "PRIVATE") return "PRIVATE";
  if (
    normalized === "ALL" ||
    normalized === "ALL_AUTHORIZED" ||
    normalized === "AUTHORIZED"
  ) {
    return "ALL_AUTHORIZED";
  }

  return "PUBLIC";
}

function sectorAllowed(
  schoolSector: SchoolSector,
  sectorTarget: SectorTarget,
) {
  if (sectorTarget === "ALL_AUTHORIZED") return true;
  if (sectorTarget === "PRIVATE") {
    return schoolSector === SchoolSector.PRIVATE;
  }

  return schoolSector === SchoolSector.PUBLIC;
}

function normalizeRequestedRole(value: unknown) {
  const role = normRole(value);

  if (!role || role === "ALL") return null;

  if (role === "HEADMASTER" || role === "HEADTEACHERS") {
    return "HEADTEACHER";
  }

  if (role === "TEACHERS") return "TEACHER";
  if (role === "SISSOS") return "SISSO";
  if (role === "CIRCUIT_SUPERVISOR") return "CIRCUITSUPERVISOR";

  if (
    role === "HEADTEACHER" ||
    role === "TEACHER" ||
    role === "SISSO" ||
    role === "CIRCUITSUPERVISOR"
  ) {
    return role;
  }

  throw new GovernanceNoticeRecipientSelectionError(
    400,
    "UNSUPPORTED_RECIPIENT_ROLE_FILTER",
  );
}

function normalizedSchoolRole(value: unknown) {
  const role = normRole(value);

  if (role === "HEADMASTER") return "HEADTEACHER";
  if (role === "HEADTEACHER") return "HEADTEACHER";
  if (role === "TEACHER") return "TEACHER";

  return null;
}

function normalizedGovernanceRole(value: unknown) {
  const role = normRole(value);

  if (role === "SISSO") return "SISSO";
  if (role === "CIRCUITSUPERVISOR") return "CIRCUITSUPERVISOR";

  return null;
}

function roleAllowedForCommand(
  level: CommandLevel,
  normalizedRole: string | null,
) {
  if (!normalizedRole || level === "NONE") return false;

  if (level === "DISTRICT") {
    return (
      normalizedRole === "SISSO" ||
      normalizedRole === "CIRCUITSUPERVISOR" ||
      normalizedRole === "HEADTEACHER" ||
      normalizedRole === "TEACHER"
    );
  }

  return (
    normalizedRole === "HEADTEACHER" ||
    normalizedRole === "TEACHER"
  );
}

function recipientTypeForSchoolRole(role: string) {
  return role === "TEACHER"
    ? GovernanceOfficialNoticeRecipientType.TEACHER
    : GovernanceOfficialNoticeRecipientType.HEADTEACHER;
}

function normalizeSelectionIds(value: unknown) {
  if (!Array.isArray(value)) {
    throw new GovernanceNoticeRecipientSelectionError(
      400,
      "RECIPIENT_SELECTION_IDS_REQUIRED",
    );
  }

  const ids = value.map(clean).filter(Boolean);

  if (!ids.length) {
    throw new GovernanceNoticeRecipientSelectionError(
      400,
      "RECIPIENT_SELECTION_IDS_REQUIRED",
    );
  }

  if (ids.length > MAX_SELECTED_RECIPIENTS) {
    throw new GovernanceNoticeRecipientSelectionError(
      400,
      "RECIPIENT_SELECTION_LIMIT_EXCEEDED",
    );
  }

  if (new Set(ids).size !== ids.length) {
    throw new GovernanceNoticeRecipientSelectionError(
      409,
      "DUPLICATE_RECIPIENT_SELECTION",
    );
  }

  for (const id of ids) {
    if (!/^(membership|assignment):[A-Za-z0-9_-]+$/.test(id)) {
      throw new GovernanceNoticeRecipientSelectionError(
        400,
        "INVALID_RECIPIENT_SELECTION_ID",
      );
    }
  }

  return ids;
}

function safeRecipientView(recipient: ResolvedGovernanceSelectedRecipient) {
  const metadata =
    recipient.metadata &&
    typeof recipient.metadata === "object" &&
    !Array.isArray(recipient.metadata)
      ? (recipient.metadata as Record<string, unknown>)
      : {};

  return {
    selectionId: recipient.selectionId,
    userId: recipient.recipientUserId,
    displayName: recipient.displayName,
    roleLabel: recipient.roleLabel,
    recipientType: recipient.recipientType,
    tenantId: recipient.tenantId,
    school:
      metadata.schoolId && metadata.schoolName
        ? {
            id: metadata.schoolId,
            name: metadata.schoolName,
            schoolCode: metadata.schoolCode ?? null,
            schoolSector: metadata.schoolSector ?? null,
          }
        : null,
    zone:
      metadata.zoneId && metadata.zoneName
        ? {
            id: metadata.zoneId,
            name: metadata.zoneName,
            zoneTypeName: metadata.zoneTypeName ?? null,
          }
        : null,
    staffId: metadata.staffId ?? null,
    delivery: {
      inApp: true,
      sms: Boolean(recipient.phone),
      email: Boolean(recipient.email),
    },
  };
}

function phoneForMembership(row: {
  tenantId: string;
  user: {
    phone: string | null;
    teacherProfiles: Array<{
      tenantId: string;
      phone: string;
    }>;
  };
}) {
  const tenantProfile = row.user.teacherProfiles.find(
    (profile) => profile.tenantId === row.tenantId,
  );

  return clean(tenantProfile?.phone) || clean(row.user.phone) || null;
}

function membershipToResolved(row: any): ResolvedGovernanceSelectedRecipient | null {
  const role = normalizedSchoolRole(row.role.name);
  if (!role) return null;

  return {
    selectionId: `membership:${row.id}`,
    recipientUserId: row.user.id,
    tenantId: row.tenantId,
    recipientType: recipientTypeForSchoolRole(role),
    displayName: displayName(row.user),
    roleLabel: role === "HEADTEACHER" ? "Headteacher" : "Teacher",
    phone: phoneForMembership(row),
    email: clean(row.user.email) || null,
    metadata: jsonObject({
      source: "membership-selection",
      membershipId: row.id,
      staffId: row.staffId,
      roleName: row.role.name,
      schoolId: row.tenant.id,
      schoolName: row.tenant.name,
      schoolCode: row.tenant.schoolCode,
      schoolSector: row.tenant.schoolSector,
      zoneId: row.tenant.zoneId,
    }),
  };
}

function assignmentToResolved(row: any): ResolvedGovernanceSelectedRecipient | null {
  const role = normalizedGovernanceRole(row.role);
  if (!role) return null;

  return {
    selectionId: `assignment:${row.id}`,
    recipientUserId: row.user.id,
    tenantId: null,
    recipientType:
      GovernanceOfficialNoticeRecipientType.GOVERNANCE_OFFICER,
    displayName: displayName(row.user),
    roleLabel:
      clean(row.title) ||
      (role === "SISSO" ? "SISSO" : "Circuit Supervisor"),
    phone: clean(row.phone) || clean(row.user.phone) || null,
    email: clean(row.user.email) || null,
    metadata: jsonObject({
      source: "governance-assignment-selection",
      assignmentId: row.id,
      governanceRole: String(row.role),
      zoneId: row.zone.id,
      zoneName: row.zone.name,
      zoneTypeName: row.zone.zoneType.name,
      zoneLevel: row.zone.zoneType.level,
    }),
  };
}

function assertTenantFilterInScope(
  scope: GovernanceScope,
  tenantId: string,
) {
  if (!tenantId || scope.isSuperAdmin) return;

  if (!scope.tenantIds.includes(tenantId)) {
    throw new GovernanceNoticeRecipientSelectionError(
      403,
      "RECIPIENT_SEARCH_SCHOOL_OUT_OF_SCOPE",
    );
  }
}

export async function searchGovernanceNoticeRecipients(args: {
  scope: GovernanceScope;
  input: SearchInput;
}) {
  const level = commandLevel(args.scope);

  if (level === "NONE") {
    throw new GovernanceNoticeRecipientSelectionError(
      403,
      "RECIPIENT_SEARCH_FORBIDDEN",
    );
  }

  const query = clean(args.input.q);

  if (query.length < 2) {
    throw new GovernanceNoticeRecipientSelectionError(
      400,
      "RECIPIENT_SEARCH_QUERY_TOO_SHORT",
    );
  }

  const requestedRole = normalizeRequestedRole(args.input.role);

  if (requestedRole && !roleAllowedForCommand(level, requestedRole)) {
    throw new GovernanceNoticeRecipientSelectionError(
      403,
      "RECIPIENT_ROLE_FILTER_FORBIDDEN",
    );
  }

  const tenantId = clean(args.input.tenantId);
  assertTenantFilterInScope(args.scope, tenantId);

  const sectorTarget = normalizeSectorTarget(args.input.sectorTarget);
  const requestedTake = intOrNull(args.input.take);
  const take = Math.max(1, Math.min(requestedTake ?? 20, MAX_SEARCH_RESULTS));

  const normalizedStaffSearch = upper(query).replace(/[^A-Z0-9]/g, "");
  const schoolRoleRequested =
    !requestedRole ||
    requestedRole === "HEADTEACHER" ||
    requestedRole === "TEACHER";

  const governanceRoleRequested =
    level === "DISTRICT" &&
    (!requestedRole ||
      requestedRole === "SISSO" ||
      requestedRole === "CIRCUITSUPERVISOR");

  const membershipRows = schoolRoleRequested
    ? await prisma.membership.findMany({
        where: {
          status: "ACTIVE",
          ...(tenantId
            ? { tenantId }
            : args.scope.isSuperAdmin
              ? {}
              : {
                  tenantId: {
                    in: args.scope.tenantIds.length
                      ? args.scope.tenantIds
                      : ["__none__"],
                  },
                }),
          tenant: {
            is: {
              status: TenantStatus.ACTIVE,
              ...(sectorTarget === "PUBLIC"
                ? { schoolSector: SchoolSector.PUBLIC }
                : sectorTarget === "PRIVATE"
                  ? { schoolSector: SchoolSector.PRIVATE }
                  : {}),
            },
          },
          OR: [
            { staffId: { contains: query, mode: "insensitive" } },
            ...(normalizedStaffSearch
              ? [
                  {
                    staffIdNorm: {
                      contains: normalizedStaffSearch,
                      mode: "insensitive" as const,
                    },
                  },
                ]
              : []),
            {
              user: {
                is: {
                  OR: [
                    { name: { contains: query, mode: "insensitive" } },
                    { firstName: { contains: query, mode: "insensitive" } },
                    { lastName: { contains: query, mode: "insensitive" } },
                    { email: { contains: query, mode: "insensitive" } },
                  ],
                },
              },
            },
            {
              tenant: {
                is: {
                  OR: [
                    { name: { contains: query, mode: "insensitive" } },
                    { schoolCode: { contains: query, mode: "insensitive" } },
                  ],
                },
              },
            },
          ],
        },
        select: {
          id: true,
          tenantId: true,
          staffId: true,
          role: { select: { name: true } },
          tenant: {
            select: {
              id: true,
              name: true,
              schoolCode: true,
              schoolSector: true,
              zoneId: true,
            },
          },
          user: {
            select: {
              id: true,
              name: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
              teacherProfiles: {
                select: { tenantId: true, phone: true },
              },
            },
          },
        },
        orderBy: { createdAt: "asc" },
        take: Math.min(take * 4, 100),
      })
    : [];

  const now = new Date();

  const assignmentRows = governanceRoleRequested
    ? await prisma.governanceOfficerAssignment.findMany({
        where: {
          status: GovernanceAssignmentStatus.ACTIVE,
          revokedAt: null,
          ...(args.scope.isSuperAdmin
            ? {}
            : {
                zoneId: {
                  in: args.scope.zoneIds.length
                    ? args.scope.zoneIds
                    : ["__none__"],
                },
              }),
          AND: [
            { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
            { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
            {
              OR: [
                { title: { contains: query, mode: "insensitive" } },
                {
                  user: {
                    is: {
                      OR: [
                        { name: { contains: query, mode: "insensitive" } },
                        { firstName: { contains: query, mode: "insensitive" } },
                        { lastName: { contains: query, mode: "insensitive" } },
                        { email: { contains: query, mode: "insensitive" } },
                      ],
                    },
                  },
                },
                {
                  zone: {
                    is: {
                      OR: [
                        { name: { contains: query, mode: "insensitive" } },
                        { code: { contains: query, mode: "insensitive" } },
                      ],
                    },
                  },
                },
              ],
            },
          ],
        },
        select: {
          id: true,
          phone: true,
          title: true,
          role: true,
          zone: {
            select: {
              id: true,
              name: true,
              zoneType: { select: { name: true, level: true } },
            },
          },
          user: {
            select: {
              id: true,
              name: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
            },
          },
        },
        orderBy: { createdAt: "asc" },
        take: Math.min(take * 3, 75),
      })
    : [];

  const resolved: ResolvedGovernanceSelectedRecipient[] = [];

  for (const row of membershipRows) {
    const recipient = membershipToResolved(row);
    const role = normalizedSchoolRole(row.role.name);

    if (
      recipient &&
      roleAllowedForCommand(level, role) &&
      (!requestedRole || requestedRole === role) &&
      sectorAllowed(row.tenant.schoolSector, sectorTarget)
    ) {
      resolved.push(recipient);
    }
  }

  for (const row of assignmentRows) {
    const recipient = assignmentToResolved(row);
    const role = normalizedGovernanceRole(row.role);

    if (
      recipient &&
      roleAllowedForCommand(level, role) &&
      (!requestedRole || requestedRole === role)
    ) {
      resolved.push(recipient);
    }
  }

  const deduped = new Map<string, ResolvedGovernanceSelectedRecipient>();

  for (const recipient of resolved) {
    if (!deduped.has(recipient.recipientUserId)) {
      deduped.set(recipient.recipientUserId, recipient);
    }
  }

  const items = Array.from(deduped.values())
    .sort((a, b) =>
      a.displayName.localeCompare(b.displayName, undefined, {
        sensitivity: "base",
      }),
    )
    .slice(0, take)
    .map(safeRecipientView);

  return {
    query,
    role: requestedRole,
    sectorTarget,
    items,
    count: items.length,
    limit: take,
    minimumQueryLength: 2,
  };
}

export async function resolveGovernanceSelectedRecipients(args: {
  scope: GovernanceScope;
  selectionIds: unknown;
  sectorTarget?: unknown;
}): Promise<ResolvedGovernanceSelectedRecipient[]> {
  const level = commandLevel(args.scope);

  if (level === "NONE") {
    throw new GovernanceNoticeRecipientSelectionError(
      403,
      "RECIPIENT_PREVIEW_FORBIDDEN",
    );
  }

  const selectionIds = normalizeSelectionIds(args.selectionIds);
  const sectorTarget = normalizeSectorTarget(args.sectorTarget);

  const membershipIds = selectionIds
    .filter((id) => id.startsWith("membership:"))
    .map((id) => id.slice("membership:".length));

  const assignmentIds = selectionIds
    .filter((id) => id.startsWith("assignment:"))
    .map((id) => id.slice("assignment:".length));

  const membershipRows = membershipIds.length
    ? await prisma.membership.findMany({
        where: {
          id: { in: membershipIds },
          status: "ACTIVE",
          ...(args.scope.isSuperAdmin
            ? {}
            : {
                tenantId: {
                  in: args.scope.tenantIds.length
                    ? args.scope.tenantIds
                    : ["__none__"],
                },
              }),
          tenant: {
            is: {
              status: TenantStatus.ACTIVE,
              ...(sectorTarget === "PUBLIC"
                ? { schoolSector: SchoolSector.PUBLIC }
                : sectorTarget === "PRIVATE"
                  ? { schoolSector: SchoolSector.PRIVATE }
                  : {}),
            },
          },
        },
        select: {
          id: true,
          tenantId: true,
          staffId: true,
          role: { select: { name: true } },
          tenant: {
            select: {
              id: true,
              name: true,
              schoolCode: true,
              schoolSector: true,
              zoneId: true,
            },
          },
          user: {
            select: {
              id: true,
              name: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
              teacherProfiles: {
                select: { tenantId: true, phone: true },
              },
            },
          },
        },
      })
    : [];

  const now = new Date();

  const assignmentRows = assignmentIds.length
    ? await prisma.governanceOfficerAssignment.findMany({
        where: {
          id: { in: assignmentIds },
          status: GovernanceAssignmentStatus.ACTIVE,
          revokedAt: null,
          ...(args.scope.isSuperAdmin
            ? {}
            : {
                zoneId: {
                  in: args.scope.zoneIds.length
                    ? args.scope.zoneIds
                    : ["__none__"],
                },
              }),
          AND: [
            { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
            { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
          ],
        },
        select: {
          id: true,
          phone: true,
          title: true,
          role: true,
          zone: {
            select: {
              id: true,
              name: true,
              zoneType: { select: { name: true, level: true } },
            },
          },
          user: {
            select: {
              id: true,
              name: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
            },
          },
        },
      })
    : [];

  const bySelectionId = new Map<string, ResolvedGovernanceSelectedRecipient>();

  for (const row of membershipRows) {
    const role = normalizedSchoolRole(row.role.name);
    const recipient = membershipToResolved(row);

    if (
      recipient &&
      roleAllowedForCommand(level, role) &&
      sectorAllowed(row.tenant.schoolSector, sectorTarget)
    ) {
      bySelectionId.set(recipient.selectionId, recipient);
    }
  }

  for (const row of assignmentRows) {
    const role = normalizedGovernanceRole(row.role);
    const recipient = assignmentToResolved(row);

    if (recipient && roleAllowedForCommand(level, role)) {
      bySelectionId.set(recipient.selectionId, recipient);
    }
  }

  const ordered = selectionIds.map((selectionId) =>
    bySelectionId.get(selectionId),
  );

  if (ordered.some((recipient) => !recipient)) {
    throw new GovernanceNoticeRecipientSelectionError(
      403,
      "SELECTED_RECIPIENT_OUT_OF_SCOPE_OR_INACTIVE",
    );
  }

  const recipients = ordered as ResolvedGovernanceSelectedRecipient[];
  const userIds = recipients.map((recipient) => recipient.recipientUserId);

  if (new Set(userIds).size !== userIds.length) {
    throw new GovernanceNoticeRecipientSelectionError(
      409,
      "DUPLICATE_SELECTED_RECIPIENT_USER",
    );
  }

  return recipients;
}

export async function previewGovernanceNoticeRecipients(args: {
  scope: GovernanceScope;
  input: PreviewInput;
}) {
  const sectorTarget = normalizeSectorTarget(args.input.sectorTarget);

  const recipients = await resolveGovernanceSelectedRecipients({
    scope: args.scope,
    selectionIds: args.input.selectionIds,
    sectorTarget,
  });

  const items = recipients.map(safeRecipientView);

  return {
    sectorTarget,
    items,
    count: items.length,
    deliverySummary: {
      inApp: items.length,
      sms: items.filter((item) => item.delivery.sms).length,
      email: items.filter((item) => item.delivery.email).length,
      missingSms: items.filter((item) => !item.delivery.sms).length,
      missingEmail: items.filter((item) => !item.delivery.email).length,
    },
    limits: {
      maxSelectedRecipients: MAX_SELECTED_RECIPIENTS,
    },
  };
}
