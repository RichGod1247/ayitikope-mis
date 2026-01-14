// src/app/headteacher/lesson-notes/page.tsx
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireHeadteacherContext } from "@/lib/headteacherAuth";
import HeadteacherLessonNotesClient from "@/components/headteacher/HeadteacherLessonNotesClient";

export const metadata: Metadata = {
  title: "Lesson Notes Review | EduLife OS",
  description: "Headteacher review inbox for lesson notes in EduLife OS.",
};

export const dynamic = "force-dynamic";

export default async function HeadteacherLessonNotesPage() {
  try {
    await requireHeadteacherContext({ redirectTo: "/headteacher/lesson-notes" });
  } catch {
    redirect("/teacher/dashboard");
  }

  return <HeadteacherLessonNotesClient />;
}
