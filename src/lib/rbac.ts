// src/lib/rbac.ts
import { prisma } from "@/lib/prisma";

export const PERMS = {
  CONSENT_VIEW: "CONSENT_VIEW",
  CONSENT_EDIT: "CONSENT_EDIT",
  CONSENT_EXPORT: "CONSENT_EXPORT",
} as const;

/**
 * SECURITY NOTE (LOCK THIS):
 * - In production: NEVER allow user impersonation via headers/query params.
 * - In dev: impersonation is allowed ONLY if RBAC_IMPERSONATION_ENABLED="true".
 *
 * Why: x-user-id / ?userId= without gating = privilege escalation backdoor.
 */

const IS_PROD = process.env.NODE_ENV === "production";
const IMPERSONATION_ENABLED = !IS_PROD && process.env.RBAC_IMPERSONATION_ENABLED === "true";

function cleanStr(v: unknown) {
  return String(v ?? "").trim();
}

function isPlausibleId(id: string) {
  const v = cleanStr(id);
  if (!v) return false;
  if (v.length < 5 || v.length > 128) return false;
  return /^[a-zA-Z0-9_-]+$/.test(v);
}

async function isActiveMemberOfTenant(tenantId: string, userId: string): Promise<boolean> {
  if (!tenantId || !userId) return false;
  const m = await prisma.membership.findFirst({
    where: { tenantId, userId, status: "ACTIVE" },
    select: { id: true },
  });
  return !!m?.id;
}

/**
 * Resolve a "current user" for local/dev testing.
 *
 * Rules:
 * - Production: always returns null (force real auth/session user).
 * - Dev: only works when RBAC_IMPERSONATION_ENABLED="true".
 * - Even in dev: validates the user belongs to the tenant (ACTIVE membership).
 */
export async function resolveUserIdForTenant(
  tenantId: string,
  opts: { req?: Request } = {}
): Promise<string | null> {
  if (!tenantId) return null;

  // ✅ Production: hard-off
  if (IS_PROD) return null;

  // ✅ Dev: only if explicitly enabled
  if (!IMPERSONATION_ENABLED) return null;

  const req = opts.req;

  if (req) {
    // 1) Header impersonation (dev-only)
    const hdr = cleanStr(req.headers.get("x-user-id"));
    if (hdr && isPlausibleId(hdr)) {
      if (await isActiveMemberOfTenant(tenantId, hdr)) return hdr;
    }

    // 2) Query impersonation (dev-only)
    try {
      const url = new URL(req.url);
      const qp = cleanStr(url.searchParams.get("userId"));
      if (qp && isPlausibleId(qp)) {
        if (await isActiveMemberOfTenant(tenantId, qp)) return qp;
      }
    } catch {
      // ignore invalid URL (shouldn't happen in Next route handlers)
    }
  }

  // 3) Dev fallback (dev-only, gated): pick any active member in this tenant
  const m = await prisma.membership.findFirst({
    where: { tenantId, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
    select: { userId: true },
  });

  const userId = m?.userId ?? null;
  if (!userId) return null;

  // (Extra safety) Confirm active membership (should already be true)
  return (await isActiveMemberOfTenant(tenantId, userId)) ? userId : null;
}

/**
 * Throws 403 if the user doesn't have the required permission in the tenant.
 */
export async function requirePermOrThrow(tenantId: string, userId: string, permName: string) {
  if (!tenantId || !userId) throw Object.assign(new Error("Forbidden"), { status: 403 });

  const has = await prisma.membership.findFirst({
    where: {
      tenantId,
      userId,
      status: "ACTIVE",
      role: {
        rolePerms: {
          some: {
            permission: { name: permName },
          },
        },
      },
    },
    select: { id: true },
  });

  if (!has) {
    const err = new Error("Forbidden: missing permission " + permName) as any;
    err.status = 403;
    throw err;
  }
}
