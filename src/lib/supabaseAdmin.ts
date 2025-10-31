// src/lib/supabaseAdmin.ts
import "server-only";
import { createClient } from "@supabase/supabase-js";

// Prefer server-only SUPABASE_URL; fall back to NEXT_PUBLIC_ so you don't break dev
const url =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!url) {
  throw new Error("supabaseAdmin: Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL).");
}
if (!serviceKey) {
  throw new Error("supabaseAdmin: Missing SUPABASE_SERVICE_ROLE_KEY.");
}

export const supabaseAdmin = createClient(url, serviceKey, {
  auth: { persistSession: false },
});
