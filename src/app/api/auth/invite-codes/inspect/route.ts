// src/app/api/auth/invite-codes/inspect/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashInviteCode } from "@/lib/inviteCodes";
import {
  getIpFromHeaders,
  getUserAgentFromHeaders,
  rateLimitCheck,
  rateLimitRecord,
} from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function cleanStr(v: unknown) {
  return String(v ?? "").trim();
}

function json(status: number, payload: any) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

const WINDOW_SECONDS = Number(process.env.AUTH_INVITE_INSPECT_WINDOW_SECONDS || 60 * 10);
const LIMIT_PER_IP = Number(process.env.AUTH_INVITE_INSPECT_LIMIT_PER_IP || 60);

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = cleanStr(url.searchParams.get("code") || url.searchParams.get("inviteCode") || "");

  if (!code) return json(400, { ok: false, error: "MISSING_CODE" });

  const ip = getIpFromHeaders(req.headers);
  const userAgent = getUserAgentFromHeaders(req.headers);

  const ipKey = ip ? `inviteInspect:ip:${ip}` : null;
  if (ipKey) {
    const lim = await rateLimitCheck({
      action: "AUTH_INVITE_INSPECT_FAIL",
      key: ipKey,
      limit: LIMIT_PER_IP,
      windowSeconds: WINDOW_SECONDS,
    });
    if (!lim.ok) {
      return json(429, { ok: false, error: "RATE_LIMITED", retryAfterSeconds: lim.retryAfterSeconds });
    }
  }

  const codeHash = hashInviteCode(code);
  const now = new Date();

  const row = await prisma.inviteCode.findUnique({
    where: { codeHash },
    select: {
      id: true,
      tenantId: true,
      maxUses: true,
      usedCount: true,
      expiresAt: true,
      revokedAt: true,
      role: { select: { name: true } },
      tenant: { select: { id: true, name: true, schoolCode: true, status: true } },
    },
  });

  const invalid = !row ||
    !!row.revokedAt ||
    row.expiresAt <= now ||
    row.usedCount >= row.maxUses ||
    !row.tenant ||
    row.tenant.status !== "ACTIVE";

  if (invalid) {
    if (ipKey) {
      await rateLimitRecord({
        action: "AUTH_INVITE_INSPECT_FAIL",
        key: ipKey,
        ip,
        userAgent,
        metadata: { reason: "INVALID_OR_EXPIRED" },
      });
    }
    return json(200, { ok: false, error: "INVALID_OR_EXPIRED_CODE" });
  }

  const remaining = Math.max(0, row.maxUses - row.usedCount);

  return json(200, {
    ok: true,
    tenant: {
      id: row.tenant.id,
      name: row.tenant.name,
      schoolCode: row.tenant.schoolCode ?? null,
    },
    roleName: row.role.name,
    expiresAt: row.expiresAt.toISOString(),
    remaining,
  });
}
