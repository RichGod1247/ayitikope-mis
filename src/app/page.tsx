"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import HeroMedia from "@/components/HeroMedia";

const evidenceChain = [
  ["01", "Scheme", "Term intent becomes visible before classroom delivery."],
  ["02", "Lesson Note", "Preparation becomes reviewable evidence."],
  ["03", "Lesson Delivery", "Approved planning connects to what was actually taught."],
  ["04", "Work Output & Assessment", "Practice and learner performance become measurable."],
  ["05", "Appraisal", "Professional review can reference the evidence behind the work."],
  ["06", "Governance Action", "Authorized officers can follow risk, accountability, and improvement."],
  ["07", "Family Visibility", "Parents receive the information they are meant to see, when it is ready."],
];

const audiences = [
  {
    eyebrow: "Governance Officers",
    title: "See the institution beyond a single dashboard.",
    body:
      "Circuit and district leaders can work from authorized school scope, supervision signals, appraisal evidence, official notices, attendance truth, assessment evidence, and follow-up accountability.",
    points: ["Circuit & district command", "Appraisal workflows", "Official notice accountability", "School evidence drilldown"],
    tone: "from-emerald-400/15 via-teal-400/8 to-transparent",
  },
  {
    eyebrow: "Headteachers",
    title: "Turn leadership into a visible operating rhythm.",
    body:
      "Approvals, schemes, lesson-note review, teacher attendance certification, assessment oversight, reports, appraisals, and school follow-up sit inside one leadership environment.",
    points: ["Approval & vetting", "Certified attendance", "Assessment oversight", "Teacher appraisal evidence"],
    tone: "from-sky-400/15 via-blue-400/8 to-transparent",
  },
  {
    eyebrow: "Teachers",
    title: "Move through the work in the order the work belongs.",
    body:
      "Curriculum, schemes, lesson notes, lesson delivery, attendance, assessment, Work Output, and appraisal feedback connect into a guided professional workflow.",
    points: ["Curriculum to scheme", "Lesson-note workflow", "Delivery evidence", "Assessment & Work Output"],
    tone: "from-violet-400/15 via-indigo-400/8 to-transparent",
  },
  {
    eyebrow: "Parents & Guardians",
    title: "Receive clarity around the learner without unnecessary noise.",
    body:
      "Families can access attendance, released results, reports, receipts, fee information, notifications, and important school alerts through protected parent-facing surfaces.",
    points: ["Attendance visibility", "Released results & reports", "Receipts & fee information", "Important school alerts"],
    tone: "from-amber-300/15 via-orange-400/8 to-transparent",
  },
  {
    eyebrow: "School Community",
    title: "Create shared confidence in how the school is run.",
    body:
      "School administration, educators, families, and governance officers operate from clearer roles, clearer evidence, and clearer responsibility.",
    points: ["Role-scoped access", "Evidence before action", "Accountable communication", "Institutional continuity"],
    tone: "from-rose-300/12 via-fuchsia-400/7 to-transparent",
  },
];

const governanceSignals = [
  "Authorized circuit and district scope",
  "Certified teacher-attendance evidence",
  "Teacher and Headteacher appraisal workflows",
  "Scheme-vetting and lesson-delivery signals",
  "Teacher Work Output visibility for SISSO",
  "Official notices, acknowledgements, and follow-up evidence",
];

const teachingSignals = [
  "Curriculum and Scheme of Work",
  "Lesson-note preparation and review",
  "Recorded lesson delivery",
  "Assessment and learner scores",
  "Work Output after delivered lessons",
  "Evidence available for professional appraisal",
];

const familySignals = [
  "Attendance visibility",
  "Released learner results",
  "Term reports",
  "Fees and receipts",
  "Notifications",
  "Important school alerts",
];

const proofSignals = [
  "Teacher workspace",
  "Headteacher command",
  "SISSO circuit command",
  "District governance command",
  "Parent portal",
  "Teacher & Headteacher appraisal",
  "Work Output",
  "Official notices",
  "Attendance",
  "Assessment & reports",
];

