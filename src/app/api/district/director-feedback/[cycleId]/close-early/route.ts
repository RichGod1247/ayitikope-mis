import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { generateDirectorFeedbackAggregateSnapshot } from "@/lib/appraisals/directorFeedbackClosure";
import { closeCompletedDirectorFeedbackCycleEarly } from "@/lib/appraisals/directorFeedbackEarlyClosure";
import { requireGovernanceApiContext } from "@/lib/governance/scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 16 * 1024;
const ALLOWED_BODY_FIELDS = new Set(["confirm"]);

type RouteContext = {
  params: Promise<{ cycleId: string }> | { cycleId: string };
};

type RequestBody = {
  confirm?: unknown;
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
  const code = /^[A-Z0-9_]{3,180}$/.test(candidate)
    ? candidate
    : "FAILED_TO_CLOSE_DIRECTOR_FEEDBACK_EARLY";

  if (status >= 500) {
    console.error("[DISTRICT_DIRECTOR_FEEDBACK_EARLY_CLOSE_ERROR]", {
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

function bodyContainsOnlyAllowedFields(body: Record<string, unknown>) {
  return Object.keys(body).every((key) => ALLOWED_BODY_FIELDS.has(key));
}

async function directorAuth(req: NextRequest) {
  return requireGovernanceApiContext(req, {
    allowedRoles: ["DISTRICT_DIRECTOR"],
    allowedZoneLevels: [2],
  });
}

export async function POST(req: NextRequest, context: RouteContext) {
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

  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return jsonNoStore(413, {
      ok: false,
      reqId,
      error: "DIRECTOR_FEEDBACK_EARLY_CLOSE_BODY_TOO_LARGE",
    });
  }

  const params = await Promise.resolve(context.params);
  const cycleId = clean(params?.cycleId);
  if (!/^[0-9a-f-]{20,60}$/i.test(cycleId)) {
    return jsonNoStore(400, {
      ok: false,
      reqId,
      error: "DIRECTOR_FEEDBACK_INVALID_CYCLE_ID",
    });
  }

  const body = (await req.json().catch(() => null)) as RequestBody | null;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return jsonNoStore(400, {
      ok: false,
      reqId,
      error: "INVALID_JSON_BODY",
    });
  }

  if (!bodyContainsOnlyAllowedFields(body as Record<string, unknown>)) {
    return jsonNoStore(400, {
      ok: false,
      reqId,
      error: "DIRECTOR_FEEDBACK_EARLY_CLOSE_FIELDS_FORBIDDEN",
    });
  }

  if (body.confirm !== true) {
    return jsonNoStore(400, {
      ok: false,
      reqId,
      error: "DIRECTOR_FEEDBACK_EARLY_CLOSE_CONFIRMATION_REQUIRED",
    });
  }

  try {
    const closure = await closeCompletedDirectorFeedbackCycleEarly({
      actorUserId: auth.ctx.userId,
      actorRoleName: auth.ctx.roleName,
      cycleId,
      confirm: true,
      reqId,
      ip: requestIp(req),
      userAgent: clean(req.headers.get("user-agent")) || null,
    });

    const aggregate = await generateDirectorFeedbackAggregateSnapshot({
      cycleId,
      reqId,
    });

    return jsonNoStore(closure.outcome === "CLOSED" ? 201 : 200, {
      ok: true,
      reqId,
      closure,
      aggregate,
      providerCalled: false,
    });
  } catch (error) {
    return safeError(error, reqId);
  }
}
