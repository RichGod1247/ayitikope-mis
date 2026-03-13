//src/components/RoleSwitchDemo.tsx
"use client";

import { useState } from "react";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "framer-motion";

type RoleKey = "teacher" | "headteacher" | "parent" | "admin";

const roles: Record<
  RoleKey,
  {
    label: string;
    eyebrow: string;
    title: string;
    summary: string;
    stats: string[];
    panels: { title: string; text: string }[];
  }
> = {
  teacher: {
    label: "Teacher",
    eyebrow: "Teacher Workflow",
    title: "Plan, teach, track, and assess without chaos.",
    summary:
      "EduLife OS helps teachers move from scattered paperwork to a disciplined daily workflow tied to lesson notes, schemes, attendance, health, and assessments.",
    stats: [
      "Lesson Note Studio",
      "Scheme alignment",
      "Attendance capture",
      "Assessment workflow",
    ],
    panels: [
      {
        title: "Lesson Notes",
        text: "Prepare structured lesson notes that align with curriculum expectations and school review pipelines.",
      },
      {
        title: "Daily Classroom Flow",
        text: "Mark attendance, capture health signals, and keep classroom records in one connected workflow.",
      },
      {
        title: "Assessment Readiness",
        text: "Turn taught work into trackable assessment actions instead of fragmented teacher memory.",
      },
    ],
  },
  headteacher: {
    label: "Headteacher",
    eyebrow: "Leadership Control",
    title: "Lead the school with clarity, not paperwork.",
    summary:
      "Headteachers gain visibility into approvals, attendance certification, result release control, governance oversight, and risk signals from one disciplined control layer.",
    stats: [
      "Approval queues",
      "Attendance certification",
      "Risk board",
      "Release control",
    ],
    panels: [
      {
        title: "Approval Pipeline",
        text: "Review teacher work with stronger oversight and less chasing across disconnected files and paper.",
      },
      {
        title: "Governance View",
        text: "See school rhythm, weak points, and operational bottlenecks before they become bigger problems.",
      },
      {
        title: "Controlled Release",
        text: "Manage when results and sensitive outputs become visible to parents and school stakeholders.",
      },
    ],
  },
  parent: {
    label: "Parent",
    eyebrow: "Family Trust Loop",
    title: "Give families visibility without confusion.",
    summary:
      "Parents should not be buried in noise. EduLife OS focuses parent access on what truly matters: attendance, health notices, released results, and learner progress.",
    stats: [
      "Attendance snapshot",
      "Released results",
      "Simple access",
      "Progress visibility",
    ],
    panels: [
      {
        title: "What Matters Most",
        text: "Parents see clear signals, not clutter — especially around learner presence, performance, and school communication.",
      },
      {
        title: "Trust by Design",
        text: "Result visibility and school communication happen through controlled, high-trust flows.",
      },
      {
        title: "Family-School Connection",
        text: "The parent portal strengthens accountability without overwhelming less technical users.",
      },
    ],
  },
  admin: {
    label: "School Admin",
    eyebrow: "System Discipline",
    title: "Create order across the whole institution.",
    summary:
      "Admins use EduLife OS to enforce structure across roles, classes, permissions, and operational flows so the platform stays clean, secure, and school-ready.",
    stats: [
      "Tenant structure",
      "Role access control",
      "Classroom setup",
      "Operational oversight",
    ],
    panels: [
      {
        title: "Access Control",
        text: "Roles and permissions are designed to keep sensitive school workflows scoped and disciplined.",
      },
      {
        title: "School Structure",
        text: "Support class organization, portal access, and institutional setup without messy duplication.",
      },
      {
        title: "Execution Backbone",
        text: "The system becomes the operational backbone, not just another school website add-on.",
      },
    ],
  },
};

