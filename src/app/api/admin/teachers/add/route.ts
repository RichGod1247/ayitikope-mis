// src/app/api/admin/teachers/add/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      first_name,
      last_name,
      phone,
      email,
      role = "teacher",
      whatsapp_number = null,
      staff_id = null,
    } = body || {};

    if (!first_name?.trim() || !last_name?.trim()) {
      return NextResponse.json({ ok: false, error: "First & last name are required." }, { status: 400 });
    }

    const teacher_id = crypto.randomUUID();

    const { error } = await supabaseAdmin.from("teachers").insert([
      {
        teacher_id,
        first_name: first_name.trim(),
        last_name: last_name.trim(),
        phone: phone?.trim() || null,
        email: email?.trim() || null,
        role,
        whatsapp_number,
        staff_id,
      },
    ]);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, teacher_id });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
