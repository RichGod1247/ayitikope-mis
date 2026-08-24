import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import { effectiveRole } from "@/lib/roleRouting";
import { sendSms } from "@/lib/sms";
import {
  buildGuardianEssentialAlertInvitation,
  buildStaffEssentialAlertInvitation,
  invitationMayBeSent,
  recordEssentialAlertInvitationAttempt,
  recordEssentialAlertInvitationSent,
} from "@/lib/essentialAlerts/enrollment";
import { ESSENTIAL_ALERT_POLICY } from "@/lib/essentialAlerts/policy";
import { requestIp } from "@/lib/essentialAlerts/publicPage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ALLOWED_ROLES = new Set(["HEADTEACHER", "SCHOOL_ADMIN", "SUPERADMIN"]);
const MAX_RECIPIENTS_PER_REQUEST = 300;

type Audience = "GUARDIANS" | "STAFF";

type Body = {
  audience?: Audience;
  limit?: number;
};

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

function baseUrl(req: NextRequest) {
  const env =
    process.env.NEXTAUTH_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_BASE_URL;
  if (env) return env.replace(/\/+$/, "");

  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!host) throw new Error("ESSENTIAL_ALERT_BASE_URL_UNAVAILABLE");
  return `${proto}://${host}`;
}

function guardianMessage(input: {
  schoolName: string;
  childName: string;
  link: string;
}) {
  return `${input.schoolName}: Free first-term EduLife alerts for ${input.childName}: attendance, fees/payments & released results. No ads. Enable: ${input.link}`;
}

function staffMessage(input: {
  schoolName: string;
  link: string;
}) {
  return `${input.schoolName}: EduLife work alerts cover lesson-note workflow & official appraisal activity. School-funded, no ads. Enable: ${input.link}`;
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
  const origin = baseUrl(req);
  const now = new Date();
  const ip = requestIp(req);
  const userAgent = req.headers.get("user-agent");

  const results: Array<{
    id: string;
    name: string;
    ok: boolean;
    skipped: boolean;
    reason?: string;
  }> = [];

  if (audience === "GUARDIANS") {
    const students = await prisma.student.findMany({
      where: {
        tenantId: auth.ctx.tenantId,
        status: "ACTIVE",
        OR: [
          { guardianPhoneNorm: { not: null } },
          { guardianPhone: { not: null } },
        ],
      },
      select: { id: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      take: Math.min(limit * 3, 1000),
    });

    for (const student of students) {
      if (results.length >= limit) break;

      try {
        const invite = await buildGuardianEssentialAlertInvitation({
          tenantId: auth.ctx.tenantId,
          studentId: student.id,
          now,
        });

        if (
          !invitationMayBeSent({
            existingStatus: invite.existingStatus,
            lastInvitationSentAt: invite.lastInvitationSentAt,
            now,
          })
        ) {
          results.push({
            id: student.id,
            name: invite.childName,
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
          kind: "GUARDIAN",
          subjectId: student.id,
          subjectKey: invite.subjectKey,
          phoneNorm: invite.to,
          phoneFingerprint: invite.phoneFingerprint,
          actorUserId: auth.ctx.userId,
          now,
          ip,
          userAgent,
        });

        if (!attempt.allowed) {
          results.push({
            id: student.id,
            name: invite.childName,
            ok: true,
            skipped: true,
            reason: "NO_LONGER_INVITEABLE",
          });
          continue;
        }

        const link = `${origin}/api/consent/optin/student/link?token=${encodeURIComponent(invite.token)}`;
        const sms = await sendSms({
          tenantId: auth.ctx.tenantId,
          actorId: auth.ctx.userId,
          to: invite.to,
          message: guardianMessage({
            schoolName: invite.schoolName,
            childName: invite.childName,
            link,
          }),
          from: ESSENTIAL_ALERT_POLICY.senderId,
          template: "ESSENTIAL_ALERT_GUARDIAN_INVITATION",
          payload: {
            purpose: "essential-alert-enrollment-invitation",
            recipientKind: "GUARDIAN",
            studentId: student.id,
            policyId: ESSENTIAL_ALERT_POLICY.policyId,
            policyVersion: ESSENTIAL_ALERT_POLICY.version,
          },
        });

        if (sms.ok) {
          await recordEssentialAlertInvitationSent({
            enrollmentId: attempt.row.id,
            tenantId: auth.ctx.tenantId,
            actorUserId: auth.ctx.userId,
            now: new Date(),
            ip,
            userAgent,
          });
        }

        results.push({
          id: student.id,
          name: invite.childName,
          ok: Boolean(sms.ok),
          skipped: false,
          ...(sms.ok ? {} : { reason: sms.error ?? "SMS_NOT_ACCEPTED" }),
        });
      } catch (error) {
        results.push({
          id: student.id,
          name: "Learner",
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

        if (!attempt.allowed) {
          results.push({
            id: row.userId,
            name: invite.staffName,
            ok: true,
            skipped: true,
            reason: "NO_LONGER_INVITEABLE",
          });
          continue;
        }

        const link = `${origin}/api/consent/optin/teacher/link?token=${encodeURIComponent(invite.token)}`;
        const sms = await sendSms({
          tenantId: auth.ctx.tenantId,
          actorId: auth.ctx.userId,
          to: invite.to,
          message: staffMessage({
            schoolName: invite.schoolName,
            link,
          }),
          from: ESSENTIAL_ALERT_POLICY.senderId,
          template: "ESSENTIAL_ALERT_STAFF_INVITATION",
          payload: {
            purpose: "essential-alert-enrollment-invitation",
            recipientKind: "STAFF",
            userId: row.userId,
            policyId: ESSENTIAL_ALERT_POLICY.policyId,
            policyVersion: ESSENTIAL_ALERT_POLICY.version,
          },
        });

        if (sms.ok) {
          await recordEssentialAlertInvitationSent({
            enrollmentId: attempt.row.id,
            tenantId: auth.ctx.tenantId,
            actorUserId: auth.ctx.userId,
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
    results,
  });
}
