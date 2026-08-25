import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import { effectiveRole } from "@/lib/roleRouting";
import { sendSms } from "@/lib/sms";
import {
  buildGuardianFamilyEssentialAlertInvitationBatch,
  buildStaffEssentialAlertInvitation,
  invitationMayBeSent,
  recordEssentialAlertInvitationAttempt,
  recordEssentialAlertInvitationSent,
  recordGuardianFamilyInvitationAttempt,
  recordGuardianFamilyInvitationSent,
} from "@/lib/essentialAlerts/enrollment";
import { ESSENTIAL_ALERT_POLICY } from "@/lib/essentialAlerts/policy";
import { signEssentialAlertCompactInvite } from "@/lib/essentialAlerts/tokens";
import {
  essentialAlertPublicOrigin,
  requestIp,
} from "@/lib/essentialAlerts/publicPage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ALLOWED_ROLES = new Set(["HEADTEACHER", "SCHOOL_ADMIN", "SUPERADMIN"]);
const MAX_RECIPIENTS_PER_REQUEST = 300;
const STAFF_NO_PHONE_ERROR = "ESSENTIAL_ALERT_STAFF_PHONE_MISSING";

type Audience = "GUARDIANS" | "STAFF";
type Body = { audience?: Audience; limit?: number };

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

function selectedAudience(value: unknown): Audience {
  return String(value ?? "").trim().toUpperCase() === "STAFF"
    ? "STAFF"
    : "GUARDIANS";
}

function staffInvitationSkipReason(error: unknown) {
  if (error instanceof Error && error.message === STAFF_NO_PHONE_ERROR) {
    return "PHONE_MISSING" as const;
  }
  return null;
}

function guardianMessage(input: {
  schoolName: string;
  learnerCount: number;
  link: string;
}) {
  const who = input.learnerCount === 1 ? "your child" : `your ${input.learnerCount} children`;
  return `${input.schoolName}: Free first-term EduLife alerts for ${who}: attendance, fees/payments & released results. No ads. Confirm: ${input.link}`;
}

function staffMessage(input: { schoolName: string; link: string }) {
  return `${input.schoolName}: EduLife work alerts cover lesson-note workflow & official appraisal activity. School-funded, no ads. Confirm: ${input.link}`;
}

