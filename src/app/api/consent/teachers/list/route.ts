import { NextRequest, NextResponse } from "next/server";
import { EssentialAlertRecipientKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import { effectiveRole } from "@/lib/roleRouting";
import {
  normalizeGhanaPhone,
  staffSubjectKey,
} from "@/lib/essentialAlerts/policy";
import { essentialAlertPhoneFingerprint } from "@/lib/essentialAlerts/tokens";
import { essentialAlertStatusLabel } from "@/lib/essentialAlerts/enrollment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_ROLES = new Set(["HEADTEACHER", "SCHOOL_ADMIN", "SUPERADMIN"]);
const ELIGIBLE_STAFF_ROLES = new Set(["TEACHER", "HEADTEACHER", "HEADMASTER"]);

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

function normalizedRole(value: unknown) {
  return String(value ?? "").trim().toUpperCase().replace(/[\s-]+/g, "_");
}

export async function GET(req: NextRequest) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["HEADTEACHER", "SCHOOL_ADMIN", "SUPERADMIN"],
  });
  if (!auth.ok) return auth.res;

  const ctx = auth.ctx;

  const actorMembership = await prisma.membership.findUnique({
    where: {
      userId_tenantId: {
        userId: ctx.userId,
        tenantId: ctx.tenantId,
      },
    },
    select: { status: true, role: { select: { name: true } } },
  });
  if (
    !actorMembership ||
    actorMembership.status !== "ACTIVE" ||
    !ALLOWED_ROLES.has(role(actorMembership.role?.name ?? ctx.roleName))
  ) {
    return json(403, { ok: false, error: "FORBIDDEN" });
  }

  const [memberships, enrollments] = await Promise.all([
    prisma.membership.findMany({
      where: { tenantId: ctx.tenantId, status: "ACTIVE" },
      select: {
        userId: true,
        role: { select: { name: true } },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            phoneNorm: true,
            teacherProfiles: {
              where: { tenantId: ctx.tenantId },
              take: 1,
              select: { phone: true },
            },
          },
        },
      },
      take: 2000,
    }),
    prisma.essentialAlertEnrollment.findMany({
      where: {
        tenantId: ctx.tenantId,
        recipientKind: EssentialAlertRecipientKind.STAFF,
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
  const dedup = new Map<string, ReturnType<typeof makeItem>>();

  function makeItem(row: (typeof memberships)[number]) {
    const roleName = normalizedRole(row.role?.name);
    const phoneNorm =
      normalizeGhanaPhone(row.user.phoneNorm) ??
      normalizeGhanaPhone(row.user.phone) ??
      normalizeGhanaPhone(row.user.teacherProfiles[0]?.phone);
    const phoneFingerprint = phoneNorm
      ? essentialAlertPhoneFingerprint({
          tenantId: ctx.tenantId,
          kind: "STAFF",
          subjectId: row.user.id,
          phoneNorm,
        })
      : null;
    const subjectKey = phoneFingerprint
      ? staffSubjectKey(row.user.id, phoneFingerprint)
      : null;
    const enrollment = subjectKey ? enrollmentMap.get(subjectKey) : null;

    return {
      id: row.user.id,
      name: row.user.name,
      email: row.user.email,
      role: roleName,
      phoneAvailable: Boolean(phoneNorm),
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
  }

  for (const row of memberships) {
    const roleName = normalizedRole(row.role?.name);
    if (!ELIGIBLE_STAFF_ROLES.has(roleName)) continue;
    if (!dedup.has(row.userId)) dedup.set(row.userId, makeItem(row));
  }

  const items = Array.from(dedup.values()).sort((a, b) =>
    String(a.name ?? a.email ?? "").localeCompare(String(b.name ?? b.email ?? "")),
  );

  return json(200, { ok: true, items });
}
