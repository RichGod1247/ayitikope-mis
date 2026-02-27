// src/app/api/students/contacts/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStoreJson(status: number, payload: any) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

/**
 * DEPRECATED:
 * This route used to store guardian contacts inside tenant.settingsJson.
 * That is no longer the source of truth.
 * Use: GET /api/students/contacts/list (Student table)
 */
export async function GET() {
  return noStoreJson(410, { ok: false, error: "DEPRECATED" });
}

export async function POST() {
  return noStoreJson(410, { ok: false, error: "DEPRECATED" });
}