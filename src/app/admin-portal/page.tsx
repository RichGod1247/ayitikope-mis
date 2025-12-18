// src/app/admin-portal/page.tsx
"use client";

import AdminPortalClient from "@/components/AdminPortalClient";

export default function AdminPortalPage() {
  // Demo values for now.
  // Later this will be driven by the authenticated admin + tenant.
  const demoTenantId = "cmhhnghn00008vcpgp3fl07fl";
  const demoAdminUserId = "demo-admin-user-id";

  return (
    <AdminPortalClient
      tenantId={demoTenantId}
      adminUserId={demoAdminUserId}
    />
  );
}
