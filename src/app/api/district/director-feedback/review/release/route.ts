// src/app/api/district/director-feedback/review/release/route.ts
import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { releaseDirectorFeedback } from "@/lib/appraisals/directorFeedbackRelease";
import { requireGovernanceApiContext } from "@/lib/governance/scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RequestBody = {
  acknowledgeDevelopmentalPurpose?: unknown;
  confirm?: unknown;
  cycleId?: unknown;
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
  const code = /^[A-Z0-9_]{3,160}$/.test(candidate)
    ? candidate
    : "FAILED_TO_RELEASE_DIRECTOR_FEEDBACK";

  if (status >= 500) {
    console.error("[DISTRICT_DIRECTOR_FEEDBACK_RELEASE_ERROR]", {
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
  if (
    !body ||
    body.confirm !== true ||
    body.acknowledgeDevelopmentalPurpose !== true
  ) {
    return jsonNoStore(400, {
      ok: false,
      reqId,
      error: "DIRECTOR_FEEDBACK_RELEASE_CONFIRMATION_REQUIRED",
    });
  }

  const cycleId = clean(body.cycleId);
  if (!/^[0-9a-f-]{20,60}$/i.test(cycleId)) {
    return jsonNoStore(400, {
      ok: false,
      reqId,
      error: "DIRECTOR_FEEDBACK_INVALID_CYCLE_ID",
    });
  }

  try {
    const result = await releaseDirectorFeedback({
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
      workspace: result.workspace,
    });
  } catch (error) {
    return safeError(error, reqId);
  }
}
