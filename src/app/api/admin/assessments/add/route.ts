import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const payload = {
      student_id: body.student_id || null,
      class_code: body.class_code || null,
      subject: body.subject || null,
      assessment_type: body.assessment_type || null,
      max_score: body.max_score ?? null,
      score: body.score ?? null,
      date: body.date || null,
      term: body.term || null,
      academic_year: body.academic_year || null,
      grade: body.grade || null,
      comment: body.comment || null,
    };

    const { error } = await supabaseAdmin.from("assessments").insert([payload]);
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
