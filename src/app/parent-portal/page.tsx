// src/app/parent-portal/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { ParentPortalClient } from "@/components/ParentPortalClient";
import { PARENT_COOKIE_NAME, verifyParentSessionToken, digitsOnly } from "@/lib/parentSession";
import { StudentStatus } from "@prisma/client";

export const metadata: Metadata = {
  title: "Parent Portal | EduLife OS",
description:
  "Parent view of learners with fees, attendance, reports, released Mock readiness, and SMS notification proof.",
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
  const s = digitsOnly(suffix);
  return s.length >= 7;
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

  if (!isValidSuffixForLookup(suffix9) && !digitsOnly(e164 ?? "")) {
    redirect(`/parent/login?next=${encodeURIComponent("/parent-portal")}`);
  }

  const or: any[] = [];
  if (e164) {
    or.push({ guardianPhoneNorm: e164 });
  }

  if (isValidSuffixForLookup(suffix9)) {
    or.push({ guardianPhoneNorm: { endsWith: suffix9 } });
    or.push({ guardianPhone: { endsWith: suffix9 } });
  }

  let safeStudents: SafeStudent[] = [];

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
    <main className="min-h-screen bg-[linear-gradient(180deg,#05070B_0%,#071A3D_55%,#05070B_100%)] text-[#F7F4ED]">
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:py-8">
        <header className="relative overflow-hidden rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(5,7,11,0.9),rgba(7,17,31,0.94))] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.24)] sm:p-6">
          <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:64px_64px]" />
          <div className="absolute -left-12 top-0 h-40 w-40 rounded-full bg-[#1B66D1]/18 blur-3xl" />
          <div className="absolute right-0 top-0 h-36 w-36 rounded-full bg-[#D4AF37]/12 blur-3xl" />

          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="inline-flex items-center rounded-full border border-[#E8C96A]/25 bg-white/6 px-3 py-1 text-[11px] font-medium text-[#E8C96A]">
                EduLife OS · Parent Portal
              </div>
              <h1 className="mt-3 text-xl font-semibold text-[#F7F4ED] sm:text-2xl">
                {tenant.name} – your child&apos;s progress
              </h1>
              <p className="mt-2 max-w-2xl text-xs leading-6 text-[#C9CDD6] sm:text-sm">
  View simple{" "}
  <span className="font-semibold text-[#F7F4ED]">
    fees, attendance, reports, released Mock readiness, and SMS alerts
  </span>{" "}
  for each learner.
</p>
            </div>

            <div className="space-y-2 text-left text-xs text-[#C9CDD6] sm:text-right">
              <p>
                Signed in as <span className="font-semibold text-[#F7F4ED]">{maskPhone(e164, suffix9)}</span>
              </p>
              <p className="text-[11px]">
                Learners linked: <span className="font-semibold text-[#F7F4ED]">{safeStudents.length}</span>
              </p>

              <form action="/api/parent/logout" method="post">
                <button className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-[#F7F4ED] transition hover:bg-white/10">
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </header>

                      <section className="grid gap-4 md:grid-cols-3">
          <Link
            href="/parent/mock-readiness"
            className="group rounded-[28px] border border-emerald-300/20 bg-[linear-gradient(135deg,rgba(16,185,129,0.16),rgba(255,255,255,0.04))] p-5 shadow-[0_20px_70px_rgba(0,0,0,0.18)] transition hover:border-emerald-200/35 hover:bg-emerald-400/15"
          >
            <div className="inline-flex rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold text-emerald-100">
              BECE Mock Readiness
            </div>

            <h2 className="mt-3 text-lg font-semibold text-[#F7F4ED]">
              View released Mock readiness
            </h2>

            <p className="mt-2 text-xs leading-6 text-[#C9CDD6] sm:text-sm">
              Check released Mock aggregate, subject strengths, support areas,
              and practical home guidance approved by the school.
            </p>

            <div className="mt-4 text-xs font-semibold text-emerald-100 transition group-hover:translate-x-1">
              Open Mock readiness →
            </div>
          </Link>

          <Link
            href="/parent/report"
            className="group rounded-[28px] border border-sky-300/20 bg-[linear-gradient(135deg,rgba(59,130,246,0.14),rgba(255,255,255,0.04))] p-5 shadow-[0_20px_70px_rgba(0,0,0,0.18)] transition hover:border-sky-200/35 hover:bg-sky-400/15"
          >
            <div className="inline-flex rounded-full border border-sky-300/20 bg-sky-400/10 px-3 py-1 text-[11px] font-semibold text-sky-100">
              Term Report
            </div>

            <h2 className="mt-3 text-lg font-semibold text-[#F7F4ED]">
              View released term report
            </h2>

            <p className="mt-2 text-xs leading-6 text-[#C9CDD6] sm:text-sm">
              Check the normal term report only after the headteacher has
              officially released it. Locked reports stay protected.
            </p>

            <div className="mt-4 text-xs font-semibold text-sky-100 transition group-hover:translate-x-1">
              Open term report →
            </div>
          </Link>

          <Link
            href="/parent/sms-alerts"
            className="group rounded-[28px] border border-[#D4AF37]/25 bg-[linear-gradient(135deg,rgba(212,175,55,0.15),rgba(255,255,255,0.04))] p-5 shadow-[0_20px_70px_rgba(0,0,0,0.18)] transition hover:border-[#E8C96A]/45 hover:bg-[#D4AF37]/15"
          >
            <div className="inline-flex rounded-full border border-[#D4AF37]/25 bg-[#D4AF37]/10 px-3 py-1 text-[11px] font-semibold text-[#F7F4ED]">
              SMS Proof
            </div>

            <h2 className="mt-3 text-lg font-semibold text-[#F7F4ED]">
              View SMS alerts history
            </h2>

            <p className="mt-2 text-xs leading-6 text-[#C9CDD6] sm:text-sm">
              See school SMS notifications sent to your verified parent phone,
              including Mock release notices, report alerts, and delivery proof.
            </p>

            <div className="mt-4 text-xs font-semibold text-[#E8C96A] transition group-hover:translate-x-1">
              Open SMS alerts →
            </div>
          </Link>
        </section>

        <section className="rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-3 shadow-[0_20px_70px_rgba(0,0,0,0.20)] sm:p-4">
          <ParentPortalClient initialStudents={safeStudents} />
        </section>
      </div>
    </main>
  );
}