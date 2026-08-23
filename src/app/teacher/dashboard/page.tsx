// src/app/teacher/dashboard/page.tsx
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";
import OfficialNoticeSummaryCard from "@/components/governance/OfficialNoticeSummaryCard";
import {
  readTeacherHeadteacherAppraisalAssignmentState,
  type TeacherHeadteacherAppraisalAssignmentReadState,
} from "@/lib/appraisals/headteacherFeedbackReadStates";

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

type HeadteacherAppraisalDashboardTile = {
  subtitle: string;
  desc: string;
  pill: string;
  enabled: boolean;
  pillCls: string;
  disabledReason?: string;
};

function buildHeadteacherAppraisalDashboardTile(
  state: TeacherHeadteacherAppraisalAssignmentReadState | null,
): HeadteacherAppraisalDashboardTile {
  switch (state?.state) {
    case "AVAILABLE":
      return {
        subtitle: "Confidential staff feedback is open",
        desc: "Your Headteacher appraisal assignment is ready. Complete the official 34-item form before the response window closes.",
        pill: "Available",
        enabled: true,
        pillCls: "border-emerald-300/25 bg-emerald-400/14 text-emerald-100",
      };
    case "CONTINUE":
      return {
        subtitle: "Continue your confidential response",
        desc: "Some answers are already saved. Continue the official form and finalize it before the response window closes.",
        pill: "Continue",
        enabled: true,
        pillCls: "border-sky-300/25 bg-sky-400/14 text-sky-100",
      };
    case "SUBMITTED_READ_ONLY":
      return {
        subtitle: "Your response is finalized",
        desc: "Your confidential feedback was submitted successfully and is now read-only.",
        pill: "Submitted",
        enabled: true,
        pillCls: "border-indigo-300/25 bg-indigo-400/14 text-indigo-100",
      };
    case "CLOSED":
      return {
        subtitle: "The response window is closed",
        desc: "This Headteacher appraisal assignment is closed. Open it to view the final assignment status.",
        pill: "Closed",
        enabled: true,
        pillCls: "border-amber-300/25 bg-amber-400/14 text-amber-100",
      };
    case "LOCKED":
    default:
      return {
        subtitle: "No authorized request is open",
        desc: "This becomes available only when an authorized Headteacher appraisal request is open.",
        pill: "Locked",
        enabled: false,
        pillCls: "border-slate-300/20 bg-white/8 text-slate-200",
        disabledReason: "Awaiting an authorized appraisal request.",
      };
  }
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

  const headteacherAppraisalState = isTeacherOnly
    ? await readTeacherHeadteacherAppraisalAssignmentState({
        actorUserId: safe.userId,
        actorRoleName: safe.roleName,
        tenantId: safe.tenantId,
      })
    : null;

  const headteacherAppraisalTile =
    buildHeadteacherAppraisalDashboardTile(headteacherAppraisalState);

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
    disabledReason?: string;
  }> = [
    {
      title: "Attendance",
      subtitle: "Take today’s register",
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
      title: "Assessment",
      subtitle: "Scores · Insights · Term summaries",
      desc: "Record scores, track performance, and generate term summaries.",
      pill: "Performance",
      icon: "📊",
      href: "/teacher/assessments",
      enabled: true,
      grad: "from-[#271408] via-[#362111] to-[#0C1320]",
      border: "border-amber-300/20",
      pillCls: "border-amber-300/25 bg-amber-400/16 text-amber-100",
    },
    {
      title: "My Appraisal",
      subtitle: "Finalized feedback · Growth map",
      desc: "View finalized appraisal feedback from observed lessons. See section scores, comments, and evidence without editing anything.",
      pill: "Feedback",
      icon: "🧭",
      href: "/teacher/appraisals",
      enabled: true,
      grad: "from-[#101527] via-[#171F3B] to-[#0C1320]",
      border: "border-indigo-300/20",
      pillCls: "border-indigo-300/25 bg-indigo-400/14 text-indigo-100",
    },
    {
      title: "Headteacher Appraisal",
      subtitle: headteacherAppraisalTile.subtitle,
      desc: headteacherAppraisalTile.desc,
      pill: headteacherAppraisalTile.pill,
      icon: "🏫",
      href: "/teacher/headteacher-appraisal",
      enabled: headteacherAppraisalTile.enabled,
      grad: "from-[#101A27] via-[#17283B] to-[#0C1320]",
      border: "border-slate-300/20",
      pillCls: headteacherAppraisalTile.pillCls,
      disabledReason: headteacherAppraisalTile.disabledReason,
    },
    {
      title: "Health",
      subtitle: "Care workflow not yet live",
      desc: "Coming soon. This will be enabled after the health workflow is fully wired and safe for daily use.",
      pill: "Coming soon",
      icon: "🫶",
      href: "/teacher/health",
      enabled: false,
      grad: "from-[#251013] via-[#30151B] to-[#0C1320]",
      border: "border-rose-300/20",
      pillCls: "border-rose-300/25 bg-rose-400/14 text-rose-100",
      disabledReason: "Coming soon — not yet wired for use.",
    },
    {
      title: "Communication",
      subtitle: "Messaging tools not yet live",
      desc: "Coming soon. Parent messaging and communication shortcuts will be enabled after the workflow is fully wired.",
      pill: "Coming soon",
      icon: "📶",
      href: "/teacher/communications",
      enabled: false,
      grad: "from-[#091C24] via-[#0D2530] to-[#08111C]",
      border: "border-sky-300/20",
      pillCls: "border-sky-300/25 bg-sky-400/14 text-sky-100",
      disabledReason: "Coming soon — not yet wired for use.",
    },
  ];

  const quickAttendanceLabel = todaysSession ? "Continue Attendance" : "Take Attendance";

  return (
    <div className="space-y-4">
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

          <div className="flex flex-col items-start gap-3 xl:items-end">
            {isTeacherOnly ? (
              <OfficialNoticeSummaryCard
                href="/teacher/notices"
                portalLabel="Teacher"
                variant="icon"
              />
            ) : null}

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
      </div>

      <section
        data-teacher-glance-ui="bbc-compact-v1"
        className="rounded-[22px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.025))] p-4 shadow-[0_14px_44px_rgba(0,0,0,0.14)] backdrop-blur-xl"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-[#E8C96A]">
            Today at a glance
          </h2>

          <Link
            href="/teacher/attendance"
            className={cx(
              "shrink-0 rounded-full px-4 py-2 text-xs font-semibold transition",
              hasPrimary
                ? "bg-[linear-gradient(135deg,#D4AF37,#E8C96A)] text-[#071A3D] shadow-[0_12px_34px_rgba(212,175,55,0.18)]"
                : "pointer-events-none bg-white/10 text-[#7D8796]",
            )}
          >
            {quickAttendanceLabel}
          </Link>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
          <div className="rounded-xl border border-white/10 bg-[#0C1730]/85 p-3">
            <p className="text-[10px] uppercase tracking-[0.08em] text-[#8F98A8]">Role</p>
            <p className="mt-1 truncate font-semibold text-[#F7F4ED]">
              {safe.roleName ?? "TEACHER"}
            </p>
          </div>

          <div className="rounded-xl border border-white/10 bg-[#0C1730]/85 p-3">
            <p className="text-[10px] uppercase tracking-[0.08em] text-[#8F98A8]">
              Primary class
            </p>
            <p className="mt-1 truncate font-semibold text-[#F7F4ED]">{primaryLabel}</p>
            <p className="mt-0.5 text-[10px] text-[#AEB6C4]">
              {hasPrimary ? `${studentCount} learner(s)` : "Assignment needed"}
            </p>
          </div>

          <div className="rounded-xl border border-white/10 bg-[#0C1730]/85 p-3">
            <p className="text-[10px] uppercase tracking-[0.08em] text-[#8F98A8]">
              Term
            </p>
            <p className="mt-1 font-semibold text-[#F7F4ED]">{term}</p>
            <p className="mt-0.5 text-[10px] text-[#AEB6C4]">{year}</p>
          </div>

          <div className={cx("rounded-xl border p-3", toneClass)}>
            <p className="text-[10px] uppercase tracking-[0.08em] opacity-80">Attendance</p>
            <p className="mt-1 font-semibold">{attendanceState.label}</p>
            <p className="mt-0.5 text-[10px] opacity-80">
              {hasPrimary
                ? todaysSession?.isClosed
                  ? "Done for today"
                  : "Ready"
                : "No class assigned"}
            </p>
          </div>
        </div>
      </section>

      <section data-teacher-workspace-ui="primary-v1" className="rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.09),rgba(255,255,255,0.035))] p-5 shadow-[0_20px_70px_rgba(0,0,0,0.20)] md:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-base font-semibold text-[#F7F4ED] md:text-lg">Your workspace</h2>
            <p className="mt-1 text-xs md:text-sm text-[#C9CDD6]">
              Click a tile to begin today’s work.
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
                    🔒 {t.disabledReason || "Disabled until a primary class is assigned."}
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