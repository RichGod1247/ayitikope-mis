console.log("ENV CHECK", {
  hasPhoneId: !!process.env.WHATSAPP_PHONE_ID,
  hasToken: !!process.env.WHATSAPP_TOKEN,
  devRecipient: process.env.DEV_TEST_RECIPIENT,
});

// src/app/api/notifications/send/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID;   // <-- match .env.local
const WHATSAPP_TOKEN    = process.env.WHATSAPP_TOKEN;
const DEV_TEST_RECIPIENT = process.env.DEV_TEST_RECIPIENT || "";
const isDev = process.env.NODE_ENV !== "production";

const normalizeE164 = (x: string) =>
  (x || "").replace(/\+/g, "").replace(/^0(\d{9})$/, "233$1"); // 024... -> 23324...

async function sendOneQueued() {
  if (!WHATSAPP_PHONE_ID) {
    return NextResponse.json({ ok: false, error: "Missing WHATSAPP_PHONE_ID env." }, { status: 500 });
  }
  if (!WHATSAPP_TOKEN) {
    return NextResponse.json({ ok: false, error: "Missing WHATSAPP_TOKEN env." }, { status: 500 });
  }

  // 1) fetch one queued
  const { data: rows, error: fetchErr } = await supabaseAdmin
    .from("notifications_log")
    .select("*")
    .eq("status", "queued")
    .order("date_time", { ascending: true })
    .limit(1);

  if (fetchErr) {
    return NextResponse.json({ ok: false, error: `DB fetch error: ${fetchErr.message}` }, { status: 500 });
  }
  if (!rows?.length) {
    return NextResponse.json({ ok: true, processed: 0, note: "No queued notifications." });
  }

  const row = rows[0];
  const id = row.notification_id;
  const meta = row.meta || {};
  let recipient = String(row.recipient || "").trim();
  if (isDev && DEV_TEST_RECIPIENT) recipient = DEV_TEST_RECIPIENT;
  recipient = normalizeE164(recipient);

  // 2) build message
  let text = "";
  switch (row.template_key) {
    case "admission_accepted":
      text =
        meta.message ||
        `Hello ${meta.parentName || "Parent"}, ${meta.studentName || "your ward"} has been ACCEPTED to ${meta.level || "the school"}. We will contact you with next steps.`;
      break;
    case "admission_rejected":
      text =
        meta.message ||
        `Hello ${meta.parentName || "Parent"}, ${meta.studentName || "your ward"} has NOT been accepted to ${meta.level || "the school"} at this time.`;
      break;
    default:
      text = meta.message || "Ayitikope M/A Basic School notification.";
  }

  // 3) call WhatsApp
  const url = `https://graph.facebook.com/v22.0/${WHATSAPP_PHONE_ID}/messages`;
  const payload = {
    messaging_product: "whatsapp",
    to: recipient,
    type: "text",
    text: { body: text },
  };

  const r = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const ok = r.ok;
  const body = await r.json().catch(() => ({} as any));
  const errorMsg = ok ? null : `HTTP ${r.status}: ${JSON.stringify(body)}`;

  // 4) update status
  const { error: updErr } = await supabaseAdmin
    .from("notifications_log")
    .update({ status: ok ? "sent" : "failed", meta: { ...meta, error: errorMsg } })
    .eq("notification_id", id);

  if (updErr) {
    return NextResponse.json(
      { ok: false, error: `DB update error: ${updErr.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, processed: 1, results: [{ id, sent: ok, error: errorMsg }] });
}

// Accept POST (primary) and GET (handy for quick tests)
export async function POST() {
  return sendOneQueued();
}
export async function GET() {
  return sendOneQueued();
}
