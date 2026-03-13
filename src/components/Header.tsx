//src/components/Header.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

type PlatformItem = {
  label: string;
  href: string;
  blurb: string;
};

const PLATFORM_ITEMS: PlatformItem[] = [
  {
    label: "Features",
    href: "/#features",
    blurb: "See the flagship workflows powering school discipline and execution.",
  },
  {
    label: "Roles",
    href: "/#roles",
    blurb: "Explore how teachers, leaders, and families interact inside one system.",
  },
  {
    label: "Vision",
    href: "/#vision",
    blurb: "Understand the long-term mission behind EduLife OS.",
  },
];

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function menuImageStyle(src: string) {
  return {
    backgroundImage: `
      linear-gradient(180deg, rgba(5,7,11,0.12), rgba(5,7,11,0.52)),
      url("${src}")
    `,
    backgroundSize: "cover",
    backgroundPosition: "center",
  } as const;
}

export default function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobilePlatformOpen, setMobilePlatformOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname() ?? "/";

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 18);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
    setMobilePlatformOpen(false);
  }, [pathname]);

  return (
    <header
      className={cx(
        "sticky top-0 z-50 border-b border-white/10 backdrop-blur-xl transition-all duration-300",
        scrolled
          ? "bg-[rgba(5,7,11,0.90)] shadow-[0_12px_40px_rgba(0,0,0,0.28)]"
          : "bg-[rgba(5,7,11,0.68)]"
      )}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div
          className={cx(
            "flex items-center justify-between transition-all duration-300",
            scrolled ? "py-2.5" : "py-3.5"
          )}
        >
          <Link href="/" className="flex min-w-0 items-center gap-3">
            <div className="relative h-11 w-11 overflow-hidden rounded-xl border border-[#E8C96A]/30 bg-white/5 shadow-[0_0_30px_rgba(212,175,55,0.10)]">
              <Image
                src="/edulife-os-logo.png"
                alt="EduLife OS"
                fill
                className="object-contain p-1"
                priority
              />
            </div>

            <div className="min-w-0">
              <div className="truncate text-sm font-semibold uppercase tracking-[0.18em] text-[#E8C96A]">
                EduLife OS
              </div>
              <div className="truncate text-xs text-[#C9CDD6]">
                Build Minds. Power Futures.
              </div>
            </div>
          </Link>

          <nav className="hidden items-center gap-5 md:flex">
            {/* Platform */}
            <div className="nav-lamp-group group relative">
              <Link
                href="/#platform"
                className={cx(
                  "nav-lamp-trigger inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium text-[#F7F4ED]/88 transition",
                  pathname === "/" && "text-[#F7F4ED]"
                )}
              >
                <span>Platform</span>
                <svg
                  className="h-4 w-4 transition duration-300 group-hover:rotate-180 group-hover:text-[#E8C96A]"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.51a.75.75 0 0 1-1.08 0l-4.25-4.51a.75.75 0 0 1 .02-1.06Z"
                    clipRule="evenodd"
                  />
                </svg>
              </Link>

              <div className="pointer-events-none invisible absolute left-0 top-full z-[70] pt-4 opacity-0 translate-y-2 transition duration-300 group-hover:pointer-events-auto group-hover:visible group-hover:translate-y-0 group-hover:opacity-100">
                <div className="w-[560px] overflow-hidden rounded-[28px] border border-white/10 bg-[rgba(7,17,31,0.96)] shadow-[0_30px_100px_rgba(0,0,0,0.42)]">
                  <div
                    className="h-52 w-full border-b border-white/10"
                    style={menuImageStyle("/nav/platform-menu.png")}
                  >
                    <div className="flex h-full items-end p-5">
                      <div className="max-w-md">
                        <div className="text-xs uppercase tracking-[0.18em] text-[#E8C96A]">
                          Platform Overview
                        </div>
                        <div className="mt-2 text-lg font-semibold text-[#F7F4ED]">
                          One operating system for teaching quality, leadership control, and parent trust.
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-3 p-4">
                    {PLATFORM_ITEMS.map((item) => (
                      <Link
                        key={item.label}
                        href={item.href}
                        className="nav-submenu-link rounded-[22px] border border-white/8 bg-white/5 px-4 py-4 transition"
                      >
                        <div className="text-sm font-semibold text-[#F7F4ED]">
                          {item.label}
                        </div>
                        <div className="mt-1 text-sm leading-6 text-[#C9CDD6]">
                          {item.blurb}
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Contact */}
            <div className="group relative">
              <Link
                href="/contact"
                className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium text-[#F7F4ED]/88 transition hover:text-white"
              >
                <span>Contact</span>
                <svg
                  className="h-4 w-4 transition duration-300 group-hover:rotate-180 group-hover:text-[#E8C96A]"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.51a.75.75 0 0 1-1.08 0l-4.25-4.51a.75.75 0 0 1 .02-1.06Z"
                    clipRule="evenodd"
                  />
                </svg>
              </Link>

              <div className="pointer-events-none invisible absolute left-0 top-full z-[70] pt-4 opacity-0 translate-y-2 transition duration-300 group-hover:pointer-events-auto group-hover:visible group-hover:translate-y-0 group-hover:opacity-100">
                <div className="w-[340px] overflow-hidden rounded-[26px] border border-white/10 bg-[rgba(7,17,31,0.96)] shadow-[0_24px_80px_rgba(0,0,0,0.40)]">
                  <div
                    className="h-40 w-full border-b border-white/10"
                    style={menuImageStyle("/nav/contact-menu.png")}
                  />
                  <div className="p-5">
                    <div className="text-xs uppercase tracking-[0.16em] text-[#E8C96A]">
                      Contact & Rollout
                    </div>
                    <p className="mt-3 text-sm leading-7 text-[#D9DEE8]">
                      Speak with the EduLife OS team about demos, pilot rollout, and implementation support.
                    </p>
                    <Link
                      href="/contact"
                      className="mt-4 inline-flex items-center rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-[#F7F4ED] transition hover:bg-white/10"
                    >
                      Open Contact
                    </Link>
                  </div>
                </div>
              </div>
            </div>

            {/* Direct links */}
            <Link
              href="/#platform"
              className="rounded-full border border-white/12 bg-white/5 px-4 py-2 text-sm font-medium text-[#F7F4ED] transition hover:bg-white/10"
            >
              Explore Platform
            </Link>

            <Link
              href="/contact?intent=demo"
              className="rounded-full border border-[#E8C96A]/40 bg-[linear-gradient(135deg,#D4AF37,#E8C96A)] px-4 py-2 text-sm font-semibold text-[#071A3D] shadow-[0_12px_30px_rgba(212,175,55,0.24)] transition hover:scale-[1.02]"
            >
              Book a School Demo
            </Link>

            {/* Sign In */}
            <div className="group relative">
              <Link
                href="/auth/signin"
                className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium text-[#F7F4ED]/88 transition hover:text-white"
              >
                <span>Sign In</span>
                <svg
                  className="h-4 w-4 transition duration-300 group-hover:rotate-180 group-hover:text-[#E8C96A]"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.51a.75.75 0 0 1-1.08 0l-4.25-4.51a.75.75 0 0 1 .02-1.06Z"
                    clipRule="evenodd"
                  />
                </svg>
              </Link>

              <div className="pointer-events-none invisible absolute right-0 top-full z-[70] pt-4 opacity-0 translate-y-2 transition duration-300 group-hover:pointer-events-auto group-hover:visible group-hover:translate-y-0 group-hover:opacity-100">
                <div className="w-[340px] overflow-hidden rounded-[26px] border border-white/10 bg-[rgba(7,17,31,0.96)] shadow-[0_24px_80px_rgba(0,0,0,0.40)]">
                  <div
                    className="h-40 w-full border-b border-white/10"
                    style={menuImageStyle("/nav/signin-menu.png")}
                  />
                  <div className="p-5">
                    <div className="text-xs uppercase tracking-[0.16em] text-[#E8C96A]">
                      Secure Access
                    </div>
                    <p className="mt-3 text-sm leading-7 text-[#D9DEE8]">
                      Enter your protected workspace for teaching, leadership, and school operations.
                    </p>
                    <Link
                      href="/auth/signin"
                      className="mt-4 inline-flex items-center rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-[#F7F4ED] transition hover:bg-white/10"
                    >
                      Go to Sign In
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </nav>

          <button
            type="button"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            className="inline-flex items-center justify-center rounded-xl border border-white/12 bg-white/6 px-3 py-2 text-[#F7F4ED] md:hidden"
            onClick={() => setMobileOpen((v) => !v)}
          >
            {mobileOpen ? "✕" : "☰"}
          </button>
        </div>
      </div>

      {mobileOpen ? (
        <div className="border-t border-white/10 bg-[#05070B]/96 md:hidden">
          <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-4 sm:px-6">
            <div className="rounded-2xl border border-white/8 overflow-hidden">
              <button
                type="button"
                className="flex w-full items-center justify-between bg-white/4 px-4 py-3 text-left text-sm font-medium text-[#F7F4ED]"
                onClick={() => setMobilePlatformOpen((v) => !v)}
              >
                <span>Platform</span>
                <span>{mobilePlatformOpen ? "−" : "+"}</span>
              </button>

              {mobilePlatformOpen ? (
                <div className="space-y-2 border-t border-white/8 px-3 py-3">
                  {PLATFORM_ITEMS.map((item) => (
                    <Link
                      key={item.label}
                      href={item.href}
                      className="block rounded-xl border border-white/8 bg-white/4 px-4 py-3 text-sm text-[#F7F4ED]"
                      onClick={() => setMobileOpen(false)}
                    >
                      <div className="font-medium">{item.label}</div>
                      <div className="mt-1 text-xs leading-5 text-[#C9CDD6]">
                        {item.blurb}
                      </div>
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>

            <Link
              href="/contact"
              className="rounded-xl border border-white/8 bg-white/4 px-4 py-3 text-sm text-[#F7F4ED]"
              onClick={() => setMobileOpen(false)}
            >
              Contact
            </Link>

            <Link
              href="/#platform"
              className="rounded-xl border border-white/8 bg-white/4 px-4 py-3 text-sm text-[#F7F4ED]"
              onClick={() => setMobileOpen(false)}
            >
              Explore Platform
            </Link>

            <Link
              href="/contact?intent=demo"
              className="rounded-xl bg-[linear-gradient(135deg,#D4AF37,#E8C96A)] px-4 py-3 text-center text-sm font-semibold text-[#071A3D]"
              onClick={() => setMobileOpen(false)}
            >
              Book a School Demo
            </Link>

            <Link
              href="/auth/signin"
              className="rounded-xl border border-white/8 bg-white/4 px-4 py-3 text-sm text-[#F7F4ED]"
              onClick={() => setMobileOpen(false)}
            >
              Sign In
            </Link>
          </div>
        </div>
      ) : null}
    </header>
  );
}