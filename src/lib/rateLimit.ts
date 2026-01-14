// src/lib/rateLimit.ts
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export type RateLimitResult =
  | { ok: true }
  | { ok: false; retryAfterSeconds: number; remainingSeconds: number };

function now() {
  return new Date();
}

function secondsBetween(future: Date, current: Date) {
  return Math.max(0, Math.floor((future.getTime() - current.getTime()) / 1000));
}

export function getIpFromHeaders(headers: Headers): string | null {
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() || null;
  return headers.get("x-real-ip") || null;
}

export function getUserAgentFromHeaders(headers: Headers): string | null {
  return headers.get("user-agent") || null;
}

/**
 * DB-backed limiter using AuditLog counts.
 * We count rows in AuditLog where:
 * - action = action
 * - resource = "RateLimit"
 * - resourceId = key
 * - createdAt >= (now - windowSeconds)
 */
export async function rateLimitCheck(opts: {
  action: string;
  key: string;
  limit: number;
  windowSeconds: number;
}): Promise<RateLimitResult> {
  const t = now();
  const windowStart = new Date(t.getTime() - opts.windowSeconds * 1000);

  const count = await prisma.auditLog.count({
    where: {
      action: opts.action,
      resource: "RateLimit",
      resourceId: opts.key,
      createdAt: { gte: windowStart },
    },
  });

  if (count < opts.limit) return { ok: true };

  const first = await prisma.auditLog.findFirst({
    where: {
      action: opts.action,
      resource: "RateLimit",
      resourceId: opts.key,
      createdAt: { gte: windowStart },
    },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true },
  });

  const firstAt = first?.createdAt ?? windowStart;
  const expiresAt = new Date(firstAt.getTime() + opts.windowSeconds * 1000);
  const remainingSeconds = secondsBetween(expiresAt, t) || 1;

  return { ok: false, retryAfterSeconds: remainingSeconds, remainingSeconds };
}

export async function rateLimitRecord(opts: {
  action: string;
  key: string;
  ip?: string | null;
  userAgent?: string | null;
  tenantId?: string | null;
  userId?: string | null;
  metadata?: Prisma.InputJsonValue; // ✅ Prisma-safe JSON
}) {
  await prisma.auditLog.create({
    data: {
      tenantId: opts.tenantId ?? null,
      userId: opts.userId ?? null,
      action: opts.action,
      resource: "RateLimit",
      resourceId: opts.key,
      ip: opts.ip ?? null,
      userAgent: opts.userAgent ?? null,
      ...(opts.metadata === undefined ? {} : { metadata: opts.metadata }), // omit if undefined
    },
  });
}
