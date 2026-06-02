// src/app/headteacher/dashboard/page.tsx
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

      <OfficialNoticeSummaryCard
        href="/headteacher/notices"
        portalLabel="Headteacher"
      />

      <HeadteacherDashboardClient />
    </div>
  );
}