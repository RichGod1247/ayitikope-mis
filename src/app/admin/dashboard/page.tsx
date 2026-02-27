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

  // ✅ Correct: Pending tenants go to /pending (not setup)
  if (tenant.status !== "ACTIVE") redirect("/pending");

  const isSuper = String(safe.roleName || "").toUpperCase() === "SUPERADMIN";

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Admin Dashboard</h1>
          <p className="text-sm text-zinc-600 mt-1">
            Manage school setup: academic context, classes, students, and teacher onboarding.
          </p>
          <p className="text-xs text-zinc-500 mt-2">
            Tenant: <span className="font-medium">{tenant.name}</span>{" "}
            <span className="text-zinc-400">({tenant.schoolCode})</span>
          </p>
        </div>

        {isSuper ? (
          <Link
            href="/admin/super"
            className="h-10 px-4 rounded-xl bg-black text-white border border-black hover:bg-zinc-800 inline-flex items-center"
          >
            Super Admin
          </Link>
        ) : null}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link href="/admin/setup" className="rounded-2xl border bg-white p-5 hover:shadow-sm">
          <p className="text-sm font-semibold text-zinc-900">Academic Settings</p>
          <p className="mt-1 text-sm text-zinc-600">Set current term/year, term dates, attendance + health thresholds.</p>
        </Link>

        <Link href="/admin/classes" className="rounded-2xl border bg-white p-5 hover:shadow-sm">
          <p className="text-sm font-semibold text-zinc-900">Classes</p>
          <p className="mt-1 text-sm text-zinc-600">Create classrooms for this school.</p>
        </Link>

        <Link href="/admin/students" className="rounded-2xl border bg-white p-5 hover:shadow-sm">
          <p className="text-sm font-semibold text-zinc-900">Students</p>
          <p className="mt-1 text-sm text-zinc-600">Create learners, assign classes, SMS + health consent.</p>
        </Link>

        <Link href="/admin/students/profile" className="rounded-2xl border bg-white p-5 hover:shadow-sm">
          <p className="text-sm font-semibold text-zinc-900">Student 360° Profile</p>
          <p className="mt-1 text-sm text-zinc-600">Contacts + attendance + health in one calm view.</p>
        </Link>

        <Link href="/admin/teachers" className="rounded-2xl border bg-white p-5 hover:shadow-sm">
          <p className="text-sm font-semibold text-zinc-900">Teachers</p>
          <p className="mt-1 text-sm text-zinc-600">Invite teachers and track onboarding.</p>
        </Link>
      </div>

      <details className="rounded-2xl border bg-white p-5">
        <summary className="cursor-pointer select-none text-sm font-semibold text-zinc-900">
          Staff Onboarding (test here)
        </summary>
        <div className="mt-4">
          <StaffOnboardingCard />
        </div>
      </details>
    </div>
  );
}