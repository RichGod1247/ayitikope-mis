import Link from "next/link";
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

const governanceLinks = [
  { href: "/admin/super", label: "Super home" },
  { href: "/circuit/dashboard", label: "SISSO" },
  { href: "/district/dashboard", label: "Director" },
  { href: "/district/hos/dashboard", label: "HOS" },
  { href: "/district/bsc/dashboard", label: "BSC" },
  { href: "/admin/super/safety-controls", label: "Safety controls" },
] as const;

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
        <nav
          aria-label="Superadmin governance shortcuts"
          className="mb-5 hidden flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm lg:flex"
        >
          {governanceLinks.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="inline-flex min-h-10 items-center rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-800 transition hover:bg-slate-100"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <details className="group mb-5 rounded-2xl border border-slate-200 bg-white shadow-sm lg:hidden">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-bold text-slate-950 [&::-webkit-details-marker]:hidden">
            <span>Superadmin shortcuts</span>
            <span className="text-xs font-semibold text-slate-500 group-open:hidden">
              Open
            </span>
            <span className="hidden text-xs font-semibold text-slate-500 group-open:inline">
              Close
            </span>
          </summary>

          <nav
            aria-label="Mobile superadmin governance shortcuts"
            className="grid grid-cols-2 gap-2 border-t border-slate-200 p-3"
          >
            {governanceLinks.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-800 transition hover:bg-slate-100"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </details>

        {children}
      </div>
    </main>
  );
}
