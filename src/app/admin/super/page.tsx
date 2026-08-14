import Link from "next/link";

export const dynamic = "force-dynamic";

type SuperTile = {
  title: string;
  desc: string;
  href: string;
  icon: string;
  accent: string;
  border: string;
  pill: string;
  pillCls: string;
};

const primaryTiles: SuperTile[] = [
  {
    title: "Onboarding Applications",
    desc: "Review school, SISSO, and directorate applications, then convert verified demand into official invites.",
    href: "/admin/super/applications",
    icon: "📥",
    accent: "from-[#0C1730] via-[#10244A] to-[#07111F]",
    border: "border-sky-300/20",
    pill: "Demand pipeline",
    pillCls: "border-sky-300/25 bg-sky-400/14 text-sky-100",
  },
  {
    title: "Support Cockpit",
    desc: "Track tenant usage, risk, activity, SMS/outbox health, and operational support signals.",
    href: "/admin/super/support",
    icon: "🧭",
    accent: "from-[#071F18] via-[#0D3B2E] to-[#07111F]",
    border: "border-emerald-300/20",
    pill: "Usage intelligence",
    pillCls: "border-emerald-300/25 bg-emerald-400/14 text-emerald-100",
  },
  {
    title: "All Tenants",
    desc: "Control school lifecycle, sector classification, approvals, suspensions, and platform-wide school visibility.",
    href: "/admin/super/tenants/all",
    icon: "🌍",
    accent: "from-[#1A1034] via-[#231A4B] to-[#0A1120]",
    border: "border-fuchsia-300/20",
    pill: "Tenant registry",
    pillCls: "border-fuchsia-300/25 bg-fuchsia-400/14 text-fuchsia-100",
  },
  {
    title: "Pending Approvals",
    desc: "Approve or reject schools after tenant enrollment before they become active.",
    href: "/admin/super/tenants/pending",
    icon: "🛡️",
    accent: "from-[#271408] via-[#362111] to-[#0C1320]",
    border: "border-amber-300/20",
    pill: "Activation gate",
    pillCls: "border-amber-300/25 bg-amber-400/14 text-amber-100",
  },
  {
    title: "Invite School",
    desc: "Create controlled school bootstrap invites when superadmin wants to onboard directly.",
    href: "/admin/super/tenants/invite",
    icon: "📨",
    accent: "from-[#09223A] via-[#12365C] to-[#07111F]",
    border: "border-cyan-300/20",
    pill: "Direct invite",
    pillCls: "border-cyan-300/25 bg-cyan-400/14 text-cyan-100",
  },
  {
    title: "Governance Officers",
    desc: "Invite, suspend, revoke, restore, and reassign SISSOs, directors, and district officers.",
    href: "/admin/governance/officers",
    icon: "🏛️",
    accent: "from-[#06291F] via-[#0B3D36] to-[#07111F]",
    border: "border-emerald-300/20",
    pill: "Authority control",
    pillCls: "border-emerald-300/25 bg-emerald-400/14 text-emerald-100",
  },
];

const secondaryTiles: SuperTile[] = [
  {
    title: "Safety Controls",
    desc: "Activate or deactivate sensitive platform capabilities through explicit Superadmin safeguards and audit evidence.",
    href: "/admin/super/safety-controls",
    icon: "🛑",
    accent: "from-[#3A1609] via-[#5A2812] to-[#07111F]",
    border: "border-orange-300/20",
    pill: "Human-impact guard",
    pillCls: "border-orange-300/25 bg-orange-400/14 text-orange-100",
  },
  {
    title: "Confidential Identity Audit",
    desc: "Reveal one finalized confidential appraisal respondent only for an authorized purpose with permanent audit evidence.",
    href: "/admin/super/appraisals/confidential-identities",
    icon: "🔐",
    accent: "from-[#2B1022] via-[#4A183B] to-[#07111F]",
    border: "border-pink-300/20",
    pill: "Superadmin only",
    pillCls: "border-pink-300/25 bg-pink-400/14 text-pink-100",
  },
  {
    title: "Public School Application",
    desc: "Copy this link for headteachers to apply through the public onboarding pipeline.",
    href: "/apply/school",
    icon: "🏫",
    accent: "from-[#18230F] via-[#2E3B16] to-[#07111F]",
    border: "border-lime-300/20",
    pill: "Public link",
    pillCls: "border-lime-300/25 bg-lime-400/14 text-lime-100",
  },
  {
    title: "Governance Application",
    desc: "Copy this link for SISSOs, directors, and officers to apply without superadmin retyping.",
    href: "/apply/governance",
    icon: "🪪",
    accent: "from-[#2A1534] via-[#421E55] to-[#07111F]",
    border: "border-purple-300/20",
    pill: "Officer intake",
    pillCls: "border-purple-300/25 bg-purple-400/14 text-purple-100",
  },
];

