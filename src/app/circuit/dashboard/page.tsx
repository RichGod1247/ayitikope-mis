// src/app/circuit/dashboard/page.tsx
import GovernanceDashboardClient from "@/components/governance/GovernanceDashboardClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function CircuitDashboardPage() {
  return (
    <GovernanceDashboardClient
      endpoint="/api/circuit/overview"
      eyebrow="Circuit Oversight"
      title="SISO Circuit Dashboard"
      description="Monitor schools, learners, teachers, attendance signals, health alerts, assessments, and lesson delivery inside your authorized circuit."
    />
  );
}