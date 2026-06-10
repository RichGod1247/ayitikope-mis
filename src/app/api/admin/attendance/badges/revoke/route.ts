//src/app/api/admin/attendance/badges/revoke/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { requireApiUserContext } from "@/lib/serverAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADMIN_ROLES = [
  "ADMIN",
  "SCHOOL_ADMIN",
  "SCHOOLADMIN",
  "HEADTEACHER",
  "SUPERADMIN",
];

const BodySchema = z
  .object({
    badgeId: z.string().trim().min(1, "badgeId is required."),
    reason: z.string().trim().max(300, "Reason is too long.").optional().nullable(),
  })
  .strict();

function noStoreJson(status: number, payload: unknown) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function clientIp(req: Request) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || null;
}

function userAgent(req: Request) {
  return req.headers.get("user-agent") || null;
}

function fullName(firstName?: string | null, lastName?: string | null) {
  return [firstName, lastName].filter(Boolean).join(" ").trim() || "Unnamed learner";
}

export async function POST(req: NextRequest) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ADMIN_ROLES,
  });

  if (!auth.ok) return auth.res;

  const ct = req.headers.get("content-type") || "";
  if (!ct.toLowerCase().includes("application/json")) {
    return noStoreJson(415, { ok: false, error: "Content-Type must be application/json." });
  }

  const raw = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(raw);

  if (!parsed.success) {
    return noStoreJson(400, {
      ok: false,
      error: parsed.error.issues[0]?.message || "Invalid body.",
    });
  }

  const badge = await prisma.studentAttendanceBadge.findFirst({
    where: {
      id: parsed.data.badgeId,
      tenantId: auth.ctx.tenantId,
    },
    select: {
      id: true,
      tokenHint: true,
      revokedAt: true,
      studentId: true,
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          classroomId: true,
          classroom: { select: { id: true, name: true, grade: true, arm: true } },
        },
      },
    },
  });

  if (!badge) {
    return noStoreJson(404, { ok: false, error: "Badge not found." });
  }

  if (badge.revokedAt) {
    return noStoreJson(409, { ok: false, error: "Badge is already revoked." });
  }

  const reason = parsed.data.reason?.trim() || "Revoked by school administrator.";
  const now = new Date();

  const revoked = await prisma.studentAttendanceBadge.update({
    where: { id: badge.id },
    data: {
      revokedAt: now,
      revokedByUserId: auth.ctx.userId,
      revokeReason: reason,
    },
    select: {
      id: true,
      tokenHint: true,
      revokedAt: true,
      revokeReason: true,
    },
  });

  await writeAuditLog({
    action: "ATTENDANCE_BADGE_REVOKED",
    tenantId: auth.ctx.tenantId,
    userId: auth.ctx.userId,
    resource: "StudentAttendanceBadge",
    resourceId: badge.id,
    ip: clientIp(req),
    userAgent: userAgent(req),
    metadata: {
      badgeId: badge.id,
      tokenHint: badge.tokenHint,
      studentId: badge.studentId,
      studentName: fullName(badge.student.firstName, badge.student.lastName),
      classroomId: badge.student.classroomId,
      reason,
    },
  });

  return noStoreJson(200, {
    ok: true,
    badge: {
      id: revoked.id,
      tokenHint: revoked.tokenHint,
      revokedAt: revoked.revokedAt?.toISOString() ?? null,
      revokeReason: revoked.revokeReason,
    },
    student: {
      id: badge.student.id,
      name: fullName(badge.student.firstName, badge.student.lastName),
      classroomId: badge.student.classroomId,
    },
  });
}