const governanceDashboards = [
  {
    title: "Director",
    desc: "District command",
    href: "/district/dashboard",
    icon: "🏢",
  },
  {
    title: "SISSO",
    desc: "Circuit command",
    href: "/circuit/dashboard",
    icon: "🧩",
  },
  {
    title: "HOS",
    desc: "Supervision oversight",
    href: "/district/hos/dashboard",
    icon: "🧭",
  },
  {
    title: "BSC",
    desc: "Basic-school coordination",
    href: "/district/bsc/dashboard",
    icon: "🏫",
  },
] as const;

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function SuperTileCard({ tile }: { tile: SuperTile }) {
  return (
    <Link
      href={tile.href}
      className={cx(
        "group relative overflow-hidden rounded-[28px] border bg-gradient-to-br p-5 shadow-[0_12px_36px_rgba(0,0,0,0.20)] transition hover:-translate-y-1",
        tile.accent,
        tile.border,
      )}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_36%)]" />

      <div className="relative flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-[#F7F4ED]">
          <span className="text-lg transition-transform duration-200 ease-out group-hover:scale-110 group-hover:rotate-6">
            {tile.icon}
          </span>
          {tile.title}
        </div>

        <span
          className={cx(
            "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold",
            tile.pillCls,
          )}
        >
          {tile.pill}
        </span>
      </div>

      <p className="relative mt-4 text-sm leading-7 text-[#E1E6EF]">
        {tile.desc}
      </p>

      <div className="relative mt-4 text-[11px] font-semibold text-[#F7F4ED] group-hover:underline">
        Open module
      </div>

      <div className="pointer-events-none absolute inset-0 rounded-[28px] ring-0 transition group-hover:ring-2 group-hover:ring-white/8" />
    </Link>
  );
}

function GovernanceDashboardsCard() {
  return (
    <details className="group relative overflow-hidden rounded-[28px] border border-indigo-300/20 bg-gradient-to-br from-[#151C45] via-[#24336B] to-[#07111F] p-5 shadow-[0_12px_36px_rgba(0,0,0,0.20)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_36%)]" />

      <summary className="relative cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#F7F4ED]">
            <span className="text-lg">🗂️</span>
            Governance Dashboards
          </div>

          <span className="inline-flex items-center rounded-full border border-indigo-300/25 bg-indigo-400/14 px-2.5 py-1 text-[11px] font-semibold text-indigo-100">
            4 views
          </span>
        </div>

        <p className="mt-4 text-sm leading-7 text-[#E1E6EF]">
          Open Director, SISSO, HOS, or BSC command workspaces from one tidy
          governance hub.
        </p>

        <div className="mt-4 flex items-center gap-2 text-[11px] font-semibold text-[#F7F4ED]">
          <span>Open dashboard choices</span>
          <span aria-hidden="true">▾</span>
        </div>
      </summary>

      <div className="relative mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {governanceDashboards.map((dashboard) => (
          <Link
            key={dashboard.href}
            href={dashboard.href}
            className="group/dashboard rounded-2xl border border-white/10 bg-white/5 p-4 transition hover:-translate-y-0.5 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-bold text-white">
                <span className="text-lg">{dashboard.icon}</span>
                {dashboard.title}
              </div>
              <span aria-hidden="true" className="text-sm text-white/70 transition group-hover/dashboard:translate-x-0.5">
                →
              </span>
            </div>

            <p className="mt-2 text-xs font-medium leading-5 text-indigo-100/85">
              {dashboard.desc}
            </p>
          </Link>
        ))}
      </div>
    </details>
  );
}

export default function AdminSuperHome() {
  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(5,7,11,0.92),rgba(7,26,61,0.94),rgba(5,7,11,0.96))] p-5 shadow-[0_26px_90px_rgba(0,0,0,0.28)] md:p-6">
        <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:64px_64px]" />
        <div className="absolute -left-16 top-0 h-48 w-48 rounded-full bg-[#1B66D1]/20 blur-3xl" />
        <div className="absolute right-0 top-0 h-44 w-44 rounded-full bg-[#D4AF37]/14 blur-3xl" />

        <div className="relative">
          <p className="text-xs uppercase tracking-[0.18em] text-[#E8C96A]">
            EduLife OS · Super Admin
          </p>

          <h1 className="mt-2 text-2xl font-semibold text-[#F7F4ED] md:text-3xl">
            Platform control center
          </h1>

          <p className="mt-2 max-w-3xl text-sm leading-7 text-[#C9CDD6]">
            Platform-level controls for inviting schools, governing tenant
            approval, onboarding governance officers, and maintaining
            disciplined visibility across the EduLife OS network.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium text-[#F7F4ED]">
              Tenant governance
            </span>
            <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium text-[#F7F4ED]">
              Invite + approval flow
            </span>
            <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium text-[#F7F4ED]">
              Governance dashboards
            </span>
          </div>
        </div>
      </section>

      <section className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-[0_18px_55px_rgba(15,23,42,0.10)] md:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-950 md:text-lg">
              Super admin modules
            </h2>

            <p className="mt-1 max-w-2xl text-xs font-medium leading-6 text-slate-700 md:text-sm">
              Use these high-control modules to grow the platform without losing
              operational discipline.
            </p>
          </div>

          <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-bold text-emerald-800">
            Protected workspace
          </span>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
          {primaryTiles.map((tile) => (
            <SuperTileCard key={tile.title} tile={tile} />
          ))}

          <GovernanceDashboardsCard />

          {secondaryTiles.map((tile) => (
            <SuperTileCard key={tile.title} tile={tile} />
          ))}
        </div>
      </section>
    </div>
  );
}
