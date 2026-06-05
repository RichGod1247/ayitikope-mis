// src/app/circuit/dashboard/page.tsx
import GovernanceDashboardClient from "@/components/governance/GovernanceDashboardClient";
import GovernanceSentNoticeAccountabilityClient from "@/components/governance/GovernanceSentNoticeAccountabilityClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function CircuitDashboardPage() {
  return (
    <div className="space-y-6">
      <GovernanceDashboardClient
        endpoint="/api/circuit/overview"
        eyebrow="Circuit Oversight"
        title="SISO Circuit Dashboard"
        description="Monitor schools, learners, teachers, attendance signals, health alerts, assessments, and lesson delivery inside your authorized circuit."
      />

      <GovernanceSentNoticeAccountabilityClient
        mode="jurisdiction"
        title="Circuit notice accountability"
        description="Track official notices sent inside your authorized circuit, including SISSO-to-headteacher and SISSO-to-teacher communications, delivery status, acknowledgements, and responses."
      />
    </div>
  );
}