// src/app/district/dashboard/page.tsx
import GovernanceDashboardClient from "@/components/governance/GovernanceDashboardClient";
import GovernanceSentNoticeAccountabilityClient from "@/components/governance/GovernanceSentNoticeAccountabilityClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function DistrictDashboardPage() {
  return (
    <div className="space-y-6">
      <GovernanceDashboardClient
        endpoint="/api/district/overview"
        eyebrow="District Oversight"
        title="District Education Dashboard"
        description="Monitor schools, circuits, learners, teachers, attendance signals, health alerts, assessments, and intervention priorities inside your authorized district."
      />

      <GovernanceSentNoticeAccountabilityClient />
    </div>
  );
}