// src/app/students/contacts/page.tsx
import { requireServerUserContext } from "@/lib/serverAuth";
import StudentContactsPageClient from "@/components/StudentContactsPageClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function StudentContactsPage() {
  await requireServerUserContext({
    redirectTo: "/students/contacts",
    requireTenant: true,
    requireRoleNames: ["SCHOOL_ADMIN", "HEADTEACHER", "SUPERADMIN"],
  });

  return <StudentContactsPageClient />;
}