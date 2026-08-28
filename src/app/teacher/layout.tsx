// src/app/teacher/layout.tsx
import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getServerUserContextOrNull } from "@/lib/serverAuth";
import LogoutButton from "@/components/LogoutButton";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ALLOWED_TEACHER_PORTAL_ROLES = new Set([
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

  if (!ALLOWED_TEACHER_PORTAL_ROLES.has(role)) {
    redirect("/app");
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: ctx.tenantId },
    select: { status: true, name: true, schoolCode: true },
  });

  if (!tenant || tenant.status !== "ACTIVE") redirect("/pending");

  const isTeacherOnly = role === "TEACHER";
  const showAdmin =
    role === "SCHOOL_ADMIN" || role === "SCHOOLADMIN" || role === "HEADTEACHER";

  const navItems = [
    { href: "/teacher/dashboard", label: "Dashboard", show: true },
    { href: "/teacher/notices", label: "Notices", show: isTeacherOnly },
    { href: "/teacher/attendance", label: "Attendance", show: true },
    { href: "/teacher/health", label: "Health", show: true },
    { href: "/teacher/lesson-notes", label: "Lesson Notes", show: true },
    { href: "/admin/dashboard", label: "Admin", show: showAdmin },
  ].filter((item) => item.show);

  return (
    <div className="min-h-screen bg-[#05070B] text-[#F7F4ED] [--teacher-sticky-top:65px] xl:[--teacher-sticky-top:73px]">
      <header
        data-teacher-sticky-header="v1"
        className="sticky top-0 z-40 border-b border-white/10 bg-[rgba(5,7,11,0.94)] backdrop-blur-xl"
      >
        <div className="relative mx-auto min-h-[64px] max-w-6xl px-4 py-3 xl:min-h-[72px] xl:py-4">
          <div className="pointer-events-none absolute -left-12 top-0 h-28 w-28 rounded-full bg-[#1B66D1]/20 blur-3xl" />
          <div className="pointer-events-none absolute right-0 top-0 h-24 w-24 rounded-full bg-[#D4AF37]/14 blur-3xl" />

          <div className="relative flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-[0.18em] text-[#E8C96A] xl:text-xs">
                EduLife OS · Teacher
              </p>
              <p className="mt-1 truncate text-sm font-semibold text-[#F7F4ED]">
                {tenant.name}
                {tenant.schoolCode ? (
                  <span className="ml-1 text-[#8F98A8]">({tenant.schoolCode})</span>
                ) : null}
              </p>
            </div>

            <div className="hidden items-center gap-3 xl:flex">
              <nav className="flex flex-wrap items-center gap-2">
                {navItems.map((item) => (
                  <Link key={item.href} className={navLinkClass()} href={item.href}>
                    {item.label}
                  </Link>
                ))}
              </nav>

              <LogoutButton className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-[#F7F4ED] transition hover:bg-white/10" />
            </div>

            <details
              data-teacher-mobile-nav="collapsed-v1"
              className="group relative shrink-0 xl:hidden"
            >
              <summary className="list-none cursor-pointer rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-[#F7F4ED] transition hover:bg-white/10 [&::-webkit-details-marker]:hidden">
                <span className="group-open:hidden">☰ Menu</span>
                <span className="hidden group-open:inline">Close</span>
              </summary>

              <div className="absolute right-0 top-[calc(100%+0.65rem)] z-50 w-[min(82vw,19rem)] rounded-2xl border border-white/10 bg-[#080C13] p-3 shadow-[0_22px_70px_rgba(0,0,0,0.48)]">
                <nav className="grid grid-cols-2 gap-2">
                  {navItems.map((item) => (
                    <Link
                      key={item.href}
                      className="rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-center text-sm font-medium text-[#E5E8EF] transition hover:bg-white/10"
                      href={item.href}
                    >
                      {item.label}
                    </Link>
                  ))}
                </nav>

                <div className="mt-3 border-t border-white/10 pt-3">
                  <LogoutButton className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-[#F7F4ED] transition hover:bg-white/10" />
                </div>
              </div>
            </details>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-5 md:py-8">{children}</main>
    </div>
  );
}
