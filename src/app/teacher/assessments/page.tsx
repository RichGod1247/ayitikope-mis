// src/app/teacher/assessments/page.tsx
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function TeacherAssessmentsRedirectPage() {
  redirect("/teacher/assessment");
}