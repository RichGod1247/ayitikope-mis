// src/app/app/announcements/page.tsx
import { prisma } from "../../../lib/prisma";
import { cookies } from "next/headers";
import NewAnnouncementForm from "./NewAnnouncementForm";
import TenantSwitcher from "./TenantSwitcher";

export const dynamic = "force-dynamic";

async function getData() {
  const cookieStore = await cookies();
  const slug = cookieStore.get("x-tenant")?.value || "ayitikope-basic";

  const tenant = await prisma.tenant.findUnique({
    where: { slug },
    select: { id: true, name: true, slug: true },
  });

  if (!tenant) {
    return { items: [], tenantName: null, tenantSlug: slug };
  }

  const items = await prisma.announcement.findMany({
    where: { tenantId: tenant.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      title: true,
      body: true,
      createdAt: true,
    },
  });

  // Convert Date -> string for the client list component if you need it later
  const itemsForClient = items.map((a) => ({
    ...a,
    createdAt: a.createdAt.toISOString(),
  }));

  return {
    items: itemsForClient,
    tenantName: tenant.name,
    tenantSlug: tenant.slug,
  };
}

export default async function AnnouncementsPage() {
  const { items, tenantName, tenantSlug } = await getData();

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Announcements</h1>
          <p className="text-sm text-gray-500">
            {tenantName ? `Tenant: ${tenantName}` : "No active tenant detected"}
          </p>
        </div>
        <TenantSwitcher currentSlug={tenantSlug} />
      </div>

      <NewAnnouncementForm tenantSlug={tenantSlug} />

      {/* If you’re using your existing client list component, import it and pass items:
          <AnnouncementsClientList items={items} />
          Or keep your previous ClientListShell if you prefer.
      */}

      <div className="space-y-4">
        {items.length === 0 ? (
          <p className="text-gray-500">No announcements yet.</p>
        ) : (
          items.map((a) => (
            <div key={a.id} className="rounded-xl border p-4 space-y-2">
              <div className="text-sm text-gray-500">
                {new Date(a.createdAt).toLocaleString()}
              </div>
              <h3 className="font-semibold text-lg">{a.title}</h3>
              <p className="mt-1">{a.body}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
