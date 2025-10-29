// src/components/Header.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";

type MegaLink = { label: string; href: string };
type MegaCol = { title: string; img?: string; links: MegaLink[] };
type Menu = {
  key: string;
  label: string;
  href: string;
  columns: MegaCol[];
};

const linkBase =
  "relative underline-anim text-blue-50/95 hover:text-white transition-colors";

// ------- MENUS CONFIG -------
const MENUS: Menu[] = [
  {
    key: "about",
    label: "About",
    href: "/about",
    columns: [
      {
        title: "Know Us",
        img: "/logo.png",
        links: [
          { label: "Mission • Vision • Values", href: "/about/mission-vision" },
          { label: "Headteacher’s Welcome", href: "/about/welcome" },
          { label: "History", href: "/about/history" },
          { label: "Governance (SMC/PTA)", href: "/about/governance" },
          { label: "Policies", href: "/about/policies" },
          { label: "School Anthem", href: "/about/anthem" },
          { label: "Campus Map", href: "/about/campus-map" },
        ],
      },
    ],
  },
  {
    key: "academics",
    label: "Academics",
    href: "/academics",
    columns: [
      {
        title: "School Life",
        img: "/academics.png",
        links: [
          { label: "BECE Performance", href: "/academics/bece-performance" },
          { label: "Awards & Achievements", href: "/academics/awards" },
          { label: "Clubs & Societies", href: "/academics/clubs" },
          { label: "Reading Programmes", href: "/academics/reading" },
        ],
      },
      {
        title: "Programmes",
        links: [
          { label: "KG", href: "/academics/kg" },
          { label: "Lower Primary", href: "/academics/lower-primary" },
          { label: "Upper Primary", href: "/academics/upper-primary" },
          { label: "JHS", href: "/academics/jhs" },
        ],
      },
      {
        title: "Resources",
        links: [
          { label: "Digital Library", href: "/library" },
          { label: "Homework Packs", href: "/library/homework" },
          { label: "Research Guides", href: "/library/research-guides" },
        ],
      },
    ],
  },
  {
    key: "admissions",
    label: "Admissions",
    href: "/admissions",
    columns: [
      {
        title: "Start Here",
        img: "/admissions.png",
        links: [
          { label: "Admissions Hub", href: "/admissions" },
         { label: "Apply Online", href: "/admissions" },
          { label: "Key Dates", href: "/admissions/dates" },
          { label: "Fees & Levies", href: "/admissions/fees" },
          { label: "Scholarships", href: "/admissions/scholarships" },
          { label: "FAQ", href: "/admissions/faq" },
        ],
      },
      {
        title: "Entry Requirements",
        links: [
          { label: "Overview", href: "/admissions/entry" },
          { label: "KG", href: "/admissions/entry#kg" },
          { label: "Lower Primary", href: "/admissions/entry#lower" },
          { label: "Upper Primary", href: "/admissions/entry#upper" },
          { label: "JHS", href: "/admissions/entry#jhs" },
        ],
      },
      {
        title: "Prospectus",
        links: [
          { label: "View Prospectus", href: "/admissions/prospectus" },
          { label: "Pay Fees", href: "/admissions/fees#pay" },
        ],
      },
    ],
  },
  {
    key: "media",
    label: "Media & Press",
    href: "/media",
    columns: [
      {
        title: "Social Media",
        img: "/director.png",
        links: [
          { label: "Facebook", href: "/media/social#facebook" },
          { label: "Instagram", href: "/media/social#instagram" },
          { label: "Twitter/X", href: "/media/social#twitter" },
          { label: "YouTube", href: "/media/social#youtube" },
        ],
      },
      {
        title: "News",
        links: [
          { label: "Latest News", href: "/news" },
          { label: "Top Stories", href: "/news/top" },
          { label: "Archive", href: "/news/archive" },
        ],
      },
      {
        title: "Events",
        links: [
          { label: "Announcements", href: "/events#announcements" },
          { label: "Press Releases", href: "/events#press" },
          { label: "Event Calendar", href: "/events#calendar" },
          { label: "Support (NGOs/Donations)", href: "/events#support" },
        ],
      },
    ],
  },
  {
    key: "library",
    label: "Library & Learning",
    href: "/library",
    columns: [
      {
        title: "Digital Library",
        img: "/library.png",
        links: [
          { label: "Textbooks & Notes", href: "/library/textbooks" },
          { label: "Reading Lists", href: "/library/reading-lists" },
        ],
      },
      {
        title: "Exam / BECE Prep",
        links: [
          { label: "Past Questions (Objective)", href: "/library/past-questions#objective" },
          { label: "Past Questions (Subjective)", href: "/library/past-questions#subjective" },
          { label: "Analytics by Strand/Indicator", href: "/library/analytics" },
          { label: "Ask a Teacher", href: "/library/ask" },
        ],
      },
      {
        title: "Learning Packs",
        links: [
          { label: "Homework Packs", href: "/library/homework" },
          { label: "Research Guides (Age-Graded)", href: "/library/research-guides" },
        ],
      },
    ],
  },
  {
    key: "community",
    label: "Community",
    href: "/community",
    columns: [
      {
        title: "Connect",
        img: "/community.png",
        links: [
          { label: "PTA", href: "/community/pta" },
          { label: "Alumni", href: "/community/alumni" },
          { label: "Partners / NGOs", href: "/community/partners" },
          { label: "School Farm / Projects", href: "/community/projects" },
          { label: "Volunteer / Donations", href: "/community/volunteer" },
        ],
      },
      {
        title: "Gallery",
        links: [
          { label: "Staff Gallery", href: "/gallery/staff" },
          { label: "Students Gallery", href: "/gallery/students" },
          { label: "SMC/PTA Gallery", href: "/gallery/smc-pta" },
          { label: "Alumni Gallery", href: "/gallery/alumni" },
          { label: "MEO Gallery", href: "/gallery/meo" },
        ],
      },
      {
        title: "News & Events",
        links: [
          { label: "News", href: "/news" },
          { label: "Events", href: "/events" },
        ],
      },
    ],
  },
  {
    key: "portals",
    label: "Portals",
    href: "/portals",
    columns: [
      {
        title: "User Portals",
        img: "/portal.png",
        links: [
          { label: "Teachers’ Portal", href: "/teacher-portal" },
          { label: "Parents’ Portal", href: "/parent-portal" },
          { label: "Students’ Portal", href: "/student-portal" },
        ],
      },
      {
        title: "Administration",
        links: [
          { label: "Headteacher’s Portal", href: "/head-portal" },
          { label: "SMC/PTA Portal", href: "/smc-pta-portal" },
          { label: "Admin Portal", href: "/admin-portal" },
        ],
      },
      {
        title: "Payments",
        links: [
          { label: "Fees & Levies", href: "/admissions/fees" },
          { label: "Pay Now", href: "/admissions/fees#pay" },
        ],
      },
    ],
  },
];

