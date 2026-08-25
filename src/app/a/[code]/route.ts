import type { NextRequest } from "next/server";
import {
  applyEssentialAlertCompactDecision,
  resolveEssentialAlertCompactInvitation,
  type EssentialAlertCompactInvitationContext,
} from "@/lib/essentialAlerts/enrollment";
import { ESSENTIAL_ALERT_POLICY } from "@/lib/essentialAlerts/policy";
import {
  escapeHtml,
  essentialAlertPage,
  requestIp,
} from "@/lib/essentialAlerts/publicPage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ code: string }> | { code: string };
};

function formatDate(value: Date | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Accra",
  }).format(value);
}

function terminalPage(input: {
  title: string;
  heading: string;
  body: string;
  tone?: "good" | "notice" | "danger";
  status?: number;
}) {
  const tone = input.tone ?? "notice";
  return essentialAlertPage({
    title: input.title,
    status: input.status,
    bodyHtml: `
      <h1>${escapeHtml(input.heading)}</h1>
      <div class="${tone}">${input.body}</div>
      <p class="muted">If you need to change this choice later, ask the school for a fresh Essential School Alerts invitation.</p>
    `,
  });
}

function unavailableState(context: EssentialAlertCompactInvitationContext) {
  switch (context.state) {
    case "USED_ENABLED":
      return terminalPage({
        title: "Alerts already enabled",
        heading: "Alerts are already enabled",
        tone: "good",
        body: `<span class="strong">Important school alerts are already enabled.</span>`,
      });
    case "USED_DECLINED":
      return terminalPage({
        title: "Alerts already stopped",
        heading: "SMS alerts are already stopped",
        body: `<span class="strong">SMS alerts are currently stopped.</span>`,
      });
    case "EXPIRED":
      return terminalPage({
        title: "Invitation expired",
        heading: "This invitation has expired",
        body: `For safety, Essential School Alerts invitations expire after ${ESSENTIAL_ALERT_POLICY.invitationTtlDays} days. Ask the school for a fresh link.`,
      });
    case "SUPERSEDED":
      return terminalPage({
        title: "Newer invitation available",
        heading: "Use the newest invitation",
        body: `The school sent a newer Essential School Alerts invitation, so this older link is no longer valid.`,
      });
    case "PHONE_CHANGED":
      return terminalPage({
        title: "Contact details changed",
        heading: "This invitation cannot be used",
        body: `The current school contact number no longer matches the number bound to this invitation. Ask the school for a fresh link.`,
      });
    case "POLICY_VERSION_MISMATCH":
      return terminalPage({
        title: "Fresh invitation required",
        heading: "The alert policy has changed",
        body: `For your protection, please use a new invitation that shows the current Essential School Alerts terms.`,
      });
    case "NOT_SENT":
      return terminalPage({
        title: "Invitation unavailable",
        heading: "This invitation is not active",
        body: `The invitation was not confirmed as sent. Ask the school for a fresh Essential School Alerts link.`,
      });
    case "UNAVAILABLE":
      return terminalPage({
        title: "Invitation unavailable",
        heading: "This invitation cannot be used",
        body: `The school or recipient record is no longer available for this invitation.`,
      });
    default:
      return null;
  }
}

function guardianReadyPage(
  code: string,
  context: Extract<EssentialAlertCompactInvitationContext, { kind: "GUARDIAN" }>,
) {
  const invitedChildren = context.children.filter((child) => child.includedInInvitation);
  const childList = context.children
    .map((child) => {
      const note = child.includedInInvitation
        ? "Included in this decision"
        : child.enrollmentStatus === "ENROLLED"
          ? "Already enabled"
          : child.enrollmentStatus === "OPTED_OUT"
            ? "Previously stopped — unchanged"
            : "Not included in this invitation";
      return `<li><span class="strong">${escapeHtml(child.name)}</span><br/><span class="muted">${escapeHtml(note)}</span></li>`;
    })
    .join("");

  return essentialAlertPage({
    title: "Stay informed by SMS",
    bodyHtml: `
      <h1>Stay informed by SMS</h1>
      <p>Dear <span class="strong">${escapeHtml(context.guardianName)}</span>, ${escapeHtml(context.schoolName)} can send useful EduLife OS alerts for your children listed below.</p>
      <ul class="people">${childList}</ul>
      <ul>
        <li>Attendance alerts</li>
        <li>Fees and payment information</li>
        <li>Released results</li>
      </ul>
      <div class="good"><span class="strong">Your first school term is free.</span> No advertising.</div>
      <p>If a paid continuation is introduced later, EduLife OS will give at least ${ESSENTIAL_ALERT_POLICY.paidContinuationNoticeDays} days&apos; notice. Nothing will be charged automatically.</p>
      <p class="muted">This invitation covers ${invitedChildren.length} ${invitedChildren.length === 1 ? "learner" : "learners"} and expires ${escapeHtml(formatDate(context.expiresAt))}.</p>
      <form method="post" action="">
        <input type="hidden" name="code" value="${escapeHtml(code)}" />
        <div class="row">
          <button class="primary" type="submit" name="decision" value="ENABLE">Enable important school alerts</button>
          <button class="outline" type="submit" name="decision" value="DECLINE">No thanks / Stop these SMS alerts</button>
        </div>
      </form>
    `,
  });
}

