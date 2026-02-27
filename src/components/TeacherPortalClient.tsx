"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type TeacherPortalProps = {
  // legacy props (ignored): kept for backward-compat so callers don’t break
  tenantId?: string;
  teacherUserId?: string;

  defaultTerm: string;
  defaultAcademicYear: string;
  demoClassroomId?: string;
  teacherDisplayName?: string;
};

type TenantLite = { id: string; name: string; slug: string | null; schoolCode: string | null; status: string | null };

type MeOk = {
  ok: true;
  userId: string;
  email: string | null;
  name: string | null;
  tenantId: string;
  activeTenantId: string;
  tenant: TenantLite | null;
  roleName: string | null;
  effectiveRole: string | null;
  staffId: string | null;
};

type MeErr = {
  ok: false;
  error: string;
  detail?: string;
  suggestedTenantId?: string | null;
};

type MeResp = MeOk | MeErr;

function useMe() {
  const [data, setData] = useState<MeResp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch("/api/me", { cache: "no-store" });
        const j = (await r.json()) as MeResp;
        if (alive) setData(j);
      } catch {
        if (alive) setData({ ok: false, error: "NETWORK_ERROR" });
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return { data, loading };
}

export default function TeacherPortalClient({
  defaultTerm,
  defaultAcademicYear,
  demoClassroomId,
  teacherDisplayName,
}: TeacherPortalProps) {
  const displayName = teacherDisplayName?.trim() || "Teacher";
  const { data, loading } = useMe();

  const tenantName = useMemo(() => {
    if (!data || !data.ok) return null;
    return data.tenant?.name ?? null;
  }, [data]);

  // ✅ No tenantId/teacherUserId leaks — tenant context comes from session
  const attendanceUrl = "/teacher/attendance";
  const lessonNotesUrl = "/teacher/lesson-notes";

  // term dashboard may still need term/year/week/classroom as “filters” (not auth)
  const termDashboardUrl = useMemo(() => {
    const p = new URLSearchParams();
    if (demoClassroomId) p.set("classroomId", demoClassroomId);
    if (defaultTerm) p.set("term", defaultTerm);
    if (defaultAcademicYear) p.set("academicYear", defaultAcademicYear);
    const qs = p.toString();
    return `/teacher/assessment/term-dashboard${qs ? `?${qs}` : ""}`;
  }, [demoClassroomId, defaultTerm, defaultAcademicYear]);

  const curriculumExplorerUrl = "/teacher/curriculum";
  const schemesUrl = "/teacher/schemes";
  const classicDashboardUrl = "/teacher/dashboard";

  // ---------- states ----------
  if (loading) {
    return (
      <div className="min-h-[60vh] w-full px-4 py-10">
        <div className="mx-auto w-full max-w-5xl rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-600">Loading your portal…</p>
        </div>
      </div>
    );
  }

  if (!data || !data.ok) {
    const err = data?.error ?? "UNKNOWN";
    const isTenantRequired = err === "TENANT_REQUIRED";
    const isUnauth = err === "UNAUTHENTICATED";

    return (
      <div className="min-h-[70vh] w-full bg-gradient-to-b from-sky-50/60 via-white to-sky-50/40 px-4 py-6 md:px-8 md:py-8">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 rounded-3xl border border-slate-100 bg-white/90 p-6 shadow-sm backdrop-blur-md md:p-8">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">EduLife OS</p>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 md:text-3xl">
            Access needed
          </h1>

          {isTenantRequired ? (
            <p className="text-sm text-slate-700">
              You’re signed in, but no active tenant is selected. Go to the app gateway and choose your school.
            </p>
          ) : isUnauth ? (
            <p className="text-sm text-slate-700">
              Your session isn’t valid. Sign in again.
            </p>
          ) : (
            <p className="text-sm text-slate-700">
              Couldn’t load your session context ({err}). Refresh or sign in again.
            </p>
          )}

          <div className="flex flex-wrap gap-2 pt-2">
            <Link
              href="/app"
              className="inline-flex items-center rounded-xl border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-900 hover:bg-sky-100"
            >
              Go to /app (gateway)
            </Link>
            <Link
              href="/auth/signin"
              className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50"
            >
              Sign in
            </Link>
            <button
              type="button"
              onClick={() => location.reload()}
              className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50"
            >
              Refresh
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---------- main ----------
  return (
    <div className="min-h-[70vh] w-full bg-gradient-to-b from-sky-50/60 via-white to-sky-50/40 px-4 py-6 md:px-8 md:py-8">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <section className="rounded-3xl border border-sky-100/80 bg-white/90 p-6 shadow-sm backdrop-blur-md md:p-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-sky-500">EduLife OS · Teacher Portal</p>
              <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-sky-950 md:text-3xl">
                Good day, {displayName}.
              </h1>
              <p className="mt-1 max-w-xl text-sm text-slate-700 md:text-base">
                Calm workspace for <span className="font-semibold">attendance</span>,{" "}
                <span className="font-semibold">NaCCA lesson notes</span>, and{" "}
                <span className="font-semibold">continuous assessment</span>.
              </p>

              <div className="mt-3 flex flex-wrap gap-2 pt-1 text-[11px] text-zinc-500 md:text-xs">
                <Link
                  href={classicDashboardUrl}
                  className="inline-flex items-center rounded-full border border-zinc-200 bg-white/80 px-3 py-1 hover:bg-zinc-50"
                >
                  Open classic Teacher Dashboard
                </Link>
                <span className="hidden text-zinc-400 md:inline">
                  · Tenant context comes from your session (no URL tenantId leakage).
                </span>
              </div>
            </div>

            <div className="mt-2 flex flex-col items-end gap-1 text-right text-[11px] text-slate-500 md:mt-0 md:text-xs">
              <span className="inline-flex items-center rounded-full bg-sky-50 px-3 py-1 font-medium text-sky-800">
                Term: {defaultTerm}
              </span>
              <span>Academic Year: {defaultAcademicYear}</span>
              {tenantName ? <span className="text-slate-600">School: {tenantName}</span> : null}
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-sky-100 bg-white/90 p-5 shadow-sm backdrop-blur-md md:p-6">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-slate-900 md:text-lg">Today&apos;s Flow</h2>
            <p className="text-[11px] text-slate-500 md:text-xs">Start from the left and move clockwise.</p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <Link
              href={attendanceUrl}
              className="group flex flex-col justify-between rounded-2xl border border-sky-100 bg-sky-50/60 p-4 text-left shadow-[0_1px_4px_rgba(15,23,42,0.06)] transition hover:-translate-y-[1px] hover:border-sky-300 hover:bg-sky-50 hover:shadow-md"
            >
              <div>
                <div className="mb-2 inline-flex items-center rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-800">
                  Step 1 · Attendance
                </div>
                <h3 className="text-sm font-semibold text-sky-950 md:text-base">Open Attendance workspace</h3>
                <p className="mt-1 text-xs text-slate-700 md:text-sm">
                  Take register for your classes securely (tenant comes from session).
                </p>
              </div>
              <div className="mt-3 flex items-center justify-between text-[11px] text-sky-800">
                <span>Mark present / absent / late</span>
                <span className="font-medium group-hover:underline">Go to Attendance →</span>
              </div>
            </Link>

            <Link
              href={lessonNotesUrl}
              className="group flex flex-col justify-between rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4 text-left shadow-[0_1px_4px_rgba(15,23,42,0.06)] transition hover:-translate-y-[1px] hover:border-emerald-300 hover:bg-emerald-50 hover:shadow-md"
            >
              <div>
                <div className="mb-2 inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
                  Step 2 · Lesson Notes
                </div>
                <h3 className="text-sm font-semibold text-emerald-950 md:text-base">My NaCCA Lesson Notes studio</h3>
                <p className="mt-1 text-xs text-slate-700 md:text-sm">
                  Create, edit, submit and print NaCCA-aligned lesson notes.
                </p>
              </div>
              <div className="mt-3 flex items-center justify-between text-[11px] text-emerald-800">
                <span>Draft · Submit · Print</span>
                <span className="font-medium group-hover:underline">Open Lesson Notes →</span>
              </div>
            </Link>

            <Link
              href={termDashboardUrl}
              className="group flex flex-col justify-between rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4 text-left shadow-[0_1px_4px_rgba(15,23,42,0.06)] transition hover:-translate-y-[1px] hover:border-indigo-300 hover:bg-indigo-50 hover:shadow-md"
            >
              <div>
                <div className="mb-2 inline-flex items-center rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-medium text-indigo-800">
                  Step 3 · Assessments
                </div>
                <h3 className="text-sm font-semibold text-indigo-950 md:text-base">Term performance dashboard</h3>
                <p className="mt-1 text-xs text-slate-700 md:text-sm">
                  Track class performance for the term & academic year.
                </p>
              </div>
              <div className="mt-3 flex items-center justify-between text-[11px] text-indigo-800">
                <span>
                  {defaultTerm} · {defaultAcademicYear}
                </span>
                <span className="font-medium group-hover:underline">Open Dashboard →</span>
              </div>
            </Link>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-100 bg-white/90 p-5 shadow-sm md:p-6">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-slate-900 md:text-lg">Planning & Curriculum tools</h2>
            <p className="text-[11px] text-slate-500 md:text-xs">NaCCA curriculum powers schemes & lesson notes.</p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <Link
              href={curriculumExplorerUrl}
              className="group flex flex-col justify-between rounded-2xl border border-zinc-200 bg-zinc-50/70 p-4 text-left shadow-[0_1px_4px_rgba(15,23,42,0.06)] transition hover:-translate-y-[1px] hover:border-zinc-300 hover:bg-white hover:shadow-md"
            >
              <div>
                <div className="mb-2 inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-800">
                  Curriculum Explorer
                </div>
                <h3 className="text-sm font-semibold text-zinc-950 md:text-base">Browse NaCCA curriculum (KG–JHS)</h3>
                <p className="mt-1 text-xs text-slate-700 md:text-sm">
                  Strands, sub-strands, indicators, exemplars.
                </p>
              </div>
              <div className="mt-3 flex items-center justify-between text-[11px] text-zinc-700">
                <span>Strands → Indicators → Exemplars</span>
                <span className="font-medium group-hover:underline">Open Explorer →</span>
              </div>
            </Link>

            <Link
              href={schemesUrl}
              className="group flex flex-col justify-between rounded-2xl border border-amber-200 bg-amber-50/80 p-4 text-left shadow-[0_1px_4px_rgba(15,23,42,0.06)] transition hover:-translate-y-[1px] hover:border-amber-300 hover:bg-amber-50 hover:shadow-md"
            >
              <div>
                <div className="mb-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-900">
                  Schemes of Work
                </div>
                <h3 className="text-sm font-semibold text-amber-950 md:text-base">Build & print term schemes</h3>
                <p className="mt-1 text-xs text-slate-700 md:text-sm">
                  Week-by-week planning ready for supervision.
                </p>
              </div>
              <div className="mt-3 flex items-center justify-between text-[11px] text-amber-900">
                <span>Week-by-week planning</span>
                <span className="font-medium group-hover:underline">Open Schemes →</span>
              </div>
            </Link>

            <Link
              href={lessonNotesUrl}
              className="group flex flex-col justify-between rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 text-left shadow-[0_1px_4px_rgba(15,23,42,0.06)] transition hover:-translate-y-[1px] hover:border-emerald-300 hover:bg-emerald-50 hover:shadow-md"
            >
              <div>
                <div className="mb-2 inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-900">
                  Lesson Notes
                </div>
                <h3 className="text-sm font-semibold text-emerald-950 md:text-base">Generate & refine lesson notes</h3>
                <p className="mt-1 text-xs text-slate-700 md:text-sm">
                  Start from scheme or curriculum.
                </p>
              </div>
              <div className="mt-3 flex items-center justify-between text-[11px] text-emerald-900">
                <span>Objectives · TLMs · Activities</span>
                <span className="font-medium group-hover:underline">Open Lesson Notes →</span>
              </div>
            </Link>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-100 bg-white/80 p-4 text-[11px] text-slate-500 shadow-sm md:text-xs">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <p>
              Tip: tenant context is session-based; URLs stay clean and safe.
            </p>
            <div className="flex flex-wrap gap-2">
              <Link
                href={classicDashboardUrl}
                className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50/80 px-3 py-1 font-medium text-sky-800 hover:bg-sky-100"
              >
                Go to classic Dashboard
              </Link>
              <Link
                href={lessonNotesUrl}
                className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50/80 px-3 py-1 font-medium text-emerald-800 hover:bg-emerald-100"
              >
                Continue a lesson note
              </Link>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
