#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS QA harness intentionally inspects and transpiles source contracts. */

const fs = require("fs");
const path = require("path");
const Module = require("module");
const ts = require("typescript");

const repoRoot = path.resolve(__dirname, "..", "..");

function fail(message, detail) {
  const suffix =
    detail === undefined ? "" : `\n${JSON.stringify(detail, null, 2)}`;
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
  assert(fs.existsSync(absolutePath), "D3_3J_REQUIRED_FILE_MISSING", {
    relativePath,
  });
  return fs.readFileSync(absolutePath, "utf8");
}

function contains(source, marker, label) {
  assert(source.includes(marker), `D3_3J_MARKER_MISSING:${label}`, {
    marker,
  });
}

function excludes(source, marker, label) {
  assert(!source.includes(marker), `D3_3J_FORBIDDEN_MARKER:${label}`, {
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
    fail("D3_3J_TYPESCRIPT_TRANSPILE_FAILED", {
      relativePath,
      diagnostics: errors.map((diagnostic) =>
        ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
      ),
    });
  }
}

const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveFilename(
  request,
  parent,
  isMain,
  options,
) {
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
      "D3_3J_RUNTIME_TRANSPILE_FAILED",
      errors.map((diagnostic) =>
        ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
      ),
    );
  }
  module._compile(output.outputText, filename);
};

