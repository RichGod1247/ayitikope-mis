// src/app/admin/layout.tsx
import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";
import LogoutButton from "@/components/LogoutButton";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function navLinkClass() {
  return "rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-[#C9CDD6] transition hover:bg-white/10 hover:text-[#F7F4ED]";
}

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const safe = await requireServerUserContext({
    redirectTo: "/admin/dashboard",
    requireTenant: true,
    requireRoleNames: ["SCHOOL_ADMIN", "HEADTEACHER", "SUPERADMIN"],
  });

  const tenant = await prisma.tenant.findUnique({
    where: { id: safe.tenantId },
    select: { id: true, name: true, schoolCode: true, status: true },
  });

  if (!tenant) redirect("/auth/signin?error=TENANT_NOT_FOUND&callbackUrl=/app");
  if (tenant.status !== "ACTIVE") redirect("/pending");

  return (
    <div className="min-h-screen bg-[#05070B] text-[#F7F4ED]">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[rgba(5,7,11,0.88)] backdrop-blur-xl">
        <div className="relative mx-auto max-w-6xl overflow-hidden px-4 py-4">
          <div className="pointer-events-none absolute -left-12 top-0 h-28 w-28 rounded-full bg-[#1B66D1]/20 blur-3xl" />
          <div className="pointer-events-none absolute right-0 top-0 h-24 w-24 rounded-full bg-[#D4AF37]/14 blur-3xl" />

          <div className="relative flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-[0.18em] text-[#E8C96A]">
                EduLife OS · Admin
              </p>
              <p className="mt-1 truncate text-sm font-semibold text-[#F7F4ED]">
                {tenant.name} <span className="text-[#8F98A8]">({tenant.schoolCode})</span>
              </p>
            </div>

            <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
              <nav className="flex flex-wrap items-center gap-2">
                <Link className={navLinkClass()} href="/admin/dashboard">
                  Dashboard
                </Link>
                <Link className={navLinkClass()} href="/admin/settings">
                  Settings
                </Link>
                <Link className={navLinkClass()} href="/admin/classes">
                  Classes
                </Link>
                <Link className={navLinkClass()} href="/admin/teachers">
                  Teachers
                </Link>
                <Link className={navLinkClass()} href="/admin/students">
                  Students
                </Link>
                <Link className={navLinkClass()} href="/admin/students/profile">
                  Student 360
                </Link>
                <Link className={navLinkClass()} href="/app">
                  Portal
                </Link>
              </nav>

              <LogoutButton className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-[#F7F4ED] transition hover:bg-white/10" />
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}