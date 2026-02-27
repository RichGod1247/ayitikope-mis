// src/app/headteacher-portal/page.tsx
import { redirect } from "next/navigation";
import { requireServerUserContext } from "@/lib/serverAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function HeadteacherPortalPage() {
  // Unified gateway: no more tenantId/headUserId in query params.
  // If not signed in → redirect to /auth/signin (handled by requireServerUserContext).
  await requireServerUserContext({
    redirectTo: "/app",
    requireTenant: true,
  });

  // Signed in → role-aware routing decides whether this user is HEADTEACHER or ADMIN, etc.
  redirect("/app");
}
