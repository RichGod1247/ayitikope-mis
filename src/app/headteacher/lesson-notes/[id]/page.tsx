// src/app/headteacher/lesson-notes/[id]/page.tsx
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireHeadteacherContext } from "@/lib/headteacherAuth";
import HeadteacherLessonNoteReviewClient from "@/components/headteacher/HeadteacherLessonNoteReviewClient";

export const metadata: Metadata = {
  title: "Review Lesson Note | EduLife OS",
  description: "Headteacher review screen for a single lesson note.",
};

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

export default async function HeadteacherLessonNotePage({ params }: PageProps) {
  const { id } = await params;

  try {
    await requireHeadteacherContext({ redirectTo: `/headteacher/lesson-notes/${encodeURIComponent(id)}` });
  } catch {
    redirect("/teacher/dashboard");
  }

  return <HeadteacherLessonNoteReviewClient noteId={String(id)} />;
}
