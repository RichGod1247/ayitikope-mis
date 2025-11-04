// src/app/api/admin/teachers/delete/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: Request) {
  try {
    const { teacher_id } = await req.json();
    if (!teacher_id) {
      return NextResponse.json({ ok: false, error: "teacher_id is required." }, { status: 400 });
    }

    // Optional safety: if any class references this teacher, block delete
    const { data: classesUsing, error: refErr } = await supabaseAdmin
      .from("classes")
      .select("class_code")
      .eq("teacher_id", teacher_id)
      .limit(1);

    if (refErr) {
      return NextResponse.json({ ok: false, error: refErr.message }, { status: 500 });
    }
    if (classesUsing?.length) {
      return NextResponse.json({
        ok: false,
        error: "Teacher is assigned to at least one class. Unassign before deleting.",
      }, { status: 409 });
    }

    const { error } = await supabaseAdmin.from("teachers").delete().eq("teacher_id", teacher_id);
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
