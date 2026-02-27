// src/lib/tenantGuard.ts
export function assertNoTenantOverride(
  suppliedTenantId: string | null | undefined,
  sessionTenantId: string
): { ok: true } | { ok: false; status: 403; error: string } {
  const v = String(suppliedTenantId ?? "").trim();
  if (v && v !== sessionTenantId) {
    return { ok: false, status: 403, error: "Forbidden (tenant mismatch)." };
  }
  return { ok: true };
}