export default function RoleSwitchDemo() {
  const [active, setActive] = useState<RoleKey>("teacher");
  const reduceMotion = useReducedMotion();
  const role = roles[active];

  return (
    <section id="roles" className="bg-[#07111F] py-14 sm:py-16 lg:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.18 }}
          transition={{ duration: 0.95, ease: [0.22, 1, 0.36, 1] }}
          className="max-w-3xl"
        >
          <div className="text-xs uppercase tracking-[0.2em] text-[#E8C96A]">
            Role-Based Experience
          </div>
          <h2 className="mt-4 text-2xl font-semibold sm:text-4xl lg:text-5xl">
            One platform. Different roles. One disciplined source of truth.
          </h2>
          <p className="mt-5 text-sm leading-7 text-[#C9CDD6] sm:text-base sm:leading-8">
            Switch roles below to see how EduLife OS serves the real people who make a school function.
          </p>
        </motion.div>

        <LayoutGroup>
          <div className="mt-8 flex flex-wrap gap-3 sm:mt-10">
            {(Object.keys(roles) as RoleKey[]).map((key) => {
              const isActive = active === key;

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActive(key)}
                  className={`relative overflow-hidden rounded-full border px-4 py-2.5 text-sm font-medium transition sm:px-5 sm:py-3 ${
                    isActive
                      ? "border-[#E8C96A]/30 text-[#071A3D]"
                      : "border-white/10 bg-white/5 text-[#F7F4ED] hover:bg-white/10"
                  }`}
                >
                  {isActive ? (
                    <motion.span
                      layoutId="role-pill-bg"
                      className="absolute inset-0 bg-[linear-gradient(135deg,#D4AF37,#E8C96A)]"
                      transition={{ type: "spring", stiffness: 260, damping: 24 }}
                    />
                  ) : null}
                  <span className="relative z-10">{roles[key].label}</span>
                </button>
              );
            })}
          </div>
        </LayoutGroup>

        <div className="mt-8 sm:mt-10">
          <AnimatePresence mode="wait">
            <motion.div
              key={active}
              initial={{ opacity: 0, y: 22 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -14 }}
              transition={{
                duration: reduceMotion ? 0 : 0.7,
                ease: [0.22, 1, 0.36, 1],
              }}
              className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:gap-8"
            >
              <div className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.10),rgba(255,255,255,0.04))] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.24)] sm:rounded-[32px] sm:p-7">
                <div className="text-xs uppercase tracking-[0.18em] text-[#E8C96A]">
                  {role.eyebrow}
                </div>
                <h3 className="mt-4 text-2xl font-semibold sm:text-3xl lg:text-4xl">
                  {role.title}
                </h3>
                <p className="mt-5 text-sm leading-7 text-[#C9CDD6] sm:text-base sm:leading-8">
                  {role.summary}
                </p>

                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  {role.stats.map((item, idx) => (
                    <motion.div
                      key={item}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.06 * idx, duration: 0.45 }}
                      className="rounded-2xl border border-white/8 bg-[#0C1730] px-4 py-3 text-sm text-[#D9DEE8]"
                    >
                      {item}
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* Mobile: horizontal snap panels */}
              <div className="flex gap-4 overflow-x-auto pb-2 no-scrollbar lg:hidden">
                {role.panels.map((panel, idx) => (
                  <motion.div
                    key={panel.title}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.08 * idx, duration: 0.5 }}
                    className="min-w-[85%] snap-start rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-5"
                  >
                    <div className="text-sm uppercase tracking-[0.16em] text-[#E8C96A]">
                      {panel.title}
                    </div>
                    <p className="mt-4 text-sm leading-7 text-[#C9CDD6]">
                      {panel.text}
                    </p>
                  </motion.div>
                ))}
              </div>

              {/* Desktop */}
              <div className="hidden gap-5 lg:grid">
                {role.panels.map((panel, idx) => (
                  <motion.div
                    key={panel.title}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.08 * idx, duration: 0.5 }}
                    className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-6"
                  >
                    <div className="text-sm uppercase tracking-[0.16em] text-[#E8C96A]">
                      {panel.title}
                    </div>
                    <p className="mt-4 text-sm leading-7 text-[#C9CDD6]">
                      {panel.text}
                    </p>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}