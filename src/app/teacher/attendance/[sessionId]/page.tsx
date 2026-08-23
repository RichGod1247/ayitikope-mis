// src/app/teacher/attendance/[sessionId]/page.tsx
import { requireServerUserContext } from "@/lib/serverAuth";
import AttendanceSessionClient from "@/components/attendance/AttendanceSessionClient";

type PageProps = {
  params: Promise<{ sessionId: string }>;
  searchParams?: Promise<{ className?: string; date?: string }>;
};

function safeTrim(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s : null;
}

export default async function AttendanceSessionPage(props: PageProps) {
  const { sessionId } = await props.params;
  const sp = props.searchParams ? await props.searchParams : {};

  await requireServerUserContext({
    redirectTo: `/teacher/attendance/${encodeURIComponent(sessionId)}`,
    requireTenant: true,
  });

  const initialClassName = safeTrim(sp.className) ?? "Class";

  return (
    <AttendanceSessionClient
      sessionId={sessionId}
      initialClassName={initialClassName}
    />
  );
}
