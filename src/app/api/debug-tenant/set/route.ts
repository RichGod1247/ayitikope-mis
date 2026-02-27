// src/app/api/debug-tenant/set/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      ok: false,
      error: "GONE",
      message:
        "debug-tenant cookie switching is disabled. Use session.update({ tenantId }) + /api/tenants/mine.",
    },
    { status: 410 }
  );
}
