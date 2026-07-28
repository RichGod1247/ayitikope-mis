import Link from "next/link";
import { requireServerUserContext } from "@/lib/serverAuth";
import {
  readHeadteacherOwnAppraisalState,
  type HeadteacherOwnAppraisalReadState,
} from "@/lib/appraisals/headteacherFeedbackReadStates";
import HeadteacherReleasedResultClient from "./HeadteacherReleasedResultClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const HEADTEACHER_RELEASED_RESULT_PAGE_POLICY = {
  audience: "HEADTEACHER",
  route: "/headteacher/my-appraisal",
  stateSource: "HEADTEACHER_FEEDBACK_READ_ONLY_STATE",
  releasedResultSource: "H2_NO_STORE_API",
  automaticResultLoadingAllowed: false,
  dashboardEntriesAdded: 1,
  dashboardOrderChanged: false,
  resultMutationAllowed: false,
  respondentIdentitiesIncluded: false,
  individualStaffResponsesIncluded: false,
  itemLevelValuesIncluded: false,
  combinedScoreIncluded: false,
  notificationsSeeded: false,
  providerCallsAllowed: false,
} as const;

export default async function HeadteacherMyAppraisalPage() {
  const auth = await requireServerUserContext({
    redirectTo: "/headteacher/my-appraisal",
    requireTenant: true,
    requireRoleNames: ["HEADTEACHER"],
  });

  let initialState: HeadteacherOwnAppraisalReadState | null = null;

  try {
    initialState = await readHeadteacherOwnAppraisalState({
      actorUserId: auth.userId,
      actorRoleName: auth.roleName,
      tenantId: auth.tenantId,
    });
  } catch {
    initialState = null;
  }

  return (
    <main className="mx-auto w-full max-w-5xl space-y-5 px-3 py-4 sm:px-5 sm:py-6">
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/headteacher/dashboard"
          className="inline-flex min-h-11 items-center rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-[#F7F4ED] transition hover:bg-white/10"
        >
          ← Dashboard
        </Link>
      </div>

      <HeadteacherReleasedResultClient initialState={initialState} />
    </main>
  );
}
