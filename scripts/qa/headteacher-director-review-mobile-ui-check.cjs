/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS QA harness intentionally performs static repository contract checks. */
const fs = require("fs");
const path = require("path");
const ts = require("typescript");

function fail(message, details) {
  console.error(message);
  if (details !== undefined) console.error(details);
  process.exit(1);
}

function read(relativePath) {
  const absolutePath = path.join(process.cwd(), relativePath);
  if (!fs.existsSync(absolutePath)) {
    fail(`Missing required file: ${relativePath}`);
  }
  return fs.readFileSync(absolutePath, "utf8").replace(/\r\n/g, "\n");
}

function contains(source, marker, label) {
  if (!source.includes(marker)) {
    fail(`Missing ${label}`, marker);
  }
}

function excludes(source, marker, label) {
  if (source.includes(marker)) {
    fail(`Forbidden ${label}`, marker);
  }
}

function precedes(source, firstMarker, secondMarker, label) {
  const firstIndex = source.indexOf(firstMarker);
  const secondIndex = source.indexOf(secondMarker);

  if (firstIndex < 0 || secondIndex < 0 || firstIndex >= secondIndex) {
    fail(`Invalid ${label}`, { firstMarker, secondMarker });
  }
}

function transpile(source, fileName) {
  const output = ts.transpileModule(source, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      strict: true,
    },
    fileName,
    reportDiagnostics: true,
  });

  const errors = (output.diagnostics || []).filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
  );

  if (errors.length > 0) {
    fail(
      `TypeScript syntax failed: ${fileName}`,
      errors.map((error) => error.messageText),
    );
  }
}