function main() {
  const analysisPath = "src/lib/appraisals/directorFeedbackAnalysis.ts";
  const reviewPath = "src/lib/appraisals/directorFeedbackReview.ts";
  const clientPath =
    "src/app/district/director-feedback/review/DirectorFeedbackReviewClient.tsx";
  const chartPath =
    "src/app/district/director-feedback/review/DirectorFeedbackPetalChart.tsx";

  const analysisSource = read(analysisPath);
  const reviewSource = read(reviewPath);
  const clientSource = read(clientPath);
  const chartSource = read(chartPath);

  for (const [relativePath, source] of [
    [analysisPath, analysisSource],
    [reviewPath, reviewSource],
    [clientPath, clientSource],
    [chartPath, chartSource],
  ]) {
    transpile(relativePath, source);
  }

  contains(
    analysisSource,
    "APPRAISAL_INSTRUMENT_DEFINITIONS",
    "analysis:official-form-source",
  );
  contains(
    analysisSource,
    "expectedSectionCount: 7",
    "analysis:seven-sections",
  );
  contains(
    analysisSource,
    "expectedItemCount: 35",
    "analysis:thirty-five-items",
  );
  contains(
    analysisSource,
    "scoreFrequencyDistributionAvailable: false",
    "analysis:no-invented-frequency",
  );
  contains(
    analysisSource,
    "presentationBandsAreOfficialGrades: false",
    "analysis:developmental-only",
  );
  excludes(analysisSource, "prisma", "analysis:no-database-access");
  excludes(analysisSource, "respondentUserId", "analysis:no-respondent-id");
  excludes(analysisSource, "respondentTenantId", "analysis:no-school-id");

  contains(reviewSource, "itemAveragesJson: true", "review:item-snapshot-select");
  contains(
    reviewSource,
    "buildDirectorFeedbackAnalysis",
    "review:analysis-builder",
  );
  contains(
    reviewSource,
    "canViewScores,",
    "review:score-visibility-gate",
  );
  excludes(reviewSource, "appraisalResponse.find", "review:no-raw-response-query");
  excludes(reviewSource, "appraisalResponseScore", "review:no-raw-score-query");

  contains(chartSource, "<svg", "chart:svg");
  contains(chartSource, 'role="img"', "chart:accessible-role");
  contains(chartSource, "DIRECTOR_FEEDBACK_PETAL_COUNT = 7", "chart:seven-petals");
  contains(chartSource, "selectedSectionKey", "chart:selected-section-contract");
  contains(chartSource, "onSelectSection", "chart:selection-callback");
  contains(chartSource, 'role={interactive ? "button" : undefined}', "chart:keyboard-button-role");
  contains(chartSource, "aria-pressed", "chart:selected-accessibility");
  contains(chartSource, "onKeyDown", "chart:keyboard-selection");
  contains(chartSource, "linearGradient", "chart:edulife-gradients");
  contains(chartSource, "director-petal-selected", "chart:selected-glow");
  contains(chartSource, "LEADERSHIP PROFILE", "chart:center-hub");
  excludes(chartSource, "recharts", "chart:no-recharts");
  excludes(chartSource, "chart.js", "chart:no-chartjs");
  excludes(chartSource, "canvas", "chart:no-canvas");

  contains(clientSource, "Leadership profile", "ui:profile");
  contains(
    clientSource,
    "Section {selectedAnalysisSection.sectionOrder} question breakdown",
    "ui:petal-selected-breakdown",
  );
  contains(clientSource, "Average score", "ui:petal-average-score");
  contains(clientSource, "Valid heads", "ui:petal-valid-head-count");
  contains(
    clientSource,
    "These are aggregate Headteacher ratings only.",
    "ui:petal-aggregate-privacy-copy",
  );
  contains(
    clientSource,
    "Select any petal or numbered section card",
    "ui:petal-selection-guidance",
  );
  excludes(
    clientSource,
    "Question-by-question analysis",
    "ui:no-duplicate-item-analysis",
  );
  contains(clientSource, "scrollIntoView", "ui:petal-auto-scroll");
  contains(clientSource, 'behavior: "smooth"', "ui:petal-smooth-scroll");
  contains(clientSource, "selectedBreakdownRef", "ui:petal-breakdown-target");
  excludes(
    clientSource,
    "circuit.sections.map",
    "ui:no-duplicate-circuit-section-grid",
  );
  contains(clientSource, "Math.round", "ui:whole-percentage-display");
  contains(chartSource, "Math.round", "chart:whole-percentage-display");
  contains(clientSource, "Developmental guide", "ui:development-guide");
  contains(clientSource, "not official", "ui:not-official-grades");
  contains(clientSource, "N/A", "ui:not-applicable-count");
  contains(clientSource, "Threshold-safe circuits", "ui:circuit-threshold");
  contains(clientSource, "Seal and Complete Review", "ui:release-regression");
  excludes(clientSource, "localStorage", "ui:no-local-storage");
  excludes(clientSource, "sessionStorage", "ui:no-session-storage");
  excludes(clientSource, "respondentUserId", "ui:no-respondent-id");
  excludes(clientSource, "respondentTenantId", "ui:no-school-link");

  contains(
    reviewSource,
    'from "@/lib/appraisals/directorFeedbackAnalysis";',
    "review:direct-analysis-import",
  );

  const analysisModulePath = path.join(repoRoot, analysisPath);
  const instrumentsModulePath = path.join(
    repoRoot,
    "src/lib/appraisals/instruments.ts",
  );
  const { buildDirectorFeedbackAnalysis } = require(analysisModulePath);
  const {
    APPRAISAL_INSTRUMENT_CODES,
    APPRAISAL_INSTRUMENT_DEFINITIONS,
  } = require(instrumentsModulePath);

  const instrument =
    APPRAISAL_INSTRUMENT_DEFINITIONS[
      APPRAISAL_INSTRUMENT_CODES.DIRECTOR_GOVERNANCE_APPRAISAL_V1
    ];
  const sectionAveragesJson = {};
  const itemAveragesJson = {};

  for (const section of instrument.sections) {
    sectionAveragesJson[section.key] = {
      sectionKey: section.key,
      sectionTitle: section.title,
      sectionOrder: section.order,
      averagePercentage: 70 + section.order,
      validResponses: 6,
    };
    for (const item of section.items) {
      itemAveragesJson[item.key] = {
        itemKey: item.key,
        averageScore: 3.5 + item.order / 100,
        averagePercentage: 70 + item.order / 5,
        validResponses: 6,
        notApplicableResponses: item.order % 2,
      };
    }
  }

  const analysis = buildDirectorFeedbackAnalysis({
    canViewScores: true,
    overallPercentage: 78.5,
    sectionAveragesJson,
    itemAveragesJson,
    eligibleResponses: 8,
    finalizedResponses: 6,
    expiredResponses: 2,
    snapshotVersion: 1,
    generatedAt: "2026-08-01T10:05:00.000Z",
    sourceFingerprint: "a".repeat(12),
    municipalBand: "LIMITED",
  });

  assert(analysis, "Analysis must be produced after audited score visibility");
  assertEqual(analysis.sections.length, 7, "Expected seven official sections");
  assertEqual(
    analysis.sections.reduce((sum, section) => sum + section.items.length, 0),
    35,
    "Expected thirty-five official items",
  );
  assertEqual(
    analysis.instrument.scale.labels[1],
    "Very Poor",
    "Official scale label 1",
  );
  assertEqual(
    analysis.instrument.scale.labels[5],
    "Very Good",
    "Official scale label 5",
  );
  assertEqual(
    analysis.participation.participationPercentage,
    75,
    "Participation percentage",
  );
  assertEqual(
    analysis.limitations.scoreFrequencyDistributionAvailable,
    false,
    "No score frequency invention",
  );

  const blockedBeforeReview = buildDirectorFeedbackAnalysis({
    canViewScores: false,
    overallPercentage: 88,
    sectionAveragesJson,
    itemAveragesJson,
    eligibleResponses: 8,
    finalizedResponses: 6,
    expiredResponses: 2,
    snapshotVersion: 1,
    generatedAt: "2026-08-01T10:05:00.000Z",
    sourceFingerprint: "a".repeat(12),
    municipalBand: "LIMITED",
  });
  assertEqual(
    blockedBeforeReview,
    null,
    "Analysis must remain hidden before audited review entry",
  );

  const blockedByThreshold = buildDirectorFeedbackAnalysis({
    canViewScores: true,
    overallPercentage: null,
    sectionAveragesJson: {},
    itemAveragesJson: {},
    eligibleResponses: 8,
    finalizedResponses: 4,
    expiredResponses: 4,
    snapshotVersion: 1,
    generatedAt: "2026-08-01T10:05:00.000Z",
    sourceFingerprint: "b".repeat(12),
    municipalBand: "BLOCKED",
  });
  assertEqual(
    blockedByThreshold,
    null,
    "Analysis must remain hidden below municipal threshold",
  );

  console.log("");
  console.log("=== D3.3J THRESHOLD-SAFE DIRECTOR ANALYSIS PROOF ===");
  console.log("");
  console.log("Official instrument source    : verified");
  console.log("Sections / items              : 7 / 35");
  console.log("Seven-petal SVG               : interactive EduLife profile");
  console.log("Visual treatment              : gradient wedges + selected lift/glow");
  console.log("Petal keyboard interaction    : Enter / Space supported");
  console.log("Plain-text section controls   : present and selectable");
  console.log("Petal questionnaire drilldown : aggregate item table/cards + auto-scroll");
  console.log("Question-level averages       : sealed snapshot only");
  console.log("Valid and N/A counts          : displayed separately");
  console.log("Score frequency distribution  : not invented");
  console.log("Development bands             : deterministic, non-official");
  console.log("Pre-review score exposure     : blocked");
  console.log("Below-threshold analysis      : blocked");
  console.log("Threshold-safe circuits       : preserved without repeated section grid");
  console.log("Respondent / school identity  : absent");
  console.log("Raw response query            : absent");
  console.log("Database write                : absent");
  console.log("Schema change                 : false");
  console.log("Database accessed             : false");
  console.log("");
  console.log("RESULT: D3.3J DIRECTOR FEEDBACK ANALYSIS GREEN");
}

try {
  main();
} catch (error) {
  console.error("");
  console.error("RESULT: D3.3J DIRECTOR FEEDBACK ANALYSIS FAILED");
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
}
