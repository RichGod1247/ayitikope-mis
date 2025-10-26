// src/components/Header.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";

const linkBase =
  "relative link-underline text-blue-50/95 hover:text-white transition-colors";

type MegaLink = { label: string; href: string };

function MegaCol({
  title,
  img,
  links,
}: {
  title: string;
  img?: string;
  links: MegaLink[];
}) {
  // Make keys unique by combining label+href
  return (
    <div className="min-w-[220px]">
      {img && (
        <div className="mb-3 overflow-hidden rounded-md border">
          <Image
            src={img}
            alt={title}
            width={320}
            height={180}
            className="w-full h-28 object-cover"
          />
        </div>
      )}
      <div className="font-semibold text-gray-800">{title}</div>
      <ul className="mt-2 space-y-1">
        {links.map((l) => (
          <li key={`${l.label}-${l.href}`}>
            <Link
              href={l.href}
              className="text-sm text-gray-700 hover:text-blue-700 transition"
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Header() {
  const [open, setOpen] = useState<string | null>(null);

  const closeLater = () => setTimeout(() => setOpen(null), 150);

  return (
    <header className="sticky top-0 z-50 bg-[#0a55c3] shadow">
      <div className="container mx-auto flex items-center justify-between px-4 sm:px-6 py-2.5">
        {/* logo + title */}
        <Link href="/" className="flex items-center gap-3">
          <Image
            src="/logo.png" // <-- your public/logo.png
            alt="Ayitikope M/A Basic School"
            width={36}
            height={36}
            className="rounded-sm bg-white/90 p-0.5"
          />
          <span className="text-white font-semibold tracking-wide">
            Ayitikope M/A Basic School
          </span>
        </Link>

        {/* top strip links */}
        <nav className="hidden md:flex items-center gap-6">
          <Link href="/" className={linkBase}>
            Home
          </Link>

          {/* ABOUT */}
          <div
            className="relative"
            onMouseEnter={() => setOpen("about")}
            onMouseLeave={closeLater}
          >
            <Link href="/about" className={linkBase}>
              About
            </Link>
            {open === "about" && (
              <div className="absolute left-1/2 -translate-x-1/2 mt-4 w-[900px] max-w-[92vw] rounded-lg bg-white p-6 shadow-2xl border">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                  <MegaCol
                    title="Know Us"
                    img="/gallery/hero-campus.png"
                    links={[
                      { label: "History of the School", href: "/about/history" },
                      { label: "Heads’ Catalog", href: "/about/heads" },
                      { label: "Achievements", href: "/about/achievements" },
                      { label: "Contact", href: "/contact" },
                    ]}
                  />
                  <MegaCol
                    title="Admissions"
                    links={[
                      { label: "Apply Now", href: "/admissions" },
                      { label: "Fees", href: "/about" },
                    ]}
                  />
                  <MegaCol
                    title="School Life"
                    links={[
                      { label: "School Anthem", href: "/anthem" },
                      { label: "Parents’ Portal", href: "/parent-portal" },
                      { label: "Teachers’ Portal", href: "/teacher-portal" },
                    ]}
                  />
                </div>
              </div>
            )}
          </div>

          {/* ACADEMICS */}
          <div
            className="relative"
            onMouseEnter={() => setOpen("academics")}
            onMouseLeave={closeLater}
          >
            <Link href="/about" className={linkBase}>
              Academics
            </Link>
            {open === "academics" && (
              <div className="absolute left-1/2 -translate-x-1/2 mt-4 w-[900px] max-w-[92vw] rounded-lg bg-white p-6 shadow-2xl border">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                  <MegaCol
                    title="Programs"
                    img="/gallery/ict-lab.png"
                    links={[
                      { label: "KG", href: "/about" },
                      { label: "Primary", href: "/about" },
                      { label: "JHS", href: "/about" },
                    ]}
                  />
                  <MegaCol
                    title="Resources"
                    links={[
                      { label: "Student TLRs", href: "/resources/tlrs" },
                      { label: "Teachers’ PLCs", href: "/resources/plc" },
                    ]}
                  />
                  <MegaCol
                    title="Gallery"
                    links={[
                      { label: "Staff Gallery", href: "/gallery" },
                      { label: "Students Gallery", href: "/gallery" },
                      { label: "SMC/PTA Gallery", href: "/gallery" },
                      { label: "Executives Gallery", href: "/gallery" },
                    ]}
                  />
                </div>
              </div>
            )}
          </div>

          {/* ADMISSIONS */}
          <div
            className="relative"
            onMouseEnter={() => setOpen("admissions")}
            onMouseLeave={closeLater}
          >
            <Link href="/admissions" className={linkBase}>
              Admissions
            </Link>
            {open === "admissions" && (
              <div className="absolute left-1/2 -translate-x-1/2 mt-4 w-[750px] max-w-[92vw] rounded-lg bg-white p-6 shadow-2xl border">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <MegaCol
                    title="Start Here"
                    links={[
                      { label: "How to Apply", href: "/admissions" },
                      { label: "Fees & Support", href: "/about" },
                    ]}
                  />
                  <MegaCol
                    title="Portals"
                    links={[
                      { label: "Parents Portal", href: "/parent-portal" },
                      { label: "Teachers Portal", href: "/teacher-portal" },
                    ]}
                  />
                </div>
              </div>
            )}
          </div>

          {/* RESOURCES */}
          <div
            className="relative"
            onMouseEnter={() => setOpen("resources")}
            onMouseLeave={closeLater}
          >
            <Link href="/resources/tlrs" className={linkBase}>
              Resources
            </Link>
            {open === "resources" && (
              <div className="absolute left-1/2 -translate-x-1/2 mt-4 w-[650px] max-w-[92vw] rounded-lg bg-white p-6 shadow-2xl border">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <MegaCol
                    title="Students"
                    links={[
                      { label: "TLRs (by AI)", href: "/resources/tlrs" },
                      { label: "Clubs & Competitions", href: "/about" },
                    ]}
                  />
                  <MegaCol
                    title="Teachers"
                    links={[
                      { label: "PLCs (by AI)", href: "/resources/plc" },
                      { label: "Policies & Guides", href: "/about" },
                    ]}
                  />
                </div>
              </div>
            )}
          </div>

          <Link href="/contact" className={linkBase}>
            Contact
          </Link>
        </nav>
      </div>
    </header>
  );
}
