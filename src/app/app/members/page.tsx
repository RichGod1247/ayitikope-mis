// src/app/app/members/page.tsx
import { cookies } from "next/headers";
import { prisma } from "../../../lib/prisma";

export const dynamic = "force-dynamic";

async function getData() {
  const cookieStore = await cookies();
  const slug = cookieStore.get("x-tenant")?.value || "ayitikope-basic";

  const tenant = await prisma.tenant.findUnique({
    where: { slug },
    select: { id: true, name: true, slug: true },
  });

  if (!tenant) {
    return { tenantName: null as string | null, tenantSlug: slug, items: [] as any[] };
  }

  const items = await prisma.membership.findMany({
    where: { tenantId: tenant.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      createdAt: true,
      user: { select: { id: true, name: true, email: true } },
      role: { select: { id: true, name: true } },
    },
    take: 100,
  });

  return { tenantName: tenant.name, tenantSlug: tenant.slug, items };
}

export default async function MembersPage() {
  const { tenantName, tenantSlug, items } = await getData();

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Members</h1>
        <p className="text-sm text-gray-500">
          {tenantName
            ? `Tenant: ${tenantName} (${tenantSlug})`
            : `No active tenant detected (cookie x-tenant = ${tenantSlug})`}
        </p>
        <p className="text-sm text-gray-500">Total: {items.length}</p>
      </header>

      <div className="overflow-x-auto rounded-xl border">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left">
            <tr>
              <th className="px-4 py-2 font-semibold">Name</th>
              <th className="px-4 py-2 font-semibold">Email</th>
              <th className="px-4 py-2 font-semibold">Role</th>
              <th className="px-4 py-2 font-semibold">Status</th>
              <th className="px-4 py-2 font-semibold">Joined</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td className="px-4 py-4 text-gray-500" colSpan={5}>
                  No members yet.
                </td>
              </tr>
            ) : (
              items.map((m) => (
                <tr key={m.id} className="border-t">
                  <td className="px-4 py-2">{m.user?.name ?? "—"}</td>
                  <td className="px-4 py-2">{m.user?.email ?? "—"}</td>
                  <td className="px-4 py-2">{m.role?.name ?? "—"}</td>
                  <td className="px-4 py-2">{m.status}</td>
                  <td className="px-4 py-2">
                    {new Date(m.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
