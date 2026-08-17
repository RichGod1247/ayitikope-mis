import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireApiUserContext } from "@/lib/serverAuth";
import { readHeadteacherSupervisoryReleasedResult } from "@/lib/appraisals/headteacherSupervisoryReleasedResult";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params:
    | Promise<{ assessmentId: string }>
    | { assessmentId: string };
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function isUuidIdentifier(value: unknown) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    clean(value),
  );
}

function jsonNoStore(status: number, payload: unknown) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}

function errorResponse(error: unknown, reqId: string) {
  const typed = error as Error & { code?: string; status?: number };
  const status =
    Number.isInteger(typed?.status) && Number(typed.status) >= 400 && Number(typed.status) <= 599
      ? Number(typed.status)
      : 500;
  const code = String(typed?.code ?? "HEADTEACHER_GOVERNANCE_RELEASED_DETAIL_FAILED");

  if (status >= 500) {
    console.error("[HEADTEACHER_GOVERNANCE_RELEASED_DETAIL_ERROR]", {
      reqId,
      code,
    });
  }

  return jsonNoStore(status, {
    ok: false,
    reqId,
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

  if (new URL(req.url).searchParams.size !== 0) {
    return jsonNoStore(400, {
      ok: false,
      reqId,
      error: "HEADTEACHER_GOVERNANCE_RELEASED_QUERY_FIELDS_FORBIDDEN",
    });
  }

  const params = await Promise.resolve(context.params);
  const assessmentId = clean(params?.assessmentId);

  if (!isUuidIdentifier(assessmentId)) {
    return jsonNoStore(400, {
      ok: false,
      reqId,
      error: "INVALID_ASSESSMENT_ID",
    });
  }

  try {
    const result = await readHeadteacherSupervisoryReleasedResult({
      actorUserId: auth.ctx.userId,
      actorRoleName: auth.ctx.roleName,
      actorTenantId: auth.ctx.tenantId,
      assessmentId,
    });

    return jsonNoStore(200, {
      ok: true,
      reqId,
      result,
    });
  } catch (error) {
    return errorResponse(error, reqId);
  }
}
