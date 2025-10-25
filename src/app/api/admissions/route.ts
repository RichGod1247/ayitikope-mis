import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // Keys must match Apps Script expectations:
    const payload = {
      level:        body.level || "",
      student_name: body.student_name || "",
      dob:          body.dob || "",
      parent:       body.parent || "",
      phone:        body.phone || "",
      address:      body.address || "",
      notes:        body.notes || ""
    };

    const url = process.env.NEXT_PUBLIC_GAS_ADMISSIONS_URL;
    if (!url) {
      return NextResponse.json({ ok: false, error: "GAS URL not set" }, { status: 500 });
    }

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ ok: false, error: text }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
