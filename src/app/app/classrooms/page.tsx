// src/app/app/classrooms/page.tsx
import { prisma } from "@/lib/prisma";
import ClientBits from "./ClientBits";
import { requireServerUserContext } from "@/lib/serverAuth";

export const dynamic = "force-dynamic";

export type ClassroomItem = {
  id: string;
  name: string;
  grade: string | null;
  arm: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

async function getData() {
  const ctx = await requireServerUserContext({ redirectTo: "/app/dashboard", requireTenant: true });

  const tenant = await prisma.tenant.findUnique({
    where: { id: ctx.tenantId },
    select: { id: true, name: true, slug: true },
  });

  if (!tenant) {
    return { items: [] as ClassroomItem[], tenantName: null as string | null, tenantSlug: "" };
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
      updatedAt: true,
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
    updatedAt: r.updatedAt.toISOString(),
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
        {tenantSlug ? <p className="text-xs text-gray-400">({tenantSlug})</p> : null}
      </div>

      <ClientBits items={items} />
    </div>
  );
}
