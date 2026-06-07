// src/app/api/admin/governance/officers/lifecycle/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import { getIpFromHeaders, getUserAgentFromHeaders } from "@/lib/rateLimit";

type LifecycleAction =
  | "REVOKE_INVITE"
  | "SUSPEND_ASSIGNMENT"
  | "REVOKE_ASSIGNMENT"
  | "REACTIVATE_ASSIGNMENT";

type Body = {
  action?: string;
  inviteId?: string;
  assignmentId?: string;
  reason?: string;
};

class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

const ACTIONS = new Set<LifecycleAction>([
  "REVOKE_INVITE",
  "SUSPEND_ASSIGNMENT",
  "REVOKE_ASSIGNMENT",
  "REACTIVATE_ASSIGNMENT",
]);

function json(status: number, payload: any) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeAction(value: unknown): LifecycleAction | null {
  const action = clean(value).toUpperCase() as LifecycleAction;
  return ACTIONS.has(action) ? action : null;
}

function requireReason(value: unknown) {
  const reason = clean(value);

  if (reason.length < 10) {
    throw new ApiError(400, "REASON_TOO_SHORT");
  }

  if (reason.length > 1000) {
    throw new ApiError(400, "REASON_TOO_LONG");
  }

  return reason;
}

function objectFromJson(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function safeJson(value: unknown): any {
  return JSON.parse(JSON.stringify(value));
}

async function revokeInvite(args: {
  inviteId: string;
  reason: string;
  actorUserId: string;
  ip: string | null;
  userAgent: string | null;
}) {
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const invite = await tx.governanceOfficerInvite.findUnique({
      where: { id: args.inviteId },
      select: {
        id: true,
        email: true,
        emailNorm: true,
        role: true,
        status: true,
        zoneId: true,
        acceptedAt: true,
        revokedAt: true,
        expiresAt: true,
        metadata: true,
        zone: {
          select: {
            name: true,
            zoneType: { select: { name: true, level: true } },
          },
        },
      },
    });

    if (!invite) {
      throw new ApiError(404, "GOVERNANCE_INVITE_NOT_FOUND");
    }

    if (invite.acceptedAt || invite.status === "ACCEPTED") {
      throw new ApiError(409, "ACCEPTED_INVITE_CANNOT_BE_REVOKED_HERE");
    }

    if (invite.revokedAt || invite.status === "REVOKED") {
      return {
        id: invite.id,
        email: invite.email,
        role: invite.role,
        status: invite.status,
        revokedAt: invite.revokedAt,
        alreadyRevoked: true,
      };
    }

    const wasExpiredByTime = invite.expiresAt.getTime() < now.getTime();
    const previousStatus = invite.status;

    const updated = await tx.governanceOfficerInvite.update({
      where: { id: invite.id },
      data: {
        status: "REVOKED",
        revokedAt: now,
        revokedByUserId: args.actorUserId,
        metadata: safeJson({
          ...objectFromJson(invite.metadata),
          lifecycle: {
            lastAction: "REVOKE_INVITE",
            previousStatus,
            nextStatus: "REVOKED",
            wasExpiredByTime,
            expiresAt: invite.expiresAt.toISOString(),
            reason: args.reason,
            actorUserId: args.actorUserId,
            actedAt: now.toISOString(),
          },
        }),
      },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        revokedAt: true,
      },
    });

    await tx.auditLog.create({
      data: {
        action: "GOVERNANCE_OFFICER_INVITE_REVOKED",
        userId: args.actorUserId,
        resource: "GovernanceOfficerInvite",
        resourceId: invite.id,
        ip: args.ip ?? undefined,
        userAgent: args.userAgent ?? undefined,
        metadata: safeJson({
          inviteId: invite.id,
          email: invite.email,
          emailNorm: invite.emailNorm,
          role: invite.role,
          zoneId: invite.zoneId,
          zoneName: invite.zone.name,
          zoneType: invite.zone.zoneType.name,
          zoneLevel: invite.zone.zoneType.level,
          reason: args.reason,
          previousStatus,
          nextStatus: "REVOKED",
          wasExpiredByTime,
          expiresAt: invite.expiresAt.toISOString(),
        }),
      },
    });

    return updated;
  });
}

