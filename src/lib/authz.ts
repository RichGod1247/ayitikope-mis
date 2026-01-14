// src/lib/authz.ts
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

function errWithStatus(message: string, status: number) {
  const e = new Error(message);
  (e as any).status = status;
  return e;
}

/**
 * ✅ API-safe (NO redirects). Use this in route handlers.
 */
export async function getCurrentUserOrThrow() {
  const session = await getServerSession(authOptions);
  const u = session?.user as any;

  if (!u?.id) throw errWithStatus("Unauthorized", 401);

  return {
    id: String(u.id),
    email: u.email ? String(u.email) : null,
    name: u.name ? String(u.name) : null,
    staffId: u.staffId ? String(u.staffId) : null,
    tenantId: u.tenantId ? String(u.tenantId) : null,
    roleName: u.roleName ? String(u.roleName) : null,
  };
}

export async function requireMembershipOrThrow(userId: string, tenantId: string) {
  const membership = await prisma.membership.findUnique({
    where: { userId_tenantId: { userId, tenantId } },
    include: { role: true },
  });

  if (!membership || membership.status !== "ACTIVE") {
    throw errWithStatus("Forbidden", 403);
  }

  return membership;
}

export function requireRoleOrThrow(roleName: string | null | undefined, allowed: string[]) {
  if (!roleName || !allowed.includes(roleName)) throw errWithStatus("Forbidden", 403);
}
