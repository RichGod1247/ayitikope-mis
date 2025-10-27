// src/components/Header.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";

type Item = { label: string; href: string };
type Col = { title: string; img?: string; links: Item[] };
type Mega = { key: string; label: string; href: string; cols: Col[] };

// ---------- MENU DATA (edit labels/links later as you add pages) ----------
const MENUS: Mega[] = [
  {
    key: "about",
    label: "About",
    href: "/about",
    cols: [
      {
        title: "Who We Are",
        img: "/gallery/hero-campus.png",
        links: [
          { label: "Mission • Vision • Core Values", href: "/about/mission-vision" },
          { label: "Headteacher’s Welcome", href: "/about/welcome" },
          { label: "School History", href: "/about/history" },
          { label: "Year of Establishment: Primary & JHS", href: "/about/establishment" },
        ],
      },
      {
        title: "Leadership & Governance",
        links: [
          { label: "Headteachers Catalog", href: "/about/headteachers" },
          { label: "SMC / PTA Governance", href: "/about/governance" },
          { label: "Policies", href: "/about/policies" },
          { label: "Campus Map", href: "/about/campus-map" },
        ],
      },
      {
        title: "Culture",
        links: [
          { label: "School Anthem", href: "/about/anthem" },
          { label: "Contact Us", href: "/contact" },
        ],
      },
    ],
  },
  {
    key: "admissions",
    label: "Admissions",
    href: "/admissions",
    cols: [
      {
        title: "Start Here",
        img: "/gallery/awards.png",
        links: [
          { label: "Prospectus", href: "/admissions/prospectus" },
          { label: "Entry Requirements — KG", href: "/admissions/entry/kg" },
          { label: "Entry Requirements — Lower Primary", href: "/admissions/entry/lower-primary" },
          { label: "Entry Requirements — Upper Primary", href: "/admissions/entry/upper-primary" },
          { label: "Entry Requirements — JHS", href: "/admissions/entry/jhs" },
        ],
      },
      {
        title: "Apply & Key Info",
        links: [
          { label: "How to Apply", href: "/admissions/how-to-apply" },
          { label: "Key Dates", href: "/admissions/dates" },
          { label: "Fees & Levies", href: "/admissions/fees" },
          { label: "Scholarships (LEAP / Local NGO)", href: "/admissions/scholarships" },
          { label: "FAQ", href: "/admissions/faq" },
        ],
      },
    ],
  },
  {
    key: "academics",
    label: "Academics",
    href: "/academics",
    cols: [
      {
        title: "Performance & Recognition",
        img: "/gallery/jhs-classroom.png",
        links: [
          { label: "BECE Performance", href: "/academics/bece-performance" },
          { label: "Awards & Achievements", href: "/academics/awards" },
        ],
      },
      {
        title: "School Life",
        links: [
          { label: "Clubs & Societies — Drama", href: "/academics/school-life/clubs/drama" },
          { label: "ICT / Robotics Club", href: "/academics/school-life/clubs/ict-robotics" },
          { label: "Music & Dance", href: "/academics/school-life/clubs/music-dance" },
          { label: "Fashion & Design", href: "/academics/school-life/clubs/fashion-design" },
          { label: "Reading Programmes", href: "/academics/reading-programmes" },
        ],
      },
    ],
  },
  {
    key: "media",
    label: "Media & Press",
    href: "/media",
    cols: [
      {
        title: "Social Media",
        img: "/gallery/ict-lab.png",
        links: [
          { label: "Facebook", href: "/media/social/facebook" },
          { label: "Instagram", href: "/media/social/instagram" },
          { label: "X (Twitter)", href: "/media/social/twitter" },
          { label: "YouTube", href: "/media/social/youtube" },
        ],
      },
      {
        title: "News",
        links: [
          { label: "Latest News", href: "/media/news/latest" },
          { label: "All News", href: "/media/news/all" },
          { label: "Top Stories", href: "/media/news/top" },
          { label: "Archive", href: "/media/news/archive" },
        ],
      },
      {
        title: "Events",
        links: [
          { label: "Announcements", href: "/media/events/announcements" },
          { label: "Press Releases", href: "/media/events/press-releases" },
          { label: "Event Calendar", href: "/media/events/calendar" },
          { label: "Support — NGOs & Donations", href: "/media/events/support" },
        ],
      },
    ],
  },
  {
    key: "library",
    label: "Library & Learning",
    href: "/library",
    cols: [
      {
        title: "Digital Library",
        img: "/gallery/kg-learning.png",
        links: [
          { label: "Textbooks & Notes", href: "/library/digital/textbooks-notes" },
          {
            label:
              "Exam / BECE Prep — Past Questions (auto-scoring + analytics)",
            href: "/library/digital/bece-prep",
          },
          {
            label:
              "Analytics by Strand/Indicator (diagnostic tests)",
            href: "/library/digital/analytics",
          },
        ],
      },
      {
        title: "Study Tools",
        links: [
          { label: "Reading Lists", href: "/library/reading-lists" },
          { label: "Homework Packs", href: "/library/homework-packs" },
          { label: "Research Guides (age-graded)", href: "/library/research-guides" },
          { label: "Ask a Teacher", href: "/library/ask-a-teacher" },
        ],
      },
    ],
  },
  {
    key: "community",
    label: "Community",
    href: "/community",
    cols: [
      {
        title: "Our People",
        img: "/gallery/awards.png",
        links: [
          { label: "PTA", href: "/community/pta" },
          { label: "Alumni", href: "/community/alumni" },
          { label: "Partners / NGOs", href: "/community/partners" },
        ],
      },
      {
        title: "Projects",
        links: [
          { label: "School Farm / Projects", href: "/community/farm-projects" },
          { label: "Volunteer / Donations", href: "/community/volunteer-donations" },
        ],
      },
    ],
  },
  {
    key: "portals",
    label: "Portals",
    href: "/portals",
    cols: [
      {
        title: "User Portals",
        links: [
          { label: "Teachers Portal", href: "/teacher-portal" },
          { label: "Parents / Guardians Portal", href: "/parent-portal" },
          { label: "Students Portal", href: "/student-portal" },
        ],
      },
      {
        title: "Administration",
        links: [
          { label: "Headteacher’s Portal", href: "/headteacher-portal" },
          { label: "SMC / PTA Executives Portal", href: "/smc-pta-portal" },
          { label: "Admin Portal", href: "/admin" },
        ],
      },
    ],
  },
];

