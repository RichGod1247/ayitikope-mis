// src/app/district/director-feedback/page.tsx
import DirectorFeedbackRequestClient from "./DirectorFeedbackRequestClient";
import { requireGovernancePageContext } from "@/lib/governance/scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function DistrictDirectorFeedbackPage() {
  await requireGovernancePageContext({
    allowedRoles: ["DISTRICT_DIRECTOR"],
    allowedZoneLevels: [2],
    redirectTo: "/district/director-feedback",
  });

  return (
    <main className="min-h-screen bg-[#06101F] px-3 py-4 text-[#F7F4ED] sm:px-5 lg:px-8">
      <div className="mx-auto w-full max-w-5xl">
        <DirectorFeedbackRequestClient />
      </div>
    </main>
  );
}
