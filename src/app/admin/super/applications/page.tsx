// src/app/admin/super/applications/page.tsx
import { requireServerUserContext } from "@/lib/serverAuth";
import SuperadminApplicationsClient from "./SuperadminApplicationsClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function SuperadminApplicationsPage() {
  await requireServerUserContext({
    requireTenant: false,
    requireRoleNames: ["SUPERADMIN"],
    redirectTo: "/admin/super/applications",
  });

  return <SuperadminApplicationsClient />;
}