// ---------- SMALL BUILDING BLOCKS ----------
function MegaCol({ title, img, links }: Col) {
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
          <li key={`${title}-${l.href}`}>
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

function MegaPanel({ menu, onClose }: { menu: Mega; onClose: () => void }) {
  return (
    <div
      role="dialog"
      aria-label={`${menu.label} menu`}
      className="absolute left-1/2 -translate-x-1/2 mt-4 w-[1000px] max-w-[95vw] rounded-lg bg-white p-6 shadow-2xl border"
      onMouseLeave={onClose}
    >
      <div
        className={`grid gap-6 ${
          menu.cols.length === 2 ? "sm:grid-cols-2" : "sm:grid-cols-3"
        }`}
      >
        {menu.cols.map((c) => (
          <MegaCol key={c.title} {...c} />
        ))}
      </div>
    </div>
  );
}

// ---------- HEADER (Desktop + Mobile) ----------
export default function Header() {
  const [open, setOpen] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const headerRef = useRef<HTMLElement | null>(null);

  // Close on ESC
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(null);
        setMobileOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const closeLater = () => setTimeout(() => setOpen(null), 160);

  return (
    <header
      ref={headerRef}
      className="sticky top-0 z-50 bg-[#0a55c3] shadow"
      role="banner"
    >
      <div className="container mx-auto flex items-center justify-between px-4 sm:px-6 py-2.5">
        {/* Logo + Title */}
        <Link href="/" className="flex items-center gap-3" aria-label="Go to homepage">
          <Image
            src="/logo.png"
            alt="Ayitikope M/A Basic School"
            width={36}
            height={36}
            className="rounded-sm bg-white/90 p-0.5"
            priority
          />
          <span className="text-white font-semibold tracking-wide">
            Ayitikope M/A Basic School
          </span>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-6" aria-label="Main Navigation">
          <Link
            href="/"
            className="relative underline-anim text-blue-50/95 hover:text-white transition-colors"
          >
            Home
          </Link>

          {MENUS.map((m) => (
            <div
              key={m.key}
              className="relative"
              onMouseEnter={() => setOpen(m.key)}
              onMouseLeave={closeLater}
              onFocus={() => setOpen(m.key)}
            >
              <Link
                href={m.href}
                className="relative underline-anim text-blue-50/95 hover:text-white transition-colors"
                aria-haspopup="true"
                aria-expanded={open === m.key}
              >
                {m.label}
              </Link>
              {open === m.key && <MegaPanel menu={m} onClose={() => setOpen(null)} />}
            </div>
          ))}

          <Link
            href="/contact"
            className="relative underline-anim text-blue-50/95 hover:text-white transition-colors"
          >
            Contact
          </Link>
        </nav>

        {/* Mobile Hamburger */}
        <button
          className="md:hidden inline-flex items-center justify-center rounded-md border border-white/30 px-3 py-2 text-white"
          aria-label="Open menu"
          onClick={() => setMobileOpen(true)}
        >
          <span className="sr-only">Open menu</span>
          ☰
        </button>
      </div>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-[60]">
          {/* Backdrop */}
          <button
            aria-label="Close menu"
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileOpen(false)}
          />
          {/* Panel */}
          <div
            className="absolute right-0 top-0 h-full w-[85%] max-w-[420px] bg-white shadow-2xl p-4 overflow-y-auto"
            role="dialog"
            aria-label="Mobile menu"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Image
                  src="/logo.png"
                  alt="Ayitikope M/A Basic School"
                  width={28}
                  height={28}
                  className="rounded-sm"
                />
                <span className="font-semibold">Menu</span>
              </div>
              <button
                className="rounded-md border px-2 py-1 text-sm"
                onClick={() => setMobileOpen(false)}
              >
                Close ✕
              </button>
            </div>

            <div className="space-y-2">
              <Link
                href="/"
                className="block rounded-md px-3 py-2 hover:bg-gray-100"
                onClick={() => setMobileOpen(false)}
              >
                Home
              </Link>

              {MENUS.map((m) => (
                <MobileSection key={m.key} menu={m} onNavigate={() => setMobileOpen(false)} />
              ))}

              <Link
                href="/contact"
                className="block rounded-md px-3 py-2 hover:bg-gray-100"
                onClick={() => setMobileOpen(false)}
              >
                Contact
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

// ---------- Mobile collapsible section ----------
function MobileSection({ menu, onNavigate }: { menu: Mega; onNavigate: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border rounded-lg">
      <button
        className="w-full flex items-center justify-between px-3 py-2"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="font-medium">{menu.label}</span>
        <span>{open ? "−" : "+"}</span>
      </button>

      {open && (
        <div className="px-3 pb-2">
          <Link
            href={menu.href}
            className="block rounded-md px-2 py-1.5 text-sm text-blue-700 hover:bg-blue-50"
            onClick={onNavigate}
          >
            Overview
          </Link>

            {/* Render columns and links in a flat list for mobile */}
            {menu.cols.map((c) => (
              <div key={c.title} className="mt-2">
                <div className="text-xs uppercase tracking-wide text-gray-500">{c.title}</div>
                <ul className="mt-1">
                  {c.links.map((l) => (
                    <li key={l.href}>
                      <Link
                        href={l.href}
                        className="block rounded-md px-2 py-1.5 text-sm hover:bg-gray-100"
                        onClick={onNavigate}
                      >
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
