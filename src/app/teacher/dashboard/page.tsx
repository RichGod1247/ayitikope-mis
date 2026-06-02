// src/app/teacher/dashboard/page.tsx
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function todayStartUtc(): Date {
  const isoDay = new Date().toISOString().slice(0, 10);
  return new Date(`${isoDay}T00:00:00.000Z`);
}

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function normalizeRole(value: unknown) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]/g, "_");
}

export default async function TeacherDashboardPage() {
  const safe = await requireServerUserContext({
    redirectTo: "/teacher/dashboard",
    requireTenant: true,
    requireRoleNames: ["TEACHER", "HEADTEACHER", "SCHOOL_ADMIN", "SUPERADMIN"],
  });

  const me = await prisma.user.findUnique({
    where: { id: safe.userId },
    select: { name: true, email: true },
  });

  const profile = await prisma.teacherProfile.findFirst({
    where: { tenantId: safe.tenantId, userId: safe.userId },
    select: {
      phase: true,
      classLevel: true,
      primaryClassroomId: true,
      primaryClassroom: { select: { id: true, name: true, grade: true, arm: true } },
    },
  });

  const settings = await prisma.tenantSettings.findUnique({
    where: { tenantId: safe.tenantId },
    select: { currentTerm: true, currentAcademicYear: true },
  });

  const primary = profile?.primaryClassroom ?? null;
  const hasPrimary = Boolean(primary?.id);

  const primaryLabel = primary
    ? `${primary.name}${primary.arm ? ` · Arm ${primary.arm}` : ""}`
    : "Unassigned";

  let studentCount = 0;
  let todaysSession:
    | { id: string; isClosed: boolean; closedAt: Date | null; certifiedAt: Date | null }
    | null = null;

  if (hasPrimary) {
    studentCount = await prisma.student.count({
      where: { tenantId: safe.tenantId, classroomId: primary!.id },
    });

    todaysSession = await prisma.attendanceSession.findFirst({
      where: {
        tenantId: safe.tenantId,
        classroomId: primary!.id,
        date: todayStartUtc(),
      },
      select: { id: true, isClosed: true, closedAt: true, certifiedAt: true },
    });
  }

  const attendanceState = !hasPrimary
    ? { label: "Unassigned", tone: "muted" as const }
    : !todaysSession
      ? { label: "Not started", tone: "warn" as const }
      : todaysSession.isClosed
        ? { label: "Closed", tone: "ok" as const }
        : { label: "In progress", tone: "info" as const };

  const toneClass =
    attendanceState.tone === "ok"
      ? "border-emerald-400/25 bg-emerald-500/12 text-emerald-100"
      : attendanceState.tone === "warn"
        ? "border-amber-400/25 bg-amber-500/12 text-amber-100"
        : attendanceState.tone === "info"
          ? "border-sky-400/25 bg-sky-500/12 text-sky-100"
          : "border-white/10 bg-white/5 text-[#C9CDD6]";

  const term = settings?.currentTerm ?? "—";
  const year = settings?.currentAcademicYear ?? "—";

  const normalizedRole = normalizeRole(safe.roleName);
const isTeacherOnly = normalizedRole === "TEACHER";

  const tiles: Array<{
    title: string;
    subtitle: string;
    desc: string;
    pill: string;
    icon: string;
    href: string;
    enabled: boolean;
    grad: string;
    border: string;
    pillCls: string;
    rightNote?: string;
  }> = [
    {
      title: "Lesson Notes",
      subtitle: "Prepare scheme → Draft → Submit → Print",
      desc: "Start from your lesson notes list. Prepare Scheme of Work and manage all lesson notes from one place.",
      pill: "NaCCA-ready",
      icon: "📘",
      href: "/teacher/lesson-notes",
      enabled: true,
      grad: "from-[#0C1730] via-[#10244A] to-[#07111F]",
      border: "border-cyan-300/20",
      pillCls: "border-cyan-300/25 bg-cyan-400/14 text-cyan-100",
    },
    {
      title: "Scheme of Work",
      subtitle: "Weekly plan → Indicators → Studio",
      desc: "View and manage your term scheme. Open a scheme to see week-by-week indicators and jump into Lesson Note Studio fast.",
      pill: "Planning",
      icon: "🗓️",
      href: "/teacher/schemes",
      enabled: true,
      grad: "from-[#1A1034] via-[#231A4B] to-[#0A1120]",
      border: "border-fuchsia-300/20",
      pillCls: "border-fuchsia-300/25 bg-fuchsia-400/14 text-fuchsia-100",
    },
    {
      title: "Assessments & Reports",
      subtitle: "Scores · Insights · Term summaries",
      desc: "Record scores, track performance, and generate term summaries.",
      pill: "Performance",
      icon: "📊",
      href: "/teacher/assessments",
      enabled: true,
      grad: "from-[#271408] via-[#362111] to-[#0C1320]",
      border: "border-amber-300/20",
      pillCls: "border-amber-300/25 bg-amber-400/16 text-amber-100",
      rightNote: "MVP: stub allowed",
    },

    ...(isTeacherOnly
  ? [
      {
        title: "Official Notices",
        subtitle: "Read · Acknowledge · Keep evidence",
        desc: "View official notices sent specifically to you and acknowledge them from the teacher inbox.",
        pill: "Official",
        icon: "📨",
        href: "/teacher/notices",
        enabled: true,
        grad: "from-[#16112E] via-[#211A44] to-[#0C1320]",
        border: "border-violet-300/20",
        pillCls: "border-violet-300/25 bg-violet-400/14 text-violet-100",
      },
    ]
  : []),

    {
      title: "Attendance & Daily Work",
      subtitle: "Fast register + smart follow-ups",
      desc: "Take attendance for your assigned primary class and notify parents safely.",
      pill: attendanceState.label,
      icon: "✅",
      href: "/teacher/attendance",
      enabled: hasPrimary,
      grad: "from-[#0A1F14] via-[#102C1D] to-[#08121C]",
      border: "border-emerald-300/20",
      pillCls:
        attendanceState.tone === "ok"
          ? "border-emerald-300/25 bg-emerald-400/14 text-emerald-100"
          : attendanceState.tone === "warn"
            ? "border-amber-300/25 bg-amber-400/16 text-amber-100"
            : attendanceState.tone === "info"
              ? "border-sky-300/25 bg-sky-400/14 text-sky-100"
              : "border-white/10 bg-white/8 text-[#E5E8EF]",
    },
    {
      title: "Wellbeing & Health",
      subtitle: "Care that’s trackable",
      desc: "Record daily health notes (consent-aware) for your assigned primary class.",
      pill: "Care",
      icon: "🫶",
      href: "/teacher/health",
      enabled: hasPrimary,
      grad: "from-[#251013] via-[#30151B] to-[#0C1320]",
      border: "border-rose-300/20",
      pillCls: "border-rose-300/25 bg-rose-400/14 text-rose-100",
    },
    {
      title: "Communication Support",
      subtitle: "Stay connected with ease",
      desc: "Communication tools and parent messaging shortcuts.",
      pill: "Support",
      icon: "📶",
      href: "/teacher/communications",
      enabled: true,
      grad: "from-[#091C24] via-[#0D2530] to-[#08111C]",
      border: "border-sky-300/20",
      pillCls: "border-sky-300/25 bg-sky-400/14 text-sky-100",
      rightNote: "MVP: stub allowed",
    },
  ];

  const quickAttendanceLabel = todaysSession ? "Continue Attendance" : "Take Attendance";

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(5,7,11,0.92),rgba(7,26,61,0.94),rgba(5,7,11,0.96))] p-5 shadow-[0_26px_90px_rgba(0,0,0,0.28)] md:p-6">
        <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:64px_64px]" />
        <div className="absolute -left-16 top-0 h-48 w-48 rounded-full bg-[#1B66D1]/20 blur-3xl" />
        <div className="absolute right-0 top-0 h-44 w-44 rounded-full bg-[#D4AF37]/14 blur-3xl" />

        <div className="relative flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-[#E8C96A]">EduLife OS · Teacher</p>
            <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-[#F7F4ED] md:text-3xl">
              Welcome{me?.name ? `, ${me.name}` : ""}. 🌿
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-7 text-[#C9CDD6]">
              Calm, fast, and audit-friendly — your teaching workflow, attendance rhythm,
              wellbeing care, and classroom execution in one disciplined workspace.
            </p>
            <p className="mt-1 text-xs text-[#AEB6C4]">{me?.email}</p>
          </div>

          <div className="flex flex-wrap gap-2 text-[11px]">
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 font-medium text-[#F7F4ED]">
              Term: {term}
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 font-medium text-[#F7F4ED]">
              Year: {year}
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 font-medium text-[#F7F4ED]">
              Role: {safe.roleName ?? "TEACHER"}
            </span>
          </div>
        </div>
      </div>

      <section className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-6 shadow-[0_18px_60px_rgba(0,0,0,0.18)] backdrop-blur-xl">
        <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-[#E8C96A]">
          Today at a glance
        </h2>

        <div className="mt-4 grid grid-cols-1 gap-3 text-sm md:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-[#0C1730] p-4">
            <p className="text-xs text-[#8F98A8]">Role</p>
            <p className="mt-2 font-medium text-[#F7F4ED]">{safe.roleName ?? "TEACHER"}</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#0C1730] p-4">
            <p className="text-xs text-[#8F98A8]">Primary Class</p>
            <p className="mt-2 font-medium text-[#F7F4ED]">{primaryLabel}</p>
            {!hasPrimary ? (
              <p className="mt-1 text-xs text-[#C9CDD6]">
                Ask admin to assign you in <span className="font-medium text-[#F7F4ED]">Admin → Teachers</span>.
              </p>
            ) : (
              <p className="mt-1 text-xs text-[#C9CDD6]">{studentCount} student(s)</p>
            )}
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#0C1730] p-4">
            <p className="text-xs text-[#8F98A8]">Academic Context</p>
            <p className="mt-2 font-medium text-[#F7F4ED]">{term}</p>
            <p className="mt-1 text-xs text-[#C9CDD6]">{year}</p>
          </div>

          <div className={cx("rounded-2xl border p-4", toneClass)}>
            <p className="text-xs opacity-80">Attendance</p>
            <p className="mt-2 font-medium">{attendanceState.label}</p>
            {hasPrimary ? (
              <p className="mt-1 text-xs opacity-80">
                {todaysSession?.isClosed ? "Session closed for today." : "Ready when you are."}
              </p>
            ) : (
              <p className="mt-1 text-xs opacity-80">No class assigned yet.</p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-3 pt-4">
          <Link
            href="/teacher/attendance"
            className={cx(
              "rounded-full px-5 py-2.5 text-sm font-semibold transition",
              hasPrimary
                ? "bg-[linear-gradient(135deg,#D4AF37,#E8C96A)] text-[#071A3D] shadow-[0_18px_50px_rgba(212,175,55,0.22)]"
                : "pointer-events-none bg-white/10 text-[#7D8796]"
            )}
          >
            {quickAttendanceLabel}
          </Link>

          <Link
            href="/teacher/health"
            className={cx(
              "rounded-full border px-5 py-2.5 text-sm font-medium transition",
              hasPrimary
                ? "border-white/12 bg-white/5 text-[#F7F4ED] hover:bg-white/10"
                : "pointer-events-none border-white/8 bg-white/5 text-[#7D8796]"
            )}
          >
            Record Health
          </Link>

          <Link
            href="/app"
            className="rounded-full border border-white/12 bg-white/5 px-5 py-2.5 text-sm font-medium text-[#F7F4ED] hover:bg-white/10"
          >
            Portal
          </Link>
        </div>

        <p className="mt-4 text-xs text-[#8F98A8]">
          Option A (shippable): teachers take attendance and record health only for their assigned primary class.
        </p>
      </section>

      <section className="rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-5 shadow-[0_20px_70px_rgba(0,0,0,0.20)] md:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-base font-semibold text-[#F7F4ED] md:text-lg">Your workspace</h2>
            <p className="mt-1 text-xs md:text-sm text-[#C9CDD6]">
              Click a tile to jump straight into work. Hover to dance.
            </p>
          </div>

          {!hasPrimary ? (
            <span className="inline-flex items-center rounded-full border border-amber-300/25 bg-amber-400/12 px-3 py-1 text-[11px] font-semibold text-amber-100">
              Action needed: assign primary class
            </span>
          ) : null}
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {tiles.map((t) => {
            const Card = (
              <div
                className={cx(
                  "group relative overflow-hidden rounded-[28px] border bg-gradient-to-br p-4 shadow-[0_8px_30px_rgba(0,0,0,0.20)]",
                  t.grad,
                  t.border,
                  t.enabled
                    ? "cursor-pointer transition-transform duration-200 ease-out hover:-translate-y-1"
                    : "cursor-not-allowed opacity-60"
                )}
              >
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_36%)]" />
                <div className="relative flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-semibold text-[#F7F4ED]">
                      <span className="text-lg transition-transform duration-200 ease-out group-hover:scale-110 group-hover:rotate-6">
                        {t.icon}
                      </span>
                      {t.title}
                    </div>
                    <div className="mt-1 text-xs text-[#C9CDD6]">{t.subtitle}</div>
                  </div>

                  <div className="text-right">
                    <span
                      className={cx(
                        "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                        t.pillCls
                      )}
                    >
                      {t.pill}
                    </span>
                    {t.rightNote ? (
                      <div className="mt-1 text-[10px] text-[#8F98A8]">{t.rightNote}</div>
                    ) : null}
                  </div>
                </div>

                <p className="relative mt-4 text-xs leading-6 text-[#E1E6EF] md:text-sm">
                  {t.desc}
                </p>

                {!t.enabled ? (
                  <div className="relative mt-3 text-[11px] text-[#C9CDD6]">
                    🔒 Disabled until a primary class is assigned.
                  </div>
                ) : null}

                <div className="pointer-events-none absolute inset-0 rounded-[28px] ring-0 transition group-hover:ring-2 group-hover:ring-white/8" />
              </div>
            );

            return t.enabled ? (
              <Link key={t.title} href={t.href} className="block">
                {Card}
              </Link>
            ) : (
              <div key={t.title}>{Card}</div>
            );
          })}
        </div>
      </section>
    </div>
  );
}