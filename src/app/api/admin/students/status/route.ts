// src/app/api/admin/students/status/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { queueNotification } from "@/lib/notify";

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const student_id = String(body?.student_id || "");
    const status = String(body?.status || "");

    if (!student_id || !["reviewed", "accepted", "declined"].includes(status)) {
      return NextResponse.json({ ok: false, error: "Invalid input" }, { status: 400 });
    }

    // 1) Update student status
    const { data: updated, error } = await supabaseAdmin
      .from("students")
      .update({ status })
      .eq("student_id", student_id)
      .select(
        "student_id, first_name, last_name, applied_level, guardian_primary_name, guardian_primary_phone"
      )
      .maybeSingle();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    if (!updated) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }

    // 2) Queue notifications (simple queue; actual send comes later)
    const studentName = [updated.first_name, updated.last_name].filter(Boolean).join(" ").trim() || "Your ward";
    const level = updated.applied_level || "Basic";
    const parentName = updated.guardian_primary_name || "Parent/Guardian";
    const phone = (updated.guardian_primary_phone || "").trim();

    // Only queue if we have a phone number
    if (phone && (status === "accepted" || status === "declined")) {
      const template_key = status === "accepted" ? "admission_accepted" : "admission_declined";

      await queueNotification({
        channel: "whatsapp",               // later you can branch to SMS/Email
        template_key,
        recipient: phone,
        student_id,
        meta: {
          parentName,
          studentName,
          level,
          status,
          // A human-friendly fallback message (for testing / future sender)
          message:
            status === "accepted"
              ? `Hello ${parentName}, ${studentName} has been ACCEPTED to ${level}. We will contact you with next steps.`
              : `Hello ${parentName}, ${studentName}'s application to ${level} was DECLINED. Please contact the school for assistance.`,
        },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
