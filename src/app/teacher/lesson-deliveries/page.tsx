// src/app/teacher/lesson-deliveries/page.tsx
import { requireServerUserContext } from "@/lib/serverAuth";
import TeacherLessonDeliveriesClient from "@/components/teacher/TeacherLessonDeliveriesClient";

export const dynamic = "force-dynamic";

export default async function TeacherLessonDeliveriesPage() {
  await requireServerUserContext({
    redirectTo: "/teacher/lesson-deliveries",
    requireTenant: true,
    requireRoleNames: ["TEACHER", "HEADTEACHER", "ADMIN", "SCHOOL_ADMIN", "SUPERADMIN"],
  });

  return <TeacherLessonDeliveriesClient />;
}