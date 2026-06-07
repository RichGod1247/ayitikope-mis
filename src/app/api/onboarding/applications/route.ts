// src/app/api/onboarding/applications/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import {
  GovernanceOfficerRole,
  OnboardingApplicationType,
  SchoolSector,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeGhPhoneE164 } from "@/lib/phoneNormGH";
import {
  getIpFromHeaders,
  getUserAgentFromHeaders,
  rateLimitCheck,
  rateLimitRecord,
} from "@/lib/rateLimit";

type Body = {
  type?: string;

  applicantName?: string;
  applicantTitle?: string;

  email?: string;
  phone?: string;

  schoolName?: string;
  schoolSector?: string;
  officialId?: string;
  gpsAddress?: string;
  region?: string;
  district?: string;
  circuit?: string;

  governanceRole?: string;
  zoneId?: string;
  title?: string;

  notes?: string;
  source?: string;
};

const WINDOW_SECONDS = 10 * 60;
const LIMIT_PER_IP = Number(process.env.ONBOARDING_APPLICATION_LIMIT_PER_IP_10M || 20);

const GOVERNANCE_ROLES = new Set<string>([
  "SISSO",
  "CIRCUIT_SUPERVISOR",
  "DISTRICT_DIRECTOR",
  "DISTRICT_MIS_OFFICER",
  "DISTRICT_SHEP_OFFICER",
  "DISTRICT_ASSESSMENT_OFFICER",
  "REGIONAL_VIEWER",
]);

function json(status: number, payload: unknown) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function cleanEmail(value: unknown) {
  return clean(value).toLowerCase();
}

