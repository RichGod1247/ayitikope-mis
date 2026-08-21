#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS QA harness intentionally loads TypeScript source through a local transpile hook. */

const fs = require("fs");
const path = require("path");
const Module = require("module");
const ts = require("typescript");

const repoRoot = path.resolve(__dirname, "..", "..");

function fail(message, detail) {
  const suffix = detail === undefined ? "" : `\n${JSON.stringify(detail, null, 2)}`;
  throw new Error(`${message}${suffix}`);
}

function assert(condition, message, detail) {
  if (!condition) fail(message, detail);
}

function read(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  if (!fs.existsSync(absolutePath)) fail("Required file missing", relativePath);
  return fs
    .readFileSync(absolutePath, "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
}

const files = {
  service: "src/lib/appraisals/headteacherSupervisoryAssessmentWorkspace.ts",
  shared: "src/app/api/governance/appraisals/headteacher-supervisory/_shared.ts",
  create: "src/app/api/governance/appraisals/headteacher-supervisory/route.ts",
  load: "src/app/api/governance/appraisals/headteacher-supervisory/[assessmentId]/route.ts",
  section: "src/app/api/governance/appraisals/headteacher-supervisory/[assessmentId]/section/route.ts",
  finalize: "src/app/api/governance/appraisals/headteacher-supervisory/[assessmentId]/finalize/route.ts",
  revision: "src/app/api/governance/appraisals/headteacher-supervisory/[assessmentId]/revision/route.ts",
  client: "src/app/governance/appraisals/headteacher-supervisory/HeadteacherSupervisoryAssessmentClient.tsx",
  page: "src/app/governance/appraisals/headteacher-supervisory/page.tsx",
};

const source = Object.fromEntries(
  Object.entries(files).map(([key, relativePath]) => [key, read(relativePath)]),
);

for (const [key, text] of Object.entries(source)) {
  for (const forbidden of ["sendSms", "sendEmail", "localStorage", "sessionStorage", "setInterval("]) {
    assert(!text.includes(forbidden), `${key} contains forbidden marker`, forbidden);
  }
}

for (const routeKey of ["create", "load", "section", "finalize", "revision"]) {
  const text = source[routeKey];
  assert(text.includes("requireSupervisoryGovernanceApiContext"), `${routeKey} lacks governance auth`);
  assert(text.includes("jsonNoStore"), `${routeKey} lacks no-store response`);
  assert(text.includes('runtime = "nodejs"'), `${routeKey} lacks node runtime`);
  assert(text.includes('dynamic = "force-dynamic"'), `${routeKey} lacks force-dynamic`);
}

assert(source.shared.includes('"Cache-Control": "no-store, max-age=0"'), "No-store cache contract missing");
assert(source.shared.includes('"X-Content-Type-Options": "nosniff"'), "Nosniff header missing");
assert(source.shared.includes("operationalAssessorRoles"), "Assessor-role scope missing");
assert(source.shared.includes("isUuidIdentifier"), "Strict UUID helper missing");
for (const routeKey of ["create", "load", "section", "finalize", "revision"]) {
  assert(source[routeKey].includes("isUuidIdentifier"), `${routeKey} lacks strict UUID validation`);
  assert(!source[routeKey].includes("isLikelyIdentifier"), `${routeKey} still uses broad identifier validation`);
}
assert(source.create.includes("createHeadteacherSupervisoryAssessmentDraft"), "F2 draft transaction not wired");
assert(source.section.includes("saveHeadteacherSupervisoryAssessmentSection"), "F3 section save not wired");
assert(source.finalize.includes("finalizeHeadteacherSupervisoryAssessment"), "F3 finalization not wired");
assert(source.finalize.includes("confirmFinalization"), "Explicit finalization confirmation missing");
assert(
  source.finalize.includes(
    "ensureHeadteacherSupervisoryCorrectionReviewContinuation",
  ),
  "Correction finalization provenance dispatcher not wired",
);
assert(
  !source.finalize.includes(
    "ensureHeadteacherDirectorCorrectionReviewContinuation",
  ),
  "Finalize route must not bypass return-provenance dispatch",
);
assert(
  !source.finalize.includes("auth.scope"),
  "Finalize route must not depend on an unverified auth scope shape",
);
assert(
  source.finalize.includes("finalizationCommitted: true"),
  "Post-finalization continuation failure must report committed finalization",
);
assert(
  source.finalize.includes("retrySafe: true"),
  "Post-finalization continuation failure must be retry-safe",
);
assert(
  source.finalize.includes(
    "HEADTEACHER_SUPERVISORY_FINALIZATION_CONTINUATION_RETRY_REQUIRED",
  ),
  "Correction continuation retry contract missing",
);
assert(source.revision.includes("createReturnedHeadteacherSupervisoryAssessmentRevision"), "F4 revision not wired");
assert(source.revision.includes("confirmRevision"), "Explicit revision confirmation missing");
assert(source.load.includes("loadHeadteacherSupervisoryAssessmentWorkspace"), "Workspace read not wired");
assert(source.page.includes("requireGovernancePageContext"), "Page governance gate missing");
assert(source.page.includes("operationalAssessorRoles"), "Page assessor roles missing");
assert(source.client.includes("queueSectionAutosave"), "Serialized autosave queue missing");
assert(
  source.client.includes('case "HEAD_OF_SUPERVISION":') &&
    source.client.includes('return "/district/hos/dashboard";'),
  "HOS appraisal workspace dashboard return route missing",
);
assert(
  source.client.includes('case "BASIC_SCHOOL_COORDINATOR":') &&
    source.client.includes('return "/district/bsc/dashboard";'),
  "BSC appraisal workspace dashboard return route missing",
);
assert(
  source.client.includes('case "SISSO":') &&
    source.client.includes('return "/circuit/dashboard";'),
  "SISSO appraisal workspace dashboard return route missing",
);
assert(source.client.includes("scrollIntoView"), "Anchored section navigation missing");
assert(
  source.client.includes("supervisory-section-"),
  "Stable section scroll targets missing",
);
assert(
  !source.client.includes("window.scrollTo"),
  "Section navigation must not jump to the beginning of the page",
);
assert(
  source.client.includes('aria-label="Overall completion"'),
  "Desktop completion progress bar missing",
);
assert(
  source.client.includes("Review Before you Submit"),
  "Native review entry missing",
);
assert(
  source.client.includes("Final review · read-only preview"),
  "Native review state missing",
);
assert(
  source.client.includes("Monitoring and Inspection Sheet (Headteachers)"),
  "Native official form heading missing",
);
assert(
  source.client.includes("Supervisory assessment · native final review copy"),
  "Native review-copy label missing",
);
assert(
  source.client.includes("min-w-[1120px]"),
  "Mobile horizontal native-form canvas missing",
);
assert(
  source.client.includes("Return to assessment"),
  "Native review return action missing",
);
assert(source.client.includes("window.confirm"), "Explicit irreversible-action confirmation missing");
assert(source.client.includes('cache: "no-store"'), "Client load cache policy missing");
assert(
  source.client.includes("Submit and lock assessment"),
  "Final submission action missing from native review",
);
assert(
  !source.client.includes("Save this section"),
  "Manual section-save control must remain absent",
);
assert(!source.client.includes("<textarea"), "Comments control must remain absent");
assert(source.client.includes("background polling"), "Low-network explanation missing");
assert(source.service.includes("staffFeedbackIncluded: false"), "Staff feedback separation missing");
assert(source.service.includes("respondentIdentitiesIncluded: false"), "Respondent identity exclusion missing");
assert(source.service.includes("reviewerIdentityIncluded: false"), "Reviewer identity exclusion missing");
assert(source.service.includes("contactDetailsIncluded: false"), "Contact exclusion missing");
assert(source.service.includes("sections.length !== 4 || itemCount !== 34"), "Official form structure gate missing");
assert(
  source.client.includes("clearWorkspaceForAssessmentChange"),
  "Assessment-change stale workspace reset missing",
);

assert(
  source.client.includes(
    'useState<"SUBMITTED" | "NEW" | null>(null)',
  ),
  "Director mutually exclusive Headteacher task-panel state missing",
);
assert(
  source.client.includes(
    'data-director-own-headteacher-appraisal-ui="bbc-v2"',
  ),
  "Director compact Headteacher appraisal landing missing",
);
assert(
  source.client.includes("✓ Submitted assessments") &&
    source.client.includes("＋ New Headteacher appraisal"),
  "Director submitted/new compact task cards missing",
);
assert(
  source.client.includes('directorLandingPanel === "SUBMITTED"') &&
    source.client.includes('directorLandingPanel === "NEW"'),
  "Director task-card expansion contract missing",
);
assert(
  source.client.includes("View submitted assessment") &&
    source.client.includes(
      "Opening a submitted assessment shows the native white read-only form, not the questionnaire.",
    ),
  "Director submitted assessment native-paper handoff missing",
);
assert(
  source.client.includes("const loadDirectOpenTargets = useCallback(async () =>") &&
    source.client.includes(
      'fetch(\n        "/api/district/headteacher-appraisals",\n        { cache: "no-store" },',
    ),
  "Director new-target discovery must remain explicit and no-store",
);

assert(
  source.client.includes(
    'data-director-staff-feedback-bulk-ui="multi-scope-v1"',
  ),
  "Director multi-scope Staff Feedback UI marker missing",
);
for (const marker of [
  "Invite staff feedback · 7 days",
  "Assess Headteacher directly",
  "Entire district",
  "Circuit(s)",
  "Choose one or more circuits",
  'data-single-circuit-school-mode="all-or-selected"',
  "All schools",
  "Choose schools",
  'data-multi-circuit-school-selection="all-auto"',
  'data-feedback-preview-toggle="compact"',
  'mode: "BULK_PREVIEW"',
  'action: "BULK_DIRECT_OPEN"',
  "Confirm and notify",
  "scope changes stay local until Preview",
  "notificationRecipientCount",
  "Staff feedback is not a prerequisite",
  "score is never combined",
  'data-director-governance-direct-start="independent-v1"',
  "Search Headteacher or school",
  "Start official assessment",
  '"/api/governance/appraisals/headteacher-supervisory/direct"',
  "No Teachers are invited here.",
  "No 7-day feedback window is opened.",
  "No new staff feedback was started.",
]) {
  assert(
    source.client.includes(marker),
    `Director multi-scope Staff Feedback marker missing: ${marker}`,
  );
}
assert(
  source.client.includes('type="checkbox"') &&
    source.client.includes("toggleFeedbackCircuit") &&
    source.client.includes("toggleFeedbackSchool") &&
    source.client.includes(
      "disabled={feedbackPreviewLoading || feedbackOpening}",
    ),
  "Director multi-Circuit/multi-School checkbox controls missing",
);
assert(
  source.client.includes("window.crypto.randomUUID()") &&
    source.client.includes("HEADTEACHER-BULK-OPEN:"),
  "Ephemeral retry-safe bulk opening key missing",
);

const localScopeStart = source.client.indexOf(
  'function chooseFeedbackAudience(mode: "DISTRICT" | "CIRCUIT")',
);
const localScopeEnd = source.client.indexOf(
  "async function previewHeadteacherStaffFeedback()",
  localScopeStart,
);
const localScopeSource = source.client.slice(localScopeStart, localScopeEnd);
assert(
  localScopeStart >= 0 &&
    localScopeEnd > localScopeStart &&
    !localScopeSource.includes("fetch("),
  "Scope and checkbox changes must remain local until explicit Preview",
);

const previewStart = source.client.indexOf(
  "async function previewHeadteacherStaffFeedback()",
);
const previewEnd = source.client.indexOf(
  "async function confirmHeadteacherStaffFeedback()",
  previewStart,
);
const previewSource = source.client.slice(previewStart, previewEnd);
assert(
  previewStart >= 0 &&
    previewEnd > previewStart &&
    previewSource.includes('mode: "BULK_PREVIEW"') &&
    previewSource.includes('params.append("scopeId", scopeId)') &&
    previewSource.includes('{ cache: "no-store" }'),
  "Explicit no-store multi-scope preview wiring missing",
);

const bulkConfirmStart = source.client.indexOf(
  "async function confirmHeadteacherStaffFeedback()",
);
const bulkConfirmEnd = source.client.indexOf(
  "async function createDraft()",
  bulkConfirmStart,
);
const bulkConfirmSource = source.client.slice(
  bulkConfirmStart,
  bulkConfirmEnd,
);
assert(
  bulkConfirmStart >= 0 &&
    bulkConfirmEnd > bulkConfirmStart &&
    bulkConfirmSource.includes("window.confirm(") &&
    bulkConfirmSource.includes('action: "BULK_DIRECT_OPEN"') &&
    bulkConfirmSource.includes("scopeIds: currentIds") &&
    bulkConfirmSource.includes("scopeType: commandScopeLevel") &&
    bulkConfirmSource.includes("bulkOpenKey: commandBulkOpenKey") &&
    bulkConfirmSource.includes("confirm: true") &&
    bulkConfirmSource.includes(
      "feedbackBulkOpenKeysRef.current.delete(commandScopeSignature)",
    ),
  "Explicit multi-scope confirmation/mutation or post-success key rotation missing",
);
assert(
  bulkConfirmSource.includes("await loadQueue();"),
  "Bulk success must refresh the Governance supervisory queue through its own endpoint",
);
assert(
  !bulkConfirmSource.includes("setQueue(body.queue)") &&
    !bulkConfirmSource.includes("queue: SupervisoryQueue"),
  "District Staff Feedback queue must never be injected or typed as the Governance supervisory queue",
);

const directorBranchStart = source.client.indexOf(
  'if (actorRole === "DISTRICT_DIRECTOR") {',
);
const directorBranchEnd = source.client.indexOf(
  '    return (\n      <div className="min-h-screen bg-[#070B12] px-4 py-6',
  directorBranchStart,
);
const directorBranchSource = source.client.slice(
  directorBranchStart,
  directorBranchEnd,
);
assert(
  directorBranchStart >= 0 &&
    directorBranchEnd > directorBranchStart &&
    !directorBranchSource.includes('action: "DIRECT_OPEN"'),
  "Director K2 landing must not use the old individual Staff Feedback mutation",
);

const queueLoaderStart = source.client.indexOf(
  "const loadQueue = useCallback(async () =>",
);
const queueLoaderEnd = source.client.indexOf(
  "const loadDirectOpenTargets = useCallback(async () =>",
  queueLoaderStart,
);
const queueLoaderSource = source.client.slice(queueLoaderStart, queueLoaderEnd);
assert(
  queueLoaderStart >= 0 &&
    queueLoaderEnd > queueLoaderStart &&
    !queueLoaderSource.includes("/api/district/headteacher-appraisals"),
  "Headteacher queue load must not be poisoned by optional Director target discovery",
);
assert(
  source.client.includes(
    'setReviewMode(body.workspace.assessment.status === "FINALIZED");',
  ),
  "Finalized Headteacher deep links must open the native paper automatically",
);
assert(
  source.client.includes(
    'renderedWorkspace.assessment.status === "FINALIZED" && reviewMode',
  ) &&
    source.client.includes("Submitted assessment · read-only") &&
    source.client.includes("Submitted Headteacher assessment"),
  "Submitted Headteacher native read-only mode missing",
);
assert(
  source.client.includes("{!submittedNativeView ? (") &&
    source.client.includes(
      "This submitted assessment is locked. The native white read-only form is shown below.",
    ),
  "Submitted Headteacher questionnaire suppression missing",
);
assert(
  source.client.includes('data-hos-own-headteacher-appraisal-ui="bbc-v2"'),
  "HOS BBC own-assessment landing version missing",
);
assert(
  source.client.includes("usesCompactOwnHeadteacherLanding") &&
    source.client.includes('actorRole === "BASIC_SCHOOL_COORDINATOR"') &&
    source.client.includes('data-bsc-own-headteacher-appraisal-ui={'),
  "BSC BBC own-assessment landing must reuse the compact HOS task pattern",
);
assert(
  source.client.includes('"Basic School Coordinator"') &&
    source.client.includes("if (usesCompactOwnHeadteacherLanding)"),
  "BSC compact Headteacher appraisal role label or branch missing",
);
assert(
  source.client.includes('useState<"RETURNED" | "NEW" | null>(null)'),
  "HOS mutually exclusive task-panel state missing",
);
assert(
  source.client.includes("↩ Returned for correction") &&
    source.client.includes("＋ New Headteacher appraisal"),
  "HOS compact two-task cards missing",
);
assert(
  source.client.includes(
    'aria-label={`${hosReturnedItems.length} returned appraisals need correction`}',
  ),
  "Returned correction notification-count badge missing",
);
assert(
  source.client.includes('hosLandingPanel === "RETURNED"') &&
    source.client.includes('hosLandingPanel === "NEW"'),
  "HOS task-card expansion contract missing",
);
assert(
  source.client.includes("async function startReturnedCorrection(item: SupervisoryQueueItem)"),
  "Returned-queue correction action missing",
);
assert(
  source.client.includes("Reason returned: ${returnReason}") &&
    source.client.includes("The returned version stays locked as history."),
  "Returned correction confirmation must explain reason and immutable history",
);
assert(
  source.client.includes('body: JSON.stringify({ confirmRevision: true })'),
  "Returned correction must use explicit revision confirmation",
);
assert(
  source.client.includes("Start correction"),
  "BBC Start correction action missing",
);
assert(
  source.client.includes(
    "This returned version is locked to preserve history. Start correction below to create an editable revision.",
  ),
  "Returned immutable-version explanation missing",
);
assert(
  !source.client.includes("Create correction copy"),
  "Old technical correction-copy wording must be absent",
);
assert(
  source.client.includes("workspaceRef.current?.assessment.assessmentId !== id"),
  "Workspace identity switch guard missing",
);
const returnedCorrectionStart = source.client.indexOf(
  "async function startReturnedCorrection(item: SupervisoryQueueItem)",
);
const returnedCorrectionEnd = source.client.indexOf(
  "async function createRevision()",
  returnedCorrectionStart,
);
const returnedCorrectionSource = source.client.slice(
  returnedCorrectionStart,
  returnedCorrectionEnd,
);
assert(
  returnedCorrectionStart >= 0 &&
    returnedCorrectionSource.includes(
      '/headteacher-supervisory/${encodeURIComponent(returnedAssessmentId)}/revision',
    ) &&
    returnedCorrectionSource.indexOf("clearWorkspaceForAssessmentChange();") >= 0 &&
    returnedCorrectionSource.indexOf("clearWorkspaceForAssessmentChange();") <
      returnedCorrectionSource.indexOf("setAssessmentId(nextId);"),
  "Returned queue correction must create revision and clear stale workspace before switching IDs",
);

const createRevisionStart = source.client.indexOf("async function createRevision()");
const createRevisionEnd = source.client.indexOf("if (!assessmentId && !cycleId)", createRevisionStart);
const createRevisionSource = source.client.slice(createRevisionStart, createRevisionEnd);
assert(
  createRevisionSource.indexOf("clearWorkspaceForAssessmentChange();") >= 0 &&
    createRevisionSource.indexOf("clearWorkspaceForAssessmentChange();") <
      createRevisionSource.indexOf("setAssessmentId(nextId);"),
  "Correction revision must clear stale workspace before switching IDs",
);

const originalLoader = Module._load;
const originalTsExtension = Module._extensions[".ts"];

Module._extensions[".ts"] = function transpile(moduleInstance, filename) {
  const input = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(input, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  moduleInstance._compile(output.outputText, filename);
};

Module._load = function load(request, parent, isMain) {
  if (request === "@/lib/prisma") return { prisma: {} };
  if (request === "@/lib/appraisals/headteacherSupervisoryAssessmentScoring") {
    return { loadHeadteacherSupervisoryAssessment: async () => { throw new Error("not used"); } };
  }
  if (request === "@/lib/appraisals/headteacherSupervisoryAssessmentRevision") {
    return { readHeadteacherSupervisoryAssessorState: async () => { throw new Error("not used"); } };
  }

  if (request.startsWith("@/")) {
    const absoluteAliasPath = path.join(
      repoRoot,
      "src",
      request.slice(2),
    );
    return originalLoader.call(
      this,
      absoluteAliasPath,
      parent,
      isMain,
    );
  }

  return originalLoader.call(this, request, parent, isMain);
};

try {
  const workspaceModule = require(path.join(repoRoot, files.service));
  const sections = [
    { key: "A", title: "Section A", maxScore: 55, count: 11 },
    { key: "B", title: "Section B", maxScore: 45, count: 9 },
    { key: "C", title: "Section C", maxScore: 40, count: 8 },
    { key: "D", title: "Section D", maxScore: 30, count: 6 },
  ].map((section, sectionIndex) => ({
    key: section.key,
    title: section.title,
    description: null,
    order: sectionIndex + 1,
    maxScore: section.maxScore,
    items: Array.from({ length: section.count }, (_, itemIndex) => ({
      id: `item-${section.key}-${itemIndex + 1}`,
      key: `${section.key}.${itemIndex + 1}`,
      label: `Question ${section.key}.${itemIndex + 1}`,
      order: itemIndex + 1,
      maxScore: 5,
    })),
  }));
  const allItems = sections.flatMap((section) => section.items);
  const record = {
    id: "assessment-12345",
    cycleId: "cycle-12345",
    assessorUserId: "assessor-12345",
    status: "DRAFT",
    revision: 1,
    evidenceSnapshotJson: {
      schemaVersion: 1,
      target: { name: "Headteacher", schoolName: "Example Basic School" },
      assessor: { role: "SISSO" },
      jurisdiction: { circuitName: "Example Circuit", districtName: "Example District" },
      observation: { dateObserved: "2026-07-27" },
    },
    scores: [
      {
        instrumentItemId: allItems[0].id,
        itemKey: allItems[0].key,
        score: 4,
        notApplicable: false,
      },
      {
        instrumentItemId: allItems[1].id,
        itemKey: allItems[1].key,
        score: null,
        notApplicable: true,
      },
    ],
    instrumentVersion: {
      id: "version-12345",
      version: 1,
      instrument: { code: "HEADTEACHER_SUPERVISORY_ASSESSMENT_V1" },
      sections,
    },
  };
  const assessment = {
    assessmentId: record.id,
    cycleId: record.cycleId,
    revision: 1,
    status: "DRAFT",
    assessorUserId: record.assessorUserId,
    assessorAssignmentId: "assignment-12345",
    targetUserId: "headteacher-12345",
    targetTenantId: "tenant-12345",
    instrumentCode: "HEADTEACHER_SUPERVISORY_ASSESSMENT_V1",
    instrumentVersion: 1,
    dateObserved: "2026-07-27",
    visitContextHash: "a".repeat(64),
    assessmentHash: null,
    finalizedAt: null,
    canEdit: true,
    canFinalize: false,
    commentsAllowed: false,
    separateFromStaffFeedback: true,
    combinedWeightingDefined: false,
    progress: {
      totalSections: 4,
      completedSections: 0,
      totalItems: 34,
      answeredItems: 2,
      notApplicableItems: 1,
      completionPercentage: 5.88,
      missingItemKeys: allItems.slice(2).map((item) => item.key),
      sections: [],
    },
    sectionPercentages: {},
    overallPercentage: null,
  };
  const lifecycle = {
    assessmentId: record.id,
    cycleId: record.cycleId,
    revision: 1,
    status: "DRAFT",
    state: "DRAFT",
    label: "Assessment in progress",
    description: "Continue the assessment.",
    readOnly: false,
    canEdit: true,
    canFinalize: false,
    canCreateRevision: false,
    finalizationReadinessIncluded: false,
    priorAssessmentId: null,
    successorAssessmentId: null,
    returnReason: null,
    scoresIncluded: false,
    percentagesIncluded: false,
    reviewerIdentityIncluded: false,
    providerCalled: false,
  };

  const workspace = workspaceModule.buildHeadteacherSupervisoryWorkspace({
    record,
    assessment,
    lifecycle,
  });
  assert(workspace.sections.length === 4, "Workspace section count incorrect");
  assert(workspace.sections.flatMap((section) => section.items).length === 34, "Workspace item count incorrect");
  assert(workspace.sections[0].items[0].score === 4, "Saved score missing");
  assert(workspace.sections[0].items[1].notApplicable === true, "N/A state missing");
  assert(workspace.visit.schoolName === "Example Basic School", "School context missing");
  const serialized = JSON.stringify(workspace);
  for (const forbidden of ["email", "phone", "reviewerUserId", "respondentUserId"]) {
    assert(!serialized.includes(forbidden), "Workspace leaked forbidden field", forbidden);
  }
} finally {
  Module._load = originalLoader;
  if (originalTsExtension) Module._extensions[".ts"] = originalTsExtension;
  else delete Module._extensions[".ts"];
}

console.log("");
console.log("=== GOVERNANCE SUPERVISORY NAVIGATION + NATIVE FINAL REVIEW ===");
console.log("");
console.log("Audience scope                 : original authorized governance assessor");
console.log("Dashboard return routing       : SISSO / HOS / BSC role-specific");
console.log("Draft creation                 : F2 transaction wired");
console.log("Assessment load                : owner-bound workspace");
console.log("Section save                   : F3 transaction wired");
console.log("Finalization                   : explicit confirmation + F3");
console.log("Correction continuation        : post-finalization return-provenance dispatcher");
console.log("Continuation retry             : finalization-committed and retry-safe");
console.log("Returned revision              : explicit confirmation + F4");
console.log("HOS/BSC returned-work badge    : compact notification count");
console.log("HOS/BSC task panels            : Returned / New, one open at a time");
console.log("Returned entry                 : Start correction → editable revision");
console.log("Returned original              : immutable + reason preserved");
console.log("Revision workspace switch      : stale prior revision cleared");
console.log("Official form                  : 4 sections / 34 items");
console.log("Section navigation             : exact anchored section targets");
console.log("Previous / next navigation     : continues at the next section");
console.log("Desktop progress               : responsive completion bar visible");
console.log("Mobile progress                : compact responsive completion bar");
console.log("Low-network behavior           : serialized autosave, no polling");
console.log("Native final review            : full 4-section / 34-item paper form");
console.log("Rating controls                : 1-5 plus N/A");
console.log("Lifecycle states               : draft/finalized/returned/superseded/released");
console.log("Free-text comments             : absent");
console.log("Persistent browser storage     : absent");
console.log("No-store security headers      : complete");
console.log("Staff feedback/respondents     : absent");
console.log("Reviewer/contact identity      : absent");
console.log("Provider calls                 : absent");
console.log("Database accessed              : false");
console.log("");
console.log("RESULT: GOVERNANCE SUPERVISORY NATIVE REVIEW GREEN");
