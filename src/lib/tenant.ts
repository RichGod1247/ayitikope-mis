// src/lib/tenant.ts
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

type SessionUser = {
  id: string;
  email: string | null;
  name: string | null;
  tenantId: string | null;
  roleName: string | null;
  staffId: string | null;
};

function errWithStatus(message: string, status: number) {
  const e = new Error(message);
  (e as any).status = status;
  return e;
}

async function getSessionUserOrThrow(): Promise<SessionUser> {
  const session = await getServerSession(authOptions);
  const u = session?.user as any;

  if (!u?.id) throw errWithStatus("Unauthorized", 401);

  return {
    id: String(u.id),
    email: u.email ? String(u.email) : null,
    name: u.name ? String(u.name) : null,
    tenantId: u.tenantId ? String(u.tenantId) : null,
    roleName: u.roleName ? String(u.roleName) : null,
    staffId: u.staffId ? String(u.staffId) : null,
  };
}

/**
 * ✅ Production: derive tenant from session (JWT) and verify ACTIVE membership.
 * No cookies, no query params, no "pick first tenant" unless that tenant is in session.
 */
export async function getCurrentTenantOrThrow() {
  const user = await getSessionUserOrThrow();

  if (!user.tenantId) throw errWithStatus("NO_ACTIVE_TENANT", 403);

  const membership = await prisma.membership.findUnique({
    where: { userId_tenantId: { userId: user.id, tenantId: user.tenantId } },
    select: {
      id: true,
      status: true,
      tenant: { select: { id: true, name: true, slug: true, timezone: true, locale: true } },
    },
  });

  if (!membership || membership.status !== "ACTIVE") throw errWithStatus("Forbidden", 403);

  const t = membership.tenant;
  if (!t) throw errWithStatus("Tenant not found", 404);

  return {
    user,
    tenant: {
      id: t.id,
      name: t.name,
      slug: t.slug,
      timezone: t.timezone ?? "Africa/Accra",
      locale: t.locale ?? "en",
    },
  };
}

/**
 * 🧹 Back-compat alias used by legacy code.
 * Still secure: session + membership only. (Name is legacy; behavior is production-safe.)
 */
export async function getActiveTenantByCookie() {
  const { tenant } = await getCurrentTenantOrThrow();
  return { tenant };
}

/**
 * Legacy helper used by old files. Avoid using this with userIds from query params.
 * Only safe when userId is already server-trusted (e.g., from session).
 */
export async function getActiveTenantSlug(userId: string): Promise<string | null> {
  const m = await prisma.membership.findFirst({
    where: { userId, status: "ACTIVE" },
    select: { tenant: { select: { slug: true } } },
    orderBy: { createdAt: "asc" },
  });
  return m?.tenant?.slug ?? null;
}

/**
 * 🚫 Production: tenant switching by cookie is a footgun.
 * We keep the export to satisfy legacy imports, but we block execution.
 */
export function setActiveTenantCookie() {
  throw errWithStatus("Tenant switching is disabled in production.", 501);
}
