// src/app/admin/dashboard/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";
import StaffOnboardingCard from "./StaffOnboardingCard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function toSignIn(callbackUrl: string, error?: string) {
  const p = new URLSearchParams();
  p.set("callbackUrl", callbackUrl);
  if (error) p.set("error", error);
  return `/auth/signin?${p.toString()}`;
}

const adminTiles = [
  {
    title: "Academic Settings",
    desc: "Set current term and year, define term dates, and tune attendance and health thresholds.",
    href: "/admin/setup",
    accent: "from-[#0C1730] via-[#10244A] to-[#07111F]",
    border: "border-sky-300/20",
    pill: "School rhythm",
    pillCls: "border-sky-300/25 bg-sky-400/14 text-sky-100",
    icon: "🧭",
  },
  {
    title: "Classes",
    desc: "Create and organize classrooms, streams, and school structure for clean operational control.",
    href: "/admin/classes",
    accent: "from-[#0A1F14] via-[#102C1D] to-[#08121C]",
    border: "border-emerald-300/20",
    pill: "Structure",
    pillCls: "border-emerald-300/25 bg-emerald-400/14 text-emerald-100",
    icon: "🏫",
  },
  {
    title: "Students",
    desc: "Create learners, assign classes, and manage consent-aware student records with calm clarity.",
    href: "/admin/students",
    accent: "from-[#271408] via-[#362111] to-[#0C1320]",
    border: "border-amber-300/20",
    pill: "Learners",
    pillCls: "border-amber-300/25 bg-amber-400/14 text-amber-100",
    icon: "🧒",
  },
  {
    title: "Student 360° Profile",
    desc: "Open one calm view for contacts, attendance, health, and the learner’s broader school picture.",
    href: "/admin/students/profile",
    accent: "from-[#1A1034] via-[#231A4B] to-[#0A1120]",
    border: "border-fuchsia-300/20",
    pill: "Holistic view",
    pillCls: "border-fuchsia-300/25 bg-fuchsia-400/14 text-fuchsia-100",
    icon: "🪪",
  },
  {
    title: "Teachers",
    desc: "Invite teachers, track onboarding, and keep school staff access disciplined and visible.",
    href: "/admin/teachers",
    accent: "from-[#251013] via-[#30151B] to-[#0C1320]",
    border: "border-rose-300/20",
    pill: "Staff",
    pillCls: "border-rose-300/25 bg-rose-400/14 text-rose-100",
    icon: "👩🏾‍🏫",
  },
];

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export default async function AdminDashboardPage() {
  const safe = await requireServerUserContext({
    redirectTo: "/admin/dashboard",
    requireTenant: true,
    requireRoleNames: ["SCHOOL_ADMIN", "SUPERADMIN", "HEADTEACHER"],
  });

  const tenant = await prisma.tenant.findUnique({
    where: { id: safe.tenantId },
    select: { id: true, name: true, schoolCode: true, status: true },
  });

  if (!tenant) redirect(toSignIn("/app", "TENANT_NOT_FOUND"));
  if (tenant.status !== "ACTIVE") redirect("/pending");

  const isSuper = String(safe.roleName || "").toUpperCase() === "SUPERADMIN";

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(5,7,11,0.92),rgba(7,26,61,0.94),rgba(5,7,11,0.96))] p-5 shadow-[0_26px_90px_rgba(0,0,0,0.28)] md:p-6">
        <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:64px_64px]" />
        <div className="absolute -left-16 top-0 h-48 w-48 rounded-full bg-[#1B66D1]/20 blur-3xl" />
        <div className="absolute right-0 top-0 h-44 w-44 rounded-full bg-[#D4AF37]/14 blur-3xl" />

        <div className="relative flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-[#E8C96A]">EduLife OS · Admin</p>
            <h1 className="mt-2 text-2xl font-semibold text-[#F7F4ED] md:text-3xl">
              Admin Dashboard
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-[#C9CDD6]">
              Manage school setup, academic context, classrooms, learners, and teacher onboarding
              from one disciplined command layer.
            </p>
            <p className="mt-2 text-xs text-[#AEB6C4]">
              Tenant: <span className="font-medium text-[#F7F4ED]">{tenant.name}</span>{" "}
              <span className="text-[#8F98A8]">({tenant.schoolCode})</span>
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium text-[#F7F4ED]">
              Status: {tenant.status}
            </span>
            <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium text-[#F7F4ED]">
              Role: {safe.roleName}
            </span>
            {isSuper ? (
              <Link
                href="/admin/super"
                className="inline-flex items-center rounded-full bg-[linear-gradient(135deg,#D4AF37,#E8C96A)] px-4 py-2 text-sm font-semibold text-[#071A3D] shadow-[0_18px_50px_rgba(212,175,55,0.22)]"
              >
                Super Admin
              </Link>
            ) : null}
          </div>
        </div>
      </div>

      <section className="rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-5 shadow-[0_20px_70px_rgba(0,0,0,0.20)] md:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-base font-semibold text-[#F7F4ED] md:text-lg">School control surface</h2>
            <p className="mt-1 text-xs md:text-sm text-[#C9CDD6]">
              Start with the core operational modules that keep the school organized and implementation-ready.
            </p>
          </div>

          <span className="inline-flex items-center rounded-full border border-emerald-300/25 bg-emerald-400/12 px-3 py-1 text-[11px] font-semibold text-emerald-100">
            Tenant active and ready
          </span>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {adminTiles.map((tile) => (
            <Link
              key={tile.title}
              href={tile.href}
              className={cx(
                "group relative overflow-hidden rounded-[28px] border bg-gradient-to-br p-5 shadow-[0_12px_36px_rgba(0,0,0,0.20)] transition hover:-translate-y-1",
                tile.accent,
                tile.border
              )}
            >
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_36%)]" />
              <div className="relative flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-[#F7F4ED]">
                    <span className="text-lg transition-transform duration-200 ease-out group-hover:scale-110 group-hover:rotate-6">
                      {tile.icon}
                    </span>
                    {tile.title}
                  </div>
                </div>

                <span
                  className={cx(
                    "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                    tile.pillCls
                  )}
                >
                  {tile.pill}
                </span>
              </div>

              <p className="relative mt-4 text-sm leading-7 text-[#E1E6EF]">{tile.desc}</p>

              <div className="relative mt-4 text-[11px] font-semibold text-[#F7F4ED] group-hover:underline">
                Open module
              </div>

              <div className="pointer-events-none absolute inset-0 rounded-[28px] ring-0 transition group-hover:ring-2 group-hover:ring-white/8" />
            </Link>
          ))}
        </div>
      </section>

      <details className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.18)]">
        <summary className="cursor-pointer select-none text-sm font-semibold text-[#F7F4ED]">
          Staff Onboarding (test here)
        </summary>
        <p className="mt-2 text-xs leading-6 text-[#C9CDD6]">
          Use this panel to test and validate the onboarding flow without leaving the admin workspace.
        </p>
        <div className="mt-4 rounded-[22px] border border-white/10 bg-[#07111F] p-4">
          <StaffOnboardingCard />
        </div>
      </details>
    </div>
  );
}