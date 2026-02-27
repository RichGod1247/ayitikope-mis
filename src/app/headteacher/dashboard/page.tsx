// src/app/headteacher/dashboard/page.tsx
import { redirect } from "next/navigation";
import { requireHeadteacherContext } from "@/lib/headteacherAuth";
import HeadteacherDashboardClient from "./ui";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function toSignIn(callbackUrl: string, error?: string) {
  const p = new URLSearchParams();
  p.set("callbackUrl", callbackUrl);
  if (error) p.set("error", error);
  return `/auth/signin?${p.toString()}`;
}

export default async function HeadteacherDashboardPage() {
  // ✅ Bank-grade boundary:
  // If not authorized, no silent access. Return to sign-in with safe callbackUrl.
  try {
    await requireHeadteacherContext({ redirectTo: "/headteacher/dashboard" });
  } catch {
    redirect(toSignIn("/headteacher/dashboard", "FORBIDDEN"));
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Dashboard</h1>
        <p className="text-sm text-zinc-600">Weekly attendance pulse + pending certifications.</p>
      </div>

      <HeadteacherDashboardClient />
    </div>
  );
}
