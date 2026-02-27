// src/lib/serverAuth.ts
import { getServerSession } from "next-auth/next";
import { getToken } from "next-auth/jwt";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { effectiveRole, normRole, safeInternalPath } from "@/lib/roleRouting";

export type ServerUserContext = {
  userId: string;
  tenantId: string; // empty string when not selected
  roleName: string | null; // DB-truth after require*
  staffId: string | null; // DB-truth after require*
  email: string;
  name: string | null;

  // Convenience only (never for auth decisions)
  teacherScope?: unknown | null;
};

type RawSessionUser = {
  id?: string;
  email?: string;
  name?: string | null;
  staffId?: string | null;
  tenantId?: string | null;
  roleName?: string | null;
  teacherScope?: unknown | null;
};

function isLikelyNextAuthDecryptError(err: unknown) {
  const msg = (err instanceof Error ? err.message : String(err ?? "")).toLowerCase();
  return (
    msg.includes("jwe") ||
    msg.includes("jwt") ||
    msg.includes("decryption") ||
    msg.includes("invalid compact") ||
    msg.includes("session") ||
    msg.includes("argument name is invalid")
  );
}

async function readSessionUserOrNull(): Promise<RawSessionUser | null> {
  try {
    const session = await getServerSession(authOptions);
    return (session?.user ?? null) as RawSessionUser | null;
  } catch (err) {
    // Treat corrupted/old cookies as unauthenticated (don’t crash pages)
    if (isLikelyNextAuthDecryptError(err)) return null;
    return null;
  }
}

function toSignInUrl(opts: { callbackUrl?: string; error?: string }) {
  const p = new URLSearchParams();
  if (opts.callbackUrl) p.set("callbackUrl", safeInternalPath(opts.callbackUrl, "/app"));
  if (opts.error) p.set("error", opts.error);
  const qs = p.toString();
  return `/auth/signin${qs ? `?${qs}` : ""}`;
}

function apiJson(status: number, payload: any) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function loadActiveMembership(userId: string, tenantId: string) {
  const m = await prisma.membership.findUnique({
    where: { userId_tenantId: { userId, tenantId } },
    select: { status: true, staffId: true, role: { select: { name: true } } },
  });

  if (!m || String(m.status) !== "ACTIVE") return null;

  const roleName = effectiveRole(m.role?.name ?? "") || null;
  return { roleName, staffId: (m.staffId ?? null) as string | null };
}

/**
 * Page/server-component mode (redirects on failure).
 * Keep this behavior for /app gateway and pages.
 */
export async function getServerUserContextOrNull(opts?: {
  requireTenant?: boolean;
}): Promise<ServerUserContext | null> {
  const requireTenant = opts?.requireTenant ?? true;

  const u = await readSessionUserOrNull();
  if (!u?.id || !u?.email) return null;

  const tenantId = (u.tenantId ?? null) as string | null;
  if (requireTenant && !tenantId) return null;

  const effRole = u.roleName ? effectiveRole(u.roleName) : null;

  return {
    userId: String(u.id),
    tenantId: String(tenantId ?? ""),
    roleName: effRole || null, // may be overwritten by requireServerUserContext
    staffId: (u.staffId ?? null) as string | null,
    email: String(u.email),
    name: (u.name ?? null) as string | null,
    teacherScope: (u.teacherScope ?? null) as unknown | null,
  };
}

export async function requireServerUserContext(opts?: {
  redirectTo?: string;
  requireTenant?: boolean;
  requireRoleNames?: string[];
}): Promise<ServerUserContext> {
  const redirectTo = safeInternalPath(opts?.redirectTo ?? "/app", "/app");
  const requireTenant = opts?.requireTenant ?? true;
  const requireRoleNames = opts?.requireRoleNames;

  const ctx = await getServerUserContextOrNull({ requireTenant });

  if (!ctx) {
    redirect(toSignInUrl({ callbackUrl: redirectTo }));
  }

  if (requireTenant && !ctx!.tenantId) {
    redirect(toSignInUrl({ callbackUrl: redirectTo, error: "NO_ACTIVE_TENANT" }));
  }

  // ✅ Always verify ACTIVE membership when a tenant is required (even if no roleNames passed).
  if (requireTenant) {
    const tenantId = String(ctx!.tenantId ?? "");
    const mem = await loadActiveMembership(ctx!.userId, tenantId);

    if (!mem) {
      redirect(toSignInUrl({ callbackUrl: redirectTo, error: "FORBIDDEN" }));
    }

    ctx!.roleName = mem!.roleName;
    ctx!.staffId = mem!.staffId;
  }

  // 🔒 If roles required, enforce DB-truth role
  if (requireRoleNames?.length) {
    const allowed = new Set(requireRoleNames.map((r) => normRole(r)));
    const role = normRole(ctx!.roleName ?? "");
    if (!allowed.has(role)) {
      redirect(toSignInUrl({ callbackUrl: redirectTo, error: "FORBIDDEN" }));
    }
  }

  return ctx!;
}

