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
  try {
    await requireHeadteacherContext({ redirectTo: "/headteacher/dashboard" });
  } catch {
    redirect(toSignIn("/headteacher/dashboard", "FORBIDDEN"));
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
        <p className="text-sm text-slate-600">
          Academic leadership, attendance oversight, lesson-note review, and parent result access.
        </p>
      </div>

      <HeadteacherDashboardClient />
    </div>
  );
}