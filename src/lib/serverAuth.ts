// src/lib/serverAuth.ts
import { getServerSession } from "next-auth/next";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";

export type ServerUserContext = {
  userId: string;
  tenantId: string;
  roleName: string | null;
  staffId: string | null;
  email: string;
  name: string | null;
};

type RawSessionUser = {
  id?: string;
  email?: string;
  name?: string | null;
  staffId?: string | null;
  tenantId?: string | null;
  roleName?: string | null;
};

function safeInternalPath(raw: string | null | undefined) {
  const fallback = "/teacher-portal";
  const v = String(raw ?? "").trim();
  if (!v) return fallback;

  // Block protocol-relative + backslash tricks
  if (v.startsWith("//") || v.startsWith("\\") || v.startsWith("\\\\")) return fallback;

  // Safe internal path must be a normal single-slash route
  if (v.startsWith("/")) return v;

  // If someone passes a full URL, only accept its path/query/hash (never host)
  try {
    const u = new URL(v);
    const path = `${u.pathname}${u.search}${u.hash}`.trim();
    if (!path.startsWith("/") || path.startsWith("//")) return fallback;
    return path || fallback;
  } catch {
    return fallback;
  }
}

function toSignInUrl(opts: { callbackUrl?: string; error?: string }) {
  const p = new URLSearchParams();
  if (opts.callbackUrl) p.set("callbackUrl", safeInternalPath(opts.callbackUrl));
  if (opts.error) p.set("error", opts.error);
  const qs = p.toString();
  return `/auth/signin${qs ? `?${qs}` : ""}`;
}

export async function getServerUserContextOrNull(opts?: {
  requireTenant?: boolean;
}): Promise<ServerUserContext | null> {
  const requireTenant = opts?.requireTenant ?? true;

  const session = await getServerSession(authOptions);
  const u = (session?.user ?? null) as RawSessionUser | null;

  if (!u?.id || !u?.email) return null;

  const tenantId = (u.tenantId ?? null) as string | null;
  if (requireTenant && !tenantId) return null;

  return {
    userId: String(u.id),
    tenantId: String(tenantId ?? ""),
    roleName: (u.roleName ?? null) as string | null,
    staffId: (u.staffId ?? null) as string | null,
    email: String(u.email),
    name: (u.name ?? null) as string | null,
  };
}

export async function requireServerUserContext(opts?: {
  redirectTo?: string;
  requireTenant?: boolean;
  requireRoleNames?: string[];
}): Promise<ServerUserContext> {
  const redirectTo = safeInternalPath(opts?.redirectTo ?? "/teacher-portal");
  const requireTenant = opts?.requireTenant ?? true;
  const requireRoleNames = opts?.requireRoleNames;

  const ctx = await getServerUserContextOrNull({ requireTenant });

  if (!ctx) {
    redirect(toSignInUrl({ callbackUrl: redirectTo }));
  }

  if (requireTenant && !ctx!.tenantId) {
    redirect(toSignInUrl({ callbackUrl: redirectTo, error: "NO_ACTIVE_TENANT" }));
  }

  if (requireRoleNames?.length) {
    const role = ctx!.roleName ?? "";
    if (!requireRoleNames.includes(role)) {
      redirect(toSignInUrl({ callbackUrl: redirectTo, error: "FORBIDDEN" }));
    }
  }

  return ctx!;
}
