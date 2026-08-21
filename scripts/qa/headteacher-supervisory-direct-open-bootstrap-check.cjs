#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS QA harness performs deterministic source checks only. */

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..", "..");

function fail(message, detail) {
  const suffix = detail === undefined ? "" : `\n${JSON.stringify(detail, null, 2)}`;
  throw new Error(`${message}${suffix}`);
}

function assert(condition, message, detail) {
  if (!condition) fail(message, detail);
}

function read(relativePath) {
  const absolute = path.join(repoRoot, relativePath);
  if (!fs.existsSync(absolute)) fail("Required file missing", relativePath);
  return fs.readFileSync(absolute, "utf8").replace(/\r\n?/g, "\n");
}

function contains(source, marker, label) {
  assert(source.includes(marker), `Missing marker: ${label}`, marker);
}

function excludes(source, marker, label) {
  assert(!source.includes(marker), `Forbidden marker: ${label}`, marker);
}

function section(source, startMarker, endMarker, label) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert(start >= 0 && end > start, `Unable to isolate ${label}`, {
    startMarker,
    endMarker,
  });
  return source.slice(start, end);
}

function main() {
  const files = {
    directOpen: "src/lib/appraisals/headteacherFeedbackDirectOpen.ts",
    notifications: "src/lib/appraisals/headteacherFeedbackNotifications.ts",
    bulk: "src/lib/appraisals/headteacherFeedbackBulkOpen.ts",
    route: "src/app/api/district/headteacher-appraisals/route.ts",
    client:
      "src/app/governance/appraisals/headteacher-supervisory/HeadteacherSupervisoryAssessmentClient.tsx",
    queue: "src/lib/appraisals/headteacherSupervisoryAssessmentQueue.ts",
  };

  const source = Object.fromEntries(
    Object.entries(files).map(([key, relativePath]) => [key, read(relativePath)]),
  );

  // Existing single-target lifecycle remains available as the atomic primitive.
  contains(
    source.directOpen,
    "readHeadteacherFeedbackDirectOpenTargets",
    "read-only direct-open target discovery",
  );
  contains(
    source.directOpen,
    "assertHeadteacherFeedbackDirectOpenAuthority",
    "server-side direct-open authority",
  );
  contains(
    source.directOpen,
    "respondentIdentitiesIncluded: false",
    "target discovery excludes respondent identities",
  );
  contains(
    source.directOpen,
    "individualStaffResponsesIncluded: false",
    "target discovery excludes individual staff responses",
  );
  contains(
    source.directOpen,
    "providerCalled: false",
    "target discovery provider-free",
  );

  contains(
    source.notifications,
    "directOpenHeadteacherFeedbackCycleWithNotifications",
    "existing direct-open notification wrapper",
  );
  contains(
    source.notifications,
    "ensureHeadteacherFeedbackCycleNotifications",
    "existing notification seeding/repair path",
  );

  // K1R2 bulk orchestration must compose, not duplicate, lifecycle authority.
  for (const [marker, label] of [
    ["HEADTEACHER_FEEDBACK_BULK_OPEN_POLICY", "bulk policy"],
    ["multipleCircuitsAllowed: true", "multi-Circuit authority"],
    ["multipleSchoolsAllowed: true", "multi-School authority"],
    [
      "notificationRecipientsDerivedFromLockedScope: true",
      "scope-derived notification recipients",
    ],
    ["boundedConcurrency: 3", "bounded concurrency"],
    [
      "directOpenHeadteacherFeedbackCycleWithNotifications",
      "existing direct-open engine reuse",
    ],
    [
      "ensureHeadteacherFeedbackCycleNotifications",
      "existing OPEN notification repair",
    ],
    ["respondentIdentitiesIncluded: false", "bulk respondent privacy"],
    ["individualStaffResponsesIncluded: false", "bulk response privacy"],
  ]) {
    contains(source.bulk, marker, label);
  }

  for (const forbidden of [
    "sendSms(",
    "sendEmail(",
    "appraisalParticipant.createMany(",
    "appraisalReview.create(",
    "appraisalAggregateSnapshot.create(",
  ]) {
    excludes(source.bulk, forbidden, `bulk service ${forbidden}`);
  }

  // Director API exposes read-only preview + explicit bulk confirmation.
  for (const [marker, label] of [
    ["previewHeadteacherFeedbackBulkOpen", "bulk preview service"],
    ["bulkOpenHeadteacherFeedbackCycles", "bulk open service"],
    ['mode === "BULK_PREVIEW"', "bulk preview mode"],
    ['action === "BULK_DIRECT_OPEN"', "bulk mutation action"],
    ["req.nextUrl.searchParams.getAll(\"scopeId\")", "repeated scope IDs"],
    ["scopeIds: parsed.body.scopeIds", "bulk mutation scope IDs"],
    ["parsed.body.confirm !== true", "explicit confirmation gate"],
    ["requireDirectorReviewApiContext", "Director route authority"],
    ["jsonNoStore", "no-store response helper"],
    [
      "bulkDirectOpenMultipleCircuitsAllowed: true",
      "API multi-Circuit contract",
    ],
    [
      "bulkDirectOpenMultipleSchoolsAllowed: true",
      "API multi-School contract",
    ],
    [
      "bulkDirectOpenBrowserHeadteacherIdsAllowed: false",
      "browser Headteacher IDs forbidden for bulk",
    ],
    [
      "bulkDirectOpenBrowserRespondentsAllowed: false",
      "browser respondents forbidden for bulk",
    ],
    [
      "notificationRecipientsDerivedFromLockedScope: true",
      "API scope-derived notification contract",
    ],
  ]) {
    contains(source.route, marker, label);
  }
  excludes(source.route, "prisma.", "route must not own persistence");

  // K2 Director BBC UI: explicit multi-scope selection, preview, then one mutation.
  for (const [marker, label] of [
    ['data-director-own-headteacher-appraisal-ui="bbc-v2"', "Director BBC v2 landing"],
    [
      'data-director-staff-feedback-bulk-ui="multi-scope-v1"',
      "Director multi-scope Staff Feedback UI",
    ],
    ["✓ Submitted assessments", "submitted task card"],
    ["＋ New Headteacher appraisal", "new task card"],
    ["Invite staff feedback · 7 days", "Staff Feedback pathway"],
    ["Assess Headteacher directly", "separate Governance pathway"],
    ["Entire district", "district selection"],
    ["Circuit(s)", "one-or-many Circuit selection"],
    ["Choose one or more circuits", "single or multiple Circuit wording"],
    ['data-single-circuit-school-mode="all-or-selected"', "single-Circuit nested school selector"],
    ["All schools", "single-Circuit all-schools option"],
    ["Choose schools", "single-Circuit selected-schools option"],
    ['data-multi-circuit-school-selection="all-auto"', "multi-Circuit automatic all-schools rule"],
    ["All schools in the selected circuits are included automatically.", "multi-Circuit automatic resolution explanation"],
    ['data-feedback-preview-toggle="compact"', "compact collapsible preview"],
    ['data-feedback-preview-details="collapsible"', "preview detail toggle contract"],
    ['type="checkbox"', "multi-select checkboxes"],
    ["disabled={feedbackPreviewLoading || feedbackOpening}", "scope controls lock during network work"],
    ['mode: "BULK_PREVIEW"', "explicit bulk preview"],
    ['action: "BULK_DIRECT_OPEN"', "explicit bulk mutation"],
    ["Confirm and notify", "confirmation action"],
    ["HEADTEACHER-BULK-OPEN:", "ephemeral bulk idempotency key"],
    ["window.crypto.randomUUID()", "random bulk idempotency key source"],
    ["scope changes stay local until Preview", "low-network scope rule"],
    ["notificationRecipientCount", "notification result summary"],
    ["Staff feedback is not a prerequisite", "Governance independence explanation"],
    ["score is never combined", "no combined score explanation"],
    ['data-director-governance-direct-start="independent-v1"', "independent direct-start boundary"],
  ]) {
    contains(source.client, marker, label);
  }

  const scopeLocal = section(
    source.client,
    'function chooseFeedbackAudience(mode: "DISTRICT" | "CIRCUIT")',
    "async function previewHeadteacherStaffFeedback()",
    "local scope-selection functions",
  );
  excludes(scopeLocal, "fetch(", "scope selection must not trigger network calls");

  const preview = section(
    source.client,
    "async function previewHeadteacherStaffFeedback()",
    "async function confirmHeadteacherStaffFeedback()",
    "bulk preview function",
  );
  contains(preview, 'mode: "BULK_PREVIEW"', "preview mode");
  contains(preview, 'params.append("scopeId", scopeId)', "repeated preview scope IDs");
  contains(preview, '{ cache: "no-store" }', "preview no-store");

  const confirm = section(
    source.client,
    "async function confirmHeadteacherStaffFeedback()",
    "async function createDraft()",
    "bulk confirmation function",
  );
  contains(confirm, "window.confirm(", "explicit browser confirmation");
  contains(confirm, 'action: "BULK_DIRECT_OPEN"', "bulk POST action");
  contains(confirm, "scopeIds: currentIds", "bulk POST scope IDs");
  contains(confirm, "scopeType: commandScopeLevel", "captured bulk scope level");
  contains(confirm, "bulkOpenKey: commandBulkOpenKey", "captured bulk idempotency key");
  contains(confirm, "confirm: true", "server confirmation flag");
  contains(
    confirm,
    "feedbackBulkOpenKeysRef.current.delete(commandScopeSignature)",
    "successful bulk command rotates its browser key for a future exercise",
  );
  contains(
    confirm,
    "feedbackPreview.scope.level !== commandScopeLevel",
    "preview/mutation scope coherence gate",
  );
  contains(
    confirm,
    "await loadQueue();",
    "post-mutation supervisory queue refresh uses its own endpoint",
  );
  excludes(
    confirm,
    "setQueue(body.queue)",
    "District Staff Feedback queue must not replace supervisory queue state",
  );
  excludes(
    confirm,
    "queue: SupervisoryQueue",
    "bulk response must not mis-type the District queue as supervisory queue",
  );

  const queueLoader = section(
    source.client,
    "const loadQueue = useCallback(async () =>",
    "const loadDirectOpenTargets = useCallback(async () =>",
    "ordinary queue loader",
  );
  excludes(
    queueLoader,
    "/api/district/headteacher-appraisals",
    "ordinary queue must remain independent of optional Director scope discovery",
  );

  const directorBranch = section(
    source.client,
    'if (actorRole === "DISTRICT_DIRECTOR") {',
    '    return (\n      <div className="min-h-screen bg-[#070B12] px-4 py-6',
    "Director K2 landing",
  );
  excludes(
    directorBranch,
    'action: "DIRECT_OPEN"',
    "Director K2 landing must not use old single-target Staff Feedback mutation",
  );
  contains(
    directorBranch,
    "directorContinuableItems",
    "existing Director Governance work remains reachable",
  );
  contains(
    directorBranch,
    'data-director-governance-direct-start="independent-v1"',
    "new Governance work uses the independent Director bootstrap",
  );
  contains(
    directorBranch,
    "Start official assessment",
    "Director direct Governance start action",
  );
  contains(
    source.client,
    '"/api/governance/appraisals/headteacher-supervisory/direct"',
    "Director direct Governance endpoint",
  );

  for (const forbidden of [
    "localStorage",
    "sessionStorage",
    "setInterval(",
    "respondentUserId",
    "respondentTenantId",
    "requestedRespondentUserIds",
    "participantIds",
  ]) {
    excludes(source.client, forbidden, `client ${forbidden}`);
  }

  contains(
    source.queue,
    "visibleCycleStatuses",
    "ordinary supervisory queue remains cycle-backed",
  );
  excludes(
    source.queue,
    "directOpenHeadteacherFeedbackCycle",
    "ordinary queue must not create cycles",
  );

  console.log("");
  console.log("=== N7-P2C3K2 HEADTEACHER MULTI-SCOPE STAFF-FEEDBACK UI ===");
  console.log("");
  console.log("Director landing                : BBC v2, Submitted / New");
  console.log("Staff Feedback path             : separate 7-day exercise");
  console.log("Governance path                 : separate; no Staff prerequisite/combined score");
  console.log("Scope                           : District / one-or-many Circuits");
  console.log("Single-Circuit schools          : nested all / selected choice");
  console.log("Multi-Circuit schools           : all schools auto-resolved");
  console.log("Preview                         : compact + click-to-expand/hide");
  console.log("Scope selection network calls   : none");
  console.log("Preview                         : explicit + no-store");
  console.log("Mutation                        : one explicit BULK_DIRECT_OPEN command");
  console.log("Post-mutation queue refresh     : supervisory endpoint only");
  console.log("District queue shape injection  : blocked");
  console.log("Preview/mutation scope drift    : fail closed in client + server revalidation");
  console.log("Browser Headteacher IDs         : absent from bulk mutation");
  console.log("Browser respondent IDs          : absent");
  console.log("Participant selection           : server-side existing lifecycle");
  console.log("Notifications                   : scope-derived frozen Teachers");
  console.log("Notification channels           : IN_APP / SMS / EMAIL");
  console.log("Existing OPEN repair            : existing notification engine reused");
  console.log("Existing Director Governance    : drafts/returns remain reachable");
  console.log("New Director Governance start   : independent direct-start wired");
  console.log("Ordinary supervisory queue      : remains read-only/cycle-backed");
  console.log("Persistent browser storage      : absent");
  console.log("Background polling              : absent");
  console.log("Direct Prisma in API route      : absent");
  console.log("Database accessed by QA         : false");
  console.log("");
  console.log("RESULT: N7-P2C3K2 HEADTEACHER MULTI-SCOPE STAFF-FEEDBACK UI GREEN");
}

try {
  main();
} catch (error) {
  console.error("");
  console.error(
    "RESULT: N7-P2C3K2 HEADTEACHER MULTI-SCOPE STAFF-FEEDBACK UI FAILED",
  );
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
}
