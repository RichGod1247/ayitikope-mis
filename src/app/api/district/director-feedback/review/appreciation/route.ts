import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  getDirectorFeedbackAppreciationStatus,
  sendDirectorFeedbackAppreciation,
} from "@/lib/appraisals/directorFeedbackAppreciation";
import { requireGovernanceApiContext } from "@/lib/governance/scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_BODY_FIELDS = new Set(["confirm", "cycleId"]);

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
  const code = /^[A-Z0-9_]{3,140}$/.test(candidate)
    ? candidate
    : "FAILED_TO_MANAGE_DIRECTOR_FEEDBACK_APPRECIATION";

  if (status >= 500) {
    console.error("[DISTRICT_DIRECTOR_FEEDBACK_APPRECIATION_ERROR]", {
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

function validCycleId(value: unknown) {
  const cycleId = clean(value);
  return /^[0-9a-f-]{20,60}$/i.test(cycleId) ? cycleId : null;
}

export async function GET(req: NextRequest) {
  const reqId = randomUUID();
  const auth = await directorAuth(req);

  if (!auth.ok) return auth.res;

  const cycleId = validCycleId(req.nextUrl.searchParams.get("cycleId"));
  if (!cycleId) {
    return jsonNoStore(400, {
      ok: false,
      reqId,
      error: "DIRECTOR_FEEDBACK_INVALID_CYCLE_ID",
    });
  }

  try {
    const status = await getDirectorFeedbackAppreciationStatus({
      actorUserId: auth.ctx.userId,
      actorRoleName: auth.ctx.roleName,
      cycleId,
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

  const body = (await req.json().catch(() => null)) as
    | Record<string, unknown>
    | null;

  if (!body || Array.isArray(body)) {
    return jsonNoStore(400, {
      ok: false,
      reqId,
      error: "INVALID_JSON_BODY",
    });
  }

  if (!Object.keys(body).every((key) => ALLOWED_BODY_FIELDS.has(key))) {
    return jsonNoStore(400, {
      ok: false,
      reqId,
      error: "DIRECTOR_FEEDBACK_APPRECIATION_BODY_FIELDS_INVALID",
    });
  }

  if (body.confirm !== true) {
    return jsonNoStore(400, {
      ok: false,
      reqId,
      error: "DIRECTOR_FEEDBACK_APPRECIATION_CONFIRMATION_REQUIRED",
    });
  }

  const cycleId = validCycleId(body.cycleId);
  if (!cycleId) {
    return jsonNoStore(400, {
      ok: false,
      reqId,
      error: "DIRECTOR_FEEDBACK_INVALID_CYCLE_ID",
    });
  }

  try {
    const result = await sendDirectorFeedbackAppreciation({
      actorUserId: auth.ctx.userId,
      actorRoleName: auth.ctx.roleName,
      cycleId,
      reqId,
      ip: requestIp(req),
      userAgent: clean(req.headers.get("user-agent")) || null,
    });

    return jsonNoStore(200, {
      ok: true,
      reqId,
      outcome: result.outcome,
      rowsInserted: result.rowsInserted,
      status: result.status,
    });
  } catch (error) {
    return safeError(error, reqId);
  }
}
