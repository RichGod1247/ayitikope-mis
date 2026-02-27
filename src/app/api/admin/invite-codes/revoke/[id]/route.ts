// src/app/api/admin/invite-codes/revoke/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import {
  getIpFromHeaders,
  getUserAgentFromHeaders,
  rateLimitCheck,
  rateLimitRecord,
} from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RL_ACTION = "ADMIN_INVITE_CODE_REVOKE";
const RL_USER_WINDOW_SECONDS = 10 * 60;
const RL_TENANT_WINDOW_SECONDS = 60 * 60;
const RL_USER_LIMIT = Number(process.env.INVITE_CODE_REVOKE_LIMIT_PER_USER_10M || 60);
const RL_TENANT_LIMIT = Number(process.env.INVITE_CODE_REVOKE_LIMIT_PER_TENANT_HOUR || 500);

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

type Params = { id: string };

export async function POST(
  req: NextRequest,
  ctx: { params: Params | Promise<Params> }
) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["SCHOOL_ADMIN", "SUPERADMIN"],
  });
  if (!auth.ok) return auth.res;

  const tenantId = auth.ctx.tenantId;
  const actorId = auth.ctx.userId;

  const p = await Promise.resolve(ctx.params);
  const id = String(p?.id ?? "").trim();
  if (!id) return json({ ok: false, error: "BAD_ID" }, 400);

  const ip = getIpFromHeaders(req.headers);
  const userAgent = getUserAgentFromHeaders(req.headers);

  const userKey = `inviteCodeRevoke:user:${actorId}`;
  const tenantKey = `inviteCodeRevoke:tenant:${tenantId}`;

  const limUser = await rateLimitCheck({
    action: RL_ACTION,
    key: userKey,
    limit: RL_USER_LIMIT,
    windowSeconds: RL_USER_WINDOW_SECONDS,
  });
  if (!limUser.ok) {
    return json(
      { ok: false, error: "RATE_LIMITED", retryAfterSeconds: limUser.retryAfterSeconds },
      429,
      { "Retry-After": String(limUser.retryAfterSeconds) }
    );
  }

  const limTenant = await rateLimitCheck({
    action: RL_ACTION,
    key: tenantKey,
    limit: RL_TENANT_LIMIT,
    windowSeconds: RL_TENANT_WINDOW_SECONDS,
  });
  if (!limTenant.ok) {
    return json(
      { ok: false, error: "RATE_LIMITED", retryAfterSeconds: limTenant.retryAfterSeconds },
      429,
      { "Retry-After": String(limTenant.retryAfterSeconds) }
    );
  }

  await Promise.all([
    rateLimitRecord({
      action: RL_ACTION,
      key: userKey,
      tenantId,
      userId: actorId,
      ip,
      userAgent,
      metadata: { inviteCodeId: id } as any,
    }),
    rateLimitRecord({
      action: RL_ACTION,
      key: tenantKey,
      tenantId,
      userId: actorId,
      ip,
      userAgent,
      metadata: { inviteCodeId: id } as any,
    }),
  ]);

  const updated = await prisma.inviteCode.updateMany({
    where: { id, tenantId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  if (updated.count !== 1) return json({ ok: false, error: "NOT_FOUND_OR_ALREADY_REVOKED" }, 404);

  await prisma.auditLog.create({
    data: {
      tenantId,
      userId: actorId,
      action: "INVITE_CODE_REVOKE",
      resource: "InviteCode",
      resourceId: id,
      ip,
      userAgent,
      metadata: {},
    },
  });

  return json({ ok: true });
}