async function suspendAssignment(args: {
  assignmentId: string;
  reason: string;
  actorUserId: string;
  ip: string | null;
  userAgent: string | null;
}) {
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const assignment = await tx.governanceOfficerAssignment.findUnique({
      where: { id: args.assignmentId },
      select: {
        id: true,
        userId: true,
        zoneId: true,
        role: true,
        status: true,
        revokedAt: true,
        metadata: true,
        user: { select: { id: true, email: true, name: true } },
        zone: {
          select: {
            id: true,
            name: true,
            zoneType: { select: { name: true, level: true } },
          },
        },
      },
    });

    if (!assignment) {
      throw new ApiError(404, "GOVERNANCE_ASSIGNMENT_NOT_FOUND");
    }

    if (assignment.status !== "ACTIVE" || assignment.revokedAt) {
      throw new ApiError(409, "ONLY_ACTIVE_ASSIGNMENT_CAN_BE_SUSPENDED");
    }

    const updated = await tx.governanceOfficerAssignment.update({
      where: { id: assignment.id },
      data: {
        status: "SUSPENDED",
        revokeReason: args.reason,
        metadata: safeJson({
          ...objectFromJson(assignment.metadata),
          lifecycle: {
            lastAction: "SUSPEND_ASSIGNMENT",
            previousStatus: assignment.status,
            nextStatus: "SUSPENDED",
            reason: args.reason,
            actorUserId: args.actorUserId,
            actedAt: now.toISOString(),
          },
        }),
      },
      select: {
        id: true,
        role: true,
        status: true,
        revokedAt: true,
        revokeReason: true,
        updatedAt: true,
      },
    });

    await tx.auditLog.create({
      data: {
        action: "GOVERNANCE_OFFICER_ASSIGNMENT_SUSPENDED",
        userId: args.actorUserId,
        resource: "GovernanceOfficerAssignment",
        resourceId: assignment.id,
        ip: args.ip ?? undefined,
        userAgent: args.userAgent ?? undefined,
        metadata: safeJson({
          assignmentId: assignment.id,
          targetUserId: assignment.userId,
          targetUserEmail: assignment.user.email,
          targetUserName: assignment.user.name,
          role: assignment.role,
          zoneId: assignment.zoneId,
          zoneName: assignment.zone.name,
          zoneType: assignment.zone.zoneType.name,
          zoneLevel: assignment.zone.zoneType.level,
          previousStatus: assignment.status,
          nextStatus: "SUSPENDED",
          reason: args.reason,
        }),
      },
    });

    return updated;
  });
}

async function revokeAssignment(args: {
  assignmentId: string;
  reason: string;
  actorUserId: string;
  ip: string | null;
  userAgent: string | null;
}) {
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const assignment = await tx.governanceOfficerAssignment.findUnique({
      where: { id: args.assignmentId },
      select: {
        id: true,
        userId: true,
        zoneId: true,
        role: true,
        status: true,
        endsAt: true,
        revokedAt: true,
        metadata: true,
        user: { select: { id: true, email: true, name: true } },
        zone: {
          select: {
            id: true,
            name: true,
            zoneType: { select: { name: true, level: true } },
          },
        },
      },
    });

    if (!assignment) {
      throw new ApiError(404, "GOVERNANCE_ASSIGNMENT_NOT_FOUND");
    }

    if (assignment.status === "REVOKED" || assignment.revokedAt) {
      throw new ApiError(409, "ASSIGNMENT_ALREADY_REVOKED");
    }

    const updated = await tx.governanceOfficerAssignment.update({
      where: { id: assignment.id },
      data: {
        status: "REVOKED",
        revokedAt: now,
        revokedByUserId: args.actorUserId,
        endsAt: now,
        revokeReason: args.reason,
        metadata: safeJson({
          ...objectFromJson(assignment.metadata),
          lifecycle: {
            lastAction: "REVOKE_ASSIGNMENT",
            previousStatus: assignment.status,
            nextStatus: "REVOKED",
            reason: args.reason,
            actorUserId: args.actorUserId,
            actedAt: now.toISOString(),
          },
        }),
      },
      select: {
        id: true,
        role: true,
        status: true,
        revokedAt: true,
        revokeReason: true,
        updatedAt: true,
      },
    });

    await tx.auditLog.create({
      data: {
        action: "GOVERNANCE_OFFICER_ASSIGNMENT_REVOKED",
        userId: args.actorUserId,
        resource: "GovernanceOfficerAssignment",
        resourceId: assignment.id,
        ip: args.ip ?? undefined,
        userAgent: args.userAgent ?? undefined,
        metadata: safeJson({
          assignmentId: assignment.id,
          targetUserId: assignment.userId,
          targetUserEmail: assignment.user.email,
          targetUserName: assignment.user.name,
          role: assignment.role,
          zoneId: assignment.zoneId,
          zoneName: assignment.zone.name,
          zoneType: assignment.zone.zoneType.name,
          zoneLevel: assignment.zone.zoneType.level,
          previousStatus: assignment.status,
          nextStatus: "REVOKED",
          reason: args.reason,
        }),
      },
    });

    return updated;
  });
}

