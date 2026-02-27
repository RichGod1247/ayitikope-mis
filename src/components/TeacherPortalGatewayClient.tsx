// src/components/TeacherPortalGatewayClient.tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo } from "react";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

type Props = {
  nextUrl: string; // kept for compatibility, but we no longer sign in here
};

export default function TeacherPortalGatewayClient({ nextUrl }: Props) {
  const next = useMemo(() => {
    return nextUrl && nextUrl.startsWith("/") ? nextUrl : "/app";
  }, [nextUrl]);

  const tiles = [
    {
      title: "Lesson Notes Studio",
      subtitle: "Plan · Generate · Submit · Print",
      desc: "Create NaCCA-aligned lesson notes, attach media, and submit for review — ready for print.",
      pill: "NaCCA-ready",
      cls: "from-emerald-50 to-white border-emerald-200",
      pillCls: "bg-emerald-100 text-emerald-900",
      icon: "📘",
    },
    {
      title: "Assessments & Reports",
      subtitle: "Scores · Insights · Term summaries",
      desc: "Record class scores, track performance, and generate clean term dashboards and reports.",
      pill: "Performance",
      cls: "from-indigo-50 to-white border-indigo-200",
      pillCls: "bg-indigo-100 text-indigo-900",
      icon: "📊",
    },
    {
      title: "Attendance & Daily Work",
      subtitle: "Fast register + smart follow-ups",
      desc: "Mark attendance quickly and keep class records consistent — with structured daily flow.",
      pill: "Speed",
      cls: "from-sky-50 to-white border-sky-200",
      pillCls: "bg-sky-100 text-sky-900",
      icon: "✅",
    },
    {
      title: "Curriculum Explorer",
      subtitle: "Strands → Indicators → Exemplars",
      desc: "Browse official curriculum details so lesson planning stays accurate and effortless.",
      pill: "Official",
      cls: "from-zinc-50 to-white border-zinc-200",
      pillCls: "bg-zinc-100 text-zinc-900",
      icon: "🧭",
    },
    {
      title: "Wellbeing & Health",
      subtitle: "Care that’s trackable",
      desc: "Support learners with structured wellbeing/health notes — consistent, audit-friendly records.",
      pill: "Care",
      cls: "from-rose-50 to-white border-rose-200",
      pillCls: "bg-rose-100 text-rose-900",
      icon: "🫶",
    },
    {
      title: "Communication Support",
      subtitle: "Stay connected with ease",
      desc: "Built-in support to help you stay reachable and consistent with parent communication.",
      pill: "Support",
      cls: "from-amber-50 to-white border-amber-200",
      pillCls: "bg-amber-100 text-amber-950",
      icon: "📶",
    },
  ];

  return (
    <div className="min-h-[calc(100vh-65px)] bg-gradient-to-b from-sky-50/70 via-white to-sky-50/40">
      <div className="mx-auto max-w-6xl px-4 py-8 md:py-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-10 items-start">
          {/* LEFT: Warm welcome + tiles */}
          <section className="space-y-5">
            <div className="rounded-3xl border border-sky-100 bg-white/85 shadow-sm backdrop-blur px-5 py-5 md:px-7 md:py-6">
              <div className="flex items-center gap-3">
                <Image
                  src="/logo.png"
                  alt="EduLife OS"
                  width={48}
                  height={48}
                  className="rounded-2xl"
                  priority
                />
                <div>
                  <div className="text-xs uppercase tracking-[0.18em] text-sky-600">
                    EduLife OS · Teacher Gateway
                  </div>
                  <h1 className="mt-1 text-2xl md:text-3xl font-extrabold tracking-tight text-sky-950">
                    Teacher Workspace Preview 🌿
                  </h1>
                </div>
              </div>

              <p className="mt-3 text-sm md:text-base text-slate-700 leading-relaxed">
                This page no longer signs you in. EduLife OS uses a single secure gateway for
                everyone (Admin, Teacher, Headteacher). Use the Sign In button to continue.
              </p>

              <div className="mt-4 flex flex-wrap gap-2 text-[11px] md:text-xs">
                <span className="inline-flex items-center rounded-full bg-sky-50 text-sky-900 border border-sky-100 px-3 py-1 font-medium">
                  Unified Sign-in
                </span>
                <span className="inline-flex items-center rounded-full bg-emerald-50 text-emerald-900 border border-emerald-100 px-3 py-1 font-medium">
                  Lesson notes ready-to-print
                </span>
                <span className="inline-flex items-center rounded-full bg-indigo-50 text-indigo-900 border border-indigo-100 px-3 py-1 font-medium">
                  Attendance + Health
                </span>
              </div>
            </div>

            <div className="rounded-3xl border border-zinc-200 bg-white/85 shadow-sm backdrop-blur px-5 py-5 md:px-7 md:py-6">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-base md:text-lg font-semibold text-slate-900">
                  What’s inside
                </h2>
                <div className="text-[11px] md:text-xs text-slate-500">
                  Sign in to access your dashboard
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                {tiles.map((t) => (
                  <div
                    key={t.title}
                    className={cx(
                      "rounded-3xl border bg-gradient-to-b p-4 shadow-[0_1px_6px_rgba(15,23,42,0.06)]",
                      t.cls
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                          <span className="text-lg">{t.icon}</span>
                          {t.title}
                        </div>
                        <div className="mt-1 text-xs text-slate-600">{t.subtitle}</div>
                      </div>

                      <span
                        className={cx(
                          "shrink-0 inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold border border-white/60",
                          t.pillCls
                        )}
                      >
                        {t.pill}
                      </span>
                    </div>

                    <p className="mt-3 text-xs md:text-sm text-slate-700 leading-relaxed">
                      {t.desc}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* RIGHT: Simple CTA card (no auth form) */}
          <section>
            <div className="rounded-[28px] border border-zinc-200 bg-white shadow-sm overflow-hidden">
              <div className="p-6 border-b border-zinc-200 bg-gradient-to-b from-zinc-50 to-white">
                <div className="flex items-center gap-3">
                  <Image
                    src="/logo.png"
                    alt="EduLife OS"
                    width={40}
                    height={40}
                    className="rounded-2xl"
                    priority
                  />
                  <div>
                    <div className="text-lg font-extrabold text-zinc-900">Continue</div>
                    <div className="text-sm text-zinc-600">
                      Use the unified secure sign-in gateway.
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-6 space-y-3">
                <Link
                  href="/auth/signin"
                  className="block w-full text-center h-12 leading-[48px] rounded-2xl bg-black text-white text-sm font-semibold shadow-sm hover:bg-zinc-800"
                >
                  Sign in → Unified Gateway
                </Link>

                <Link
                  href={`/auth/signup?redirectTo=${encodeURIComponent(next)}`}
                  className="block w-full text-center h-12 leading-[48px] rounded-2xl border border-zinc-300 bg-white text-zinc-900 text-sm font-semibold shadow-sm hover:bg-zinc-50"
                >
                  Create account
                </Link>

                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-[11px] text-zinc-600">
                  Your account routes to the correct dashboard based on role (Teacher/Admin/Headteacher).
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
