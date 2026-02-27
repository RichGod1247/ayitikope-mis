// src/app/admin/setup/layout.tsx
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AdminSetupLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireServerUserContext({
    redirectTo: "/admin/setup",
    requireTenant: true,
    requireRoleNames: ["SCHOOL_ADMIN"],
  });

  const t = await prisma.tenant.findUnique({
    where: { id: ctx.tenantId },
    select: { status: true },
  });

  // If tenant not ACTIVE, they should be on /pending (or waiting approval)
  if (!t || t.status !== "ACTIVE") redirect("/pending");

  const s = await prisma.tenantSettings.findUnique({
    where: { tenantId: ctx.tenantId },
    select: { setupCompletedAt: true },
  });

  // Setup already done => never show setup again
  if (s?.setupCompletedAt) redirect("/admin/dashboard");

  return <>{children}</>;
}