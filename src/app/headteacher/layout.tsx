// src/app/headteacher/layout.tsx
import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import LogoutButton from "@/components/LogoutButton";
import { requireHeadteacherContext } from "@/lib/headteacherAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function normRoleKey(v: unknown) {
  return String(v ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]/g, "_");
}

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function navLinkClass(active = false) {
  return cx(
    "rounded-full border px-3 py-2 text-sm font-medium transition",
    active
      ? "border-transparent bg-[linear-gradient(135deg,#D4AF37,#E8C96A)] text-[#071A3D] shadow-[0_14px_40px_rgba(212,175,55,0.20)]"
      : "border-white/10 bg-white/5 text-[#C9CDD6] hover:bg-white/10 hover:text-[#F7F4ED]"
  );
}

export default async function HeadteacherLayout({ children }: { children: ReactNode }) {
  let ctx: Awaited<ReturnType<typeof requireHeadteacherContext>>;

  try {
    ctx = await requireHeadteacherContext({ redirectTo: "/headteacher/dashboard" });
  } catch {
    redirect("/app");
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: ctx.tenantId },
    select: { status: true, name: true, schoolCode: true },
  });

  if (!tenant || tenant.status !== "ACTIVE") redirect("/pending");

  const roleKey = normRoleKey(ctx.roleKey ?? ctx.roleName);
  const showAdmin =
    roleKey === "SUPERADMIN" ||
    roleKey === "ADMIN" ||
    roleKey === "SCHOOL_ADMIN" ||
    roleKey === "SCHOOLADMIN";

  return (
    <div className="min-h-screen bg-[#05070B] text-[#F7F4ED]">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(27,102,209,0.10),transparent_30%),radial-gradient(circle_at_top_right,rgba(212,175,55,0.08),transparent_24%),linear-gradient(180deg,#05070B_0%,#07111F_38%,#05070B_100%)]" />
        <div className="absolute inset-0 opacity-[0.06] [background-image:linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:56px_56px]" />
      </div>

      <header className="sticky top-0 z-40 border-b border-white/10 bg-[rgba(5,7,11,0.84)] backdrop-blur-xl">
        <div className="relative mx-auto max-w-6xl overflow-visible px-4 py-2.5 sm:py-3">
          <div className="pointer-events-none absolute -left-12 top-0 h-28 w-28 rounded-full bg-[#1B66D1]/20 blur-3xl" />
          <div className="pointer-events-none absolute right-0 top-0 h-24 w-24 rounded-full bg-[#D4AF37]/14 blur-3xl" />

          <div className="relative flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.16em] text-[#E8C96A] sm:text-xs">
                EduLife OS · Headteacher
              </p>
              <p className="mt-0.5 truncate text-xs font-semibold text-[#F7F4ED] sm:text-sm">
                {tenant.name}
                {tenant.schoolCode ? (
                  <span className="ml-1 text-[#8F98A8]">({tenant.schoolCode})</span>
                ) : null}
              </p>
            </div>

            <details className="relative shrink-0 xl:hidden">
              <summary
                aria-label="Open headteacher navigation"
                className="flex cursor-pointer list-none items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-[#F7F4ED] transition hover:bg-white/10 [&::-webkit-details-marker]:hidden"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <path d="M4 6h16M4 12h16M4 18h16" />
                </svg>
                Menu
              </summary>

              <div className="absolute right-0 top-full z-50 mt-2 w-[min(88vw,320px)] rounded-2xl border border-white/10 bg-[#07111F] p-3 shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
                <nav className="grid grid-cols-1 gap-2">
                  <Link className={navLinkClass()} href="/headteacher/dashboard">
                    Dashboard
                  </Link>

                  <Link className={navLinkClass()} href="/headteacher/day">
                    Attendance Command
                  </Link>

                  <Link className={navLinkClass()} href="/headteacher/notices">
                    Notices
                  </Link>

                  <Link className={navLinkClass()} href="/headteacher/reports">
                    Reports
                  </Link>

                  <Link className={navLinkClass()} href="/headteacher/lesson-notes">
                    Lesson Notes
                  </Link>

                  {showAdmin ? (
                    <Link className={navLinkClass()} href="/admin/dashboard">
                      Admin
                    </Link>
                  ) : null}
                </nav>

                <div className="mt-3 border-t border-white/10 pt-3">
                  <LogoutButton className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-[#F7F4ED] transition hover:bg-white/10" />
                </div>
              </div>
            </details>

            <div className="hidden items-center gap-3 xl:flex">
              <nav className="flex flex-wrap items-center gap-2">
                <Link className={navLinkClass()} href="/headteacher/dashboard">
                  Dashboard
                </Link>

                <Link className={navLinkClass()} href="/headteacher/day">
                  Attendance Command
                </Link>

                <Link className={navLinkClass()} href="/headteacher/notices">
                  Notices
                </Link>

                <Link className={navLinkClass()} href="/headteacher/reports">
                  Reports
                </Link>

                <Link className={navLinkClass()} href="/headteacher/lesson-notes">
                  Lesson Notes
                </Link>

                {showAdmin ? (
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

      <main className="relative mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}