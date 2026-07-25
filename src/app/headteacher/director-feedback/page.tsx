// src/app/headteacher/director-feedback/page.tsx
import DirectorFeedbackClient from "./DirectorFeedbackClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function HeadteacherDirectorFeedbackPage() {
  return (
    <main className="min-h-screen bg-[#06101F] px-3 py-4 text-[#F7F4ED] sm:px-5 lg:px-8">
      <div className="mx-auto w-full max-w-6xl">
        <DirectorFeedbackClient />
      </div>
    </main>
  );
}
