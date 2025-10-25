"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import logo from "@/assets/ayitikope-logo.png"; // or "/logo.png" if it lives in public/

export default function Header() {
  const [open, setOpen] = useState(false);

  return (
    <header className="bg-[--color-brand-600] text-white shadow-lg">
      <div className="container mx-auto px-6 py-3 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3">
          <Image
            src={logo}
            alt="Ayitikope M/A Basic School"
            width={36}
            height={36}
            className="rounded-md"
            priority
          />
          <span className="font-semibold">Ayitikope M/A Basic School</span>
        </Link>

        <nav className="hidden md:flex gap-6">
          <Link href="/" className="hover:underline underline-offset-8">
            Home
          </Link>
          <Link href="/about" className="hover:underline underline-offset-8">
            About
          </Link>
          <Link href="/gallery" className="hover:underline underline-offset-8">
            Gallery
          </Link>
          <Link href="/contact" className="hover:underline underline-offset-8">
            Contact
          </Link>
        </nav>

        <button
          onClick={() => setOpen((v) => !v)}
          className="md:hidden inline-flex items-center gap-2 border border-white/30 px-3 py-1 rounded"
        >
          Menu
        </button>
      </div>

      {open && (
        <div className="md:hidden border-t border-white/10 bg-[--color-brand-700]">
          <div className="container mx-auto px-6 py-3 flex flex-col gap-3">
            <Link href="/" onClick={() => setOpen(false)}>
              Home
            </Link>
            <Link href="/about" onClick={() => setOpen(false)}>
              About
            </Link>
            <Link href="/gallery" onClick={() => setOpen(false)}>
              Gallery
            </Link>
            <Link href="/contact" onClick={() => setOpen(false)}>
              Contact
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
