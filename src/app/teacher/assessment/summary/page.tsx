// src/app/teacher/assessment/summary/page.tsx
import { requireServerUserContext } from "@/lib/serverAuth";
import TeacherAssessmentSummaryClient from "@/components/teacher/TeacherAssessmentSummaryClient";

export const dynamic = "force-dynamic";

export default async function TeacherAssessmentSummaryPage() {
  await requireServerUserContext({
    redirectTo: "/teacher/assessment/summary",
    requireTenant: true,
  });

  return <TeacherAssessmentSummaryClient />;
}
