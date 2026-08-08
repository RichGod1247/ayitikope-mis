"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { useState } from "react";

type GovernanceAppraisalHubRole =
  | "HEAD_OF_SUPERVISION"
  | "BASIC_SCHOOL_COORDINATOR";

type Props = {
  role: GovernanceAppraisalHubRole;
  roleLabel: string;
  officerName: string;
  districtLabel: string;
};

function LockedAction({
  icon,
  title,
  description,
  badge = "Next phase",
}: {
  icon: string;
  title: string;
  description: string;
  badge?: string;
}) {
  return (
    <div
      aria-disabled="true"
      className="rounded-3xl border border-white/10 bg-white/[0.035] p-4 opacity-80"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-2xl" aria-hidden="true">
          {icon}
        </span>
        <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[11px] font-bold text-slate-300">
          {badge}
        </span>
      </div>

      <h3 className="mt-4 text-base font-bold text-white">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-300">{description}</p>
      <p className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
        Not yet active
      </p>
    </div>
  );
}

export default function GovernanceAppraisalHubClient({
  role,
  roleLabel,
  officerName,
  districtLabel,
}: Props) {
  const [appraisalsOpen, setAppraisalsOpen] = useState(false);
  const reviewDescription =
    role === "HEAD_OF_SUPERVISION"
      ? "Review SISSO and Basic School Coordinator submissions after the staged review contract is verified."
      : "Review permitted Headteacher and Teacher reports inside the basic-school mandate after the staged review contract is verified.";

  return (
    <main
      data-appraisal-dashboard-role={role}
      className="min-h-screen bg-[radial-gradient(circle_at_top,#14366b_0%,#071a3d_38%,#040912_100%)] px-4 py-5 text-white sm:px-6 lg:px-8"
    >
      <div className="mx-auto max-w-5xl space-y-5">
        <section className="relative overflow-hidden rounded-[32px] border border-white/10 bg-black/25 p-5 shadow-2xl backdrop-blur-sm sm:p-6">
          <div className="absolute -right-16 -top-20 h-52 w-52 rounded-full bg-[#D4AF37]/15 blur-3xl" />
          <div className="absolute -bottom-24 -left-16 h-56 w-56 rounded-full bg-sky-500/15 blur-3xl" />

          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-[#E8C96A]">
                EduLife OS · Governance Dashboard
              </p>
              <h1 className="mt-2 text-2xl font-black sm:text-3xl">
                {roleLabel}
              </h1>
              <p className="mt-2 text-sm font-semibold text-sky-100">
                {officerName}
              </p>
              <p className="mt-1 text-sm leading-6 text-slate-300">
                Authorized district: {districtLabel}
              </p>
            </div>

            <button
              type="button"
              onClick={() => void signOut({ callbackUrl: "/auth/signin" })}
              className="min-h-11 rounded-full border border-red-300/25 bg-red-500/10 px-4 py-2 text-sm font-bold text-red-100 transition hover:bg-red-500/20"
            >
              Logout
            </button>
          </div>
        </section>

        <section className="rounded-[32px] border border-fuchsia-300/20 bg-fuchsia-500/10 p-4 shadow-xl sm:p-5">
          <button
            type="button"
            aria-expanded={appraisalsOpen}
            aria-controls="governance-appraisal-actions"
            onClick={() => setAppraisalsOpen((current) => !current)}
            className="w-full rounded-3xl border border-fuchsia-200/25 bg-black/20 p-5 text-left transition hover:bg-black/30"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 items-start gap-4">
                <span className="text-3xl" aria-hidden="true">
                  🧭
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-fuchsia-200">
                    Main workspace
                  </p>
                  <h2 className="mt-1 text-xl font-black text-white">
                    Appraisals
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-fuchsia-100/80">
                    Assess authorized officers, review work through the proper chain,
                    and open your own appraisal only when formally activated.
                  </p>
                </div>
              </div>

              <span className="shrink-0 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-bold text-white">
                {appraisalsOpen ? "Close" : "Open"}
              </span>
            </div>
          </button>

          {appraisalsOpen ? (
            <div
              id="governance-appraisal-actions"
              className="mt-4 grid gap-3 lg:grid-cols-3"
            >
              <article className="rounded-3xl border border-sky-300/25 bg-sky-400/10 p-4">
                <div className="flex items-start justify-between gap-3">
                  <span className="text-2xl" aria-hidden="true">
                    📝
                  </span>
                  <span className="rounded-full border border-emerald-300/25 bg-emerald-400/10 px-3 py-1 text-[11px] font-bold text-emerald-100">
                    Assessment active
                  </span>
                </div>

                <h3 className="mt-4 text-base font-bold text-white">
                  Teacher Appraisal
                </h3>
                <p className="mt-2 text-sm leading-6 text-sky-100/80">
                  Select an authorized circuit, school and Teacher, then complete
                  the official six-section, 34-indicator observation form.
                </p>

                <Link
                  href="/governance/appraisals/teacher-supervisory"
                  className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#D4AF37,#E8C96A)] px-4 py-3 text-center text-sm font-black text-[#071A3D] transition hover:brightness-105"
                >
                  Assess Teacher
                </Link>

                <div
                  aria-disabled="true"
                  className="mt-3 rounded-2xl border border-white/10 bg-black/20 px-3 py-3"
                >
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
                    Review reports · next phase
                  </p>
                  <p className="mt-1 text-xs leading-5 text-slate-300">
                    {reviewDescription}
                  </p>
                </div>
              </article>

              <article className="rounded-3xl border border-indigo-300/25 bg-indigo-400/10 p-4">
                <div className="flex items-start justify-between gap-3">
                  <span className="text-2xl" aria-hidden="true">
                    🏫
                  </span>
                  <span className="rounded-full border border-emerald-300/25 bg-emerald-400/10 px-3 py-1 text-[11px] font-bold text-emerald-100">
                    Assessment active
                  </span>
                </div>

                <h3 className="mt-4 text-base font-bold text-white">
                  Headteacher Appraisal
                </h3>
                <p className="mt-2 text-sm leading-6 text-indigo-100/80">
                  Select an authorized circuit and school, then complete the
                  official four-section, 34-indicator supervisory assessment.
                </p>

                <Link
                  href="/governance/appraisals/headteacher-supervisory"
                  className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#D4AF37,#E8C96A)] px-4 py-3 text-center text-sm font-black text-[#071A3D] transition hover:brightness-105"
                >
                  Assess Headteacher
                </Link>

                <div
                  aria-disabled="true"
                  className="mt-3 rounded-2xl border border-white/10 bg-black/20 px-3 py-3"
                >
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
                    Review reports · next phase
                  </p>
                  <p className="mt-1 text-xs leading-5 text-slate-300">
                    {reviewDescription}
                  </p>
                </div>
              </article>

              <LockedAction
                icon="👤"
                title="My Appraisal"
                description="This opens only after an approved governance-officer appraisal cycle, instrument, respondents, and release authority are formally verified."
                badge="Awaiting approved cycle"
              />
            </div>
          ) : null}
        </section>

        <section className="rounded-3xl border border-amber-300/20 bg-amber-400/10 p-4 text-sm leading-6 text-amber-100">
          <p className="font-bold text-white">Protected review chain</p>
          <p className="mt-1">
            Each officer creates a separate assessment. Scores are not overwritten
            or automatically combined. Teacher respondent identities and individual
            confidential feedback forms are not available on this dashboard. The
            District Director remains the ultimate district review and release authority.
          </p>
        </section>

        <p className="text-center text-xs leading-5 text-slate-500">
          Explicit actions only · no background polling · no persistent browser storage
        </p>
      </div>
    </main>
  );
}
