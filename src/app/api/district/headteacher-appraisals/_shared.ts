//src/app/api/district/headteacher-appraisals/_shared.ts
import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireGovernanceApiContext } from "@/lib/governance/scope";

export const HEADTEACHER_DIRECTOR_REVIEW_API_POLICY = {
  schemaVersion: 1,
  audience: "DISTRICT_DIRECTOR",
  allowedZoneLevels: [2],
  maximumJsonBodyBytes: 16_384,
  cachePolicy: "NO_STORE",
  respondentIdentitiesReturned: false,
  individualStaffResponsesReturned: false,
  reviewerScoreMutationAllowed: false,
  earlyCompletedStaffFeedbackCanCloseIndependently: true,
  governanceAssessmentRequiredForStaffClosure: false,
  notificationSeedingMode: "RELEASE_ONLY_POST_TRANSACTION",
  providerCallsAllowed: false,
} as const;

type AppraisalServiceError = Error & {
  code?: unknown;
  status?: unknown;
  details?: unknown;
};

const SAFE_DETAIL_KEYS = new Set([
  "fieldName",
  "cycleId",
  "reviewId",
  "assessmentId",
  "status",
  "stage",
  "decision",
  "reason",
  "deadlineAt",
  "eligibleParticipantCount",
  "finalizedResponseCount",
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

export function reviewGovernanceScope(scope: {
  isSuperAdmin: boolean;
  tenantIds: readonly string[];
}) {
  return {
    isSuperAdmin: scope.isSuperAdmin,
    tenantIds: scope.tenantIds,
  };
}

export async function requireDirectorReviewApiContext(req: NextRequest) {
  return requireGovernanceApiContext(req, {
    allowedRoles: [HEADTEACHER_DIRECTOR_REVIEW_API_POLICY.audience],
    allowedZoneLevels: [
      ...HEADTEACHER_DIRECTOR_REVIEW_API_POLICY.allowedZoneLevels,
    ],
  });
}

export async function readJsonObject(args: {
  req: NextRequest;
  reqId: string;
}) {
  const contentType = (args.req.headers.get("content-type") || "").toLowerCase();
  if (!contentType.includes("application/json")) {
    return {
      ok: false as const,
      response: jsonNoStore(415, {
        ok: false,
        reqId: args.reqId,
        error: "JSON_BODY_REQUIRED",
      }),
    };
  }

  const contentLength = Number(args.req.headers.get("content-length") || "0");
  if (
    Number.isFinite(contentLength) &&
    contentLength > HEADTEACHER_DIRECTOR_REVIEW_API_POLICY.maximumJsonBodyBytes
  ) {
    return {
      ok: false as const,
      response: jsonNoStore(413, {
        ok: false,
        reqId: args.reqId,
        error: "JSON_BODY_TOO_LARGE",
      }),
    };
  }

  const body = objectBody(await args.req.json().catch(() => null));
  if (!body) {
    return {
      ok: false as const,
      response: jsonNoStore(400, {
        ok: false,
        reqId: args.reqId,
        error: "INVALID_JSON_BODY",
      }),
    };
  }

  return { ok: true as const, body };
}

function safeDetails(value: unknown): Record<string, unknown> | null {
  const body = objectBody(value);
  if (!body) return null;
  const safe = Object.fromEntries(
    Object.entries(body).filter(([key]) => SAFE_DETAIL_KEYS.has(key)),
  );
  return Object.keys(safe).length ? safe : null;
}

export function directorReviewApiError(args: {
  error: unknown;
  reqId: string;
  logTag: string;
}) {
  const error = args.error as AppraisalServiceError;
  const code = clean(error?.code || error?.message);
  const rawStatus = Number(error?.status);
  const knownServiceError =
    /^[A-Z][A-Z0-9_]{2,159}$/.test(code) &&
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
      error: "HEADTEACHER_DIRECTOR_REVIEW_REQUEST_FAILED",
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
