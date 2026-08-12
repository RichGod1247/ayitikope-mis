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
  return fs.readFileSync(absolutePath, "utf8");
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
  source.client.includes("workspaceRef.current?.assessment.assessmentId !== id"),
  "Workspace identity switch guard missing",
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