function staffReadyPage(
  code: string,
  context: Extract<EssentialAlertCompactInvitationContext, { kind: "STAFF" }>,
) {
  return essentialAlertPage({
    title: "Important work alerts",
    bodyHtml: `
      <h1>Important work alerts</h1>
      <p>Dear <span class="strong">${escapeHtml(context.staffName)}</span>, ${escapeHtml(context.schoolName)} can send EduLife OS work alerts for:</p>
      <ul><li>Lesson-note workflow</li><li>Official appraisal activity</li></ul>
      <div class="good"><span class="strong">These work alerts are provided through your institution.</span> You are not personally charged for them.</div>
      <p>No advertising. You can stop SMS alerts anytime.</p>
      <p class="muted">This invitation expires ${escapeHtml(formatDate(context.expiresAt))}.</p>
      <form method="post" action="">
        <input type="hidden" name="code" value="${escapeHtml(code)}" />
        <div class="row">
          <button class="primary" type="submit" name="decision" value="ENABLE">Enable important work alerts</button>
          <button class="outline" type="submit" name="decision" value="DECLINE">No thanks / Stop SMS alerts</button>
        </div>
      </form>
    `,
  });
}

async function codeFromContext(context: RouteContext) {
  const params = await Promise.resolve(context.params);
  return String(params?.code ?? "").trim();
}

export async function GET(_req: NextRequest, context: RouteContext) {
  const code = await codeFromContext(context);
  if (!code) {
    return terminalPage({
      title: "Invalid invitation",
      heading: "This link cannot be used",
      body: `The Essential School Alerts invitation is missing or invalid.`,
      tone: "danger",
      status: 400,
    });
  }

  const resolved = await resolveEssentialAlertCompactInvitation({ code });
  if (!resolved) {
    return terminalPage({
      title: "Invalid invitation",
      heading: "This link cannot be used",
      body: `The invitation is invalid or has been changed. Ask the school for a fresh link.`,
      tone: "danger",
      status: 400,
    });
  }

  if (resolved.state !== "READY") {
    return unavailableState(resolved) ?? terminalPage({
      title: "Invitation unavailable",
      heading: "This link cannot be used",
      body: `Ask the school for a fresh Essential School Alerts invitation.`,
      status: 409,
    });
  }

  return resolved.kind === "GUARDIAN"
    ? guardianReadyPage(code, resolved)
    : staffReadyPage(code, resolved);
}

export async function POST(req: NextRequest, context: RouteContext) {
  const contentType = req.headers.get("content-type") || "";
  if (
    !contentType.includes("application/x-www-form-urlencoded") &&
    !contentType.includes("multipart/form-data")
  ) {
    return terminalPage({
      title: "Invalid request",
      heading: "This request cannot be processed",
      body: `Please open the invitation link and use the buttons shown on that page.`,
      status: 415,
    });
  }

  const routeCode = await codeFromContext(context);
  const form = await req.formData().catch(() => null);
  const formCode = String(form?.get("code") ?? "").trim();
  const code = routeCode && formCode === routeCode ? routeCode : "";
  const decision = String(form?.get("decision") ?? "").trim();

  if (!code) {
    return terminalPage({
      title: "Invalid invitation",
      heading: "This link cannot be used",
      body: `The invitation reference is invalid.`,
      tone: "danger",
      status: 400,
    });
  }
  if (decision !== "ENABLE" && decision !== "DECLINE") {
    return terminalPage({
      title: "Invalid choice",
      heading: "Choose one of the available options",
      body: `Open the invitation again and select Enable or No thanks.`,
      status: 400,
    });
  }

  const before = await resolveEssentialAlertCompactInvitation({ code });
  if (!before) {
    return terminalPage({
      title: "Invalid invitation",
      heading: "This link cannot be used",
      body: `The invitation is invalid or has been changed.`,
      tone: "danger",
      status: 400,
    });
  }
  if (before.state !== "READY") {
    return unavailableState(before) ?? terminalPage({
      title: "Invitation unavailable",
      heading: "This link cannot be used",
      body: `Ask the school for a fresh Essential School Alerts invitation.`,
      status: 409,
    });
  }

  try {
    await applyEssentialAlertCompactDecision({
      code,
      decision,
      ip: requestIp(req),
      userAgent: req.headers.get("user-agent"),
    });
  } catch (error) {
    const resolved = await resolveEssentialAlertCompactInvitation({ code }).catch(
      () => null,
    );
    if (resolved && resolved.state !== "READY") {
      return unavailableState(resolved) ?? terminalPage({
        title: "Invitation unavailable",
        heading: "This link cannot be used",
        body: `Ask the school for a fresh Essential School Alerts invitation.`,
        status: 409,
      });
    }

    const codeValue =
      error && typeof error === "object" && "code" in error
        ? String((error as { code?: unknown }).code ?? "ESSENTIAL_ALERT_UPDATE_FAILED")
        : "ESSENTIAL_ALERT_UPDATE_FAILED";
    return terminalPage({
      title: "Could not save choice",
      heading: "Your choice was not saved",
      body: `Ask the school for a fresh invitation and try again.<br/><span class="muted">Reference: ${escapeHtml(codeValue)}</span>`,
      tone: "danger",
      status: 409,
    });
  }

  const isGuardian = before.kind === "GUARDIAN";

  return essentialAlertPage({
    title: decision === "ENABLE" ? "Alerts enabled" : "Alerts stopped",
    bodyHtml:
      decision === "ENABLE"
        ? `<h1>You&apos;re all set</h1><div class="good"><span class="strong">${isGuardian ? "Important school alerts" : "Important work alerts"} are enabled.</span></div><p>${isGuardian ? "EduLife OS can now send attendance, fees/payment and released-result alerts for the learners covered by this invitation." : "EduLife OS can now send lesson-note workflow and official appraisal SMS alerts to your current school contact number."}</p>`
        : `<h1>Preference saved</h1><div class="notice"><span class="strong">SMS alerts covered by this invitation are stopped.</span></div><p>${isGuardian ? "The school can continue to provide information through EduLife OS and its normal channels." : "In-app workflow remains available."}</p>`,
  });
}
