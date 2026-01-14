// src/app/teacher/lesson-notes/studio/page.tsx
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";
import LessonNotesStudioClient from "./ui/LessonNotesStudioClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  const ctx = await requireServerUserContext({
    redirectTo: "/teacher/lesson-notes/studio",
    requireTenant: true,
  });

  const membership = await prisma.membership.findFirst({
    where: { userId: ctx.userId, tenantId: ctx.tenantId, status: "ACTIVE" },
    select: { id: true },
  });

  if (!membership) redirect("/app/dashboard");

  return <LessonNotesStudioClient />;
}
