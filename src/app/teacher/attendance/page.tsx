// src/app/teacher/attendance/page.tsx
import { requireServerUserContext } from "@/lib/serverAuth";
import TeacherAttendanceClient from "@/components/teacher/TeacherAttendanceClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function TeacherAttendancePage() {
  const ctx = await requireServerUserContext({
    redirectTo: "/teacher/attendance",
    requireTenant: true,
  });

  return <TeacherAttendanceClient teacherUserId={ctx.userId} />;
}
