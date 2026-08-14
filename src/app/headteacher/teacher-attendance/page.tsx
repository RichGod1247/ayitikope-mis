import Link from "next/link";
import { redirect } from "next/navigation";
import { requireHeadteacherContext } from "@/lib/headteacherAuth";
import { readTeacherAttendanceFeatureState } from "@/lib/platformFeatures";
import TeacherAttendanceClient from "./ui";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function toSignIn(callbackUrl: string, error?: string) {
  const p = new URLSearchParams();
  p.set("callbackUrl", callbackUrl);
  if (error) p.set("error", error);
  return `/auth/signin?${p.toString()}`;
}

export default async function HeadteacherTeacherAttendancePage() {
  try {
    await requireHeadteacherContext({
      redirectTo: "/headteacher/teacher-attendance",
    });
  } catch {
    redirect(toSignIn("/headteacher/teacher-attendance", "FORBIDDEN"));
  }

  const feature = await readTeacherAttendanceFeatureState();

  if (!feature.enabled) {
    return (
      <div className="mx-auto max-w-3xl p-4 md:p-6">
        <section className="rounded-[28px] border border-amber-300/25 bg-[linear-gradient(135deg,#171407,#231D0B,#0B1321)] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.20)] md:p-6">
          <span className="inline-flex rounded-full border border-amber-300/25 bg-amber-400/10 px-3 py-1 text-xs font-bold text-amber-100">
            Temporarily unavailable
          </span>

          <h1 className="mt-4 text-2xl font-bold text-white">
            Teacher Attendance is currently deactivated
          </h1>

          <p className="mt-3 text-sm leading-7 text-slate-200">
            EduLife OS is keeping this staff-accountability feature off while
            institutional safeguards for fair use are being finalized. Existing
            Teacher Attendance records remain protected and unchanged. Student
            Attendance continues to work normally.
          </p>

          <p className="mt-3 text-sm leading-7 text-amber-100/85">
            When the Superadmin activates the feature, refresh this page or return
            from the dashboard to open the workspace again.
          </p>

          <Link
            href="/headteacher/dashboard"
            className="mt-5 inline-flex min-h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm font-bold text-white transition hover:bg-white/15"
          >
            Return to dashboard
          </Link>
        </section>
      </div>
    );
  }

  return <TeacherAttendanceClient />;
}
