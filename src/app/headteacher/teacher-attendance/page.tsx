// src/app/headteacher/teacher-attendance/page.tsx
import { redirect } from "next/navigation";
import { requireHeadteacherContext } from "@/lib/headteacherAuth";
import TeacherAttendanceClient from "./ui";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function toSignIn(callbackUrl: string, error?: string) {
  const p = new URLSearchParams();
  p.set("callbackUrl", callbackUrl);
  if (error) p.set("error", error);
  return `/auth/signin?${p.toString()}`;
}

export default async function HeadteacherTeacherAttendancePage() {
  try {
    await requireHeadteacherContext({ redirectTo: "/headteacher/teacher-attendance" });
  } catch {
    redirect(toSignIn("/headteacher/teacher-attendance", "FORBIDDEN"));
  }

  return <TeacherAttendanceClient />;
}
