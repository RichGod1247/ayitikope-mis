//src/app/headteacher/assessment/overview/page.tsx
import { Suspense } from "react";
import HeadteacherAssessmentOverviewClient from "./HeadteacherAssessmentOverviewClient";

export default function HeadteacherAssessmentOverviewPage() {
  return (
    <Suspense
      fallback={
        <div className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-6 text-sm text-[#C9CDD6] shadow-[0_18px_60px_rgba(0,0,0,0.18)] backdrop-blur-xl">
          Loading assessment overview…
        </div>
      }
    >
      <HeadteacherAssessmentOverviewClient />
    </Suspense>
  );
}