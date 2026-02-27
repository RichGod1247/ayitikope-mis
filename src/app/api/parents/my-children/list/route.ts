import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET() {
  return NextResponse.json(
    { ok: false, error: "DEPRECATED. Use /api/parent/children (parent-session scoped)." },
    { status: 410, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } }
  );
}