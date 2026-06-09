// src/app/headteacher/dashboard/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireHeadteacherContext } from "@/lib/headteacherAuth";
import OfficialNoticeSummaryCard from "@/components/governance/OfficialNoticeSummaryCard";
import HeadteacherDashboardClient from "./ui";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function toSignIn(callbackUrl: string, error?: string) {
  const p = new URLSearchParams();
  p.set("callbackUrl", callbackUrl);
  if (error) p.set("error", error);
  return `/auth/signin?${p.toString()}`;
}

export default async function HeadteacherDashboardPage() {
  try {
    await requireHeadteacherContext({ redirectTo: "/headteacher/dashboard" });
  } catch {
    redirect(toSignIn("/headteacher/dashboard", "FORBIDDEN"));
  }

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(5,7,11,0.92),rgba(7,26,61,0.94),rgba(5,7,11,0.96))] p-5 shadow-[0_26px_90px_rgba(0,0,0,0.28)] md:p-6">
        <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:64px_64px]" />
        <div className="absolute -left-16 top-0 h-48 w-48 rounded-full bg-[#1B66D1]/20 blur-3xl" />
        <div className="absolute right-0 top-0 h-44 w-44 rounded-full bg-[#D4AF37]/14 blur-3xl" />

        <div className="relative">
          <p className="text-xs uppercase tracking-[0.18em] text-[#E8C96A]">
            EduLife OS · Headteacher
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-[#F7F4ED] md:text-3xl">
            Dashboard
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-[#C9CDD6]">
            Academic leadership, attendance oversight, lesson-note review, parent result access,
            and governance discipline from one colorful control center.
          </p>
        </div>
      </div>

      <section className="grid gap-4 md:grid-cols-2">
        <Link
          href="/headteacher/day"
          className="group relative overflow-hidden rounded-[28px] border border-[#D4AF37]/25 bg-[linear-gradient(135deg,rgba(212,175,55,0.14),rgba(27,102,209,0.10),rgba(255,255,255,0.04))] p-5 shadow-[0_20px_70px_rgba(0,0,0,0.18)] transition hover:border-[#E8C96A]/60 hover:bg-white/10"
        >
          <div className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-[#D4AF37]/20 blur-3xl transition group-hover:bg-[#D4AF37]/30" />
          <div className="pointer-events-none absolute -bottom-14 left-0 h-32 w-32 rounded-full bg-[#1B66D1]/20 blur-3xl" />

          <div className="relative">
            <p className="text-xs uppercase tracking-[0.18em] text-[#E8C96A]">
              Attendance Command
            </p>

            <h2 className="mt-2 text-xl font-semibold text-[#F7F4ED]">
              Review today’s attendance truth
            </h2>

            <p className="mt-2 text-sm leading-7 text-[#C9CDD6]">
              See open registers, missing sessions, unmarked learners, absent learners,
              parent alert status, and certify only completed attendance evidence.
            </p>

            <div className="mt-4 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-amber-100">
                Open / missing registers
              </span>
              <span className="rounded-full border border-emerald-300/30 bg-emerald-300/10 px-3 py-1 text-emerald-100">
                Ready certification
              </span>
              <span className="rounded-full border border-indigo-300/30 bg-indigo-300/10 px-3 py-1 text-indigo-100">
                Evidence command
              </span>
            </div>

            <div className="mt-5 inline-flex rounded-full bg-[linear-gradient(135deg,#D4AF37,#E8C96A)] px-4 py-2 text-sm font-semibold text-[#071A3D] shadow-[0_14px_40px_rgba(212,175,55,0.20)]">
              Open command dashboard →
            </div>
          </div>
        </Link>

        <Link
          href="/headteacher/attendance/weekly"
          className="group relative overflow-hidden rounded-[28px] border border-white/10 bg-white/5 p-5 shadow-[0_20px_70px_rgba(0,0,0,0.14)] transition hover:border-white/20 hover:bg-white/10"
        >
          <div className="pointer-events-none absolute -right-12 top-0 h-32 w-32 rounded-full bg-[#1B66D1]/20 blur-3xl" />

          <div className="relative">
            <p className="text-xs uppercase tracking-[0.18em] text-[#8F98A8]">
              Weekly Attendance
            </p>

            <h2 className="mt-2 text-xl font-semibold text-[#F7F4ED]">
              Review weekly attendance patterns
            </h2>

            <p className="mt-2 text-sm leading-7 text-[#C9CDD6]">
              Track weekly attendance trends, class-level patterns, and evidence
              exports for school supervision.
            </p>

            <div className="mt-5 inline-flex rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-[#F7F4ED] transition group-hover:bg-white/10">
              Open weekly view →
            </div>
          </div>
        </Link>
      </section>

      <OfficialNoticeSummaryCard
        href="/headteacher/notices"
        portalLabel="Headteacher"
      />

      <HeadteacherDashboardClient />
    </div>
  );
}