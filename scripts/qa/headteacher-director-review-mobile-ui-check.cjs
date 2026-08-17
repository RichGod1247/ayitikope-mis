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

  const page = read(pagePath);
  const client = read(clientPath);
  const queueRoute = read(queueRoutePath);
  const sharedRoute = read(sharedRoutePath);
  const extensionRoute = read(extensionRoutePath);

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
  contains(client, "Governance Appraisals", "Governance channel heading");
  contains(
    client,
    "Confidential Teacher feedback about Headteachers",
    "BBC-friendly Staff Feedback explanation",
  );
  contains(
    client,
    "Official governance assessments of Headteachers",
    "BBC-friendly Governance Appraisal explanation",
  );
  contains(
    client,
    "the two outcomes meet later only for analytics",
    "analytics does not create release dependency",
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

  contains(client, "/review-package", "review-package API");
  contains(client, "/review-start", "review-start API");
  contains(
    client,
    "/anonymous-responses",
    "anonymous-response API",
  );
  contains(client, '"return-hold"', "return-hold API");
  contains(client, '"release"', "release API");
  contains(client, 'cache: "no-store"', "no-store fetches");
  contains(client, "window.confirm", "explicit confirmation");
  contains(client, "Load review package", "explicit package load");
  contains(
    client,
    "Start full decision review",
    "explicit full decision review start",
  );
  contains(
    client,
    "Review governance assessment",
    "Director-authored governance inspection action",
  );
  contains(
    client,
    "Release governance assessment",
    "release action only after final inspection",
  );
  contains(
    client,
    "item.canDirectReleaseOwnAssessment &&",
    "server-derived direct-release presentation gate",
  );
  contains(
    client,
    "item.directReleaseAssessmentId",
    "exact own assessment identifier",
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
    "Review the official assessment before release",
    "BBC-friendly final inspection heading",
  );
  contains(
    client,
    "same native 4-section, 34-indicator Monitoring and Inspection Sheet",
    "native assessor-form continuity",
  );
  contains(
    client,
    "This screen is read-only. Nothing on the official form can be changed here.",
    "read-only final inspection boundary",
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
    "Review governance assessment",
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
  contains(
    client,
    "Staff evidence review only",
    "staff-only review boundary",
  );
  contains(
    client,
    "The separate governance assessment is not required for this inspection.",
    "independent staff-review notice",
  );
  contains(
    client,
    "Return, Hold and Release remain unavailable until the separate",
    "decision controls remain full-review-only",
  );
  contains(
    client,
    "HEADTEACHER_DIRECTOR_REVIEW_SUPERVISORY_ASSESSMENT_REQUIRED",
    "friendly supervisory-readiness mapping",
  );
  contains(
    client,
    "The staff feedback is ready, but the separate governance assessment",
    "BBC-friendly governance-pending guidance",
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
    "Official governance assessment of the Headteacher",
    "Governance record identity",
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
  contains(client, "34 indicators", "34-indicator supervisory evidence");
  contains(
    client,
    "four-section Monitoring and Inspection Sheet",
    "four-section supervisory evidence",
  );
  contains(client, "Back to respondents", "anonymous-form navigation");
  contains(client, "Previous", "previous comparison control");
  contains(client, "Next", "next comparison control");
  contains(
    client,
    "currentItemIndex",
    "one-comparison-at-a-time state",
  );
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
  contains(
    client,
    "md:hidden",
    "mobile Director decision controls",
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
    "Do not repeat the decision blindly",
    "idempotency safety guidance",
  );
  contains(
    client,
    "HEADTEACHER_RELEASE_NOTIFICATION_SEEDING_RETRY_REQUIRED",
    "truthful partial-success retry state",
  );
  contains(
    client,
    "Repeating release will not duplicate the official result.",
    "safe notification retry guidance",
  );
  contains(
    client,
    "The Headteacher notification was queued safely.",
    "successful notification queue confirmation",
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

  transpile(page, pagePath);
  transpile(client, clientPath);
  transpile(queueRoute, queueRoutePath);
  transpile(sharedRoute, sharedRoutePath);
  transpile(extensionRoute, extensionRoutePath);

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
    "Early completion               : all responses received attention state",
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
    "Analytics interaction          : one comparison item at a time",
  );
  console.log(
    "Navigation                     : Previous / Next controls",
  );
  console.log(
    "Combined appraisal score       : absent",
  );
  console.log(
    "Closed-cycle staff review       : independent, anonymous, read-only",
  );
  console.log(
    "Governance assessment dependency: absent from staff inspection",
  );
  console.log(
    "Decision controls               : full review only",
  );
  console.log(
    "Review start                   : explicit confirmation",
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
    "RESULT: DIRECTOR NATIVE EVIDENCE UI GREEN",
  );
}

main();
