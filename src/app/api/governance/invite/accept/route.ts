// src/app/api/governance/invite/accept/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { createHash } from "crypto";
import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/password";
import { roleDefaultDestination } from "@/lib/roleRouting";
import { writeAuditLog } from "@/lib/audit";
import {
  getIpFromHeaders,
  getUserAgentFromHeaders,
  rateLimitCheck,
  rateLimitRecord,
} from "@/lib/rateLimit";
import { sendGovernanceOfficerWelcomeSms } from "@/lib/governance/inviteDelivery";

type Body = {
  token?: string;
  email?: string;
  password?: string;
  name?: string;
  phone?: string;
};

const WINDOW_SECONDS = Number(
  process.env.GOVERNANCE_INVITE_ACCEPT_WINDOW_SECONDS || 30 * 60
);
const LIMIT_PER_IP = Number(
  process.env.GOVERNANCE_INVITE_ACCEPT_LIMIT_PER_IP || 25
);
const LIMIT_PER_TOKEN = Number(
  process.env.GOVERNANCE_INVITE_ACCEPT_LIMIT_PER_TOKEN || 15
);

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

function isStrongEnoughPassword(password: string) {
  return password.length >= 8;
}

function metadataTitle(metadata: Prisma.JsonValue, fallback: string) {
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    const m = metadata as Record<string, unknown>;
    const title = clean(m.title);
    if (title) return title;
  }

  return fallback;
}

function assignmentTitle(role: string, zoneName: string) {
  if (role === "SISSO") return `SISO ${zoneName}`;
  if (role === "CIRCUIT_SUPERVISOR") return `Circuit Supervisor ${zoneName}`;
  if (role === "DISTRICT_DIRECTOR") return `District Director ${zoneName}`;
  if (role === "HEAD_OF_SUPERVISION") return `Head of Supervision ${zoneName}`;
  if (role === "BASIC_SCHOOL_COORDINATOR") {
    return `Basic School Coordinator ${zoneName}`;
  }
  if (role === "DISTRICT_MIS_OFFICER") return `District MIS Officer ${zoneName}`;
  if (role === "DISTRICT_SHEP_OFFICER") {
    return `District SHEP Officer ${zoneName}`;
  }
  if (role === "DISTRICT_ASSESSMENT_OFFICER") {
    return `District Assessment Officer ${zoneName}`;
  }
  if (role === "REGIONAL_VIEWER") return `Regional Viewer ${zoneName}`;

  return `${role} ${zoneName}`;
}

