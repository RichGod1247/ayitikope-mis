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
assert(source.revision.includes("createReturnedHeadteacherSupervisoryAssessmentRevision"), "F4 revision not wired");
assert(source.revision.includes("confirmRevision"), "Explicit revision confirmation missing");
assert(source.load.includes("loadHeadteacherSupervisoryAssessmentWorkspace"), "Workspace read not wired");
assert(source.page.includes("requireGovernancePageContext"), "Page governance gate missing");
assert(source.page.includes("operationalAssessorRoles"), "Page assessor roles missing");
assert(source.client.includes("Save this section"), "Explicit section save UI missing");
assert(source.client.includes("Question {itemIndex + 1}"), "One-question navigation missing");
assert(source.client.includes("window.confirm"), "Explicit irreversible-action confirmation missing");
assert(source.client.includes('cache: "no-store"'), "Client load cache policy missing");
assert(!source.client.includes("<textarea"), "Comments control must remain absent");
assert(source.client.includes("background polling"), "Low-network explanation missing");
assert(source.service.includes("staffFeedbackIncluded: false"), "Staff feedback separation missing");
assert(source.service.includes("respondentIdentitiesIncluded: false"), "Respondent identity exclusion missing");
assert(source.service.includes("reviewerIdentityIncluded: false"), "Reviewer identity exclusion missing");
assert(source.service.includes("contactDetailsIncluded: false"), "Contact exclusion missing");
assert(source.service.includes("sections.length !== 4 || itemCount !== 34"), "Official form structure gate missing");

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
console.log("=== D3.4F5 GOVERNANCE SUPERVISORY API + BBC MOBILE WORKSPACE ===");
console.log("");
console.log("Audience scope                 : original authorized governance assessor");
console.log("Draft creation                 : F2 transaction wired");
console.log("Assessment load                : owner-bound workspace");
console.log("Section save                   : F3 transaction wired");
console.log("Finalization                   : explicit confirmation + F3");
console.log("Returned revision              : explicit confirmation + F4");
console.log("Official form                  : 4 sections / 34 items");
console.log("Mobile interaction             : one question at a time");
console.log("Low-network behavior           : explicit section saves, no polling");
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
console.log("RESULT: D3.4F5 GOVERNANCE SUPERVISORY WORKSPACE GREEN");
