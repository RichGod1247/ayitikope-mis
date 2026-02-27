// src/app/api/attendance/route.ts
import { NextResponse } from "next/server";

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

export async function POST(req: Request) {
  const ct = req.headers.get("content-type") || "";
  if (!ct.toLowerCase().includes("application/json")) {
    return json(415, { ok: false, error: "CONTENT_TYPE_MUST_BE_JSON" });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, error: "INVALID_JSON" });
  }

  const url = process.env.GAS_ATTENDANCE_URL;
  if (!url) {
    return json(500, { ok: false, error: "GAS_ATTENDANCE_URL_NOT_SET" });
  }

  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    const data = await r.json().catch(() => null);

    if (!r.ok) {
      return json(502, {
        ok: false,
        error: "UPSTREAM_ERROR",
        upstreamStatus: r.status,
        upstreamBody: data,
      });
    }

    return json(200, { ok: !!data?.ok, upstream: data });
  } catch (e: any) {
    return json(502, { ok: false, error: "UPSTREAM_FETCH_FAILED", detail: String(e?.message || e) });
  }
}
