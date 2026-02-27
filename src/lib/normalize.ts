// src/lib/normalize.ts
export { normalizeGhPhoneE164 } from "@/lib/phoneNormGH";

function digitsOnly(raw: string) {
  return String(raw ?? "").replace(/\D+/g, "");
}

/** Keep raw phone reasonably clean for storage/display (but not "validated"). */
export function cleanPhone(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  return s ? s.replace(/\s+/g, " ") : null;
}

export function normalizeNameNorm(raw: unknown, max = 32): string {
  const s = String(raw ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "")
    .trim();
  return s.slice(0, max);
}

export function normalizeArmNorm(raw: unknown, max = 8): string {
  const s = String(raw ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "")
    .trim();
  return s.slice(0, max);
}