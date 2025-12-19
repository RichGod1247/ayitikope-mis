// src/components/AdminPortalClient.tsx
"use client";

import Link from "next/link";
import { useMemo } from "react";

type AdminPortalClientProps = {
  tenantId: string;
  adminUserId: string;
};

const pillBase =
  "inline-flex items-center rounded-full px-3 py-1 text-[11px] font-medium border";

const cardBase =
  "relative flex flex-col justify-between rounded-2xl border border-zinc-200/80 bg-white/80 shadow-sm px-4 py-4 md:px-5 md:py-5 overflow-hidden";

const badgeChip =
  "inline-flex items-center rounded-full bg-black/80 text-white text-[10px] px-2 py-0.5 uppercase tracking-wide";

const btnBase =
  "inline-flex items-center justify-center h-8 md:h-9 px-3 rounded-xl border text-[11px] md:text-xs font-medium shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

const btnPrimary = `${btnBase} bg-black text-white border-black hover:bg-zinc-900`;
const btnGhost = `${btnBase} bg-white text-zinc-900 border-zinc-200 hover:bg-zinc-50`;
const btnSoft = `${btnBase} bg-zinc-50 text-zinc-800 border-zinc-200 hover:bg-zinc-100`;

export default function AdminPortalClient({
  tenantId,
  adminUserId,
}: AdminPortalClientProps) {
  // Build URLs that reuse existing, working analytics
  const weeklyAttendanceUrl = useMemo(
    () => `/headteacher/attendance/weekly?tenantId=${encodeURIComponent(tenantId)}`,
    [tenantId]
  );

  const assessmentOverviewUrl = useMemo(
    () =>
      `/headteacher/assessment/overview?tenantId=${encodeURIComponent(
        tenantId
      )}&term=${encodeURIComponent("1st Term")}&academicYear=${encodeURIComponent(
        "2025/2026"
      )}`,
    [tenantId]
  );

  return (
    <main className="min-h-screen bg-zinc-50">
      {/* Subtle gradient background */}
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.06),_transparent_55%)]" />
      <div className="relative mx-auto max-w-6xl px-4 py-6 md:py-8 space-y-6">
        {/* Header */}
        <header className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`${pillBase} border-sky-200 bg-sky-50 text-sky-800`}
            >
              EduLife OS · Admin
            </span>
            <span className="inline-flex items-center rounded-full bg-emerald-50 text-emerald-700 px-2 py-0.5 text-[10px] font-medium border border-emerald-100">
              Multi-school backbone
            </span>
          </div>

          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
            <div className="space-y-2">
              <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
                Admin Control Center
              </h1>
              <p className="text-sm md:text-base text-zinc-600 max-w-2xl">
                One calm console to{" "}
                <span className="font-semibold">see, secure, and steer</span>{" "}
                EduLife OS across your school or cluster — with{" "}
                <span className="font-semibold">data you can trust</span> and
                controls that respect{" "}
                <span className="font-semibold">integrity, transparency,</span>{" "}
                and <span className="font-semibold">character</span>.
              </p>
            </div>

            <div className="flex flex-col items-start md:items-end gap-2">
              <span className="text-[11px] text-zinc-500">
                Admin user ID:{" "}
                <span className="font-mono">{adminUserId}</span>
              </span>
              <span className="text-[11px] text-zinc-500">
                Tenant / school ID:{" "}
                <span className="font-mono">{tenantId}</span>
              </span>
            </div>
          </div>
        </header>

        {/* Top strip – high-level actions */}
        <section className="grid grid-cols-1 md:grid-cols-[minmax(0,2.2fr)_minmax(0,1.6fr)] gap-4 md:gap-6">
          {/* Left: Governance + quick links */}
          <article className="rounded-2xl border border-zinc-200 bg-white/80 shadow-sm px-4 py-4 md:px-5 md:py-5 flex flex-col justify-between gap-3">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                  Governance Snapshot
                </p>
                <h2 className="text-sm md:text-base font-semibold text-zinc-900">
                  See what&apos;s happening across the school
                </h2>
                <p className="text-xs md:text-sm text-zinc-600 max-w-xl">
                  Quickly jump into{" "}
                  <span className="font-medium">attendance health</span> and{" "}
                  <span className="font-medium">assessment integrity</span>{" "}
                  without drowning in raw tables.
                </p>
              </div>
              <span className={badgeChip}>Live school</span>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link href={weeklyAttendanceUrl} className={btnPrimary}>
                Weekly attendance picture
              </Link>
              <Link href={assessmentOverviewUrl} className={btnGhost}>
                Whole-school assessment view
              </Link>
            </div>
          </article>

          {/* Right: Trust & compliance message */}
          <article className="rounded-2xl border border-emerald-100 bg-emerald-50/80 px-4 py-4 md:px-5 md:py-5 space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800">
              Character · Integrity · Trust
            </p>
            <p className="text-xs md:text-sm text-emerald-900">
              EduLife OS is designed so that{" "}
              <span className="font-semibold">
                the numbers you see reflect the truth in the classrooms
              </span>
              . Every dashboard here is built on{" "}
              <span className="font-semibold">
                one consistent computation engine
              </span>{" "}
              — no hidden formulas, no silent changes.
            </p>
            <p className="text-[11px] text-emerald-900/80">
              As an admin, your superpower is to{" "}
              <span className="font-semibold">
                protect that integrity and support teachers
              </span>
              , not just chase percentages.
            </p>
          </article>
        </section>

        {/* Main grid – 4 big pillars */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
          {/* 1. Schools & structures */}
          <article className={cardBase}>
            <div className="absolute inset-0 pointer-events-none bg-gradient-to-br from-sky-50/80 via-sky-50/0 to-blue-100/60" />
            <div className="relative space-y-3">
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-700">
                  Schools &amp; Structures
                </p>
                <h2 className="text-sm md:text-base font-semibold text-zinc-900">
                  Class streams, teachers, and enrollment
                </h2>
                <p className="text-xs md:text-sm text-zinc-600 max-w-md">
                  Keep a clean, trusted list of{" "}
                  <span className="font-medium">classes, teachers</span> and{" "}
                  <span className="font-medium">enrolled learners</span> so that
                  every attendance mark and assessment score lands in the right
                  place.
                </p>
              </div>

              <ul className="text-[11px] md:text-xs text-zinc-600 space-y-1.5">
                <li>• Configure classes and arms (KG, Basic, JHS)</li>
                <li>• Map teachers to their official classrooms</li>
                <li>• Keep enrollment counts aligned with reality</li>
              </ul>
            </div>

            <div className="relative mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className={btnSoft}
                disabled
                aria-disabled="true"
                title="Coming soon"
              >
                Manage classes (coming soon)
              </button>
              <button
                type="button"
                className={btnGhost}
                disabled
                aria-disabled="true"
                title="Coming soon"
              >
                Teacher roster (coming soon)
              </button>
            </div>
          </article>

          {/* 2. Attendance & safety net */}
          <article className={cardBase}>
            <div className="absolute inset-0 pointer-events-none bg-gradient-to-br from-emerald-50/90 via-emerald-50/0 to-emerald-100/60" />
            <div className="relative space-y-3">
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                  Attendance &amp; Safety Net
                </p>
                <h2 className="text-sm md:text-base font-semibold text-zinc-900">
                  Who is in school – and who might be slipping away
                </h2>
                <p className="text-xs md:text-sm text-zinc-600 max-w-md">
                  Combine teacher records into a simple{" "}
                  <span className="font-medium">weekly attendance picture</span>{" "}
                  per class, so you can spot{" "}
                  <span className="font-medium">red flags</span> early and
                  support families.
                </p>
              </div>

              <ul className="text-[11px] md:text-xs text-zinc-600 space-y-1.5">
                <li>• Weekly per-class presence &amp; absence</li>
                <li>• Quick export for circuit / municipal officers</li>
                <li>• Foundation for early-warning &amp; follow-up calls</li>
              </ul>
            </div>

            <div className="relative mt-4 flex flex-wrap gap-2">
              <Link href={weeklyAttendanceUrl} className={btnPrimary}>
                Open weekly attendance
              </Link>
              <button
                type="button"
                className={btnGhost}
                disabled
                aria-disabled="true"
                title="Coming soon"
              >
                Early-warning rules (coming soon)
              </button>
            </div>
          </article>

          {/* 3. Assessment & exams */}
          <article className={cardBase}>
            <div className="absolute inset-0 pointer-events-none bg-gradient-to-br from-amber-50/90 via-amber-50/0 to-orange-100/60" />
            <div className="relative space-y-3">
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                  Assessment &amp; Exams
                </p>
                <h2 className="text-sm md:text-base font-semibold text-zinc-900">
                  Fair, consistent continuous assessment
                </h2>
                <p className="text-xs md:text-sm text-zinc-600 max-w-md">
                  Bring all{" "}
                  <span className="font-medium">continuous assessments</span>{" "}
                  into one bird&apos;s-eye view, with{" "}
                  <span className="font-medium">
                    the same GES grading logic
                  </span>{" "}
                  used for teacher dashboards and report cards.
                </p>
              </div>

              <ul className="text-[11px] md:text-xs text-zinc-600 space-y-1.5">
                <li>• Whole-school class average snapshot</li>
                <li>• Flags for missing or extreme CA records</li>
                <li>• Foundation for term reports &amp; BECE analysis</li>
              </ul>
            </div>

            <div className="relative mt-4 flex flex-wrap gap-2">
              <Link href={assessmentOverviewUrl} className={btnPrimary}>
                View assessment overview
              </Link>
              <button
                type="button"
                className={btnGhost}
                disabled
                aria-disabled="true"
                title="Coming soon"
              >
                Exam analysis (coming soon)
              </button>
            </div>
          </article>

          {/* 4. Finance, SMS & system health */}
          <article className={cardBase}>
            <div className="absolute inset-0 pointer-events-none bg-gradient-to-br from-fuchsia-50/90 via-fuchsia-50/0 to-violet-100/60" />
            <div className="relative space-y-3">
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-fuchsia-700">
                  Fees, Messages &amp; System Health
                </p>
                <h2 className="text-sm md:text-base font-semibold text-zinc-900">
                  Keep money and messages clean
                </h2>
                <p className="text-xs md:text-sm text-zinc-600 max-w-md">
                  Central space for{" "}
                  <span className="font-medium">fees setup</span>,{" "}
                  <span className="font-medium">payments</span>, and{" "}
                  <span className="font-medium">SMS credits</span>, so you
                  always know what has gone out and what has come in.
                </p>
              </div>

              <ul className="text-[11px] md:text-xs text-zinc-600 space-y-1.5">
                <li>• Align fee structures with headteacher screen</li>
                <li>• See total invoiced vs. collected (future)</li>
                <li>• Track SMS usage and remaining credits (future)</li>
              </ul>
            </div>

            <div className="relative mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className={btnSoft}
                disabled
                aria-disabled="true"
                title="Coming soon"
              >
                Fee structures (coming soon)
              </button>
              <button
                type="button"
                className={btnGhost}
                disabled
                aria-disabled="true"
                title="Coming soon"
              >
                SMS &amp; Hubtel logs (coming soon)
              </button>
            </div>
          </article>
        </section>
      </div>
    </main>
  );
}
