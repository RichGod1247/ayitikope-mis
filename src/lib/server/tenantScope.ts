// src/lib/server/tenantScope.ts
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { effectiveRole } from "@/lib/roleRouting";

export type TenantContext = {
  userId: string;
  tenantId: string;
  roleName: string | null;
  staffId: string | null;
  teacherScope: unknown | null;
};

type SessionUser = {
  id?: string;
  tenantId?: string | null;
  roleName?: string | null;
  staffId?: string | null;
  teacherScope?: unknown | null;
};

export async function requireTenantContext(): Promise<TenantContext> {
  const session = (await getServerSession(authOptions)) ?? null;
  const user = (session?.user ?? null) as SessionUser | null;

  if (!user?.id) {
    const err = new Error("UNAUTHENTICATED");
    (err as any).status = 401;
    throw err;
  }

  if (!user.tenantId) {
    const err = new Error("TENANT_REQUIRED");
    (err as any).status = 409;
    throw err;
  }

  const membership = await prisma.membership.findUnique({
    where: { userId_tenantId: { userId: user.id, tenantId: user.tenantId } },
    select: {
      status: true,
      staffId: true,
      role: { select: { name: true } },
      tenant: { select: { status: true } },
    },
  });

  if (
    !membership ||
    membership.status !== "ACTIVE" ||
    String(membership.tenant?.status ?? "") !== "ACTIVE"
  ) {
    const err = new Error("FORBIDDEN");
    (err as any).status = 403;
    throw err;
  }

  return {
    userId: user.id,
    tenantId: user.tenantId,
    roleName: effectiveRole(membership.role?.name ?? "") || null,
    staffId: membership.staffId ?? null,
    teacherScope: user.teacherScope ?? null,
  };
}

/**
 * Backward compatible guard:
 * If a request still sends tenantId, it MUST match session tenantId.
 */
export function assertTenantParamMatches(sessionTenantId: string, suppliedTenantId: string | null) {
  if (!suppliedTenantId) return;
  if (suppliedTenantId !== sessionTenantId) {
    const err = new Error("FORBIDDEN_TENANT_MISMATCH");
    (err as any).status = 403;
    throw err;
  }
}

export function toHttpError(e: unknown) {
  const msg = e instanceof Error ? e.message : "SERVER_ERROR";
  const status =
    typeof (e as any)?.status === "number"
      ? (e as any).status
      : msg === "UNAUTHENTICATED"
      ? 401
      : msg === "TENANT_REQUIRED"
      ? 409
      : 500;

  return { status, msg };
}