export async function POST(req: Request) {
  const ip = getIpFromHeaders(req.headers);
  const userAgent = getUserAgentFromHeaders(req.headers);

  const body = (await req.json().catch(() => ({}))) as Body;

  const token = clean(body.token);
  const emailNorm = cleanEmail(body.email);
  const password = clean(body.password);
  const name = clean(body.name);
  const phone = cleanPhone(body.phone);

  if (!token) return json(400, { ok: false, error: "MISSING_TOKEN" });

  if (!emailNorm || !isEmailLike(emailNorm)) {
    return json(400, { ok: false, error: "INVALID_EMAIL" });
  }

  if (!password || !isStrongEnoughPassword(password)) {
    return json(400, { ok: false, error: "WEAK_PASSWORD" });
  }

  if (phone && !isPhoneE164ish(phone)) {
    return json(400, { ok: false, error: "INVALID_PHONE" });
  }

  const tokenHash = sha256Hex(token);
  const tokenKey = `governanceInviteAccept:token:${tokenHash.slice(0, 24)}`;
  const ipKey = ip ? `governanceInviteAccept:ip:${ip}` : null;

  if (ipKey) {
    const lim = await rateLimitCheck({
      action: "GOVERNANCE_INVITE_ACCEPT_FAIL",
      key: ipKey,
      limit: LIMIT_PER_IP,
      windowSeconds: WINDOW_SECONDS,
    });

    if (!lim.ok) {
      return json(429, {
        ok: false,
        error: "RATE_LIMITED",
        retryAfterSeconds: lim.retryAfterSeconds,
      });
    }
  }

  const tokenLimit = await rateLimitCheck({
    action: "GOVERNANCE_INVITE_ACCEPT_FAIL",
    key: tokenKey,
    limit: LIMIT_PER_TOKEN,
    windowSeconds: WINDOW_SECONDS,
  });

  if (!tokenLimit.ok) {
    return json(429, {
      ok: false,
      error: "RATE_LIMITED",
      retryAfterSeconds: tokenLimit.retryAfterSeconds,
    });
  }

  const invite = await prisma.governanceOfficerInvite.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      email: true,
      emailNorm: true,
      phone: true,
      phoneNorm: true,
      role: true,
      zoneId: true,
      status: true,
      expiresAt: true,
      acceptedAt: true,
      revokedAt: true,
      metadata: true,
      zone: {
        select: {
          id: true,
          name: true,
          isActive: true,
          zoneType: { select: { name: true, level: true } },
        },
      },
    },
  });

  const now = new Date();

  const invalid =
    !invite ||
    invite.status !== "PENDING" ||
    !!invite.acceptedAt ||
    !!invite.revokedAt ||
    invite.expiresAt <= now ||
    !invite.zone?.isActive;

  if (invalid) {
    if (ipKey) {
      await rateLimitRecord({
        action: "GOVERNANCE_INVITE_ACCEPT_FAIL",
        key: ipKey,
        ip,
        userAgent,
        metadata: { reason: "INVALID_OR_EXPIRED" },
      });
    }

    await rateLimitRecord({
      action: "GOVERNANCE_INVITE_ACCEPT_FAIL",
      key: tokenKey,
      ip,
      userAgent,
      metadata: { reason: "INVALID_OR_EXPIRED" },
    });

    return json(400, { ok: false, error: "INVALID_OR_EXPIRED_INVITE" });
  }

  if (invite.emailNorm !== emailNorm) {
    if (ipKey) {
      await rateLimitRecord({
        action: "GOVERNANCE_INVITE_ACCEPT_FAIL",
        key: ipKey,
        ip,
        userAgent,
        metadata: { reason: "EMAIL_MISMATCH", inviteId: invite.id },
      });
    }

    await rateLimitRecord({
      action: "GOVERNANCE_INVITE_ACCEPT_FAIL",
      key: tokenKey,
      ip,
      userAgent,
      metadata: { reason: "EMAIL_MISMATCH", inviteId: invite.id },
    });

    return json(403, { ok: false, error: "EMAIL_MISMATCH" });
  }

  let result: {
    userId: string;
    assignmentId: string;
    role: string;
    zoneName: string;
    welcomePhone: string | null;
  };

  try {
    result = await prisma.$transaction(async (tx) => {
      const existing = await tx.user.findFirst({
        where: { email: { equals: emailNorm, mode: "insensitive" } },
        select: {
          id: true,
          email: true,
          name: true,
          passwordHash: true,
          phoneNorm: true,
        },
      });

      let userId: string;

      if (existing) {
        if (existing.passwordHash) {
          const okPassword = await verifyPassword(password, existing.passwordHash);

          if (!okPassword) {
            throw new Error("EXISTING_USER_PASSWORD_MISMATCH");
          }

          const updateData: Prisma.UserUpdateInput = {};
          if (name && !existing.name) updateData.name = name;

          if (phone && !existing.phoneNorm) {
            const phoneConflict = await tx.user.findFirst({
              where: { phoneNorm: phone, NOT: { id: existing.id } },
              select: { id: true },
            });

            if (!phoneConflict) {
              updateData.phone = phone;
              updateData.phoneNorm = phone;
            }
          }

          if (Object.keys(updateData).length) {
            await tx.user.update({
              where: { id: existing.id },
              data: updateData,
            });
          }
        } else {
          await tx.user.update({
            where: { id: existing.id },
            data: {
              passwordHash: await hashPassword(password),
              name: name || existing.name || invite.email,
              phone: phone || invite.phone || undefined,
              phoneNorm: phone || invite.phoneNorm || undefined,
            },
          });
        }

        userId = existing.id;
      } else {
        const phoneConflict = phone
          ? await tx.user.findFirst({
              where: { phoneNorm: phone },
              select: { id: true },
            })
          : null;

        userId = (
          await tx.user.create({
            data: {
              email: emailNorm,
              passwordHash: await hashPassword(password),
              name: name || invite.email,
              phone: phone && !phoneConflict ? phone : null,
              phoneNorm: phone && !phoneConflict ? phone : null,
            },
            select: { id: true },
          })
        ).id;
      }

      const title = metadataTitle(
        invite.metadata,
        assignmentTitle(String(invite.role), invite.zone.name)
      );

      const existingAssignment = await tx.governanceOfficerAssignment.findFirst({
        where: {
          userId,
          zoneId: invite.zoneId,
          role: invite.role,
          status: "ACTIVE",
          revokedAt: null,
        },
        select: {
          id: true,
          phone: true,
          role: true,
          zone: { select: { name: true } },
        },
      });

      const assignment =
        existingAssignment ??
        (await tx.governanceOfficerAssignment.create({
          data: {
            userId,
            zoneId: invite.zoneId,
            role: invite.role,
            status: "ACTIVE",
            title,
            phone: phone || invite.phone || null,
            metadata: {
              source: "GOVERNANCE_INVITE_ACCEPTANCE",
              inviteId: invite.id,
              acceptedAt: now.toISOString(),
              zoneName: invite.zone.name,
              zoneType: invite.zone.zoneType.name,
              zoneLevel: invite.zone.zoneType.level,
            },
          },
          select: {
            id: true,
            phone: true,
            role: true,
            zone: { select: { name: true } },
          },
        }));

      await tx.governanceOfficerInvite.update({
        where: { id: invite.id },
        data: {
          status: "ACCEPTED",
          acceptedAt: now,
          acceptedByUserId: userId,
          metadata: {
            ...(invite.metadata &&
            typeof invite.metadata === "object" &&
            !Array.isArray(invite.metadata)
              ? (invite.metadata as Record<string, unknown>)
              : {}),
            acceptedFromIp: ip ?? null,
            acceptedUserAgent: userAgent ?? null,
            assignmentId: assignment.id,
          },
        },
      });

      return {
        userId,
        assignmentId: assignment.id,
        role: String(assignment.role),
        zoneName: assignment.zone.name,
        welcomePhone:
          assignment.phone || phone || invite.phoneNorm || invite.phone || null,
      };
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "";

    if (message === "EXISTING_USER_PASSWORD_MISMATCH") {
      if (ipKey) {
        await rateLimitRecord({
          action: "GOVERNANCE_INVITE_ACCEPT_FAIL",
          key: ipKey,
          ip,
          userAgent,
          metadata: { reason: "EXISTING_USER_PASSWORD_MISMATCH" },
        });
      }

      await rateLimitRecord({
        action: "GOVERNANCE_INVITE_ACCEPT_FAIL",
        key: tokenKey,
        ip,
        userAgent,
        metadata: { reason: "EXISTING_USER_PASSWORD_MISMATCH" },
      });

      return json(409, {
        ok: false,
        error: "EXISTING_USER_PASSWORD_MISMATCH",
        message:
          "This email already has an account. Enter the existing password to link this governance assignment, or ask Superadmin to invite a fresh official email.",
      });
    }

    console.error("GOVERNANCE_INVITE_ACCEPT_ERROR", err);

    return json(500, {
      ok: false,
      error: "GOVERNANCE_INVITE_ACCEPT_FAILED",
    });
  }

  const welcomeDelivery = await sendGovernanceOfficerWelcomeSms({
    phone: result.welcomePhone,
    role: result.role,
    zoneName: result.zoneName,
    actorId: result.userId,
    assignmentId: result.assignmentId,
  });

  await writeAuditLog({
    action: "GOVERNANCE_OFFICER_INVITE_ACCEPTED",
    userId: result.userId,
    resource: "GovernanceOfficerInvite",
    resourceId: invite.id,
    ip,
    userAgent,
    metadata: {
      assignmentId: result.assignmentId,
      role: result.role,
      zoneId: invite.zoneId,
      zoneName: result.zoneName,
      emailNorm,
      welcomeDelivery,
    },
  });

  const destination = roleDefaultDestination(result.role);
  const signInUrl = `/auth/signin?mode=governance&callbackUrl=${encodeURIComponent(
    destination
  )}`;

  return json(200, {
    ok: true,
    signInUrl,
    destination,
    role: result.role,
    zoneName: result.zoneName,
    welcomeDelivery,
  });
}
