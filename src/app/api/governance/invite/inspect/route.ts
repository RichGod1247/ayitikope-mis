// src/app/api/governance/invite/inspect/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getIpFromHeaders,
  getUserAgentFromHeaders,
  rateLimitCheck,
  rateLimitRecord,
} from "@/lib/rateLimit";

const WINDOW_SECONDS = Number(process.env.GOVERNANCE_INVITE_INSPECT_WINDOW_SECONDS || 10 * 60);
const LIMIT_PER_IP = Number(process.env.GOVERNANCE_INVITE_INSPECT_LIMIT_PER_IP || 80);

function json(status: number, payload: any) {
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

function sha256Hex(v: string) {
  return createHash("sha256").update(v, "utf8").digest("hex");
}

function maskEmail(email: string) {
  const [name, domain] = email.split("@");
  if (!name || !domain) return email;
  const head = name.slice(0, 2);
  return `${head}${"*".repeat(Math.max(2, name.length - 2))}@${domain}`;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = clean(url.searchParams.get("token"));

  if (!token) return json(400, { ok: false, error: "MISSING_TOKEN" });

  const ip = getIpFromHeaders(req.headers);
  const userAgent = getUserAgentFromHeaders(req.headers);

  const ipKey = ip ? `governanceInviteInspect:ip:${ip}` : null;
  if (ipKey) {
    const lim = await rateLimitCheck({
      action: "GOVERNANCE_INVITE_INSPECT_FAIL",
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

  const tokenHash = sha256Hex(token);
  const now = new Date();

  const invite = await prisma.governanceOfficerInvite.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      email: true,
      emailNorm: true,
      phone: true,
      role: true,
      status: true,
      expiresAt: true,
      acceptedAt: true,
      revokedAt: true,
      zone: {
        select: {
          id: true,
          name: true,
          zoneType: { select: { name: true, level: true } },
          parentZone: { select: { id: true, name: true } },
        },
      },
    },
  });

  const invalid =
    !invite ||
    invite.status !== "PENDING" ||
    !!invite.acceptedAt ||
    !!invite.revokedAt ||
    invite.expiresAt <= now;

  if (invalid) {
    if (ipKey) {
      await rateLimitRecord({
        action: "GOVERNANCE_INVITE_INSPECT_FAIL",
        key: ipKey,
        ip,
        userAgent,
        metadata: { reason: "INVALID_OR_EXPIRED" },
      });
    }

    return json(200, { ok: false, error: "INVALID_OR_EXPIRED_INVITE" });
  }

  return json(200, {
    ok: true,
    invite: {
      id: invite.id,
      email: invite.email,
      emailMasked: maskEmail(invite.emailNorm),
      phone: invite.phone,
      role: invite.role,
      expiresAt: invite.expiresAt.toISOString(),
      zone: {
        id: invite.zone.id,
        name: invite.zone.name,
        type: invite.zone.zoneType.name,
        level: invite.zone.zoneType.level,
        parent: invite.zone.parentZone
          ? { id: invite.zone.parentZone.id, name: invite.zone.parentZone.name }
          : null,
      },
    },
  });
}