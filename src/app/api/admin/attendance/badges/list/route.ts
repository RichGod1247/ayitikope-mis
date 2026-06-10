//src/app/api/admin/attendance/badges/list/route.ts
import { NextRequest, NextResponse } from "next/server";
import { StudentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
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

type BadgeState = "NO_BADGE" | "ACTIVE" | "REVOKED";

function noStoreJson(status: number, payload: unknown) {
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

function fullName(firstName?: string | null, lastName?: string | null) {
  return [firstName, lastName].filter(Boolean).join(" ").trim() || "Unnamed learner";
}

function classroomLabel(c?: { name?: string | null; grade?: string | null; arm?: string | null } | null) {
  return [c?.name, c?.grade, c?.arm].filter(Boolean).join(" • ") || "Unassigned";
}

function iso(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

export async function GET(req: NextRequest) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ADMIN_ROLES,
  });

  if (!auth.ok) return auth.res;

  const url = new URL(req.url);
  const classroomId = clean(url.searchParams.get("classroomId"));

  if (!classroomId) {
    return noStoreJson(400, { ok: false, error: "classroomId is required." });
  }

  const classroom = await prisma.classroom.findFirst({
    where: { id: classroomId, tenantId: auth.ctx.tenantId },
    select: { id: true, name: true, grade: true, arm: true },
  });

  if (!classroom) {
    return noStoreJson(404, { ok: false, error: "Classroom not found." });
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: auth.ctx.tenantId },
    select: { id: true, name: true, schoolCode: true },
  });

  const students = await prisma.student.findMany({
    where: {
      tenantId: auth.ctx.tenantId,
      classroomId,
      status: StudentStatus.ACTIVE,
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      guardianName: true,
      guardianPhone: true,
      guardianSmsOptIn: true,
      classroomId: true,
      classroom: { select: { id: true, name: true, grade: true, arm: true } },
      attendanceBadges: {
        select: {
          id: true,
          tokenHint: true,
          label: true,
          issuedAt: true,
          lastUsedAt: true,
          revokedAt: true,
          revokeReason: true,
        },
        orderBy: { issuedAt: "desc" },
        take: 5,
      },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }, { id: "asc" }],
    take: 500,
  });

  const items = students.map((student) => {
    const activeBadge = student.attendanceBadges.find((badge) => !badge.revokedAt) ?? null;
    const latestBadge = student.attendanceBadges[0] ?? null;
    const displayBadge = activeBadge ?? latestBadge;

    const badgeState: BadgeState = activeBadge ? "ACTIVE" : latestBadge ? "REVOKED" : "NO_BADGE";

    return {
      student: {
        id: student.id,
        name: fullName(student.firstName, student.lastName),
        guardianName: student.guardianName,
        guardianPhone: student.guardianPhone,
        guardianSmsOptIn: student.guardianSmsOptIn,
        classroomId: student.classroomId,
        classroomLabel: classroomLabel(student.classroom),
      },
      badgeState,
      badge: displayBadge
        ? {
            id: displayBadge.id,
            tokenHint: displayBadge.tokenHint,
            label: displayBadge.label,
            issuedAt: iso(displayBadge.issuedAt),
            lastUsedAt: iso(displayBadge.lastUsedAt),
            revokedAt: iso(displayBadge.revokedAt),
            revokeReason: displayBadge.revokeReason,
          }
        : null,
      activeBadgeId: activeBadge?.id ?? null,
      badgeCount: student.attendanceBadges.length,
    };
  });

  return noStoreJson(200, {
    ok: true,
    tenant: {
      id: tenant?.id ?? auth.ctx.tenantId,
      name: tenant?.name ?? "School",
      schoolCode: tenant?.schoolCode ?? null,
    },
    classroom: {
      id: classroom.id,
      label: classroomLabel(classroom),
    },
    summary: {
      totalLearners: items.length,
      activeBadges: items.filter((item) => item.badgeState === "ACTIVE").length,
      revokedOnly: items.filter((item) => item.badgeState === "REVOKED").length,
      noBadge: items.filter((item) => item.badgeState === "NO_BADGE").length,
    },
    items,
  });
}