// src/lib/tenant-context.ts
import { getServerSession } from "next-auth";
import { authOptions } from "../lib/auth";
import { prisma } from "../lib/prisma";
import { getActiveTenantSlug } from "../lib/tenant";

export async function getUserAndTenantOrThrow() {
  const session = await getServerSession(authOptions);
  const userId = (session as any)?.userId as string | undefined;
  if (!userId) throw new Error("Not authenticated");

  const slug = await getActiveTenantSlug(userId);
  if (!slug) throw new Error("No active tenant");

  const tenant = await prisma.tenant.findUnique({ where: { slug } });
  if (!tenant) throw new Error("Active tenant not found");

  const membership = await prisma.membership.findFirst({
    where: { userId, tenantId: tenant.id, status: "ACTIVE" },
    select: { id: true, roleId: true },
  });
  if (!membership) throw new Error("No membership for active tenant");

  return { userId, tenant };
}
