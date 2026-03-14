// src/app/admin/setup/layout.tsx
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ALLOWED_ADMIN_ROLES = ["SCHOOL_ADMIN", "HEADTEACHER", "SUPERADMIN"] as const;

export default async function AdminSetupLayout({ children }: { children: ReactNode }) {
  const ctx = await requireServerUserContext({
    redirectTo: "/admin/setup",
    requireTenant: true,
    requireRoleNames: [...ALLOWED_ADMIN_ROLES],
  });

  const tenant = await prisma.tenant.findUnique({
    where: { id: ctx.tenantId },
    select: { status: true },
  });

  if (!tenant || tenant.status !== "ACTIVE") redirect("/pending");

  return <>{children}</>;
}