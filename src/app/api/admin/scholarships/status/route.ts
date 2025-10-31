import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type Payload = {
  id: string; // scholarship_applications.id (uuid)
  status: "accepted" | "rejected" | "reviewed";
};

export async function PATCH(req: Request) {
  try {
    const body = (await req.json()) as Payload;

    if (!body?.id || !body?.status) {
      return NextResponse.json(
        { ok: false, error: "Missing id or status" },
        { status: 400 }
      );
    }

    // 1) Fetch the application (for message context)
    const { data: app, error: getErr } = await supabaseAdmin
      .from("scholarship_applications")
      .select("*")
      .eq("id", body.id)
      .maybeSingle();

    if (getErr) {
      return NextResponse.json(
        { ok: false, error: `Fetch error: ${getErr.message}` },
        { status: 500 }
      );
    }
    if (!app) {
      return NextResponse.json(
        { ok: false, error: "Application not found" },
        { status: 404 }
      );
    }

    // 2) Update status on the application
    const { error: updErr } = await supabaseAdmin
      .from("scholarship_applications")
      .update({ status: body.status })
      .eq("id", body.id);

    if (updErr) {
      return NextResponse.json(
        { ok: false, error: `Update error: ${updErr.message}` },
        { status: 500 }
      );
    }

    // 3) Enqueue WhatsApp notification (notifications_log)
    const template_key =
      body.status === "accepted"
        ? "scholarship_accepted"
        : body.status === "rejected"
        ? "scholarship_rejected"
        : "scholarship_reviewed";

    const parentName = app.guardian_name || "Parent/Guardian";
    const studentName = app.student_name || "your ward";
    const level = app.level || "the school";

    const meta = {
      parentName,
      studentName,
      level,
      status: body.status,
      message:
        body.status === "accepted"
          ? `Hello ${parentName}, ${studentName} has been ACCEPTED for scholarship consideration at ${level}. We’ll contact you with next steps.`
          : body.status === "rejected"
          ? `Hello ${parentName}, we’re sorry—${studentName} was NOT selected for a scholarship at this time.`
          : `Hello ${parentName}, ${studentName}’s scholarship application has been marked as REVIEWED.`,
    };

    const recipient =
      (app.guardian_phone as string | null)?.trim() || app.parent_phone || null;

    if (recipient) {
      const { error: logErr } = await supabaseAdmin.from("notifications_log").insert([
        {
          channel: "whatsapp",
          template_key,
          recipient,
          student_id: null,
          status: "queued",
          meta,
        },
      ]);
      if (logErr) {
        return NextResponse.json({
          ok: true,
          updated: true,
          notifyQueued: false,
          warn: `Queued notification failed: ${logErr.message}`,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      updated: true,
      notifyQueued: !!recipient,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
