// src/app/contact/page.tsx
import { Suspense } from "react";
import ContactPageClient from "./ContactPageClient";

function ContactPageFallback() {
  return (
    <main className="min-h-screen bg-[#05070B] text-[#F7F4ED]">
      <section className="relative overflow-hidden border-b border-white/8">
        <div className="absolute inset-0 bg-[linear-gradient(180deg,#05070B_0%,#071A3D_60%,#05070B_100%)]" />
        <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:68px_68px]" />

        <div className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <div className="max-w-4xl">
            <div className="inline-flex items-center rounded-full border border-[#E8C96A]/25 bg-white/6 px-4 py-2 text-xs uppercase tracking-[0.2em] text-[#E8C96A]">
              EduLife OS Contact & Deployment
            </div>

            <h1 className="mt-8 text-4xl font-semibold leading-[1.02] sm:text-5xl lg:text-7xl">
              Speak with the team about{" "}
              <span className="bg-[linear-gradient(135deg,#D4AF37,#E8C96A,#F7F4ED)] bg-clip-text text-transparent">
                demos, pilots,
              </span>{" "}
              and school rollout.
            </h1>

            <p className="mt-6 max-w-3xl text-base leading-8 text-[#C9CDD6] sm:text-lg">
              EduLife OS is built for schools that value trust, clarity, and disciplined execution.
              Reach out to discuss a school demo, pilot deployment, or partnership conversation.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.10),rgba(255,255,255,0.04))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.24)] sm:p-8">
          <div className="h-4 w-32 animate-pulse rounded bg-white/10" />
          <div className="mt-4 h-10 w-72 animate-pulse rounded bg-white/10" />
          <div className="mt-3 h-4 w-full max-w-2xl animate-pulse rounded bg-white/10" />
          <div className="mt-2 h-4 w-full max-w-xl animate-pulse rounded bg-white/10" />

          <div className="mt-8 grid gap-5 sm:grid-cols-2">
            <div className="h-14 animate-pulse rounded-2xl bg-[#081326]" />
            <div className="h-14 animate-pulse rounded-2xl bg-[#081326]" />
          </div>

          <div className="mt-5 h-14 animate-pulse rounded-2xl bg-[#081326]" />
          <div className="mt-5 h-40 animate-pulse rounded-2xl bg-[#081326]" />

          <div className="mt-6 h-12 w-40 animate-pulse rounded-full bg-white/10" />
        </div>
      </section>
    </main>
  );
}

export default function ContactPage() {
  return (
    <Suspense fallback={<ContactPageFallback />}>
      <ContactPageClient />
    </Suspense>
  );
}