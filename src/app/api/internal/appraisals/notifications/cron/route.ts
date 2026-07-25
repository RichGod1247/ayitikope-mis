// src/app/api/internal/appraisals/notifications/cron/route.ts
import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  getAppraisalNotificationHealth,
  runAppraisalNotificationWorker,
} from "@/lib/appraisals/notificationWorker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonNoStore(
  payload: unknown,
  status = 200,
) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      Pragma: "no-cache",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}

function sha256(value: string) {
  return crypto
    .createHash("sha256")
    .update(value)
    .digest();
}

function safeEqual(a: string, b: string) {
  return crypto.timingSafeEqual(
    sha256(a),
    sha256(b),
  );
}

function presentedSecrets(req: NextRequest) {
  const bearer =
    req.headers.get("authorization") ?? "";
  const token = bearer.startsWith("Bearer ")
    ? bearer.slice(7).trim()
    : "";

  const headerSecret =
    req.headers
      .get("x-appraisal-notification-cron-secret")
      ?.trim() ?? "";

  return [token, headerSecret].filter(Boolean);
}

function authorized(req: NextRequest) {
  const secret =
    process.env.APPRAISAL_NOTIFICATION_CRON_SECRET?.trim();

  if (!secret) {
    return {
      ok: false as const,
      reason: "CRON_SECRET_NOT_CONFIGURED",
    };
  }

  const candidates = presentedSecrets(req);

  if (!candidates.length) {
    return {
      ok: false as const,
      reason: "CRON_SECRET_REQUIRED",
    };
  }

  if (
    !candidates.some((candidate) =>
      safeEqual(candidate, secret),
    )
  ) {
    return {
      ok: false as const,
      reason: "CRON_SECRET_INVALID",
    };
  }

  return { ok: true as const };
}

function unauthorized(reason: string) {
  return jsonNoStore(
    {
      ok: false,
      error: "UNAUTHORIZED",
      reason,
    },
    401,
  );
}

export async function GET(req: NextRequest) {
  const auth = authorized(req);
  if (!auth.ok) return unauthorized(auth.reason);

  const health = await getAppraisalNotificationHealth();

  return jsonNoStore({
    ok: true,
    mode: "HEALTH_ONLY",
    message:
      "Appraisal notification cron is authorized and reachable. GET does not deliver messages.",
    checkedAt: new Date().toISOString(),
    channels: ["SMS", "EMAIL"],
    health,
  });
}

export async function POST(req: NextRequest) {
  const auth = authorized(req);
  if (!auth.ok) return unauthorized(auth.reason);

  const before =
    await getAppraisalNotificationHealth();

  const result =
    await runAppraisalNotificationWorker({
      workerId:
        "appraisal-notification-cron",
      limit: 25,
      staleProcessingAfterMinutes: 15,
    });

  const after =
    await getAppraisalNotificationHealth();

  return jsonNoStore({
    ok: true,
    mode: "WORKER_EXECUTED",
    executedAt: new Date().toISOString(),
    before,
    result,
    after,
  });
}
