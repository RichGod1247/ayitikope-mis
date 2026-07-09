// src/app/teacher/appraisals/page.tsx
import { requireServerUserContext } from "@/lib/serverAuth";
import TeacherAppraisalsClient from "./ui";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function TeacherAppraisalsPage() {
  await requireServerUserContext({
    redirectTo: "/teacher/appraisals",
    requireTenant: true,
    requireRoleNames: ["TEACHER", "HEADTEACHER", "SCHOOL_ADMIN", "SUPERADMIN"],
  });

  return <TeacherAppraisalsClient />;
}
