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

function assertEqual(actual, expected, message) {
  if (actual !== expected) fail(message, { expected, actual });
}

function read(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  assert(fs.existsSync(absolutePath), "D3_3K_REQUIRED_FILE_MISSING", {
    relativePath,
  });
  return fs.readFileSync(absolutePath, "utf8");
}

function contains(source, marker, label) {
  assert(source.includes(marker), `D3_3K_MARKER_MISSING:${label}`, { marker });
}

function excludes(source, marker, label) {
  assert(!source.includes(marker), `D3_3K_FORBIDDEN_MARKER:${label}`, {
    marker,
  });
}

function transpile(relativePath, source) {
  const output = ts.transpileModule(source, {
    fileName: relativePath,
    reportDiagnostics: true,
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.Preserve,
      esModuleInterop: true,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      strict: true,
    },
  });
  const errors = (output.diagnostics ?? []).filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
  );
  if (errors.length) {
    fail("D3_3K_TYPESCRIPT_TRANSPILE_FAILED", {
      relativePath,
      diagnostics: errors.map((diagnostic) =>
        ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
      ),
    });
  }
}

const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveFilename(request, parent, isMain, options) {
  if (typeof request === "string" && request.startsWith("@/")) {
    request = path.join(repoRoot, "src", request.slice(2));
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

require.extensions[".ts"] = function compileTypeScript(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    fileName: filename,
    reportDiagnostics: true,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
      resolveJsonModule: true,
      skipLibCheck: true,
      strict: true,
    },
  });
  const errors = (output.diagnostics ?? []).filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
  );
  if (errors.length) {
    fail(
      "D3_3K_RUNTIME_TRANSPILE_FAILED",
      errors.map((diagnostic) =>
        ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
      ),
    );
  }
  module._compile(output.outputText, filename);
};

function makeCycle(instrument, instrumentCode, overrides = {}) {
  const sections = instrument.sections.map((section) => ({
    key: section.key,
    title: section.title,
    description: section.description ?? null,
    order: section.order,
    maxScore: section.maxScore,
    items: section.items.map((item, itemIndex) => ({
      id: `item-${section.order}-${itemIndex + 1}`,
      key: item.key,
      label: item.label,
      order: item.order,
      maxScore: item.maxScore,
      isRequired: item.isRequired,
    })),
  }));

  function participant(index, circuitZoneId, circuitName) {
    const scores = sections.flatMap((section) =>
      section.items.map((item) => ({
        instrumentItemId: item.id,
        sectionKey: section.key,
        sectionTitle: section.title,
        sectionOrder: section.order,
        sectionMaxScore: section.maxScore,
        itemKey: item.key,
        itemLabel: item.label,
        itemOrder: item.order,
        itemMaxScore: item.maxScore,
        score: ((index + item.order) % 5) + 1,
        notApplicable: false,
      })),
    );

    const sectionPercentagesJson = Object.fromEntries(
      sections.map((section) => [section.key, 70 + section.order + index]),
    );

    return {
      id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      status: "FINALIZED",
      eligibilitySnapshotJson: {
        circuitZoneId,
        circuitName,
      },
      response: {
        status: "FINALIZED",
        overallPercentage: 75 + index,
        sectionPercentagesJson,
        responseHash: String(index).repeat(64).slice(0, 64),
        scores,
      },
    };
  }

  const visible = Array.from({ length: 5 }, (_, index) =>
    participant(index + 1, "circuit-visible", "Visible Circuit"),
  );
  const hidden = Array.from({ length: 4 }, (_, index) =>
    participant(index + 11, "circuit-hidden", "Hidden Circuit"),
  );

  return {
    id: "00000000-0000-4000-8000-000000000999",
    status: "UNDER_REVIEW",
    targetUserId: "director-user",
    targetRoleSnapshot: "DISTRICT_DIRECTOR",
    reviewStartedAt: new Date("2026-08-01T10:10:00.000Z"),
    instrumentVersionId: "version-1",
    instrumentVersion: {
      version: 1,
      title: instrument.documentTitle,
      directorateName: "Municipal Education Directorate",
      instructions: instrument.instructions ?? null,
      scaleMin: 1,
      scaleMax: 5,
      allowNotApplicable: true,
      allowComments: false,
      instrument: {
        code: instrumentCode,
        isActive: true,
      },
      sections,
    },
    aggregate: {
      version: 1,
      finalizedResponses: 9,
      minimumResponses: 5,
      releaseEligible: true,
      sourceHash: "a".repeat(64),
      metadata: {
        circuitDisclosure: {
          threshold: 5,
          visibleCircuits: [
            {
              circuitZoneId: "circuit-visible",
              circuitName: "Visible Circuit",
              finalizedResponses: 5,
            },
          ],
          hiddenCircuitCount: 1,
        },
      },
    },
    participants: [...visible, ...hidden],
    ...overrides,
  };
}

