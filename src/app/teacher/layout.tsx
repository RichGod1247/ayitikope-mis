// src/app/teacher/layout.tsx
import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getServerUserContextOrNull } from "@/lib/serverAuth";
import LogoutButton from "@/components/LogoutButton";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Effective roles (ADMIN already maps to SCHOOL_ADMIN in serverAuth)
const ALLOWED_TEACHER_ROLES = new Set(["TEACHER", "HEADTEACHER", "SCHOOL_ADMIN"]);

export default async function TeacherLayout({ children }: { children: ReactNode }) {
  const ctx = await getServerUserContextOrNull({ requireTenant: true });

  if (!ctx) {
    redirect(`/auth/signin?callbackUrl=${encodeURIComponent("/teacher/dashboard")}`);
  }

  const role = (ctx.roleName ?? "").trim();
  if (!ALLOWED_TEACHER_ROLES.has(role)) redirect("/app");

  const tenant = await prisma.tenant.findUnique({
    where: { id: ctx.tenantId },
    select: { status: true, name: true, schoolCode: true },
  });

  if (!tenant || tenant.status !== "ACTIVE") redirect("/pending");

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="border-b bg-white">
        <div className="mx-auto max-w-6xl px-4 py-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">EduLife OS · Teacher</p>
            <p className="text-sm font-semibold text-zinc-900 truncate">
              {tenant.name} <span className="text-zinc-400">({tenant.schoolCode})</span>
            </p>
          </div>

          <div className="flex items-center gap-3">
            <nav className="flex items-center gap-3 text-sm">
              <Link className="hover:underline" href="/teacher/dashboard">
                Dashboard
              </Link>
              <Link className="hover:underline" href="/teacher/attendance">
                Attendance
              </Link>
              <Link className="hover:underline" href="/teacher/health">
                Health
              </Link>

              {role === "SCHOOL_ADMIN" || role === "HEADTEACHER" ? (
                <Link className="hover:underline text-zinc-600" href="/admin/dashboard">
                  Admin
                </Link>
              ) : null}
            </nav>

            <LogoutButton className="rounded-xl border px-3 py-2 text-sm hover:bg-zinc-50" />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
