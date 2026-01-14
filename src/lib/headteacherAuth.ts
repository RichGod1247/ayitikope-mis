// src/lib/headteacherAuth.ts
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";

export type HeadteacherContext = {
  userId: string;
  tenantId: string;
  membershipId: string;
  roleName: string; // original Role.name
  roleKey: string;  // normalized role key (used for matching)
  permissions: string[]; // normalized permission keys
};

function normalizeKey(input: unknown): string {
  if (typeof input !== "string") return "";
  // Uppercase + strip non-alphanumerics to avoid fragile matching:
  // "Head Teacher" -> "HEADTEACHER", "SUPER_ADMIN" -> "SUPERADMIN"
  return input.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

// Roles that are allowed to review lesson notes (normalized)
const ALLOWED_ROLE_KEYS = new Set([
  "HEADTEACHER",
  "ADMIN",
  "SUPERADMIN",
]);

// Optional permission-based authorization (normalized).
// If you later seed permissions, this automatically works without code changes.
const ALLOWED_PERMISSION_KEYS = new Set([
  "LESSONNOTEREVIEW",
  "LESSONNOTESREVIEW",
  "LESSONNOTEAPPROVE",
  "LESSONNOTESAPPROVE",
  "HEADTEACHERLESSONNOTES",
]);

async function loadMembershipWithRole(userId: string, tenantId: string) {
  return prisma.membership.findFirst({
    where: {
      userId,
      tenantId,
      status: "ACTIVE",
    },
    select: {
      id: true,
      status: true,
      role: {
        select: {
          name: true,
          rolePerms: {
            select: {
              permission: { select: { name: true } },
            },
          },
        },
      },
    },
  });
}

function isAuthorized(roleKey: string, permissionKeys: string[]) {
  if (ALLOWED_ROLE_KEYS.has(roleKey)) return true;
  for (const p of permissionKeys) {
    if (ALLOWED_PERMISSION_KEYS.has(p)) return true;
  }
  return false;
}

/**
 * Server-pages: MUST throw if unauthorized (so caller can redirect).
 */
export async function requireHeadteacherContext(params: {
  redirectTo: string;
}): Promise<HeadteacherContext> {
  const safe = await requireServerUserContext({
    redirectTo: params.redirectTo,
    requireTenant: true,
  });

  const membership = await loadMembershipWithRole(safe.userId, safe.tenantId);

  if (!membership?.role?.name) {
    throw new Error("FORBIDDEN_NO_MEMBERSHIP");
  }

  const roleName = membership.role.name;
  const roleKey = normalizeKey(roleName);

  const permissions =
    membership.role.rolePerms?.map((rp) => normalizeKey(rp.permission?.name))?.filter(Boolean) ?? [];

  if (!isAuthorized(roleKey, permissions)) {
    throw new Error("FORBIDDEN_ROLE");
  }

  return {
    userId: safe.userId,
    tenantId: safe.tenantId,
    membershipId: membership.id,
    roleName,
    roleKey,
    permissions,
  };
}

/**
 * API routes: return null instead of redirecting.
 */
export async function getHeadteacherApiContext(): Promise<HeadteacherContext | null> {
  try {
    const safe = await requireServerUserContext({
      redirectTo: "/headteacher/lesson-notes",
      requireTenant: true,
    });

    const membership = await loadMembershipWithRole(safe.userId, safe.tenantId);
    if (!membership?.role?.name) return null;

    const roleName = membership.role.name;
    const roleKey = normalizeKey(roleName);

    const permissions =
      membership.role.rolePerms?.map((rp) => normalizeKey(rp.permission?.name))?.filter(Boolean) ?? [];

    if (!isAuthorized(roleKey, permissions)) return null;

    return {
      userId: safe.userId,
      tenantId: safe.tenantId,
      membershipId: membership.id,
      roleName,
      roleKey,
      permissions,
    };
  } catch {
    return null;
  }
}
