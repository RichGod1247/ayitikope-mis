// src/app/admin/layout.tsx
import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";
import LogoutButton from "@/components/LogoutButton";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type NavItem = { label: string; href: string };
type NavSection = { title: string; items: NavItem[] };

const mainNav: NavItem[] = [
  { label: "Dashboard", href: "/admin/dashboard" },
  { label: "Academic Settings", href: "/admin/setup" },
  { label: "Classes", href: "/admin/classes" },
  { label: "Students", href: "/admin/students" },
  { label: "Student 360°", href: "/admin/students/profile" },
  { label: "Teachers", href: "/admin/teachers" },
  { label: "Attendance", href: "/admin/attendance" },
  { label: "Assessments", href: "/admin/assessments" },
];

const scholarshipNav: NavItem[] = [
  { label: "Applications", href: "/admin/scholarships" },
  { label: "Award Support", href: "/admin/scholarships/award" },
];

const financeNav: NavItem[] = [
  { label: "Finance Overview", href: "/admin/fees/overview" },
  { label: "Online Payments", href: "/admin/fees/online-payments" },
  { label: "Finance Summary", href: "/admin/fees/summary" },
  { label: "Fee Structures", href: "/admin/fees/structures" },
  { label: "Invoices & Payments", href: "/admin/fees/invoices" },
  { label: "Receipts", href: "/admin/fees/receipts" },
  { label: "Ledger Trail", href: "/admin/fees/ledger" },
  { label: "Reconciliation", href: "/admin/fees/reconciliation" },
  { label: "Disputes", href: "/admin/fees/disputes" },
  { label: "Arrears", href: "/admin/fees/arrears" },
];

const navSections: NavSection[] = [
  { title: "School", items: mainNav },
  { title: "Scholarships", items: scholarshipNav },
  { title: "Finance", items: financeNav },
];

function SidebarLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="block rounded-xl px-3 py-2 text-sm font-medium text-[#C9CDD6] transition-colors hover:bg-white/8 hover:text-[#F7F4ED]"
    >
      {label}
    </Link>
  );
}

function MobileNavLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-medium text-[#C9CDD6] hover:bg-white/10 hover:text-[#F7F4ED]"
    >
      {children}
    </Link>
  );
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

  const isSuper = String((safe as any).roleName ?? "").toUpperCase() === "SUPERADMIN";

  return (
    <div className="min-h-screen bg-[#05070B] text-[#F7F4ED]">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(27,102,209,0.08),transparent_28%),radial-gradient(circle_at_top_right,rgba(212,175,55,0.06),transparent_22%)]" />
        <div className="absolute inset-0 opacity-[0.04] [background-image:linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:56px_56px]" />
      </div>

      <header className="relative z-40 border-b border-white/10 bg-[rgba(5,7,11,0.90)] backdrop-blur-xl">
        <div className="flex items-center justify-between px-4 py-3 md:px-6">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#E8C96A]">
              EduLife OS · Admin
            </p>
            <p className="mt-0.5 truncate text-sm font-semibold text-[#F7F4ED]">
              {tenant.name}{" "}
              <span className="text-[#8F98A8]">({tenant.schoolCode})</span>
            </p>
          </div>

          <div className="flex items-center gap-3">
            {isSuper && (
              <Link
                href="/admin/super"
                className="rounded-full bg-[linear-gradient(135deg,#D4AF37,#E8C96A)] px-3 py-1.5 text-xs font-semibold text-[#071A3D]"
              >
                Super Admin
              </Link>
            )}
            <Link
              href="/app"
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-[#C9CDD6] hover:bg-white/10 hover:text-[#F7F4ED]"
            >
              Portal
            </Link>
            <LogoutButton className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-[#F7F4ED] transition hover:bg-white/10" />
          </div>
        </div>
      </header>

      <div className="relative flex min-h-[calc(100vh-56px)]">
        <aside className="hidden w-56 shrink-0 border-r border-white/8 bg-[rgba(7,17,31,0.60)] backdrop-blur-md lg:block">
          <nav className="sticky top-0 max-h-screen overflow-y-auto flex flex-col gap-6 px-3 py-6 scrollbar-none">
            {navSections.map((section) => (
              <div key={section.title}>
                <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-[#E8C96A]">
                  {section.title}
                </p>
                <div className="flex flex-col gap-0.5">
                  {section.items.map((item) => (
                    <SidebarLink key={item.href} href={item.href} label={item.label} />
                  ))}
                </div>
              </div>
            ))}
          </nav>
        </aside>

        <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-white/10 bg-[rgba(5,7,11,0.95)] backdrop-blur-xl lg:hidden">
          <div className="flex items-center gap-1 overflow-x-auto px-3 py-2 scrollbar-none">
            <MobileNavLink href="/admin/dashboard">Dashboard</MobileNavLink>
            <MobileNavLink href="/admin/students">Students</MobileNavLink>
            <MobileNavLink href="/admin/fees/invoices">Invoices</MobileNavLink>
            <MobileNavLink href="/admin/fees/receipts">Receipts</MobileNavLink>
            <MobileNavLink href="/admin/fees/online-payments">Online Pay</MobileNavLink>
            <MobileNavLink href="/admin/fees/structures">Structures</MobileNavLink>
            <MobileNavLink href="/admin/fees/overview">Overview</MobileNavLink>
            <MobileNavLink href="/admin/fees/ledger">Ledger</MobileNavLink>
            <MobileNavLink href="/admin/fees/reconciliation">Reconciliation</MobileNavLink>
            <MobileNavLink href="/admin/fees/disputes">Disputes</MobileNavLink>
            <MobileNavLink href="/admin/scholarships">Scholarships</MobileNavLink>
            <MobileNavLink href="/admin/teachers">Teachers</MobileNavLink>
          </div>
        </div>

        <main className="relative min-w-0 flex-1 px-4 py-8 pb-20 md:px-6 lg:pb-8">
          {children}
        </main>
      </div>
    </div>
  );
}