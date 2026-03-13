//src/app/page.tsx
"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import HeroMedia from "@/components/HeroMedia";
import RoleSwitchDemo from "@/components/RoleSwitchDemo";
import ProofSection from "@/components/ProofSection";
import ProductShowcase from "@/components/ProductShowcase";
import PilotPath from "@/components/PilotPath";

const trustItems = [
  "NaCCA-aligned workflows",
  "Teacher, Headteacher, Parent portals",
  "Attendance, health, assessment, reporting",
  "Role-based access control",
  "Built for Ghanaian school reality",
];

const pillars = [
  {
    title: "Teach with Structure",
    body:
      "Lesson notes, schemes, attendance, health capture, assessments, and classroom execution in one disciplined teacher workflow.",
  },
  {
    title: "Lead with Clarity",
    body:
      "Headteachers see approvals, attendance certification, governance control, risk signals, and schoolwide performance without chasing paperwork.",
  },
  {
    title: "Build Parent Trust",
    body:
      "Parents see what matters, when it matters — from attendance and health to controlled result release and learner progress visibility.",
  },
];

const features = [
  {
    name: "Lesson Note Studio",
    text: "Move from scattered planning to structured, reviewable teaching execution.",
  },
  {
    name: "Attendance & Health Tracking",
    text: "Capture the daily reality of the learner, not just academic records.",
  },
  {
    name: "Headteacher Governance Copilot",
    text: "Turn leadership from reactive administration into measurable school control.",
  },
  {
    name: "Parent Results Release",
    text: "Release outcomes with discipline, timing, and trust — not confusion.",
  },
  {
    name: "Schoolwide Risk Board",
    text: "See operational weak points early before they become institutional problems.",
  },
];

const rolloutConfidence = [
  {
    title: "Start with a guided demo",
    text:
      "See the platform clearly first. No rushed commitment, no forced rollout, no software theatre.",
  },
  {
    title: "Begin with a pilot workflow",
    text:
      "Schools can begin with the highest-value loop first — teaching flow, leadership control, or parent-facing trust.",
  },
  {
    title: "Expand with confidence",
    text:
      "Adoption becomes stronger when the first steps are clear, disciplined, and suited to the school’s real operating rhythm.",
  },
];

const finalConfidencePills = [
  "Guided conversation before rollout",
  "Pilot-first implementation path",
  "Built for real school operations",
];

function fadeUp(delay = 0) {
  return {
    initial: { opacity: 0, y: 22 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, amount: 0.16 },
    transition: {
      duration: 0.95,
      delay,
      ease: [0.22, 1, 0.36, 1] as const,
    },
  };
}

