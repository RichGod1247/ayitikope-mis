import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireGovernanceApiContext } from "@/lib/governance/scope";
import { HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY } from "@/lib/appraisals/headteacherSupervisoryAssessment";

type AppraisalServiceError = Error & {
  code?: unknown;
  status?: unknown;
  details?: unknown;
};

const SAFE_DETAIL_KEYS = new Set([
  "fieldName",
  "sectionKey",
  "itemKey",
  "reason",
  "cycleId",
  "assessmentId",
  "status",
  "missingItemKeys",
]);

export function jsonNoStore(status: number, payload: unknown) {
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

export function clean(value: unknown) {
  return String(value ?? "").trim();
}

export function isLikelyIdentifier(value: unknown) {
  return /^[A-Za-z0-9_-]{5,180}$/.test(clean(value));
}

export function isUuidIdentifier(value: unknown) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    clean(value),
  );
}

export function isIsoDate(value: unknown) {
  return /^\d{4}-\d{2}-\d{2}$/.test(clean(value));
}

export function isDirectAssessmentKey(value: unknown) {
  const key = clean(value);
  return (
    key.length >= 8 &&
    key.length <= 120 &&
    /^[A-Za-z0-9._:-]+$/.test(key)
  );
}

export function objectBody(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function requestMeta(req: NextRequest) {
  return {
    reqId: randomUUID(),
    ip:
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      null,
    userAgent: req.headers.get("user-agent") || null,
  };
}

export function requestIsJson(req: NextRequest) {
  return (req.headers.get("content-type") || "")
    .toLowerCase()
    .includes("application/json");
}

const MAX_JSON_BODY_BYTES = 16_384;

export async function readBoundedJsonObject(req: NextRequest): Promise<
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; status: number; error: string }
> {
  const declaredLength = Number(req.headers.get("content-length") || "0");
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_JSON_BODY_BYTES
  ) {
    return { ok: false, status: 413, error: "REQUEST_BODY_TOO_LARGE" };
  }

  const text = await req.text();
  if (new TextEncoder().encode(text).byteLength > MAX_JSON_BODY_BYTES) {
    return { ok: false, status: 413, error: "REQUEST_BODY_TOO_LARGE" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, status: 400, error: "INVALID_JSON_BODY" };
  }

  const body = objectBody(parsed);
  if (!body) {
    return { ok: false, status: 400, error: "JSON_OBJECT_REQUIRED" };
  }

  return { ok: true, body };
}

export async function requireSupervisoryGovernanceApiContext(req: NextRequest) {
  return requireGovernanceApiContext(req, {
    allowedRoles:
      HEADTEACHER_SUPERVISORY_ASSESSMENT_POLICY.operationalAssessorRoles,
  });
}

function safeDetails(value: unknown): Record<string, unknown> | null {
  const body = objectBody(value);
  if (!body) return null;

  const safe = Object.fromEntries(
    Object.entries(body).filter(([key]) => SAFE_DETAIL_KEYS.has(key)),
  );

  return Object.keys(safe).length ? safe : null;
}

export function supervisoryApiError(args: {
  error: unknown;
  reqId: string;
  logTag: string;
}) {
  const error = args.error as AppraisalServiceError;
  const code = clean(error?.code || error?.message);
  const rawStatus = Number(error?.status);

  const knownServiceError =
    code.startsWith("HEADTEACHER_SUPERVISORY_") &&
    Number.isInteger(rawStatus) &&
    rawStatus >= 400 &&
    rawStatus <= 499;

  if (!knownServiceError) {
    console.error(args.logTag, {
      reqId: args.reqId,
      error: args.error,
    });

    return jsonNoStore(500, {
      ok: false,
      reqId: args.reqId,
      error: "HEADTEACHER_SUPERVISORY_REQUEST_FAILED",
    });
  }

  const details = safeDetails(error.details);

  return jsonNoStore(rawStatus, {
    ok: false,
    reqId: args.reqId,
    error: code,
    ...(details ? { details } : {}),
  });
}