export async function POST(req: NextRequest) {
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

  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return json(415, { ok: false, error: "CONTENT_TYPE_MUST_BE_JSON" });
  }

  const body = (await req.json().catch(() => ({}))) as Body;
  const audience = selectedAudience(body.audience);
  const requestedLimit = Number(body.limit ?? MAX_RECIPIENTS_PER_REQUEST);
  const limit = Math.min(
    Math.max(Number.isFinite(requestedLimit) ? Math.trunc(requestedLimit) : 50, 1),
    MAX_RECIPIENTS_PER_REQUEST,
  );
  const origin = essentialAlertPublicOrigin(req);
  const now = new Date();
  const ip = requestIp(req);
  const userAgent = req.headers.get("user-agent");

  const results: Array<{
    id: string;
    name: string;
    ok: boolean;
    skipped: boolean;
    coveredLearners?: number;
    reason?: string;
  }> = [];

  if (audience === "GUARDIANS") {
    const families = await buildGuardianFamilyEssentialAlertInvitationBatch({
      tenantId: auth.ctx.tenantId,
      limit,
      now,
    });

    for (const family of families) {
      try {
        if (family.inviteableChildren === 0) {
          const statuses = family.members.map((member) => member.existingStatus);
          results.push({
            id: family.seedStudentId,
            name: family.guardianName,
            ok: true,
            skipped: true,
            coveredLearners: family.totalChildren,
            reason: statuses.every((status) => status === "ENROLLED")
              ? "ALREADY_ENROLLED"
              : statuses.every((status) => status === "OPTED_OUT")
                ? "OPTED_OUT"
                : "RECENTLY_INVITED",
          });
          continue;
        }

        const attempt = await recordGuardianFamilyInvitationAttempt({
          tenantId: auth.ctx.tenantId,
          seedStudentId: family.seedStudentId,
          actorUserId: auth.ctx.userId,
          preparedFamily: family,
          now,
          ip,
          userAgent,
        });

        if (!attempt.allowed || !attempt.anchorRow) {
          results.push({
            id: family.seedStudentId,
            name: family.guardianName,
            ok: true,
            skipped: true,
            coveredLearners: family.totalChildren,
            reason: "NO_LONGER_INVITEABLE",
          });
          continue;
        }

        const code = signEssentialAlertCompactInvite({
          kind: "GUARDIAN",
          enrollmentId: attempt.anchorRow.id,
          invitationCount: attempt.anchorRow.invitationCount,
        });
        const link = `${origin}/a/${encodeURIComponent(code)}`;

        const sms = await sendSms({
          tenantId: auth.ctx.tenantId,
          actorId: auth.ctx.userId,
          to: attempt.family.to,
          message: guardianMessage({
            schoolName: family.schoolName,
            learnerCount: attempt.rows.length,
            link,
          }),
          from: ESSENTIAL_ALERT_POLICY.senderId,
          template: "ESSENTIAL_ALERT_GUARDIAN_INVITATION",
          payload: {
            purpose: "essential-alert-enrollment-invitation",
            recipientKind: "GUARDIAN",
            anchorStudentId: attempt.family.seedStudentId,
            coveredStudentIds: attempt.rows
              .map((row) => row.studentId)
              .filter((value): value is string => Boolean(value)),
            familyInvitation: true,
            shortLink: true,
            policyId: ESSENTIAL_ALERT_POLICY.policyId,
            policyVersion: ESSENTIAL_ALERT_POLICY.version,
          },
        });

        if (sms.ok) {
          await recordGuardianFamilyInvitationSent({
            attempts: attempt.rows.map((row) => ({
              enrollmentId: row.id,
              invitationCount: row.invitationCount,
            })),
            tenantId: auth.ctx.tenantId,
            actorUserId: auth.ctx.userId,
            now: new Date(),
            ip,
            userAgent,
          });
        }

        results.push({
          id: family.seedStudentId,
          name: family.guardianName,
          ok: Boolean(sms.ok),
          skipped: false,
          coveredLearners: attempt.rows.length,
          ...(sms.ok ? {} : { reason: sms.error ?? "SMS_NOT_ACCEPTED" }),
        });
      } catch (error) {
        results.push({
          id: family.seedStudentId,
          name: family.guardianName,
          ok: false,
          skipped: false,
          reason: error instanceof Error ? error.message : "INVITATION_FAILED",
        });
      }
    }
  } else {
    const memberships = await prisma.membership.findMany({
      where: { tenantId: auth.ctx.tenantId, status: "ACTIVE" },
      select: { userId: true, role: { select: { name: true } } },
      take: 2000,
    });

    const eligibleRoles = new Set(["TEACHER", "HEADTEACHER", "HEADMASTER"]);
    const seen = new Set<string>();

    for (const row of memberships) {
      if (results.length >= limit) break;
      const roleName = String(row.role?.name ?? "")
        .trim()
        .toUpperCase()
        .replace(/[\s-]+/g, "_");
      if (!eligibleRoles.has(roleName) || seen.has(row.userId)) continue;
      seen.add(row.userId);

      try {
        const invite = await buildStaffEssentialAlertInvitation({
          tenantId: auth.ctx.tenantId,
          userId: row.userId,
          now,
        });

        if (
          !invitationMayBeSent({
            existingStatus: invite.existingStatus,
            lastInvitationAttemptAt: invite.lastInvitationAttemptAt,
            lastInvitationSentAt: invite.lastInvitationSentAt,
            now,
          })
        ) {
          results.push({
            id: row.userId,
            name: invite.staffName,
            ok: true,
            skipped: true,
            reason:
              invite.existingStatus === "ENROLLED"
                ? "ALREADY_ENROLLED"
                : invite.existingStatus === "OPTED_OUT"
                  ? "OPTED_OUT"
                  : "RECENTLY_INVITED",
          });
          continue;
        }

        const attempt = await recordEssentialAlertInvitationAttempt({
          tenantId: auth.ctx.tenantId,
          kind: "STAFF",
          subjectId: row.userId,
          subjectKey: invite.subjectKey,
          phoneNorm: invite.to,
          phoneFingerprint: invite.phoneFingerprint,
          actorUserId: auth.ctx.userId,
          now,
          ip,
          userAgent,
        });

        if (!attempt.allowed || !attempt.row) {
          results.push({
            id: row.userId,
            name: invite.staffName,
            ok: true,
            skipped: true,
            reason: "NO_LONGER_INVITEABLE",
          });
          continue;
        }

        const code = signEssentialAlertCompactInvite({
          kind: "STAFF",
          enrollmentId: attempt.row.id,
          invitationCount: attempt.row.invitationCount,
        });
        const link = `${origin}/a/${encodeURIComponent(code)}`;

        const sms = await sendSms({
          tenantId: auth.ctx.tenantId,
          actorId: auth.ctx.userId,
          to: invite.to,
          message: staffMessage({ schoolName: invite.schoolName, link }),
          from: ESSENTIAL_ALERT_POLICY.senderId,
          template: "ESSENTIAL_ALERT_STAFF_INVITATION",
          payload: {
            purpose: "essential-alert-enrollment-invitation",
            recipientKind: "STAFF",
            userId: row.userId,
            shortLink: true,
            policyId: ESSENTIAL_ALERT_POLICY.policyId,
            policyVersion: ESSENTIAL_ALERT_POLICY.version,
          },
        });

        if (sms.ok) {
          await recordEssentialAlertInvitationSent({
            enrollmentId: attempt.row.id,
            tenantId: auth.ctx.tenantId,
            actorUserId: auth.ctx.userId,
            expectedInvitationCount: attempt.row.invitationCount,
            now: new Date(),
            ip,
            userAgent,
          });
        }

        results.push({
          id: row.userId,
          name: invite.staffName,
          ok: Boolean(sms.ok),
          skipped: false,
          ...(sms.ok ? {} : { reason: sms.error ?? "SMS_NOT_ACCEPTED" }),
        });
      } catch (error) {
        const skipReason = staffInvitationSkipReason(error);
        if (skipReason) {
          results.push({
            id: row.userId,
            name: "Staff member",
            ok: true,
            skipped: true,
            reason: skipReason,
          });
          continue;
        }

        results.push({
          id: row.userId,
          name: "Staff member",
          ok: false,
          skipped: false,
          reason: error instanceof Error ? error.message : "INVITATION_FAILED",
        });
      }
    }
  }

  const sent = results.filter((item) => item.ok && !item.skipped).length;
  const skipped = results.filter((item) => item.skipped).length;
  const failed = results.filter((item) => !item.ok && !item.skipped).length;
  const learnersCovered = results.reduce(
    (sum, item) => sum + (item.coveredLearners ?? 0),
    0,
  );

  return json(200, {
    ok: failed === 0,
    audience,
    brand: ESSENTIAL_ALERT_POLICY.senderId,
    policyId: ESSENTIAL_ALERT_POLICY.policyId,
    policyVersion: ESSENTIAL_ALERT_POLICY.version,
    count: results.length,
    sent,
    skipped,
    failed,
    ...(audience === "GUARDIANS" ? { learnersCovered } : {}),
    results,
  });
}
