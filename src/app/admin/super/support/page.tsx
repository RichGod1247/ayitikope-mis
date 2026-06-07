// src/app/admin/super/support/page.tsx
import { requireServerUserContext } from "@/lib/serverAuth";
import SuperadminSupportCockpitClient from "./SuperadminSupportCockpitClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function SuperadminSupportPage() {
  await requireServerUserContext({
    requireTenant: false,
    requireRoleNames: ["SUPERADMIN"],
    redirectTo: "/admin/super/support",
  });

  return <SuperadminSupportCockpitClient />;
}