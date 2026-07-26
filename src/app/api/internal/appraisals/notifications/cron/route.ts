// src/app/api/internal/appraisals/notifications/cron/route.ts
import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  getDirectorFeedbackLifecycleHealth,
  runDirectorFeedbackLifecycleWorker,
} from "@/lib/appraisals/directorFeedbackClosure";
import {
  getAppraisalNotificationHealth,
  runAppraisalNotificationWorker,
} from "@/lib/appraisals/notificationWorker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonNoStore(payload: unknown, status = 200) {
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
  return crypto.createHash("sha256").update(value).digest();
}

function safeEqual(a: string, b: string) {
  return crypto.timingSafeEqual(sha256(a), sha256(b));
}

function presentedSecrets(req: NextRequest) {
  const bearer = req.headers.get("authorization") ?? "";
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

  if (!candidates.some((candidate) => safeEqual(candidate, secret))) {
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

function safeWorkerError(error: unknown) {
  const value = error as { code?: unknown; message?: unknown };
  const candidate = String(value?.code ?? value?.message ?? "").trim();
  return /^[A-Z0-9_:-]{3,160}$/.test(candidate)
    ? candidate
    : "APPRAISAL_WORKER_FAILED";
}

export async function GET(req: NextRequest) {
  const auth = authorized(req);
  if (!auth.ok) return unauthorized(auth.reason);

  const [health, lifecycle] = await Promise.all([
    getAppraisalNotificationHealth(),
    getDirectorFeedbackLifecycleHealth(),
  ]);

  return jsonNoStore({
    ok: true,
    mode: "HEALTH_ONLY",
    message:
      "Appraisal cron is authorized and reachable. GET does not deliver messages, close cycles, or generate snapshots.",
    checkedAt: new Date().toISOString(),
    channels: ["SMS", "EMAIL"],
    health,
    lifecycle,
  });
}

export async function POST(req: NextRequest) {
  const auth = authorized(req);
  if (!auth.ok) return unauthorized(auth.reason);

  const [before, lifecycleBefore] = await Promise.all([
    getAppraisalNotificationHealth(),
    getDirectorFeedbackLifecycleHealth(),
  ]);

  const notificationAttempt = await runAppraisalNotificationWorker({
    workerId: "appraisal-notification-cron",
    limit: 25,
    staleProcessingAfterMinutes: 15,
  })
    .then((value) => ({ ok: true as const, value }))
    .catch((error: unknown) => ({
      ok: false as const,
      error: safeWorkerError(error),
    }));

  const lifecycleAttempt = await runDirectorFeedbackLifecycleWorker({
    limit: 10,
  })
    .then((value) => ({ ok: true as const, value }))
    .catch((error: unknown) => ({
      ok: false as const,
      error: safeWorkerError(error),
    }));

  const [after, lifecycleAfter] = await Promise.all([
    getAppraisalNotificationHealth(),
    getDirectorFeedbackLifecycleHealth(),
  ]);

  const ok = notificationAttempt.ok && lifecycleAttempt.ok;

  return jsonNoStore(
    {
      ok,
      mode: "WORKER_EXECUTED",
      executedAt: new Date().toISOString(),
      before,
      result: notificationAttempt.ok
        ? notificationAttempt.value
        : {
            claimed: 0,
            sent: 0,
            failed: 0,
            dead: 0,
            ambiguousSmsDead: 0,
            expiredEmailDead: 0,
            error: notificationAttempt.error,
          },
      after,
      lifecycle: {
        before: lifecycleBefore,
        result: lifecycleAttempt.ok
          ? lifecycleAttempt.value
          : { error: lifecycleAttempt.error },
        after: lifecycleAfter,
      },
    },
    ok ? 200 : 500,
  );
}
