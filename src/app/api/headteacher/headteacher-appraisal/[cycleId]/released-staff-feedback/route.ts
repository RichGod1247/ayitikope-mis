import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireApiUserContext } from "@/lib/serverAuth";
import { readHeadteacherStaffFeedbackReleasedResult } from "@/lib/appraisals/headteacherStaffFeedbackReleasedResult";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const HEADTEACHER_STAFF_FEEDBACK_RELEASED_RESULT_API_POLICY = {
  audience: "RELEASED_HEADTEACHER_STAFF_FEEDBACK",
  method: "GET",
  requireTenant: true,
  requireRoleNames: ["HEADTEACHER"] as const,
  noStore: true,
  respondentIdentitiesIncluded: false,
  individualStaffResponsesIncluded: false,
  participantListIncluded: false,
  responseCountsIncluded: false,
  staffItemAveragesIncluded: false,
  governanceAssessmentIncluded: false,
  reviewerIdentityIncluded: false,
  databaseWritesAllowed: false,
  notificationsSeeded: false,
  providerCallsAllowed: false,
} as const;

type RouteContext = {
  params: Promise<{ cycleId: string }> | { cycleId: string };
};

type ServiceError = Error & { code?: unknown; status?: unknown };

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function isLikelyIdentifier(value: unknown) {
  return /^[A-Za-z0-9_-]{5,180}$/.test(clean(value));
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

function serviceError(error: unknown, reqId: string) {
  const candidate = error as ServiceError;
  const code = clean(candidate?.code || candidate?.message);
  const status = Number(candidate?.status);
  if (
    code.startsWith("HEADTEACHER_STAFF_FEEDBACK_RELEASED_RESULT_") &&
    Number.isInteger(status) &&
    status >= 400 &&
    status <= 499
  ) {
    return jsonNoStore(status, {
      ok: false,
      reqId,
      error: code,
    });
  }

  console.error("[HEADTEACHER_STAFF_FEEDBACK_RELEASED_RESULT_API_ERROR]", {
    reqId,
    error,
  });
  return jsonNoStore(500, {
    ok: false,
    reqId,
    error: "HEADTEACHER_STAFF_FEEDBACK_RELEASED_RESULT_REQUEST_FAILED",
  });
}

export async function GET(req: NextRequest, context: RouteContext) {
  const reqId = randomUUID();
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["HEADTEACHER"],
  });

  if (!auth.ok) {
    return jsonNoStore(auth.res.status, {
      ok: false,
      reqId,
      error: auth.res.status === 401 ? "UNAUTHORIZED" : "FORBIDDEN",
    });
  }

  const params = await Promise.resolve(context.params);
  const cycleId = clean(params?.cycleId);
  if (!isLikelyIdentifier(cycleId)) {
    return jsonNoStore(400, {
      ok: false,
      reqId,
      error: "INVALID_CYCLE_ID",
    });
  }

  try {
    const item = await readHeadteacherStaffFeedbackReleasedResult({
      actorUserId: auth.ctx.userId,
      actorRoleName: auth.ctx.roleName,
      actorTenantId: auth.ctx.tenantId,
      cycleId,
    });

    return jsonNoStore(200, {
      ok: true,
      reqId,
      item,
    });
  } catch (error) {
    return serviceError(error, reqId);
  }
}
