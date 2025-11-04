// src/app/api/admin/classes/add/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // In dev we allow without key; in production we require x-admin-key.
    if (process.env.NODE_ENV === "production") {
      const hdr = req.headers.get("x-admin-key");
      if (!hdr || hdr !== process.env.ADMIN_DASHBOARD_KEY) {
        return NextResponse.json(
          { ok: false, error: "Unauthorized" },
          { status: 401 }
        );
      }
    }

    // Minimal validation + normalization
    const class_code = String(body.class_code || "").trim().toUpperCase();
    const class_name = String(body.class_name || "").trim();
    const level = String(body.level || "").trim(); // e.g., KG / Lower Primary / Upper Primary / JHS
    const teacher_id = String(body.teacher_id || "").trim() || null;
    const academic_year = String(body.academic_year || "").trim(); // e.g., 2024/2025
    const term = String(body.term || "").trim(); // e.g., 1 / 2 / 3

    if (!class_code || !class_name || !level) {
      return NextResponse.json(
        { ok: false, error: "class_code, class_name and level are required." },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin
      .from("classes")
      .upsert(
        [
          {
            class_code,
            class_name,
            level,
            teacher_id,
            academic_year: academic_year || null,
            term: term || null,
          },
        ],
        { onConflict: "class_code" }
      );

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
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
