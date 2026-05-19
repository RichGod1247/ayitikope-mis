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

function isCircuitGovernance(role: string) {
  return role === "SISSO" || role === "CIRCUIT_SUPERVISOR";
}

function isDistrictGovernance(role: string) {
  return (
    role === "DISTRICT_DIRECTOR" ||
    role === "DISTRICT_MIS_OFFICER" ||
    role === "DISTRICT_SHEP_OFFICER" ||
    role === "DISTRICT_ASSESSMENT_OFFICER"
  );
}

function isGovernanceRole(role: string) {
  return isCircuitGovernance(role) || isDistrictGovernance(role) || role === "REGIONAL_VIEWER";
}

function defaultRouteForRole(role: string) {
  switch (role) {
    case "SUPERADMIN":
      return "/admin/super";

    case "SISSO":
    case "CIRCUIT_SUPERVISOR":
      return "/circuit/dashboard";

    case "DISTRICT_DIRECTOR":
    case "DISTRICT_MIS_OFFICER":
    case "DISTRICT_SHEP_OFFICER":
    case "DISTRICT_ASSESSMENT_OFFICER":
    case "REGIONAL_VIEWER":
      return "/district/dashboard";

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

  // Superadmin can operate without tenant.
  if (role === "SUPERADMIN") {
    redirect(desired || "/admin/super");
  }

  // Sprint 10 governance correction:
  // Governance officers do not authenticate into a school tenant.
  // They authenticate into a jurisdiction through GovernanceOfficerAssignment.
  if (isGovernanceRole(role)) {
    redirect(desired || defaultRouteForRole(role));
  }

  // School users must still have an active tenant.
  const tenantId = String((ctx as any).tenantId ?? "").trim();
  if (!tenantId) {
    redirect("/auth/signin?error=NO_ACTIVE_TENANT&callbackUrl=%2Fapp");
  }

  const t = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { status: true },
  });

  if (!t) redirect("/auth/signin?error=TENANT_NOT_FOUND&callbackUrl=%2Fapp");

  if (t.status !== "ACTIVE") redirect("/pending");

  // Setup enforcement only for school admin.
  if (role === "SCHOOL_ADMIN" || role === "ADMIN") {
    const complete = await fetchAdminSetupComplete();

    if (!complete && !desired.startsWith("/admin/setup")) {
      const safeNext = isSafeInternalPath(desired) ? desired : "/admin/dashboard";
      redirect(`/admin/setup?next=${encodeURIComponent(safeNext)}`);
    }
  }

  redirect(desired);
}