// src/app/app/classrooms/page.tsx
import { cookies } from "next/headers";
import { prisma } from "../../../lib/prisma"; // from /app/classrooms to /lib
import ClientBits from "./ClientBits";

export const dynamic = "force-dynamic";

export type ClassroomItem = {
  id: string;
  name: string;
  grade: string | null;
  arm: string | null;
  note: string | null;
  createdAt: string;
};

async function getData() {
  const cookieStore = await cookies();
  const slug = cookieStore.get("x-tenant")?.value || "ayitikope-basic";

  const tenant = await prisma.tenant.findUnique({
    where: { slug },
    select: { id: true, name: true, slug: true },
  });

  if (!tenant) {
    return {
      items: [] as ClassroomItem[],
      tenantName: null as string | null,
      tenantSlug: slug,
    };
  }

  const rows = await prisma.classroom.findMany({
    where: { tenantId: tenant.id },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      grade: true,
      arm: true,
      note: true,
      createdAt: true,
    },
    take: 500,
  });

  const items: ClassroomItem[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    grade: r.grade,
    arm: r.arm,
    note: r.note,
    createdAt: r.createdAt.toISOString(),
  }));

  return { items, tenantName: tenant.name, tenantSlug: tenant.slug };
}

export default async function ClassroomsPage() {
  const { items, tenantName, tenantSlug } = await getData();

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Classrooms</h1>
        <p className="text-sm text-gray-500">
          {tenantName ? `Tenant: ${tenantName}` : "No active tenant detected"}
        </p>
      </div>

      <ClientBits items={items} tenantSlug={tenantSlug} />
    </div>
  );
}
