"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import logo from "@/assets/ayitikope-logo.png";

export default function Header() {
  const [open, setOpen] = useState(false);

  const NavLink = ({
    href,
    children,
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <Link
      href={href}
      className="relative px-2 py-1 text-white/90 hover:text-white
                 after:absolute after:left-2 after:right-2 after:-bottom-0.5
                 after:h-[2px] after:scale-x-0 after:bg-white/70
                 after:transition-transform after:duration-200 hover:after:scale-x-100"
    >
      {children}
    </Link>
  );

  return (
    <header className="bg-blue-600 text-white shadow-md">
      <div className="container mx-auto flex items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-3">
          <Image
            src={logo}
            alt="Ayitikope M/A Basic School"
            width={36}
            height={36}
            className="rounded-sm"
          />
          <span className="font-semibold">Ayitikope M/A Basic School</span>
        </Link>

        <nav className="hidden sm:flex items-center gap-6">
          <NavLink href="/">Home</NavLink>
          <NavLink href="/about">About</NavLink>
          <NavLink href="/gallery">Gallery</NavLink>
          <NavLink href="/contact">Contact</NavLink>
        </nav>

        <button
          className="sm:hidden text-white"
          aria-label="Toggle menu"
          onClick={() => setOpen((v) => !v)}
        >
          ☰
        </button>
      </div>

      {open && (
        <div className="sm:hidden border-t border-white/20">
          <div className="container mx-auto px-4 py-2 flex flex-col gap-2">
            <Link href="/" className="text-white/90 hover:text-white" onClick={() => setOpen(false)}>Home</Link>
            <Link href="/about" className="text-white/90 hover:text-white" onClick={() => setOpen(false)}>About</Link>
            <Link href="/gallery" className="text-white/90 hover:text-white" onClick={() => setOpen(false)}>Gallery</Link>
            <Link href="/contact" className="text-white/90 hover:text-white" onClick={() => setOpen(false)}>Contact</Link>
          </div>
        </div>
      )}
    </header>
  );
}
