// src/lib/authz.ts
import { getServerSession } from "next-auth";
import { authOptions } from "./auth";
import { prisma } from "./prisma";

export async function getCurrentUserOrThrow() {
  const session = await getServerSession(authOptions);
  if (!session || !session.user?.email) {
    const e = new Error("Not signed in");
    (e as any).status = 401;
    throw e;
  }
  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user) {
    const e = new Error("User not found");
    (e as any).status = 404;
    throw e;
  }
  return user;
}

export async function requireMembershipOrThrow(userId: string, tenantId: string) {
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
