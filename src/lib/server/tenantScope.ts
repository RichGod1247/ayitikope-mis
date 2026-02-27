// src/lib/server/tenantScope.ts
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

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

  return {
    userId: user.id,
    tenantId: user.tenantId,
    roleName: user.roleName ?? null,
    staffId: user.staffId ?? null,
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