function fadeUp(delay = 0) {
  return {
    initial: { opacity: 0.44, y: 12, scale: 0.996 },
    whileInView: { opacity: 1, y: 0, scale: 1 },
    viewport: { once: false, amount: 0.18 },
    transition: {
      duration: 1.02,
      delay,
      ease: [0.16, 1, 0.3, 1] as const,
    },
  };
}

function SectionIntro({
  eyebrow,
  title,
  body,
}: {
  eyebrow: string;
  title: string;
  body: string;
}) {
  return (
    <motion.div {...fadeUp()} className="max-w-3xl">
      <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[#E8C96A]">{eyebrow}</div>
      <h2 className="mt-4 text-2xl font-semibold tracking-tight text-[#F7F4ED] sm:text-4xl lg:text-5xl">
        {title}
      </h2>
      <p className="mt-5 text-sm leading-7 text-[#C9CDD6] sm:text-base sm:leading-8">{body}</p>
    </motion.div>
  );
}

export default function Home() {
  const reduceMotion = useReducedMotion();
  const [activeEvidence, setActiveEvidence] = useState(0);

  return (
    <main className="overflow-hidden bg-[#05070B] text-[#F7F4ED]">
      <section className="relative overflow-hidden bg-[linear-gradient(145deg,#05070B_0%,#071A3D_46%,#0B2F67_72%,#07111F_100%)]">
        <div className="pointer-events-none absolute inset-0">
          <motion.div
            className="absolute -left-32 top-12 h-[28rem] w-[28rem] rounded-full bg-[#1B66D1]/20 blur-3xl"
            animate={reduceMotion ? {} : { x: [0, 34, 0], y: [0, 20, 0], opacity: [0.28, 0.46, 0.28] }}
            transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            className="absolute right-[-8rem] top-[-4rem] h-[30rem] w-[30rem] rounded-full bg-[#D4AF37]/14 blur-3xl"
            animate={reduceMotion ? {} : { x: [0, -22, 0], y: [0, 28, 0], opacity: [0.18, 0.34, 0.18] }}
            transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
          />
          <div className="absolute inset-0 opacity-[0.08] [background-image:linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:72px_72px]" />
        </div>

        <div className="relative mx-auto grid max-w-7xl gap-10 px-4 pb-16 pt-14 sm:px-6 sm:pb-20 sm:pt-20 lg:grid-cols-[1.02fr_0.98fr] lg:items-center lg:px-8 lg:pb-24 lg:pt-24">
          <motion.div {...fadeUp()}>
            <div className="inline-flex flex-wrap items-center gap-2 rounded-full border border-[#E8C96A]/25 bg-[#E8C96A]/8 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#F4D97F]">
              Educational Governance
              <span className="text-white/30">•</span>
              School Operations
              <span className="text-white/30">•</span>
              Family Trust
            </div>

            <h1 className="mt-6 max-w-4xl text-4xl font-semibold tracking-[-0.035em] text-white sm:text-6xl lg:text-[4.3rem] lg:leading-[1.02]">
              One operating system for the life of the school.
            </h1>

            <p className="mt-6 max-w-2xl text-base leading-8 text-[#D8DEE9] sm:text-lg">
              EduLife OS connects the evidence of teaching with the people responsible for improving it.
              Teachers, school leaders, governance officers, and families work from one accountable rhythm
              spanning planning, attendance, lesson delivery, assessment, appraisal, communication, and follow-up.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/contact?intent=demo"
                className="inline-flex items-center justify-center rounded-full bg-[linear-gradient(135deg,#D4AF37,#E8C96A)] px-6 py-3.5 text-sm font-semibold text-[#071A3D] shadow-[0_20px_60px_rgba(212,175,55,0.22)] hover:brightness-105"
              >
                Book an Institutional Demo
              </Link>
              <Link
                href="/#evidence-chain"
                className="inline-flex items-center justify-center rounded-full border border-white/14 bg-white/6 px-6 py-3.5 text-sm font-medium text-white hover:bg-white/10"
              >
                See How EduLife Works
              </Link>
            </div>

            <div className="mt-8 flex flex-wrap gap-2">
              {["Role-scoped access", "Evidence-led workflows", "Ghana-ready", "Low-network conscious"].map((item) => (
                <span key={item} className="rounded-full border border-white/10 bg-black/10 px-3 py-1.5 text-xs text-[#D6DCE7]">
                  {item}
                </span>
              ))}
            </div>
          </motion.div>

          <motion.div {...fadeUp(0.08)} className="relative">
            <div className="absolute -inset-6 rounded-[44px] bg-[radial-gradient(circle_at_center,rgba(14,165,233,0.16),transparent_55%)] blur-2xl" />
            <div className="relative">
              <HeroMedia />
            </div>
          </motion.div>
        </div>

        <div className="relative border-t border-white/10 bg-black/10">
          <div className="mx-auto grid max-w-7xl grid-cols-2 gap-px px-4 py-5 sm:px-6 md:grid-cols-4 lg:px-8">
            {[
              ["Governance", "See across authorized schools"],
              ["Headteachers", "Lead from verified evidence"],
              ["Teachers", "Follow one connected workflow"],
              ["Families", "Receive the right information"],
            ].map(([label, text]) => (
              <div key={label} className="px-3 py-3">
                <div className="text-sm font-semibold text-[#F4D97F]">{label}</div>
                <div className="mt-1 text-xs leading-5 text-[#B9C1CF]">{text}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section
        id="evidence-chain"
        className="relative overflow-hidden bg-[linear-gradient(145deg,#06121F_0%,#082A43_46%,#063B46_74%,#07111F_100%)] py-16 sm:py-20 lg:py-24"
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_88%_18%,rgba(34,211,238,0.12),transparent_30%),radial-gradient(circle_at_8%_72%,rgba(59,130,246,0.12),transparent_30%)]" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionIntro
            eyebrow="The EduLife Evidence Chain"
            title="One evidence chain. Clear responsibility at every level."
            body="EduLife OS carries the story of the work forward. What is planned can be reviewed, what is taught can be evidenced, what is assessed can be interpreted, and what needs attention can reach the responsible leader."
          />

          <div className="mt-8 sm:hidden">
            <div className="grid grid-cols-2 gap-2" aria-label="EduLife evidence chain">
              {evidenceChain.map(([num, title], index) => {
                const selected = activeEvidence === index;

                return (
                  <motion.button
                    key={title}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setActiveEvidence(index)}
                    whileTap={reduceMotion ? {} : { scale: 0.985 }}
                    transition={{ type: "spring", stiffness: 300, damping: 25 }}
                    className={
                      selected
                        ? "min-h-[60px] rounded-[18px] border border-cyan-200/28 bg-cyan-100/[0.11] p-3 text-left outline-none shadow-[0_10px_36px_rgba(34,211,238,0.10)] transition"
                        : "min-h-[60px] rounded-[18px] border border-cyan-100/10 bg-white/[0.045] p-3 text-left outline-none transition"
                    }
                  >
                    <div className="flex items-start gap-2.5">
                      <span className="mt-0.5 text-[11px] font-semibold text-cyan-200/80">{num}</span>
                      <span className="text-sm font-semibold leading-5 text-white">{title}</span>
                    </div>
                  </motion.button>
                );
              })}
            </div>

            <motion.div
              key={activeEvidence}
              initial={reduceMotion ? false : { opacity: 0.55, y: 6, scale: 0.994 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="mt-3 rounded-[20px] border border-cyan-100/12 bg-black/10 px-4 py-3.5"
              aria-live="polite"
            >
              <div className="text-sm font-semibold text-cyan-100">
                {evidenceChain[activeEvidence][1]}
              </div>
              <p className="mt-1.5 text-sm leading-6 text-[#C8D6DF]">
                {evidenceChain[activeEvidence][2]}
              </p>
              <div className="mt-2 text-xs text-cyan-100/60">
                Tap another step to follow the chain.
              </div>
            </motion.div>
          </div>

          <div className="mt-10 hidden gap-3 sm:grid sm:grid-cols-2 lg:grid-cols-7">
            {evidenceChain.map(([num, title, text], index) => (
              <motion.div
                key={title}
                {...fadeUp(index * 0.035)}
                whileHover={reduceMotion ? {} : { y: -3, scale: 0.992 }}
                className="relative rounded-[24px] border border-cyan-100/10 bg-white/[0.055] p-4 backdrop-blur-sm"
              >
                <div className="text-xs font-semibold text-cyan-200/80">{num}</div>
                <div className="mt-3 text-sm font-semibold text-white">{title}</div>
                <p className="mt-2 text-xs leading-6 text-[#C8D6DF]">{text}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section
        id="roles"
        className="relative overflow-hidden bg-[linear-gradient(145deg,#0B1022_0%,#21134A_42%,#172554_72%,#07111F_100%)] py-16 sm:py-20 lg:py-24"
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_14%_20%,rgba(168,85,247,0.14),transparent_28%),radial-gradient(circle_at_84%_62%,rgba(59,130,246,0.12),transparent_30%)]" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionIntro
            eyebrow="Who EduLife Serves"
            title="Every role sees the part of the truth it is responsible for."
            body="The platform is designed around responsibility. Each person gets a clearer next action while the institution keeps a coherent evidence trail."
          />

          <div className="mt-10 grid gap-4 lg:grid-cols-2">
            {audiences.map((item, idx) => (
              <motion.article
                key={item.eyebrow}
                {...fadeUp(idx * 0.04)}
                whileHover={reduceMotion ? {} : { y: -4 }}
                className={`relative overflow-hidden rounded-[28px] border border-white/10 bg-gradient-to-br ${item.tone} p-5 shadow-[0_24px_70px_rgba(0,0,0,0.18)] sm:p-6`}
              >
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#E8C96A]">{item.eyebrow}</div>
                <h3 className="mt-3 text-xl font-semibold text-white sm:text-2xl">{item.title}</h3>
                <p className="mt-4 text-sm leading-7 text-[#D0D6E0]">{item.body}</p>
                <div className="mt-5 flex flex-wrap gap-2">
                  {item.points.map((point) => (
                    <span key={point} className="rounded-full border border-white/10 bg-black/10 px-3 py-1.5 text-xs text-[#E4E8EF]">
                      {point}
                    </span>
                  ))}
                </div>
              </motion.article>
            ))}
          </div>
        </div>
      </section>

      <section
        id="governance"
        className="relative overflow-hidden bg-[linear-gradient(145deg,#04140F_0%,#063B2F_42%,#0F4C5C_73%,#07111F_100%)] py-16 sm:py-20 lg:py-24"
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_18%,rgba(52,211,153,0.15),transparent_26%),radial-gradient(circle_at_10%_76%,rgba(34,211,238,0.10),transparent_30%)]" />
        <div className="relative mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.92fr_1.08fr] lg:items-center lg:px-8">
          <SectionIntro
            eyebrow="Governance Spine"
            title="See what needs attention. Act from evidence."
            body="EduLife OS extends the operating rhythm beyond the school office. Authorized governance officers can work across their assigned scope while school-level evidence remains connected to the action that follows."
          />

          <motion.div {...fadeUp(0.06)} className="grid gap-3 sm:grid-cols-2">
            {governanceSignals.map((item) => (
              <div key={item} className="rounded-[22px] border border-emerald-100/12 bg-emerald-50/[0.055] p-4 text-sm leading-6 text-emerald-50">
                <span className="mr-2 text-[#E8C96A]">◆</span>
                {item}
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      <section className="relative overflow-hidden bg-[linear-gradient(145deg,#06122A_0%,#0B3D91_48%,#123C69_74%,#07111F_100%)] py-16 sm:py-20 lg:py-24">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_22%,rgba(96,165,250,0.16),transparent_28%),radial-gradient(circle_at_82%_70%,rgba(34,211,238,0.10),transparent_30%)]" />
        <div className="relative mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-2 lg:items-center lg:px-8">
          <SectionIntro
            eyebrow="Teaching Evidence"
            title="The classroom workflow stays connected from plan to proof."
            body="The teacher journey links curriculum intent, preparation, delivery, assessment, and Work Output so professional effort becomes easier to follow and support."
          />

          <motion.div {...fadeUp(0.06)} className="rounded-[30px] border border-blue-100/12 bg-black/12 p-5 sm:p-6">
            <div className="grid gap-3 sm:grid-cols-2">
              {teachingSignals.map((item, idx) => (
                <div key={item} className="rounded-2xl border border-white/10 bg-white/[0.055] p-4">
                  <div className="text-xs font-semibold text-blue-200">0{idx + 1}</div>
                  <div className="mt-2 text-sm font-medium text-white">{item}</div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      <section className="relative overflow-hidden bg-[linear-gradient(145deg,#21120B_0%,#4A2419_38%,#5B2430_66%,#111827_100%)] py-16 sm:py-20 lg:py-24">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_78%_18%,rgba(251,191,36,0.14),transparent_28%),radial-gradient(circle_at_18%_76%,rgba(244,63,94,0.10),transparent_30%)]" />
        <div className="relative mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[1fr_0.9fr] lg:items-center lg:px-8">
          <div>
            <SectionIntro
              eyebrow="Family Trust"
              title="Give families clarity at the moments that matter."
              body="Protected parent-facing surfaces keep attention on the learner: presence, released performance information, school communication, and financial records intended for the family."
            />
            <div className="mt-8 flex flex-wrap gap-2">
              {familySignals.map((item) => (
                <span key={item} className="rounded-full border border-amber-100/12 bg-amber-50/[0.055] px-4 py-2 text-sm text-amber-50">
                  {item}
                </span>
              ))}
            </div>
          </div>

          <motion.div {...fadeUp(0.08)} className="rounded-[32px] border border-[#E8C96A]/20 bg-[linear-gradient(145deg,rgba(232,201,106,0.12),rgba(255,255,255,0.035))] p-6 shadow-[0_28px_90px_rgba(0,0,0,0.28)]">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#F4D97F]">Trust principle</div>
            <p className="mt-4 text-2xl font-semibold leading-tight text-white">
              The right information. The right person. The right time.
            </p>
            <p className="mt-4 text-sm leading-7 text-[#E1D6CF]">
              EduLife OS keeps role boundaries and controlled release at the center of family communication,
              so visibility strengthens responsibility instead of creating noise.
            </p>
          </motion.div>
        </div>
      </section>

      <section id="proof" className="relative overflow-hidden bg-[linear-gradient(145deg,#05070B_0%,#111827_48%,#1F2937_72%,#07111F_100%)] py-16 sm:py-20 lg:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionIntro
            eyebrow="Product Proof"
            title="The value proposition is already visible in the product."
            body="EduLife OS spans the working surfaces used by teachers, school leaders, families, and governance officers. From classroom practice to institutional decisions, evidence stays connected to the person responsible for what happens next."
          />
          <motion.div {...fadeUp(0.08)} className="mt-9 flex flex-wrap gap-2">
            {proofSignals.map((item) => (
              <span key={item} className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-[#E3E7EE]">
                {item}
              </span>
            ))}
          </motion.div>
        </div>
      </section>

      <section className="relative overflow-hidden bg-[linear-gradient(145deg,#071A14_0%,#123524_40%,#3A3A1C_72%,#07111F_100%)] py-16 sm:py-20 lg:py-24">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_82%_22%,rgba(232,201,106,0.14),transparent_26%),radial-gradient(circle_at_12%_72%,rgba(74,222,128,0.10),transparent_30%)]" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-8 rounded-[34px] border border-[#E8C96A]/18 bg-black/15 p-6 sm:p-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#E8C96A]">Institutional Adoption</div>
              <h2 className="mt-4 text-2xl font-semibold text-white sm:text-4xl">
                Start with the priorities that matter most. Expand from evidence.
              </h2>
              <p className="mt-5 max-w-2xl text-sm leading-7 text-[#D2DBD4] sm:text-base sm:leading-8">
                Adoption is strongest when roles are clear, the first workflows solve a visible need,
                and people experience value before the next layer is introduced.
              </p>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <Link href="/contact?intent=demo" className="inline-flex items-center justify-center rounded-full bg-[linear-gradient(135deg,#D4AF37,#E8C96A)] px-6 py-3 text-sm font-semibold text-[#071A3D]">
                  Book an Institutional Demo
                </Link>
                <Link href="/contact?intent=pilot" className="inline-flex items-center justify-center rounded-full border border-white/12 bg-white/5 px-6 py-3 text-sm font-medium text-white">
                  Discuss Adoption
                </Link>
              </div>
            </div>

            <div className="grid gap-3">
              {[
                ["01", "Align roles and authority"],
                ["02", "Activate priority workflows"],
                ["03", "Measure the evidence"],
                ["04", "Expand with confidence"],
              ].map(([num, text]) => (
                <div key={num} className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/5 p-4">
                  <span className="text-xs font-semibold text-[#F4D97F]">{num}</span>
                  <span className="text-sm font-medium text-white">{text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="vision" className="relative overflow-hidden bg-[linear-gradient(145deg,#05070B_0%,#071A3D_48%,#281B46_72%,#05070B_100%)] py-16 sm:py-20 lg:py-24">
        <motion.div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(212,175,55,0.13),transparent_34%)]"
          animate={reduceMotion ? {} : { opacity: [0.42, 0.72, 0.42] }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div {...fadeUp()} className="relative mx-auto max-w-5xl px-4 text-center sm:px-6 lg:px-8">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[#E8C96A]">Vision</div>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-5xl">
            EduLife OS is infrastructure for accountable education.
          </h2>
          <p className="mx-auto mt-6 max-w-3xl text-sm leading-8 text-[#CDD4DF] sm:text-base">
            Its purpose is to help education systems build stronger learners, more supported educators,
            more capable school leadership, better-informed families, and governance that can act from evidence.
          </p>
        </motion.div>
      </section>

      <section className="relative overflow-hidden bg-[#05070B] py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <motion.div
            {...fadeUp()}
            className="relative overflow-hidden rounded-[34px] border border-[#E8C96A]/20 bg-[linear-gradient(135deg,#0B3D91_0%,#102D52_42%,#3B2B18_100%)] p-7 shadow-[0_30px_110px_rgba(0,0,0,0.32)] sm:p-10"
          >
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_85%_18%,rgba(232,201,106,0.22),transparent_28%)]" />
            <div className="relative max-w-3xl">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#F4D97F]">See EduLife OS in context</div>
              <h2 className="mt-4 text-3xl font-semibold text-white sm:text-5xl">
                See how the operating system fits your institution.
              </h2>
              <p className="mt-5 text-sm leading-7 text-[#D9E1EC] sm:text-base sm:leading-8">
                Start with the people, responsibilities, and workflows that matter most in your school,
                circuit, district, or education community.
              </p>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <Link href="/contact?intent=demo" className="inline-flex items-center justify-center rounded-full bg-[linear-gradient(135deg,#D4AF37,#E8C96A)] px-6 py-3.5 text-sm font-semibold text-[#071A3D]">
                  Book an Institutional Demo
                </Link>
                <Link href="/auth/signin" className="inline-flex items-center justify-center rounded-full border border-white/14 bg-white/7 px-6 py-3.5 text-sm font-medium text-white">
                  Sign In to EduLife OS
                </Link>
              </div>
            </div>
          </motion.div>
        </div>
      </section>
    </main>
  );
}
