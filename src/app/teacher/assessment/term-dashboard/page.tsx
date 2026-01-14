// src/app/teacher/assessment/term-dashboard/page.tsx
import { requireServerUserContext } from "@/lib/serverAuth";
import TeacherTermDashboardClient from "@/components/teacher/TeacherTermDashboardClient";

export const dynamic = "force-dynamic";

export default async function TeacherTermDashboardPage() {
  await requireServerUserContext({
    redirectTo: "/teacher/assessment/term-dashboard",
    requireTenant: true,
  });

  return <TeacherTermDashboardClient />;
}
