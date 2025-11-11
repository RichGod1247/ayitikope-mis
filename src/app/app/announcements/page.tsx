// src/app/app/announcements/page.tsx
import { prisma } from "../../../lib/prisma";
import { cookies } from "next/headers";
import NewAnnouncementForm from "./NewAnnouncementForm";
import AnnouncementsClientList from "./AnnouncementsClientList";

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

  const rows = await prisma.announcement.findMany({
    where: { tenantId: tenant.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, title: true, body: true, createdAt: true },
  });

  // Convert Date -> string for the client component
  const items = rows.map((r) => ({
    id: r.id,
    title: r.title,
    body: r.body,
    createdAt: r.createdAt.toISOString(),
  }));

  return { items, tenantName: tenant.name, tenantSlug: tenant.slug };
}

export default async function AnnouncementsPage() {
  const { items, tenantName, tenantSlug } = await getData();

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Announcements</h1>
        <p className="text-sm text-gray-500">
          {tenantName ? `Tenant: ${tenantName}` : "No active tenant detected"}
        </p>
      </div>

      {/* Create form */}
      <NewAnnouncementForm tenantSlug={tenantSlug} />

      {/* List with Edit/Delete buttons */}
      <AnnouncementsClientList items={items} />
    </div>
  );
}
