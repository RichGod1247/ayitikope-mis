// src/app/parent/mock-readiness/page.tsx
import { Suspense } from "react";
import Link from "next/link";
import ParentMockReadinessClient from "@/components/parent/ParentMockReadinessClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default function ParentMockReadinessPage() {
  return (
    <main className="min-h-screen bg-[#06101F] text-[#F7F4ED]">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 md:px-6 lg:px-8">
        <div className="rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(212,175,55,0.22),transparent_28%),linear-gradient(135deg,#071A3D,#0B1220_58%,#07111F)] p-5 shadow-[0_20px_80px_rgba(0,0,0,0.28)] md:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-[0.24em] text-[#E8C96A]">
                Parent Portal • BECE Readiness
              </div>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white md:text-3xl">
                Mock readiness report
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[#C9CDD6]">
                View headteacher-approved Mock readiness, placement aggregate,
                subject strengths, support areas, and simple home guidance.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href="/parent-portal"
                className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[12px] font-semibold text-[#F7F4ED] transition hover:bg-white/10"
              >
                Parent portal
              </Link>

              <Link
                href="/parent/results"
                className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[12px] font-semibold text-[#F7F4ED] transition hover:bg-white/10"
              >
                Results
              </Link>
            </div>
          </div>
        </div>

        <Suspense
          fallback={
            <div className="rounded-[28px] border border-white/10 bg-white/[0.04] px-5 py-12 text-center text-sm text-[#AEB6C4]">
              Loading Mock readiness...
            </div>
          }
        >
          <ParentMockReadinessClient />
        </Suspense>
      </div>
    </main>
  );
}