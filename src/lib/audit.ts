// src/lib/audit.ts
import { prisma } from "@/lib/prisma";

type AuthAction =
  | "AUTH_LOGIN_SUCCESS"
  | "AUTH_LOGIN_FAILED"
  | "ONBOARDING_CODE_ROTATED"
  | "INVITE_CREATED";

export async function writeAuditLog(params: {
  action: AuthAction;
  tenantId?: string;
  userId?: string;
  resource?: string;
  resourceId?: string;
  ip?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, any>;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        action: params.action,
        tenantId: params.tenantId,
        userId: params.userId,
        resource: params.resource,
        resourceId: params.resourceId,
        ip: params.ip ?? undefined,
        userAgent: params.userAgent ?? undefined,
        metadata: params.metadata ?? undefined,
      },
    });
  } catch {
    // NEVER break core flows because audit logging failed
  }
}
