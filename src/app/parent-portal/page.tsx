// src/app/parent-portal/page.tsx
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { ParentPortalClient } from "@/components/ParentPortalClient";
import { PARENT_COOKIE_NAME, verifyParentSessionToken, digitsOnly } from "@/lib/parentSession";
import { StudentStatus } from "@prisma/client";

export const metadata: Metadata = {
  title: "Parent Portal | EduLife OS",
  description: "Parent view of learners with simple fees and attendance summary.",
};

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type SafeStudent = {
  id: string;
  firstName: string;
  lastName: string;
};

function maskPhone(e164: string | null, suffix9: string) {
  const d = digitsOnly(e164 ?? "");
  const last4 = d ? d.slice(-4) : digitsOnly(suffix9).slice(-4);
  return last4 ? `***${last4}` : "Parent";
}

function isValidSuffixForLookup(suffix: string) {
  // Bank-grade safety: prevent endsWith("") / very short suffix scans.
  const s = digitsOnly(suffix);
  return s.length >= 7; // 7 is a safe minimum for MVP; Ghana suffix9 is typically 9
}

export default async function ParentPortalPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(PARENT_COOKIE_NAME)?.value ?? "";
  const sess = verifyParentSessionToken(token);

  if (!sess.ok) redirect(`/parent/login?next=${encodeURIComponent("/parent-portal")}`);

  const tenantId = sess.payload.tenantId;
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, name: true, status: true },
  });

  if (!tenant) redirect(`/parent/login?next=${encodeURIComponent("/parent-portal")}`);
  if (tenant.status !== "ACTIVE") redirect("/pending");

  const suffix9 = digitsOnly(sess.payload.guardianSuffix9 ?? "");
  const e164 = sess.payload.guardianPhoneE164;

  // Hard guard: if session has a bad phone footprint, force re-login.
  if (!isValidSuffixForLookup(suffix9) && !digitsOnly(e164 ?? "")) {
    redirect(`/parent/login?next=${encodeURIComponent("/parent-portal")}`);
  }

  const or: any[] = [];
  if (e164) {
    // preferred (indexed)
    or.push({ guardianPhoneNorm: e164 });
  }

  if (isValidSuffixForLookup(suffix9)) {
    // fallback for older data
    or.push({ guardianPhoneNorm: { endsWith: suffix9 } });
    or.push({ guardianPhone: { endsWith: suffix9 } });
  }

  let safeStudents: SafeStudent[] = [];

  // If OR is empty, we must not query with OR: [] (Prisma throws).
  if (or.length > 0) {
    const students = await prisma.student.findMany({
      where: {
        tenantId,
        status: StudentStatus.ACTIVE,
        OR: or,
      },
      select: { id: true, firstName: true, lastName: true },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      take: 200,
    });

    safeStudents = students.map((s) => ({
      id: s.id,
      firstName: s.firstName ?? "",
      lastName: s.lastName ?? "",
    }));
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:py-8 space-y-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-medium text-emerald-800">
              EduLife OS · Parent Portal
            </div>
            <h1 className="mt-2 text-xl font-semibold text-slate-900 sm:text-2xl">
              {tenant.name} – your child&apos;s progress
            </h1>
            <p className="mt-1 max-w-2xl text-xs text-slate-600 sm:text-sm">
              View a simple <span className="font-semibold">fees and attendance summary</span> for each learner.
            </p>
          </div>

          <div className="text-xs text-right text-slate-500 space-y-2">
            <p>
              Signed in as <span className="font-semibold">{maskPhone(e164, suffix9)}</span>
            </p>
            <p className="text-[11px]">
              Learners linked: <span className="font-semibold">{safeStudents.length}</span>
            </p>

            <form action="/api/parent/logout" method="post">
              <button className="rounded-xl border px-3 py-2 text-xs bg-white hover:bg-slate-50">
                Sign out
              </button>
            </form>
          </div>
        </header>

        <ParentPortalClient initialStudents={safeStudents} />
      </div>
    </main>
  );
}