// src/app/teacher/lesson-notes/page.tsx
import { requireServerUserContext } from "@/lib/serverAuth";
import LessonNotesListClient from "./ui/LessonNotesListClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  // Bank-grade rule: server must gate access (no client-only guarding).
  await requireServerUserContext({ redirectTo: "/auth/login", requireTenant: true });

  return <LessonNotesListClient />;
}
