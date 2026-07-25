// src/app/api/district/director-feedback/route.ts
import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  getDirectorFeedbackRequestStatus,
  requestDirectorFeedbackWithNotifications,
} from "@/lib/appraisals/directorFeedbackNotifications";
import { requireGovernanceApiContext } from "@/lib/governance/scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RequestBody = {
  confirm?: unknown;
  idempotencyKey?: unknown;
  requestReason?: unknown;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function jsonNoStore(status: number, payload: unknown) {
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

function requestIp(req: NextRequest) {
  return clean(req.headers.get("x-forwarded-for")).split(",")[0]?.trim() || null;
}

function safeError(error: unknown, reqId: string) {
  const value = error as {
    status?: unknown;
    code?: unknown;
    message?: unknown;
  };

  const statusValue = Number(value?.status);
  const status =
    Number.isInteger(statusValue) && statusValue >= 400 && statusValue <= 599
      ? statusValue
      : 500;

  const candidate = clean(value?.code) || clean(value?.message);
  const code = /^[A-Z0-9_]{3,120}$/.test(candidate)
    ? candidate
    : "FAILED_TO_MANAGE_DIRECTOR_FEEDBACK_REQUEST";

  if (status >= 500) {
    console.error("[DISTRICT_DIRECTOR_FEEDBACK_REQUEST_ERROR]", {
      reqId,
      error,
    });
  }

  return jsonNoStore(status, {
    ok: false,
    reqId,
    error: code,
  });
}

async function directorAuth(req: NextRequest) {
  return requireGovernanceApiContext(req, {
    allowedRoles: ["DISTRICT_DIRECTOR"],
    allowedZoneLevels: [2],
  });
}

export async function GET(req: NextRequest) {
  const reqId = randomUUID();
  const auth = await directorAuth(req);

  if (!auth.ok) return auth.res;

  try {
    const status = await getDirectorFeedbackRequestStatus({
      actorUserId: auth.ctx.userId,
    });

    return jsonNoStore(200, {
      ok: true,
      reqId,
      status,
    });
  } catch (error) {
    return safeError(error, reqId);
  }
}

export async function POST(req: NextRequest) {
  const reqId = randomUUID();
  const auth = await directorAuth(req);

  if (!auth.ok) return auth.res;

  const contentType = clean(req.headers.get("content-type")).toLowerCase();
  if (!contentType.includes("application/json")) {
    return jsonNoStore(415, {
      ok: false,
      reqId,
      error: "CONTENT_TYPE_MUST_BE_JSON",
    });
  }

  const body = (await req.json().catch(() => null)) as RequestBody | null;

  if (!body || body.confirm !== true) {
    return jsonNoStore(400, {
      ok: false,
      reqId,
      error: "DIRECTOR_FEEDBACK_REQUEST_CONFIRMATION_REQUIRED",
    });
  }

  const requestReason = clean(body.requestReason).slice(0, 500) || null;
  const headerKey = clean(req.headers.get("x-idempotency-key"));
  const bodyKey = clean(body.idempotencyKey);
  const rawKey = headerKey || bodyKey || reqId;

  if (!/^[A-Za-z0-9:_-]{8,120}$/.test(rawKey)) {
    return jsonNoStore(400, {
      ok: false,
      reqId,
      error: "INVALID_IDEMPOTENCY_KEY",
    });
  }

  try {
    const result = await requestDirectorFeedbackWithNotifications({
      actorUserId: auth.ctx.userId,
      actorRoleName: auth.ctx.roleName,
      cycleKey: `director-self-request-${rawKey}`,
      requestReason,
      reqId,
      ip: requestIp(req),
      userAgent: clean(req.headers.get("user-agent")) || null,
    });

    return jsonNoStore(result.outcome === "CREATED" ? 201 : 200, {
      ok: true,
      reqId,
      outcome: result.outcome,
      status: result.status,
    });
  } catch (error) {
    return safeError(error, reqId);
  }
}