/**
 * API mode (NEVER redirects). Returns JSON 401/403 instead.
 * Token-first (request-bound), session fallback (stability).
 */
export async function requireApiUserContext(
  req: Request,
  opts?: { requireTenant?: boolean; requireRoleNames?: string[] }
): Promise<{ ok: true; ctx: ServerUserContext } | { ok: false; res: Response }> {
  const requireTenant = opts?.requireTenant ?? true;
  const requireRoleNames = opts?.requireRoleNames;

  const secret = process.env.NEXTAUTH_SECRET;

  // -------- 1) Token-first (request-bound) --------
  let u: RawSessionUser | null = null;
  try {
    const tok = await getToken({ req: req as any, secret });
    if (tok) {
      const uidRaw = (tok as any).uid ?? (tok as any).userId ?? (tok as any).sub ?? null;
      const emailRaw = (tok as any).email ?? null;

      u = {
        id: uidRaw ? String(uidRaw) : undefined,
        email: emailRaw ? String(emailRaw) : undefined,
        name: (tok as any).name ?? null,
        staffId: (tok as any).staffId ?? null,
        tenantId: (tok as any).tenantId ?? null,
        roleName: (tok as any).roleName ?? null,
        teacherScope: (tok as any).teacherScope ?? null,
      };
    }
  } catch {
    // ignore token parse failures; fallback to session
  }

  // -------- 2) Session fallback (stability) --------
  if (!u?.id || !u?.email) {
    u = await readSessionUserOrNull();
  }

  if (!u?.id || !u?.email) {
    return { ok: false, res: apiJson(401, { ok: false, error: "UNAUTHORIZED" }) };
  }

  const tenantId = String(u.tenantId ?? "").trim();
  if (requireTenant && !tenantId) {
    return { ok: false, res: apiJson(403, { ok: false, error: "NO_ACTIVE_TENANT" }) };
  }

  const ctx: ServerUserContext = {
    userId: String(u.id),
    tenantId: tenantId || "",
    roleName: u.roleName ? effectiveRole(u.roleName) : null, // overwritten below when requireTenant
    staffId: (u.staffId ?? null) as string | null, // overwritten below when requireTenant
    email: String(u.email),
    name: (u.name ?? null) as string | null,
    teacherScope: (u.teacherScope ?? null) as unknown | null,
  };

  // ✅ Always verify ACTIVE membership when a tenant is required (even if no roleNames passed).
  if (requireTenant) {
    const mem = await loadActiveMembership(ctx.userId, ctx.tenantId);
    if (!mem) {
      return { ok: false, res: apiJson(403, { ok: false, error: "FORBIDDEN" }) };
    }
    ctx.roleName = mem.roleName;
    ctx.staffId = mem.staffId;
  }

  if (requireRoleNames?.length) {
    const allowed = new Set(requireRoleNames.map((r) => normRole(r)));
    const role = normRole(ctx.roleName ?? "");
    if (!allowed.has(role)) {
      let path = "";
      try {
        path = new URL(req.url).pathname;
      } catch {
        path = "";
      }
      return {
        ok: false,
        res: apiJson(403, { ok: false, error: "FORBIDDEN", role: ctx.roleName, path }),
      };
    }
  }

  return { ok: true, ctx };
}

/**
 * Tiny primitive (used everywhere): server-side “active tenant id”
 * Redirects if unauthenticated / no tenant.
 */
export async function getActiveTenantId(redirectTo = "/app") {
  const ctx = await requireServerUserContext({ redirectTo, requireTenant: true });
  return ctx.tenantId;
}
