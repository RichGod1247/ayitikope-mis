// src/app/teacher/headteacher-appraisal/page.tsx
import { requireServerUserContext } from "@/lib/serverAuth";
import HeadteacherFeedbackClient from "./HeadteacherFeedbackClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function TeacherHeadteacherAppraisalPage() {
  await requireServerUserContext({
    redirectTo: "/teacher/headteacher-appraisal",
    requireTenant: true,
    requireRoleNames: ["TEACHER"],
  });

  return (
    <main className="min-h-screen bg-[#06101F] px-3 py-4 text-[#F7F4ED] sm:px-5 lg:px-8">
      <div className="mx-auto w-full max-w-5xl">
        <HeadteacherFeedbackClient />
      </div>
    </main>
  );
}
