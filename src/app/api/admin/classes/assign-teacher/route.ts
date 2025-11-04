// src/app/api/admin/classes/assign-teacher/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function PATCH(req: Request) {
  try {
    const { class_code, teacher_id } = await req.json();

    if (!class_code || typeof class_code !== "string") {
      return NextResponse.json(
        { ok: false, error: "Missing or invalid class_code." },
        { status: 400 }
      );
    }

    // Allow null (Unassigned)
    if (teacher_id !== null && typeof teacher_id !== "string") {
      return NextResponse.json(
        { ok: false, error: "Invalid teacher_id." },
        { status: 400 }
      );
    }

    // If a teacher_id was provided, validate it exists to avoid FK violation
    if (teacher_id) {
      const { data: trow, error: terr } = await supabaseAdmin
        .from("teachers")
        .select("teacher_id")
        .eq("teacher_id", teacher_id)
        .single();

      if (terr || !trow) {
        return NextResponse.json(
          { ok: false, error: "Teacher not found. Choose a valid teacher." },
          { status: 400 }
        );
      }
    }

    // Update the class row
    const { error: uerr } = await supabaseAdmin
      .from("classes")
      .update({ teacher_id }) // null or a validated id
      .eq("class_code", class_code);

    if (uerr) {
      return NextResponse.json(
        { ok: false, error: `DB update error: ${uerr.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
