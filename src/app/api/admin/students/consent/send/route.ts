// src/app/api/admin/students/consent/send/route.ts

import { NextRequest, NextResponse } from "next/server";
import { StudentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import { effectiveRole } from "@/lib/roleRouting";
import {
  getIpFromHeaders,
  getUserAgentFromHeaders,
  rateLimitCheck,
  rateLimitRecord,
} from "@/lib/rateLimit";
import { assertCanAccessClassroom } from "@/lib/teacherClassroomAccess";
import { sendSms } from "@/lib/sms";
import {
  buildGuardianEssentialAlertInvitation,
  buildGuardianFamilyEssentialAlertInvitation,
  recordEssentialAlertInvitationAttempt,
  recordEssentialAlertInvitationSent,
  recordGuardianFamilyInvitationAttempt,
  recordGuardianFamilyInvitationSent,
} from "@/lib/essentialAlerts/enrollment";
import { ESSENTIAL_ALERT_POLICY } from "@/lib/essentialAlerts/policy";
import { signEssentialAlertCompactInvite } from "@/lib/essentialAlerts/tokens";
import { essentialAlertPublicOrigin } from "@/lib/essentialAlerts/publicPage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(status: number, payload: unknown) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function isAdminLike(roleName: unknown) {
  const r = effectiveRole(roleName);
  return r === "SUPERADMIN" || r === "SCHOOL_ADMIN" || r === "HEADTEACHER";
}

type Body = { studentId?: string };

