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
    select: { status: true, consentedAt: true, optedOutAt: true },
  });

  return { payload, student, enrollment };
}

function errorPage(code: string, status = 400) {
  return essentialAlertPage({
    title: "Essential Alerts link",
    status,
    bodyHtml: `
      <h1>This link cannot be used</h1>
      <p>The link may have expired, the school record may have changed, or the guardian phone may have been updated.</p>
      <div class="notice"><span class="strong">What to do:</span> ask the school for a fresh Essential School Alerts invitation.</div>
      <p class="muted">Reference: ${escapeHtml(code)}</p>
    `,
  });
}

export async function GET(req: NextRequest) {
  const token = String(new URL(req.url).searchParams.get("token") ?? "").trim();
  if (!token) return errorPage("MISSING_TOKEN");

  const resolved = await contextForToken(token);
  if ("error" in resolved) {
    return errorPage(resolved.error ?? "INVALID_OR_EXPIRED_LINK");
  }

  const childName =
    [resolved.student.firstName, resolved.student.lastName]
      .map((value) => String(value ?? "").trim())
      .filter(Boolean)
      .join(" ") || "your child";
  const guardian = resolved.student.guardianName || "Parent/Guardian";
  const status = resolved.enrollment?.status ?? null;

  const stateHtml =
    status === EssentialAlertEnrollmentStatus.ENROLLED
      ? `<div class="good"><span class="strong">Alerts are enabled.</span> You can change this preference below.</div>`
      : status === EssentialAlertEnrollmentStatus.OPTED_OUT
        ? `<div class="notice"><span class="strong">Alerts are currently off.</span> You may enable them again below.</div>`
        : "";

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
      <p>If a paid continuation is introduced later, EduLife OS will give at least ${ESSENTIAL_ALERT_POLICY.paidContinuationNoticeDays} days' notice. Nothing will be charged automatically.</p>
      <p class="muted">Health information and health consent are separate and are not changed by this choice.</p>
      ${stateHtml}
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
  if (!contentType.includes("application/x-www-form-urlencoded") && !contentType.includes("multipart/form-data")) {
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
        ? String((error as { code?: unknown }).code ?? "ESSENTIAL_ALERT_UPDATE_FAILED")
        : "ESSENTIAL_ALERT_UPDATE_FAILED";
    return errorPage(code, 409);
  }

  return essentialAlertPage({
    title: decision === "ENABLE" ? "Alerts enabled" : "Alerts stopped",
    bodyHtml:
      decision === "ENABLE"
        ? `<h1>You're all set</h1><div class="good"><span class="strong">Important school alerts are enabled.</span></div><p>You can now receive EduLife OS attendance, fees/payment and released-result alerts for this child. No advertising.</p><p class="muted">Health consent was not changed.</p>`
        : `<h1>Preference saved</h1><div class="notice"><span class="strong">SMS alerts are stopped for this child.</span></div><p>The school can continue to provide information through EduLife OS and its normal channels.</p><p class="muted">You may ask the school for a fresh link if you later choose to enable alerts again.</p>`,
  });
}
