import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireApiUserContext } from "@/lib/serverAuth";
import { listHeadteacherSupervisoryReleasedResults } from "@/lib/appraisals/headteacherSupervisoryReleasedResultDiscovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  const code = String(typed?.code ?? "HEADTEACHER_GOVERNANCE_RELEASED_LIST_FAILED");

  if (status >= 500) {
    console.error("[HEADTEACHER_GOVERNANCE_RELEASED_LIST_ERROR]", {
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

export async function GET(req: NextRequest) {
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

  try {
    const items = await listHeadteacherSupervisoryReleasedResults({
      actorUserId: auth.ctx.userId,
      actorRoleName: auth.ctx.roleName,
      actorTenantId: auth.ctx.tenantId,
    });

    return jsonNoStore(200, {
      ok: true,
      reqId,
      items,
    });
  } catch (error) {
    return errorResponse(error, reqId);
  }
}
