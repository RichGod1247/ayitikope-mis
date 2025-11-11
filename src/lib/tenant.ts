// src/lib/tenant.ts
import { prisma } from "./prisma";
import { getCurrentUserOrThrow } from "./auth";

/**
 * Finds the tenant the current user belongs to.
 * If the user has multiple, it returns the first one for now.
 * (We can later enhance this to choose by slug in cookie/query/header.)
 */
export async function getCurrentTenantOrThrow() {
  const user = await getCurrentUserOrThrow();

  const membership = await prisma.membership.findFirst({
    where: { userId: user.id, status: "ACTIVE" },
    include: { tenant: true },
  });

  if (!membership?.tenant) {
    throw new Error("No tenant found for current user");
  }

  return {
    user,
    tenant: {
      id: membership.tenant.id,
      name: membership.tenant.name,
      slug: membership.tenant.slug,
      timezone: membership.tenant.timezone ?? "Africa/Accra",
      locale: membership.tenant.locale ?? "en",
    },
  };
}
