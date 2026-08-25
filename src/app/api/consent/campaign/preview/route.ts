import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import { effectiveRole } from "@/lib/roleRouting";
import {
  buildGuardianFamilyEssentialAlertInvitationBatch,
  buildStaffEssentialAlertInvitation,
  invitationMayBeSent,
} from "@/lib/essentialAlerts/enrollment";
import { ESSENTIAL_ALERT_POLICY } from "@/lib/essentialAlerts/policy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ALLOWED_ROLES = new Set(["HEADTEACHER", "SCHOOL_ADMIN", "SUPERADMIN"]);

type Audience = "GUARDIANS" | "STAFF";

function json(status: number, payload: unknown) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function audience(value: unknown): Audience {
  return String(value ?? "").trim().toUpperCase() === "STAFF"
    ? "STAFF"
    : "GUARDIANS";
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

  const url = new URL(req.url);
  const selectedAudience = audience(url.searchParams.get("audience"));
  const limit = Math.min(
    Math.max(Number(url.searchParams.get("limit") ?? 50) || 50, 1),
    200,
  );

  const items: Array<{
    id: string;
    name: string;
    currentStatus: string;
    canInvite: boolean;
    coveredLearners?: number;
    childNames?: string[];
  }> = [];

  if (selectedAudience === "GUARDIANS") {
    const families = await buildGuardianFamilyEssentialAlertInvitationBatch({
      tenantId: auth.ctx.tenantId,
      limit,
    });

    for (const family of families) {
      const statuses = family.members.map((member) => member.existingStatus);
      const currentStatus = statuses.every((status) => status === "ENROLLED")
        ? "ENROLLED"
        : statuses.every((status) => status === "OPTED_OUT")
          ? "OPTED_OUT"
          : statuses.some((status) => status === "INVITED")
            ? "INVITED"
            : "NOT_ENROLLED";

      items.push({
        id: family.seedStudentId,
        name: family.guardianName,
        currentStatus,
        canInvite: family.inviteableChildren > 0,
        coveredLearners: family.totalChildren,
        childNames: family.childNames,
      });
    }
  } else {
    const memberships = await prisma.membership.findMany({
      where: {
        tenantId: auth.ctx.tenantId,
        status: "ACTIVE",
      },
      select: { userId: true, role: { select: { name: true } } },
      take: 2000,
    });

    const seen = new Set<string>();
    for (const row of memberships) {
      const roleName = String(row.role?.name ?? "")
        .trim()
        .toUpperCase()
        .replace(/[\s-]+/g, "_");
      if (!new Set(["TEACHER", "HEADTEACHER", "HEADMASTER"]).has(roleName)) {
        continue;
      }
      if (seen.has(row.userId)) continue;
      seen.add(row.userId);

      try {
        const invite = await buildStaffEssentialAlertInvitation({
          tenantId: auth.ctx.tenantId,
          userId: row.userId,
        });
        items.push({
          id: row.userId,
          name: invite.staffName,
          currentStatus: invite.existingStatus ?? "NOT_ENROLLED",
          canInvite: invitationMayBeSent({
            existingStatus: invite.existingStatus,
            lastInvitationAttemptAt: invite.lastInvitationAttemptAt,
            lastInvitationSentAt: invite.lastInvitationSentAt,
          }),
        });
        if (items.length >= limit) break;
      } catch {
        // Missing/invalid staff contact is intentionally omitted.
      }
    }
  }

  const inviteable = items.filter((item) => item.canInvite).length;

  return json(200, {
    ok: true,
    audience: selectedAudience,
    policy: {
      id: ESSENTIAL_ALERT_POLICY.policyId,
      version: ESSENTIAL_ALERT_POLICY.version,
      firstSchoolTermFree: ESSENTIAL_ALERT_POLICY.firstSchoolTermFree,
      advertisingAllowed: false,
      paidContinuationNoticeDays:
        ESSENTIAL_ALERT_POLICY.paidContinuationNoticeDays,
    },
    count: items.length,
    inviteable,
    enrolled: items.filter((item) => item.currentStatus === "ENROLLED").length,
    optedOut: items.filter((item) => item.currentStatus === "OPTED_OUT").length,
    recentlyInvited: items.filter(
      (item) => item.currentStatus === "INVITED" && !item.canInvite,
    ).length,
    ...(selectedAudience === "GUARDIANS"
      ? {
          learnersCovered: items.reduce(
            (sum, item) => sum + (item.coveredLearners ?? 0),
            0,
          ),
        }
      : {}),
    items,
    databaseWrites: 0,
    providerCalled: false,
  });
}
