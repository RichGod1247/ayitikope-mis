// src/app/api/attendance/check-in/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const student_id = String(body.student_id || "").trim();
    const class_code = String(body.class_code || "").trim();
    const temperature_c =
      body.temperature_c === "" || body.temperature_c == null
        ? null
        : Number(body.temperature_c);

    if (!student_id || !class_code) {
      return NextResponse.json(
        { ok: false, error: "student_id and class_code are required" },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin.from("attendance").insert([
      {
        student_id,
        class_code,
        method: "manual",
        temperature_c,
        status: "present",
        // date/check_in_time default to now() on the DB, per your schema
      },
    ]);

    if (error) {
      return NextResponse.json(
        { ok: false, error: `DB insert error: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
