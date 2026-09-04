import {
  EssentialAlertEnrollmentError,
  buildStaffEssentialAlertInvitation,
  invitationMayBeSent,
  recordEssentialAlertInvitationAttempt,
  recordEssentialAlertInvitationSent,
} from "@/lib/essentialAlerts/enrollment";
import { ESSENTIAL_ALERT_POLICY } from "@/lib/essentialAlerts/policy";
import { essentialAlertPublicOrigin } from "@/lib/essentialAlerts/publicPage";
import { signEssentialAlertCompactInvite } from "@/lib/essentialAlerts/tokens";
import { sendSms } from "@/lib/sms";

export function staffEssentialAlertInvitationMessage(input: {
  schoolName: string;
  link: string;
}) {
  return `${input.schoolName}: EduLife work alerts cover lesson-note workflow & official appraisal activity. School-funded, no ads. Confirm: ${input.link}`;
}

function skipReason(input: {
  existingStatus: string | null;
}) {
  if (input.existingStatus === "ENROLLED") return "ALREADY_ENROLLED";
  if (input.existingStatus === "OPTED_OUT") return "OPTED_OUT";
  return "RECENTLY_INVITED";
}

export async function deliverStaffEssentialAlertInvitationAfterWelcome(input: {
  req: Request;
  tenantId: string;
  userId: string;
  actorUserId: string;
  ip?: string | null;
  userAgent?: string | null;
}) {
  try {
    const origin = essentialAlertPublicOrigin(input.req);
    const now = new Date();
    const invite = await buildStaffEssentialAlertInvitation({
      tenantId: input.tenantId,
      userId: input.userId,
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
      return {
        ok: true,
        skipped: true,
        reason: skipReason({ existingStatus: invite.existingStatus }),
      } as const;
    }

    const attempt = await recordEssentialAlertInvitationAttempt({
      tenantId: input.tenantId,
      kind: "STAFF",
      subjectId: input.userId,
      subjectKey: invite.subjectKey,
      phoneNorm: invite.to,
      phoneFingerprint: invite.phoneFingerprint,
      actorUserId: input.actorUserId,
      now,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    });

    if (!attempt.allowed || !attempt.row) {
      return { ok: true, skipped: true, reason: "NO_LONGER_INVITEABLE" } as const;
    }

    const code = signEssentialAlertCompactInvite({
      kind: "STAFF",
      enrollmentId: attempt.row.id,
      invitationCount: attempt.row.invitationCount,
    });
    const link = `${origin}/a/${encodeURIComponent(code)}`;

    const sms = await sendSms({
      tenantId: input.tenantId,
      actorId: input.actorUserId,
      to: invite.to,
      message: staffEssentialAlertInvitationMessage({
        schoolName: invite.schoolName,
        link,
      }),
      from: ESSENTIAL_ALERT_POLICY.senderId,
      template: "ESSENTIAL_ALERT_STAFF_INVITATION",
      payload: {
        purpose: "essential-alert-enrollment-invitation",
        recipientKind: "STAFF",
        userId: input.userId,
        shortLink: true,
        policyId: ESSENTIAL_ALERT_POLICY.policyId,
        policyVersion: ESSENTIAL_ALERT_POLICY.version,
        triggeredAfterWelcome: true,
        consentGranted: false,
      },
    });

    if (sms.ok) {
      await recordEssentialAlertInvitationSent({
        enrollmentId: attempt.row.id,
        tenantId: input.tenantId,
        actorUserId: input.actorUserId,
        expectedInvitationCount: attempt.row.invitationCount,
        now: new Date(),
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
      });
    }

    return {
      ok: Boolean(sms.ok),
      skipped: false,
      reason: sms.ok ? null : sms.error ?? "SMS_NOT_ACCEPTED",
    } as const;
  } catch (error) {
    if (error instanceof EssentialAlertEnrollmentError) {
      return {
        ok: false,
        skipped: error.code === "ESSENTIAL_ALERT_STAFF_PHONE_MISSING",
        reason: error.code,
      } as const;
    }

    return {
      ok: false,
      skipped: false,
      reason: error instanceof Error ? error.message : "ESSENTIAL_ALERT_INVITATION_FAILED",
    } as const;
  }
}