function main() {
  const servicePath = "src/lib/appraisals/directorFeedbackRespondents.ts";
  const routePath =
    "src/app/api/district/director-feedback/review/respondents/route.ts";
  const componentPath =
    "src/app/district/director-feedback/review/DirectorFeedbackMaskedRespondents.tsx";
  const clientPath =
    "src/app/district/director-feedback/review/DirectorFeedbackReviewClient.tsx";
  const reviewPath = "src/lib/appraisals/directorFeedbackReview.ts";

  const serviceSource = read(servicePath);
  const routeSource = read(routePath);
  const componentSource = read(componentPath);
  const clientSource = read(clientPath);
  const reviewSource = read(reviewPath);

  for (const [relativePath, source] of [
    [servicePath, serviceSource],
    [routePath, routeSource],
    [componentPath, componentSource],
    [clientPath, clientSource],
    [reviewPath, reviewSource],
  ]) {
    transpile(relativePath, source);
  }

  contains(serviceSource, "POST_CLOSURE_HASH_ORDER", "service:mask-order");
  contains(serviceSource, "createHash", "service:cryptographic-mask");
  contains(serviceSource, "numericLabel", "service:numeric-mask-label");
  excludes(serviceSource, "alphaLabel", "service:no-alphabetic-mask-label");
  excludes(serviceSource, "responseProofFingerprint", "service:no-response-proof-output");
  contains(serviceSource, "AppraisalCycleStatus.UNDER_REVIEW", "service:review-state");
  contains(serviceSource, "AppraisalCycleStatus.RELEASED", "service:released-state");
  contains(serviceSource, "releaseEligible", "service:municipal-threshold");
  contains(serviceSource, "visibleCircuits", "service:circuit-threshold");
  contains(serviceSource, "DIRECTOR_FEEDBACK_MASKED_SOURCE_COUNT_MISMATCH", "service:snapshot-count-seal");
  contains(serviceSource, '"VIEW_DIRECTOR_FEEDBACK_RESULTS"', "service:authority");
  contains(serviceSource, "expectedSectionCount: 7", "service:seven-sections");
  contains(serviceSource, "expectedItemCount: 35", "service:thirty-five-items");
  excludes(serviceSource, "respondentUserId", "service:no-respondent-user-id");
  excludes(serviceSource, "respondentTenantId", "service:no-school-link");
  excludes(serviceSource, "finalizedAt", "service:no-submission-time");
  excludes(serviceSource, "email", "service:no-contact-email");
  excludes(serviceSource, "phone", "service:no-contact-phone");

  contains(routeSource, 'allowedRoles: ["DISTRICT_DIRECTOR"]', "api:director-only");
  contains(routeSource, "allowedZoneLevels: [2]", "api:district-scope");
  contains(routeSource, '"Cache-Control": "no-store, max-age=0"', "api:no-store");
  contains(routeSource, "maskedRespondentKey", "api:masked-key");
  excludes(routeSource, "prisma.", "api:no-direct-prisma");
  excludes(routeSource, "respondentUserId", "api:no-identity-output");
  excludes(routeSource, "respondentTenantId", "api:no-school-output");

  contains(componentSource, "View masked responses", "ui:list-entry");
  contains(componentSource, "Complete finalized appraisal form", "ui:full-form");
  contains(componentSource, "Behavioural Competence", "ui:native-form-behaviour-column");
  contains(componentSource, "FINAL SCORE", "ui:native-form-final-score");
  contains(componentSource, "TOTAL SCORE (OUT OF", "ui:native-form-section-total");
  contains(componentSource, "OVERALL PERCENTAGE", "ui:native-form-overall");
  contains(componentSource, "General Comment(s):", "ui:native-form-comment-row");
  contains(componentSource, "submission order", "ui:not-order");
  contains(componentSource, "names or schools", "ui:privacy");
  contains(componentSource, "navigator.onLine", "ui:offline-awareness");
  contains(componentSource, "Math.round", "ui:whole-percentage-display");
  contains(componentSource, "scrollIntoView", "ui:respondent-form-auto-scroll");
  excludes(componentSource, "Response proof", "ui:no-response-proof-display");
  excludes(componentSource, "<details", "ui:no-questionnaire-accordion");
  excludes(componentSource, "localStorage", "ui:no-local-storage");
  excludes(componentSource, "sessionStorage", "ui:no-session-storage");

  contains(clientSource, "DirectorFeedbackMaskedRespondents", "ui:integration");
  contains(reviewSource, "individualFormsAvailable: true", "workspace:forms-policy");
  contains(reviewSource, "individualFormsRequireVisibleCircuit: true", "workspace:circuit-gate");

  const serviceModulePath = path.join(repoRoot, servicePath);
  const instrumentsModulePath = path.join(repoRoot, "src/lib/appraisals/instruments.ts");
  const { buildDirectorFeedbackMaskedRespondentWorkspace } = require(serviceModulePath);
  const { APPRAISAL_INSTRUMENT_CODES, APPRAISAL_INSTRUMENT_DEFINITIONS } = require(instrumentsModulePath);

  const instrument =
    APPRAISAL_INSTRUMENT_DEFINITIONS[
      APPRAISAL_INSTRUMENT_CODES.DIRECTOR_GOVERNANCE_APPRAISAL_V1
    ];
  const instrumentCode =
    APPRAISAL_INSTRUMENT_CODES.DIRECTOR_GOVERNANCE_APPRAISAL_V1;
  const cycle = makeCycle(instrument, instrumentCode);

  const list = buildDirectorFeedbackMaskedRespondentWorkspace({
    cycle,
    circuitZoneId: "circuit-visible",
  });
  assertEqual(list.mode, "LIST", "List mode expected");
  assertEqual(list.respondents.length, 5, "Five threshold-qualified forms");
  assertEqual(list.respondents[0].maskedLabel, "Respondent 1", "First masked label");
  assertEqual(new Set(list.respondents.map((row) => row.maskedRespondentKey)).size, 5, "Masked keys unique");
  assertEqual(list.privacy.respondentNameIncluded, false, "Name absent");
  assertEqual(list.privacy.schoolNameIncluded, false, "School absent");
  assertEqual(list.privacy.submissionTimeIncluded, false, "Time absent");

  const repeated = buildDirectorFeedbackMaskedRespondentWorkspace({
    cycle: { ...cycle, participants: [...cycle.participants].reverse() },
    circuitZoneId: "circuit-visible",
  });
  assertEqual(
    JSON.stringify(repeated.respondents),
    JSON.stringify(list.respondents),
    "Masked order stable and independent of source order",
  );

  const selectedKey = list.respondents[2].maskedRespondentKey;
  const form = buildDirectorFeedbackMaskedRespondentWorkspace({
    cycle,
    circuitZoneId: "circuit-visible",
    maskedRespondentKey: selectedKey,
  });
  assertEqual(form.mode, "FORM", "Form mode expected");
  assertEqual(form.officialForm.sections.length, 7, "Seven sections visible");
  assertEqual(
    form.officialForm.sections.reduce((sum, section) => sum + section.items.length, 0),
    35,
    "Thirty-five official items visible",
  );
  assert(!("participantId" in form.respondent), "Participant id must not be returned");
  assert(!("responseId" in form.respondent), "Response id must not be returned");
  assert(!("finalizedAt" in form.respondent), "Submission time must not be returned");

  let hiddenBlocked = false;
  try {
    buildDirectorFeedbackMaskedRespondentWorkspace({
      cycle,
      circuitZoneId: "circuit-hidden",
    });
  } catch (error) {
    hiddenBlocked = error?.code === "DIRECTOR_FEEDBACK_CIRCUIT_NOT_DISCLOSED";
  }
  assert(hiddenBlocked, "Below-threshold circuit must be hidden");

  let preReviewBlocked = false;
  try {
    buildDirectorFeedbackMaskedRespondentWorkspace({
      cycle: makeCycle(instrument, instrumentCode, {
        status: "CLOSED",
        reviewStartedAt: null,
      }),
      circuitZoneId: "circuit-visible",
    });
  } catch (error) {
    preReviewBlocked = error?.code === "DIRECTOR_FEEDBACK_MASKED_REVIEW_NOT_AVAILABLE";
  }
  assert(preReviewBlocked, "Forms must remain hidden before audited review entry");

  let countMismatchBlocked = false;
  try {
    const mismatch = makeCycle(instrument, instrumentCode);
    mismatch.aggregate.metadata.circuitDisclosure.visibleCircuits[0].finalizedResponses = 6;
    buildDirectorFeedbackMaskedRespondentWorkspace({
      cycle: mismatch,
      circuitZoneId: "circuit-visible",
    });
  } catch (error) {
    countMismatchBlocked = error?.code === "DIRECTOR_FEEDBACK_MASKED_SOURCE_COUNT_MISMATCH";
  }
  assert(countMismatchBlocked, "Snapshot/source count mismatch must block safely");

  console.log("");
  console.log("=== D3.3K MASKED RESPONDENT DRILL-DOWN PROOF ===");
  console.log("");
  console.log("Cycle states                  : UNDER_REVIEW / RELEASED only");
  console.log("Municipal threshold           : enforced");
  console.log("Circuit threshold             : enforced at 5");
  console.log("Masked labels                 : Respondent 1..N in post-closure hash order");
  console.log("Submission-order linkage      : absent");
  console.log("Official form                 : native Director table, 7 sections / 35 items");
  console.log("Respondent name               : absent");
  console.log("School / tenant identity      : absent");
  console.log("Contact details               : absent");
  console.log("Exact submission time         : absent");
  console.log("Participant / response ids    : absent from output");
  console.log("Response proof fingerprint    : absent from Director output");
  console.log("Displayed percentages         : whole numbers");
  console.log("Below-threshold circuits      : hidden");
  console.log("Snapshot/source mismatch      : blocked");
  console.log("Browser persistence           : absent");
  console.log("Schema change                 : false");
  console.log("Database accessed             : false");
  console.log("");
  console.log("RESULT: D3.3K MASKED RESPONDENT DRILL-DOWN GREEN");
}

try {
  main();
} catch (error) {
  console.error("");
  console.error("RESULT: D3.3K MASKED RESPONDENT DRILL-DOWN FAILED");
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
}
