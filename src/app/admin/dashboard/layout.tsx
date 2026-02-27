// src/app/admin/dashboard/layout.tsx
import { redirect } from "next/navigation";
import { requireServerUserContext } from "@/lib/serverAuth";
import { fetchAdminSetupComplete } from "@/lib/adminSetupEnforcement";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireServerUserContext({
    redirectTo: "/admin/dashboard",
    requireTenant: true,
    requireRoleNames: ["SCHOOL_ADMIN"],
  });

  // If a SUPERADMIN somehow hits /admin/dashboard, send them where they belong.
  // (This is a safety net; requireRoleNames above already blocks it.)
  const roleName = String((ctx as any).roleName ?? "");
  if (roleName === "SUPERADMIN") redirect("/admin/super");

  const complete = await fetchAdminSetupComplete();
  if (!complete) {
    redirect(`/admin/setup?next=${encodeURIComponent("/admin/dashboard")}`);
  }

  return <>{children}</>;
}