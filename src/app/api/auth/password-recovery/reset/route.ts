import { NextRequest, NextResponse } from "next/server";
import {
  isRawPasswordRecoveryToken,
  resetPasswordWithRecoveryToken,
  validateRecoveryPassword,
} from "@/lib/passwordRecovery";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 8 * 1024;
const WINDOW_SECONDS = 15 * 60;

function noStore(status: number, payload: unknown, extraHeaders?: HeadersInit) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      ...(extraHeaders ?? {}),
    },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export async function POST(req: NextRequest) {
  const contentLength = Number(req.headers.get("content-length") || "0");

  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return noStore(413, {
      ok: false,
      error: "REQUEST_TOO_LARGE",
    });
  }

  const body = (await req.json().catch(() => null)) as unknown;
  if (!isRecord(body)) {
    return noStore(400, {
      ok: false,
      error: "INVALID_REQUEST",
    });
  }

  const token = String(body.token ?? "").trim();
  const newPassword = String(body.newPassword ?? "");
  const confirmPassword = String(body.confirmPassword ?? "");

  if (!isRawPasswordRecoveryToken(token)) {
    return noStore(400, {
      ok: false,
      error: "INVALID_OR_EXPIRED_RECOVERY",
      message: "This recovery link is invalid or expired.",
    });
  }

  if (newPassword !== confirmPassword) {
    return noStore(400, {
      ok: false,
      error: "PASSWORD_MISMATCH",
      message: "The passwords do not match.",
    });
  }

  const policyError = validateRecoveryPassword(newPassword);
  if (policyError) {
    return noStore(400, {
      ok: false,
      error: "PASSWORD_POLICY",
      message: policyError,
    });
  }

  const ip = getClientIp(req);
  const userAgent = req.headers.get("user-agent");

  const ipDecision = await checkRateLimit({
    scope: "AUTH_PASSWORD_RECOVERY_RESET_IP",
    keyParts: [ip],
    limit: 10,
    windowSeconds: WINDOW_SECONDS,
    blockSeconds: WINDOW_SECONDS,
    metadata: {
      purpose: "PASSWORD_RECOVERY_RESET_IP",
    },
  });

  if (!ipDecision.ok) {
    return noStore(
      429,
      {
        ok: false,
        error: "RATE_LIMITED",
        message: "Too many reset attempts. Try again later.",
        retryAfterSeconds: ipDecision.retryAfterSeconds,
      },
      {
        "Retry-After": String(ipDecision.retryAfterSeconds),
      }
    );
  }

  const tokenDecision = await checkRateLimit({
    scope: "AUTH_PASSWORD_RECOVERY_RESET_TOKEN",
    keyParts: [token],
    limit: 8,
    windowSeconds: WINDOW_SECONDS,
    blockSeconds: WINDOW_SECONDS,
    metadata: {
      purpose: "PASSWORD_RECOVERY_RESET_TOKEN",
    },
  });

  if (!tokenDecision.ok) {
    return noStore(429, {
      ok: false,
      error: "RATE_LIMITED",
      message: "Too many reset attempts. Request a new recovery link.",
      retryAfterSeconds: tokenDecision.retryAfterSeconds,
    });
  }

  const result = await resetPasswordWithRecoveryToken({
    token,
    newPassword,
    ip,
    userAgent,
  });

  if (result.ok) {
    return noStore(200, {
      ok: true,
      message: "Password updated. Sign in again with your new password.",
    });
  }

  if (result.code === "PASSWORD_POLICY") {
    return noStore(400, {
      ok: false,
      error: result.code,
      message: result.message ?? "Choose a stronger password.",
    });
  }

  if (result.code === "RECOVERY_TEMPORARILY_UNAVAILABLE") {
    return noStore(503, {
      ok: false,
      error: result.code,
      message: "Password recovery is temporarily unavailable. Try again shortly.",
    });
  }

  return noStore(400, {
    ok: false,
    error: "INVALID_OR_EXPIRED_RECOVERY",
    message: "This recovery link is invalid, expired, or already used.",
  });
}
