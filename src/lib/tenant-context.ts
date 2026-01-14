// src/lib/tenant-context.ts
import { prisma } from "@/lib/prisma";
import { getCurrentTenantOrThrow } from "@/lib/tenant";

/**
 * ✅ Production: session-derived tenant only.
 * No active-tenant cookies, no slug switching, no userId stored elsewhere.
 */
export async function getUserAndTenantOrThrow() {
  const { user, tenant } = await getCurrentTenantOrThrow();

  // Extra defensive fetch (ensures tenant exists and is accessible)
  const fullTenant = await prisma.tenant.findUnique({
    where: { id: tenant.id },
    select: { id: true, name: true, slug: true, timezone: true, locale: true },
  });

  if (!fullTenant) {
    const e = new Error("Active tenant not found");
    (e as any).status = 404;
    throw e;
  }

  return { userId: user.id, tenant: fullTenant };
}
