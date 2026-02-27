// src/app/admin/super/layout.tsx
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getServerUserContextOrNull } from "@/lib/serverAuth";

export const dynamic = "force-dynamic";

function toSignIn(callbackUrl: string, error?: string) {
  const p = new URLSearchParams();
  p.set("callbackUrl", callbackUrl);
  if (error) p.set("error", error);
  return `/auth/signin?${p.toString()}`;
}

export default async function AdminSuperLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getServerUserContextOrNull({ requireTenant: false });

  if (!ctx?.userId) redirect(toSignIn("/admin/super"));

  // ✅ DB-truth: SUPERADMIN must exist as an ACTIVE membership in ANY tenant
  const mem = await prisma.membership.findFirst({
    where: {
      userId: ctx.userId,
      status: "ACTIVE",
      role: { name: "SUPERADMIN" },
    },
    select: { tenantId: true },
  });

  if (!mem) redirect(toSignIn("/admin/super", "FORBIDDEN"));

  // Optional: ensure they always have an active tenant in session UX
  if (!ctx.tenantId) {
    try {
      await prisma.user.update({
        where: { id: ctx.userId },
        data: { lastActiveTenantId: mem.tenantId },
      });
    } catch {}
  }

  return <div className="p-6 max-w-6xl mx-auto">{children}</div>;
}