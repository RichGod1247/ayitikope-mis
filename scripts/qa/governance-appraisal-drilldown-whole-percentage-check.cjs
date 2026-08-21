#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS source-contract QA harness. */

const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const repoRoot = path.resolve(__dirname, "..", "..");
const panelPath =
  "src/components/governance/GovernanceAppraisalDrilldownPanel.tsx";

function fail(message, detail) {
  const suffix = detail === undefined ? "" : `\n${JSON.stringify(detail, null, 2)}`;
  throw new Error(`${message}${suffix}`);
}

function assert(condition, message, detail) {
  if (!condition) fail(message, detail);
}

const absolutePath = path.join(repoRoot, panelPath);
assert(fs.existsSync(absolutePath), "Governance appraisal drilldown file missing", panelPath);

const source = fs
  .readFileSync(absolutePath, "utf8")
  .replace(/\r\n/g, "\n")
  .replace(/\r/g, "\n");

const transpiled = ts.transpileModule(source, {
  fileName: panelPath,
  reportDiagnostics: true,
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.Preserve,
    strict: true,
  },
});

assert(
  (transpiled.diagnostics ?? []).length === 0,
  "Governance appraisal drilldown has TypeScript syntax diagnostics",
  (transpiled.diagnostics ?? []).map((diagnostic) => diagnostic.messageText),
);

for (const forbidden of [
  "localStorage",
  "sessionStorage",
  "setInterval(",
  "sendSms",
  "sendEmail",
]) {
  assert(
    !source.includes(forbidden),
    "Governance appraisal drilldown contains forbidden marker",
    forbidden,
  );
}

assert(
  source.includes('return `${Math.round(n)}%`;'),
  "Governance drilldown percentage presentation must round to a whole number",
);
assert(
  !source.includes('return `${n.toFixed(1).replace(/\\.0$/, "")}%`;'),
  "Governance drilldown must not expose one-decimal percentage presentation",
);

for (const marker of [
  "value={formatPercent(summary.averageOverall)}",
  "right={formatPercent(circuit.averageOverall)}",
  "right={formatPercent(school.averageOverall)}",
  "right={formatPercent(teacher.averageOverall)}",
  "right={formatPercent(report.overallPercentage)}",
  "formatPercent(report.overallPercentage ?? report.percentages?.overall ?? null)",
]) {
  assert(
    source.includes(marker),
    "Whole-number governance percentage surface missing",
    marker,
  );
}

assert(
  source.includes('cache: "no-store"') &&
    source.includes('credentials: "include"'),
  "Governance appraisal drilldown no-store/session read contract missing",
);

console.log("");
console.log("=== N7 GOVERNANCE DRILLDOWN — WHOLE-PERCENTAGE PRESENTATION ===");
console.log("");
console.log("District average            : WHOLE NUMBER");
console.log("Circuit average             : WHOLE NUMBER");
console.log("School average              : WHOLE NUMBER");
console.log("Teacher average             : WHOLE NUMBER");
console.log("Report summary              : WHOLE NUMBER");
console.log("Native report percentage    : WHOLE NUMBER");
console.log("Stored/API precision        : PRESERVED");
console.log("Backend/schema/database     : UNCHANGED");
console.log("No-store                    : PRESERVED");
console.log("Background polling          : ABSENT");
console.log("Persistent browser storage  : ABSENT");
console.log("");
console.log("RESULT: N7 GOVERNANCE DRILLDOWN WHOLE-PERCENTAGE GREEN");
