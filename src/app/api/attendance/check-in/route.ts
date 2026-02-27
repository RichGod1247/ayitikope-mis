// src/app/api/attendance/check-in/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(status: number, payload: any) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function cleanStr(v: unknown) {
  return String(v ?? "").trim();
}

function toNumberOrNull(v: unknown) {
  if (v === "" || v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function POST(req: Request) {
  // This endpoint is likely called by a device; keep it JSON-only and predictable.
  const ct = req.headers.get("content-type") || "";
  if (!ct.toLowerCase().includes("application/json")) {
    return json(415, { ok: false, error: "CONTENT_TYPE_MUST_BE_JSON" });
  }

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return json(400, { ok: false, error: "INVALID_JSON" });
    }

    const student_id = cleanStr((body as any).student_id);
    const class_code = cleanStr((body as any).class_code);
    const temperature_c = toNumberOrNull((body as any).temperature_c);

    if (!student_id || !class_code) {
      return json(400, { ok: false, error: "student_id and class_code are required" });
    }

    // Optional sanity bounds (avoid garbage data)
    if (temperature_c != null && (temperature_c < 30 || temperature_c > 45)) {
      return json(400, { ok: false, error: "temperature_c out of expected range" });
    }

    const { error } = await supabaseAdmin.from("attendance").insert([
      {
        student_id,
        class_code,
        method: "manual",
        temperature_c,
        status: "present",
      },
    ]);

    if (error) {
      return json(500, { ok: false, error: `DB_INSERT_ERROR: ${error.message}` });
    }

    return json(200, { ok: true });
  } catch (e: any) {
    return json(500, { ok: false, error: String(e?.message || e) });
  }
}
