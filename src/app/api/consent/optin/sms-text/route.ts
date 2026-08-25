import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import { effectiveRole } from "@/lib/roleRouting";
import { ESSENTIAL_ALERT_POLICY } from "@/lib/essentialAlerts/policy";
import { buildGuardianFamilyEssentialAlertInvitation } from "@/lib/essentialAlerts/enrollment";
import { signEssentialAlertCompactInvite } from "@/lib/essentialAlerts/tokens";
import { essentialAlertPublicOrigin } from "@/lib/essentialAlerts/publicPage";

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

  const studentId = String(
    new URL(req.url).searchParams.get("studentId") ?? "",
  ).trim();
  if (!studentId) {
    return json(400, { ok: false, error: "studentId is required" });
  }

  try {
    const family = await buildGuardianFamilyEssentialAlertInvitation({
      tenantId: auth.ctx.tenantId,
      studentId,
    });

    const now = Date.now();
    const activeReference = family.members.find((member) => {
      if (
        member.existingStatus !== "INVITED" ||
        !member.enrollmentId ||
        !member.lastInvitationSentAt ||
        member.invitationCount < 1
      ) {
        return false;
      }

      const expiresAt =
        member.lastInvitationSentAt.getTime() + ESSENTIAL_ALERT_POLICY.invitationTtlDays * 86_400_000;
      return expiresAt >= now;
    });

    const origin = essentialAlertPublicOrigin(req);
    const link = activeReference
      ? `${origin}/a/${encodeURIComponent(
          signEssentialAlertCompactInvite({
            kind: "GUARDIAN",
            enrollmentId: activeReference.enrollmentId as string,
            invitationCount: activeReference.invitationCount,
          }),
        )}`
      : null;

    const who =
      family.totalChildren === 1
        ? family.childNames[0] ?? "your child"
        : `${family.totalChildren} children`;

    const text = link
      ? `${family.schoolName}: Free first-term EduLife alerts for ${who}: attendance, fees/payments & released results. No ads. Confirm: ${link}`
      : `${family.schoolName}: Free first-term EduLife alerts for ${who}: attendance, fees/payments & released results. No ads. Send a fresh invitation from the Essential Alerts center to create a usable link.`;

    return json(200, {
      ok: true,
      text,
      link,
      activeInvitation: Boolean(link),
      familyLearnerCount: family.totalChildren,
      childNames: family.childNames,
      policy: "EDULIFE_ESSENTIAL_SCHOOL_ALERTS_V1",
      databaseWrites: 0,
      healthConsentChanged: false,
      legacySmsOptInChanged: false,
    });
  } catch (error) {
    const status =
      error && typeof error === "object" && "status" in error
        ? Number((error as { status?: unknown }).status) || 500
        : 500;

    return json(status, {
      ok: false,
      error:
        error instanceof Error ? error.message : "INVITATION_PREVIEW_FAILED",
    });
  }
}
