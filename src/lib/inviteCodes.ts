// src/lib/inviteCodes.ts
import crypto from "crypto";

// Prefer a dedicated pepper. Fallbacks keep dev moving.
const PEPPER =
  process.env.INVITE_CODE_PEPPER ||
  process.env.NEXTAUTH_SECRET ||
  process.env.AUTH_SECRET ||
  "dev-invite-code-pepper-change-me";

export function normalizeInviteCode(raw: string): string {
  return String(raw ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export function hashInviteCode(raw: string): string {
  const norm = normalizeInviteCode(raw);
  // hex sha256 => 64 chars (fits in varchar(128))
  return crypto.createHash("sha256").update(`${PEPPER}|${norm}`).digest("hex");
}

export function codeHint(raw: string): string {
  const norm = normalizeInviteCode(raw);
  return norm.slice(-4);
}

function randomBase32(len: number): string {
  // avoids confusing chars: I, O, 0, 1
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

export function generateInviteCode(prefix: string): string {
  const p = normalizeInviteCode(prefix).slice(0, 4) || "INV";
  return `${p}-${randomBase32(4)}-${randomBase32(4)}-${randomBase32(4)}`;
}
