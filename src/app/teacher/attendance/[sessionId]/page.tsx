import { requireServerUserContext } from "@/lib/serverAuth";
import AttendanceSessionClient from "@/components/attendance/AttendanceSessionClient";

type PageProps = {
  params: Promise<{ sessionId: string }>;
  searchParams?: Promise<{ className?: string; date?: string; brand?: string }>;
};

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
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

export default async function AttendanceSessionPage(props: PageProps) {
  const { sessionId } = await props.params;
  const sp = props.searchParams ? await props.searchParams : {};

  const safe = await requireServerUserContext({
    redirectTo: `/teacher/attendance/${encodeURIComponent(sessionId)}`,
    requireTenant: true,
  });

  const initialClassName = safeTrim(sp.className) ?? "Class";
  const initialDate = safeISODate(sp.date) ?? isoToday();
  const initialBrand = safeTrim(sp.brand) ?? "EDULIFE";

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
