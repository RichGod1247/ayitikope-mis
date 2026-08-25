import type { NextRequest } from "next/server";
import { EssentialAlertEnrollmentStatus, StudentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  ESSENTIAL_ALERT_POLICY,
  guardianSubjectKey,
  normalizeGhanaPhone,
} from "@/lib/essentialAlerts/policy";
import {
  essentialAlertPhoneFingerprint,
  verifyEssentialAlertToken,
} from "@/lib/essentialAlerts/tokens";
import { applyEssentialAlertTokenDecision } from "@/lib/essentialAlerts/enrollment";
import {
  escapeHtml,
  essentialAlertPage,
  requestIp,
} from "@/lib/essentialAlerts/publicPage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ATTEMPT_TOLERANCE_MS = 5_000;

async function contextForToken(token: string) {
  const payload = verifyEssentialAlertToken(token);
  if (!payload || payload.kind !== "GUARDIAN" || !payload.sid) {
    return { error: "INVALID_OR_EXPIRED_LINK" as const };
  }

  const student = await prisma.student.findFirst({
    where: {
      id: payload.sid,
      tenantId: payload.tid,
      status: StudentStatus.ACTIVE,
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      guardianName: true,
      guardianPhone: true,
      guardianPhoneNorm: true,
      tenant: { select: { name: true, status: true } },
    },
  });

  if (!student || student.tenant.status !== "ACTIVE") {
    return { error: "LEARNER_OR_SCHOOL_UNAVAILABLE" as const };
  }

  const phoneNorm =
    normalizeGhanaPhone(student.guardianPhoneNorm) ??
    normalizeGhanaPhone(student.guardianPhone);
  if (!phoneNorm) return { error: "GUARDIAN_PHONE_UNAVAILABLE" as const };

  const fingerprint = essentialAlertPhoneFingerprint({
    tenantId: payload.tid,
    kind: "GUARDIAN",
    subjectId: student.id,
    phoneNorm,
  });
  if (fingerprint !== payload.pf) {
    return { error: "GUARDIAN_PHONE_CHANGED" as const };
  }

  const subjectKey = guardianSubjectKey(student.id, fingerprint);
  const enrollment = await prisma.essentialAlertEnrollment.findUnique({
    where: {
      tenantId_subjectKey: {
        tenantId: payload.tid,
        subjectKey,
      },
    },
    select: {
      status: true,
      policyVersion: true,
      consentedAt: true,
      optedOutAt: true,
      lastInvitationAttemptAt: true,
      lastInvitationSentAt: true,
    },
  });

  if (!enrollment) return { error: "INVITATION_NOT_FOUND" as const };
  if (enrollment.policyVersion !== ESSENTIAL_ALERT_POLICY.version) {
    return { error: "POLICY_VERSION_CHANGED" as const };
  }
  if (!enrollment.lastInvitationSentAt) {
    return { error: "INVITATION_NOT_SENT" as const };
  }
  if (
    !enrollment.lastInvitationAttemptAt ||
    Math.abs(enrollment.lastInvitationAttemptAt.getTime() - payload.iat * 1000) >
      ATTEMPT_TOLERANCE_MS
  ) {
    return { error: "INVITATION_SUPERSEDED" as const };
  }

  return { payload, student, enrollment };
}

function errorPage(code: string, status = 400) {
  return essentialAlertPage({
    title: "Essential Alerts link",
    status,
    bodyHtml: `
      <h1>This link cannot be used</h1>
      <p>The link may have expired, been replaced by a newer invitation, or the school record/contact number may have changed.</p>
      <div class="notice"><span class="strong">What to do:</span> ask the school for a fresh Essential School Alerts invitation.</div>
      <p class="muted">Reference: ${escapeHtml(code)}</p>
    `,
  });
}

function usedPage(status: EssentialAlertEnrollmentStatus) {
  const enabled = status === EssentialAlertEnrollmentStatus.ENROLLED;
  return essentialAlertPage({
    title: enabled ? "Alerts already enabled" : "Alerts already stopped",
    bodyHtml: enabled
      ? `<h1>Alerts are already enabled</h1><div class="good"><span class="strong">Important school alerts are already enabled.</span></div><p class="muted">Ask the school for a fresh invitation if you later want to change this preference.</p>`
      : `<h1>SMS alerts are already stopped</h1><div class="notice"><span class="strong">SMS alerts are currently stopped.</span></div><p class="muted">Ask the school for a fresh invitation if you later want to enable alerts.</p>`,
  });
}

