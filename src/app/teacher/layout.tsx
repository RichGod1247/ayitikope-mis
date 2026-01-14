// src/app/teacher/layout.tsx
import type { ReactNode } from "react";
import { requireServerUserContext } from "@/lib/serverAuth";

export const dynamic = "force-dynamic";

export default async function TeacherLayout({
  children,
}: {
  children: ReactNode;
}) {
  // This MUST redirect to the teacher gateway when not signed in.
  // If you redirect to "/", you’re effectively hiding the auth problem.
  await requireServerUserContext({
    redirectTo: "/teacher-portal?next=/teacher/dashboard",
    requireTenant: true,
  });

  return <>{children}</>;
}
