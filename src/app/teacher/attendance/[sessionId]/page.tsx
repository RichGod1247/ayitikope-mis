// src/app/teacher/attendance/[sessionId]/page.tsx
import { requireServerUserContext } from "@/lib/serverAuth";
import AttendanceSessionClient from "@/components/attendance/AttendanceSessionClient";

type PageProps = {
  params: { sessionId: string };
  searchParams?: { className?: string; date?: string; brand?: string };
};

function isoToday(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function safeTrim(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s : null;
}

function safeISODate(v: unknown): string | null {
  const s = safeTrim(v);
  if (!s) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

export default async function AttendanceSessionPage({ params, searchParams }: PageProps) {
  const sessionId = params.sessionId;

  const safe = await requireServerUserContext({
    redirectTo: `/teacher/attendance/${encodeURIComponent(sessionId)}`,
    requireTenant: true,
  });

  const initialClassName = safeTrim(searchParams?.className) ?? "Class";
  const initialDate = safeISODate(searchParams?.date) ?? isoToday();
  const initialBrand = safeTrim(searchParams?.brand) ?? "EDULIFE";

  return (
    <AttendanceSessionClient
      tenantId={safe.tenantId}
      teacherUserId={safe.userId}
      sessionId={sessionId}
      initialClassName={initialClassName}
      initialDate={initialDate}
      initialBrand={initialBrand}
    />
  );
}
