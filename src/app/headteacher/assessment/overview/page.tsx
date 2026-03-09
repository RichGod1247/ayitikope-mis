//src/app/headteacher/assessment/overview/page.tsx
import { Suspense } from "react";
import HeadteacherAssessmentOverviewClient from "./HeadteacherAssessmentOverviewClient";

export default function HeadteacherAssessmentOverviewPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50">
          <div className="container mx-auto px-4 py-8 text-sm text-slate-600">
            Loading assessment overview…
          </div>
        </div>
      }
    >
      <HeadteacherAssessmentOverviewClient />
    </Suspense>
  );
}
