//src/app/api/headteacher/headteacher-appraisal/[cycleId]/released-result/route.ts
import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireApiUserContext } from "@/lib/serverAuth";
import { readHeadteacherReleasedResult } from "@/lib/appraisals/headteacherReleasedResult";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const HEADTEACHER_RELEASED_RESULT_API_POLICY = {
  audience: "RELEASED_HEADTEACHER",
  method: "GET",
  requireTenant: true,
  requireRoleNames: ["HEADTEACHER"] as const,
  cycleIdentifierMaximumLength: 180,
  noStore: true,
  respondentIdentitiesIncluded: false,
  individualStaffResponsesIncluded: false,
  participantListIncluded: false,
  responseCountsIncluded: false,
  staffItemAveragesIncluded: false,
  itemLevelValuesIncluded: "SUPERVISORY_ONLY",
  supervisoryItemScoresIncluded: true,
  supervisoryItemScoresReadOnly: true,
  reviewerIdentityIncluded: false,
  assessorIdentityIncluded: false,
  scoreMutationAllowed: false,
  databaseWritesAllowed: false,
  notificationsSeeded: false,
  providerCallsAllowed: false,
} as const;

type RouteContext = {
  params: Promise<{ cycleId: string }> | { cycleId: string };
};

type ReleasedResultServiceError = Error & {
  code?: unknown;
  status?: unknown;
};

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

function releasedResultApiError(args: {
  error: unknown;
  reqId: string;
}) {
  const error = args.error as ReleasedResultServiceError;
  const code = clean(error?.code || error?.message);
  const status = Number(error?.status);
  const knownServiceError =
    code.startsWith("HEADTEACHER_RELEASED_RESULT_") &&
    Number.isInteger(status) &&
    status >= 400 &&
    status <= 499;

  if (!knownServiceError) {
    console.error("[HEADTEACHER_RELEASED_RESULT_API_ERROR]", {
      reqId: args.reqId,
      error: args.error,
    });

    return jsonNoStore(500, {
      ok: false,
      reqId: args.reqId,
      error: "HEADTEACHER_RELEASED_RESULT_REQUEST_FAILED",
    });
  }

  return jsonNoStore(status, {
    ok: false,
    reqId: args.reqId,
    error: code,
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
    const item = await readHeadteacherReleasedResult({
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
    return releasedResultApiError({
      error,
      reqId,
    });
  }
}
