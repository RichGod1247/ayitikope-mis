import { sendEmail } from "@/lib/email/sendEmail";
import { sendViaHubtel } from "@/lib/sms/hubtel";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function roleLabel(role: string) {
  if (role === "SISSO" || role === "CIRCUIT_SUPERVISOR") return "SISSO";
  if (role === "DISTRICT_DIRECTOR") return "District Director";
  if (role === "HEAD_OF_SUPERVISION") return "Head of Supervision";
  if (role === "BASIC_SCHOOL_COORDINATOR") return "Basic School Coordinator";
  if (role === "DISTRICT_MIS_OFFICER") return "District MIS Officer";
  if (role === "DISTRICT_SHEP_OFFICER") return "District SHEP Officer";
  if (role === "DISTRICT_ASSESSMENT_OFFICER") {
    return "District Assessment Officer";
  }
  if (role === "REGIONAL_VIEWER") return "Regional Viewer";

  return role.split("_").join(" ");
}

function welcomeGreetingName(value: unknown) {
  const name = clean(value);
  return name ? `, ${name}` : "";
}

function welcomeJurisdictionText(params: {
  role: string;
  zoneName: string;
  districtName?: string | null;
  circuitName?: string | null;
}) {
  const role = clean(params.role);
  const zoneName = clean(params.zoneName);
  const districtName = clean(params.districtName);
  const circuitName = clean(params.circuitName);

  if (role === "SISSO" || role === "CIRCUIT_SUPERVISOR") {
    if (circuitName && districtName) {
      return {
        access: `${roleLabel(role)} access for ${circuitName}, ${districtName}`,
        welcome: `${districtName} works with EduLife OS`,
      };
    }

    if (circuitName) {
      return {
        access: `${roleLabel(role)} access for ${circuitName}`,
        welcome: `${circuitName} uses EduLife OS`,
      };
    }
  }

  if (districtName) {
    return {
      access: `${roleLabel(role)} access for ${districtName}`,
      welcome: `${districtName} works with EduLife OS`,
    };
  }

  return {
    access: `${roleLabel(role)} access for ${zoneName}`,
    welcome: `${zoneName} uses EduLife OS`,
  };
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
        `EduLife OS gives you controlled access to the governance work assigned to your office.\n`,
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

export async function deliverGovernanceOfficerWelcome(params: {
  email?: string | null;
  phone?: string | null;
  name?: string | null;
  role: string;
  zoneName: string;
  districtName?: string | null;
  circuitName?: string | null;
  actorId?: string | null;
  assignmentId?: string | null;
}) {
  const email = clean(params.email);
  const phone = clean(params.phone);
  const role = clean(params.role);
  const zoneName = clean(params.zoneName);
  const districtName = clean(params.districtName);
  const circuitName = clean(params.circuitName);
  const greetingName = welcomeGreetingName(params.name);
  const jurisdiction = welcomeJurisdictionText({
    role,
    zoneName,
    districtName,
    circuitName,
  });

  const delivery: {
    email: unknown;
    sms: unknown;
  } = {
    email: null,
    sms: null,
  };

  if (email) {
    try {
      delivery.email = await sendEmail({
        to: email,
        subject: `Welcome to EduLife OS — ${roleLabel(role)}`,
        text:
          `Hello${greetingName},\n\n` +
          `Welcome to EduLife OS. Your ${jurisdiction.access} is now active.\n\n` +
          `We are glad to have you with us as ${jurisdiction.welcome} to strengthen school support, supervision, accountability, and service.\n\n` +
          `Sign in to EduLife OS to open the governance work assigned to your office.\n`,
        idempotencyKey: params.assignmentId
          ? `governance-officer-welcome:${params.assignmentId}`
          : undefined,
        meta: {
          category: "GOVERNANCE_OFFICER_WELCOME",
          role: params.role,
          zoneName,
          districtName: districtName || null,
          circuitName: circuitName || null,
          assignmentId: params.assignmentId ?? null,
        },
      });
    } catch (err) {
      delivery.email = {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  if (phone) {
    try {
      delivery.sms = await sendViaHubtel({
        to: phone,
        body:
          `Welcome to EduLife OS${greetingName}. Your ${jurisdiction.access} is active. ` +
          `We're glad to have you as ${jurisdiction.welcome}.`,
        brand: "EDULIFEOS",
        tenantId: undefined,
        actorId: params.actorId ?? undefined,
        meta: {
          category: "GOVERNANCE_OFFICER_WELCOME",
          role: params.role,
          zoneName,
          districtName: districtName || null,
          circuitName: circuitName || null,
          assignmentId: params.assignmentId ?? null,
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
  const delivery = await deliverGovernanceOfficerWelcome({
    phone: params.phone,
    role: params.role,
    zoneName: params.zoneName,
    actorId: params.actorId,
    assignmentId: params.assignmentId,
  });

  return delivery.sms;
}
