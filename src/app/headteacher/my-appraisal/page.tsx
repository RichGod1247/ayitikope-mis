import { requireServerUserContext } from "@/lib/serverAuth";
import {
  readHeadteacherOwnAppraisalState,
  type HeadteacherOwnAppraisalReadState,
} from "@/lib/appraisals/headteacherFeedbackReadStates";
import HeadteacherReleasedResultClient from "./HeadteacherReleasedResultClient";
import HeadteacherGovernanceReleasedResultsClient from "./HeadteacherGovernanceReleasedResultsClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const HEADTEACHER_RELEASED_RESULT_PAGE_POLICY = {
  audience: "HEADTEACHER",
  route: "/headteacher/my-appraisal",
  stateSource: "HEADTEACHER_FEEDBACK_READ_ONLY_STATE",
  releasedResultSource: "H2_NO_STORE_API",
  governanceReleasedResultSource: "INDEPENDENT_GOVERNANCE_NO_STORE_API",
  independentRecipientSections: [
    "STAFF_FEEDBACK_APPRAISALS",
    "GOVERNANCE_APPRAISAL_REPORTS",
  ] as const,
  automaticResultLoadingAllowed: false,
  dashboardEntriesAdded: 1,
  dashboardOrderChanged: false,
  resultMutationAllowed: false,
  respondentIdentitiesIncluded: false,
  individualStaffResponsesIncluded: false,
  governanceAssessorIdentityIncluded: false,
  governanceAssessorOfficeIncluded: true,
  itemLevelValuesIncluded: false,
  governanceItemLevelValuesIncluded: true,
  combinedScoreIncluded: false,
  governanceStaffFeedbackPrerequisite: false,
  notificationsSeeded: false,
  providerCallsAllowed: false,
  bbcFriendlyRecipientLayout: true,
  staffFeedbackControlsOwnedByClient: true,
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
      <HeadteacherReleasedResultClient initialState={initialState} />
      <HeadteacherGovernanceReleasedResultsClient />
    </main>
  );
}
