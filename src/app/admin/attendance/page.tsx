// src/app/admin/attendance/page.tsx
import Link from "next/link";
import { AttendanceStatus, StudentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";
import { getGuardianEssentialAlertEligibilityMap } from "@/lib/essentialAlerts/enrollment";

export const metadata = { title: "Admin • Attendance" };
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type SessionState = "NO_SESSION" | "OPEN" | "CLOSED" | "CERTIFIED";

type ClassRow = {
  classroomId: string;
  label: string;
  sessionId: string | null;
  state: SessionState;
  total: number;
  marked: number;
  unmarked: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
  notifiedAt: string | null;
};

const pageShell = "min-h-screen bg-[#F8FAFC] text-[#0F172A]";
const cardClass = "rounded-2xl border border-slate-200 bg-white text-slate-950 shadow-sm";
const inputClass =
  "mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-950 shadow-sm outline-none [color-scheme:light] placeholder:text-slate-400 focus:border-slate-950 focus:ring-2 focus:ring-slate-950/10";
const labelClass = "block text-xs font-semibold text-slate-700";
const mutedText = "text-sm text-slate-700";
const tableHeadClass = "bg-slate-100 text-xs text-slate-800";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function firstParam(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] ?? "" : v ?? "";
}

function clean(v: unknown) {
  return String(v ?? "").trim();
}

