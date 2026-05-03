// src/lib/rate-limit.ts
import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type RateLimitInput = {
  scope: string;
  keyParts: Array<string | null | undefined>;
  limit: number;
  windowSeconds: number;
  blockSeconds: number;
  metadata?: Record<string, unknown>;
};

type RateLimitRow = {
  count: number;
  blockedUntil: Date | null;
};

export type RateLimitDecision = {
  ok: boolean;
  limited: boolean;
  scope: string;
  limit: number;
  count: number;
  retryAfterSeconds: number;
  blockedUntil: Date | null;
};

function cleanPart(value: string | null | undefined) {
  return String(value ?? "").trim() || "unknown";
}

function jsonSafe(value: unknown) {
  try {
    return JSON.parse(JSON.stringify(value ?? {}));
  } catch {
    return {};
  }
}

export function getClientIp(req: NextRequest) {
  const cf = req.headers.get("cf-connecting-ip");
  if (cf?.trim()) return cf.trim();

  const real = req.headers.get("x-real-ip");
  if (real?.trim()) return real.trim();

  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded?.trim()) return forwarded.split(",")[0]?.trim() || "unknown";

  return "unknown";
}

export function hashRateLimitKey(parts: Array<string | null | undefined>) {
  return crypto
    .createHash("sha256")
    .update(parts.map(cleanPart).join(":"))
    .digest("hex");
}

export async function checkRateLimit(
  input: RateLimitInput
): Promise<RateLimitDecision> {
  const limit = Math.max(1, Math.floor(input.limit));
  const windowSeconds = Math.max(1, Math.floor(input.windowSeconds));
  const blockSeconds = Math.max(1, Math.floor(input.blockSeconds));

  const nowMs = Date.now();
  const windowMs = windowSeconds * 1000;
  const windowStart = new Date(Math.floor(nowMs / windowMs) * windowMs);
  const keyHash = hashRateLimitKey(input.keyParts);
  const id = crypto.randomUUID();
  const metadata = jsonSafe(input.metadata);

  const rows = await prisma.$queryRaw<RateLimitRow[]>`
    insert into "ApiRateLimitBucket" (
      "id",
      "scope",
      "keyHash",
      "windowStart",
      "count",
      "metadata",
      "createdAt",
      "lastSeenAt"
    )
    values (
      ${id},
      ${input.scope},
      ${keyHash},
      ${windowStart},
      1,
      ${metadata},
      now(),
      now()
    )
    on conflict ("scope", "keyHash", "windowStart")
    do update set
      "count" = case
        when "ApiRateLimitBucket"."blockedUntil" is not null
          and "ApiRateLimitBucket"."blockedUntil" > now()
          then "ApiRateLimitBucket"."count"
        else "ApiRateLimitBucket"."count" + 1
      end,
      "blockedUntil" = case
        when "ApiRateLimitBucket"."blockedUntil" is not null
          and "ApiRateLimitBucket"."blockedUntil" > now()
          then "ApiRateLimitBucket"."blockedUntil"
        when "ApiRateLimitBucket"."count" + 1 > ${limit}
          then now() + (${String(blockSeconds)} || ' seconds')::interval
        else null
      end,
      "lastSeenAt" = now(),
      "metadata" = ${metadata}
    returning "count", "blockedUntil"
  `;

  const row = rows[0] ?? { count: 1, blockedUntil: null };
  const blockedUntil = row.blockedUntil ? new Date(row.blockedUntil) : null;
  const blockedMs = blockedUntil ? blockedUntil.getTime() - Date.now() : 0;
  const windowEndMs = windowStart.getTime() + windowMs;
  const limited = Boolean(blockedUntil && blockedMs > 0) || row.count > limit;

  return {
    ok: !limited,
    limited,
    scope: input.scope,
    limit,
    count: row.count,
    retryAfterSeconds: limited
      ? Math.max(1, Math.ceil((blockedMs > 0 ? blockedMs : windowEndMs - Date.now()) / 1000))
      : 0,
    blockedUntil,
  };
}

export function rateLimitResponse(decision: RateLimitDecision) {
  return NextResponse.json(
    {
      ok: false,
      error: "RATE_LIMITED",
      retryAfterSeconds: decision.retryAfterSeconds,
    },
    {
      status: 429,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Retry-After": String(decision.retryAfterSeconds),
        "X-RateLimit-Limit": String(decision.limit),
        "X-RateLimit-Remaining": String(
          Math.max(0, decision.limit - decision.count)
        ),
      },
    }
  );
}