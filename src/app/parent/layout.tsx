// src/app/parent/layout.tsx
import type { ReactNode } from "react";
import { cookies } from "next/headers";
import ParentSidebarNav from "@/components/ParentSidebarNav";
import {
  PARENT_COOKIE_NAME,
  verifyParentSessionToken,
} from "@/lib/parentSession";

export default async function ParentLayout({
  children,
}: {
  children: ReactNode;
}) {
  const cookieStore = await cookies();
  const token = cookieStore.get(PARENT_COOKIE_NAME)?.value ?? "";

  let hasValidParentSession = false;

  if (token) {
    try {
      hasValidParentSession = verifyParentSessionToken(token).ok;
    } catch {
      hasValidParentSession = false;
    }
  }

  if (!hasValidParentSession) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen bg-zinc-50">
      <ParentSidebarNav />
      {/* Authenticated Parent Portal chrome only after a verified parent session. */}
      <div className="flex-1 min-w-0 pt-12 md:pt-0">{children}</div>
    </div>
  );
}
