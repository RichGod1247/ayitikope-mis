// src/app/api/admin/students/status/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH() {
  return NextResponse.json(
    { ok: false, error: "DEPRECATED" },
    { status: 410, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } }
  );
}