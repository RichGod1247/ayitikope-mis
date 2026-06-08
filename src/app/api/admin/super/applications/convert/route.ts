// src/app/api/admin/super/applications/convert/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { createHash, randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  GovernanceOfficerRole,
  OnboardingApplicationType,
  Prisma,
  SchoolSector,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import { getIpFromHeaders, getUserAgentFromHeaders } from "@/lib/rateLimit";
import { buildPublicUrl } from "@/lib/publicUrl";
import { deliverGovernanceOfficerInvite } from "@/lib/governance/inviteDelivery";

type Body = {
  applicationId?: string;
  expiresInDays?: number;
  reason?: string;
};

class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

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

function sha256Hex(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function newToken() {
  return randomBytes(32).toString("base64url");
}

function jsonSafe(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

function randomCode(len = 6) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(len);
  let out = "";

  for (let i = 0; i < len; i += 1) {
    out += alphabet[bytes[i] % alphabet.length];
  }

  return out;
}

function slugify(value: string) {
  return clean(value)
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

function validExpiresInDays(value: unknown) {
  const raw = Number(value ?? 7);

  if (!Number.isFinite(raw)) return 7;
  if (raw < 1) return 1;
  if (raw > 30) return 30;

  return Math.floor(raw);
}

function requireReason(value: unknown) {
  const reason = clean(value);

  if (reason.length < 10) {
    throw new ApiError(400, "CONVERSION_REASON_TOO_SHORT");
  }

  if (reason.length > 1000) {
    throw new ApiError(400, "CONVERSION_REASON_TOO_LONG");
  }

  return reason;
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

async function reserveSchoolIdentity(
  tx: Prisma.TransactionClient,
  schoolName: string
) {
  const baseSlug = slugify(schoolName) || "school";

  for (let i = 0; i < 25; i += 1) {
    const reservedSchoolCode = `SCH-${randomCode(6)}`;
    const reservedSlug = `${baseSlug}-${randomCode(4).toLowerCase()}`;

    const [codeInTenant, codeInInvite, slugInTenant, slugInInvite] =
      await Promise.all([
        tx.tenant.findUnique({
          where: { schoolCode: reservedSchoolCode },
          select: { id: true },
        }),
        tx.tenantBootstrapInvite.findUnique({
          where: { reservedSchoolCode },
          select: { id: true },
        }),
        tx.tenant.findUnique({
          where: { slug: reservedSlug },
          select: { id: true },
        }),
        tx.tenantBootstrapInvite.findFirst({
          where: { reservedSlug },
          select: { id: true },
        }),
      ]);

    if (!codeInTenant && !codeInInvite && !slugInTenant && !slugInInvite) {
      return { reservedSchoolCode, reservedSlug };
    }
  }

  throw new ApiError(409, "COULD_NOT_RESERVE_SCHOOL_IDENTITY");
}

export async function POST(req: NextRequest) {
  const auth = await requireApiUserContext(req, {
    requireTenant: false,
    requireRoleNames: ["SUPERADMIN"],
  });

  if (!auth.ok) return auth.res;

  const ip = getIpFromHeaders(req.headers);
  const userAgent = getUserAgentFromHeaders(req.headers);

  try {
    const body = (await req.json().catch(() => ({}))) as Body;

    const applicationId = clean(body.applicationId);
    const reason = requireReason(body.reason);
    const expiresInDays = validExpiresInDays(body.expiresInDays);
    const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);

    if (!applicationId) {
      return json(400, { ok: false, error: "APPLICATION_ID_REQUIRED" });
    }

    const result = await prisma.$transaction(async (tx) => {
      const app = await tx.onboardingApplication.findUnique({
        where: { id: applicationId },
      });

      if (!app) {
        throw new ApiError(404, "APPLICATION_NOT_FOUND");
      }

      if (app.status !== "PENDING" && app.status !== "UNDER_REVIEW") {
        throw new ApiError(409, "APPLICATION_NOT_CONVERTIBLE");
      }

      if (app.type === OnboardingApplicationType.SCHOOL) {
        if (!app.schoolName) {
          throw new ApiError(400, "APPLICATION_MISSING_SCHOOL_NAME");
        }

        if (!app.emailNorm) {
          throw new ApiError(400, "APPLICATION_MISSING_EMAIL");
        }

        const token = newToken();
        const tokenHash = sha256Hex(token);
        const identity = await reserveSchoolIdentity(tx, app.schoolName);
        const schoolSector = app.schoolSector ?? SchoolSector.PUBLIC;

        const invite = await tx.tenantBootstrapInvite.create({
          data: {
            tokenHash,
            schoolName: app.schoolName,
            schoolSector,
            contactEmail: app.emailNorm,
            contactPhone: app.phone,
            contactPhoneNorm: app.phoneNorm,
            reservedSlug: identity.reservedSlug,
            reservedSchoolCode: identity.reservedSchoolCode,
            expiresAt,
            createdByUserId: auth.ctx.userId,
          },
          select: {
            id: true,
            schoolName: true,
            schoolSector: true,
            contactEmail: true,
            reservedSlug: true,
            reservedSchoolCode: true,
            expiresAt: true,
            createdAt: true,
          },
        });

        await tx.onboardingApplication.update({
          where: { id: app.id },
          data: {
            status: "CONVERTED",
            reviewedByUserId: auth.ctx.userId,
            reviewedAt: new Date(),
            reviewReason: reason,
            convertedByUserId: auth.ctx.userId,
            convertedAt: new Date(),
            convertedTenantBootstrapInviteId: invite.id,
          },
        });

        await tx.auditLog.create({
          data: {
            userId: auth.ctx.userId,
            action: "ONBOARDING_APPLICATION_CONVERTED_TO_SCHOOL_INVITE",
            resource: "OnboardingApplication",
            resourceId: app.id,
            ip,
            userAgent,
            metadata: {
              applicationId: app.id,
              tenantBootstrapInviteId: invite.id,
              schoolName: app.schoolName,
              schoolSector,
              emailNorm: app.emailNorm,
              reservedSchoolCode: invite.reservedSchoolCode,
              reservedSlug: invite.reservedSlug,
              reason,
            },
          },
        });

        return {
          type: "SCHOOL" as const,
          invite,
          inviteUrl: buildPublicUrl(
            `/tenant/enroll?token=${encodeURIComponent(token)}`,
            req
          ),
        };
      }

      const role = app.governanceRole;
      const zoneId = app.zoneId;

      if (!role) {
        throw new ApiError(400, "APPLICATION_MISSING_GOVERNANCE_ROLE");
      }

      if (!zoneId) {
        throw new ApiError(400, "APPLICATION_MISSING_ZONE");
      }

      if (!app.emailNorm) {
        throw new ApiError(400, "APPLICATION_MISSING_EMAIL");
      }

      const zone = await tx.adminZone.findUnique({
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
        throw new ApiError(404, "ZONE_NOT_FOUND_OR_INACTIVE");
      }

      const expectedLevel = roleZoneLevel(String(role));

      if (!expectedLevel || zone.zoneType.level !== expectedLevel) {
        throw new ApiError(400, "ROLE_ZONE_MISMATCH");
      }

      await tx.governanceOfficerInvite.updateMany({
        where: {
          emailNorm: app.emailNorm,
          zoneId,
          role,
          status: "PENDING",
          acceptedAt: null,
          revokedAt: null,
        },
        data: {
          status: "REVOKED",
          revokedAt: new Date(),
          revokedByUserId: auth.ctx.userId,
          metadata: {
            reason: "Superseded by onboarding application conversion.",
            onboardingApplicationId: app.id,
          },
        },
      });

      const token = newToken();
      const tokenHash = sha256Hex(token);

      const invite = await tx.governanceOfficerInvite.create({
        data: {
          email: app.email,
          emailNorm: app.emailNorm,
          phone: app.phone,
          phoneNorm: app.phoneNorm,
          tokenHash,
          role: role as GovernanceOfficerRole,
          zoneId,
          status: "PENDING",
          expiresAt,
          createdByUserId: auth.ctx.userId,
          metadata: {
            title: app.title || app.applicantTitle || null,
            source: "ONBOARDING_APPLICATION_CONVERSION",
            onboardingApplicationId: app.id,
            applicantName: app.applicantName,
            applicantTitle: app.applicantTitle,
            officialId: app.officialId,
            reason,
            zoneName: zone.name,
            zoneType: zone.zoneType.name,
            zoneLevel: zone.zoneType.level,
            parentZoneName: zone.parentZone?.name ?? null,
          },
        },
        select: {
          id: true,
          email: true,
          phone: true,
          phoneNorm: true,
          role: true,
          zoneId: true,
          expiresAt: true,
          createdAt: true,
        },
      });

      await tx.onboardingApplication.update({
        where: { id: app.id },
        data: {
          status: "CONVERTED",
          reviewedByUserId: auth.ctx.userId,
          reviewedAt: new Date(),
          reviewReason: reason,
          convertedByUserId: auth.ctx.userId,
          convertedAt: new Date(),
          convertedGovernanceOfficerInviteId: invite.id,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: auth.ctx.userId,
          action: "ONBOARDING_APPLICATION_CONVERTED_TO_GOVERNANCE_INVITE",
          resource: "OnboardingApplication",
          resourceId: app.id,
          ip,
          userAgent,
          metadata: {
            applicationId: app.id,
            governanceOfficerInviteId: invite.id,
            emailNorm: app.emailNorm,
            role,
            zoneId,
            zoneName: zone.name,
            reason,
          },
        },
      });

      return {
        type: "GOVERNANCE_OFFICER" as const,
        invite: {
          ...invite,
          title: app.title || app.applicantTitle || null,
          zoneName: zone.name,
          zoneType: zone.zoneType.name,
          zoneTypeName: zone.zoneType.name,
        },
        inviteUrl: buildPublicUrl(
          `/governance/invite/${encodeURIComponent(token)}`,
          req
        ),
      };
    });

    const delivery =
      result.type === "GOVERNANCE_OFFICER"
        ? await deliverGovernanceOfficerInvite({
            email: result.invite.email,
            phone: result.invite.phoneNorm || result.invite.phone || null,
            role: String(result.invite.role),
            title: result.invite.title,
            zoneName: result.invite.zoneName,
            zoneTypeName: result.invite.zoneTypeName,
            inviteUrl: result.inviteUrl,
            expiresAt: result.invite.expiresAt,
            actorId: auth.ctx.userId,
            inviteId: result.invite.id,
            source: "ONBOARDING_APPLICATION_CONVERSION",
          })
        : null;

    if (result.type === "GOVERNANCE_OFFICER") {
      await prisma.auditLog.create({
        data: {
          userId: auth.ctx.userId,
          action: "GOVERNANCE_OFFICER_INVITE_DELIVERY_ATTEMPTED",
          resource: "GovernanceOfficerInvite",
          resourceId: result.invite.id,
          ip,
          userAgent,
          metadata: {
  inviteUrl: result.inviteUrl,
  delivery: jsonSafe(delivery),
  source: "ONBOARDING_APPLICATION_CONVERSION",
},
        },
      });
    }

    return json(200, { ok: true, ...result, delivery });
  } catch (err) {
    if (err instanceof ApiError) {
      return json(err.status, { ok: false, error: err.code });
    }

    console.error("ONBOARDING_APPLICATION_CONVERT_ERROR", err);
    return json(500, { ok: false, error: "APPLICATION_CONVERSION_FAILED" });
  }
}