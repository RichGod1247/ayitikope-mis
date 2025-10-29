// src/app/api/admin/students/status/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * PATCH /api/admin/students/status
 * Body: { student_id: string, status: "reviewed" | "accepted" | "declined" }
 *
 * In production, requires header:  x-admin-key: ADMIN_DASHBOARD_KEY
 */
export async function PATCH(req: Request) {
  try {
    const isProd = process.env.NODE_ENV === "production";
    if (isProd) {
      const hdr = req.headers.get("x-admin-key") || "";
      if (!process.env.ADMIN_DASHBOARD_KEY || hdr !== process.env.ADMIN_DASHBOARD_KEY) {
        return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
      }
    }

    const { student_id, status } = await req.json();

    if (!student_id || !["reviewed", "accepted", "declined"].includes(status)) {
      return NextResponse.json(
        { ok: false, error: "Invalid payload" },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin
      .from("students")
      .update({ status })
      .eq("student_id", student_id);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
