// src/app/admin/layout.tsx
import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";
import LogoutButton from "@/components/LogoutButton";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  // ✅ Bank-grade: DB-truth role enforcement for the entire /admin area
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
    <div className="min-h-screen bg-zinc-50">
      <header className="border-b bg-white">
        <div className="mx-auto max-w-6xl px-4 py-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">EduLife OS · Admin</p>
            <p className="text-sm font-semibold text-zinc-900 truncate">
              {tenant.name} <span className="text-zinc-400">({tenant.schoolCode})</span>
            </p>
          </div>

          <div className="flex items-center gap-3">
            <nav className="flex items-center gap-3 text-sm">
              <Link className="hover:underline" href="/admin/dashboard">
                Dashboard
              </Link>
              <Link className="hover:underline" href="/admin/settings">
                Settings
              </Link>
              <Link className="hover:underline" href="/admin/classes">
                Classes
              </Link>
              <Link className="hover:underline" href="/admin/teachers">
                Teachers
              </Link>
              <Link className="hover:underline" href="/admin/students">
                Students
              </Link>
              <Link className="hover:underline" href="/admin/students/profile">
                Student 360
              </Link>
              <Link className="hover:underline text-zinc-500" href="/app">
                Portal
              </Link>
            </nav>

            <LogoutButton className="rounded-xl border px-3 py-2 text-sm hover:bg-zinc-50" />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
