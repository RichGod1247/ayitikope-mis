// src/app/teacher/assessment/student-report/page.tsx
import { requireServerUserContext } from "@/lib/serverAuth";
import TeacherStudentTermReportClient from "@/components/teacher/TeacherStudentTermReportClient";

export const dynamic = "force-dynamic";

export default async function TeacherStudentReportPage() {
  await requireServerUserContext({
    redirectTo: "/teacher/assessment/student-report",
    requireTenant: true,
  });

  return <TeacherStudentTermReportClient />;
}
