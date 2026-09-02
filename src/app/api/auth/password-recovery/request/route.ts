import { NextRequest, NextResponse } from "next/server";
import {
  GENERIC_PASSWORD_RECOVERY_MESSAGE,
  isRecoveryEmailAddress,
  issuePasswordRecovery,
  normalizeRecoveryEmail,
} from "@/lib/passwordRecovery";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 4 * 1024;
const WINDOW_SECONDS = 15 * 60;
const GENERIC_RESPONSE_FLOOR_MS = 1_000;

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

async function genericOk(startedAt: number) {
  const remaining = GENERIC_RESPONSE_FLOOR_MS - (Date.now() - startedAt);
  if (remaining > 0) {
    await new Promise((resolve) => setTimeout(resolve, remaining));
  }

  return noStore(200, {
    ok: true,
    message: GENERIC_PASSWORD_RECOVERY_MESSAGE,
  });
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

  const email = normalizeRecoveryEmail(body.email);

  if (!isRecoveryEmailAddress(email)) {
    return noStore(400, {
      ok: false,
      error: "INVALID_EMAIL",
      message: "Enter a valid email address.",
    });
  }

  const genericStartedAt = Date.now();
  const ip = getClientIp(req);
  const userAgent = req.headers.get("user-agent");

  const ipDecision = await checkRateLimit({
    scope: "AUTH_PASSWORD_RECOVERY_REQUEST_IP",
    keyParts: [ip],
    limit: 10,
    windowSeconds: WINDOW_SECONDS,
    blockSeconds: WINDOW_SECONDS,
    metadata: {
      purpose: "PASSWORD_RECOVERY_REQUEST_IP",
    },
  });

  if (!ipDecision.ok) {
    return noStore(
      429,
      {
        ok: false,
        error: "RATE_LIMITED",
        message: "Too many recovery requests. Try again later.",
        retryAfterSeconds: ipDecision.retryAfterSeconds,
      },
      {
        "Retry-After": String(ipDecision.retryAfterSeconds),
      }
    );
  }

  // Account-specific throttling deliberately returns the same generic success
  // response so it cannot be used to discover registered email addresses.
  const emailDecision = await checkRateLimit({
    scope: "AUTH_PASSWORD_RECOVERY_REQUEST_EMAIL",
    keyParts: [email],
    limit: 3,
    windowSeconds: WINDOW_SECONDS,
    blockSeconds: WINDOW_SECONDS,
    metadata: {
      purpose: "PASSWORD_RECOVERY_REQUEST_EMAIL",
    },
  });

  if (!emailDecision.ok) {
    return genericOk(genericStartedAt);
  }

  await issuePasswordRecovery({
    email,
    ip,
    userAgent,
  });

  return genericOk(genericStartedAt);
}
