// src/lib/phoneNormGH.ts

export function cleanStr(v: unknown) {
  return String(v ?? "").trim();
}

/**
 * Ghana phone -> E.164 (+233XXXXXXXXX)
 * Accepts:
 * - 0241234567  (0 + 9 digits)
 * - 233241234567
 * - +233241234567
 * - 00 233 24 123 4567
 * - 241234567 (9 digits best-effort)
 *
 * Returns null if not a valid Ghana format.
 */
export function normalizeGhPhoneE164(raw: unknown): string | null {
  const s0 = cleanStr(raw);
  if (!s0) return null;

  // Keep only digits and plus
  let s = s0.replace(/[^\d+]/g, "");

  // 00... -> +...
  if (s.startsWith("00")) s = "+" + s.slice(2);

  // +233XXXXXXXXX
  if (s.startsWith("+233")) {
    const digits = s.replace(/[^\d]/g, ""); // drops +
    if (digits.length !== 12) return null; // 233 + 9
    if (!digits.startsWith("233")) return null;
    return `+${digits}`;
  }

  // 233XXXXXXXXX
  if (s.startsWith("233")) {
    const digits = s.replace(/[^\d]/g, "");
    if (digits.length !== 12) return null;
    if (!digits.startsWith("233")) return null;
    return `+${digits}`;
  }

  const digitsOnly = s.replace(/[^\d]/g, "");

  // 0XXXXXXXXX (10 digits total)
  if (digitsOnly.length === 10 && digitsOnly.startsWith("0")) {
    return `+233${digitsOnly.slice(1)}`;
  }

  // XXXXXXXXX (9 digits) best-effort
  if (digitsOnly.length === 9) {
    return `+233${digitsOnly}`;
  }

  return null;
}