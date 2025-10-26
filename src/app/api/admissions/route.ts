import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const form = await req.json();
    const url = process.env.GAS_WEBAPP_URL!;
    if (!url) {
      return NextResponse.json(
        { ok: false, error: "Missing GAS_WEBAPP_URL" },
        { status: 500 }
      );
    }

    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // tell Apps Script which tab to write to
      body: JSON.stringify({ type: "admissions", ...form }),
      cache: "no-store",
    });

    // try to parse Apps Script JSON (handle non-JSON gracefully)
    let data: any = {};
    try {
      data = await r.json();
    } catch {
      data = {};
    }

    return NextResponse.json({ ok: !!data.ok });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
