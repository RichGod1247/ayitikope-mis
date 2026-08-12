#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS QA harness intentionally inspects TypeScript source. */

const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const repoRoot = path.resolve(__dirname, "..", "..");
const relativePath = "src/lib/appraisals/authority.ts";
const absolutePath = path.join(repoRoot, relativePath);

function fail(message, detail) {
  const suffix =
    detail === undefined ? "" : `\n${JSON.stringify(detail, null, 2)}`;
  throw new Error(`${message}${suffix}`);
}
function assert(condition, message, detail) {
  if (!condition) fail(message, detail);
}
function blockBetween(source, start, end) {
  const a = source.indexOf(start);
  const b = source.indexOf(end, a + start.length);
  assert(a >= 0 && b > a, "AUTHORITY_BLOCK_NOT_FOUND", { start, end });
  return source.slice(a, b);
}

assert(fs.existsSync(absolutePath), "AUTHORITY_SOURCE_MISSING");
const source = fs
  .readFileSync(absolutePath, "utf8")
  .replace(/\r\n/g, "\n")
  .replace(/\r/g, "\n");

const transpiled = ts.transpileModule(source, {
  fileName: relativePath,
  reportDiagnostics: true,
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
  },
});
assert(
  !(transpiled.diagnostics ?? []).some(
    (d) => d.category === ts.DiagnosticCategory.Error,
  ),
  "AUTHORITY_TYPESCRIPT_TRANSPILE_FAILED",
);

assert(
  source.includes('"REVIEW_HEADTEACHER_APPRAISAL"'),
  "Headteacher review capability definition must remain published",
);

const bsc = blockBetween(
  source,
  "BASIC_SCHOOL_COORDINATOR: [",
  "HEAD_OF_SUPERVISION: [",
);
assert(bsc.includes('"ASSESS_HEADTEACHER"'), "BSC assess Headteacher must remain");
assert(
  !bsc.includes('"REVIEW_HEADTEACHER_APPRAISAL"'),
  "BSC must not review Headteacher appraisal",
);

const hos = blockBetween(
  source,
  "HEAD_OF_SUPERVISION: [",
  "DISTRICT_DIRECTOR: [",
);
assert(hos.includes('"ASSESS_HEADTEACHER"'), "HOS assess Headteacher missing");
assert(
  hos.includes('"REVIEW_HEADTEACHER_APPRAISAL"'),
  "HOS Headteacher review capability missing",
);

const director = blockBetween(
  source,
  "DISTRICT_DIRECTOR: [",
  "} as const satisfies",
);
assert(
  director.includes('"REVIEW_HEADTEACHER_APPRAISAL"'),
  "Director Headteacher review capability missing",
);

assert(
  source.includes("capabilityIsNecessaryButNotSufficient: true") &&
    source.includes("scopeMustBeCheckedSeparately: true") &&
    source.includes("dashboardAccessDoesNotGrantAppraisalAuthority: true"),
  "Least-authority guardrails must remain intact",
);

console.log("");
console.log("=== N6-F1C6B3B HEADTEACHER REVIEW AUTHORITY NARROWING ===");
console.log("");
console.log("BSC assess Headteacher           : allowed");
console.log("BSC review Headteacher           : removed");
console.log("HOS assess Headteacher           : allowed");
console.log("HOS review Headteacher           : allowed");
console.log("Director review Headteacher      : preserved");
console.log("Dashboard authority              : still insufficient on its own");
console.log("Scope/assignment checks          : still required separately");
console.log("Database accessed                : false");
console.log("");
console.log("RESULT: N6-F1C6B3B HEADTEACHER REVIEW AUTHORITY GREEN");