export async function POST(req: NextRequest) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["SCHOOL_ADMIN", "HEADTEACHER", "TEACHER", "SUPERADMIN"],
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
    select: { status: true, role: { select: { name: true } } },
  });

  if (!membership || membership.status !== "ACTIVE") {
    return json(403, { ok: false, error: "FORBIDDEN" });
  }

  const roleName = effectiveRole(membership.role?.name ?? ctx.roleName);
  if (roleName !== "TEACHER" && !isAdminLike(roleName)) {
    return json(403, { ok: false, error: "FORBIDDEN" });
  }

  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return json(415, { ok: false, error: "CONTENT_TYPE_MUST_BE_JSON" });
  }

  const body = (await req.json().catch(() => ({}))) as Body;
  const studentId = String(body.studentId ?? "").trim();
  if (!studentId) {
    return json(400, { ok: false, error: "STUDENT_ID_REQUIRED" });
  }

  const student = await prisma.student.findFirst({
    where: { id: studentId, tenantId: ctx.tenantId },
    select: {
      id: true,
      status: true,
      classroomId: true,
    },
  });

  if (!student) return json(404, { ok: false, error: "NOT_FOUND" });
  if (student.status !== StudentStatus.ACTIVE) {
    return json(409, { ok: false, error: "STUDENT_NOT_ACTIVE" });
  }

  // A classroom Teacher may invite only the learner they are authorized to
  // access. Family-wide invitations are reserved for school leadership so a
  // Teacher cannot cause enrollment records to be created outside their class.
  if (roleName === "TEACHER") {
    const classroomId = String(student.classroomId ?? "").trim();
    if (!classroomId) {
      return json(403, { ok: false, error: "FORBIDDEN_NO_CLASSROOM" });
    }
    await assertCanAccessClassroom({
      userId: ctx.userId,
      tenantId: ctx.tenantId,
      classroomId,
    });
  }

  const ip = getIpFromHeaders(req.headers);
  const userAgent = getUserAgentFromHeaders(req.headers);

  const perStudent = await rateLimitCheck({
    action: "CONSENT_SMS_SEND",
    key: `student:${ctx.tenantId}:${studentId}`,
    limit: 2,
    windowSeconds: 24 * 60 * 60,
  });
  if (!perStudent.ok) {
    return json(429, {
      ok: false,
      error: "RATE_LIMITED_STUDENT",
      retryAfterSeconds: perStudent.retryAfterSeconds,
    });
  }

  const perActor = await rateLimitCheck({
    action: "CONSENT_SMS_SEND",
    key: `actor:${ctx.tenantId}:${ctx.userId}`,
    limit: 30,
    windowSeconds: 60 * 60,
  });
  if (!perActor.ok) {
    return json(429, {
      ok: false,
      error: "RATE_LIMITED_ACTOR",
      retryAfterSeconds: perActor.retryAfterSeconds,
    });
  }

  await rateLimitRecord({
    action: "CONSENT_SMS_SEND",
    key: `student:${ctx.tenantId}:${studentId}`,
    ip,
    userAgent,
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    metadata: { studentId },
  });
  await rateLimitRecord({
    action: "CONSENT_SMS_SEND",
    key: `actor:${ctx.tenantId}:${ctx.userId}`,
    ip,
    userAgent,
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    metadata: { studentId },
  });

  const now = new Date();
  const origin = essentialAlertPublicOrigin(req);

  try {
    if (roleName === "TEACHER") {
      const invite = await buildGuardianEssentialAlertInvitation({
        tenantId: ctx.tenantId,
        studentId,
        now,
      });
      const attempt = await recordEssentialAlertInvitationAttempt({
        tenantId: ctx.tenantId,
        kind: "GUARDIAN",
        subjectId: studentId,
        subjectKey: invite.subjectKey,
        phoneNorm: invite.to,
        phoneFingerprint: invite.phoneFingerprint,
        actorUserId: ctx.userId,
        now,
        ip,
        userAgent,
      });

      if (!attempt.allowed || !attempt.row) {
        return json(409, { ok: false, error: "NO_LONGER_INVITEABLE" });
      }

      const code = signEssentialAlertCompactInvite({
        kind: "GUARDIAN",
        enrollmentId: attempt.row.id,
        invitationCount: attempt.row.invitationCount,
      });
      const link = `${origin}/a/${encodeURIComponent(code)}`;
      const text = `${invite.guardianName}, ${invite.schoolName}: Free first-term EduLife alerts for ${invite.childName}: attendance, fees/payments & released results. No ads. Enable: ${link}`;

      const sms = await sendSms({
        tenantId: ctx.tenantId,
        actorId: ctx.userId,
        to: invite.to,
        message: text,
        from: ESSENTIAL_ALERT_POLICY.senderId,
        template: "ESSENTIAL_ALERT_GUARDIAN_INVITATION",
        payload: {
          purpose: "essential-alert-enrollment-invitation",
          recipientKind: "GUARDIAN",
          studentId,
          policyId: ESSENTIAL_ALERT_POLICY.policyId,
          policyVersion: ESSENTIAL_ALERT_POLICY.version,
          familyInvitation: false,
        },
      });

      if (!sms.ok) {
        return json(502, {
          ok: false,
          error: sms.error ?? "SMS_NOT_ACCEPTED",
          providerAccepted: false,
        });
      }

      await recordEssentialAlertInvitationSent({
        enrollmentId: attempt.row.id,
        tenantId: ctx.tenantId,
        actorUserId: ctx.userId,
        expectedInvitationCount: attempt.row.invitationCount,
        now: new Date(),
        ip,
        userAgent,
      });

      return json(200, {
        ok: true,
        studentId,
        learnersCovered: 1,
        to: invite.to,
        link,
        text,
        brand: ESSENTIAL_ALERT_POLICY.senderId,
        healthConsentChanged: false,
        legacySmsOptInChanged: false,
      });
    }

    const invite = await buildGuardianFamilyEssentialAlertInvitation({
      tenantId: ctx.tenantId,
      studentId,
      now,
    });
    const attempt = await recordGuardianFamilyInvitationAttempt({
      tenantId: ctx.tenantId,
      seedStudentId: studentId,
      actorUserId: ctx.userId,
      now,
      ip,
      userAgent,
    });

    if (!attempt.allowed || !attempt.anchorRow) {
      return json(409, { ok: false, error: "NO_LONGER_INVITEABLE" });
    }

    const code = signEssentialAlertCompactInvite({
      kind: "GUARDIAN",
      enrollmentId: attempt.anchorRow.id,
      invitationCount: attempt.anchorRow.invitationCount,
    });
    const link = `${origin}/a/${encodeURIComponent(code)}`;
    const text = `${attempt.family.guardianName}, ${invite.schoolName}: Free first-term EduLife alerts for ${attempt.rows.length} ${attempt.rows.length === 1 ? "learner" : "learners"}: attendance, fees/payments & released results. No ads. Enable: ${link}`;

    const sms = await sendSms({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      to: attempt.family.to,
      message: text,
      from: ESSENTIAL_ALERT_POLICY.senderId,
      template: "ESSENTIAL_ALERT_GUARDIAN_INVITATION",
      payload: {
        purpose: "essential-alert-enrollment-invitation",
        recipientKind: "GUARDIAN",
        studentId,
        familyInvitation: true,
        familyLearnerCount: attempt.family.totalChildren,
        invitedLearnerCount: attempt.rows.length,
        policyId: ESSENTIAL_ALERT_POLICY.policyId,
        policyVersion: ESSENTIAL_ALERT_POLICY.version,
      },
    });

    if (!sms.ok) {
      return json(502, {
        ok: false,
        error: sms.error ?? "SMS_NOT_ACCEPTED",
        providerAccepted: false,
      });
    }

    await recordGuardianFamilyInvitationSent({
      attempts: attempt.rows.map((row) => ({
        enrollmentId: row.id,
        invitationCount: row.invitationCount,
      })),
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      now: new Date(),
      ip,
      userAgent,
    });

    return json(200, {
      ok: true,
      studentId,
      learnersCovered: attempt.rows.length,
      familyLearners: attempt.family.totalChildren,
      to: attempt.family.to,
      link,
      text,
      brand: ESSENTIAL_ALERT_POLICY.senderId,
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
        error instanceof Error
          ? error.message
          : "ESSENTIAL_ALERT_INVITATION_FAILED",
    });
  }
}
