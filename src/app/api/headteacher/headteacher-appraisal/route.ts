import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireApiUserContext } from "@/lib/serverAuth";
import { requestHeadteacherFeedbackCycle } from "@/lib/appraisals/headteacherFeedbackRequest";
import { readHeadteacherOwnAppraisalState } from "@/lib/appraisals/headteacherFeedbackReadStates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const HEADTEACHER_APPRAISAL_REQUEST_API_POLICY = {
  audience: "HEADTEACHER",
  methods: ["GET", "POST"] as const,
  requireTenant: true,
  requireRoleNames: ["HEADTEACHER"] as const,
  cachePolicy: "NO_STORE",
  maximumJsonBodyBytes: 8_192,
  selfRequestOnly: true,
  requestedRespondentSelectionAllowed: false,
  notificationsSeeded: false,
  providerCallsAllowed: false,
} as const;

type ServiceError = Error & {
  code?: unknown;
  status?: unknown;
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

function requestError(error: unknown, reqId: string) {
  const typed = error as ServiceError;
  const code = clean(typed?.code || typed?.message);
  const status = Number(typed?.status);
  const known =
    code.startsWith("HEADTEACHER_FEEDBACK_") &&
    Number.isInteger(status) &&
    status >= 400 &&
    status <= 499;

  if (!known) {
    console.error("[HEADTEACHER_APPRAISAL_REQUEST_API_ERROR]", {
      reqId,
      error,
    });

    return jsonNoStore(500, {
      ok: false,
      reqId,
      error: "HEADTEACHER_APPRAISAL_REQUEST_FAILED",
    });
  }

  return jsonNoStore(status, {
    ok: false,
    reqId,
    error: code,
  });
}

async function requireHeadteacher(req: NextRequest, reqId: string) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["HEADTEACHER"],
  });

  if (!auth.ok) {
    return {
      ok: false as const,
      response: jsonNoStore(auth.res.status, {
        ok: false,
        reqId,
        error: auth.res.status === 401 ? "UNAUTHORIZED" : "FORBIDDEN",
      }),
    };
  }

  return { ok: true as const, auth };
}

export async function GET(req: NextRequest) {
  const reqId = randomUUID();
  const access = await requireHeadteacher(req, reqId);
  if (!access.ok) return access.response;

  try {
    const state = await readHeadteacherOwnAppraisalState({
      actorUserId: access.auth.ctx.userId,
      actorRoleName: access.auth.ctx.roleName,
      tenantId: access.auth.ctx.tenantId,
    });

    return jsonNoStore(200, {
      ok: true,
      reqId,
      state,
    });
  } catch (error) {
    return requestError(error, reqId);
  }
}

export async function POST(req: NextRequest) {
  const reqId = randomUUID();
  const access = await requireHeadteacher(req, reqId);
  if (!access.ok) return access.response;

  const contentType = (req.headers.get("content-type") || "").toLowerCase();
  if (!contentType.includes("application/json")) {
    return jsonNoStore(415, {
      ok: false,
      reqId,
      error: "JSON_BODY_REQUIRED",
    });
  }

  const contentLength = Number(req.headers.get("content-length") || "0");
  if (
    Number.isFinite(contentLength) &&
    contentLength > HEADTEACHER_APPRAISAL_REQUEST_API_POLICY.maximumJsonBodyBytes
  ) {
    return jsonNoStore(413, {
      ok: false,
      reqId,
      error: "JSON_BODY_TOO_LARGE",
    });
  }

  const body = (await req.json().catch(() => null)) as
    | Record<string, unknown>
    | null;

  if (!body || Array.isArray(body) || typeof body !== "object") {
    return jsonNoStore(400, {
      ok: false,
      reqId,
      error: "INVALID_JSON_BODY",
    });
  }

  if (body.confirm !== true) {
    return jsonNoStore(400, {
      ok: false,
      reqId,
      error: "EXPLICIT_CONFIRMATION_REQUIRED",
    });
  }

  const requestKey = clean(
    req.headers.get("x-idempotency-key") || body.requestKey,
  );

  if (!/^[A-Za-z0-9:_-]{8,120}$/.test(requestKey)) {
    return jsonNoStore(400, {
      ok: false,
      reqId,
      error: "INVALID_IDEMPOTENCY_KEY",
    });
  }

  try {
    const result = await requestHeadteacherFeedbackCycle({
      actorUserId: access.auth.ctx.userId,
      actorRoleName: access.auth.ctx.roleName,
      actorTenantId: access.auth.ctx.tenantId,
      targetHeadteacherUserId: access.auth.ctx.userId,
      requestKey,
      requestReason: null,
      requestedRespondentUserIds: undefined,
      reqId,
      ip:
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        req.headers.get("x-real-ip") ||
        null,
      userAgent: req.headers.get("user-agent") || null,
    });

    const state = await readHeadteacherOwnAppraisalState({
      actorUserId: access.auth.ctx.userId,
      actorRoleName: access.auth.ctx.roleName,
      tenantId: access.auth.ctx.tenantId,
    });

    return jsonNoStore(result.outcome === "CREATED" ? 201 : 200, {
      ok: true,
      reqId,
      result,
      state,
      providerCalled: false,
    });
  } catch (error) {
    return requestError(error, reqId);
  }
}
