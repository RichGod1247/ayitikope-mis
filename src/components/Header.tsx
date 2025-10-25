"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import logo from "@/assets/ayitikope-logo.png";

export default function Header() {
  const [open, setOpen] = useState(false);

  const linkBase =
    "px-3 py-2 rounded-md transition hover:text-[--color-brand-100]";

  const dropLink =
    "block px-4 py-2 text-sm hover:bg-[--color-brand-600] hover:text-white rounded-md";

  return (
    <header className="bg-[--color-brand-600] text-white shadow-lg sticky top-0 z-50">
      <div className="container mx-auto flex items-center justify-between px-4 sm:px-6 py-2">
        {/* Logo + Title */}
        <Link href="/" className="flex items-center gap-3">
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

        {/* Desktop nav with hover dropdowns */}
        <nav className="hidden md:flex items-center gap-2">
          <Link href="/" className={linkBase}>
            Home
          </Link>

          {/* About dropdown */}
          <div className="relative group">
            <button className={linkBase + " flex items-center gap-1"}>
              About <span>▾</span>
            </button>
            <div className="invisible absolute left-0 mt-2 w-52 rounded-lg border bg-white p-2 text-gray-800 opacity-0 shadow-lg transition group-hover:visible group-hover:opacity-100">
              <Link href="/about" className={dropLink}>
                Our Story
              </Link>
              <Link href="/about#leadership" className={dropLink}>
                Leadership
              </Link>
              <Link href="/about#pta" className={dropLink}>
                PTA & Community
              </Link>
            </div>
          </div>

          {/* Academics */}
          <div className="relative group">
            <button className={linkBase + " flex items-center gap-1"}>
              Academics <span>▾</span>
            </button>
            <div className="invisible absolute left-0 mt-2 w-56 rounded-lg border bg-white p-2 text-gray-800 opacity-0 shadow-lg transition group-hover:visible group-hover:opacity-100">
              <Link href="/about#curriculum" className={dropLink}>
                Curriculum
              </Link>
              <Link href="/about#departments" className={dropLink}>
                Departments
              </Link>
              <Link href="/about#timetable" className={dropLink}>
                Timetable
              </Link>
            </div>
          </div>

          {/* Admissions */}
          <div className="relative group">
            <button className={linkBase + " flex items-center gap-1"}>
              Admissions <span>▾</span>
            </button>
            <div className="invisible absolute left-0 mt-2 w-56 rounded-lg border bg-white p-2 text-gray-800 opacity-0 shadow-lg transition group-hover:visible group-hover:opacity-100">
              <Link href="/contact#apply" className={dropLink}>
                How to Apply
              </Link>
              <Link href="/contact#fees" className={dropLink}>
                Fees & Prospectus
              </Link>
            </div>
          </div>

          <Link href="/gallery" className={linkBase}>
            Gallery
          </Link>
          <Link href="/contact" className={linkBase}>
            Contact
          </Link>
        </nav>

        {/* Mobile burger */}
        <button
          className="md:hidden rounded-md px-3 py-2 hover:bg-white/10"
          onClick={() => setOpen((v) => !v)}
          aria-label="Toggle menu"
        >
          ☰
        </button>
      </div>

      {/* Mobile panel */}
      {open && (
        <div className="md:hidden border-t border-white/15 bg-[--color-brand-600]/95">
          <div className="container mx-auto px-4 py-3 space-y-2">
            <Link href="/" className="block" onClick={() => setOpen(false)}>
              Home
            </Link>
            <Link href="/about" className="block" onClick={() => setOpen(false)}>
              About
            </Link>
            <Link href="/gallery" className="block" onClick={() => setOpen(false)}>
              Gallery
            </Link>
            <Link href="/contact" className="block" onClick={() => setOpen(false)}>
              Contact
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
