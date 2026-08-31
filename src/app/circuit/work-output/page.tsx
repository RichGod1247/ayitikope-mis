import Link from "next/link";
import SissoWorkOutputClient from "./SissoWorkOutputClient";
import {
  CIRCUIT_GOVERNANCE_ROLES,
  requireGovernancePageContext,
} from "@/lib/governance/scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function CircuitWorkOutputPage() {
  await requireGovernancePageContext({
    allowedRoles: CIRCUIT_GOVERNANCE_ROLES,
    allowedZoneLevels: [1],
    redirectTo: "/circuit/work-output",
  });

  return (
    <main className="min-h-screen bg-[#040A12] text-[#F7F4ED]">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-3 pb-3 pt-4 sm:px-5 lg:px-6">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-200">
            SISSO Circuit Command
          </div>
          <h1 className="mt-1 text-xl font-semibold">Teacher Work Output</h1>
        </div>

        <Link
          href="/circuit/dashboard"
          className="inline-flex min-h-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-[11px] font-semibold text-[#E8EBF0] transition hover:bg-white/[0.08]"
        >
          Back to Circuit
        </Link>
      </div>

      <SissoWorkOutputClient />
    </main>
  );
}
