// src/app/admin/students/profile/page.tsx
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";
import { effectiveRole } from "@/lib/roleRouting";
import AdminStudentProfileClient from "@/components/admin/AdminStudentProfileClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ADMIN_ROLES = new Set(["SCHOOL_ADMIN", "HEADTEACHER", "SUPERADMIN"]);

export default async function AdminStudentProfilePage() {
  const safe = await requireServerUserContext({
    redirectTo: "/admin/students/profile",
    requireTenant: true,
  });

  const [tenant, membership] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: safe.tenantId },
      select: { id: true, name: true, schoolCode: true, status: true },
    }),
    prisma.membership.findUnique({
      where: { userId_tenantId: { userId: safe.userId, tenantId: safe.tenantId } },
      select: { status: true, role: { select: { name: true } } },
    }),
  ]);

  if (!tenant) redirect("/auth/signin?error=TENANT_NOT_FOUND&callbackUrl=/admin/students/profile");
  if (tenant.status !== "ACTIVE") redirect("/pending");
  if (!membership || membership.status !== "ACTIVE") redirect("/app");

  const role = effectiveRole(membership.role?.name ?? "");
  if (!ADMIN_ROLES.has(role)) redirect("/app");

  return <AdminStudentProfileClient tenantName={tenant.name} />;
}