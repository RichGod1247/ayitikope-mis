// src/app/api/admin/invite-codes/list/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import { rateLimitCheck, rateLimitRecord, getIpFromHeaders, getUserAgentFromHeaders } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RL_ACTION = "ADMIN_INVITE_CODE_LIST";
const RL_WINDOW_SECONDS = 30;
const RL_LIMIT = Number(process.env.INVITE_CODE_LIST_LIMIT_PER_30S || 60);

function json(payload: unknown, status = 200, extraHeaders?: Record<string, string>) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...(extraHeaders ?? {}),
    },
  });
}

export async function GET(req: NextRequest) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["SCHOOL_ADMIN", "SUPERADMIN"],
  });
  if (!auth.ok) return auth.res;

  const tenantId = auth.ctx.tenantId;
  const userId = auth.ctx.userId;

  const ip = getIpFromHeaders(req.headers);
  const userAgent = getUserAgentFromHeaders(req.headers);

  const key = `inviteCodeList:${tenantId}:${userId}`;

  const lim = await rateLimitCheck({
    action: RL_ACTION,
    key,
    limit: RL_LIMIT,
    windowSeconds: RL_WINDOW_SECONDS,
  });
  if (!lim.ok) {
    return json(
      { ok: false, error: "RATE_LIMITED", retryAfterSeconds: lim.retryAfterSeconds },
      429,
      { "Retry-After": String(lim.retryAfterSeconds) }
    );
  }

  await rateLimitRecord({ action: RL_ACTION, key, tenantId, userId, ip, userAgent, metadata: {} as any });

  const url = new URL(req.url);
  const includeRevoked = url.searchParams.get("includeRevoked") === "1";
  const debug = url.searchParams.get("debug") === "1";

  const rows = await prisma.inviteCode.findMany({
    where: { tenantId, ...(includeRevoked ? {} : { revokedAt: null }) },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      codeHint: true,
      expiresAt: true,
      maxUses: true,
      usedCount: true,
      revokedAt: true,
      lastUsedAt: true,
      createdAt: true,
      role: { select: { name: true } },
    },
  });

  const now = Date.now();
  const items = rows.map((r) => {
    const expired = r.expiresAt.getTime() <= now;
    const remaining = Math.max(0, r.maxUses - r.usedCount);
    const active = !r.revokedAt && !expired && remaining > 0;

    return {
      id: r.id,
      roleName: r.role.name,
      codeHint: r.codeHint ?? null,
      expiresAt: r.expiresAt.toISOString(),
      maxUses: r.maxUses,
      usedCount: r.usedCount,
      remaining,
      revokedAt: r.revokedAt?.toISOString() ?? null,
      lastUsedAt: r.lastUsedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      active,
      expired,
    };
  });

  if (!debug) return json({ ok: true, items });

  const [inviteCodes, inviteCodeUses] = await Promise.all([
    prisma.inviteCode.count({ where: { tenantId } }),
    prisma.inviteCodeUse.count({ where: { tenantId } }),
  ]);

  return json({ ok: true, items, debug: { tenantId, inviteCodes, inviteCodeUses } });
}