export default function Home() {
  const reduceMotion = useReducedMotion();

  return (
    <main className="min-h-screen bg-[#05070B] text-[#F7F4ED]">
      <section className="relative overflow-hidden border-b border-white/8">
        <div className="absolute inset-0 bg-[linear-gradient(180deg,#05070B_0%,#071A3D_58%,#05070B_100%)]" />
        <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:68px_68px]" />

        <motion.div
          className="absolute -left-20 top-10 h-[20rem] w-[20rem] rounded-full bg-[#1B66D1]/20 blur-3xl sm:h-[24rem] sm:w-[24rem]"
          animate={
            reduceMotion
              ? {}
              : {
                  x: [0, 24, 0],
                  y: [0, 18, 0],
                  opacity: [0.35, 0.52, 0.35],
                  scale: [1, 1.06, 1],
                }
          }
          transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
        />

        <motion.div
          className="absolute right-0 top-0 h-[18rem] w-[18rem] rounded-full bg-[#D4AF37]/14 blur-3xl sm:h-[22rem] sm:w-[22rem]"
          animate={
            reduceMotion
              ? {}
              : {
                  x: [0, -20, 0],
                  y: [0, 14, 0],
                  opacity: [0.2, 0.32, 0.2],
                  scale: [1, 1.04, 1],
                }
          }
          transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
        />

        <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 py-10 sm:gap-12 sm:px-6 sm:py-14 md:py-20 lg:grid-cols-[0.92fr_1.08fr] lg:gap-16 lg:px-8 lg:py-28">
          <motion.div {...fadeUp(0)} className="max-w-3xl">
            <div className="inline-flex items-center rounded-full border border-[#E8C96A]/25 bg-white/6 px-4 py-2 text-[11px] uppercase tracking-[0.18em] text-[#E8C96A] sm:text-xs sm:tracking-[0.2em]">
              The Operating System for Human Potential
            </div>

            <h1 className="mt-6 text-4xl font-semibold leading-[1.02] sm:mt-8 sm:text-5xl lg:text-7xl">
              Run Your School Like a{" "}
              <span className="bg-[linear-gradient(135deg,#D4AF37,#E8C96A,#F7F4ED)] bg-clip-text text-transparent">
                World-Class
              </span>{" "}
              Institution
            </h1>

            <p className="mt-5 max-w-2xl text-sm leading-7 text-[#C9CDD6] sm:mt-6 sm:text-lg sm:leading-8">
              EduLife OS helps schools unify teaching, leadership, attendance,
              assessments, parent communication, and school performance in one
              disciplined system built for measurable growth.
            </p>

            <div className="mt-7 flex flex-col gap-3 sm:mt-8 sm:flex-row">
              <Link
                href="/contact?intent=demo"
                className="inline-flex items-center justify-center rounded-full bg-[linear-gradient(135deg,#D4AF37,#E8C96A)] px-6 py-3 text-sm font-semibold text-[#071A3D] shadow-[0_18px_50px_rgba(212,175,55,0.22)] transition hover:scale-[1.02]"
              >
                Book a School Demo
              </Link>
              <Link
                href="/#roles"
                className="inline-flex items-center justify-center rounded-full border border-white/12 bg-white/5 px-6 py-3 text-sm font-medium text-[#F7F4ED] transition hover:bg-white/10"
              >
                Explore the Platform
              </Link>
            </div>

            <div className="mt-4 text-sm leading-7 text-[#AEB6C4]">
              For headteachers, proprietors, school leaders, and implementation partners.
            </div>

            <Link
              href="/#platform"
              className="mt-4 inline-block text-sm text-[#C9CDD6] transition hover:text-white"
            >
              See how it works →
            </Link>

            <div className="mt-8 grid gap-3 sm:mt-10 sm:grid-cols-3">
              {[
                { label: "Teaching", value: "Structured" },
                { label: "Leadership", value: "Disciplined" },
                { label: "Parent Trust", value: "Connected" },
              ].map((item, idx) => (
                <motion.div
                  key={item.label}
                  {...fadeUp(0.1 + idx * 0.06)}
                  whileHover={reduceMotion ? {} : { y: -4 }}
                  className="rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.10),rgba(255,255,255,0.04))] p-4 shadow-[0_20px_60px_rgba(0,0,0,0.18)]"
                >
                  <div className="text-xs uppercase tracking-[0.16em] text-[#8F98A8]">
                    {item.label}
                  </div>
                  <div className="mt-2 text-lg font-semibold text-[#F7F4ED]">
                    {item.value}
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>

          <motion.div {...fadeUp(0.16)} className="relative">
            <div className="pointer-events-none absolute -left-6 top-12 hidden rounded-full border border-white/10 bg-white/5 px-4 py-3 text-sm text-[#D9DEE8] shadow-[0_18px_50px_rgba(0,0,0,0.22)] md:block">
              Governance control
            </div>

            <div className="pointer-events-none absolute right-0 top-28 hidden rounded-full border border-[#E8C96A]/20 bg-[#D4AF37]/10 px-4 py-3 text-sm text-[#F7F4ED] shadow-[0_18px_50px_rgba(0,0,0,0.22)] md:block">
              Parent trust loop
            </div>

            <div className="pointer-events-none absolute -left-2 bottom-16 hidden rounded-full border border-white/10 bg-white/5 px-4 py-3 text-sm text-[#D9DEE8] shadow-[0_18px_50px_rgba(0,0,0,0.22)] md:block">
              Attendance + health
            </div>

            <div className="pointer-events-none absolute right-6 bottom-10 hidden rounded-full border border-white/10 bg-white/5 px-4 py-3 text-sm text-[#D9DEE8] shadow-[0_18px_50px_rgba(0,0,0,0.22)] md:block">
              Built for Ghana
            </div>

            <HeroMedia />
          </motion.div>
        </div>
      </section>

      <section className="border-y border-white/8 bg-[#07111F]">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 sm:py-5 lg:px-8">
          <div className="flex gap-3 overflow-x-auto pb-1 no-scrollbar sm:flex-wrap">
            {trustItems.map((item, idx) => (
              <motion.div
                key={item}
                {...fadeUp(0.04 * idx)}
                className="shrink-0 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-[#D8DDE7]"
              >
                {item}
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section id="platform" className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-16 lg:px-8 lg:py-20">
        <motion.div {...fadeUp(0)} className="max-w-3xl">
          <div className="text-xs uppercase tracking-[0.2em] text-[#E8C96A]">
            Why EduLife OS
          </div>
          <h2 className="mt-4 text-2xl font-semibold sm:text-4xl lg:text-5xl">
            More than a website. More than a dashboard. An execution system.
          </h2>
          <p className="mt-5 text-sm leading-7 text-[#C9CDD6] sm:text-base sm:leading-8">
            Most school websites are brochureware. Most MIS tools are fragmented.
            EduLife OS is being built to unify the real operating rhythm of the school.
          </p>
        </motion.div>

        {/* Mobile: horizontal cards */}
        <div className="mt-8 flex gap-4 overflow-x-auto pb-2 no-scrollbar lg:hidden">
          {pillars.map((pillar, idx) => (
            <motion.div
              key={pillar.title}
              {...fadeUp(0.05 * idx)}
              className="min-w-[85%] rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.09),rgba(255,255,255,0.03))] p-5 shadow-[0_25px_90px_rgba(0,0,0,0.20)]"
            >
              <div className="h-11 w-11 rounded-2xl bg-[linear-gradient(135deg,#D4AF37,#E8C96A)] shadow-[0_0_24px_rgba(212,175,55,0.24)]" />
              <h3 className="mt-5 text-xl font-semibold">{pillar.title}</h3>
              <p className="mt-4 text-sm leading-7 text-[#C9CDD6]">{pillar.body}</p>
            </motion.div>
          ))}
        </div>

        {/* Desktop */}
        <div className="mt-12 hidden gap-6 lg:grid lg:grid-cols-3">
          {pillars.map((pillar, idx) => (
            <motion.div
              key={pillar.title}
              {...fadeUp(0.08 + idx * 0.06)}
              whileHover={reduceMotion ? {} : { y: -6 }}
              className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.09),rgba(255,255,255,0.03))] p-6 shadow-[0_25px_90px_rgba(0,0,0,0.20)]"
            >
              <div className="h-11 w-11 rounded-2xl bg-[linear-gradient(135deg,#D4AF37,#E8C96A)] shadow-[0_0_24px_rgba(212,175,55,0.24)]" />
              <h3 className="mt-5 text-xl font-semibold">{pillar.title}</h3>
              <p className="mt-4 text-sm leading-7 text-[#C9CDD6]">{pillar.body}</p>
            </motion.div>
          ))}
        </div>
      </section>

      <ProofSection />
      <RoleSwitchDemo />
      <ProductShowcase />

      <section id="features" className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-16 lg:px-8 lg:py-20">
        <motion.div {...fadeUp(0)} className="max-w-3xl">
          <div className="text-xs uppercase tracking-[0.2em] text-[#E8C96A]">
            Flagship Features
          </div>
          <h2 className="mt-4 text-2xl font-semibold sm:text-4xl lg:text-5xl">
            Built for school discipline, not digital decoration.
          </h2>
        </motion.div>

        <div className="mt-8 grid gap-4 sm:mt-10 lg:grid-cols-2 lg:gap-6">
          {features.map((feature, idx) => (
            <motion.div
              key={feature.name}
              {...fadeUp(0.08 + idx * 0.05)}
              whileHover={reduceMotion ? {} : { y: -5 }}
              className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-5 sm:rounded-[28px] sm:p-6"
            >
              <div className="text-sm uppercase tracking-[0.16em] text-[#E8C96A]">
                {feature.name}
              </div>
              <p className="mt-4 max-w-xl text-sm leading-7 text-[#C9CDD6]">
                {feature.text}
              </p>
            </motion.div>
          ))}
        </div>
      </section>

      <PilotPath />

      <section id="vision" className="relative overflow-hidden bg-[#07111F] py-14 sm:py-16 lg:py-20">
        <motion.div
          className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(212,175,55,0.10),transparent_30%)]"
          animate={reduceMotion ? {} : { opacity: [0.38, 0.7, 0.38] }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          {...fadeUp(0)}
          className="relative mx-auto max-w-5xl px-4 text-center sm:px-6 lg:px-8"
        >
          <div className="text-xs uppercase tracking-[0.2em] text-[#E8C96A]">
            Vision
          </div>
          <h2 className="mt-4 text-2xl font-semibold sm:text-4xl lg:text-5xl">
            We are building infrastructure for the next generation of African excellence.
          </h2>
          <p className="mx-auto mt-6 max-w-3xl text-sm leading-7 text-[#C9CDD6] sm:text-base sm:leading-8">
            EduLife OS is being designed to help schools grow disciplined learners,
            sharper teachers, stronger leaders, and more trusted family-school relationships —
            all inside a system built for practical African reality and long-term human development.
          </p>
        </motion.div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-16 lg:px-8 lg:py-20">
        <motion.div
          {...fadeUp(0)}
          whileHover={reduceMotion ? {} : { y: -3 }}
          className="rounded-[24px] border border-[#E8C96A]/20 bg-[linear-gradient(135deg,rgba(212,175,55,0.14),rgba(11,61,145,0.12),rgba(5,7,11,0.9))] p-5 shadow-[0_30px_120px_rgba(0,0,0,0.35)] sm:rounded-[36px] sm:p-8 lg:p-12"
        >
          <div className="max-w-3xl">
            <div className="text-xs uppercase tracking-[0.2em] text-[#E8C96A]">
              Final Call
            </div>
            <h2 className="mt-4 text-2xl font-semibold sm:text-4xl lg:text-5xl">
              Bring world-class discipline to your school.
            </h2>
            <p className="mt-5 text-sm leading-7 text-[#D9DEE8] sm:text-base sm:leading-8">
              See how EduLife OS unifies teaching, leadership, and parent trust in one premium operating system.
            </p>

            <div className="mt-6 flex gap-3 overflow-x-auto pb-1 no-scrollbar sm:mt-8 sm:flex-wrap">
              {finalConfidencePills.map((item) => (
                <div
                  key={item}
                  className="shrink-0 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-[#E5E8EF]"
                >
                  {item}
                </div>
              ))}
            </div>

            {/* Mobile */}
            <div className="mt-6 flex gap-4 overflow-x-auto pb-2 no-scrollbar md:hidden">
              {rolloutConfidence.map((item, idx) => (
                <motion.div
                  key={item.title}
                  initial={{ opacity: 0, y: 14 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.55, delay: 0.08 * idx }}
                  className="min-w-[85%] rounded-[24px] border border-white/10 bg-white/5 p-5"
                >
                  <div className="text-sm font-semibold text-[#F7F4ED]">
                    {item.title}
                  </div>
                  <p className="mt-3 text-sm leading-7 text-[#C9CDD6]">
                    {item.text}
                  </p>
                </motion.div>
              ))}
            </div>

            {/* Desktop */}
            <div className="mt-8 hidden gap-4 md:grid md:grid-cols-3">
              {rolloutConfidence.map((item, idx) => (
                <motion.div
                  key={item.title}
                  initial={{ opacity: 0, y: 14 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.55, delay: 0.08 * idx }}
                  className="rounded-[24px] border border-white/10 bg-white/5 p-5"
                >
                  <div className="text-sm font-semibold text-[#F7F4ED]">
                    {item.title}
                  </div>
                  <p className="mt-3 text-sm leading-7 text-[#C9CDD6]">
                    {item.text}
                  </p>
                </motion.div>
              ))}
            </div>

            <div className="mt-6 max-w-2xl text-sm leading-7 text-[#D9DEE8] sm:mt-8">
              Schools do not need to commit to a full system rollout on the first conversation.
              The right first step is a guided demo or a focused pilot conversation based on the school’s real needs.
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:mt-8 sm:flex-row">
              <Link
                href="/contact?intent=demo"
                className="inline-flex items-center justify-center rounded-full bg-[linear-gradient(135deg,#D4AF37,#E8C96A)] px-6 py-3 text-sm font-semibold text-[#071A3D]"
              >
                Request a Demo
              </Link>
              <Link
                href="/contact?intent=pilot"
                className="inline-flex items-center justify-center rounded-full border border-white/12 bg-white/5 px-6 py-3 text-sm font-medium text-[#F7F4ED]"
              >
                Talk to Us About Deployment
              </Link>
            </div>
          </div>
        </motion.div>
      </section>
    </main>
  );
}