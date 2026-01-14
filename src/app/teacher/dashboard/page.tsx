// src/app/teacher/dashboard/page.tsx
import TeacherDashboardClient from "@/components/TeacherDashboardClient";
import { requireServerUserContext } from "@/lib/serverAuth";
import { getTeacherDashboardSnapshot } from "@/lib/teacherDashboard";

export const dynamic = "force-dynamic";

function buildHere(searchParams?: Record<string, string | string[] | undefined>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams ?? {})) {
    if (typeof v === "string" && v.length) p.set(k, v);
    else if (Array.isArray(v)) v.forEach((x) => typeof x === "string" && x.length && p.append(k, x));
  }
  const qs = p.toString();
  return qs ? `/teacher/dashboard?${qs}` : `/teacher/dashboard`;
}

export default async function TeacherDashboardPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const here = buildHere(searchParams);

  const safe = await requireServerUserContext({
    redirectTo: here, // ✅ send them back to THIS dashboard, not teacher-portal
    requireTenant: true,
  });

  const term = (typeof searchParams?.term === "string" && searchParams.term) || "1st Term";
  const academicYear =
    (typeof searchParams?.academicYear === "string" && searchParams.academicYear) || "2025/2026";

  const weekRaw = typeof searchParams?.week === "string" ? searchParams.week : null;
  const weekNumber = weekRaw && /^\d+$/.test(weekRaw) ? Number(weekRaw) : null;

  const snapshot = await getTeacherDashboardSnapshot({
    tenantId: safe.tenantId,
    teacherUserId: safe.userId,
    term,
    academicYear,
    weekNumber,
  });

  return (
    <main className="min-h-screen bg-zinc-50">
      <TeacherDashboardClient
        snapshot={snapshot}
        tenantId={safe.tenantId}
        teacherUserId={safe.userId}
        defaultTerm={term}
        defaultAcademicYear={academicYear}
      />
    </main>
  );
}
