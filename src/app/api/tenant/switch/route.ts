// src/app/api/tenant/switch/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

/**
 * 🚫 Production: Disabled.
 * Tenant switching must be implemented via a proper session/JWT update flow,
 * not by cookies or arbitrary routes.
 */
export async function POST() {
  return NextResponse.json(
    { ok: false, error: "TENANT_SWITCH_DISABLED" },
    { status: 501 }
  );
}