function normOfficialId(value: unknown) {
  return clean(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function isEmailLike(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function typeFrom(value: unknown): OnboardingApplicationType | null {
  const t = clean(value).toUpperCase();

  if (t === "SCHOOL") return OnboardingApplicationType.SCHOOL;
  if (t === "GOVERNANCE_OFFICER") return OnboardingApplicationType.GOVERNANCE_OFFICER;

  return null;
}

function schoolSectorFrom(value: unknown): SchoolSector {
  return clean(value).toUpperCase() === "PRIVATE" ? SchoolSector.PRIVATE : SchoolSector.PUBLIC;
}

function roleZoneLevel(role: string) {
  if (role === "SISSO" || role === "CIRCUIT_SUPERVISOR") return 1;

  if (
    role === "DISTRICT_DIRECTOR" ||
    role === "DISTRICT_MIS_OFFICER" ||
    role === "DISTRICT_SHEP_OFFICER" ||
    role === "DISTRICT_ASSESSMENT_OFFICER"
  ) {
    return 2;
  }

  if (role === "REGIONAL_VIEWER") return 3;

  return null;
}

export async function POST(req: NextRequest) {
  const ip = getIpFromHeaders(req.headers);
  const userAgent = getUserAgentFromHeaders(req.headers);
  const ipKey = ip ? `onboardingApplication:ip:${ip}` : null;

  if (ipKey) {
    const limit = await rateLimitCheck({
      action: "ONBOARDING_APPLICATION_SUBMIT",
      key: ipKey,
      limit: LIMIT_PER_IP,
      windowSeconds: WINDOW_SECONDS,
    });

    if (!limit.ok) {
      return json(429, {
        ok: false,
        error: "RATE_LIMITED",
        retryAfterSeconds: limit.retryAfterSeconds,
      });
    }
  }

  const body = (await req.json().catch(() => ({}))) as Body;

  const type = typeFrom(body.type);
  const email = clean(body.email);
  const emailNorm = cleanEmail(body.email);
  const phoneRaw = clean(body.phone);
  const phoneNorm = phoneRaw ? normalizeGhPhoneE164(phoneRaw) : null;

  if (!type) return json(400, { ok: false, error: "INVALID_APPLICATION_TYPE" });

  if (!emailNorm || !isEmailLike(emailNorm)) {
    return json(400, { ok: false, error: "VALID_EMAIL_REQUIRED" });
  }

  if (phoneRaw && !phoneNorm) {
    return json(400, { ok: false, error: "BAD_PHONE" });
  }

  const applicantName = clean(body.applicantName);
  const applicantTitle = clean(body.applicantTitle);
  const officialId = clean(body.officialId);
  const officialIdNorm = normOfficialId(body.officialId);
  const notes = clean(body.notes);

  if (type === OnboardingApplicationType.SCHOOL) {
    const schoolName = clean(body.schoolName);
    const schoolSector = schoolSectorFrom(body.schoolSector);

    if (!schoolName) {
      return json(400, { ok: false, error: "SCHOOL_NAME_REQUIRED" });
    }

    if (!officialIdNorm) {
      return json(400, { ok: false, error: "OFFICIAL_SCHOOL_IDENTIFIER_REQUIRED" });
    }

    const duplicate = await prisma.onboardingApplication.findFirst({
      where: {
        type,
        status: { in: ["PENDING", "UNDER_REVIEW"] },
        OR: [{ emailNorm }, { officialIdNorm }],
      },
      select: { id: true, status: true },
    });

    if (duplicate) {
      return json(409, {
        ok: false,
        error: "DUPLICATE_PENDING_APPLICATION",
        applicationId: duplicate.id,
        status: duplicate.status,
      });
    }

    const app = await prisma.onboardingApplication.create({
      data: {
        type,
        email,
        emailNorm,
        phone: phoneRaw || null,
        phoneNorm,
        applicantName: applicantName || null,
        applicantTitle: applicantTitle || null,
        schoolName,
        schoolSector,
        officialId,
        officialIdNorm,
        gpsAddress: clean(body.gpsAddress) || null,
        region: clean(body.region) || null,
        district: clean(body.district) || null,
        circuit: clean(body.circuit) || null,
        notes: notes || null,
        source: clean(body.source) || "PUBLIC_SCHOOL_APPLICATION",
        ip,
        userAgent,
        metadata: {
          capturedFrom: "public_onboarding_application_api",
        },
      },
      select: {
        id: true,
        type: true,
        status: true,
        createdAt: true,
      },
    });

    if (ipKey) {
      await rateLimitRecord({
        action: "ONBOARDING_APPLICATION_SUBMIT",
        key: ipKey,
        ip,
        userAgent,
        metadata: { type, applicationId: app.id, emailNorm },
      });
    }

    return json(201, {
      ok: true,
      application: {
        ...app,
        createdAt: app.createdAt.toISOString(),
      },
    });
  }

  const role = clean(body.governanceRole).toUpperCase();

  if (!GOVERNANCE_ROLES.has(role)) {
    return json(400, { ok: false, error: "INVALID_GOVERNANCE_ROLE" });
  }

  const zoneId = clean(body.zoneId);
  if (!zoneId) return json(400, { ok: false, error: "ZONE_ID_REQUIRED" });

  if (!applicantName) {
    return json(400, { ok: false, error: "APPLICANT_NAME_REQUIRED" });
  }

  if (!officialIdNorm) {
    return json(400, { ok: false, error: "OFFICIAL_OFFICER_IDENTIFIER_REQUIRED" });
  }

  const zone = await prisma.adminZone.findUnique({
    where: { id: zoneId },
    select: {
      id: true,
      name: true,
      isActive: true,
      zoneType: { select: { name: true, level: true } },
      parentZone: { select: { id: true, name: true } },
    },
  });

  if (!zone || !zone.isActive) {
    return json(404, { ok: false, error: "ZONE_NOT_FOUND_OR_INACTIVE" });
  }

  const expectedLevel = roleZoneLevel(role);
  if (!expectedLevel || zone.zoneType.level !== expectedLevel) {
    return json(400, {
      ok: false,
      error: "ROLE_ZONE_MISMATCH",
      role,
      expectedZoneLevel: expectedLevel,
      actualZoneLevel: zone.zoneType.level,
    });
  }

  const duplicate = await prisma.onboardingApplication.findFirst({
    where: {
      type,
      status: { in: ["PENDING", "UNDER_REVIEW"] },
      OR: [
        { emailNorm },
        {
          governanceRole: role as GovernanceOfficerRole,
          zoneId,
          officialIdNorm,
        },
      ],
    },
    select: { id: true, status: true },
  });

  if (duplicate) {
    return json(409, {
      ok: false,
      error: "DUPLICATE_PENDING_APPLICATION",
      applicationId: duplicate.id,
      status: duplicate.status,
    });
  }

  const app = await prisma.onboardingApplication.create({
    data: {
      type,
      email,
      emailNorm,
      phone: phoneRaw || null,
      phoneNorm,
      applicantName,
      applicantTitle: applicantTitle || null,
      officialId,
      officialIdNorm,
      governanceRole: role as GovernanceOfficerRole,
      zoneId,
      title: clean(body.title) || applicantTitle || null,
      notes: notes || null,
      source: clean(body.source) || "PUBLIC_GOVERNANCE_OFFICER_APPLICATION",
      ip,
      userAgent,
      metadata: {
        capturedFrom: "public_onboarding_application_api",
        zoneName: zone.name,
        zoneType: zone.zoneType.name,
        zoneLevel: zone.zoneType.level,
        parentZoneName: zone.parentZone?.name ?? null,
      },
    },
    select: {
      id: true,
      type: true,
      status: true,
      createdAt: true,
    },
  });

  if (ipKey) {
    await rateLimitRecord({
      action: "ONBOARDING_APPLICATION_SUBMIT",
      key: ipKey,
      ip,
      userAgent,
      metadata: { type, applicationId: app.id, emailNorm, role, zoneId },
    });
  }

  return json(201, {
    ok: true,
    application: {
      ...app,
      createdAt: app.createdAt.toISOString(),
    },
  });
}