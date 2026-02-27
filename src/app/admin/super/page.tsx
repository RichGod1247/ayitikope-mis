// src/app/admin/super/page.tsx
import Link from "next/link";

export const dynamic = "force-dynamic";

export default function AdminSuperHome() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Super Admin</h1>
        <p className="text-sm text-zinc-600 mt-1">
          Platform-level controls: invite schools, approve/reject tenants, and manage tenants.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link href="/admin/super/tenants/invite" className="rounded-2xl border bg-white p-5 hover:shadow-sm">
          <p className="text-sm font-semibold text-zinc-900">Invite School</p>
          <p className="mt-1 text-sm text-zinc-600">Send onboarding invite via SMS + Email.</p>
        </Link>

        <Link href="/admin/super/tenants/pending" className="rounded-2xl border bg-white p-5 hover:shadow-sm">
          <p className="text-sm font-semibold text-zinc-900">Pending Approvals</p>
          <p className="mt-1 text-sm text-zinc-600">Approve or reject tenants. Auto-activation applies.</p>
        </Link>

        <Link href="/admin/super/tenants/all" className="rounded-2xl border bg-white p-5 hover:shadow-sm">
          <p className="text-sm font-semibold text-zinc-900">All Tenants</p>
          <p className="mt-1 text-sm text-zinc-600">See ACTIVE/PENDING tenants and where “approved” went.</p>
        </Link>
      </div>
    </div>
  );
}