function isIsoDate(v: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function parseDateOnly(dateISO: string) {
  return new Date(`${dateISO}T00:00:00.000Z`);
}

function normRole(v: unknown) {
  return clean(v).toUpperCase().replace(/\s+/g, "_").replace(/-+/g, "_");
}

function isAdminLike(roleName: string | null | undefined) {
  const r = normRole(roleName);
  return r === "SCHOOL_ADMIN" || r === "ADMIN" || r === "HEADTEACHER" || r.includes("OWNER") || r.includes("SUPER");
}

function classLabel(c: { name: string | null; grade: string | null; arm: string | null }) {
  const name = clean(c.name);
  const gradeArm = [clean(c.grade), clean(c.arm)].filter(Boolean).join(" ");
  return name || gradeArm || "Unnamed class";
}

function pct(n: number, d: number) {
  if (!d) return 0;
  return Math.round((n / d) * 100);
}

function stateBadge(state: SessionState) {
  const base = "inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold";
  if (state === "CERTIFIED") return `${base} border-indigo-200 bg-indigo-50 text-indigo-700`;
  if (state === "CLOSED") return `${base} border-emerald-200 bg-emerald-50 text-emerald-700`;
  if (state === "OPEN") return `${base} border-amber-200 bg-amber-50 text-amber-700`;
  return `${base} border-zinc-200 bg-zinc-50 text-zinc-600`;
}

function countChip(label: string, value: number, tone: "plain" | "good" | "warn" | "bad" = "plain") {
  const cls =
    tone === "good"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : tone === "warn"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : tone === "bad"
          ? "border-rose-200 bg-rose-50 text-rose-700"
          : "border-zinc-200 bg-white text-zinc-700";

  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs ${cls}`}>
      {label}: <b className="ml-1">{value}</b>
    </span>
  );
}

async function requireAdminContext() {
  const ctx = await requireServerUserContext({
    redirectTo: "/admin/attendance",
    requireTenant: true,
  });

  const membership = await prisma.membership.findUnique({
    where: {
      userId_tenantId: {
        userId: ctx.userId,
        tenantId: ctx.tenantId,
      },
    },
    select: {
      status: true,
      role: { select: { name: true } },
    },
  });

  if (!membership || membership.status !== "ACTIVE" || !isAdminLike(membership.role?.name ?? ctx.roleName)) {
    const err = new Error("FORBIDDEN");
    (err as { status?: number }).status = 403;
    throw err;
  }

  return ctx;
}

export default async function AdminAttendancePage({ searchParams }: PageProps) {
  const ctx = await requireAdminContext();

  const sp = await searchParams;
  const dateRaw = clean(firstParam(sp.date));
  const dateISO = isIsoDate(dateRaw) ? dateRaw : todayISO();

  const classQuery = clean(firstParam(sp.class));
  const classroomIdParam = clean(firstParam(sp.classroomId));

  const date = parseDateOnly(dateISO);

  const allClassrooms = await prisma.classroom.findMany({
    where: { tenantId: ctx.tenantId },
    orderBy: [{ grade: "asc" }, { arm: "asc" }, { name: "asc" }],
    select: { id: true, name: true, grade: true, arm: true },
  });

  const filteredClassrooms = allClassrooms.filter((c) => {
    if (classroomIdParam) return c.id === classroomIdParam;
    if (!classQuery) return true;

    const haystack = [c.name, c.grade, c.arm, classLabel(c)].map(clean).join(" ").toLowerCase();
    return haystack.includes(classQuery.toLowerCase());
  });

  const classroomIds = filteredClassrooms.map((c) => c.id);

  const [studentCounts, sessions] = await Promise.all([
    classroomIds.length
      ? prisma.student.groupBy({
          by: ["classroomId"],
          where: {
            tenantId: ctx.tenantId,
            status: StudentStatus.ACTIVE,
            classroomId: { in: classroomIds },
          },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    classroomIds.length
      ? prisma.attendanceSession.findMany({
          where: {
            tenantId: ctx.tenantId,
            classroomId: { in: classroomIds },
            date,
          },
          select: {
            id: true,
            classroomId: true,
            isClosed: true,
            closedAt: true,
            certifiedAt: true,
            notifiedAt: true,
            takenByUserId: true,
            certifiedByUserId: true,
          },
        })
      : Promise.resolve([]),
  ]);

  const studentCountByClass = new Map(studentCounts.map((row) => [row.classroomId, row._count._all]));
  const sessionByClass = new Map(sessions.map((session) => [session.classroomId, session]));

  const sessionIds = sessions.map((session) => session.id);

  const groupedMarks = sessionIds.length
    ? await prisma.attendanceMark.groupBy({
        by: ["sessionId", "status"],
        where: {
          sessionId: { in: sessionIds },
          student: {
            tenantId: ctx.tenantId,
            status: StudentStatus.ACTIVE,
          },
        },
        _count: { _all: true },
      })
    : [];

  const countsBySession = new Map<
    string,
    Record<AttendanceStatus, number>
  >();

  for (const group of groupedMarks) {
    const current =
      countsBySession.get(group.sessionId) ??
      ({
        PRESENT: 0,
        ABSENT: 0,
        LATE: 0,
        EXCUSED: 0,
      } satisfies Record<AttendanceStatus, number>);

    current[group.status] = group._count._all;
    countsBySession.set(group.sessionId, current);
  }

  const rawRows: ClassRow[] = filteredClassrooms.map((c) => {
    const session = sessionByClass.get(c.id) ?? null;
    const total = studentCountByClass.get(c.id) ?? 0;

    const counts =
      session && countsBySession.get(session.id)
        ? countsBySession.get(session.id)!
        : ({
            PRESENT: 0,
            ABSENT: 0,
            LATE: 0,
            EXCUSED: 0,
          } satisfies Record<AttendanceStatus, number>);

    const marked = counts.PRESENT + counts.ABSENT + counts.LATE + counts.EXCUSED;
    const unmarked = Math.max(0, total - marked);

    let state: SessionState = "NO_SESSION";
    if (session) state = session.certifiedAt ? "CERTIFIED" : session.isClosed ? "CLOSED" : "OPEN";

    return {
      classroomId: c.id,
      label: classLabel(c),
      sessionId: session?.id ?? null,
      state,
      total,
      marked,
      unmarked,
      present: counts.PRESENT,
      absent: counts.ABSENT,
      late: counts.LATE,
      excused: counts.EXCUSED,
      notifiedAt: session?.notifiedAt ? session.notifiedAt.toISOString() : null,
    };
  });

    // Bank-grade visibility rule:
  // Show operational classes only unless the admin is actively searching.
  // Operational = has active learners OR has an attendance session on the selected date.
  const rows = classQuery || classroomIdParam ? rawRows : rawRows.filter((row) => row.total > 0 || !!row.sessionId);
  const hiddenEmptyClassrooms = rawRows.length - rows.length;

  const totals = rows.reduce(
    (acc, row) => {
      acc.classes += 1;
      acc.total += row.total;
      acc.marked += row.marked;
      acc.unmarked += row.unmarked;
      acc.present += row.present;
      acc.absent += row.absent;
      acc.late += row.late;
      acc.excused += row.excused;

      if (row.state === "NO_SESSION") acc.noSession += 1;
      if (row.state === "OPEN") acc.open += 1;
      if (row.state === "CLOSED") acc.closed += 1;
      if (row.state === "CERTIFIED") acc.certified += 1;

      return acc;
    },
    {
      classes: 0,
      total: 0,
      marked: 0,
      unmarked: 0,
      present: 0,
      absent: 0,
      late: 0,
      excused: 0,
      noSession: 0,
      open: 0,
      closed: 0,
      certified: 0,
    }
  );

  const absentRows = sessionIds.length
    ? await prisma.attendanceMark.findMany({
        where: {
          sessionId: { in: sessionIds },
          status: AttendanceStatus.ABSENT,
          student: {
            tenantId: ctx.tenantId,
            status: StudentStatus.ACTIVE,
          },
        },
        orderBy: [{ student: { lastName: "asc" } }, { student: { firstName: "asc" } }],
        select: {
          id: true,
          note: true,
          sessionId: true,
          student: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              guardianName: true,
              guardianPhone: true,
              guardianPhoneNorm: true,
              classroomId: true,
            },
          },
        },
      })
    : [];

  const guardianEligibilityByStudent =
    await getGuardianEssentialAlertEligibilityMap({
      tenantId: ctx.tenantId,
      purpose: "STUDENT_ATTENDANCE",
      students: absentRows.map((mark) => ({
        id: mark.student.id,
        guardianPhone: mark.student.guardianPhone,
        guardianPhoneNorm: mark.student.guardianPhoneNorm,
      })),
    });

  const rowBySession = new Map(rows.filter((row) => row.sessionId).map((row) => [row.sessionId!, row]));

  return (
    <main className={pageShell}>
  <div className="mx-auto max-w-7xl px-4 py-8 md:px-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
            EduLife OS • Admin Attendance Truth
          </div>
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-zinc-950">Attendance — {dateISO}</h1>
          <p className={`mt-1 max-w-3xl ${mutedText}`}>
            This page reads from the Prisma attendance register: AttendanceSession, AttendanceMark, Student, and
            Classroom. It does not use the old raw Supabase attendance table.
          </p>
        </div>

        <Link
          href="/admin/attendance/overview"
          className="inline-flex rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-800 shadow-sm hover:bg-zinc-50"
        >
          Open overview
        </Link>
      </div>

      <form className={`mt-6 grid gap-3 p-4 md:grid-cols-[180px_1fr_auto] md:items-end ${cardClass}`}>
        <div>
          <label className={labelClass}>Date</label>
          <input
            defaultValue={dateISO}
            type="date"
            name="date"
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass}>Class filter</label>
          <input
            defaultValue={classQuery}
            name="class"
            placeholder="e.g. JHS3, B4, KG1"
            className={inputClass}
          />
        </div>

        <button
          className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-950/20"
          type="submit"
        >
          Apply
        </button>
      </form>

      <section className="mt-5 flex flex-wrap gap-2">
        {countChip("Operational classes", totals.classes)}
        {hiddenEmptyClassrooms > 0 ? countChip("Hidden empty class shells", hiddenEmptyClassrooms, "warn") : null}
        {countChip("No session", totals.noSession, totals.noSession ? "warn" : "plain")}
        {countChip("Open", totals.open, totals.open ? "warn" : "plain")}
        {countChip("Closed", totals.closed, "good")}
        {countChip("Certified", totals.certified, "good")}
        {countChip("Total learners", totals.total)}
        {countChip("Marked", totals.marked)}
        {countChip("Unmarked", totals.unmarked, totals.unmarked ? "warn" : "good")}
        {countChip("Present", totals.present, "good")}
        {countChip("Absent", totals.absent, totals.absent ? "bad" : "plain")}
        {countChip("Late", totals.late, totals.late ? "warn" : "plain")}
        {countChip("Excused", totals.excused)}
      </section>

      <section className={`mt-6 overflow-hidden ${cardClass}`}>
        <div className="border-b border-zinc-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-zinc-950">Class register status</h2>
          <p className="text-xs text-zinc-600">
            Completion rate is based on actual saved marks. Unmarked learners are never counted as present.
            Empty legacy classroom shells are hidden unless you search/filter for them.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[1100px] w-full text-sm">
            <thead className="bg-zinc-50 text-xs text-zinc-600">
              <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:text-left [&>th]:font-semibold">
                <th>Class</th>
                <th>State</th>
                <th className="text-right">Total</th>
                <th className="text-right">Marked</th>
                <th className="text-right">Unmarked</th>
                <th className="text-right">Present</th>
                <th className="text-right">Absent</th>
                <th className="text-right">Late</th>
                <th className="text-right">Excused</th>
                <th className="text-right">Completion</th>
                <th>Parent alerts</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-zinc-100">
              {rows.map((row) => (
                <tr key={row.classroomId} className="[&>td]:px-3 [&>td]:py-2 [&>td]:text-slate-900">
                  <td className="font-medium text-zinc-950">{row.label}</td>
                  <td>
                    <span className={stateBadge(row.state)}>{row.state}</span>
                  </td>
                  <td className="text-right tabular-nums">{row.total}</td>
                  <td className="text-right tabular-nums">{row.marked}</td>
                  <td className={`text-right tabular-nums ${row.unmarked ? "font-semibold text-amber-700" : ""}`}>
                    {row.unmarked}
                  </td>
                  <td className="text-right tabular-nums">{row.present}</td>
                  <td className={`text-right tabular-nums ${row.absent ? "font-semibold text-rose-700" : ""}`}>
                    {row.absent}
                  </td>
                  <td className="text-right tabular-nums">{row.late}</td>
                  <td className="text-right tabular-nums">{row.excused}</td>
                  <td className="text-right tabular-nums">{pct(row.marked, row.total)}%</td>
                  <td className="text-xs text-zinc-600">
                    {row.notifiedAt ? `Notified ${new Date(row.notifiedAt).toLocaleString()}` : "Not yet notified"}
                  </td>
                </tr>
              ))}

              {!rows.length ? (
                <tr>
                  <td colSpan={11} className="px-3 py-8 text-center text-sm text-zinc-500">
                    No classrooms found for this filter.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className={`mt-6 overflow-hidden ${cardClass}`}>
        <div className="border-b border-zinc-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-zinc-950">Absent learners</h2>
          <p className="text-xs text-zinc-500">
            Attendance SMS is sent only when the guardian enabled Essential School Alerts for the learner&apos;s current phone.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[1000px] w-full text-sm">
            <thead className={tableHeadClass}>
              <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:text-left [&>th]:font-semibold">
                <th>Learner</th>
                <th>Class</th>
                <th>Guardian</th>
                <th>Phone</th>
                <th>Essential Alerts</th>
                <th>Note</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-zinc-100">
              {absentRows.map((mark) => {
                const name =
                  [mark.student.firstName, mark.student.lastName].filter(Boolean).join(" ").trim() ||
                  "Unnamed learner";

                const row = rowBySession.get(mark.sessionId);
                const phone = mark.student.guardianPhoneNorm || mark.student.guardianPhone || "—";

                return (
                  <tr key={mark.id} className="[&>td]:px-3 [&>td]:py-2 [&>td]:text-slate-900">
                    <td className="font-medium text-zinc-950">{name}</td>
                    <td>{row?.label ?? "Class"}</td>
                    <td>{mark.student.guardianName ?? "—"}</td>
                    <td>{phone}</td>
                    <td>
                      {(() => {
                        const eligibility = guardianEligibilityByStudent.get(mark.student.id);

                        if (eligibility?.eligible) {
                          return (
                            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
                              Enabled
                            </span>
                          );
                        }

                        if (eligibility?.reason === "NO_PHONE") {
                          return (
                            <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-medium text-rose-700">
                              Phone needed
                            </span>
                          );
                        }

                        if (eligibility?.reason === "PHONE_CHANGED") {
                          return (
                            <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">
                              Re-enable after phone change
                            </span>
                          );
                        }

                        return (
                          <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">
                            Not enabled
                          </span>
                        );
                      })()}
                    </td>
                    <td>{mark.note ?? "—"}</td>
                  </tr>
                );
              })}

              {!absentRows.length ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-sm text-zinc-500">
                    No absent learners for this date/filter.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
      </div>
</main>
  );
}