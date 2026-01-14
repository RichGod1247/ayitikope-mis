// src/components/TeacherDashboardClient.tsx
"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type Snapshot = {
  teacher: { displayName: string; staffId: string | null };
  today: {
    label: string;
    attendance: {
      sessionsTotal: number;
      sessionsClosed: number;
      marksTotal: number;
      present: number;
      absent: number;
      late: number;
      excused: number;
      presentRate: number;
      closureRate: number;
    };
    health: {
      healthTotal: number;
      feverCount: number;
      sentToParentCount: number;
    };
  };
  lessonNotes: {
    term: string;
    academicYear: string;
    availableWeeks: number[];
    selectedWeek: number | null;
    statusCounts: Record<string, number>;
    latest:
      | {
          status: string;
          updatedAt: string | Date;
          submittedAt: string | Date | null;
          reviewedAt: string | Date | null;
          approvedAt: string | Date | null;
          rejectedAt: string | Date | null;
          headteacherComment: string | null;
        }
      | null;
    latestAnnouncement: { title: string; createdAt: string | Date } | null;
  };
  assessments: {
    term: string;
    academicYear: string;
    itemCount: number;
    scoreCount: number;
    avgPct: number;
    bands: { below40: number; between40_54: number; between55_69: number; above70: number };
    topSubjects: { subject: string; count: number }[];
    scopeLabel: string;
  };
};

function fmtPct(v: number) {
  if (!Number.isFinite(v)) return "0%";
  return `${Math.round(v)}%`;
}

function clampPct(v: number) {
  return Math.max(0, Math.min(100, v));
}

function Bar({
  value,
  label,
}: {
  value: number;
  label: string;
}) {
  const w = clampPct(value);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px] text-slate-600">
        <span>{label}</span>
        <span className="font-medium text-slate-800">{fmtPct(w)}</span>
      </div>
      <div className="h-2 w-full rounded-full bg-slate-100">
        <div
          className="h-2 rounded-full bg-sky-600 transition-[width] duration-300"
          style={{ width: `${w}%` }}
        />
      </div>
    </div>
  );
}

function StatPill({ label, value }: { label: string; value: string | number }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-[11px] text-slate-700 shadow-sm">
      <span className="text-slate-500">{label}</span>
      <span className="font-semibold text-slate-900">{value}</span>
    </span>
  );
}