// ------- Mega UI (bigger images ~4cm and smart panel sizing) -------
function MegaImage({ src, alt }: { src?: string; alt: string }) {
  if (!src) return null;
  // ~4cm ≈ 152px at 96dpi
  return (
    <div className="mb-3 overflow-hidden rounded-2xl border w-[152px] h-[152px] shadow-sm group-hover:shadow-md transition-all">
      <Image
        src={src}
        alt={alt}
        width={152}
        height={152}
        className="w-[152px] h-[152px] object-cover object-center transition-transform duration-300 group-hover:scale-[1.05]"
      />
    </div>
  );
}

function MegaColView({ col }: { col: MegaCol }) {
  return (
    <div className="min-w-[220px] group">
      <MegaImage src={col.img} alt={col.title} />
      <div className="font-semibold text-gray-800">{col.title}</div>
      <ul className="mt-2 space-y-1">
        {col.links.map((l, idx) => (
  <li key={`${col.title}-${l.label}-${l.href}-${idx}`}>
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

function MegaPanel({ menu, onClose }: { menu: Menu; onClose: () => void }) {
  // Determine columns and width based on how many columns this menu has
  const count = menu.columns.length;
  const colClass =
    count >= 3
      ? "grid-cols-1 sm:grid-cols-3"
      : count === 2
      ? "grid-cols-1 sm:grid-cols-2"
      : "grid-cols-1";

  const widthClass =
    count >= 3 ? "w-[980px]" : count === 2 ? "w-[820px]" : "w-[560px]";

  return (
    <div
      role="menu"
      aria-label={`${menu.label} panel`}
      className={`absolute left-1/2 -translate-x-1/2 mt-4 ${widthClass} max-w-[92vw] rounded-lg bg-white p-6 shadow-2xl border z-60`}
      onMouseLeave={onClose}
    >
      <div className={`grid ${colClass} gap-6`}>
        {menu.columns.map((c) => (
          <MegaColView key={`${menu.key}-${c.title}`} col={c} />
        ))}
      </div>
    </div>
  );
}

// ------- Header -------
export default function Header() {
  const [open, setOpen] = useState<string | null>(null);
  const closeLater = () => setTimeout(() => setOpen(null), 150);

  return (
    <header className="sticky top-0 z-50 bg-[#0a55c3] shadow">
      <div className="container mx-auto flex items-center justify-between px-4 sm:px-6 py-2.5">
        {/* Logo + Title */}
        <Link href="/" className="flex items-center gap-3">
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
          <Link href="/" className={linkBase}>
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
                className={linkBase}
                aria-haspopup="true"
                aria-expanded={open === m.key}
              >
                {m.label}
              </Link>
              {open === m.key && <MegaPanel menu={m} onClose={() => setOpen(null)} />}
            </div>
          ))}

          <Link href="/contact" className={linkBase}>
            Contact
          </Link>
        </nav>
      </div>
    </header>
  );
}
