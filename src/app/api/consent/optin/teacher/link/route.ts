import type { NextRequest } from "next/server";
import { EssentialAlertEnrollmentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  normalizeGhanaPhone,
  staffSubjectKey,
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

const STAFF_ROLES = new Set(["TEACHER", "HEADTEACHER", "HEADMASTER"]);

function role(value: unknown) {
  return String(value ?? "").trim().toUpperCase().replace(/[\s-]+/g, "_");
}

async function contextForToken(token: string) {
  const payload = verifyEssentialAlertToken(token);
  if (!payload || payload.kind !== "STAFF" || !payload.uid) {
    return { error: "INVALID_OR_EXPIRED_LINK" as const };
  }

  const membership = await prisma.membership.findFirst({
    where: {
      tenantId: payload.tid,
      userId: payload.uid,
      status: "ACTIVE",
      tenant: { status: "ACTIVE" },
    },
    select: {
      role: { select: { name: true } },
      tenant: { select: { name: true } },
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          phoneNorm: true,
        },
      },
    },
  });

  if (!membership || !STAFF_ROLES.has(role(membership.role?.name))) {
    return { error: "STAFF_MEMBERSHIP_UNAVAILABLE" as const };
  }

  const profile = await prisma.teacherProfile
    .findUnique({
      where: {
        teacherProfile_tenant_user_unique: {
          tenantId: payload.tid,
          userId: payload.uid,
        },
      },
      select: { phone: true },
    })
    .catch(() => null);

  const phoneNorm =
    normalizeGhanaPhone(membership.user.phoneNorm) ??
    normalizeGhanaPhone(membership.user.phone) ??
    normalizeGhanaPhone(profile?.phone);
  if (!phoneNorm) return { error: "STAFF_PHONE_UNAVAILABLE" as const };

  const fingerprint = essentialAlertPhoneFingerprint({
    tenantId: payload.tid,
    kind: "STAFF",
    subjectId: payload.uid,
    phoneNorm,
  });
  if (fingerprint !== payload.pf) {
    return { error: "STAFF_PHONE_CHANGED" as const };
  }

  const subjectKey = staffSubjectKey(payload.uid, fingerprint);
  const enrollment = await prisma.essentialAlertEnrollment.findUnique({
    where: {
      tenantId_subjectKey: {
        tenantId: payload.tid,
        subjectKey,
      },
    },
    select: { status: true },
  });

  return { payload, membership, enrollment };
}

function errorPage(code: string, status = 400) {
  return essentialAlertPage({
    title: "Essential work alerts",
    status,
    bodyHtml: `<h1>This link cannot be used</h1><p>The invitation may have expired or your contact details may have changed.</p><div class="notice">Ask your school for a fresh Essential School Alerts invitation.</div><p class="muted">Reference: ${escapeHtml(code)}</p>`,
  });
}

export async function GET(req: NextRequest) {
  const token = String(new URL(req.url).searchParams.get("token") ?? "").trim();
  if (!token) return errorPage("MISSING_TOKEN");

  const resolved = await contextForToken(token);
  if ("error" in resolved) {
    return errorPage(resolved.error ?? "INVALID_OR_EXPIRED_LINK");
  }

  const name = resolved.membership.user.name || resolved.membership.user.email || "Staff member";
  const state = resolved.enrollment?.status ?? null;
  const stateHtml =
    state === EssentialAlertEnrollmentStatus.ENROLLED
      ? `<div class="good"><span class="strong">Work alerts are enabled.</span></div>`
      : state === EssentialAlertEnrollmentStatus.OPTED_OUT
        ? `<div class="notice"><span class="strong">Work alerts are currently off.</span></div>`
        : "";

  return essentialAlertPage({
    title: "Important work alerts",
    bodyHtml: `
      <h1>Important work alerts</h1>
      <p>Dear <span class="strong">${escapeHtml(name)}</span>, ${escapeHtml(resolved.membership.tenant.name)} can send EduLife OS work alerts for:</p>
      <ul><li>Lesson-note workflow</li><li>Official appraisal activity</li></ul>
      <div class="good"><span class="strong">These work alerts are provided through your institution.</span> You are not personally charged for them.</div>
      <p>No advertising. You can stop SMS alerts anytime.</p>
      <p class="muted">This choice does not include health or wellbeing consent.</p>
      ${stateHtml}
      <form method="post" action="">
        <input type="hidden" name="token" value="${escapeHtml(token)}" />
        <div class="row">
          <button class="primary" type="submit" name="decision" value="ENABLE">Enable important work alerts</button>
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

  if (!payload || payload.kind !== "STAFF") return errorPage("INVALID_OR_EXPIRED_LINK");
  if (decision !== "ENABLE" && decision !== "DECLINE") return errorPage("INVALID_DECISION");

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
    title: decision === "ENABLE" ? "Work alerts enabled" : "Work alerts stopped",
    bodyHtml:
      decision === "ENABLE"
        ? `<h1>You're all set</h1><div class="good"><span class="strong">Important work alerts are enabled.</span></div><p>EduLife OS can now send lesson-note workflow and official appraisal SMS alerts to your current school contact number.</p>`
        : `<h1>Preference saved</h1><div class="notice"><span class="strong">SMS work alerts are stopped.</span></div><p>In-app workflow remains available. Ask your school for a fresh invitation if you later choose to re-enable SMS alerts.</p>`,
  });
}
