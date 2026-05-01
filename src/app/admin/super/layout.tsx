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

export default async function AdminSuperLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getServerUserContextOrNull({ requireTenant: false });

  if (!ctx?.userId) redirect(toSignIn("/admin/super"));

  const mem = await prisma.membership.findFirst({
    where: {
      userId: ctx.userId,
      status: "ACTIVE",
      role: { name: "SUPERADMIN" },
    },
    select: { tenantId: true },
  });

  if (!mem) redirect(toSignIn("/admin/super", "FORBIDDEN"));

  if (!ctx.tenantId) {
    try {
      await prisma.user.update({
        where: { id: ctx.userId },
        data: { lastActiveTenantId: mem.tenantId },
      });
    } catch {}
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {children}
      </div>
    </main>
  );
}