// src/app/teacher/dashboard/page.tsx
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function todayStartUtc(): Date {
  const isoDay = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return new Date(`${isoDay}T00:00:00.000Z`);
}

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export default async function TeacherDashboardPage() {
  // ✅ Bank-grade portal boundary:
  // Only TEACHER role can access /teacher/*
  // This check is DB-backed via requireServerUserContext() (ACTIVE membership + role).
  const safe = await requireServerUserContext({
    redirectTo: "/teacher/dashboard",
    requireTenant: true,
    requireRoleNames: ["TEACHER", "HEADTEACHER", "SCHOOL_ADMIN", "SUPERADMIN"],
  });

  // ✅ IMPORTANT: sequential Prisma queries (avoid Promise.all) to reduce pool pressure
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
      ? "bg-emerald-50 border-emerald-200 text-emerald-900"
      : attendanceState.tone === "warn"
        ? "bg-amber-50 border-amber-200 text-amber-900"
        : attendanceState.tone === "info"
          ? "bg-blue-50 border-blue-200 text-blue-900"
          : "bg-zinc-50 border-zinc-200 text-zinc-700";

  const term = settings?.currentTerm ?? "—";
  const year = settings?.currentAcademicYear ?? "—";

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
      grad: "from-emerald-50 to-white",
      border: "border-emerald-200",
      pillCls: "bg-emerald-100 text-emerald-900 border-emerald-200",
    },
    {
      title: "Assessments & Reports",
      subtitle: "Scores · Insights · Term summaries",
      desc: "Record scores, track performance, and generate term summaries.",
      pill: "Performance",
      icon: "📊",
      href: "/teacher/assessments",
      enabled: true,
      grad: "from-indigo-50 to-white",
      border: "border-indigo-200",
      pillCls: "bg-indigo-100 text-indigo-900 border-indigo-200",
      rightNote: "MVP: stub allowed",
    },
    {
      title: "Attendance & Daily Work",
      subtitle: "Fast register + smart follow-ups",
      desc: "Take attendance for your assigned primary class and notify parents safely.",
      pill: attendanceState.label,
      icon: "✅",
      href: "/teacher/attendance",
      enabled: hasPrimary,
      grad: "from-sky-50 to-white",
      border: "border-sky-200",
      pillCls:
        attendanceState.tone === "ok"
          ? "bg-emerald-100 text-emerald-950 border-emerald-200"
          : attendanceState.tone === "warn"
            ? "bg-amber-100 text-amber-950 border-amber-200"
            : attendanceState.tone === "info"
              ? "bg-blue-100 text-blue-950 border-blue-200"
              : "bg-zinc-100 text-zinc-900 border-zinc-200",
    },
    {
      title: "Curriculum Explorer",
      subtitle: "Strands → Indicators → Exemplars",
      desc: "Browse official curriculum details for accurate planning.",
      pill: "Official",
      icon: "🧭",
      href: "/teacher/curriculum",
      enabled: true,
      grad: "from-zinc-50 to-white",
      border: "border-zinc-200",
      pillCls: "bg-zinc-100 text-zinc-900 border-zinc-200",
    },
    {
      title: "Wellbeing & Health",
      subtitle: "Care that’s trackable",
      desc: "Record daily health notes (consent-aware) for your assigned primary class.",
      pill: "Care",
      icon: "🫶",
      href: "/teacher/health",
      enabled: hasPrimary,
      grad: "from-rose-50 to-white",
      border: "border-rose-200",
      pillCls: "bg-rose-100 text-rose-900 border-rose-200",
    },
    {
      title: "Communication Support",
      subtitle: "Stay connected with ease",
      desc: "Communication tools and parent messaging shortcuts.",
      pill: "Support",
      icon: "📶",
      href: "/teacher/communications",
      enabled: true,
      grad: "from-amber-50 to-white",
      border: "border-amber-200",
      pillCls: "bg-amber-100 text-amber-950 border-amber-200",
      rightNote: "MVP: stub allowed",
    },
  ];

  const quickAttendanceLabel = todaysSession ? "Continue Attendance" : "Take Attendance";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-3xl border border-sky-100 bg-gradient-to-b from-sky-50 via-white to-white p-5 md:p-6">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-sky-700">EduLife OS · Teacher</p>
            <h1 className="mt-1 text-2xl md:text-3xl font-extrabold tracking-tight text-sky-950">
              Welcome{me?.name ? `, ${me.name}` : ""}. 🌿
            </h1>
            <p className="mt-1 text-sm text-slate-700">
              Calm, fast, and audit-friendly — everything you need in one place.
            </p>
            <p className="mt-1 text-xs text-zinc-500">{me?.email}</p>
          </div>

          <div className="flex flex-wrap gap-2 text-[11px]">
            <span className="inline-flex items-center rounded-full bg-white border border-sky-100 px-3 py-1 font-medium text-sky-900">
              Term: {term}
            </span>
            <span className="inline-flex items-center rounded-full bg-white border border-sky-100 px-3 py-1 font-medium text-sky-900">
              Year: {year}
            </span>
            <span className="inline-flex items-center rounded-full bg-white border border-sky-100 px-3 py-1 font-medium text-sky-900">
              Role: {safe.roleName ?? "TEACHER"}
            </span>
          </div>
        </div>
      </div>

      {/* Today at a glance */}
      <section className="rounded-2xl border bg-white p-6 space-y-4">
        <h2 className="text-sm font-semibold text-zinc-900">Today at a glance</h2>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
          <div className="rounded-xl border bg-zinc-50 p-4">
            <p className="text-xs text-zinc-500">Role</p>
            <p className="mt-1 font-medium text-zinc-900">{safe.roleName ?? "TEACHER"}</p>
          </div>

          <div className="rounded-xl border bg-zinc-50 p-4">
            <p className="text-xs text-zinc-500">Primary Class</p>
            <p className="mt-1 font-medium text-zinc-900">{primaryLabel}</p>
            {!hasPrimary ? (
              <p className="text-xs text-zinc-600 mt-1">
                Ask admin to assign you in <span className="font-medium">Admin → Teachers</span>.
              </p>
            ) : (
              <p className="text-xs text-zinc-600 mt-1">{studentCount} student(s)</p>
            )}
          </div>

          <div className="rounded-xl border bg-zinc-50 p-4">
            <p className="text-xs text-zinc-500">Academic Context</p>
            <p className="mt-1 font-medium text-zinc-900">{term}</p>
            <p className="text-xs text-zinc-600 mt-1">{year}</p>
          </div>

          <div className={cx("rounded-xl border p-4", toneClass)}>
            <p className="text-xs opacity-80">Attendance</p>
            <p className="mt-1 font-medium">{attendanceState.label}</p>
            {hasPrimary ? (
              <p className="text-xs opacity-80 mt-1">
                {todaysSession?.isClosed ? "Session closed for today." : "Ready when you are."}
              </p>
            ) : (
              <p className="text-xs opacity-80 mt-1">No class assigned yet.</p>
            )}
          </div>
        </div>

        <div className="pt-2 flex flex-wrap gap-3">
          <Link
            href="/teacher/attendance"
            className={cx(
              "rounded-xl px-4 py-2 text-sm",
              hasPrimary ? "bg-black text-white" : "bg-zinc-200 text-zinc-500 pointer-events-none"
            )}
          >
            {quickAttendanceLabel}
          </Link>

          <Link
            href="/teacher/health"
            className={cx(
              "rounded-xl px-4 py-2 text-sm",
              hasPrimary ? "border bg-white" : "bg-zinc-200 text-zinc-500 pointer-events-none"
            )}
          >
            Record Health
          </Link>

          <Link href="/app" className="rounded-xl border bg-white px-4 py-2 text-sm">
            Portal
          </Link>
        </div>

        <p className="text-xs text-zinc-500">
          Option A (shippable): teachers take attendance and record health only for their assigned primary class.
        </p>
      </section>

      {/* Tiles grid */}
      <section className="rounded-3xl border border-zinc-200 bg-white p-5 md:p-6">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <h2 className="text-base md:text-lg font-semibold text-slate-900">Your workspace</h2>
            <p className="mt-1 text-xs md:text-sm text-slate-600">
              Click a tile to jump straight into work. Hover to “dance”.
            </p>
          </div>
          {!hasPrimary ? (
            <span className="inline-flex items-center rounded-full bg-amber-50 text-amber-950 border border-amber-200 px-3 py-1 text-[11px] font-semibold">
              Action needed: assign primary class
            </span>
          ) : null}
        </div>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {tiles.map((t) => {
            const Card = (
              <div
                className={cx(
                  "group relative rounded-3xl border bg-gradient-to-b p-4 shadow-[0_1px_6px_rgba(15,23,42,0.06)]",
                  t.grad,
                  t.border,
                  t.enabled
                    ? "cursor-pointer transition-transform duration-200 ease-out hover:-translate-y-1 hover:shadow-md"
                    : "opacity-60 cursor-not-allowed"
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                      <span className="text-lg transition-transform duration-200 ease-out group-hover:scale-110 group-hover:rotate-6">
                        {t.icon}
                      </span>
                      {t.title}
                    </div>
                    <div className="mt-1 text-xs text-slate-600">{t.subtitle}</div>
                  </div>

                  <div className="text-right">
                    <span
                      className={cx(
                        "shrink-0 inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold border",
                        t.pillCls
                      )}
                    >
                      {t.pill}
                    </span>
                    {t.rightNote ? (
                      <div className="mt-1 text-[10px] text-slate-400">{t.rightNote}</div>
                    ) : null}
                  </div>
                </div>

                <p className="mt-3 text-xs md:text-sm text-slate-700 leading-relaxed">{t.desc}</p>

                {!t.enabled ? (
                  <div className="mt-3 text-[11px] text-slate-600">
                    🔒 Disabled until a primary class is assigned.
                  </div>
                ) : null}

                <div className="pointer-events-none absolute inset-0 rounded-3xl ring-0 group-hover:ring-2 group-hover:ring-black/5 transition" />
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
