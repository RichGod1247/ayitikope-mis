// src/app/api/admin/assessments/policy/route.ts
import { NextResponse } from "next/server";
import { requireApiUserContext } from "@/lib/serverAuth";
import { AssessmentPolicyV1Schema, getTenantAssessmentPolicy, setTenantAssessmentPolicy } from "@/lib/assessments/policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(status: number, payload: any) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

export async function GET(req: Request) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["ADMIN", "SCHOOL_ADMIN", "HEADTEACHER", "SUPERADMIN"],
  });
  if (!auth.ok) return auth.res as any;

  const policy = await getTenantAssessmentPolicy(auth.ctx.tenantId);
  return noStore(200, { ok: true, policy });
}

export async function POST(req: Request) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["ADMIN", "SCHOOL_ADMIN", "HEADTEACHER", "SUPERADMIN"],
  });
  if (!auth.ok) return auth.res as any;

  const body = await req.json().catch(() => null);
  const parsed = AssessmentPolicyV1Schema.safeParse(body?.policy);

  if (!parsed.success) {
    return noStore(400, { ok: false, error: "INVALID_POLICY", details: parsed.error.flatten() });
  }

  const saved = await setTenantAssessmentPolicy(auth.ctx.tenantId, parsed.data);
  return noStore(200, { ok: true, policy: saved });
}