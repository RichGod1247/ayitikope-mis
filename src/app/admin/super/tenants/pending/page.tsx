// src/app/admin/super/tenants/pending/page.tsx
import PendingTenantsClient from "./PendingTenantsClient";

export const dynamic = "force-dynamic";

export default function PendingTenantsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">Pending Approvals</h1>
        <p className="text-sm text-zinc-600 mt-1">
          Approve tenants manually. Auto-activation applies after the configured window.
        </p>
      </div>

      <PendingTenantsClient />
    </div>
  );
}