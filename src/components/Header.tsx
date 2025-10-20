"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";

export default function Header() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    onScroll();
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={[
        "sticky top-0 z-50 transition-colors",
        // solid blue so text is always readable
        scrolled ? "bg-blue-700" : "bg-blue-700",
      ].join(" ")}
    >
      <div className="container mx-auto flex items-center justify-between px-4 sm:px-6 py-2">
        {/* Logo + title */}
        <Link href="/" className="flex items-center gap-2">
          {/* Use /public/logo.png */}
          <Image
            src="/logo.png"
            alt="Ayitikope M/A Basic School"
            width={36}
            height={36}
            className="rounded-md"
            priority
          />
          <span className="text-blue-100 hover:text-white font-semibold tracking-wide whitespace-nowrap">
            Ayitikope M/A Basic School
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-6 text-blue-100">
          <TopLink href="/">Home</TopLink>

          {/* About (mega-lite) */}
          <Mega label="About">
            <MegaCol
              title="Our School"
              links={[
                { title: "About Us", href: "/about" },
                { title: "Gallery", href: "/gallery" },
                { title: "School Anthem", href: "/anthem" },
              ]}
            />
            <MegaCol
              title="Contacts"
              links={[{ title: "Contact", href: "/contact" }]}
            />
          </Mega>

          {/* Academics */}
          <Mega label="Academics">
            <MegaCol
              title="Programmes"
              links={[
                { title: "Basic (Primary/JHS)", href: "/about" },
                { title: "KG & Early Years", href: "/about" },
              ]}
            />
            <MegaCol
              title="Learning"
              links={[
                { title: "Smart Classrooms", href: "/gallery" },
                { title: "ICT Lab", href: "/gallery" },
              ]}
            />
          </Mega>

          {/* Portals */}
          <Mega label="Portals">
            <MegaCol
              title="Sign in"
              links={[
                { title: "Parents Portal", href: "/parent-portal" },
                { title: "Teachers Portal", href: "/teacher-portal" },
              ]}
            />
          </Mega>

          <TopLink href="/contact">Contact</TopLink>
        </nav>

        {/* Mobile hamburger */}
        <button
          onClick={() => setOpen((s) => !s)}
          className="md:hidden inline-flex items-center justify-center rounded-md px-2 py-1 text-blue-100 hover:text-white"
          aria-label="Toggle menu"
        >
          <span className="i-[menu]">☰</span>
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden border-t border-blue-600/50 bg-blue-700">
          <div className="container mx-auto px-4 py-3 space-y-2 text-blue-100">
            <MobileLink href="/">Home</MobileLink>
            <MobileLink href="/about">About</MobileLink>
            <MobileLink href="/gallery">Gallery</MobileLink>
            <MobileLink href="/anthem">School Anthem</MobileLink>
            <MobileLink href="/parent-portal">Parents Portal</MobileLink>
            <MobileLink href="/teacher-portal">Teachers Portal</MobileLink>
            <MobileLink href="/contact">Contact</MobileLink>
          </div>
        </div>
      )}
    </header>
  );
}

function TopLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="relative px-1 py-2 hover:text-white transition-colors"
    >
      {children}
      <span className="absolute left-0 -bottom-0.5 h-0.5 w-0 bg-blue-200 transition-all duration-300 group-hover:w-full" />
    </Link>
  );
}

function Mega({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="group relative">
      <button className="px-1 py-2 text-blue-100 hover:text-white">
        {label}
      </button>
      <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 pt-2 opacity-0 transition group-hover:opacity-100 group-hover:pointer-events-auto">
        <div className="grid grid-cols-2 gap-6 rounded-xl border border-blue-600/50 bg-white text-gray-900 p-5 shadow-2xl w-[520px]">
          {children}
        </div>
      </div>
    </div>
  );
}

function MegaCol({
  title,
  links,
}: {
  title: string;
  links: { title: string; href: string }[];
}) {
  return (
    <div>
      <div className="text-sm font-semibold text-blue-700">{title}</div>
      <ul className="mt-2 space-y-1">
        {links.map((l) => (
          <li key={l.href}>
            <Link
              href={l.href}
              className="text-sm text-gray-700 hover:text-blue-700"
            >
              {l.title}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MobileLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="block rounded-md px-2 py-2 hover:bg-blue-600/50 hover:text-white"
    >
      {children}
    </Link>
  );
}