export default function TeacherDashboardClient({
  snapshot,
  tenantId,
  teacherUserId,
  defaultTerm,
  defaultAcademicYear,
  demoClassroomId,
}: {
  snapshot: Snapshot;
  tenantId: string;
  teacherUserId: string;
  defaultTerm: string;
  defaultAcademicYear: string;
  demoClassroomId?: string;
}) {
  const router = useRouter();
  const sp = useSearchParams();

  const hasPortalContext = Boolean(tenantId && teacherUserId);

  const attendanceUrl = hasPortalContext
    ? `/teacher/attendance?tenantId=${encodeURIComponent(tenantId)}&teacherUserId=${encodeURIComponent(
        teacherUserId
      )}`
    : "/teacher/attendance";

  const lessonNotesUrl = hasPortalContext
    ? `/teacher/lesson-notes?tenantId=${encodeURIComponent(tenantId)}&teacherUserId=${encodeURIComponent(
        teacherUserId
      )}`
    : "/teacher/lesson-notes";

  const termDashboardUrl = hasPortalContext
    ? `/teacher/assessment/term-dashboard?tenantId=${encodeURIComponent(
        tenantId
      )}&teacherUserId=${encodeURIComponent(teacherUserId)}${
        demoClassroomId ? `&classroomId=${encodeURIComponent(demoClassroomId)}` : ""
      }&term=${encodeURIComponent(defaultTerm)}&academicYear=${encodeURIComponent(defaultAcademicYear)}`
    : "/teacher/assessment/term-dashboard";

  const curriculumExplorerUrl = "/teacher/curriculum";
  const wellbeingUrl = "/teacher/health";
  const communicationSupportUrl = "/teacher/airtime"; // create later (we won’t reveal internal billing logic)

  const tiles = useMemo(
    () => [
      {
        title: "Lesson Notes Studio",
        desc: "Plan, generate, refine and submit NaCCA-aligned lesson notes with calm confidence.",
        href: lessonNotesUrl,
        badge: "Daily teaching",
        tone: "emerald",
      },
      {
        title: "Assessments & Reports",
        desc: "Record, track and understand learner performance across the term—without spreadsheet chaos.",
        href: termDashboardUrl,
        badge: "Term progress",
        tone: "indigo",
      },
      {
        title: "Attendance & Daily Work",
        desc: "Capture today’s register quickly and keep class records clean, consistent and trusted.",
        href: attendanceUrl,
        badge: "Today",
        tone: "sky",
      },
      {
        title: "Curriculum Explorer",
        desc: "Browse strands, sub-strands, indicators and exemplars—ready for schemes and lesson notes.",
        href: curriculumExplorerUrl,
        badge: "NaCCA (KG–JHS)",
        tone: "zinc",
      },
      {
        title: "Wellbeing & Health",
        desc: "Monitor daily health records and keep the class safe, supported and learning-ready.",
        href: wellbeingUrl,
        badge: "Care",
        tone: "amber",
      },
      {
        title: "Communication Support",
        desc: "Stay connected and supported with essential communication resources for the work ahead.",
        href: communicationSupportUrl,
        badge: "Support",
        tone: "violet",
      },
    ],
    [lessonNotesUrl, termDashboardUrl, attendanceUrl]
  );

  const lessonWeeks = snapshot.lessonNotes.availableWeeks ?? [];
  const selectedWeek = snapshot.lessonNotes.selectedWeek;

  function setQuery(next: Record<string, string>) {
    const p = new URLSearchParams(sp?.toString() || "");
    for (const [k, v] of Object.entries(next)) p.set(k, v);
    router.push(`/teacher/dashboard?${p.toString()}`);
  }

  const ln = snapshot.lessonNotes.latest;
  const lnCounts = snapshot.lessonNotes.statusCounts || {};

  const totalLessonNotesInWeek = Object.values(lnCounts).reduce((a, b) => a + (b || 0), 0);

  const bandTotal =
    snapshot.assessments.bands.below40 +
    snapshot.assessments.bands.between40_54 +
    snapshot.assessments.bands.between55_69 +
    snapshot.assessments.bands.above70;

  return (
    <div className="min-h-[calc(100vh-65px)] bg-gradient-to-b from-sky-50/60 via-white to-sky-50/40 px-4 py-6 md:px-8 md:py-8">
      {/* local keyframes without tailwind config */}
      <style>{`
        @keyframes edulifeWiggle {
          0% { transform: translateY(0) rotate(0deg); }
          35% { transform: translateY(-2px) rotate(-0.4deg); }
          70% { transform: translateY(-1px) rotate(0.4deg); }
          100% { transform: translateY(0) rotate(0deg); }
        }
      `}</style>

      <div className="mx-auto w-full max-w-6xl space-y-6">
        {/* Header */}
        <section className="rounded-3xl border border-sky-100/80 bg-white/90 p-6 shadow-sm backdrop-blur-md md:p-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-sky-500">
                EduLife OS · Teacher Dashboard
              </p>
              <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-sky-950 md:text-3xl">
                Welcome back, {snapshot.teacher.displayName}.
              </h1>
              <p className="mt-1 max-w-2xl text-sm text-slate-700 md:text-base">
                Here’s your calm command center — a quick glance at today, then a clear path into what matters most.
              </p>

              <div className="mt-3 flex flex-wrap gap-2">
                <StatPill label="Today" value={snapshot.today.label} />
                <StatPill label="Term" value={snapshot.lessonNotes.term} />
                <StatPill label="Year" value={snapshot.lessonNotes.academicYear} />
                {snapshot.teacher.staffId ? <StatPill label="Staff ID" value={snapshot.teacher.staffId} /> : null}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-start gap-2 md:justify-end">
              <Link
                href="/teacher-portal"
                className="inline-flex items-center justify-center rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-medium text-sky-800 hover:bg-sky-100"
              >
                Open Teacher Portal
              </Link>
              <button
                type="button"
                onClick={() => location.reload()}
                className="inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-800 hover:bg-zinc-50"
              >
                Refresh
              </button>
            </div>
          </div>
        </section>

        {/* At-a-glance cards */}
        <section className="grid gap-4 md:grid-cols-3">
          {/* Attendance + Health */}
          <div className="rounded-3xl border border-sky-100 bg-white/90 p-5 shadow-sm backdrop-blur-md md:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold text-sky-700">Today</p>
                <h2 className="text-base font-bold text-slate-900 md:text-lg">
                  Attendance & Health
                </h2>
                <p className="mt-1 text-xs text-slate-600">
                  A quick pulse-check for the day.
                </p>
              </div>
              <Link
                href={attendanceUrl}
                className="rounded-xl border border-sky-700 bg-sky-700 px-3 py-2 text-[11px] font-semibold text-white hover:bg-sky-800"
              >
                Open
              </Link>
            </div>

            <div className="mt-4 grid gap-2">
              <div className="flex flex-wrap gap-2">
                <StatPill label="Sessions" value={snapshot.today.attendance.sessionsTotal} />
                <StatPill label="Closed" value={snapshot.today.attendance.sessionsClosed} />
                <StatPill label="Marked" value={snapshot.today.attendance.marksTotal} />
              </div>

              <Bar value={snapshot.today.attendance.presentRate} label="Present rate" />
              <Bar value={snapshot.today.attendance.closureRate} label="Session closure" />

              <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-slate-700">
                <div className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2">
                  <div className="text-slate-500">PRESENT</div>
                  <div className="font-bold text-slate-900">{snapshot.today.attendance.present}</div>
                </div>
                <div className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2">
                  <div className="text-slate-500">ABSENT</div>
                  <div className="font-bold text-slate-900">{snapshot.today.attendance.absent}</div>
                </div>
                <div className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2">
                  <div className="text-slate-500">LATE</div>
                  <div className="font-bold text-slate-900">{snapshot.today.attendance.late}</div>
                </div>
                <div className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2">
                  <div className="text-slate-500">HEALTH</div>
                  <div className="font-bold text-slate-900">{snapshot.today.health.healthTotal}</div>
                </div>
              </div>

              <p className="mt-2 text-[11px] text-slate-600">
                Health alerts:{" "}
                <span className="font-semibold text-slate-900">{snapshot.today.health.feverCount}</span>{" "}
                · Parent updates sent:{" "}
                <span className="font-semibold text-slate-900">{snapshot.today.health.sentToParentCount}</span>
              </p>
            </div>
          </div>

          {/* Lesson notes */}
          <div className="rounded-3xl border border-emerald-100 bg-white/90 p-5 shadow-sm backdrop-blur-md md:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold text-emerald-700">This week</p>
                <h2 className="text-base font-bold text-slate-900 md:text-lg">
                  Lesson Notes Status
                </h2>
                <p className="mt-1 text-xs text-slate-600">
                  Keep your week clean and stress-free.
                </p>
              </div>
              <Link
                href={lessonNotesUrl}
                className="rounded-xl border border-emerald-700 bg-emerald-700 px-3 py-2 text-[11px] font-semibold text-white hover:bg-emerald-800"
              >
                Open
              </Link>
            </div>

            <div className="mt-4 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <StatPill label="Term" value={snapshot.lessonNotes.term} />
                <StatPill label="Year" value={snapshot.lessonNotes.academicYear} />

                <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] text-emerald-900">
                  <span className="text-emerald-700">Week</span>
                  <select
                    className="bg-transparent font-semibold outline-none"
                    value={selectedWeek ?? ""}
                    onChange={(e) => {
                      const v = e.target.value ? Number(e.target.value) : "";
                      if (typeof v === "number" && Number.isFinite(v)) {
                        setQuery({ week: String(v), term: defaultTerm, academicYear: defaultAcademicYear });
                      }
                    }}
                  >
                    {lessonWeeks.length === 0 ? (
                      <option value="">—</option>
                    ) : (
                      lessonWeeks.map((w) => (
                        <option key={w} value={w}>
                          {w}
                        </option>
                      ))
                    )}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 px-3 py-2">
                  <div className="text-[11px] text-emerald-700">Items</div>
                  <div className="text-xl font-extrabold text-emerald-950">
                    {totalLessonNotesInWeek}
                  </div>
                </div>
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 px-3 py-2">
                  <div className="text-[11px] text-emerald-700">Latest</div>
                  <div className="text-sm font-bold text-emerald-950">
                    {ln?.status ?? "—"}
                  </div>
                  <div className="text-[10px] text-emerald-800/80">
                    {ln?.updatedAt ? new Date(ln.updatedAt).toLocaleString("en-GB") : ""}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 text-[11px]">
                {Object.keys(lnCounts).length === 0 ? (
                  <span className="text-slate-600">No lesson notes found for this week.</span>
                ) : (
                  Object.entries(lnCounts).map(([k, v]) => (
                    <span
                      key={k}
                      className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white/70 px-3 py-1 text-emerald-900"
                    >
                      <span className="text-emerald-700">{k}</span>
                      <span className="font-semibold">{v}</span>
                    </span>
                  ))
                )}
              </div>

              {ln?.headteacherComment ? (
                <div className="rounded-2xl border border-emerald-100 bg-white px-3 py-2">
                  <div className="text-[11px] font-semibold text-emerald-800">
                    Headteacher note
                  </div>
                  <p className="mt-1 text-xs text-slate-700 line-clamp-3">
                    {ln.headteacherComment}
                  </p>
                </div>
              ) : null}

              {snapshot.lessonNotes.latestAnnouncement ? (
                <p className="text-[11px] text-slate-600">
                  Latest school update:{" "}
                  <span className="font-semibold text-slate-900">
                    {snapshot.lessonNotes.latestAnnouncement.title}
                  </span>
                </p>
              ) : null}
            </div>
          </div>

          {/* Assessments */}
          <div className="rounded-3xl border border-indigo-100 bg-white/90 p-5 shadow-sm backdrop-blur-md md:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold text-indigo-700">This term</p>
                <h2 className="text-base font-bold text-slate-900 md:text-lg">
                  Assessments Overview
                </h2>
                <p className="mt-1 text-xs text-slate-600">
                  {snapshot.assessments.scopeLabel}
                </p>
              </div>
              <Link
                href={termDashboardUrl}
                className="rounded-xl border border-indigo-700 bg-indigo-700 px-3 py-2 text-[11px] font-semibold text-white hover:bg-indigo-800"
              >
                Open
              </Link>
            </div>

            <div className="mt-4 space-y-3">
              <div className="flex flex-wrap gap-2">
                <StatPill label="Assessments" value={snapshot.assessments.itemCount} />
                <StatPill label="Scores" value={snapshot.assessments.scoreCount} />
                <StatPill label="Avg" value={fmtPct(snapshot.assessments.avgPct)} />
              </div>

              <div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-3">
                <div className="mb-2 flex items-center justify-between text-[11px] text-indigo-900">
                  <span className="font-semibold">Performance bands</span>
                  <span className="text-indigo-800/80">{bandTotal ? `${bandTotal} scores` : "—"}</span>
                </div>

                <div className="grid grid-cols-4 gap-2 text-[11px]">
                  <div className="rounded-xl bg-white/80 px-2 py-2 text-center">
                    <div className="text-slate-500">&lt;40</div>
                    <div className="font-extrabold text-slate-900">{snapshot.assessments.bands.below40}</div>
                  </div>
                  <div className="rounded-xl bg-white/80 px-2 py-2 text-center">
                    <div className="text-slate-500">40–54</div>
                    <div className="font-extrabold text-slate-900">{snapshot.assessments.bands.between40_54}</div>
                  </div>
                  <div className="rounded-xl bg-white/80 px-2 py-2 text-center">
                    <div className="text-slate-500">55–69</div>
                    <div className="font-extrabold text-slate-900">{snapshot.assessments.bands.between55_69}</div>
                  </div>
                  <div className="rounded-xl bg-white/80 px-2 py-2 text-center">
                    <div className="text-slate-500">70+</div>
                    <div className="font-extrabold text-slate-900">{snapshot.assessments.bands.above70}</div>
                  </div>
                </div>
              </div>

              {snapshot.assessments.topSubjects.length ? (
                <div className="rounded-2xl border border-indigo-100 bg-white px-3 py-2">
                  <div className="text-[11px] font-semibold text-indigo-800">Top subjects (by assessment count)</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {snapshot.assessments.topSubjects.map((s) => (
                      <span
                        key={s.subject}
                        className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-[11px] text-indigo-900"
                      >
                        <span className="text-indigo-700">{s.subject}</span>
                        <span className="font-semibold">{s.count}</span>
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-[11px] text-slate-600">
                  No assessments recorded for this term yet.
                </p>
              )}
            </div>
          </div>
        </section>

        {/* What's waiting inside */}
        <section className="rounded-3xl border border-sky-100 bg-white/90 p-5 shadow-sm backdrop-blur-md md:p-6">
          <div className="mb-4 flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900 md:text-lg">
                What’s waiting inside
              </h2>
              <p className="text-[11px] text-slate-600 md:text-xs">
                Pick your next move — each tile takes you straight into the workflow.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href={lessonNotesUrl}
                className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-medium text-emerald-800 hover:bg-emerald-100"
              >
                Continue Lesson Notes
              </Link>
              <Link
                href={attendanceUrl}
                className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-medium text-sky-800 hover:bg-sky-100"
              >
                Take Attendance
              </Link>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {tiles.map((t) => {
              const tone =
                t.tone === "emerald"
                  ? "border-emerald-100 bg-emerald-50/60 hover:border-emerald-300 hover:bg-emerald-50"
                  : t.tone === "indigo"
                  ? "border-indigo-100 bg-indigo-50/60 hover:border-indigo-300 hover:bg-indigo-50"
                  : t.tone === "sky"
                  ? "border-sky-100 bg-sky-50/60 hover:border-sky-300 hover:bg-sky-50"
                  : t.tone === "amber"
                  ? "border-amber-100 bg-amber-50/70 hover:border-amber-300 hover:bg-amber-50"
                  : t.tone === "violet"
                  ? "border-violet-100 bg-violet-50/70 hover:border-violet-300 hover:bg-violet-50"
                  : "border-zinc-200 bg-zinc-50/70 hover:border-zinc-300 hover:bg-white";

              return (
                <Link
                  key={t.title}
                  href={t.href}
                  className={`group relative flex flex-col justify-between rounded-2xl border p-4 text-left shadow-[0_1px_4px_rgba(15,23,42,0.06)] transition hover:shadow-md ${tone}`}
                  style={{ willChange: "transform" }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLAnchorElement).style.animation =
                      "edulifeWiggle 520ms ease-in-out";
                  }}
                  onAnimationEnd={(e) => {
                    (e.currentTarget as HTMLAnchorElement).style.animation = "";
                  }}
                >
                  <div>
                    <div className="mb-2 inline-flex items-center rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                      {t.badge}
                    </div>
                    <h3 className="text-sm font-semibold text-slate-950 md:text-base">
                      {t.title}
                    </h3>
                    <p className="mt-1 text-xs text-slate-700 md:text-sm">
                      {t.desc}
                    </p>
                  </div>

                  <div className="mt-3 flex items-center justify-between text-[11px] text-slate-700">
                    <span className="opacity-80">Open now</span>
                    <span className="font-medium text-slate-900 group-hover:underline">
                      Go →
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        {/* Quiet note about correctness */}
        <section className="rounded-3xl border border-slate-100 bg-white/80 p-4 text-[11px] text-slate-600 shadow-sm md:text-xs">
          <p>
            Important: Assessments are currently shown as a <span className="font-semibold">term snapshot (schoolwide)</span>{" "}
            because <span className="font-mono">AssessmentItem</span> does not yet store who created it. If you want truly
            teacher-specific analytics, we’ll add <span className="font-mono">createdByUserId</span> in the next migration.
          </p>
        </section>
      </div>
    </div>
  );
}
