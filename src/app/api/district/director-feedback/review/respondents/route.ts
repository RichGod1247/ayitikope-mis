import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getDirectorFeedbackMaskedRespondents } from "@/lib/appraisals/directorFeedbackRespondents";
import { requireGovernanceApiContext } from "@/lib/governance/scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    : "FAILED_TO_LOAD_MASKED_DIRECTOR_FEEDBACK";

  if (status >= 500) {
    console.error("[DISTRICT_DIRECTOR_FEEDBACK_MASKED_ERROR]", {
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

  const cycleId = clean(req.nextUrl.searchParams.get("cycleId"));
  const circuitZoneId = clean(
    req.nextUrl.searchParams.get("circuitZoneId"),
  );
  const maskedRespondentKey =
    clean(req.nextUrl.searchParams.get("maskedRespondentKey")) || null;

  if (!/^[A-Za-z0-9:_-]{5,180}$/.test(cycleId)) {
    return jsonNoStore(400, {
      ok: false,
      reqId,
      error: "DIRECTOR_FEEDBACK_INVALID_CYCLE_ID",
    });
  }

  if (!/^[A-Za-z0-9:_-]{5,180}$/.test(circuitZoneId)) {
    return jsonNoStore(400, {
      ok: false,
      reqId,
      error: "DIRECTOR_FEEDBACK_INVALID_CIRCUIT_ID",
    });
  }

  if (
    maskedRespondentKey &&
    !/^[A-Za-z0-9:_-]{5,180}$/.test(maskedRespondentKey)
  ) {
    return jsonNoStore(400, {
      ok: false,
      reqId,
      error: "DIRECTOR_FEEDBACK_INVALID_MASKED_RESPONDENT_KEY",
    });
  }

  try {
    const result = await getDirectorFeedbackMaskedRespondents({
      actorUserId: auth.ctx.userId,
      actorRoleName: auth.ctx.roleName,
      cycleId,
      circuitZoneId,
      maskedRespondentKey,
    });

    return jsonNoStore(200, {
      ok: true,
      reqId,
      result,
    });
  } catch (error) {
    return safeError(error, reqId);
  }
}
