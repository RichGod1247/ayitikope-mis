// src/app/teacher-portal/page.tsx
import { redirect } from "next/navigation";
import { requireServerUserContext } from "@/lib/serverAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function TeacherPortalPage() {
  // If not signed in, your auth layer will redirect to /auth/signin
  // using redirectTo (role-aware routing still works as you designed).
  await requireServerUserContext({
    redirectTo: "/teacher/dashboard",
    requireTenant: true,
  });

  // If signed in, always land on the real teacher dashboard.
  redirect("/teacher/dashboard");
}