export async function GET(req: NextRequest) {
  const token = String(new URL(req.url).searchParams.get("token") ?? "").trim();
  if (!token) return errorPage("MISSING_TOKEN");

  const resolved = await contextForToken(token);
  if ("error" in resolved) {
    return errorPage(resolved.error ?? "INVALID_OR_EXPIRED_LINK");
  }

  if (resolved.enrollment.status !== EssentialAlertEnrollmentStatus.INVITED) {
    return usedPage(resolved.enrollment.status);
  }

  const childName =
    [resolved.student.firstName, resolved.student.lastName]
      .map((value) => String(value ?? "").trim())
      .filter(Boolean)
      .join(" ") || "your child";
  const guardian = resolved.student.guardianName || "Parent/Guardian";

  return essentialAlertPage({
    title: "Stay informed by SMS",
    bodyHtml: `
      <h1>Stay informed by SMS</h1>
      <p>Dear <span class="strong">${escapeHtml(guardian)}</span>, ${escapeHtml(resolved.student.tenant.name)} can send useful EduLife OS alerts about <span class="strong">${escapeHtml(childName)}</span>.</p>
      <ul>
        <li>Attendance alerts</li>
        <li>Fees and payment information</li>
        <li>Released results</li>
      </ul>
      <div class="good"><span class="strong">Your first school term is free.</span> No advertising.</div>
      <p>If a paid continuation is introduced later, EduLife OS will give at least ${ESSENTIAL_ALERT_POLICY.paidContinuationNoticeDays} days&apos; notice. Nothing will be charged automatically.</p>
      <form method="post" action="">
        <input type="hidden" name="token" value="${escapeHtml(token)}" />
        <div class="row">
          <button class="primary" type="submit" name="decision" value="ENABLE">Enable important school alerts</button>
          <button class="outline" type="submit" name="decision" value="DECLINE">No thanks / Stop SMS alerts</button>
        </div>
      </form>
    `,
  });
}

export async function POST(req: NextRequest) {
  const contentType = req.headers.get("content-type") || "";
  if (
    !contentType.includes("application/x-www-form-urlencoded") &&
    !contentType.includes("multipart/form-data")
  ) {
    return errorPage("FORM_REQUIRED", 415);
  }

  const form = await req.formData().catch(() => null);
  const token = String(form?.get("token") ?? "").trim();
  const decision = String(form?.get("decision") ?? "").trim();

  const payload = verifyEssentialAlertToken(token);
  if (!payload || payload.kind !== "GUARDIAN") {
    return errorPage("INVALID_OR_EXPIRED_LINK");
  }
  if (decision !== "ENABLE" && decision !== "DECLINE") {
    return errorPage("INVALID_DECISION");
  }

  const before = await contextForToken(token);
  if ("error" in before) {
    return errorPage(before.error ?? "INVALID_OR_EXPIRED_LINK", 409);
  }
  if (before.enrollment.status !== EssentialAlertEnrollmentStatus.INVITED) {
    return usedPage(before.enrollment.status);
  }

  try {
    await applyEssentialAlertTokenDecision({
      token: payload,
      decision,
      ip: requestIp(req),
      userAgent: req.headers.get("user-agent"),
    });
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String(
            (error as { code?: unknown }).code ??
              "ESSENTIAL_ALERT_UPDATE_FAILED",
          )
        : "ESSENTIAL_ALERT_UPDATE_FAILED";
    return errorPage(code, 409);
  }

  return essentialAlertPage({
    title: decision === "ENABLE" ? "Alerts enabled" : "Alerts stopped",
    bodyHtml:
      decision === "ENABLE"
        ? `<h1>You&apos;re all set</h1><div class="good"><span class="strong">Important school alerts are enabled.</span></div><p>You can now receive EduLife OS attendance, fees/payment and released-result alerts covered by this invitation. No advertising.</p>`
        : `<h1>Preference saved</h1><div class="notice"><span class="strong">SMS alerts are stopped for this invitation.</span></div><p>The school can continue to provide information through EduLife OS and its normal channels.</p>`,
  });
}
