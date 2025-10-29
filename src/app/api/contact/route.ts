// src/app/api/contact/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const STAFF = [
  {
    name: "Mr. Senu Peter — Head Teacher",
    phone: "0508021572",
    wa: "233508021572",
  },
  {
    name: "Mr. Angellus Anyigba Atsu — Asst. Head (JHS)",
    phone: "0245444861",
    wa: "233245444861",
  },
  {
    name: "Mrs. Magbele Janet — Asst. Head (Primary)",
    phone: "0243381907",
    wa: "233243381907",
  },
];

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, phone, relation, message } = body || {};

    if (!name || !phone || !message) {
      return NextResponse.json({ ok: false, error: "Missing fields" }, { status: 400 });
    }

    // Insert a notifications_log row per staff contact
    const rows = STAFF.map((s) => ({
      channel: "whatsapp",
      template_key: "contact_message",
      recipient: s.wa,          // we store the E.164 wa number for the sender worker
      status: "queued",
      meta: {
        staff_name: s.name,
        staff_phone: s.phone,
        sender_name: name,
        sender_phone: phone,
        relation,
        message,
      },
    }));

    const { error } = await supabaseAdmin.from("notifications_log").insert(rows);
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
