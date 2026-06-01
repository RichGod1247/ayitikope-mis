// src/app/api/governance/interventions/list/route.ts
import { NextRequest, NextResponse } from "next/server";
import {
  ALL_GOVERNANCE_ROLES,
  requireGovernanceApiContext,
} from "@/lib/governance/scope";
import {
  GovernanceInterventionError,
  listGovernanceInterventionCases,
} from "@/lib/governance/interventions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(status: number, payload: unknown) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function GET(req: NextRequest) {
  const auth = await requireGovernanceApiContext(req, {
    allowedRoles: ALL_GOVERNANCE_ROLES,
  });

  if (!auth.ok) return auth.res;

  const { searchParams } = new URL(req.url);

  try {
    const items = await listGovernanceInterventionCases({
      scope: auth.scope,
      actorUserId: auth.ctx.userId,
      input: {
        status: searchParams.get("status"),
        scopeType: searchParams.get("scopeType"),
        tenantId: searchParams.get("tenantId"),
        zoneId: searchParams.get("zoneId"),
        assignedToMe: searchParams.get("assignedToMe"),
        createdByMe: searchParams.get("createdByMe"),
        take: searchParams.get("take"),
      },
    });

    return json(200, {
      ok: true,
      items,
      count: items.length,
    });
  } catch (err) {
    if (err instanceof GovernanceInterventionError) {
      return json(err.status, { ok: false, error: err.code });
    }

    console.error("[GOVERNANCE_INTERVENTION_LIST_ERROR]", err);

    return json(500, {
      ok: false,
      error: "FAILED_TO_LIST_INTERVENTIONS",
    });
  }
}