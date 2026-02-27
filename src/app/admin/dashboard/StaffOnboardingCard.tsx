// src/app/admin/dashboard/StaffOnboardingCard.tsx
import StaffOnboardingClient from "@/app/admin/staff/StaffOnboardingClient";

export default function StaffOnboardingCard() {
  return (
    <div className="rounded-2xl border bg-white p-6 shadow-sm space-y-3">
      <div>
        <p className="text-sm font-semibold text-zinc-900">Staff onboarding codes</p>
        <p className="text-xs text-zinc-600 mt-1">
          Generate and deliver TEACHER/HEADTEACHER codes via SMS + Email (15 minutes).
          Parent codes remain day-based.
        </p>
      </div>

      <StaffOnboardingClient embedded />
    </div>
  );
}