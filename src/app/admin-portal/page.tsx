// src/app/admin-portal/page.tsx
import { redirect } from "next/navigation";
import { requireServerUserContext } from "@/lib/serverAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AdminPortalPage() {
  // Unified gateway: if not signed in, requireServerUserContext will redirect to /auth/signin
  // We intentionally use /app so your role-aware routing decides the correct dashboard.
  await requireServerUserContext({
    redirectTo: "/app",
    requireTenant: true,
  });

  // Signed in → let your role router send them where they belong.
  redirect("/app");
}
