//src/app/api/teacher/headteacher-appraisal/_shared.ts
import { NextRequest, NextResponse } from "next/server";

type AppraisalServiceError = Error & {
  code?: unknown;
  status?: unknown;
  details?: unknown;
};

const SAFE_DETAIL_KEYS = new Set([
  "fieldName",
  "sectionKey",
  "itemKey",
  "maximum",
  "cycleStatus",
  "deadlineAt",
  "scoreError",
  "itemKeys",
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

export function objectBody(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function requestMeta(req: NextRequest) {
  return {
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

function safeDetails(value: unknown): Record<string, unknown> | null {
  const body = objectBody(value);
  if (!body) return null;

  const safe = Object.fromEntries(
    Object.entries(body).filter(([key]) => SAFE_DETAIL_KEYS.has(key)),
  );

  return Object.keys(safe).length ? safe : null;
}

export function headteacherFeedbackApiError(args: {
  error: unknown;
  reqId: string;
  logTag: string;
}) {
  const error = args.error as AppraisalServiceError;
  const code = clean(error?.code || error?.message);
  const rawStatus = Number(error?.status);
  const knownServiceError =
    (code.startsWith("HEADTEACHER_FEEDBACK_RESPONSE_") ||
      code.startsWith("HEADTEACHER_FEEDBACK_READ_")) &&
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
      error: "HEADTEACHER_FEEDBACK_REQUEST_FAILED",
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
