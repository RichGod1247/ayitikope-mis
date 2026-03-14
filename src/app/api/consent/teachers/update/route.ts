// src/app/api/consent/teachers/update/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import { effectiveRole } from "@/lib/roleRouting";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_ROLES = new Set(["HEADTEACHER", "SCHOOL_ADMIN", "SUPERADMIN"]);

function json(status: number, payload: unknown) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function cleanStr(v: unknown) {
  return String(v ?? "").trim();
}

function roleUpper(v: unknown): string {
  return effectiveRole(v).trim().toUpperCase();
}

export async function POST(req: NextRequest) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["HEADTEACHER", "SCHOOL_ADMIN", "SUPERADMIN"],
  });
  if (!auth.ok) return auth.res;

  const ctx = auth.ctx;

  const membership = await prisma.membership.findUnique({
    where: {
      userId_tenantId: {
        userId: ctx.userId,
        tenantId: ctx.tenantId,
      },
    },
    select: {
      status: true,
      role: { select: { name: true } },
    },
  });

  if (!membership || membership.status !== "ACTIVE") {
    return json(403, { ok: false, error: "FORBIDDEN" });
  }

  const roleName = roleUpper(membership.role?.name ?? ctx.roleName);
  if (!ALLOWED_ROLES.has(roleName)) {
    return json(403, { ok: false, error: "FORBIDDEN_ROLE" });
  }

  try {
    const body = await req.json().catch(() => ({} as any));

    const userId = cleanStr(body?.userId);
    const hasSmsOptIn = typeof body?.smsOptIn === "boolean";
    const smsOptIn = hasSmsOptIn ? Boolean(body.smsOptIn) : false;

    if (!userId) {
      return json(400, { ok: false, error: "userId is required" });
    }

    if (!hasSmsOptIn) {
      return json(400, { ok: false, error: "smsOptIn (boolean) is required" });
    }

    const targetMembership = await prisma.membership.findFirst({
      where: {
        tenantId: ctx.tenantId,
        userId,
        status: "ACTIVE",
      },
      select: {
        userId: true,
      },
    });

    if (!targetMembership) {
      return json(404, { ok: false, error: "Teacher not found in this tenant" });
    }

    const result = await prisma.$transaction(async (tx) => {
      const current = await tx.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          email: true,
          smsOptIn: true,
        },
      });

      if (!current) {
        return { ok: false as const, error: "Teacher not found" };
      }

      const updated = await tx.user.update({
        where: { id: userId },
        data: { smsOptIn },
        select: {
          id: true,
          name: true,
          email: true,
          smsOptIn: true,
        },
      });

      try {
        await tx.auditLog.create({
          data: {
            tenantId: ctx.tenantId,
            userId: ctx.userId,
            action: "CONSENT_TEACHER_UPDATE",
            resource: "User",
            resourceId: updated.id,
            ip: null,
            userAgent: null,
            metadata: {
              actorId: ctx.userId,
              teacher: {
                id: updated.id,
                name: updated.name,
                email: updated.email,
              },
              before: { smsOptIn: current.smsOptIn },
              after: { smsOptIn: updated.smsOptIn },
            } as any,
          },
        });
      } catch (e) {
        console.warn("[CONSENT_TEACHER_UPDATE_AUDIT_WARN]", e);
      }

      return { ok: true as const, user: updated };
    });

    if (!result.ok) {
      return json(404, { ok: false, error: result.error });
    }

    return json(200, { ok: true, user: result.user });
  } catch (err) {
    console.error("[CONSENT_TEACHERS_UPDATE_ERROR]", err);
    return json(500, { ok: false, error: "Failed to update teacher consent" });
  }
}