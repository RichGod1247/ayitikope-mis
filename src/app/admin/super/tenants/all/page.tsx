// src/app/admin/super/tenants/all/page.tsx
import AllTenantsClient from "./allTenantsClient";

export const dynamic = "force-dynamic";

export default function AllTenantsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">All Tenants</h1>
        <p className="text-sm text-zinc-600 mt-1">
          View ACTIVE/PENDING tenants. This is where approved tenants “go”.
        </p>
      </div>

      <AllTenantsClient />
    </div>
  );
}