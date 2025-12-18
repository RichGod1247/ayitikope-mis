// src/lib/authz.ts

import { prisma } from "./prisma";

/**
 * Ensures that the given userId has a membership in the given tenant.
 * Throws an error if no membership is found.
 *
 * Use this when you already know the user and tenant id and just want
 * to guard access to tenant-specific resources.
 */
export async function requireMembershipOrThrow(
  userId: string,
  tenantId: string
) {
  const membership = await prisma.membership.findUnique({
    where: { userId_tenantId: { userId, tenantId } },
    include: { role: true },
  });

  if (!membership) {
    const e = new Error("No membership for active tenant");
    (e as any).status = 401;
    throw e;
  }

  return membership;
}
