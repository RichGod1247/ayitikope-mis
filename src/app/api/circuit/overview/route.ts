// src/app/api/circuit/overview/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import {
  CIRCUIT_GOVERNANCE_ROLES,
  buildGovernanceOverview,
  requireGovernanceApiContext,
} from "@/lib/governance/scope";

function noStore(payload: any, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function GET(req: Request) {
  const auth = await requireGovernanceApiContext(req, {
    allowedRoles: CIRCUIT_GOVERNANCE_ROLES,
    allowedZoneLevels: [1],
  });

  if (!auth.ok) return auth.res;

  const overview = await buildGovernanceOverview(auth.scope);

  return noStore({
    ok: true,
    scope: {
      isSuperAdmin: auth.scope.isSuperAdmin,
      assignments: auth.scope.assignments,
      zoneCount: auth.scope.zoneIds.length,
      tenantCount: auth.scope.tenantIds.length,
    },
    overview,
  });
}