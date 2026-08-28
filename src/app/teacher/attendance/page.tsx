import { requireServerUserContext } from "@/lib/serverAuth";
import { loadAttendanceAcademicCalendar } from "@/lib/server/attendanceAcademicCalendar";
import TeacherAttendanceClient from "@/components/teacher/TeacherAttendanceClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function TeacherAttendancePage() {
  const ctx = await requireServerUserContext({
    redirectTo: "/teacher/attendance",
    requireTenant: true,
  });

  const academicCalendar = await loadAttendanceAcademicCalendar(ctx.tenantId);

  return (
    <TeacherAttendanceClient
      teacherUserId={ctx.userId}
      academicCalendar={academicCalendar}
    />
  );
}
