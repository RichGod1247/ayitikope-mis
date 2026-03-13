//src/components/ProductShowcase.tsx
"use client";

import { useState } from "react";
import Image from "next/image";
import { motion, useReducedMotion } from "framer-motion";

type Variant = "teacher" | "headteacher" | "parent";

const showcaseItems: Array<{
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  bullets: string[];
  variant: Variant;
}> = [
  {
    id: "teacher-workspace",
    eyebrow: "Teacher Workspace",
    title: "A teacher’s working day should feel structured, focused, and connected.",
    body:
      "This live product view shows how EduLife OS brings lesson preparation, term planning, attendance rhythm, wellbeing awareness, and assessment flow into one organized teacher workspace.",
    bullets: [
      "Lesson note preparation",
      "Scheme of work linkage",
      "Attendance & daily work",
      "Assessment follow-through",
    ],
    variant: "teacher",
  },
  {
    id: "headteacher-control",
    eyebrow: "Headteacher Control",
    title: "Leadership needs visibility, queues, and real decision control.",
    body:
      "This live control layer reflects the kind of oversight school leaders need: attendance pulse, reports, parent result access, lesson-note review, and governance discipline from one command center.",
    bullets: [
      "Approval pipeline",
      "Attendance certification",
      "Governance visibility",
      "Result release control",
    ],
    variant: "headteacher",
  },
  {
    id: "parent-trust",
    eyebrow: "Parent Trust",
    title: "Families should receive clarity, not confusion.",
    body:
      "This live parent-facing view shows how EduLife OS can translate school records into simple, supportive insight for the home — helping parents understand progress, needs, and next steps with calm clarity.",
    bullets: [
      "Simple learner summary",
      "Released result visibility",
      "Attendance & wellbeing context",
      "Family-facing guidance",
    ],
    variant: "parent",
  },
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

function screenshotSrc(variant: Variant) {
  if (variant === "teacher") return "/product/teacher-workspace.png";
  if (variant === "headteacher") return "/product/headteacher-control.png";
  return "/product/parent-portal.png";
}

function screenshotLabel(variant: Variant) {
  if (variant === "teacher") return "Live Teacher Workspace";
  if (variant === "headteacher") return "Live Headteacher Control";
  return "Live Parent Portal";
}

function RealProductShot({
  src,
  label,
}: {
  src: string;
  label: string;
}) {
  return (
    <div className="overflow-hidden rounded-[24px] border border-white/10 bg-[#081326] p-3 shadow-[0_20px_70px_rgba(0,0,0,0.32)] sm:rounded-[28px]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-[11px] uppercase tracking-[0.16em] text-[#E8C96A] sm:text-xs">
          {label}
        </div>
        <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-[#D8DDE7]">
          Demonstrated Product
        </div>
      </div>

      <div className="overflow-hidden rounded-[18px] border border-white/8 bg-[#0C1730] sm:rounded-[22px]">
        <Image
          src={src}
          alt={label}
          width={1600}
          height={1000}
          className="h-auto w-full object-cover transition duration-500 hover:scale-[1.01]"
          priority={false}
        />
      </div>
    </div>
  );
}

export default function ProductShowcase() {
  const reduceMotion = useReducedMotion();
  const [activeMobile, setActiveMobile] = useState<Variant>("teacher");

  const mobileItem =
    showcaseItems.find((item) => item.variant === activeMobile) ?? showcaseItems[0];

  return (
    <section className="bg-[#07111F] py-14 sm:py-16 lg:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div {...fadeUp(0)} className="max-w-3xl">
          <div className="text-xs uppercase tracking-[0.2em] text-[#E8C96A]">
            Product Showcase
          </div>
          <h2 className="mt-4 text-2xl font-semibold sm:text-4xl lg:text-5xl">
            Real product views for real school operations.
          </h2>
          <p className="mt-5 text-sm leading-7 text-[#C9CDD6] sm:text-base sm:leading-8">
            EduLife OS is being shaped around actual school workflows — teacher execution,
            leadership oversight, and parent-facing trust — not abstract software promises.
          </p>
        </motion.div>

        {/* Mobile compact mode */}
        <div className="mt-8 lg:hidden">
          <div className="flex flex-wrap gap-3">
            {showcaseItems.map((item) => {
              const active = item.variant === activeMobile;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveMobile(item.variant)}
                  className={`rounded-full border px-4 py-2 text-sm transition ${
                    active
                      ? "border-[#E8C96A]/30 bg-[linear-gradient(135deg,#D4AF37,#E8C96A)] text-[#071A3D]"
                      : "border-white/10 bg-white/5 text-[#F7F4ED]"
                  }`}
                >
                  {item.eyebrow}
                </button>
              );
            })}
          </div>

          <div className="mt-6 space-y-5">
            <RealProductShot
              src={screenshotSrc(mobileItem.variant)}
              label={screenshotLabel(mobileItem.variant)}
            />

            <div className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-5">
              <div className="text-xs uppercase tracking-[0.18em] text-[#E8C96A]">
                {mobileItem.eyebrow}
              </div>
              <h3 className="mt-3 text-xl font-semibold">{mobileItem.title}</h3>
              <p className="mt-4 text-sm leading-7 text-[#C9CDD6]">{mobileItem.body}</p>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {mobileItem.bullets.map((bullet) => (
                  <div
                    key={bullet}
                    className="rounded-2xl border border-white/8 bg-white/5 px-4 py-3 text-sm text-[#D9DEE8]"
                  >
                    {bullet}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Desktop full mode */}
        <div className="mt-12 hidden space-y-14 lg:block">
          {showcaseItems.map((item, idx) => (
            <motion.div
              key={item.id}
              {...fadeUp(0.06 * idx)}
              className={`grid items-center gap-8 lg:grid-cols-2 ${
                idx % 2 === 1
                  ? "lg:[&>*:first-child]:order-2 lg:[&>*:last-child]:order-1"
                  : ""
              }`}
            >
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-[#E8C96A]">
                  {item.eyebrow}
                </div>
                <h3 className="mt-4 text-2xl font-semibold sm:text-4xl">
                  {item.title}
                </h3>
                <p className="mt-5 text-sm leading-8 text-[#C9CDD6] sm:text-base">
                  {item.body}
                </p>

                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  {item.bullets.map((bullet) => (
                    <div
                      key={bullet}
                      className="rounded-2xl border border-white/8 bg-white/5 px-4 py-3 text-sm text-[#D9DEE8]"
                    >
                      {bullet}
                    </div>
                  ))}
                </div>
              </div>

              <motion.div whileHover={reduceMotion ? {} : { y: -4 }}>
                <RealProductShot
                  src={screenshotSrc(item.variant)}
                  label={screenshotLabel(item.variant)}
                />
              </motion.div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}