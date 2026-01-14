// src/app/app/dashboard/page.tsx
import { prisma } from "@/lib/prisma";
import OrgSwitcher from "@/components/OrgSwitcher";
import { requireServerUserContext } from "@/lib/serverAuth";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const ctx = await requireServerUserContext({ redirectTo: "/app/dashboard", requireTenant: false });

  const memberships = await prisma.membership.findMany({
    where: { userId: ctx.userId, status: "ACTIVE" },
    include: { tenant: true },
    orderBy: { createdAt: "asc" },
  });

  const allTenants = memberships.map((m) => ({
    slug: m.tenant.slug,
    name: m.tenant.name,
  }));

  const activeBySession = ctx.tenantId
    ? memberships.find((m) => m.tenantId === ctx.tenantId)?.tenant
    : null;

  const active = activeBySession ?? memberships[0]?.tenant ?? null;

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
        <div className="text-red-600">No school selected or no memberships.</div>
      )}

      <p className="mt-4">
        You are signed in as <strong>{ctx.email}</strong>.
      </p>
    </main>
  );
}
