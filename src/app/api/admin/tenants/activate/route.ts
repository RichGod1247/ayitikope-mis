import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error: "LEGACY_ACTIVATION_DISABLED",
      message:
        "Tenant activation must now be performed by a signed-in SUPERADMIN through /api/admin/super/tenants/status.",
    },
    {
      status: 410,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    }
  );
}