// src/lib/governance/inviteDelivery.ts
import { sendEmail } from "@/lib/email/sendEmail";
import { sendViaHubtel } from "@/lib/sms/hubtel";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function roleLabel(role: string) {
  if (role === "SISSO") return "SISSO";
  if (role === "CIRCUIT_SUPERVISOR") return "Circuit Supervisor";
  if (role === "DISTRICT_DIRECTOR") return "District Director";
  if (role === "DISTRICT_MIS_OFFICER") return "District MIS Officer";
  if (role === "DISTRICT_SHEP_OFFICER") return "District SHEP Officer";
  if (role === "DISTRICT_ASSESSMENT_OFFICER") {
    return "District Assessment Officer";
  }
  if (role === "REGIONAL_VIEWER") return "Regional Viewer";

  return role.split("_").join(" ");
}

export async function deliverGovernanceOfficerInvite(params: {
  email: string;
  phone?: string | null;
  role: string;
  title?: string | null;
  zoneName: string;
  zoneTypeName: string;
  inviteUrl: string;
  expiresAt: Date | string;
  actorId?: string | null;
  inviteId?: string | null;
  source: string;
}) {
  const email = clean(params.email);
  const phone = clean(params.phone);
  const role = roleLabel(clean(params.role));
  const title = clean(params.title) || role;
  const zoneName = clean(params.zoneName);
  const zoneTypeName = clean(params.zoneTypeName);
  const inviteUrl = clean(params.inviteUrl);

  const expiresAt =
    params.expiresAt instanceof Date
      ? params.expiresAt.toISOString()
      : clean(params.expiresAt);

  const delivery: {
    email: unknown;
    sms: unknown;
  } = {
    email: null,
    sms: null,
  };

  if (email) {
    delivery.email = await sendEmail({
      to: email,
      subject: `EduLife OS governance invite: ${title}`,
      text:
        `Hello,\n\n` +
        `You have been invited to EduLife OS as ${title} for ${zoneName} (${zoneTypeName}).\n\n` +
        `Use this secure link to accept your invite and activate your dashboard access:\n\n` +
        `${inviteUrl}\n\n` +
        `This invite expires at: ${expiresAt}\n\n` +
        `EduLife OS gives you a clean command view for school risk, attendance signals, official notices, and accountability evidence.\n`,
      meta: {
        category: "GOVERNANCE_OFFICER_INVITE",
        inviteId: params.inviteId ?? null,
        role: params.role,
        zoneName,
        source: params.source,
      },
    });
  }

  if (phone) {
    try {
      delivery.sms = await sendViaHubtel({
        to: phone,
        body:
          `EduLifeOS invite: You have been invited as ${role} for ${zoneName}. ` +
          `Accept here: ${inviteUrl}`,
        brand: "EDULIFEOS",
        tenantId: undefined,
        actorId: params.actorId ?? undefined,
        meta: {
          category: "GOVERNANCE_OFFICER_INVITE",
          inviteId: params.inviteId ?? null,
          role: params.role,
          zoneName,
          source: params.source,
        },
      });
    } catch (err) {
      delivery.sms = {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  return delivery;
}

export async function sendGovernanceOfficerWelcomeSms(params: {
  phone?: string | null;
  role: string;
  zoneName: string;
  actorId?: string | null;
  assignmentId?: string | null;
}) {
  const phone = clean(params.phone);

  if (!phone) {
    return { ok: false, skipped: true, reason: "NO_PHONE" };
  }

  const role = roleLabel(clean(params.role));
  const zoneName = clean(params.zoneName);

  try {
    return await sendViaHubtel({
      to: phone,
      body:
        `Welcome to EduLife OS. Your ${role} access is active. ` +
        `You can now monitor ${zoneName} risk, attendance, official notices, and accountability evidence.`,
      brand: "EDULIFEOS",
      tenantId: undefined,
      actorId: params.actorId ?? undefined,
      meta: {
        category: "GOVERNANCE_OFFICER_WELCOME",
        role: params.role,
        zoneName,
        assignmentId: params.assignmentId ?? null,
      },
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}