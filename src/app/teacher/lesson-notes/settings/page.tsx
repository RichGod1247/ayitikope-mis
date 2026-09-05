import { requireServerUserContext } from "@/lib/serverAuth";
import TeacherLessonTimetableSettingsClient from "./TeacherLessonTimetableSettingsClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function TeacherLessonNoteSettingsPage() {
  await requireServerUserContext({
    redirectTo: "/teacher/lesson-notes/settings",
    requireTenant: true,
    requireRoleNames: ["TEACHER"],
  });

  return <TeacherLessonTimetableSettingsClient />;
}
