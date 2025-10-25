"use client";

import Image from "next/image";
import Link from "next/link";
import logo from "@/assets/ayitikope-logo.png";

/**
 * Fixed header (always visible), higher than hero (z-[100]),
 * consistent height h-16 so our spacer can match it exactly.
 */
export default function Header() {
  return (
    <header
      className="
        fixed top-0 inset-x-0 h-16 z-[100]
        bg-[--color-brand-500]/95 text-white
        backdrop-blur supports-[backdrop-filter]:bg-[--color-brand-500]/85
        shadow-md
      "
    >
      <div className="container mx-auto h-full px-6">
        <div className="flex items-center justify-between h-full">
          {/* Left: logo + title */}
          <Link href="/" className="flex items-center gap-2">
            <Image
              src={logo}
              alt="Ayitikope M/A Basic School"
              width={36}
              height={36}
              className="rounded-md"
              priority
            />
            <span className="font-semibold hidden sm:inline">
              Ayitikope M/A Basic School
            </span>
          </Link>

          {/* Desktop nav + hover dropdowns */}
          <nav className="hidden md:flex items-stretch gap-2">
            <TopLink href="/">Home</TopLink>

            <Drop title="About">
              <MenuLink href="/about">Overview</MenuLink>
              <MenuLink href="/gallery">Gallery</MenuLink>
              <MenuLink href="/contact">Headteacher’s Office</MenuLink>
            </Drop>

            <Drop title="Academics">
              <MenuLink href="/about">Curriculum Overview</MenuLink>
              <MenuLink href="/gallery">Smart Classrooms</MenuLink>
              <MenuLink href="/gallery">ICT Lab</MenuLink>
            </Drop>

            <Drop title="School Life">
              <MenuLink href="/gallery">Events & Assembly</MenuLink>
              <MenuLink href="/gallery">Awards & Achievements</MenuLink>
              <MenuLink href="/gallery">Campus & Facilities</MenuLink>
            </Drop>

            <TopLink href="/contact">Contact</TopLink>
          </nav>
        </div>
      </div>
    </header>
  );
}

function TopLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="px-3 flex items-center hover:text-[--color-brand-200] relative"
    >
      <span className="underline-anim">{children}</span>
    </Link>
  );
}

function Drop({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="relative group">
      <button className="px-3 h-full flex items-center hover:text-[--color-brand-200]">
        <span className="underline-anim">{title}</span>
      </button>
      <div
        className="
          absolute left-0 mt-2 w-80 rounded-xl bg-white text-gray-900 shadow-xl p-3
          opacity-0 translate-y-1 pointer-events-none
          group-hover:opacity-100 group-hover:translate-y-0 group-hover:pointer-events-auto
          transition
        "
      >
        {children}
      </div>
    </div>
  );
}

function MenuLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="block rounded-lg px-3 py-2 hover:bg-[--color-brand-50] hover:text-[--color-brand-700] transition"
    >
      {children}
    </Link>
  );
}
