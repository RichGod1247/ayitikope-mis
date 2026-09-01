"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { label: "How it works", href: "/#evidence-chain" },
  { label: "Who it serves", href: "/#roles" },
  { label: "Governance", href: "/#governance" },
  { label: "Product proof", href: "/#proof" },
  { label: "Vision", href: "/#vision" },
];

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export default function Header() {
  const pathname = usePathname() ?? "/";
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 18);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <header
      className={cx(
        "sticky top-0 z-50 border-b border-white/10 backdrop-blur-xl transition-all duration-300",
        scrolled
          ? "bg-[rgba(5,7,11,0.94)] shadow-[0_16px_48px_rgba(0,0,0,0.32)]"
          : "bg-[rgba(5,7,11,0.76)]",
      )}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className={cx("flex items-center justify-between gap-4", scrolled ? "py-2.5" : "py-3.5")}>
          <Link href="/" className="flex min-w-0 items-center gap-3" aria-label="EduLife OS home">
            <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-xl border border-[#E8C96A]/30 bg-white/5 shadow-[0_0_30px_rgba(212,175,55,0.12)]">
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

          <nav className="hidden items-center gap-1 lg:flex" aria-label="Primary navigation">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-full px-3 py-2 text-sm font-medium text-[#E5E8EF] transition hover:bg-white/7 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8C96A]/50"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="hidden items-center gap-2 md:flex">
            <div className="group relative">
              <Link
                href="/auth/signin"
                className="inline-flex items-center justify-center rounded-full border border-white/12 bg-white/5 px-4 py-2.5 text-sm font-medium text-[#F7F4ED] hover:bg-white/10"
              >
                Sign In
              </Link>

              <div
                aria-hidden="true"
                className="pointer-events-none absolute right-0 top-full z-[80] hidden w-[330px] origin-top-right translate-y-2 scale-[0.985] pt-3 opacity-0 transition-[opacity,transform] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-y-0 group-hover:scale-100 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:scale-100 group-focus-within:opacity-100 lg:block"
              >
                <div className="overflow-hidden rounded-[26px] border border-white/10 bg-[rgba(7,17,31,0.97)] shadow-[0_28px_90px_rgba(0,0,0,0.42)]">
                  <div className="relative h-48 w-full overflow-hidden">
                    <Image
                      src="/nav/signin-menu.png"
                      alt=""
                      fill
                      sizes="330px"
                      className="object-cover"
                    />

                    <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,7,11,0.02)_20%,rgba(5,7,11,0.90)_100%)]" />

                    <div className="absolute inset-x-0 bottom-0 p-5">
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#E8C96A]">
                        Secure Access
                      </div>
                      <div className="mt-2 text-sm leading-6 text-[#F7F4ED]">
                        Enter your protected EduLife OS workspace.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="group relative">
              <Link
                href="/contact?intent=demo"
                className="inline-flex items-center justify-center rounded-full bg-[linear-gradient(135deg,#D4AF37,#E8C96A)] px-4 py-2.5 text-sm font-semibold text-[#071A3D] shadow-[0_14px_40px_rgba(212,175,55,0.20)] hover:brightness-105"
              >
                Book a Demo
              </Link>

              <div
                aria-hidden="true"
                className="pointer-events-none absolute right-0 top-full z-[80] hidden w-[330px] origin-top-right translate-y-2 scale-[0.985] pt-3 opacity-0 transition-[opacity,transform] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-y-0 group-hover:scale-100 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:scale-100 group-focus-within:opacity-100 lg:block"
              >
                <div className="overflow-hidden rounded-[26px] border border-[#E8C96A]/16 bg-[rgba(7,17,31,0.97)] shadow-[0_28px_90px_rgba(0,0,0,0.42)]">
                  <div className="relative h-48 w-full overflow-hidden">
                    <Image
                      src="/nav/contact-menu.png"
                      alt=""
                      fill
                      sizes="330px"
                      className="object-cover"
                    />

                    <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,7,11,0.01)_18%,rgba(5,7,11,0.90)_100%)]" />

                    <div className="absolute inset-x-0 bottom-0 p-5">
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#E8C96A]">
                        Institutional Demo
                      </div>
                      <div className="mt-2 text-sm leading-6 text-[#F7F4ED]">
                        See EduLife OS in the context of your institution.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setMobileOpen((open) => !open)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-[#F7F4ED] md:hidden"
            aria-expanded={mobileOpen}
            aria-label="Toggle navigation"
          >
            <span className="text-lg">{mobileOpen ? "×" : "☰"}</span>
          </button>
        </div>

        {mobileOpen ? (
          <div className="border-t border-white/10 py-4 md:hidden">
            <div className="grid gap-2">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-xl border border-white/8 bg-white/[0.035] px-4 py-3 text-sm font-medium text-[#F7F4ED]"
                >
                  {item.label}
                </Link>
              ))}
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Link
                  href="/auth/signin"
                  className="inline-flex items-center justify-center rounded-xl border border-white/12 bg-white/5 px-4 py-3 text-sm font-medium text-[#F7F4ED]"
                >
                  Sign In
                </Link>
                <Link
                  href="/contact?intent=demo"
                  className="inline-flex items-center justify-center rounded-xl bg-[linear-gradient(135deg,#D4AF37,#E8C96A)] px-4 py-3 text-sm font-semibold text-[#071A3D]"
                >
                  Book a Demo
                </Link>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </header>
  );
}
