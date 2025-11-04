// src/app/app/dashboard/page.tsx
import { getServerSession } from "next-auth";
import { authOptions } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";
import { getActiveTenantSlug } from "../../../lib/tenant";
import OrgSwitcher from "../../../components/OrgSwitcher";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  const userId = (session as any)?.userId as string | undefined;

  // Get all tenants (schools) this user belongs to
  const memberships = userId
    ? await prisma.membership.findMany({
        where: { userId, status: "ACTIVE" },
        include: { tenant: true },
        orderBy: { createdAt: "asc" },
      })
    : [];

  const allTenants = memberships.map((m) => ({
    slug: m.tenant.slug,
    name: m.tenant.name,
  }));

  // Determine active tenant: cookie → first membership
  const activeSlug = await getActiveTenantSlug(userId);
  const active = allTenants.find((t) => t.slug === activeSlug) || allTenants[0] || null;

  return (
    <main className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">EduLife OS — Dashboard</h1>
        <OrgSwitcher currentSlug={active?.slug || null} allTenants={allTenants} />
      </div>

      {active ? (
        <div className="rounded border p-4">
          <p className="text-sm">Active School:</p>
          <h2 className="text-xl font-semibold">{active.name}</h2>
          <p className="text-xs text-gray-500">({active.slug})</p>
        </div>
      ) : (
        <div className="text-red-600">
          No school selected or no memberships.
        </div>
      )}

      <p className="mt-4">
        You are signed in as <strong>{session?.user?.email}</strong>.
      </p>
    </main>
  );
}
