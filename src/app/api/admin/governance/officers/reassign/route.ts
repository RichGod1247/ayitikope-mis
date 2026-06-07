// src/app/api/admin/governance/officers/reassign/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import { getIpFromHeaders, getUserAgentFromHeaders } from "@/lib/rateLimit";

type Body = {
  assignmentId?: string;
  newZoneId?: string;
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

function safeJson(value: unknown): any {
  return JSON.parse(JSON.stringify(value));
}

function objectFromJson(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function requireReason(value: unknown) {
  const reason = clean(value);

  if (reason.length < 10) {
    throw new ApiError(400, "REASSIGN_REASON_TOO_SHORT");
  }

  if (reason.length > 1000) {
    throw new ApiError(400, "REASSIGN_REASON_TOO_LONG");
  }

  return reason;
}

function roleZoneLevel(role: string) {
  if (role === "SISSO" || role === "CIRCUIT_SUPERVISOR") return 1;

  if (
    role === "DISTRICT_DIRECTOR" ||
    role === "DISTRICT_MIS_OFFICER" ||
    role === "DISTRICT_SHEP_OFFICER" ||
    role === "DISTRICT_ASSESSMENT_OFFICER"
  ) {
    return 2;
  }

  if (role === "REGIONAL_VIEWER") return 3;

  return null;
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

    const assignmentId = clean(body.assignmentId);
    const newZoneId = clean(body.newZoneId);
    const reason = requireReason(body.reason);

    if (!assignmentId) {
      return json(400, { ok: false, error: "MISSING_ASSIGNMENT_ID" });
    }

    if (!newZoneId) {
      return json(400, { ok: false, error: "MISSING_NEW_ZONE_ID" });
    }

    const now = new Date();

    const result = await prisma.$transaction(async (tx) => {
      const assignment = await tx.governanceOfficerAssignment.findUnique({
        where: { id: assignmentId },
        select: {
          id: true,
          userId: true,
          zoneId: true,
          role: true,
          status: true,
          title: true,
          phone: true,
          startsAt: true,
          endsAt: true,
          revokedAt: true,
          revokeReason: true,
          metadata: true,
          user: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
          zone: {
            select: {
              id: true,
              name: true,
              zoneType: { select: { name: true, level: true } },
              parentZone: { select: { id: true, name: true } },
            },
          },
        },
      });

      if (!assignment) {
        throw new ApiError(404, "GOVERNANCE_ASSIGNMENT_NOT_FOUND");
      }

      if (assignment.status !== "ACTIVE" || assignment.revokedAt) {
        throw new ApiError(409, "ONLY_ACTIVE_ASSIGNMENT_CAN_BE_REASSIGNED");
      }

      if (assignment.zoneId === newZoneId) {
        throw new ApiError(409, "NEW_ZONE_MUST_DIFFER_FROM_CURRENT_ZONE");
      }

      const newZone = await tx.adminZone.findUnique({
        where: { id: newZoneId },
        select: {
          id: true,
          name: true,
          isActive: true,
          zoneType: { select: { name: true, level: true } },
          parentZone: { select: { id: true, name: true } },
        },
      });

      if (!newZone || !newZone.isActive) {
        throw new ApiError(404, "NEW_ZONE_NOT_FOUND_OR_INACTIVE");
      }

      const expectedLevel = roleZoneLevel(String(assignment.role));

      if (!expectedLevel || newZone.zoneType.level !== expectedLevel) {
        throw new ApiError(400, "ROLE_NEW_ZONE_MISMATCH");
      }

      const duplicate = await tx.governanceOfficerAssignment.findFirst({
        where: {
          userId: assignment.userId,
          zoneId: newZone.id,
          role: assignment.role,
          status: "ACTIVE",
          revokedAt: null,
        },
        select: { id: true },
      });

      if (duplicate) {
        throw new ApiError(409, "ACTIVE_ASSIGNMENT_ALREADY_EXISTS_IN_NEW_ZONE");
      }

      const oldAssignment = await tx.governanceOfficerAssignment.update({
        where: { id: assignment.id },
        data: {
          status: "REVOKED",
          revokedAt: now,
          revokedByUserId: auth.ctx.userId,
          endsAt: now,
          revokeReason: `Reassigned to ${newZone.name}: ${reason}`,
          metadata: safeJson({
            ...objectFromJson(assignment.metadata),
            lifecycle: {
              lastAction: "REASSIGNMENT_OLD_ASSIGNMENT_REVOKED",
              previousStatus: assignment.status,
              nextStatus: "REVOKED",
              reason,
              actorUserId: auth.ctx.userId,
              actedAt: now.toISOString(),
            },
            reassignment: {
              direction: "OLD_ASSIGNMENT",
              oldAssignmentId: assignment.id,
              oldZoneId: assignment.zone.id,
              oldZoneName: assignment.zone.name,
              oldZoneType: assignment.zone.zoneType.name,
              oldZoneLevel: assignment.zone.zoneType.level,
              newZoneId: newZone.id,
              newZoneName: newZone.name,
              newZoneType: newZone.zoneType.name,
              newZoneLevel: newZone.zoneType.level,
              reassignedAt: now.toISOString(),
              reassignedByUserId: auth.ctx.userId,
              reason,
            },
          }),
        },
        select: {
          id: true,
          role: true,
          status: true,
          zoneId: true,
          revokedAt: true,
          revokeReason: true,
          updatedAt: true,
        },
      });

      const newAssignment = await tx.governanceOfficerAssignment.create({
        data: {
          userId: assignment.userId,
          zoneId: newZone.id,
          role: assignment.role,
          status: "ACTIVE",
          title: assignment.title,
          phone: assignment.phone,
          startsAt: now,
          createdByUserId: auth.ctx.userId,
          metadata: safeJson({
            lifecycle: {
              lastAction: "REASSIGNMENT_NEW_ASSIGNMENT_CREATED",
              previousStatus: null,
              nextStatus: "ACTIVE",
              reason,
              actorUserId: auth.ctx.userId,
              actedAt: now.toISOString(),
            },
            reassignment: {
              direction: "NEW_ASSIGNMENT",
              oldAssignmentId: assignment.id,
              oldZoneId: assignment.zone.id,
              oldZoneName: assignment.zone.name,
              oldZoneType: assignment.zone.zoneType.name,
              oldZoneLevel: assignment.zone.zoneType.level,
              newZoneId: newZone.id,
              newZoneName: newZone.name,
              newZoneType: newZone.zoneType.name,
              newZoneLevel: newZone.zoneType.level,
              reassignedAt: now.toISOString(),
              reassignedByUserId: auth.ctx.userId,
              reason,
            },
          }),
        },
        select: {
          id: true,
          role: true,
          status: true,
          zoneId: true,
          startsAt: true,
          createdAt: true,
          updatedAt: true,
          user: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
          zone: {
            select: {
              id: true,
              name: true,
              zoneType: { select: { name: true, level: true } },
              parentZone: { select: { id: true, name: true } },
            },
          },
        },
      });

      await tx.auditLog.create({
        data: {
          action: "GOVERNANCE_OFFICER_ASSIGNMENT_REASSIGNED",
          userId: auth.ctx.userId,
          resource: "GovernanceOfficerAssignment",
          resourceId: newAssignment.id,
          ip: ip ?? undefined,
          userAgent: userAgent ?? undefined,
          metadata: safeJson({
            targetUserId: assignment.userId,
            targetUserEmail: assignment.user.email,
            targetUserName: assignment.user.name,
            role: assignment.role,
            oldAssignmentId: assignment.id,
            newAssignmentId: newAssignment.id,
            oldZoneId: assignment.zone.id,
            oldZoneName: assignment.zone.name,
            oldZoneType: assignment.zone.zoneType.name,
            oldZoneLevel: assignment.zone.zoneType.level,
            newZoneId: newZone.id,
            newZoneName: newZone.name,
            newZoneType: newZone.zoneType.name,
            newZoneLevel: newZone.zoneType.level,
            reason,
            reassignedAt: now.toISOString(),
          }),
        },
      });

      return {
        oldAssignment,
        newAssignment,
      };
    });

    return json(200, {
      ok: true,
      ...result,
    });
  } catch (err) {
    if (err instanceof ApiError) {
      return json(err.status, { ok: false, error: err.code });
    }

    console.error("GOVERNANCE_OFFICER_REASSIGN_ERROR", err);
    return json(500, { ok: false, error: "GOVERNANCE_OFFICER_REASSIGN_FAILED" });
  }
}