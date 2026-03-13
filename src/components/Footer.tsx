//src/components/Footer.tsx
"use client";

import Link from "next/link";
import Image from "next/image";
import { motion, useReducedMotion } from "framer-motion";

const marqueeItems = [
  "Teaching Flow",
  "Leadership Control",
  "Parent Trust",
  "Attendance + Health",
  "Assessment Oversight",
  "Built for Ghana",
];

export default function Footer() {
  const reduceMotion = useReducedMotion();
  const loopItems = [...marqueeItems, ...marqueeItems];

  return (
    <footer className="relative overflow-hidden border-t border-white/10 bg-[#05070B]">
      {/* Ambient motion background */}
      <div className="pointer-events-none absolute inset-0">
        <motion.div
          className="absolute -left-16 top-10 h-72 w-72 rounded-full bg-[#1B66D1]/10 blur-3xl"
          animate={
            reduceMotion
              ? {}
              : {
                  x: [0, 28, 0],
                  y: [0, 22, 0],
                  opacity: [0.16, 0.28, 0.16],
                  scale: [1, 1.06, 1],
                }
          }
          transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
        />

        <motion.div
          className="absolute right-[-4rem] top-0 h-80 w-80 rounded-full bg-[#D4AF37]/10 blur-3xl"
          animate={
            reduceMotion
              ? {}
              : {
                  x: [0, -24, 0],
                  y: [0, 18, 0],
                  opacity: [0.12, 0.22, 0.12],
                  scale: [1, 1.04, 1],
                }
          }
          transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
        />

        <motion.div
          className="absolute bottom-[-5rem] left-1/3 h-72 w-72 rounded-full bg-[#0B3D91]/10 blur-3xl"
          animate={
            reduceMotion
              ? {}
              : {
                  x: [0, 18, 0],
                  y: [0, -20, 0],
                  opacity: [0.12, 0.2, 0.12],
                  scale: [1, 1.05, 1],
                }
          }
          transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
        />

        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(232,201,106,0.06),transparent_30%),radial-gradient(circle_at_bottom,rgba(27,102,209,0.08),transparent_35%)]" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        {/* Premium motion band */}
        <div className="liquid-glass relative overflow-hidden rounded-[28px] border border-white/10 px-5 py-5 sm:px-6">
          <div className="footer-divider mb-4" />

          <div className="grid gap-5 lg:grid-cols-[0.36fr_1fr] lg:items-center">
            <div className="shrink-0">
              <div className="text-xs uppercase tracking-[0.18em] text-[#E8C96A]">
                EduLife OS
              </div>
              <div className="mt-2 text-sm leading-6 text-[#C9CDD6]">
                A disciplined operating system for teaching, leadership, and family trust.
              </div>
            </div>

            <div className="overflow-hidden">
              <div className="footer-marquee-track flex min-w-max items-center gap-4">
                {loopItems.map((item, idx) => (
                  <div
                    key={`${item}-${idx}`}
                    className="flex items-center gap-3 rounded-full border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-[#F7F4ED]"
                  >
                    <span className="inline-flex h-2.5 w-2.5 rounded-full bg-[linear-gradient(135deg,#D4AF37,#E8C96A)] shadow-[0_0_12px_rgba(212,175,55,0.55)]" />
                    <span className="whitespace-nowrap">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="footer-divider mt-4" />
        </div>

        {/* Main footer content */}
        <div className="mt-10 grid gap-10 lg:grid-cols-[1.2fr_0.8fr_0.8fr_0.9fr]">
          <div>
            <div className="flex items-center gap-3">
              <div className="relative h-12 w-12 overflow-hidden rounded-xl border border-[#E8C96A]/25 bg-white/5">
                <Image
                  src="/edulife-os-logo.png"
                  alt="EduLife OS"
                  fill
                  className="object-contain p-1"
                />
              </div>
              <div>
                <div className="text-sm font-semibold uppercase tracking-[0.18em] text-[#E8C96A]">
                  EduLife OS
                </div>
                <div className="text-sm text-[#C9CDD6]">
                  Build Minds. Power Futures.
                </div>
              </div>
            </div>

            <p className="mt-5 max-w-md text-sm leading-7 text-[#C9CDD6]">
              A premium operating system for basic schools — unifying teaching,
              leadership, parent trust, attendance, assessments, and measurable school performance.
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              {[
                "NaCCA-aligned",
                "Role-based access",
                "Parent trust loop",
                "Built for Ghana",
              ].map((item) => (
                <span
                  key={item}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-[#F7F4ED]/90"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-[#E8C96A]">
              Platform
            </h3>
            <ul className="mt-4 space-y-3 text-sm text-[#C9CDD6]">
              <li>
                <Link href="/#platform" className="transition hover:text-white">
                  Why EduLife OS
                </Link>
              </li>
              <li>
                <Link href="/#features" className="transition hover:text-white">
                  Flagship Features
                </Link>
              </li>
              <li>
                <Link href="/#roles" className="transition hover:text-white">
                  Role-based Experience
                </Link>
              </li>
              <li>
                <Link href="/#vision" className="transition hover:text-white">
                  Vision
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-[#E8C96A]">
              Portals
            </h3>
            <ul className="mt-4 space-y-3 text-sm text-[#C9CDD6]">
              <li>
                <Link href="/teacher-portal" className="transition hover:text-white">
                  Teacher Portal
                </Link>
              </li>
              <li>
                <Link href="/parent-portal" className="transition hover:text-white">
                  Parent Portal
                </Link>
              </li>
              <li>
                <Link href="/head-portal" className="transition hover:text-white">
                  Headteacher Portal
                </Link>
              </li>
              <li>
                <Link href="/admin-portal" className="transition hover:text-white">
                  Admin Portal
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-[#E8C96A]">
              Contact
            </h3>
            <ul className="mt-4 space-y-3 text-sm text-[#C9CDD6]">
              <li>Ghana</li>
              <li>
                <a href="mailto:support@edulifeos.com" className="transition hover:text-white">
                  support@edulifeos.com
                </a>
              </li>
              <li>
                <a href="tel:0242914353" className="transition hover:text-white">
                  0242 914 353
                </a>
              </li>
              <li>
                <Link href="/contact?intent=demo" className="transition hover:text-white">
                  Request a demo
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 border-t border-white/10 pt-6 text-xs text-[#8F98A8]">
          © {new Date().getFullYear()} EduLife OS. Built for disciplined, future-ready schools.
        </div>
      </div>
    </footer>
  );
}