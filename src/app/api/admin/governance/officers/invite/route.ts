// src/app/api/admin/governance/officers/invite/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { createHash, randomBytes } from "crypto";
import { NextResponse } from "next/server";
import type { GovernanceOfficerRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import { writeAuditLog } from "@/lib/audit";
import { getIpFromHeaders, getUserAgentFromHeaders } from "@/lib/rateLimit";
import { buildPublicUrl } from "@/lib/publicUrl";
import { deliverGovernanceOfficerInvite } from "@/lib/governance/inviteDelivery";

type Body = {
  email?: string;
  phone?: string;
  role?: string;
  zoneId?: string;
  expiresInDays?: number;
  title?: string;
};

const GOVERNANCE_ROLES = new Set([
  "SISSO",
  "CIRCUIT_SUPERVISOR",
  "DISTRICT_DIRECTOR",
  "HEAD_OF_SUPERVISION",
  "BASIC_SCHOOL_COORDINATOR",
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

function clean(v: unknown) {
  return String(v ?? "").trim();
}

function cleanEmail(v: unknown) {
  return clean(v).toLowerCase();
}

function isEmailLike(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function cleanPhone(v: unknown) {
  const raw = clean(v).replace(/\s+/g, "");
  let p = raw.replace(/[^\d+]/g, "");
  if (!p) return "";
  if (p.startsWith("0") && p.length === 10) p = `+233${p.slice(1)}`;
  if (p.startsWith("233") && !p.startsWith("+233")) p = `+${p}`;
  return p;
}

function isPhoneE164ish(v: string) {
  return /^\+\d{9,15}$/.test(v);
}

function sha256Hex(v: string) {
  return createHash("sha256").update(v, "utf8").digest("hex");
}

function newToken() {
  return randomBytes(32).toString("base64url");
}

function roleZoneLevel(role: string) {
  if (role === "SISSO" || role === "CIRCUIT_SUPERVISOR") return 1;

  if (
    role === "DISTRICT_DIRECTOR" ||
    role === "HEAD_OF_SUPERVISION" ||
    role === "BASIC_SCHOOL_COORDINATOR" ||
    role === "DISTRICT_MIS_OFFICER" ||
    role === "DISTRICT_SHEP_OFFICER" ||
    role === "DISTRICT_ASSESSMENT_OFFICER"
  ) {
    return 2;
  }

  if (role === "REGIONAL_VIEWER") return 3;

  return null;
}

export async function POST(req: Request) {
  const auth = await requireApiUserContext(req, {
    requireTenant: false,
    requireRoleNames: ["SUPERADMIN"],
  });

  if (!auth.ok) return auth.res;

  const ip = getIpFromHeaders(req.headers);
  const userAgent = getUserAgentFromHeaders(req.headers);

  const body = (await req.json().catch(() => ({}))) as Body;

  const email = clean(body.email);
  const emailNorm = cleanEmail(body.email);
  const phone = cleanPhone(body.phone);
  const role = clean(body.role).toUpperCase();
  const zoneId = clean(body.zoneId);
  const title = clean(body.title);

  const expiresInDaysRaw = Number(body.expiresInDays ?? 7);
  const expiresInDays =
    Number.isFinite(expiresInDaysRaw) &&
    expiresInDaysRaw >= 1 &&
    expiresInDaysRaw <= 30
      ? Math.floor(expiresInDaysRaw)
      : 7;

  if (!emailNorm || !isEmailLike(emailNorm)) {
    return json(400, { ok: false, error: "INVALID_EMAIL" });
  }

  if (phone && !isPhoneE164ish(phone)) {
    return json(400, { ok: false, error: "INVALID_PHONE" });
  }

  if (!GOVERNANCE_ROLES.has(role)) {
    return json(400, { ok: false, error: "INVALID_GOVERNANCE_ROLE" });
  }

  if (!zoneId) {
    return json(400, { ok: false, error: "MISSING_ZONE_ID" });
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

  const token = newToken();
  const tokenHash = sha256Hex(token);
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);

  const invite = await prisma.$transaction(async (tx) => {
    await tx.governanceOfficerInvite.updateMany({
      where: {
        emailNorm,
        zoneId,
        role: role as GovernanceOfficerRole,
        status: "PENDING",
        acceptedAt: null,
        revokedAt: null,
      },
      data: {
        status: "REVOKED",
        revokedAt: new Date(),
        revokedByUserId: auth.ctx.userId,
        metadata: {
          reason: "Superseded by a newer governance officer invite.",
          supersededBy: "new_invite",
        },
      },
    });

    return tx.governanceOfficerInvite.create({
      data: {
        email,
        emailNorm,
        phone: phone || null,
        phoneNorm: phone || null,
        tokenHash,
        role: role as GovernanceOfficerRole,
        zoneId,
        status: "PENDING",
        expiresAt,
        createdByUserId: auth.ctx.userId,
        metadata: {
          title: title || null,
          source: "SUPERADMIN_GOVERNANCE_INVITE",
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
  });

  const inviteUrl = buildPublicUrl(
    `/governance/invite/${encodeURIComponent(token)}`,
    req,
  );

  const delivery = await deliverGovernanceOfficerInvite({
    email: invite.email,
    phone: invite.phoneNorm || invite.phone || null,
    role: String(invite.role),
    title: title || null,
    zoneName: zone.name,
    zoneTypeName: zone.zoneType.name,
    inviteUrl,
    expiresAt: invite.expiresAt,
    actorId: auth.ctx.userId,
    inviteId: invite.id,
    source: "SUPERADMIN_GOVERNANCE_INVITE",
  });

  await writeAuditLog({
    action: "GOVERNANCE_OFFICER_INVITE_CREATED",
    userId: auth.ctx.userId,
    resource: "GovernanceOfficerInvite",
    resourceId: invite.id,
    ip,
    userAgent,
    metadata: {
      emailNorm,
      role,
      zoneId,
      zoneName: zone.name,
      expiresAt: invite.expiresAt.toISOString(),
      delivery,
    },
  });

  return json(201, {
    ok: true,
    invite: {
      id: invite.id,
      email: invite.email,
      role: invite.role,
      zoneId: invite.zoneId,
      zoneName: zone.name,
      zoneType: zone.zoneType.name,
      expiresAt: invite.expiresAt.toISOString(),
      createdAt: invite.createdAt.toISOString(),
    },
    inviteUrl,
    delivery,
  });
}
