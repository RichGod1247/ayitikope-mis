// src/app/api/governance/interventions/update/route.ts
import { NextRequest, NextResponse } from "next/server";
import {
  ALL_GOVERNANCE_ROLES,
  requireGovernanceApiContext,
} from "@/lib/governance/scope";
import {
  GovernanceInterventionError,
  updateGovernanceInterventionCase,
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

export async function POST(req: NextRequest) {
  const auth = await requireGovernanceApiContext(req, {
    allowedRoles: ALL_GOVERNANCE_ROLES,
  });

  if (!auth.ok) return auth.res;

  const body = (await req.json().catch(() => null)) ?? {};

  try {
    const item = await updateGovernanceInterventionCase({
      scope: auth.scope,
      actorUserId: auth.ctx.userId,
      input: body,
    });

    return json(200, {
      ok: true,
      item,
    });
  } catch (err) {
    if (err instanceof GovernanceInterventionError) {
      return json(err.status, { ok: false, error: err.code });
    }

    console.error("[GOVERNANCE_INTERVENTION_UPDATE_ERROR]", err);

    return json(500, {
      ok: false,
      error: "FAILED_TO_UPDATE_INTERVENTION",
    });
  }
}