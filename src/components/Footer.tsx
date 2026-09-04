"use client";

import Image from "next/image";
import Link from "next/link";

const signals = [
  "Teaching Evidence",
  "School Leadership",
  "Governance Oversight",
  "Family Trust",
  "Attendance",
  "Assessment & Work Output",
];

export default function Footer() {
  return (
    <footer className="relative overflow-hidden border-t border-white/10 bg-[linear-gradient(180deg,#07111F_0%,#05070B_78%)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_10%,rgba(14,165,233,0.10),transparent_24%),radial-gradient(circle_at_88%_20%,rgba(212,175,55,0.10),transparent_24%)]" />

      <div className="relative mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar sm:flex-wrap">
          {signals.map((item) => (
            <div
              key={item}
              className="shrink-0 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-[#E5E8EF]"
            >
              {item}
            </div>
          ))}
        </div>

        <div className="mt-9 grid gap-10 lg:grid-cols-[1.25fr_0.8fr_0.8fr_0.9fr]">
          <div>
            <div className="flex items-center gap-3">
              <div className="relative h-12 w-12 overflow-hidden rounded-xl border border-[#E8C96A]/25 bg-white/5">
                <Image src="/edulife-os-logo.png" alt="EduLife OS" fill className="object-contain p-1" />
              </div>
              <div>
                <div className="text-sm font-semibold uppercase tracking-[0.18em] text-[#E8C96A]">
                  EduLife OS
                </div>
                <div className="text-sm text-[#C9CDD6]">Build Minds. Power Futures.</div>
              </div>
            </div>

            <p className="mt-5 max-w-md text-sm leading-7 text-[#C9CDD6]">
              An evidence-led operating system connecting classroom work, school leadership,
              educational governance, and family visibility in one accountable rhythm.
            </p>
          </div>

          <div>
            <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-[#E8C96A]">
              Platform
            </h3>
            <ul className="mt-4 space-y-3 text-sm text-[#C9CDD6]">
              <li><Link href="/#evidence-chain" className="hover:text-white">How it works</Link></li>
              <li><Link href="/#roles" className="hover:text-white">Who it serves</Link></li>
              <li><Link href="/#governance" className="hover:text-white">Governance</Link></li>
              <li><Link href="/#proof" className="hover:text-white">Product proof</Link></li>
              <li><Link href="/#vision" className="hover:text-white">Vision</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-[#E8C96A]">
              Access
            </h3>
            <ul className="mt-4 space-y-3 text-sm text-[#C9CDD6]">
              <li><Link href="/teacher-portal" className="hover:text-white">Teacher Portal</Link></li>
              <li><Link href="/head-portal" className="hover:text-white">Headteacher Portal</Link></li>
              <li><Link href="/parent-portal" className="hover:text-white">Parent Portal</Link></li>
              <li><Link href="/admin-portal" className="hover:text-white">School Admin Portal</Link></li>
              <li><Link href="/auth/signin" className="hover:text-white">Governance Sign In</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-[#E8C96A]">
              Contact
            </h3>
            <ul className="mt-4 space-y-3 text-sm text-[#C9CDD6]">
              <li>Ghana</li>
              <li><a href="mailto:support@edulifeos.com" className="hover:text-white">support@edulifeos.com</a></li>
              <li><a href="tel:0242914353" className="hover:text-white">0242 914 353</a></li>
              <li><Link href="/contact?intent=demo" className="hover:text-white">Book a demo</Link></li>
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-3 border-t border-white/10 pt-6 text-xs text-[#8F98A8] sm:flex-row sm:items-center sm:justify-between">
          <div>© {new Date().getFullYear()} EduLife OS. Built for accountable, future-ready education.</div>

          <nav aria-label="Legal" className="flex flex-wrap gap-x-4 gap-y-2">
            <Link href="/legal/terms" className="hover:text-white">
              Terms of Service
            </Link>
            <Link href="/legal/privacy" className="hover:text-white">
              Privacy Notice
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
