// src/app/admin/staff/page.tsx
import StaffOnboardingCard from "@/app/admin/dashboard/StaffOnboardingCard";

export default function AdminStaffPage() {
  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Staff Onboarding</h1>
        <p className="text-sm text-zinc-600">
          Generate invite codes for Headteachers/Teachers/Parents. Codes are shown once.
        </p>
      </div>

      <StaffOnboardingCard />
    </div>
  );
}
