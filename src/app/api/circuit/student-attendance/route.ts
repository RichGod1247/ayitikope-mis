export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import {
  CIRCUIT_GOVERNANCE_ROLES,
  requireGovernanceApiContext,
} from "@/lib/governance/scope";
import { buildGovernanceStudentAttendance } from "@/lib/governance/studentAttendance";

function noStore(payload: unknown, status = 200) {
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

  const attendance = await buildGovernanceStudentAttendance({
    scope: auth.scope,
    view: "SCHOOL",
  });

  return noStore({ ok: true, attendance });
}
