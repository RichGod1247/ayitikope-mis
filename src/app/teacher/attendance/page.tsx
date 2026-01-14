// src/app/teacher/attendance/page.tsx

import { requireServerUserContext } from "@/lib/serverAuth";
import TeacherAttendanceClient from "@/components/teacher/TeacherAttendanceClient";

export default async function TeacherAttendancePage() {
  const ctx = await requireServerUserContext({
    redirectTo: "/teacher/attendance",
    requireTenant: true,
  });

  return <TeacherAttendanceClient tenantId={ctx.tenantId} />;
}
