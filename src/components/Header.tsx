// src/components/Header.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

type MegaLink = { label: string; href: string };
type MegaCol = { title: string; img?: string; links: MegaLink[] };
type Menu = { key: string; label: string; href: string; columns: MegaCol[] };

const linkBase =
  "relative underline-anim text-blue-50/95 hover:text-white transition-colors";

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
          { label: "Apply Online", href: "/admissions/apply" },
          { label: "How to Apply", href: "/admissions/how-to-apply" },
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

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function MegaImage({ src, alt }: { src?: string; alt: string }) {
  if (!src) return null;
  return (
    <div className="mb-3 overflow-hidden rounded-2xl border w-[128px] h-[128px] shadow-sm">
      <Image
        src={src}
        alt={alt}
        width={128}
        height={128}
        className="w-[128px] h-[128px] object-cover object-center transition-transform duration-300 group-hover:scale-[1.03]"
      />
    </div>
  );
}

function MegaColView({ col }: { col: MegaCol }) {
  return (
    <div className="min-w-[200px] group">
      <MegaImage src={col.img} alt={col.title} />
      <div className="font-semibold text-gray-900">{col.title}</div>
      <ul className="mt-2 space-y-1">
        {col.links.map((l, idx) => (
          <li key={`${col.title}-${l.label}-${l.href}-${idx}`}>
            <Link href={l.href} className="text-sm text-gray-700 hover:text-blue-700 transition">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
      <div className="mt-3">
        <Link href={col.links[0]?.href ?? "#"} className="text-xs text-blue-700 hover:underline">
          View more →
        </Link>
      </div>
    </div>
  );
}

type PanelPos = { left: number; top: number; width: number };

function desiredWidth(menu: Menu) {
  const count = menu.columns.length;
  if (count >= 3) return 860;
  if (count === 2) return 680;
  return 500;
}

function MegaPanel({
  menu,
  pos,
  onPointerEnter,
  onPointerLeave,
}: {
  menu: Menu;
  pos: PanelPos | null;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
}) {
  if (!pos) return null;

  const count = menu.columns.length;
  const colClass =
    count >= 3 ? "grid-cols-1 sm:grid-cols-3" : count === 2 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1";

  return (
    <div
      role="menu"
      aria-label={`${menu.label} panel`}
      className="fixed z-[80]"
      style={{ left: pos.left, top: pos.top, width: pos.width }}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      <div className="rounded-2xl bg-white shadow-2xl border ring-1 ring-black/5 overflow-hidden">
        <div className="max-h-[min(70vh,560px)] overflow-y-auto p-5">
          <div className={cx("grid gap-5", colClass)}>
            {menu.columns.map((c) => (
              <MegaColView key={`${menu.key}-${c.title}`} col={c} />
            ))}
          </div>
        </div>

        <div className="border-t px-5 py-3 flex items-center justify-between bg-white">
          <div className="text-xs text-zinc-500">Browse {menu.label} quickly.</div>
          <Link href={menu.href} className="text-sm font-semibold text-blue-700 hover:underline">
            View {menu.label} →
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function Header() {
  const pathname = usePathname();

  const [open, setOpen] = useState<string | null>(null);
  const [panelPos, setPanelPos] = useState<PanelPos | null>(null);

  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileExpanded, setMobileExpanded] = useState<string | null>(null);

  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const anchorRefs = useRef<Record<string, HTMLAnchorElement | null>>({});

  const closeNow = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
    setOpen(null);
    setPanelPos(null);
  };

  const scheduleClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => {
      setOpen(null);
      setPanelPos(null);
    }, 240);
  };

  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };

  useEffect(() => {
    closeNow();
    setMobileOpen(false);
    setMobileExpanded(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        closeNow();
        setMobileOpen(false);
        setMobileExpanded(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeTopLink = useMemo(() => {
    if (!pathname) return "";
    if (pathname === "/") return "/";
    const hit = MENUS.find((m) => pathname.startsWith(m.href));
    if (hit) return hit.href;
    if (pathname.startsWith("/contact")) return "/contact";
    return "";
  }, [pathname]);

  useEffect(() => {
    if (!open) return;

    const menu = MENUS.find((m) => m.key === open);
    const a = anchorRefs.current[open];
    if (!menu || !a) return;

    const pad = 12;

    const compute = () => {
      const rect = a.getBoundingClientRect();
      const vw = window.innerWidth;

      const baseW = desiredWidth(menu);
      const w = Math.min(baseW, Math.floor(vw * 0.92));

      const idealLeft = rect.left + rect.width / 2 - w / 2;
      const left = Math.max(pad, Math.min(idealLeft, vw - w - pad));

      const top = Math.max(8, rect.bottom + 8);

      setPanelPos({ left, top, width: w });
    };

    compute();
    window.addEventListener("resize", compute);
    window.addEventListener("scroll", compute, true);

    return () => {
      window.removeEventListener("resize", compute);
      window.removeEventListener("scroll", compute, true);
    };
  }, [open]);

  return (
    <header className="sticky top-0 z-50 bg-[#0a55c3] shadow">
      <div className="container mx-auto flex items-center justify-between px-4 sm:px-6 py-2.5">
        <Link href="/" className="flex items-center gap-3 min-w-0">
          <Image
            src="/logo.png"
            alt="Ayitikope M/A Basic School"
            width={36}
            height={36}
            className="rounded-sm bg-white/90 p-0.5"
            priority
          />
          <span className="text-white font-semibold tracking-wide truncate">
            Ayitikope M/A Basic School
          </span>
        </Link>

        <div className="md:hidden">
          <button
            type="button"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            className="inline-flex items-center justify-center rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-white active:scale-[0.99]"
            onClick={() => setMobileOpen((v) => !v)}
          >
            <span className="text-lg leading-none">{mobileOpen ? "✕" : "☰"}</span>
          </button>
        </div>

        <nav className="hidden md:flex items-center gap-6" aria-label="Main Navigation">
          <Link href="/" className={cx(linkBase, activeTopLink === "/" && "text-white font-semibold")}>
            Home
          </Link>

          {MENUS.map((m) => (
            <div
              key={m.key}
              className="relative"
              onPointerEnter={() => {
                cancelClose();
                setOpen(m.key);
              }}
              onPointerLeave={scheduleClose}
            >
              <Link
                href={m.href}
                ref={(el) => {
                  anchorRefs.current[m.key] = el;
                }}
                className={cx(linkBase, activeTopLink === m.href && "text-white font-semibold")}
                aria-haspopup="true"
                aria-expanded={open === m.key}
                onFocus={() => setOpen(m.key)}
              >
                {m.label}
              </Link>

              {open === m.key ? <div className="absolute left-0 right-0 top-full h-3" /> : null}

              {open === m.key ? (
                <MegaPanel
                  menu={m}
                  pos={panelPos}
                  onPointerEnter={cancelClose}
                  onPointerLeave={scheduleClose}
                />
              ) : null}
            </div>
          ))}

          <Link
            href="/contact"
            className={cx(linkBase, activeTopLink === "/contact" && "text-white font-semibold")}
          >
            Contact
          </Link>
        </nav>
      </div>

      {/* Mobile “top sheet” (max ~half screen) */}
      {mobileOpen ? (
        <div className="md:hidden">
          <button
            aria-label="Close menu backdrop"
            className="fixed inset-0 z-[70] bg-black/40"
            onClick={() => setMobileOpen(false)}
          />

          <div className="fixed left-0 right-0 top-[56px] z-[80] bg-white border-b shadow-2xl">
            <div className="max-h-[50vh] overflow-y-auto p-3">
              <div className="grid gap-2">
                <Link
                  href="/"
                  className="block rounded-xl border px-3 py-2.5 text-sm font-medium"
                >
                  Home
                </Link>

                {MENUS.map((m) => {
                  const expanded = mobileExpanded === m.key;
                  return (
                    <div key={m.key} className="rounded-2xl border overflow-hidden">
                      <button
                        type="button"
                        className="w-full grid grid-cols-[1fr_auto] items-center gap-2 px-3 py-2.5 text-sm font-medium bg-zinc-50"
                        onClick={() => setMobileExpanded(expanded ? null : m.key)}
                      >
                        <span className="text-left">{m.label}</span>
                        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border bg-white text-base leading-none">
                          {expanded ? "−" : "+"}
                        </span>
                      </button>

                      {expanded ? (
                        <div className="px-3 py-3 space-y-3">
                          <Link href={m.href} className="block text-sm text-blue-700 font-semibold">
                            View {m.label} →
                          </Link>

                          {m.columns.map((col) => (
                            <div key={`${m.key}-${col.title}`} className="border-t pt-3">
                              <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                                {col.title}
                              </div>
                              <div className="mt-2 space-y-2">
                                {col.links.map((l) => (
                                  <Link
                                    key={`${m.key}-${col.title}-${l.href}`}
                                    href={l.href}
                                    className="block text-sm text-zinc-800 hover:text-blue-700"
                                  >
                                    {l.label}
                                  </Link>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })}

                <Link
                  href="/contact"
                  className="block rounded-xl border px-3 py-2.5 text-sm font-medium"
                >
                  Contact
                </Link>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}