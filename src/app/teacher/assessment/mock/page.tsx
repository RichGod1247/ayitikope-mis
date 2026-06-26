//src/app/teacher/assessment/mock/page.tsx
import { Suspense } from "react";
import MockAssessmentClient from "@/components/teacher/MockAssessmentClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default function TeacherMockAssessmentPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#06101F] px-4 py-6 text-[#F7F4ED]">
          <div className="mx-auto max-w-7xl rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-6 text-sm text-[#C9CDD6] shadow-[0_18px_60px_rgba(0,0,0,0.18)] backdrop-blur-xl">
            Loading BECE Mock cockpit…
          </div>
        </div>
      }
    >
      <MockAssessmentClient />
    </Suspense>
  );
}