// src/lib/notify.ts
import { supabaseAdmin } from "./supabaseAdmin";

/**
 * Queue a notification into notifications_log.
 * channel: "whatsapp" | "sms" | "email" | "inapp"
 * template_key: matches a row in notification_templates (optional for now)
 */
export async function queueNotification(params: {
  channel: "whatsapp" | "sms" | "email" | "inapp";
  template_key: string;
  recipient: string;         // phone/email
  student_id?: string | null;
  meta?: Record<string, any>;
}) {
  const { channel, template_key, recipient, student_id = null, meta = {} } = params;

  const { error } = await supabaseAdmin.from("notifications_log").insert([
    {
      channel,
      template_key,
      recipient,
      student_id,
      status: "queued",
      meta, // e.g. { student_name, level, message }
    },
  ]);

  if (error) throw new Error("Queue notify failed: " + error.message);
}
