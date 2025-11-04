// src/app/api/admin/assessments/students/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from("students")
      .select("student_id, first_name, last_name, class_code")
      .order("class_code", { ascending: true })
      .order("last_name", { ascending: true })
      .limit(1000);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, students: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
