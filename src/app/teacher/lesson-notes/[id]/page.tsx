// src/app/teacher/lesson-notes/[id]/page.tsx
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";
import LessonNoteEditorClient from "./ui/LessonNoteEditorClient";

export const dynamic = "force-dynamic";

function clean(v: unknown) {
  return String(v ?? "").trim();
}

export default async function Page({ params }: { params: any }) {
  const p = await Promise.resolve(params);
  const noteId = clean(p?.id);

  const ctx = await requireServerUserContext({
    redirectTo: `/teacher/lesson-notes/${encodeURIComponent(noteId)}`,
    requireTenant: true,
  });

  const membership = await prisma.membership.findFirst({
    where: { userId: ctx.userId, tenantId: ctx.tenantId, status: "ACTIVE" },
    select: { id: true },
  });

  if (!membership) redirect("/app/dashboard");

  // ✅ Bank-grade: server scope enforcement (no leaking other teachers' notes)
  const exists = await prisma.lessonNote.findFirst({
    where: { id: noteId, tenantId: ctx.tenantId, teacherUserId: ctx.userId },
    select: { id: true },
  });

  if (!exists) return notFound();

  // Surprise stays for print page (image + signature)
  return <LessonNoteEditorClient id={noteId} />;
}