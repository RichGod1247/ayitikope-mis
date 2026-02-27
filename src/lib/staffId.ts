// src/lib/staffId.ts
export function normalizeStaffIdNorm(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export function requireStaffIdNorm(raw: unknown): { staffId: string; staffIdNorm: string } {
  const staffId = String(raw ?? "").trim();
  const staffIdNorm = normalizeStaffIdNorm(staffId);

  if (!staffId) throw new Error("STAFF_ID_REQUIRED");
  if (!staffIdNorm) throw new Error("STAFF_ID_INVALID");

  return { staffId, staffIdNorm };
}