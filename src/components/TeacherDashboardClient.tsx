// src/components/TeacherDashboardClient.tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Teacher = {
  teacher_id: string;
  first_name: string | null;
  last_name: string | null;
} | null;

type Homeroom = {
  class_code: string;
  class_name: string | null;
  level: "KG" | "Primary" | "JHS" | null;
} | null;

type AssignmentChip = {
  assignment_id: string;
  class_code: string;
  subject: string;
  academic_year: string | null;
  term: string | null;
  todayCount?: number;
  latestISO?: string | null;
  classSize?: number | null;
};

type RecentEntry = {
  record_id: string;
  class_code: string;
  subject: string;
  created_at: string | null;
  student_id: string | null;
  score: number | null;
  assessment_type: string | null;
};

type Chip = {
  key: string;
  label: string; // usually class_code or class_name
  href: string; // where to record assessment
  kind: "HR" | "SJ"; // homeroom vs subject
  sub?: string; // subject or level label
  term?: string | null;
  year?: string | null;
  count?: number; // today count
  classSize?: number | null;
  latestISO?: string | null;
};

export default function TeacherDashboardClient({
  teacher,
  homeroom,
  assignments,
  todayMeta,
  classCounts,
  latestMap,
  recentToday,
  alerts,
  // NEW: optional portal-style context
  tenantId,
  teacherUserId,
  defaultTerm = "1st Term",
  defaultAcademicYear = "2025/2026",
  demoClassroomId,
}: {
  teacher: Teacher;
  homeroom: Homeroom;
  assignments: AssignmentChip[];
  todayMeta: { date: string; total: number; homeroomCount: number };
  classCounts: Record<string, number>;
  latestMap: Record<string, string | null>;
  recentToday: RecentEntry[];
  alerts: string[];
  tenantId?: string;
  teacherUserId?: string;
  defaultTerm?: string;
  defaultAcademicYear?: string;
  demoClassroomId?: string;
}) {
  const displayName =
    [teacher?.first_name, teacher?.last_name].filter(Boolean).join(" ").trim() ||
    "—";

  const [autoRefresh, setAutoRefresh] = useState(false);
  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => location.reload(), 30000);
    return () => clearInterval(id);
  }, [autoRefresh]);

  // ==============================
  // URLs aligned with TeacherPortal
  // ==============================

  const hasPortalContext = Boolean(tenantId && teacherUserId);

  const lessonNotesWorkspaceUrl = hasPortalContext
    ? `/teacher/lesson-notes?tenantId=${encodeURIComponent(
        tenantId!
      )}&teacherUserId=${encodeURIComponent(teacherUserId!)}`
    : "/teacher/lesson-notes";

  const termDashboardUrl = hasPortalContext
    ? `/teacher/assessment/term-dashboard?tenantId=${encodeURIComponent(
        tenantId!
      )}&teacherUserId=${encodeURIComponent(teacherUserId!)}${
        demoClassroomId
          ? `&classroomId=${encodeURIComponent(demoClassroomId)}`
          : ""
      }&term=${encodeURIComponent(defaultTerm)}&academicYear=${encodeURIComponent(
        defaultAcademicYear
      )}`
    : "/teacher/assessment";

  const attendanceUrl = hasPortalContext
    ? `/teacher/attendance?tenantId=${encodeURIComponent(
        tenantId!
      )}&teacherUserId=${encodeURIComponent(teacherUserId!)}`
    : "/teacher/attendance";

  // Build homeroom chip (0 or 1)
  const homeroomChips: Chip[] =
    homeroom != null
      ? [
          {
            key: `homeroom-${homeroom.class_code}`,
            label: homeroom.class_name || homeroom.class_code,
            sub: homeroom.level || undefined,
            href: `/teacher/assessments/new?class_code=${encodeURIComponent(
              homeroom.class_code
            )}`,
            term: null,
            year: null,
            kind: "HR",
            count: todayMeta.homeroomCount || 0,
            classSize:
              typeof classCounts[homeroom.class_code] === "number"
                ? classCounts[homeroom.class_code]
                : null,
            latestISO: null,
          },
        ]
      : [];

  // Subject assignment chips
  const assignmentChips: Chip[] = (assignments ?? []).map((a) => {
    const key = `${a.class_code}__${a.subject}`;
    return {
      key: a.assignment_id,
      label: a.class_code,
      sub: a.subject || undefined,
      href: `/teacher/assessments/new?class_code=${encodeURIComponent(
        a.class_code
      )}&subject=${encodeURIComponent(a.subject ?? "")}`,
      term: a.term ?? null,
      year: a.academic_year ?? null,
      kind: "SJ",
      count: a.todayCount || 0,
      classSize: a.classSize ?? null,
      latestISO: latestMap[key] ?? a.latestISO ?? null,
    };
  });

  const chips: Chip[] = [...homeroomChips, ...assignmentChips];

  return (
    <div className="grid gap-6">
      {/* Header */}
      <section className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-blue-900">
              Teacher Dashboard
            </h1>
            <p className="mt-1 text-gray-700">
              Signed in as: <span className="font-semibold">{displayName}</span>
            </p>
            {!!teacher?.teacher_id && (
              <p className="text-xs text-gray-500 mt-1">
                ID: <span className="font-mono">{teacher.teacher_id}</span>
              </p>
            )}
            {hasPortalContext && (
              <p className="text-[11px] text-gray-500 mt-1">
                Tenant:{" "}
                <span className="font-mono">
                  {tenantId!.slice(0, 8)}…
                </span>{" "}
                · Term: {defaultTerm} · Year: {defaultAcademicYear}
              </p>
            )}
          </div>

          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              <button
                className="rounded-lg border bg-white px-3 py-1.5 text-xs hover:bg-gray-50"
                onClick={() => location.reload()}
                type="button"
              >
                Refresh now
              </button>
              <label className="inline-flex items-center gap-2 text-xs text-gray-700">
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                />
                Auto refresh (30s)
              </label>
            </div>
            {hasPortalContext && (
              <Link
                href="/teacher-portal"
                className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] text-sky-800 hover:bg-sky-100"
              >
                Open calm Teacher Portal
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* Alerts */}
      {alerts.length > 0 && (
        <section className="rounded-2xl border bg-amber-50 p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-amber-900">Alerts</h2>
          <ul className="mt-2 list-disc pl-5 text-sm text-amber-900">
            {alerts.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </section>
      )}

      {/* Today summary */}
      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center rounded-md border bg-white px-3 py-1 text-sm">
            <span className="mr-2 inline-block h-2 w-2 rounded-full bg-emerald-600" />
            Today ({todayMeta.date}):{" "}
            <strong className="ml-1">{todayMeta.total}</strong> assessment
            {todayMeta.total === 1 ? "" : "s"}
          </span>
          {homeroom && homeroomChips.length > 0 ? (
            <span className="inline-flex items-center rounded-md border bg-white px-3 py-1 text-sm">
              Homeroom:{" "}
              <strong className="ml-1">{todayMeta.homeroomCount}</strong>
              {typeof homeroomChips[0].classSize === "number" ? (
                <span className="ml-1 text-gray-500">
                  / {homeroomChips[0].classSize}
                </span>
              ) : null}
            </span>
          ) : null}
        </div>
      </section>

      {/* Classes & assignments */}
      <section className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            My classes & assignments
          </h2>
        </div>

        {chips.length === 0 ? (
          <p className="mt-3 text-sm text-gray-600">
            No classes or assignments yet.
          </p>
        ) : (
          <div className="mt-4 flex flex-wrap gap-2">
            {chips.map((c) => (
              <Link
                key={c.key}
                href={c.href}
                className="group inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm bg-white hover:bg-blue-50"
                title="Record assessment"
              >
                <span
                  className={
                    "inline-flex h-6 w-6 items-center justify-center rounded-full text-white text-[11px] font-semibold " +
                    (c.kind === "HR" ? "bg-blue-600" : "bg-sky-600")
                  }
                >
                  {c.kind}
                </span>

                <span className="font-medium">{c.label}</span>
                {c.sub ? <span className="text-gray-500">• {c.sub}</span> : null}

                {c.term ? (
                  <span className="ml-1 rounded border px-1.5 py-0.5 text-[10px] text-gray-700 bg-gray-50">
                    {c.term}
                  </span>
                ) : null}
                {c.year ? (
                  <span className="ml-1 rounded border px-1.5 py-0.5 text-[10px] text-gray-700 bg-gray-50">
                    {c.year}
                  </span>
                ) : null}

                <span className="ml-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-700">
                  {typeof c.count === "number" ? c.count : 0}
                  {typeof c.classSize === "number" ? ` / ${c.classSize}` : ""}
                </span>

                {c.latestISO ? (
                  <span className="ml-1 text-[10px] text-gray-500">
                    latest: {c.latestISO}
                  </span>
                ) : null}

                <span className="ml-1 text-blue-700 group-hover:underline">
                  Record
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Homeroom detail */}
      <section className="rounded-2xl border bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900">Homeroom Class</h2>
        {homeroom ? (
          <div className="mt-3 grid gap-1 text-sm">
            <div>
              <span className="text-gray-500">Level:</span>{" "}
              <span className="font-medium">{homeroom.level || "-"}</span>
            </div>
            <div>
              <span className="text-gray-500">Class:</span>{" "}
              <span className="font-medium">
                {homeroom.class_name || homeroom.class_code}
              </span>
            </div>
            <div className="mt-3">
              <Link
                href={`/teacher/assessments/new?class_code=${encodeURIComponent(
                  homeroom.class_code
                )}`}
                className="inline-flex items-center rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800"
              >
                Record Assessment for Homeroom
              </Link>
            </div>
          </div>
        ) : (
          <p className="mt-3 text-sm text-gray-600">
            No homeroom class assigned. (JHS subject teachers may not have one.)
          </p>
        )}
      </section>

      {/* Assignments table */}
      <section className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            Subject Teaching Assignments
          </h2>
          <span className="inline-flex items-center rounded-md border bg-white px-3 py-1 text-xs">
            Total: <strong className="ml-1">{assignments.length}</strong>
          </span>
        </div>

        {assignments.length ? (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-[880px] w-full text-sm">
              <thead className="bg-gray-50">
                <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:text-left [&>th]:font-semibold text-gray-700">
                  <th>Class</th>
                  <th>Subject</th>
                  <th>Academic Year</th>
                  <th>Term</th>
                  <th>Today / Size</th>
                  <th>Latest</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {assignments.map((a) => {
                  const key = `${a.class_code}__${a.subject}`;
                  const latest = latestMap[key] ?? a.latestISO ?? null;
                  return (
                    <tr key={a.assignment_id} className="[&>td]:px-3 [&>td]:py-2">
                      <td className="font-medium">{a.class_code}</td>
                      <td>{a.subject}</td>
                      <td>{a.academic_year || "-"}</td>
                      <td>{a.term || "-"}</td>
                      <td>
                        <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-700">
                          {typeof a.todayCount === "number" ? a.todayCount : 0}
                          {typeof a.classSize === "number" ? ` / ${a.classSize}` : ""}
                        </span>
                      </td>
                      <td className="text-xs text-gray-600">{latest || "—"}</td>
                      <td>
                        <Link
                          href={`/teacher/assessments/new?class_code=${encodeURIComponent(
                            a.class_code
                          )}&subject=${encodeURIComponent(a.subject)}`}
                          className="text-blue-700 hover:underline"
                        >
                          Record Assessment
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-3 text-sm text-gray-600">
            No subject assignments yet.
          </p>
        )}
      </section>

      {/* Recent entries (today) */}
      <section className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            My recent entries (today)
          </h2>
        <div className="text-xs text-gray-500">{recentToday.length} shown</div>
        </div>

        {recentToday.length ? (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-[760px] w-full text-sm">
              <thead className="bg-gray-50">
                <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:text-left [&>th]:font-semibold text-gray-700">
                  <th>Time</th>
                  <th>Class</th>
                  <th>Subject</th>
                  <th>Type</th>
                  <th>Student</th>
                  <th>Score</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {recentToday.map((r) => (
                  <tr key={r.record_id} className="[&>td]:px-3 [&>td]:py-2">
                    <td className="text-xs text-gray-600">{r.created_at || "—"}</td>
                    <td>{r.class_code || "—"}</td>
                    <td>{r.subject || "—"}</td>
                    <td>{r.assessment_type || "—"}</td>
                    <td className="font-mono text-xs">{r.student_id || "—"}</td>
                    <td>{typeof r.score === "number" ? r.score : "—"}</td>
                    <td>
                      <Link
                        href={`/admin/assessments?class=${encodeURIComponent(
                          r.class_code
                        )}&subject=${encodeURIComponent(r.subject)}`}
                        className="text-blue-700 hover:underline"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-3 text-sm text-gray-600">No entries recorded today.</p>
        )}
      </section>

      {/* Quick links – now aligned with portal URLs */}
      <section className="rounded-2xl border bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900">Quick Links</h2>
        <div className="mt-3 flex flex-wrap gap-3 text-sm">
          <Link
            href={attendanceUrl}
            className="rounded-lg border bg-white px-4 py-2 hover:bg-gray-50"
          >
            📅 Take today&apos;s attendance
          </Link>
          <Link
            href={lessonNotesWorkspaceUrl}
            className="rounded-lg border bg-white px-4 py-2 hover:bg-gray-50"
          >
            ✏️ Open Lesson Notes workspace
          </Link>
          <Link
            href={termDashboardUrl}
            className="rounded-lg border bg-white px-4 py-2 hover:bg-gray-50"
          >
            📊 View my class term dashboard
          </Link>
          <Link
            href="/teacher-portal"
            className="rounded-lg border bg-white px-4 py-2 hover:bg-gray-50"
          >
            Calm Teacher Portal (full daily flow)
          </Link>
          <Link
            href="/admin/assessments"
            className="rounded-lg border bg-white px-4 py-2 hover:bg-gray-50"
          >
            Admin Assessments (view)
          </Link>
        </div>
      </section>
    </div>
  );
}
