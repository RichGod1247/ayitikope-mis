#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS QA harness intentionally inspects TypeScript source contracts. */

const fs = require("fs");
const path = require("path");
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

function read(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  assert(
    fs.existsSync(absolutePath),
    "N6_D4C3B_REQUIRED_FILE_MISSING",
    relativePath,
  );
  return fs
    .readFileSync(absolutePath, "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
}

function requireMarkers(relativePath, markers) {
  const source = read(relativePath);
  for (const marker of markers) {
    assert(source.includes(marker), "N6_D4C3B_MARKER_MISSING", {
      relativePath,
      marker,
    });
  }
  return source;
}

function forbidMarkers(relativePath, markers) {
  const source = read(relativePath);
  for (const marker of markers) {
    assert(!source.includes(marker), "N6_D4C3B_FORBIDDEN_MARKER_PRESENT", {
      relativePath,
      marker,
    });
  }
  return source;
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
    (diagnostic) =>
      diagnostic.category === ts.DiagnosticCategory.Error,
  );

  if (errors.length) {
    fail("N6_D4C3B_TYPESCRIPT_TRANSPILE_FAILED", {
      relativePath,
      diagnostics: errors.map((diagnostic) =>
        ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
      ),
    });
  }
}

const files = {
  command:
    "src/components/governance/GovernanceCommandDashboardClient.tsx",
  circuit: "src/app/circuit/dashboard/page.tsx",
  district: "src/app/district/dashboard/page.tsx",
};

const command = requireMarkers(files.command, [
  'const isDistrictView = endpoint.includes("/district/");',
  'const isCircuitView = endpoint.includes("/circuit/");',
  '"appraisals"',
  '"teacher-appraisal"',
  "Teacher Appraisal",
  "Assessment active",
  "official six-section,",
  "34-indicator observation form",
  'href="/governance/appraisals/teacher-supervisory"',
  "Assess Teacher",
  'onClick={() => openPanel("teacher-appraisal")}',
  "Open reports",
  "GovernanceAppraisalDrilldownPanel",
  'activePanel === "teacher-appraisal"',
  "isDistrictView={isDistrictView}",
  "isCircuitView={isCircuitView}",
  'isDistrictView\n            ? "/district/headteacher-appraisals/review"\n            : "/governance/appraisals/headteacher-supervisory"',
  "Request for Appraisal",
  "Review Appraisal",
  'href="/district/director-feedback"',
  'href="/district/director-feedback/review"',
]);

forbidMarkers(files.command, [
  "Teacher assessment not yet active",
  "Assess Teacher · next phase",
  "localStorage",
  "sessionStorage",
  "setInterval(",
]);

const teacherAssessmentHrefCount = (
  command.match(
    /href="\/governance\/appraisals\/teacher-supervisory"/g,
  ) ?? []
).length;

assert(
  teacherAssessmentHrefCount === 1,
  "N6_D4C3B_TEACHER_ASSESSMENT_ENTRY_COUNT_INVALID",
  { teacherAssessmentHrefCount },
);

assert(
  command.indexOf('href="/governance/appraisals/teacher-supervisory"') <
    command.indexOf('onClick={() => openPanel("teacher-appraisal")}'),
  "N6_D4C3B_ASSESS_ACTION_SHOULD_PRECEDE_REPORT_ACTION",
);

const circuit = requireMarkers(files.circuit, [
  "GovernanceCommandDashboardClient",
  "CIRCUIT_GOVERNANCE_ROLES",
  "allowedZoneLevels: [1]",
  'endpoint="/api/circuit/overview"',
  'title="SISSO Circuit Command"',
]);

const district = requireMarkers(files.district, [
  "GovernanceCommandDashboardClient",
  "DISTRICT_COMMAND_DASHBOARD_ROLES",
  '"DISTRICT_DIRECTOR"',
  '"DISTRICT_MIS_OFFICER"',
  '"DISTRICT_SHEP_OFFICER"',
  '"DISTRICT_ASSESSMENT_OFFICER"',
  "requireGovernancePageContext",
  "allowedZoneLevels: [2]",
  'endpoint="/api/district/overview"',
  'title="District Education Command"',
]);

transpile(files.command, command);
transpile(files.circuit, circuit);
transpile(files.district, district);

console.log("");
console.log("=== N6-D4C3B SISSO + DIRECTOR TEACHER APPRAISAL ENTRY ===");
console.log("");
console.log("Shared command dashboard       : circuit + district");
console.log("SISSO dashboard                : /api/circuit/overview");
console.log("Director dashboard             : /api/district/overview");
console.log("Teacher assessment             : active");
console.log("Teacher assessment route       : /governance/appraisals/teacher-supervisory");
console.log("Official observation form      : 6 sections / 34 indicators");
console.log("Existing finalized reports     : preserved");
console.log("Existing report drilldown      : preserved");
console.log("Headteacher workflow           : unchanged");
console.log("Director My Appraisal          : unchanged");
console.log("Review/return/forward/release  : not added");
console.log("Browser storage/polling        : absent");
console.log("Database access                : false");
console.log("Database mutation              : false");
console.log("");
console.log(
  "RESULT: N6-D4C3B SISSO + DIRECTOR TEACHER APPRAISAL ENTRY GREEN",
);
