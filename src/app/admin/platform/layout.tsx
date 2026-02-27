// src/app/admin/platform/layout.tsx
import { redirect } from "next/navigation";
import { requireServerUserContext } from "@/lib/serverAuth";

export const dynamic = "force-dynamic";

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireServerUserContext({ redirectTo: "/admin/platform/invite-school" } as any);

  const roleName = (ctx as any)?.roleName ?? (ctx as any)?.role?.name ?? "";
  if (roleName !== "SUPERADMIN") {
    redirect("/auth/signin?error=FORBIDDEN&callbackUrl=%2Fadmin%2Fplatform%2Finvite-school");
  }

  return <>{children}</>;
}