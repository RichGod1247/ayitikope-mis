import { NextRequest, NextResponse } from "next/server";
import { EssentialAlertRecipientKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import { effectiveRole } from "@/lib/roleRouting";
import {
  guardianSubjectKey,
  normalizeGhanaPhone,
} from "@/lib/essentialAlerts/policy";
import { essentialAlertPhoneFingerprint } from "@/lib/essentialAlerts/tokens";
import { essentialAlertStatusLabel } from "@/lib/essentialAlerts/enrollment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_ROLES = new Set(["HEADTEACHER", "SCHOOL_ADMIN", "SUPERADMIN"]);

function json(status: number, payload: unknown) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function role(value: unknown) {
  return effectiveRole(value).trim().toUpperCase();
}

export async function GET(req: NextRequest) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["HEADTEACHER", "SCHOOL_ADMIN", "SUPERADMIN"],
  });
  if (!auth.ok) return auth.res;

  const membership = await prisma.membership.findUnique({
    where: {
      userId_tenantId: {
        userId: auth.ctx.userId,
        tenantId: auth.ctx.tenantId,
      },
    },
    select: { status: true, role: { select: { name: true } } },
  });
  if (
    !membership ||
    membership.status !== "ACTIVE" ||
    !ALLOWED_ROLES.has(role(membership.role?.name ?? auth.ctx.roleName))
  ) {
    return json(403, { ok: false, error: "FORBIDDEN" });
  }

  const [students, enrollments] = await Promise.all([
    prisma.student.findMany({
      where: { tenantId: auth.ctx.tenantId, status: "ACTIVE" },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        guardianName: true,
        guardianPhone: true,
        guardianPhoneNorm: true,
        classroom: { select: { name: true, grade: true, arm: true } },
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      take: 2000,
    }),
    prisma.essentialAlertEnrollment.findMany({
      where: {
        tenantId: auth.ctx.tenantId,
        recipientKind: EssentialAlertRecipientKind.GUARDIAN,
      },
      select: {
        subjectKey: true,
        status: true,
        consentedAt: true,
        optedOutAt: true,
        lastInvitationSentAt: true,
        invitationCount: true,
        policyVersion: true,
      },
    }),
  ]);

  const enrollmentMap = new Map(enrollments.map((row) => [row.subjectKey, row]));

  const items = students.map((student) => {
    const phoneNorm =
      normalizeGhanaPhone(student.guardianPhoneNorm) ??
      normalizeGhanaPhone(student.guardianPhone);

    const phoneFingerprint = phoneNorm
      ? essentialAlertPhoneFingerprint({
          tenantId: auth.ctx.tenantId,
          kind: "GUARDIAN",
          subjectId: student.id,
          phoneNorm,
        })
      : null;
    const subjectKey = phoneFingerprint
      ? guardianSubjectKey(student.id, phoneFingerprint)
      : null;
    const enrollment = subjectKey ? enrollmentMap.get(subjectKey) : null;

    return {
      id: student.id,
      firstName: student.firstName,
      lastName: student.lastName,
      guardianName: student.guardianName,
      guardianPhone: student.guardianPhoneNorm ?? student.guardianPhone,
      phoneAvailable: Boolean(phoneNorm),
      classroom: student.classroom,
      essentialAlerts: {
        status: essentialAlertStatusLabel(enrollment?.status),
        policyVersion: enrollment?.policyVersion ?? null,
        consentedAt: enrollment?.consentedAt?.toISOString() ?? null,
        optedOutAt: enrollment?.optedOutAt?.toISOString() ?? null,
        lastInvitationSentAt:
          enrollment?.lastInvitationSentAt?.toISOString() ?? null,
        invitationCount: enrollment?.invitationCount ?? 0,
      },
    };
  });

  return json(200, { ok: true, items });
}
