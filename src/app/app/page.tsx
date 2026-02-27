// src/app/app/page.tsx
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getServerUserContextOrNull } from "@/lib/serverAuth";
import { fetchAdminSetupComplete } from "@/lib/adminSetupEnforcement";
import { effectiveRole, isPathAllowedForRole } from "@/lib/roleRouting";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type SP = Record<string, string | string[] | undefined>;

function first(sp: SP, k: string) {
  const v = sp[k];
  return Array.isArray(v) ? v[0] : v;
}

function isSafeInternalPath(p: string) {
  if (!p) return false;
  if (!p.startsWith("/")) return false;
  if (p.startsWith("//")) return false;
  if (p.includes("://")) return false;
  return true;
}

function defaultRouteForRole(role: string) {
  switch (role) {
    case "SUPERADMIN":
      return "/admin/super";
    case "SCHOOL_ADMIN":
    case "ADMIN":
      return "/admin/dashboard";
    case "HEADTEACHER":
      return "/headteacher/dashboard";
    case "TEACHER":
      return "/teacher/dashboard";
    case "PARENT":
      return "/parents/my-children";
    default:
      return "/auth/signin?error=FORBIDDEN&callbackUrl=%2Fapp";
  }
}

function pickDesiredPath(next: string | null, role: string) {
  if (!next || !isSafeInternalPath(next)) return defaultRouteForRole(role);
  if (!isPathAllowedForRole(next, role)) return defaultRouteForRole(role);
  return next;
}

export default async function AppEntry(props: { searchParams?: SP | Promise<SP> }) {
  const sp = (await Promise.resolve(props.searchParams ?? {})) as SP;

  const ctx = await getServerUserContextOrNull({ requireTenant: false });
  if (!ctx?.userId) redirect("/auth/signin?callbackUrl=%2Fapp");

  const roleRaw = (ctx as any).roleName ?? "";
  const role = effectiveRole(roleRaw);

  const next = first(sp, "next");
  const desired = pickDesiredPath(next ? String(next) : null, role);

  // SUPERADMIN can operate even if tenantId is missing
  if (role === "SUPERADMIN") {
    redirect(desired || "/admin/super");
  }

  // Non-super must have an active tenant selected
  const tenantId = String((ctx as any).tenantId ?? "").trim();
  if (!tenantId) {
    redirect("/auth/signin?error=NO_ACTIVE_TENANT&callbackUrl=%2Fapp");
  }

  const t = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { status: true },
  });

  if (!t) redirect("/auth/signin?error=TENANT_NOT_FOUND&callbackUrl=%2Fapp");

  // If tenant isn’t ACTIVE, don’t let them ping-pong into setup/dashboard
  if (t.status !== "ACTIVE") redirect("/pending");

  // Setup enforcement only for SCHOOL_ADMIN
  if (role === "SCHOOL_ADMIN" || role === "ADMIN") {
    const complete = await fetchAdminSetupComplete();

    // allow setup route itself while incomplete
    if (!complete && !desired.startsWith("/admin/setup")) {
      const safeNext = isSafeInternalPath(desired) ? desired : "/admin/dashboard";
      redirect(`/admin/setup?next=${encodeURIComponent(safeNext)}`);
    }
  }

  redirect(desired);
}