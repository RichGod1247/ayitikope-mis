// src/lib/policy.ts

export function normalizeRoleName(role: unknown) {
  return String(role ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
}

// Legacy compat: treat ADMIN as SCHOOL_ADMIN.
// Keep this mapping ONLY if you truly want ADMIN to behave as SCHOOL_ADMIN.
export function roleEffective(role: unknown) {
  const r = normalizeRoleName(role);
  if (r === "ADMIN") return "SCHOOL_ADMIN";
  return r;
}

export function roleInAllowed(role: unknown, allowedRoleNames: readonly string[]) {
  const eff = roleEffective(role);
  const allowed = new Set(allowedRoleNames.map(normalizeRoleName));
  return allowed.has(normalizeRoleName(eff));
}

export function isAdminish(role: unknown) {
  const r = normalizeRoleName(roleEffective(role));
  return r === "SCHOOL_ADMIN" || r === "HEADTEACHER";
}
