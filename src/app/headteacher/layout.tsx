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

  // Robust: supports ctx.roleKey or ctx.roleName (and older variants like SCHOOLADMIN)
  const roleKey = normRoleKey((ctx as any).roleKey ?? (ctx as any).roleName);
  const showAdmin =
    roleKey === "SUPERADMIN" ||
    roleKey === "ADMIN" ||
    roleKey === "SCHOOL_ADMIN" ||
    roleKey === "SCHOOLADMIN";

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="border-b bg-white">
        <div className="mx-auto max-w-6xl px-4 py-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">EduLife OS · Headteacher</p>
            <p className="text-sm font-semibold text-zinc-900 truncate">
              {tenant.name}{" "}
              {tenant.schoolCode ? <span className="text-zinc-400">({tenant.schoolCode})</span> : null}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <nav className="flex items-center gap-3 text-sm">
              <Link className="hover:underline" href="/headteacher/dashboard">
                Dashboard
              </Link>
              <Link className="hover:underline text-zinc-600" href="/teacher/dashboard">
                Teacher Portal
              </Link>
              {showAdmin ? (
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
