// src/app/district/dashboard/page.tsx
import GovernanceDashboardClient from "@/components/governance/GovernanceDashboardClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function DistrictDashboardPage() {
  return (
    <GovernanceDashboardClient
      endpoint="/api/district/overview"
      eyebrow="District Oversight"
      title="District Education Dashboard"
      description="Monitor schools, circuits, learners, teachers, attendance signals, health alerts, assessments, and intervention priorities inside your authorized district."
    />
  );
}