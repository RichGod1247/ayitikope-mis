// src/app/app/dashboard/page.tsx
import { prisma } from "@/lib/prisma";
import OrgSwitcher from "@/components/OrgSwitcher";
import { requireServerUserContext } from "@/lib/serverAuth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RoleName = "TEACHER" | "SCHOOL_ADMIN" | "HEADTEACHER" | "ADMIN" | string;

function normalizeRoleName(role: unknown): RoleName {
  return String(role ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
}

function routeForRole(role: RoleName) {
  if (role === "HEADTEACHER") return "/headteacher/dashboard";
  if (role === "SCHOOL_ADMIN") return "/admin/dashboard";
  if (role === "ADMIN") return "/admin/dashboard"; // legacy compat
  return "/teacher/dashboard";
}

export default async function DashboardPage() {
  const ctx = await requireServerUserContext({
    redirectTo: "/app/dashboard",
    requireTenant: false,
  });

  const memberships = await prisma.membership.findMany({
    where: { userId: ctx.userId, status: "ACTIVE" },
    select: {
      tenantId: true,
      createdAt: true,
      tenant: { select: { id: true, slug: true, name: true } },
      role: { select: { name: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const allTenants = memberships.map((m) => ({
    id: m.tenant.id,
    slug: m.tenant.slug,
    name: m.tenant.name,
  }));

  const activeMembership = ctx.tenantId
    ? memberships.find((m) => m.tenantId === ctx.tenantId) ?? null
    : null;

  // If tenant already selected in session, go to correct dashboard immediately.
  if (ctx.tenantId) {
    let role = normalizeRoleName(ctx.roleName);
    if (!role) role = normalizeRoleName(activeMembership?.role?.name);
    redirect(routeForRole(role));
  }

  return (
    <main className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">EduLife OS — Dashboard</h1>

        {/* ✅ tenantId-first switcher (no slug guessing, no API lookup) */}
        <OrgSwitcher currentTenantId={null} allTenants={allTenants} />
      </div>

      {memberships.length ? (
        <div className="rounded border p-4">
          <p className="text-sm">Select your school to continue:</p>
          <ul className="mt-2 text-sm list-disc pl-5">
            {memberships.map((m) => (
              <li key={m.tenantId}>
                {m.tenant.name}{" "}
                <span className="text-gray-500">({m.tenant.slug})</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="text-red-600">No memberships found for this account.</div>
      )}

      <p className="mt-4">
        You are signed in as <strong>{ctx.email}</strong>.
      </p>
    </main>
  );
}