async function reactivateAssignment(args: {
  assignmentId: string;
  reason: string;
  actorUserId: string;
  ip: string | null;
  userAgent: string | null;
}) {
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const assignment = await tx.governanceOfficerAssignment.findUnique({
      where: { id: args.assignmentId },
      select: {
        id: true,
        userId: true,
        zoneId: true,
        role: true,
        status: true,
        startsAt: true,
        endsAt: true,
        revokedAt: true,
        metadata: true,
        user: { select: { id: true, email: true, name: true } },
        zone: {
          select: {
            id: true,
            name: true,
            zoneType: { select: { name: true, level: true } },
          },
        },
      },
    });

    if (!assignment) {
      throw new ApiError(404, "GOVERNANCE_ASSIGNMENT_NOT_FOUND");
    }

    if (assignment.status !== "SUSPENDED" || assignment.revokedAt) {
      throw new ApiError(409, "ONLY_SUSPENDED_ASSIGNMENT_CAN_BE_REACTIVATED");
    }

    if (assignment.endsAt && assignment.endsAt.getTime() < now.getTime()) {
      throw new ApiError(409, "ENDED_ASSIGNMENT_CANNOT_BE_REACTIVATED");
    }

    const duplicate = await tx.governanceOfficerAssignment.findFirst({
      where: {
        id: { not: assignment.id },
        userId: assignment.userId,
        zoneId: assignment.zoneId,
        role: assignment.role,
        status: "ACTIVE",
        revokedAt: null,
      },
      select: { id: true },
    });

    if (duplicate) {
      throw new ApiError(409, "ACTIVE_ASSIGNMENT_ALREADY_EXISTS");
    }

    const updated = await tx.governanceOfficerAssignment.update({
      where: { id: assignment.id },
      data: {
        status: "ACTIVE",
        revokeReason: null,
        metadata: safeJson({
          ...objectFromJson(assignment.metadata),
          lifecycle: {
            lastAction: "REACTIVATE_ASSIGNMENT",
            previousStatus: assignment.status,
            nextStatus: "ACTIVE",
            reason: args.reason,
            actorUserId: args.actorUserId,
            actedAt: now.toISOString(),
          },
        }),
      },
      select: {
        id: true,
        role: true,
        status: true,
        revokedAt: true,
        revokeReason: true,
        updatedAt: true,
      },
    });

    await tx.auditLog.create({
      data: {
        action: "GOVERNANCE_OFFICER_ASSIGNMENT_REACTIVATED",
        userId: args.actorUserId,
        resource: "GovernanceOfficerAssignment",
        resourceId: assignment.id,
        ip: args.ip ?? undefined,
        userAgent: args.userAgent ?? undefined,
        metadata: safeJson({
          assignmentId: assignment.id,
          targetUserId: assignment.userId,
          targetUserEmail: assignment.user.email,
          targetUserName: assignment.user.name,
          role: assignment.role,
          zoneId: assignment.zoneId,
          zoneName: assignment.zone.name,
          zoneType: assignment.zone.zoneType.name,
          zoneLevel: assignment.zone.zoneType.level,
          previousStatus: assignment.status,
          nextStatus: "ACTIVE",
          reason: args.reason,
        }),
      },
    });

    return updated;
  });
}

export async function POST(req: Request) {
  const auth = await requireApiUserContext(req, {
    requireTenant: false,
    requireRoleNames: ["SUPERADMIN"],
  });

  if (!auth.ok) return auth.res;

  const ip = getIpFromHeaders(req.headers);
  const userAgent = getUserAgentFromHeaders(req.headers);

  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    const action = normalizeAction(body.action);
    const reason = requireReason(body.reason);

    if (!action) {
      return json(400, { ok: false, error: "INVALID_LIFECYCLE_ACTION" });
    }

    if (action === "REVOKE_INVITE") {
      const inviteId = clean(body.inviteId);

      if (!inviteId) {
        return json(400, { ok: false, error: "MISSING_INVITE_ID" });
      }

      const item = await revokeInvite({
        inviteId,
        reason,
        actorUserId: auth.ctx.userId,
        ip,
        userAgent,
      });

      return json(200, { ok: true, item });
    }

    const assignmentId = clean(body.assignmentId);

    if (!assignmentId) {
      return json(400, { ok: false, error: "MISSING_ASSIGNMENT_ID" });
    }

    if (action === "SUSPEND_ASSIGNMENT") {
      const item = await suspendAssignment({
        assignmentId,
        reason,
        actorUserId: auth.ctx.userId,
        ip,
        userAgent,
      });

      return json(200, { ok: true, item });
    }

    if (action === "REVOKE_ASSIGNMENT") {
      const item = await revokeAssignment({
        assignmentId,
        reason,
        actorUserId: auth.ctx.userId,
        ip,
        userAgent,
      });

      return json(200, { ok: true, item });
    }

    const item = await reactivateAssignment({
      assignmentId,
      reason,
      actorUserId: auth.ctx.userId,
      ip,
      userAgent,
    });

    return json(200, { ok: true, item });
  } catch (err) {
    if (err instanceof ApiError) {
      return json(err.status, { ok: false, error: err.code });
    }

    console.error("GOVERNANCE_OFFICER_LIFECYCLE_ERROR", err);
    return json(500, { ok: false, error: "GOVERNANCE_LIFECYCLE_FAILED" });
  }
}