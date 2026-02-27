// src/lib/getActiveTenantId.ts
import { requireServerUserContext } from "@/lib/serverAuth";

export async function getActiveTenantId() {
  const ctx = await requireServerUserContext({ requireTenant: true });
  return ctx.tenantId;
}