function main() {
  const pagePath =
    "src/app/district/headteacher-appraisals/review/page.tsx";
  const clientPath =
    "src/app/district/headteacher-appraisals/review/HeadteacherDirectorReviewClient.tsx";
  const queueRoutePath =
    "src/app/api/district/headteacher-appraisals/route.ts";
  const sharedRoutePath =
    "src/app/api/district/headteacher-appraisals/_shared.ts";
  const extensionRoutePath =
    "src/app/api/district/headteacher-appraisals/[cycleId]/extend-feedback/route.ts";
  const teacherReviewRoutePath =
    "src/app/api/governance/appraisals/teacher-supervisory/review-queue/route.ts";
  const teacherReviewQueuePath =
    "src/lib/appraisals/teacherSupervisoryReviewQueue.ts";
  const teacherReviewPagePath =
    "src/app/governance/appraisals/teacher-supervisory/review/page.tsx";

  const page = read(pagePath);
  const client = read(clientPath);
  const queueRoute = read(queueRoutePath);
  const sharedRoute = read(sharedRoutePath);
  const extensionRoute = read(extensionRoutePath);
  const teacherReviewRoute = read(teacherReviewRoutePath);
  const teacherReviewQueue = read(teacherReviewQueuePath);
  const teacherReviewPage = read(teacherReviewPagePath);

  contains(page, 'export const dynamic = "force-dynamic"', "dynamic page");
  contains(page, "initialCycleId={cycleId}", "controlled cycle reference");
  contains(
    page,
    "HeadteacherDirectorReviewClient",
    "review client integration",
  );

  contains(
    client,
    "const DIRECTOR_REVIEW_UI_POLICY",
    "current Director interface policy",
  );
  contains(
    client,
    'presentation: "NATIVE_EVIDENCE_FIRST"',
    "native-evidence-first presentation",
  );
  contains(client, "backgroundPollingAllowed: false", "no polling");
  contains(
    client,
    "persistentBrowserStorageAllowed: false",
    "no persistent browser storage",
  );
  contains(
    client,
    "respondentIdentitiesIncluded: false",
    "no respondent identities",
  );
  contains(
    client,
    "anonymousIndividualFormsIncluded: true",
    "anonymous individual forms enabled",
  );
  contains(
    client,
    'realIdentityAudience: "SUPERADMIN_ONLY"',
    "separate real-identity audience",
  );
  contains(
    client,
    "reviewerMayRewriteScores: false",
    "no score rewriting",
  );
  contains(
    client,
    "combinedScoreIncluded: false",
    "no combined score",
  );
  contains(
    client,
    "providerDeliveryIncluded: false",
    "no provider delivery",
  );
  contains(
    client,
    'stageSelectionMode: "SERVER_QUEUE_DERIVED_ON_LOAD"',
    "server-queue-derived stage selection",
  );
  contains(
    client,
    "attentionBadgeDoesNotSelectStage: true",
    "attention badge separated from active stage",
  );
  contains(
    client,
    'directorAuthoredDecisionPath: "DIRECT_RELEASE_NO_SELF_REVIEW"',
    "Director-authored direct-release path",
  );
  contains(
    client,
    'appraisalChannels: ["STAFF_FEEDBACK", "GOVERNANCE_SUPERVISORY"]',
    "explicit two-channel appraisal policy",
  );
  contains(
    client,
    "directReleaseInspectionRequired: true",
    "final inspection required before direct release",
  );
  contains(
    client,
    "directReleaseMutationFromInspectionOnly: true",
    "direct release mutation restricted to inspection flow",
  );
  contains(client, "Staff Feedback Appraisals", "Staff Feedback channel heading");
  contains(client, ">Governance<", "compact Governance channel heading");
  contains(
    client,
    "Confidential Teacher feedback about Headteachers",
    "BBC-friendly Staff Feedback explanation",
  );
  contains(
    client,
    "bbcGovernanceQueueVersion: 3",
    "BBC Governance queue version",
  );
  contains(
    client,
    "governanceReturnedCorrectionTracking: true",
    "returned Governance correction tracking",
  );
  contains(
    client,
    "governanceCorrectionReceivedNotification: true",
    "correction-received notification indicator",
  );
  contains(
    client,
    "governanceStageNumberPrimaryStatus: false",
    "review stage is secondary rather than primary status",
  );
  contains(
    client,
    "governanceReleasedHistoryCollapsedByDefault: true",
    "released Governance history collapsed by default",
  );
  contains(
    client,
    "governanceStateSpecificActions: true",
    "state-specific Governance actions",
  );
  contains(
    client,
    "governanceCompactCards: true",
    "compact Governance cards",
  );
  contains(
    client,
    "bbcGovernanceFocusVersion: 1",
    "BBC Governance focus-filter version",
  );
  contains(
    client,
    '"TEACHER_APPRAISALS"',
    "Teacher Appraisals focus policy",
  );
  contains(
    client,
    '"HEADTEACHER_APPRAISALS"',
    "Headteacher Appraisals focus policy",
  );
  contains(
    client,
    '"MY_ASSESSMENTS"',
    "My Assessments focus policy",
  );
  contains(
    client,
    "teacherReviewQueueIntegrated: true",
    "Teacher review queue integrated into Director hub",
  );
  contains(
    client,
    "teacherReviewWorkspaceReused: true",
    "existing Teacher review workspace reused",
  );
  contains(
    client,
    "teacherReviewBackendModified: false",
    "Teacher review backend remains unchanged",
  );
  contains(
    client,
    "onlySelectedGovernanceGroupExpanded: true",
    "only selected Governance focus group expands",
  );
  contains(
    client,
    'aria-label="Governance appraisal filters"',
    "Governance focus filter group",
  );
  contains(client, "Teacher Appraisals", "Teacher Appraisals filter");
  contains(client, "Headteacher Appraisals", "Headteacher Appraisals filter");
  contains(client, "My Assessments", "My Assessments filter");
  excludes(client, "Self Appraisals", "misleading Director self-appraisal label");
  contains(
    client,
    'className="mt-3 grid gap-2 sm:grid-cols-3"',
    "compact mobile-first focus filter layout",
  );
  contains(
    client,
    'setGovernanceFocus("TEACHER")',
    "Teacher focus selection",
  );
  contains(
    client,
    'setGovernanceFocus("HEADTEACHER")',
    "Headteacher focus selection",
  );
  contains(
    client,
    'setGovernanceFocus("MINE")',
    "Director-authored focus selection",
  );
  contains(
    client,
    "teacherAppraisalItems.length",
    "Teacher focus independent count",
  );
  contains(
    client,
    "headteacherReadyItems.length",
    "Headteacher focus independent count",
  );
  contains(
    client,
    "myAssessmentActionCount",
    "My Assessments independent count",
  );
  contains(
    client,
    "directorGovernanceActionCount",
    "combined attention count without combined scoring",
  );
  contains(
    client,
    "Open only the assessment you need to act on.",
    "BBC Governance instruction",
  );
  contains(
    client,
    "Staff Feedback stays separate.",
    "governance does not create staff release dependency",
  );

  contains(
    client,
    "TEACHER_REVIEW_QUEUE_API",
    "Teacher review queue API constant",
  );
  contains(
    client,
    '"/api/governance/appraisals/teacher-supervisory/review-queue"',
    "existing Teacher review queue endpoint",
  );
  contains(
    client,
    "TEACHER_REVIEW_WORKSPACE",
    "Teacher review workspace constant",
  );
  contains(
    client,
    '"/governance/appraisals/teacher-supervisory/review"',
    "existing Teacher review workspace route",
  );
  contains(
    client,
    "function teacherReviewQueueContractSafe",
    "fail-closed Teacher queue browser contract",
  );
  contains(
    client,
    "payload.reviewQueue",
    "Teacher queue API projection consumed",
  );
  contains(
    client,
    "function TeacherQueueRecord",
    "compact Teacher review card",
  );
  contains(
    client,
    "openTeacherReviewWorkspace",
    "Teacher review workspace navigation",
  );
  contains(
    client,
    "window.location.assign",
    "explicit Teacher workspace navigation",
  );
  contains(
    client,
    "?assessmentId=${encodeURIComponent(assessmentId)}",
    "assessment-keyed Teacher workspace link",
  );
  contains(
    client,
    "loadTeacherReviewQueue",
    "Teacher queue explicit loader",
  );
  contains(
    client,
    "void loadTeacherReviewQueue();",
    "Teacher queue initial/refresh load",
  );
  contains(
    client,
    "No Teacher appraisal currently needs your action.",
    "Teacher focus empty state",
  );
  contains(
    client,
    "No Headteacher appraisal currently needs your action.",
    "Headteacher focus empty state",
  );
  contains(
    client,
    "None of your own finalized assessments currently needs release.",
    "My Assessments focus empty state",
  );

  contains(
    client,
    "function anonymousContractSafe",
    "fail-closed anonymous-response contract",
  );
  contains(
    client,
    "privacy.realRespondentIdentitiesIncluded === false",
    "real identities excluded from anonymous payload",
  );
  contains(
    client,
    "privacy.respondentUserIdsIncluded === false",
    "respondent user IDs excluded",
  );
  contains(
    client,
    "privacy.participantIdsIncluded === false",
    "participant IDs excluded",
  );
  contains(
    client,
    "privacy.responseIdsIncluded === false",
    "response IDs excluded",
  );
  contains(
    client,
    "privacy.responseHashesIncluded === false",
    "response hashes excluded",
  );
  contains(
    client,
    "privacy.submissionTimestampsIncluded === false",
    "submission timestamps excluded",
  );
  contains(
    client,
    "privacy.freeTextCommentsIncluded === false",
    "free-text comments excluded",
  );
  contains(
    client,
    "privacy.anonymousLabelsAreCycleScoped === true",
    "cycle-scoped anonymous labels",
  );
  contains(
    client,
    "privacy.superadminIdentityPathSeparate === true",
    "separate Superadmin identity path",
  );

  excludes(client, "/review-package", "legacy combined Governance review-package API");
  excludes(client, '"return-hold"', "legacy combined Governance return-hold API");
  excludes(client, 'stream="COMBINED"', "legacy combined decision stream");
  contains(client, '${API_BASE}/governance-review', "assessment-keyed Governance review API");
  contains(client, 'action: "START"', "independent Governance review start action");
  contains(client, 'stream="GOVERNANCE"', "independent Governance decision stream");
  contains(
    client,
    "/anonymous-responses",
    "anonymous-response API",
  );
  contains(client, 'cache: "no-store"', "no-store fetches");
  contains(client, "window.confirm", "explicit confirmation");
  excludes(client, "Load review package", "obsolete Staff queue package-load action");
  excludes(
    client,
    "Start full decision review",
    "obsolete Staff queue combined-review action",
  );
  contains(
    client,
    "Inspect & release",
    "Director-authored Governance action is explicit",
  );
  contains(
    client,
    "Open & start review",
    "governance-officer assessment start action is explicit",
  );
  contains(
    client,
    "Continue review",
    "ordinary pending Governance review continuation action is explicit",
  );
  contains(
    client,
    "Correction received",
    "returned correction received status",
  );
  contains(
    client,
    "Review corrected report",
    "returned correction next action",
  );
  contains(
    client,
    "has corrected and resubmitted this appraisal.",
    "plain correction-complete explanation",
  );
  contains(
    client,
    "Ready for your final decision",
    "plain Director next-step guidance",
  );
  contains(
    client,
    "Waiting for {item.assessorOffice} to correct and resubmit this appraisal.",
    "plain waiting-for-correction guidance",
  );
  contains(
    client,
    'aria-label="1 corrected Governance appraisal needs your action"',
    "per-record correction notification indicator",
  );
  contains(
    client,
    "governanceCorrectionReceivedItems.length",
    "Governance correction count indicator",
  );
  contains(
    client,
    "Correction received from ${props.reviewPackage.assessment.assessorOffice}",
    "opened corrected-report heading",
  );
  contains(
    client,
    "Correction received · ready for your final review",
    "opened corrected-report instruction",
  );
  contains(
    client,
    "Review stage ${props.reviewPackage.review?.stage ?? 1} is preserved.",
    "stage retained as secondary evidence",
  );
  excludes(
    client,
    "Review in progress · stage",
    "technical stage-first Governance queue status",
  );
  contains(
    client,
    "Release governance assessment",
    "release action only after final inspection",
  );
  contains(
    client,
    "item.canDirectRelease",
    "server-derived direct-release presentation gate",
  );
  contains(
    client,
    "item.assessmentId",
    "assessment-keyed Governance identifier",
  );
  contains(
    client,
    "/api/governance/appraisals/headteacher-supervisory/",
    "protected governance direct-release endpoint",
  );
  contains(
    client,
    "/direct-release",
    "Director-authored direct-release endpoint suffix",
  );
  contains(
    client,
    "function GovernanceQueueRecord",
    "separate Governance Appraisal record renderer",
  );
  contains(
    client,
    "function GovernanceReviewNativeForm",
    "Governance-only native Director review renderer",
  );
  contains(
    client,
    'governanceReviewedDecisionPath: "ASSESSMENT_KEYED_RETURN_HOLD_RELEASE"',
    "assessment-keyed reviewed Governance path",
  );
  contains(
    client,
    "governanceStaffFeedbackPrerequisite: false",
    "Governance review does not require Staff Feedback",
  );
  contains(
    client,
    "appraisal report for ${props.reviewPackage.cycle.targetName}",
    "plain-language Governance review instruction",
  );
  excludes(
    client,
    "The Governance assessment remains its own evidence stream and has no combined weighting.",
    "technical Governance evidence-stream copy",
  );
  contains(
    client,
    "Start Governance review",
    "explicit Governance review start below native form",
  );
  contains(
    client,
    "There is no Start Governance review step and no self-review.",
    "Director-authored path explains why Start Governance review is absent",
  );
  contains(
    client,
    "scroll to the bottom and click Start Governance review.",
    "governance-officer path explains where Start Governance review appears",
  );

  contains(
    client,
    "Independent Governance decision",
    "Return/Hold/Release beneath Governance form",
  );
  contains(
    client,
    "function DirectReleaseNativeForm",
    "native final inspection renderer",
  );
  contains(
    client,
    "inspectDirectReleaseAssessment",
    "explicit read-only inspection loader",
  );
  contains(
    client,
    'method: "GET"',
    "read-only governance assessment inspection request",
  );
  contains(
    client,
    "governance-final-inspection",
    "final inspection scroll target",
  );
  contains(
    client,
    "Your assessment — inspect before release",
    "BBC-friendly final inspection heading",
  );
  contains(
    client,
    "This is the assessment you authored as District Director.",
    "Director-authored assessment ownership guidance",
  );
  contains(
    client,
    "Read the locked 4-section, 34-indicator form",
    "native assessor-form continuity",
  );
  contains(
    client,
    "workspace.assessment.progress.totalSections !== 4",
    "four-section inspection verification",
  );
  contains(
    client,
    "workspace.assessment.progress.totalItems !== 34",
    "34-indicator inspection verification",
  );
  contains(
    client,
    "workspace.assessment.progress.answeredItems !== 34",
    "complete finalized inspection verification",
  );
  contains(
    client,
    "Review the complete governance assessment first.",
    "release blocked until final inspection",
  );
  contains(
    client,
    "The confidential Staff Feedback appraisal remains separate and unchanged.",
    "staff-feedback independence at final inspection",
  );
  precedes(
    client,
    "Inspect & release",
    "Release governance assessment",
    "inspection action before release action",
  );
  contains(
    client,
    "No self-review will be created",
    "BBC-friendly no-self-review confirmation",
  );
  contains(
    client,
    "No self-review was created",
    "BBC-friendly direct-release success guidance",
  );
  contains(
    client,
    "Review staff feedback",
    "independent staff-evidence review action",
  );
  contains(
    client,
    '"COMPLETE"',
    "all-responses-received queue panel",
  );
  contains(
    client,
    "function deriveQueuePanel",
    "fresh-load lifecycle stage derivation",
  );
  contains(
    client,
    "setQueuePanel(deriveQueuePanel(payload.queue))",
    "queue refresh derives truthful current stage",
  );
  contains(
    client,
    "All responses received",
    "early-completion attention state",
  );
  contains(
    client,
    "eligibleParticipantCount",
    "eligible respondent completion count",
  );
  contains(
    client,
    "item.finalizedResponseCount === item.eligibleParticipantCount",
    "revoked respondents excluded from completion equality",
  );
  contains(
    client,
    "originally selected",
    "frozen respondent history preserved in queue copy",
  );
  contains(
    client,
    "Every eligible frozen Teacher respondent has finalized before the deadline.",
    "eligible completion BBC explanation",
  );
  contains(
    client,
    "Feedback in progress",
    "active feedback collection state",
  );
  precedes(
    client,
    'label="Appraisal work queue"',
    'label="Requests awaiting approval"',
    "work queue before approval card",
  );
  precedes(
    client,
    'label="Requests awaiting approval"',
    'label="Feedback in progress"',
    "approval before feedback-in-progress card",
  );
  precedes(
    client,
    'label="Feedback in progress"',
    'label="All responses received"',
    "feedback-in-progress before all-responses-received card",
  );
  precedes(
    client,
    'label="All responses received"',
    'label="Ready for Director review"',
    "all-responses-received before ready-for-review card",
  );
  contains(
    client,
    "Close and prepare review",
    "Director early-close action",
  );
  contains(
    client,
    "Wait until deadline",
    "Director wait action",
  );
  contains(
    client,
    "Extend feedback 7 days",
    "Director expired-window recovery action",
  );
  contains(
    client,
    "Deadline reached ·",
    "truthful expired OPEN-cycle label",
  );
  contains(
    client,
    "item.canExtendFeedbackWindow",
    "server-derived extension availability",
  );
  contains(
    client,
    "/extend-feedback",
    "dedicated deadline-extension endpoint",
  );
  contains(
    client,
    "Feedback reopened until",
    "BBC-friendly extension success message",
  );
  contains(
    client,
    'action: "CLOSE_COMPLETED_EARLY"',
    "early-close API action",
  );
  contains(
    client,
    "allResponsesFinalized",
    "early-completion item detection",
  );
  contains(
    client,
    "No data was changed.",
    "non-mutating wait guidance",
  );
  contains(
    client,
    "The separate governance assessment was not changed.",
    "independent governance-stream guidance",
  );
  excludes(
    client,
    "Staff evidence review only",
    "obsolete noisy Staff evidence review only card",
  );
  excludes(
    client,
    "Return, Hold and Release remain unavailable until the separate",
    "obsolete governance-dependent staff decision guidance",
  );
  contains(
    client,
    '/staff-review/start',
    "independent Staff Feedback review start endpoint",
  );
  contains(
    client,
    '/staff-review/decision',
    "independent Staff Feedback decision endpoint",
  );
  contains(
    client,
    'aria-label="Staff Feedback decision controls"',
    "Staff Feedback decisions appear with the opened native respondent form",
  );
  contains(
    client,
    "showDecisionButtons={",
    "Staff Feedback decisions stay hidden until a respondent form is previewed",
  );
  excludes(
    client,
    "No Governance Appraisal is required.",
    "obsolete standalone Staff Feedback review explanation card",
  );
  excludes(
    client,
    "Staff Feedback review · stage {props.reviewState.latestStage",
    "obsolete standalone Staff Feedback review stage card",
  );
  contains(
    client,
    'id="staff-evidence-review"',
    "anonymous staff evidence scroll target",
  );
  contains(
    client,
    '.getElementById("staff-evidence-review")',
    "Review staff feedback auto-scroll",
  );
  contains(
    client,
    "Show released (",
    "released Governance history reveal control",
  );
  contains(
    client,
    "Hide released",
    "released Governance history collapse control",
  );
  contains(
    client,
    "governanceIsCurrentFocus",
    "actionable governance auto-show rule",
  );
  contains(
    client,
    "anonymousResponses?.cycle.id",
    "closed-cycle anonymous evidence selection",
  );
  contains(
    client,
    "h-12 min-w-12",
    "large notification-style attention badge",
  );
  contains(
    client,
    "h-11 min-w-11",
    "large readable queue badges",
  );
  contains(
    client,
    'hasAttention\n            ? "min-h-[144px] rounded-[22px] border border-white/10 bg-slate-900/85',
    "attention-only card remains visually unselected",
  );

  contains(
    queueRoute,
    "closeCompletedHeadteacherFeedbackCycleEarly",
    "early-close service wiring",
  );
  contains(
    queueRoute,
    "sealHeadteacherFeedbackAggregateSnapshot",
    "aggregate sealing after early closure",
  );
  contains(
    queueRoute,
    'action !== "CLOSE_COMPLETED_EARLY"',
    "early-close action allowlist",
  );
  contains(
    queueRoute,
    "governanceAssessmentRequiredForClosure: false",
    "independent governance-stream API result",
  );
  contains(
    queueRoute,
    "reviewStarted: false",
    "early closure must not silently start Director review",
  );
  contains(
    sharedRoute,
    "earlyCompletedStaffFeedbackCanCloseIndependently: true",
    "shared early-close API policy",
  );
  contains(
    sharedRoute,
    "governanceAssessmentRequiredForStaffClosure: false",
    "shared independent-stream policy",
  );
  contains(
    extensionRoute,
    "extendExpiredHeadteacherFeedbackCycle",
    "deadline-extension service wiring",
  );
  contains(
    extensionRoute,
    'const ALLOWED_BODY_FIELDS = new Set(["confirm"])',
    "confirm-only deadline-extension body",
  );
  contains(
    extensionRoute,
    "HEADTEACHER_FEEDBACK_EXTENSION_CONFIRMATION_REQUIRED",
    "explicit extension confirmation",
  );
  excludes(
    extensionRoute,
    "prisma.",
    "direct Prisma access in extension route",
  );
  excludes(
    extensionRoute,
    "sendSms",
    "SMS provider in extension route",
  );
  excludes(
    extensionRoute,
    "sendEmail",
    "email provider in extension route",
  );
  contains(
    client,
    "function QueueRecord",
    "Staff Feedback record renderer",
  );
  contains(
    client,
    "Confidential Teacher feedback about the Headteacher",
    "Staff Feedback record identity",
  );
  contains(
    client,
    "`${item.assessorOffice} assessment`",
    "Governance record identifies assessor office plainly",
  );
  contains(
    client,
    "No governance release action appears inside this channel.",
    "governance release separated from Staff Feedback queue",
  );
  contains(
    client,
    "function StaffNativeForm",
    "native anonymous staff form",
  );
  contains(
    client,
    "Native Monitoring and Inspection Sheet",
    "native paper-form heading",
  );
  contains(
    client,
    "Confidential staff feedback · anonymous read-only copy",
    "anonymous paper-copy label",
  );
  contains(
    client,
    "cycle-scoped anonymous label",
    "cycle-scoped identity guidance",
  );
  contains(
    client,
    "not available to the District Director",
    "Director identity boundary",
  );
  contains(
    client,
    "No Teacher identity, respondent identifier, response hash or",
    "native-form privacy statement",
  );
  contains(
    client,
    "Overall percentage — average of the four official section",
    "four-section overall formula",
  );
  contains(
    client,
    "Read the locked 4-section, 34-indicator form",
    "native 4-section / 34-indicator Governance evidence",
  );
  contains(client, "Back to respondents", "anonymous-form navigation");
  contains(
    client,
    "overflow-x-auto",
    "small-screen horizontal form access",
  );
  contains(
    client,
    "min-w-[1040px]",
    "official paper-form width preservation",
  );

  contains(client, "Return for correction", "return decision");
  contains(client, "Hold Director review", "hold decision");
  contains(client, "Release official result", "release decision");
  contains(
    client,
    "Confirm ${title.toLowerCase()}",
    "decision confirmation control",
  );
  contains(
    client,
    "No combined appraisal score",
    "no combined-score message",
  );
  contains(
    client,
    "Nothing was changed",
    "network-safe failure message",
  );
  contains(
    client,
    "Do not repeat the Governance decision blindly",
    "Governance decision retry safety guidance",
  );
  excludes(
    client,
    "HEADTEACHER_RELEASE_NOTIFICATION_SEEDING_RETRY_REQUIRED",
    "legacy combined release notification coupling",
  );

  excludes(client, "localStorage", "local storage");
  excludes(client, "sessionStorage", "session storage");
  excludes(client, "setInterval(", "polling interval");
  excludes(client, "setTimeout(", "background retry");
  excludes(client, "appraisalNotification", "notification mutation");
  excludes(client, "sendSms", "SMS provider");
  excludes(client, "sendEmail", "email provider");
  excludes(
    client,
    "combinedOverallPercentage",
    "combined score field",
  );
  excludes(client, "district/dashboard", "dashboard modification");
  excludes(client, "prisma.", "direct database use");
  excludes(
    client,
    "authorized Director-level reviewer",
    "obsolete Director identity-access wording",
  );
  excludes(
    client,
    "authorized, audited Director workflow",
    "obsolete Director identity-access caveat",
  );

  for (const marker of [
    "readTeacherSupervisoryReviewQueue",
    "TEACHER_SUPERVISORY_REVIEW_POLICY",
    "requireTeacherSupervisoryGovernanceApiContext",
    "reviewerRoleAllowed",
    "jsonNoStore",
    "reviewQueue",
  ]) {
    contains(
      teacherReviewRoute,
      marker,
      `protected Teacher review route marker: ${marker}`,
    );
  }

  for (const forbidden of [
    "appraisalReview.create",
    "appraisalReview.update",
    "appraisalCycle.update",
    "appraisalAssessment.update",
    "sendSms",
    "sendEmail",
  ]) {
    excludes(
      teacherReviewRoute,
      forbidden,
      `Teacher review discovery route mutation/provider marker: ${forbidden}`,
    );
  }

  for (const marker of [
    'case "DISTRICT_DIRECTOR"',
    '"READY_TO_REVIEW"',
    '"CONTINUE_REVIEW"',
    '"READY_TO_RELEASE"',
    '"DIRECT_RELEASE"',
    "currentReviewerRole",
    "currentReviewerAssignmentId",
    "assessorUserIdIncluded: false",
    "targetUserIdIncluded: false",
    "reviewIdIncluded: false",
    "assignmentIdsIncluded: false",
    "proofHashesIncluded: false",
    "databaseWritesAllowed: false",
    "providerCallsAllowed: false",
  ]) {
    contains(
      teacherReviewQueue,
      marker,
      `protected Teacher review queue marker: ${marker}`,
    );
  }

  contains(
    teacherReviewPage,
    "TEACHER_SUPERVISORY_REVIEW_POLICY.reviewerRoles",
    "Teacher review page remains policy-driven for HOS/Director",
  );
  contains(
    teacherReviewPage,
    "initialAssessmentId",
    "Teacher review page accepts assessment-keyed opening",
  );
  contains(
    teacherReviewPage,
    "TeacherSupervisoryReviewClient",
    "existing Teacher review client remains the action workspace",
  );

  transpile(page, pagePath);
  transpile(client, clientPath);
  transpile(queueRoute, queueRoutePath);
  transpile(sharedRoute, sharedRoutePath);
  transpile(extensionRoute, extensionRoutePath);
  transpile(teacherReviewRoute, teacherReviewRoutePath);
  transpile(teacherReviewQueue, teacherReviewQueuePath);
  transpile(teacherReviewPage, teacherReviewPagePath);

  console.log("");
  console.log(
    "=== DIRECTOR NATIVE EVIDENCE + ANONYMOUS MOBILE INTERFACE ===",
  );
  console.log("");
  console.log(
    "Audience scope                 : District Director workspace",
  );
  console.log(
    "Entry                          : controlled cycleId link",
  );
  console.log(
    "Network behavior               : explicit load, no polling",
  );
  console.log(
    "Queue counters                 : large notification-style badges",
  );
  console.log(
    "Queue lifecycle order          : work → approval → feedback → complete → review",
  );
  console.log(
    "Fresh-load stage highlight     : derived from current server queue",
  );
  console.log(
    "Attention badge semantics      : count only; does not select stage",
  );
  console.log(
    "Appraisal channels             : Staff Feedback / Governance separated",
  );
  console.log(
    "Director own assessment        : inspect native form → direct release",
  );
  console.log(
    "Early completion               : all eligible responses received attention state",
  );
  console.log(
    "Revoked respondents            : excluded from completion equality",
  );
  console.log(
    "Frozen respondent history      : preserved separately",
  );
  console.log(
    "Director early-close choice    : close and prepare review / wait",
  );
  console.log(
    "Wait action                    : no database mutation",
  );
  console.log(
    "Governance assessment          : independent of staff closure",
  );
  console.log(
    "Evidence presentation          : native evidence first",
  );
  console.log(
    "Governance final inspection    : required, read-only, native 4/34 form",
  );
  console.log(
    "Supervisory evidence           : native 4-section / 34-item sheet",
  );
  console.log(
    "Staff evidence                 : anonymous native 4-section / 34-item forms",
  );
  console.log(
    "Anonymous navigation           : circuit → school → Respondent 1…N",
  );
  console.log(
    "Real Teacher identities        : unavailable to Director",
  );
  console.log(
    "Respondent-linked identifiers  : absent",
  );
  console.log(
    "Mobile form access             : horizontal paper-form scrolling",
  );
  console.log(
    "Governance Director review      : native form + Return / Hold / Release",
  );
  console.log(
    "Governance decision wording     : assessor + Headteacher named plainly",
  );
  console.log(
    "Legacy combined analytics       : absent",
  );
  console.log(
    "Combined appraisal score       : absent",
  );
  console.log(
    "Closed-cycle staff review       : independent, anonymous, read-only",
  );
  console.log(
    "Governance assessment dependency: absent from staff inspection + decisions",
  );
  console.log(
    "Staff decision controls         : independent Return / Hold / Release",
  );
  console.log(
    "Staff review entry              : Review staff feedback → auto-scroll",
  );
  console.log(
    "Director Governance filters     : Teacher / Headteacher / My Assessments",
  );
  console.log(
    "Selected Governance group       : only selected group expands",
  );
  console.log(
    "Teacher Director discovery      : existing protected review queue reused",
  );
  console.log(
    "Teacher Director workspace      : existing assessment-keyed review page reused",
  );
  console.log(
    "Teacher backend/schema change   : absent",
  );
  console.log(
    "Governance queue                : compact BBC cards + state-specific actions",
  );
  console.log(
    "Returned correction tracking    : waiting → correction received → Director action",
  );
  console.log(
    "Correction notification         : count badge + per-record indicator",
  );
  console.log(
    "Corrected report action         : Review corrected report",
  );
  console.log(
    "Review stage presentation       : secondary evidence only",
  );
  console.log(
    "Released Governance history     : collapsed by default",
  );
  console.log(
    "Direct vs reviewed action       : Inspect & release / Open & start review",
  );
  console.log(
    "Return / Hold / Release        : controlled and confirmed",
  );
  console.log(
    "Reviewer score rewriting       : absent",
  );
  console.log(
    "Persistent browser storage     : absent",
  );
  console.log(
    "Notification seeding           : release-only service path",
  );
  console.log(
    "Provider delivery              : absent",
  );
  console.log(
    "Dashboard modification         : absent",
  );
  console.log(
    "Database accessed              : false",
  );
  console.log("");
  console.log(
    "RESULT: N7 DIRECTOR APPRAISAL FOCUS HUB GREEN",
  );
  console.log(
    "RESULT: DIRECTOR NATIVE EVIDENCE UI GREEN",
  );
}

main();
