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

  const page = read(pagePath);
  const client = read(clientPath);

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
  contains(client, "Start Director review", "explicit review start");

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
    "Evidence presentation          : native evidence first",
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
