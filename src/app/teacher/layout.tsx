// src/app/teacher/layout.tsx
import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getServerUserContextOrNull } from "@/lib/serverAuth";
import LogoutButton from "@/components/LogoutButton";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ALLOWED_TEACHER_ROLES = new Set([
  "TEACHER",
  "HEADTEACHER",
  "SCHOOL_ADMIN",
  "SCHOOLADMIN",
]);

function normalizeRole(value: unknown) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]/g, "_");
}

function navLinkClass() {
  return "rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-[#C9CDD6] transition hover:bg-white/10 hover:text-[#F7F4ED]";
}

export default async function TeacherLayout({ children }: { children: ReactNode }) {
  const ctx = await getServerUserContextOrNull({ requireTenant: true });

  if (!ctx) {
    redirect(`/auth/signin?callbackUrl=${encodeURIComponent("/teacher/dashboard")}`);
  }

  const role = normalizeRole(ctx.roleName);
  if (!ALLOWED_TEACHER_ROLES.has(role)) redirect("/app");

  const tenant = await prisma.tenant.findUnique({
    where: { id: ctx.tenantId },
    select: { status: true, name: true, schoolCode: true },
  });

  if (!tenant || tenant.status !== "ACTIVE") redirect("/pending");

  return (
    <div className="min-h-screen bg-[#05070B] text-[#F7F4ED]">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[rgba(5,7,11,0.88)] backdrop-blur-xl">
        <div className="relative mx-auto max-w-6xl overflow-hidden px-4 py-4">
          <div className="pointer-events-none absolute -left-12 top-0 h-28 w-28 rounded-full bg-[#1B66D1]/20 blur-3xl" />
          <div className="pointer-events-none absolute right-0 top-0 h-24 w-24 rounded-full bg-[#D4AF37]/14 blur-3xl" />

          <div className="relative flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-[0.18em] text-[#E8C96A]">
                EduLife OS · Teacher
              </p>
              <p className="mt-1 truncate text-sm font-semibold text-[#F7F4ED]">
                {tenant.name}
                {tenant.schoolCode ? (
                  <span className="ml-1 text-[#8F98A8]">({tenant.schoolCode})</span>
                ) : null}
              </p>
            </div>

            <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
              <nav className="flex flex-wrap items-center gap-2">
                <Link className={navLinkClass()} href="/teacher/dashboard">
                  Dashboard
                </Link>

                <Link className={navLinkClass()} href="/teacher/notices">
                  Notices
                </Link>

                <Link className={navLinkClass()} href="/teacher/attendance">
                  Attendance
                </Link>

                <Link className={navLinkClass()} href="/teacher/health">
                  Health
                </Link>

                <Link className={navLinkClass()} href="/teacher/lesson-notes">
                  Lesson Notes
                </Link>

                {role === "SCHOOL_ADMIN" ||
                role === "SCHOOLADMIN" ||
                role === "HEADTEACHER" ? (
                  <Link className={navLinkClass()} href="/admin/dashboard">
                    Admin
                  </Link>
                ) : null}
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