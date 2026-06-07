// src/app/apply/governance/page.tsx
import GovernanceApplicationClient from "./GovernanceApplicationClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function GovernanceApplicationPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <GovernanceApplicationClient />
    </main>
  );
}