// src/app/teacher/health/student-daily/page.tsx
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";
import StudentHealthDailyClient from "@/components/StudentHealthDailyClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Student Daily Health | EduLife OS",
  description: "Capture daily temperature and health notes for learners in your class.",
};

function todayISOInTimeZone(timeZone: string) {
  // en-CA reliably formats YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function isTeacherRole(roleName: string | null | undefined) {
  // tighten later if you want: only TEACHER. For now allow admins/headteachers too.
  return roleName === "TEACHER" || roleName === "ADMIN" || roleName === "HEADTEACHER";
}

export default async function StudentHealthDailyPage() {
  // ✅ Session-driven identity
  const safe = await requireServerUserContext({ requireTenant: true, redirectTo: "/teacher/health/student-daily" });

  if (!isTeacherRole(safe.roleName)) {
    // Don’t leak anything
    return (
      <main className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-3xl px-4 py-10">
          <h1 className="text-xl font-semibold text-slate-900">Forbidden</h1>
          <p className="mt-2 text-sm text-slate-600">Your account does not have access to this page.</p>
        </div>
      </main>
    );
  }

  // ✅ Membership gate (tenant-scoped)
  const membership = await prisma.membership.findFirst({
    where: { tenantId: safe.tenantId, userId: safe.userId, status: "ACTIVE" },
    select: { id: true },
  });
  if (!membership) {
    return (
      <main className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-3xl px-4 py-10">
          <h1 className="text-xl font-semibold text-slate-900">Forbidden</h1>
          <p className="mt-2 text-sm text-slate-600">No active membership for this school.</p>
        </div>
      </main>
    );
  }

  // ✅ Determine tenant timezone (for “today” correctness)
  const tenant = await prisma.tenant.findUnique({
    where: { id: safe.tenantId },
    select: { timezone: true, name: true },
  });
  const tz = tenant?.timezone || "Africa/Accra";
  const date = todayISOInTimeZone(tz);

  /**
   * ✅ Classroom selection (secure default)
   * Your schema doesn’t yet have a first-class “teacher assigned classrooms” join table.
   * So the only SAFE non-leaky default is:
   * - Use TeacherProfile.classLevel if present
   * - Only show data for classrooms matching that classLevel
   */
  const profile = await prisma.teacherProfile.findFirst({
    where: { tenantId: safe.tenantId, userId: safe.userId },
    select: { phase: true, classLevel: true },
  });

  if (!profile?.classLevel) {
    return (
      <main className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-3xl px-4 py-10">
          <h1 className="text-xl font-semibold text-slate-900">Class not assigned</h1>
          <p className="mt-2 text-sm text-slate-600">
            Your teacher profile has no classLevel assigned. Ask an admin to assign your class to enable student health logging.
          </p>
        </div>
      </main>
    );
  }

  // Find a classroom under this tenant matching teacher’s classLevel
  const classroom = await prisma.classroom.findFirst({
    where: {
      tenantId: safe.tenantId,
      OR: [{ grade: profile.classLevel }, { name: profile.classLevel }],
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true, grade: true, arm: true, tenantId: true },
  });

  if (!classroom) {
    return (
      <main className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-3xl px-4 py-10">
          <h1 className="text-xl font-semibold text-slate-900">Classroom not found</h1>
          <p className="mt-2 text-sm text-slate-600">
            No classroom under this school matches your assigned classLevel: <span className="font-semibold">{profile.classLevel}</span>.
          </p>
        </div>
      </main>
    );
  }

  // ✅ Tenant-scoped student fetch (no cross-tenant bleed)
  const studentsRaw = await prisma.student.findMany({
    where: { tenantId: safe.tenantId, classroomId: classroom.id },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: {
      id: true,
      firstName: true,
      lastName: true,
      guardianName: true,
      guardianPhone: true,
    },
  });

  const students = studentsRaw.map((s) => ({
    id: s.id,
    name: `${s.firstName} ${s.lastName}`,
    guardianName: s.guardianName,
    guardianPhone: s.guardianPhone,
  }));

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">Student Daily Health Log</h1>
            <p className="mt-1 text-sm text-slate-600">
              Record temperatures, symptoms and notes for each learner.
            </p>
          </div>
          <div className="text-xs text-slate-500">
            EduLife OS • {tenant?.name ?? "Teacher Portal"}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <StudentHealthDailyClient
            tenantId={safe.tenantId} // client may send it; server must never trust it
            classroomId={classroom.id}
            classroomName={classroom.name}
            date={date}
            students={students}
          />
        </div>
      </div>
    </main>
  );
}
