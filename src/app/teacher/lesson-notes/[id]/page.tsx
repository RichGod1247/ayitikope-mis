// src/app/teacher/lesson-notes/[id]/page.tsx
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";
import LessonNoteEditorClient from "./ui/LessonNoteEditorClient";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: any }) {
  const p = await Promise.resolve(params);
  const noteId = p?.id;
  const ctx = await requireServerUserContext({
    redirectTo: `/teacher/lesson-notes/${encodeURIComponent(noteId)}`,
    requireTenant: true,
  });

  const membership = await prisma.membership.findFirst({
    where: { userId: ctx.userId, tenantId: ctx.tenantId, status: "ACTIVE" },
    select: { id: true },
  });

  if (!membership) redirect("/app/dashboard");

  // Keep props aligned with current client signature: { id: string }
  return <LessonNoteEditorClient id={noteId} />;
}
